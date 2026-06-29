/**
 * Store-level tests for the Ship-2/3/4 "editing & layout / rooms" MCP tools' mutation
 * paths (moveDevice, addRoom, placeDeviceInRoom, connection removal) plus a
 * handler-level test for the Ship-5 add_note tool — which has NO new store action, so
 * its logic (trim validation, position validation, the id-snapshot, and the two-step
 * addNote + updateNoteHtml flow) lives entirely in the bridge handler and is exercised
 * here directly via the exported `handlers` map.
 *
 * The store reads editor preferences from localStorage at import time, so we install
 * a minimal in-memory localStorage and import the store (and the bridge handlers,
 * which read the same store singleton) dynamically afterwards. Pure decision logic
 * (validatePosition / planConnectionRemoval / noteTextToHtml) is covered separately in
 * mcpValidation.test.ts.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type {
  ConnectionEdge,
  DeviceData,
  DeviceTemplate,
  InstalledSlot,
  NoteData,
  RackAccessory,
  RackData,
  RackDevicePlacement,
  RackElevationPage,
  SchematicNode,
  StubLabelData,
} from "../types";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

let useSchematicStore: typeof import("../store")["useSchematicStore"];
let handlers: typeof import("../mcpBridge")["handlers"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
  ({ handlers } = await import("../mcpBridge"));
});

function device(id: string, x: number, y: number): SchematicNode {
  return {
    id,
    type: "device",
    position: { x, y },
    data: { label: id, deviceType: "test", ports: [] } as DeviceData,
  } as SchematicNode;
}

function edge(id: string, source: string, target: string): ConnectionEdge {
  return {
    id,
    source,
    target,
    sourceHandle: `${source}-out`,
    targetHandle: `${target}-in`,
    data: { signalType: "hdmi" },
  } as ConnectionEdge;
}

function stubLabel(id: string, placed: boolean, userMoved = false): SchematicNode {
  return {
    id,
    type: "stub-label",
    position: { x: 0, y: 0 },
    data: {
      signalType: "hdmi",
      linkedConnectionId: "cable-1",
      side: "source",
      placed,
      userMoved,
    } as StubLabelData,
  } as SchematicNode;
}

/** A stub-leg edge linking a stub-label node to a device (one end is the stub). */
function stubLeg(id: string, stubId: string, deviceId: string): ConnectionEdge {
  return { id, source: stubId, target: deviceId, data: { signalType: "hdmi" } } as ConnectionEdge;
}

beforeEach(() => {
  // Seed directly (setState does not push undo), so the next action's snapshot is this state.
  useSchematicStore.setState({
    nodes: [device("device-1", 0, 0), device("device-2", 300, 0)],
    edges: [edge("edge-1", "device-1", "device-2")],
  });
});

function posOf(id: string) {
  return useSchematicStore.getState().nodes.find((n) => n.id === id)!.position;
}

describe("moveDevice", () => {
  it("repositions a device and the move is undoable", () => {
    useSchematicStore.getState().moveDevice("device-1", { x: 120, y: 80 });
    expect(posOf("device-1")).toEqual({ x: 120, y: 80 });
    // device-2 untouched
    expect(posOf("device-2")).toEqual({ x: 300, y: 0 });

    useSchematicStore.getState().undo();
    expect(posOf("device-1")).toEqual({ x: 0, y: 0 });
  });

  it("is a no-op for an unknown id (no throw, nothing changed)", () => {
    useSchematicStore.getState().moveDevice("device-404", { x: 9, y: 9 });
    expect(useSchematicStore.getState().nodes.map((n) => n.id)).toEqual(["device-1", "device-2"]);
    expect(posOf("device-1")).toEqual({ x: 0, y: 0 });
  });

  it("re-anchors auto-placed stub labels connected to the moved device (#182)", () => {
    useSchematicStore.setState({
      nodes: [device("device-1", 0, 0), stubLabel("stub-follow", true), stubLabel("stub-user", true, true)],
      edges: [stubLeg("leg-1", "stub-follow", "device-1"), stubLeg("leg-2", "stub-user", "device-1")],
    });
    useSchematicStore.getState().moveDevice("device-1", { x: 200, y: 120 });
    const nodes = useSchematicStore.getState().nodes;
    const follow = nodes.find((n) => n.id === "stub-follow")!.data as StubLabelData;
    const user = nodes.find((n) => n.id === "stub-user")!.data as StubLabelData;
    expect(follow.placed).toBe(false); // cleared so it re-follows the moved port
    expect(user.placed).toBe(true); // user-positioned stub left alone
  });
});

function roomNode(id: string, x: number, y: number, w = 400, h = 300): SchematicNode {
  return {
    id,
    type: "room",
    position: { x, y },
    data: { label: id },
    style: { width: w, height: h },
  } as SchematicNode;
}

