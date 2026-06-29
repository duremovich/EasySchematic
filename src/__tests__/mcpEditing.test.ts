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