describe("addRoom (create_room path)", () => {
  it("creates a room with a custom size", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    useSchematicStore.getState().addRoom("Conference Room", { x: 500, y: 0 }, { width: 600, height: 400 });
    const room = useSchematicStore.getState().nodes.find((n) => n.type === "room")!;
    expect(room).toBeTruthy();
    expect((room.data as { label: string }).label).toBe("Conference Room");
    expect(room.style).toMatchObject({ width: 600, height: 400 });
  });

  it("defaults to 400x300 when no size is given", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    useSchematicStore.getState().addRoom("R", { x: 500, y: 0 });
    const room = useSchematicStore.getState().nodes.find((n) => n.type === "room")!;
    expect(room.style).toMatchObject({ width: 400, height: 300 });
  });

  it("absorbs a device inside its bounds and the creation is undoable", () => {
    useSchematicStore.setState({ nodes: [device("device-1", 0, 0)], edges: [] });
    useSchematicStore.getState().addRoom("R", { x: -10, y: -10 }, { width: 400, height: 300 });
    const room = useSchematicStore.getState().nodes.find((n) => n.type === "room")!;
    expect(useSchematicStore.getState().nodes.find((n) => n.id === "device-1")!.parentId).toBe(room.id);

    useSchematicStore.getState().undo();
    const after = useSchematicStore.getState().nodes;
    expect(after.some((n) => n.type === "room")).toBe(false);
    expect(after.find((n) => n.id === "device-1")!.parentId).toBeUndefined();
  });
});

describe("placeDeviceInRoom (place_device_in_room path)", () => {
  it("places a device in the room with a room-relative position (undoable)", () => {
    useSchematicStore.setState({ nodes: [roomNode("room-1", 100, 100), device("device-1", 0, 0)], edges: [] });
    const placed = useSchematicStore.getState().placeDeviceInRoom("device-1", "room-1", { x: 20, y: 30 });
    expect(placed).toBe(true);
    const dev = useSchematicStore.getState().nodes.find((n) => n.id === "device-1")!;
    expect(dev.parentId).toBe("room-1");
    expect(dev.position).toEqual({ x: 20, y: 30 }); // relative to the room's top-left

    useSchematicStore.getState().undo();
    const back = useSchematicStore.getState().nodes.find((n) => n.id === "device-1")!;
    expect(back.parentId).toBeUndefined();
    expect(back.position).toEqual({ x: 0, y: 0 });
  });

  it("changes nothing and returns false when the position would fall outside the room", () => {
    useSchematicStore.setState({ nodes: [roomNode("room-1", 100, 100, 400, 300), device("device-1", 0, 0)], edges: [] });
    const snapshot = JSON.stringify(useSchematicStore.getState().nodes);
    const placed = useSchematicStore.getState().placeDeviceInRoom("device-1", "room-1", { x: 9999, y: 9999 });
    expect(placed).toBe(false);
    // Nothing mutated at all — device stays top-level at its original position.
    expect(JSON.stringify(useSchematicStore.getState().nodes)).toBe(snapshot);
  });

  it("returns false (no false success) when the device is ALREADY in the room but the new position is invalid", () => {
    // device-1 is already a child of room-1; a reject must not look like a success just
    // because parentId is still room-1.
    useSchematicStore.setState({
      nodes: [roomNode("room-1", 100, 100, 400, 300), { ...device("device-1", 10, 10), parentId: "room-1" } as SchematicNode],
      edges: [],
    });
    const snapshot = JSON.stringify(useSchematicStore.getState().nodes);
    const placed = useSchematicStore.getState().placeDeviceInRoom("device-1", "room-1", { x: 9999, y: 9999 });
    expect(placed).toBe(false);
    expect(JSON.stringify(useSchematicStore.getState().nodes)).toBe(snapshot);
  });

  it("returns true with no mutation and no empty undo step when already at that exact spot", () => {
    useSchematicStore.setState({
      nodes: [roomNode("room-1", 100, 100, 400, 300), { ...device("device-1", 20, 30), parentId: "room-1" } as SchematicNode],
      edges: [],
    });
    const undoBefore = useSchematicStore.getState().undoSize;
    const snapshot = JSON.stringify(useSchematicStore.getState().nodes);
    const placed = useSchematicStore.getState().placeDeviceInRoom("device-1", "room-1", { x: 20, y: 30 });
    expect(placed).toBe(true);
    expect(JSON.stringify(useSchematicStore.getState().nodes)).toBe(snapshot); // unchanged
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore); // no empty undo step pushed
  });

  it("returns false and is a no-op when the target id is not a room", () => {
    useSchematicStore.setState({ nodes: [device("device-1", 0, 0), device("device-2", 300, 0)], edges: [] });
    const snapshot = JSON.stringify(useSchematicStore.getState().nodes);
    const placed = useSchematicStore.getState().placeDeviceInRoom("device-1", "device-2", { x: 10, y: 10 });
    expect(placed).toBe(false);
    expect(JSON.stringify(useSchematicStore.getState().nodes)).toBe(snapshot);
  });

  it("re-anchors connected auto-placed stub labels when placing", () => {
    useSchematicStore.setState({
      nodes: [roomNode("room-1", 100, 100), device("device-1", 0, 0), stubLabel("stub-follow", true)],
      edges: [stubLeg("leg-1", "stub-follow", "device-1")],
    });
    useSchematicStore.getState().placeDeviceInRoom("device-1", "room-1", { x: 20, y: 30 });
    const follow = useSchematicStore.getState().nodes.find((n) => n.id === "stub-follow")!.data as StubLabelData;
    expect(follow.placed).toBe(false);
  });
});

describe("add_note handler (add_note tool)", () => {
  function noteHtml(noteId: string) {
    const n = useSchematicStore.getState().nodes.find((x) => x.id === noteId)!;
    return (n.data as NoteData).html;
  }

  it("creates a note with escaped HTML at the given position and returns its id", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    const res = handlers.add_note({ text: "Head end\n<rack>", x: 40, y: 60 }) as {
      noteId: string;
      text: string;
      position: { x: number; y: number };
    };
    expect(res.position).toEqual({ x: 40, y: 60 });
    const note = useSchematicStore.getState().nodes.find((n) => n.type === "note")!;
    expect(note.id).toBe(res.noteId);
    expect(note.position).toEqual({ x: 40, y: 60 });
    // Text is escaped (never raw markup) and newlines become <br>.
    expect(noteHtml(res.noteId)).toBe("Head end<br>&lt;rack&gt;");
  });

  it("captures the new note's id even when notes already exist (snapshot is correct)", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    const first = handlers.add_note({ text: "first", x: 0, y: 0 }) as { noteId: string };
    const second = handlers.add_note({ text: "second", x: 10, y: 10 }) as { noteId: string };
    expect(second.noteId).not.toBe(first.noteId);
    expect(noteHtml(second.noteId)).toBe("second");
    expect(noteHtml(first.noteId)).toBe("first");
  });

  it("is a single undo step (addNote pushes undo; updateNoteHtml does not)", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    handlers.add_note({ text: "annotation", x: 5, y: 5 });
    expect(useSchematicStore.getState().nodes.some((n) => n.type === "note")).toBe(true);
    useSchematicStore.getState().undo();
    expect(useSchematicStore.getState().nodes.some((n) => n.type === "note")).toBe(false);
  });

  it("rejects empty or whitespace-only text without creating a note", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    expect(() => handlers.add_note({ text: "   ", x: 0, y: 0 })).toThrow(/text is required/);
    expect(() => handlers.add_note({ text: "", x: 0, y: 0 })).toThrow(/text is required/);
    expect(() => handlers.add_note({ x: 0, y: 0 } as Record<string, unknown>)).toThrow(/text is required/);
    expect(useSchematicStore.getState().nodes.some((n) => n.type === "note")).toBe(false);
  });

  it("rejects a non-finite position without creating a note", () => {
    useSchematicStore.setState({ nodes: [], edges: [] });
    expect(() => handlers.add_note({ text: "ok", x: NaN, y: 0 })).toThrow();
    expect(() => handlers.add_note({ text: "ok", x: 0 } as Record<string, unknown>)).toThrow();
    expect(useSchematicStore.getState().nodes.some((n) => n.type === "note")).toBe(false);
  });
});

describe("slot tools (list_slot_cards / install_card / remove_card)", () => {
  // A chassis device carrying one empty slot of family "fam-a".
  function chassis(id: string, slots: InstalledSlot[]): SchematicNode {
    return {
      id,
      type: "device",
      position: { x: 0, y: 0 },
      data: { label: id, deviceType: "chassis", ports: [], slots } as DeviceData,
    } as SchematicNode;
  }
  function emptySlot(slotId: string, slotFamily: string): InstalledSlot {
    return { slotId, label: slotId, slotFamily, portIds: [] };
  }
  // A card template (in customTemplates so getTemplateById resolves it without network).
  function cardTpl(id: string, slotFamily: string, opts: { ports?: number; slots?: DeviceTemplate["slots"] } = {}): DeviceTemplate {
    return {
      id,
      label: id,
      deviceType: id,
      slotFamily,
      ports: Array.from({ length: opts.ports ?? 1 }, (_, i) => ({
        id: `p${i}`,
        label: `P${i}`,
        direction: "input",
        signalType: "hdmi",
      })),
      ...(opts.slots ? { slots: opts.slots } : {}),
    } as DeviceTemplate;
  }

  function slotsOf(deviceId: string) {
    return ((useSchematicStore.getState().nodes.find((n) => n.id === deviceId)!.data as DeviceData).slots ?? []);
  }

  it("get_device exposes slots and get_schematic exposes slotCount", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [],
    });
    const dev = handlers.get_device({ nodeId: "chassis-1" }) as { slots: { slotId: string; filled: boolean; slotFamily?: string }[] };
    expect(dev.slots).toHaveLength(1);
    expect(dev.slots[0]).toMatchObject({ slotId: "slot-1", filled: false, slotFamily: "fam-a" });
    const schem = handlers.get_schematic({}) as { devices: { nodeId: string; slotCount: number }[] };
    expect(schem.devices.find((d) => d.nodeId === "chassis-1")!.slotCount).toBe(1);
  });

  it("list_slot_cards returns only id-backed cards whose family fits the slot", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a"), cardTpl("card-b", "fam-b"), { ...cardTpl("noid", "fam-a"), id: undefined } as DeviceTemplate],
    });
    const res = handlers.list_slot_cards({ deviceId: "chassis-1", slotId: "slot-1" }) as {
      slotFamily?: string;
      cards: { templateId: string }[];
    };
    expect(res.slotFamily).toBe("fam-a");
    expect(res.cards.map((c) => c.templateId)).toEqual(["card-a"]); // card-b wrong family, noid filtered out
  });

  it("install_card fills the slot, adds the card's ports, and is a single undo step", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a", { ports: 2 })],
    });
    const undoBefore = useSchematicStore.getState().undoSize;
    const res = handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-a" }) as {
      cardTemplateId: string;
      portIds: string[];
    };
    expect(res.cardTemplateId).toBe("card-a");
    expect(res.portIds).toHaveLength(2);
    const slot = slotsOf("chassis-1").find((s) => s.slotId === "slot-1")!;
    expect(slot.cardTemplateId).toBe("card-a");
    // the card's ports are now on the device
    expect((useSchematicStore.getState().nodes[0].data as DeviceData).ports).toHaveLength(2);
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore + 1);

    useSchematicStore.getState().undo();
    expect(slotsOf("chassis-1").find((s) => s.slotId === "slot-1")!.cardTemplateId).toBeUndefined();
  });

  it("install_card rejects a card whose family does not fit (no change, no spurious undo)", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-b", "fam-b")],
    });
    const undoBefore = useSchematicStore.getState().undoSize;
    expect(() => handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-b" })).toThrow(/does not fit/);
    expect(slotsOf("chassis-1")[0].cardTemplateId).toBeUndefined();
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore);
  });

  it("install_card refuses to overwrite a filled slot", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a"), cardTpl("card-a2", "fam-a")],
    });
    handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-a" });
    expect(() => handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-a2" })).toThrow(/already holds a card/);
  });

  it("install_card rejects a missing slot or unknown card without a spurious undo", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a")],
    });
    const undoBefore = useSchematicStore.getState().undoSize;
    expect(() => handlers.install_card({ deviceId: "chassis-1", slotId: "nope", cardTemplateId: "card-a" })).toThrow(/No slot found/);
    expect(() => handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "ghost" })).toThrow(/No card template/);
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore);
  });

  it("remove_card empties a filled slot and rejects an already-empty one (no spurious undo)", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a")],
    });
    handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-a" });
    const res = handlers.remove_card({ deviceId: "chassis-1", slotId: "slot-1" }) as { emptied: boolean };
    expect(res.emptied).toBe(true);
    expect(slotsOf("chassis-1").find((s) => s.slotId === "slot-1")!.cardTemplateId).toBeUndefined();

    const undoBefore = useSchematicStore.getState().undoSize;
    expect(() => handlers.remove_card({ deviceId: "chassis-1", slotId: "slot-1" })).toThrow(/already empty/);
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore);
  });

  it("supports installing a card into a nested sub-slot (slotFamily denormalized)", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      // card-parent fits slot-1 and itself defines a sub-slot of family fam-b.
      customTemplates: [
        cardTpl("card-parent", "fam-a", { slots: [{ id: "sub", label: "Sub", slotFamily: "fam-b" }] }),
        cardTpl("card-sub", "fam-b"),
      ],
    });
    handlers.install_card({ deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-parent" });
    // installing the parent created a nested empty slot "slot-1/sub"
    const nested = slotsOf("chassis-1").find((s) => s.parentSlotId === "slot-1");
    expect(nested).toBeTruthy();
    expect(nested!.slotFamily).toBe("fam-b");
    // and a card can be installed into it
    const res = handlers.install_card({ deviceId: "chassis-1", slotId: nested!.slotId, cardTemplateId: "card-sub" }) as { cardTemplateId: string };
    expect(res.cardTemplateId).toBe("card-sub");
    expect(slotsOf("chassis-1").find((s) => s.slotId === nested!.slotId)!.cardTemplateId).toBe("card-sub");
  });

  it("installing into a slot does not disturb a sibling whose id shares its prefix (segment-safe)", () => {
    // "p1" and "p10" are distinct top-level slots; p10 holds a card with a nested
    // sub-slot "p10/sub". A raw startsWith("p1") would wrongly treat p10/sub as a
    // descendant of p1 and drop its card/ports when p1 is operated on.
    useSchematicStore.setState({
      nodes: [
        {
          id: "chassis-1",
          type: "device",
          position: { x: 0, y: 0 },
          data: {
            label: "chassis-1",
            deviceType: "chassis",
            ports: [{ id: "port-y", label: "Y", direction: "input", signalType: "hdmi" }],
            slots: [
              { slotId: "p1", label: "P1", slotFamily: "fam-a", portIds: [] },
              { slotId: "p10", label: "P10", slotFamily: "fam-a", cardTemplateId: "card-x", cardLabel: "X", portIds: [] },
              { slotId: "p10/sub", label: "Sub", slotFamily: "fam-b", parentSlotId: "p10", cardTemplateId: "card-y", cardLabel: "Y", portIds: ["port-y"] },
            ] as InstalledSlot[],
          } as DeviceData,
        } as SchematicNode,
      ],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a")],
    });
    handlers.install_card({ deviceId: "chassis-1", slotId: "p1", cardTemplateId: "card-a" });
    // p10's nested card and its port must be untouched.
    const sub = slotsOf("chassis-1").find((s) => s.slotId === "p10/sub")!;
    expect(sub.cardTemplateId).toBe("card-y");
    expect((useSchematicStore.getState().nodes[0].data as DeviceData).ports.some((p) => p.id === "port-y")).toBe(true);
  });

  it("removeSlot is segment-safe too: removing p1 leaves sibling p10's nested slot intact", () => {
    useSchematicStore.setState({
      nodes: [
        {
          id: "chassis-1",
          type: "device",
          position: { x: 0, y: 0 },
          data: {
            label: "chassis-1",
            deviceType: "chassis",
            ports: [{ id: "port-y", label: "Y", direction: "input", signalType: "hdmi" }],
            slots: [
              { slotId: "p1", label: "P1", slotFamily: "fam-a", portIds: [] },
              { slotId: "p10", label: "P10", slotFamily: "fam-a", cardTemplateId: "card-x", cardLabel: "X", portIds: [] },
              { slotId: "p10/sub", label: "Sub", slotFamily: "fam-b", parentSlotId: "p10", cardTemplateId: "card-y", cardLabel: "Y", portIds: ["port-y"] },
            ] as InstalledSlot[],
          } as DeviceData,
        } as SchematicNode,
      ],
      edges: [],
    });
    useSchematicStore.getState().removeSlot("chassis-1", "p1");
    const slots = slotsOf("chassis-1");
    expect(slots.some((s) => s.slotId === "p1")).toBe(false); // p1 gone
    expect(slots.find((s) => s.slotId === "p10/sub")!.cardTemplateId).toBe("card-y"); // sibling's nested card intact
    expect((useSchematicStore.getState().nodes[0].data as DeviceData).ports.some((p) => p.id === "port-y")).toBe(true);
  });
});

describe("connection removal (delete_connection path)", () => {
  it("removes a single connection by id (routes through removeSelected)", () => {
    useSchematicStore.getState().deleteConnection("edge-1");
    expect(useSchematicStore.getState().edges).toEqual([]);
  });

  it("is a no-op for an unknown connection id", () => {
    useSchematicStore.getState().deleteConnection("edge-404");
    expect(useSchematicStore.getState().edges.map((e) => e.id)).toEqual(["edge-1"]);
  });

  it("connection removal is undoable", () => {
    useSchematicStore.getState().deleteConnection("edge-1");
    expect(useSchematicStore.getState().edges).toEqual([]);
    useSchematicStore.getState().undo();
    expect(useSchematicStore.getState().edges.map((e) => e.id)).toEqual(["edge-1"]);
  });
});

describe("rack tools (list_racks / create_rack / place_device_in_rack / remove_device_from_rack)", () => {
  // A rack-mountable device. Width/height drive inferRackForm: ~480mm wide + whole-U
  // height -> "full"; ~220mm -> "half"; <200mm -> "shelf-only"; >~452mm -> "oversize".
  function rackDevice(id: string, widthMm: number, heightMm: number): SchematicNode {
    return {
      id,
      type: "device",
      position: { x: 0, y: 0 },
      data: { label: id, deviceType: "test", ports: [], widthMm, heightMm } as DeviceData,
    } as SchematicNode;
  }
  function rack(id: string, opts: Partial<RackData> = {}): RackData {
    return { id, label: id, rackType: "floor-19", heightU: 42, depthMm: 600, widthClass: "19in", position: { x: 0, y: 0 }, ...opts };
  }
  function rackPage(id: string, racks: RackData[] = [], placements: RackDevicePlacement[] = [], accessories: RackAccessory[] = []): RackElevationPage {
    return { id, label: id, type: "rack-elevation", racks, placements, accessories };
  }
  function pages(): RackElevationPage[] {
    return useSchematicStore.getState().pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");
  }
  const FULL_1U = { widthMm: 480, heightMm: 44.45 };
  const HALF_1U = { widthMm: 220, heightMm: 44.45 };

  it("list_racks reports pages, racks and placements with resolved device labels", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")], [
        { id: "pl-1", rackId: "rack-1", deviceNodeId: "device-1", uPosition: 3, face: "front" },
      ])],
    });
    const res = handlers.list_racks({}) as {
      pageCount: number;
      pages: { pageId: string; racks: { rackId: string; heightU: number; placements: { placementId: string; deviceLabel: string | null; uPosition: number; heightU: number | null }[] }[] }[];
    };
    expect(res.pageCount).toBe(1);
    expect(res.pages[0].pageId).toBe("rk-1");
    expect(res.pages[0].racks[0].rackId).toBe("rack-1");
    const pl = res.pages[0].racks[0].placements[0];
    expect(pl).toMatchObject({ placementId: "pl-1", deviceLabel: "device-1", uPosition: 3, heightU: 1 });
  });

  it("create_rack with no pageId creates a rack page and a rack with defaults", () => {
    useSchematicStore.setState({ nodes: [], edges: [], pages: [] });
    const res = handlers.create_rack({ label: "Head End" }) as { pageId: string; rackId: string; rackType: string; heightU: number; depthMm: number; createdPage: boolean };
    expect(res.createdPage).toBe(true);
    expect(res).toMatchObject({ rackType: "floor-19", heightU: 42, depthMm: 600 });
    const ps = pages();
    expect(ps).toHaveLength(1);
    expect(ps[0].id).toBe(res.pageId);
    expect(ps[0].racks[0].id).toBe(res.rackId);
    expect(ps[0].racks[0].label).toBe("Head End");
  });

  it("create_rack with an existing pageId adds the rack at a page-local x offset", () => {
    useSchematicStore.setState({ nodes: [], edges: [], pages: [rackPage("rk-1", [rack("rack-1", { position: { x: 0, y: 0 } })])] });
    const res = handlers.create_rack({ pageId: "rk-1", label: "Second" }) as { pageId: string; rackId: string; createdPage: boolean };
    expect(res.createdPage).toBe(false);
    expect(res.pageId).toBe("rk-1");
    const page = pages()[0];
    expect(page.racks).toHaveLength(2);
    expect(page.racks[1].position.x).toBe(400); // second rack on the page
  });

  it("create_rack rejects an unknown pageId and an invalid rackType", () => {
    useSchematicStore.setState({ nodes: [], edges: [], pages: [] });
    expect(() => handlers.create_rack({ pageId: "nope" })).toThrow(/No rack-elevation page/);
    expect(() => handlers.create_rack({ rackType: "server-rack" })).toThrow(/rackType must be one of/);
  });

  it("place_device_in_rack mounts a full-width device and records the placement", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    const res = handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 5 }) as { placementId: string; form: string; heightU: number; face: string };
    expect(res).toMatchObject({ form: "full", heightU: 1, face: "front" });
    const page = pages()[0];
    expect(page.placements).toHaveLength(1);
    expect(page.placements[0]).toMatchObject({ deviceNodeId: "device-1", uPosition: 5, face: "front" });
  });

  it("place_device_in_rack rejects an occupied U range (addPlacementSmart does not check)", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm), rackDevice("device-2", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1 });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-2", rackId: "rack-1", uPosition: 1 })).toThrow(/occupied|out of bounds/);
    expect(pages()[0].placements).toHaveLength(1); // the overlapping placement was not created
  });

  it("place_device_in_rack rejects a U position past the rack's height", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1", { heightU: 4 })])],
    });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 5 })).toThrow(/occupied|out of bounds/);
  });

  it("place_device_in_rack refuses to place a device that is already in a rack", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1 });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 10 })).toThrow(/already placed/);
  });

  it("place_device_in_rack rejects an oversize device", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", 800, 44.45)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1 })).toThrow(/oversize/);
  });

  it("place_device_in_rack rejects a rear placement on a 2-post rack", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1", { rackType: "open-2post" })])],
    });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1, face: "rear" })).toThrow(/2-post|rear/);
  });

  it("place_device_in_rack fits two half-rack devices side by side at the same U", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", HALF_1U.widthMm, HALF_1U.heightMm), rackDevice("device-2", HALF_1U.widthMm, HALF_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    const a = handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1 }) as { form: string; halfRackSide?: string };
    const b = handlers.place_device_in_rack({ deviceId: "device-2", rackId: "rack-1", uPosition: 1 }) as { form: string; halfRackSide?: string };
    expect(a.form).toBe("half");
    expect(b.form).toBe("half");
    // The two land on opposite sides (the exact validated side is passed to the store).
    expect(a.halfRackSide).not.toBe(b.halfRackSide);
    expect(pages()[0].placements).toHaveLength(2);
  });

  it("place_device_in_rack is undoable", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1 });
    expect(pages()[0].placements).toHaveLength(1);
    useSchematicStore.getState().undo();
    expect(pages()[0].placements).toHaveLength(0);
  });

  it("remove_device_from_rack removes a placement and rejects an unknown id", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")], [
        { id: "pl-1", rackId: "rack-1", deviceNodeId: "device-1", uPosition: 1, face: "front" },
      ])],
    });
    const res = handlers.remove_device_from_rack({ placementId: "pl-1" }) as { removed: boolean };
    expect(res.removed).toBe(true);
    expect(pages()[0].placements).toHaveLength(0);
    expect(() => handlers.remove_device_from_rack({ placementId: "pl-404" })).toThrow(/No rack placement/);
  });

  it("place_device_in_rack rejects shelf-only gear (shelf placement is an editor task) and creates nothing", () => {
    // ~150mm wide -> shelf-only (too small for a direct rack-mount panel).
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", 150, 50)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 2 })).toThrow(/needs a shelf|too small/);
    // The bridge never auto-creates a shelf, so nothing is left behind.
    expect(pages()[0].placements).toHaveLength(0);
    expect(pages()[0].accessories).toHaveLength(0);
  });

  it("list_racks reports rack accessories so a U blocked by a shelf or panel is visible", () => {
    useSchematicStore.setState({
      nodes: [],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")], [], [
        { id: "acc-1", rackId: "rack-1", type: "shelf", uPosition: 4, heightU: 1, face: "front" },
      ])],
    });
    const listed = handlers.list_racks({}) as { pages: { racks: { accessories: { accessoryId: string; type: string; uPosition: number; heightU: number }[] }[] }[] };
    expect(listed.pages[0].racks[0].accessories).toHaveLength(1);
    expect(listed.pages[0].racks[0].accessories[0]).toMatchObject({ accessoryId: "acc-1", type: "shelf", uPosition: 4, heightU: 1 });
  });

  it("create_rack fails on an ambiguous pageId (duplicate page ids) rather than writing to both", () => {
    useSchematicStore.setState({
      nodes: [],
      edges: [],
      pages: [rackPage("dup", [rack("rack-1")]), rackPage("dup", [rack("rack-2")])],
    });
    expect(() => handlers.create_rack({ pageId: "dup", label: "X" })).toThrow(/ambiguous/);
  });

  it("place_device_in_rack rejects a U blocked by an accessory (not just by another device)", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")], [], [
        { id: "acc-1", rackId: "rack-1", type: "shelf", uPosition: 1, heightU: 1, face: "front" },
      ])],
    });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-1", uPosition: 1 })).toThrow(/occupied|out of bounds/);
    expect(pages()[0].placements).toHaveLength(0);
  });

  it("place_device_in_rack rejects an ambiguous rackId (duplicate rack ids across pages)", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", FULL_1U.widthMm, FULL_1U.heightMm)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-dup")]), rackPage("rk-2", [rack("rack-dup")])],
    });
    expect(() => handlers.place_device_in_rack({ deviceId: "device-1", rackId: "rack-dup", uPosition: 1 })).toThrow(/ambiguous/);
  });
});

describe("notes & rooms read + notes CRUD (update_note / delete_note)", () => {
  function noteNode(id: string, html: string, x = 0, y = 0): SchematicNode {
    return { id, type: "note", position: { x, y }, data: { html } as NoteData } as SchematicNode;
  }
  function noteHtmlOf(id: string) {
    return (useSchematicStore.getState().nodes.find((n) => n.id === id)!.data as NoteData).html;
  }

  it("get_schematic reports rooms and notes alongside devices", () => {
    useSchematicStore.setState({
      nodes: [device("device-1", 0, 0), roomNode("room-1", 100, 50, 500, 350), noteNode("note-1", "hello<br>world", 10, 20)],
      edges: [],
    });
    const schem = handlers.get_schematic({}) as {
      roomCount: number;
      noteCount: number;
      rooms: { roomId: string; label: string; width: number; height: number; parentId?: string }[];
      notes: { noteId: string; text: string; position: { x: number; y: number }; parentId?: string }[];
    };
    expect(schem.roomCount).toBe(1);
    expect(schem.noteCount).toBe(1);
    expect(schem.rooms[0]).toMatchObject({ roomId: "room-1", label: "room-1", width: 500, height: 350 });
    expect(schem.notes[0]).toMatchObject({ noteId: "note-1", text: "hello\nworld", position: { x: 10, y: 20 } });
  });

  it("get_schematic reports a room's measured size when it differs from style", () => {
    // React Flow's live `measured` supersedes `style`; report what the editor uses.
    const room = { id: "room-1", type: "room", position: { x: 0, y: 0 }, data: { label: "R" }, style: { width: 400, height: 300 }, measured: { width: 640, height: 480 } } as unknown as SchematicNode;
    useSchematicStore.setState({ nodes: [room], edges: [] });
    const schem = handlers.get_schematic({}) as { rooms: { width: number; height: number }[] };
    expect(schem.rooms[0]).toMatchObject({ width: 640, height: 480 });
  });

  it("update_note replaces the note's content (escaped) and is undoable", () => {
    useSchematicStore.setState({ nodes: [noteNode("note-1", "old", 0, 0)], edges: [] });
    const res = handlers.update_note({ noteId: "note-1", text: "new\n<b>" }) as { changed: boolean };
    expect(res.changed).toBe(true);
    expect(noteHtmlOf("note-1")).toBe("new<br>&lt;b&gt;");
    useSchematicStore.getState().undo();
    expect(noteHtmlOf("note-1")).toBe("old");
  });

  it("update_note is a no-op (no undo step) when the text is unchanged", () => {
    useSchematicStore.setState({ nodes: [noteNode("note-1", "same", 0, 0)], edges: [] });
    const undoBefore = useSchematicStore.getState().undoSize;
    const res = handlers.update_note({ noteId: "note-1", text: "same" }) as { changed: boolean };
    expect(res.changed).toBe(false);
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore); // no empty undo step pushed
  });

  it("update_note rejects empty text, a missing note, and a non-note target", () => {
    useSchematicStore.setState({ nodes: [noteNode("note-1", "x", 0, 0), device("device-1", 0, 0)], edges: [] });
    expect(() => handlers.update_note({ noteId: "note-1", text: "   " })).toThrow(/text is required/);
    expect(() => handlers.update_note({ noteId: "missing", text: "hi" })).toThrow(/No note found/);
    expect(() => handlers.update_note({ noteId: "device-1", text: "hi" })).toThrow(/not a note/);
  });

  it("delete_note removes the note (undoable) and rejects a non-note", () => {
    useSchematicStore.setState({ nodes: [noteNode("note-1", "bye", 0, 0), device("device-1", 0, 0)], edges: [] });
    const res = handlers.delete_note({ noteId: "note-1" }) as { deleted: boolean };
    expect(res.deleted).toBe(true);
    expect(useSchematicStore.getState().nodes.some((n) => n.id === "note-1")).toBe(false);
    useSchematicStore.getState().undo();
    expect(useSchematicStore.getState().nodes.some((n) => n.id === "note-1")).toBe(true);
    expect(() => handlers.delete_note({ noteId: "device-1" })).toThrow(/not a note/);
  });
});

describe("batch structural ops (install_card_batch / place_device_in_rack_batch)", () => {
  function chassis(id: string, slots: InstalledSlot[]): SchematicNode {
    return { id, type: "device", position: { x: 0, y: 0 }, data: { label: id, deviceType: "chassis", ports: [], slots } as DeviceData } as SchematicNode;
  }
  function emptySlot(slotId: string, slotFamily: string): InstalledSlot {
    return { slotId, label: slotId, slotFamily, portIds: [] };
  }
  function cardTpl(id: string, slotFamily: string): DeviceTemplate {
    return { id, label: id, deviceType: id, slotFamily, ports: [{ id: "p0", label: "P0", direction: "input", signalType: "hdmi" }] } as DeviceTemplate;
  }
  function rackDevice(id: string, widthMm: number, heightMm: number): SchematicNode {
    return { id, type: "device", position: { x: 0, y: 0 }, data: { label: id, deviceType: "test", ports: [], widthMm, heightMm } as DeviceData } as SchematicNode;
  }
  function rack(id: string): RackData {
    return { id, label: id, rackType: "floor-19", heightU: 42, depthMm: 600, widthClass: "19in", position: { x: 0, y: 0 } };
  }
  function rackPage(id: string, racks: RackData[]): RackElevationPage {
    return { id, label: id, type: "rack-elevation", racks, placements: [], accessories: [] };
  }
  function filledSlotIds() {
    const slots = ((useSchematicStore.getState().nodes.find((n) => n.id === "chassis-1")!.data as DeviceData).slots ?? []);
    return slots.filter((s) => s.cardTemplateId).map((s) => s.slotId);
  }

  it("install_card_batch installs every card and reports per-item success", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a"), emptySlot("slot-2", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a")],
    });
    const res = handlers.install_card_batch({ installs: [
      { deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-a" },
      { deviceId: "chassis-1", slotId: "slot-2", cardTemplateId: "card-a" },
    ] }) as { succeeded: number; failed: number };
    expect(res).toMatchObject({ succeeded: 2, failed: 0 });
    expect(filledSlotIds().sort()).toEqual(["slot-1", "slot-2"]);
  });

  it("install_card_batch is best-effort and a failed item pushes no undo step", () => {
    useSchematicStore.setState({
      nodes: [chassis("chassis-1", [emptySlot("slot-1", "fam-a")])],
      edges: [],
      customTemplates: [cardTpl("card-a", "fam-a")],
    });
    const undoBefore = useSchematicStore.getState().undoSize;
    const res = handlers.install_card_batch({ installs: [
      { deviceId: "chassis-1", slotId: "slot-1", cardTemplateId: "card-a" }, // ok
      { deviceId: "chassis-1", slotId: "missing", cardTemplateId: "card-a" }, // fails pre-validation
    ] }) as { succeeded: number; failed: number; results: { index: number; ok: boolean; error?: string }[] };
    expect(res.succeeded).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.results[1].ok).toBe(false);
    // Only the successful install pushed undo (the failed item threw before swapCard).
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore + 1);
  });

  it("install_card_batch rejects an empty or non-array batch (shape error, not a fake success)", () => {
    useSchematicStore.setState({ nodes: [], edges: [], customTemplates: [] });
    expect(() => handlers.install_card_batch({ installs: [] })).toThrow();
    expect(() => handlers.install_card_batch({} as Record<string, unknown>)).toThrow();
  });

  it("place_device_in_rack_batch places every device and reports per-item success", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", 480, 44.45), rackDevice("device-2", 480, 44.45)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    const res = handlers.place_device_in_rack_batch({ placements: [
      { deviceId: "device-1", rackId: "rack-1", uPosition: 1 },
      { deviceId: "device-2", rackId: "rack-1", uPosition: 2 },
    ] }) as { succeeded: number; failed: number };
    expect(res).toMatchObject({ succeeded: 2, failed: 0 });
    const page = useSchematicStore.getState().pages.find((p): p is RackElevationPage => p.type === "rack-elevation")!;
    expect(page.placements).toHaveLength(2);
  });

  it("place_device_in_rack_batch is best-effort (occupied U fails) and a failed item pushes no undo step", () => {
    useSchematicStore.setState({
      nodes: [rackDevice("device-1", 480, 44.45), rackDevice("device-2", 480, 44.45)],
      edges: [],
      pages: [rackPage("rk-1", [rack("rack-1")])],
    });
    const undoBefore = useSchematicStore.getState().undoSize;
    const res = handlers.place_device_in_rack_batch({ placements: [
      { deviceId: "device-1", rackId: "rack-1", uPosition: 1 }, // ok
      { deviceId: "device-2", rackId: "rack-1", uPosition: 1 }, // fails — U1 now occupied
    ] }) as { succeeded: number; failed: number; results: { ok: boolean; error?: string }[] };
    expect(res.succeeded).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.results[1].ok).toBe(false);
    // Only the successful placement pushed undo (the failed item threw before addPlacementSmart).
    expect(useSchematicStore.getState().undoSize).toBe(undoBefore + 1);
  });
});
