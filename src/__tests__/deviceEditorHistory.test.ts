/**
 * Device editor form-local undo/redo (#412).
 *
 * The editor's port list is local form state until Apply, so Ctrl+Z inside the editor
 * never removed a Bulk Add — it either did nothing or undid canvas history behind the
 * dialog. These pin the editor's own structural undo stack and the guard that keeps the
 * canvas shortcut out while the editor is open.
 *
 * Port rows come from the seeded test fixture (#307) so ids have the real `-in-N` /
 * `-out-N` shape, and new rows are built by the same `buildBulkPorts` the Bulk Add form uses.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildTestSchematic } from "../testSchematic/build";
import { buildBulkPorts } from "../portBulk";
import {
  editorShortcut,
  emptyHistory,
  isDeviceEditorOpen,
  ownsEditorKey,
  isTextEditingTarget,
  movePortInList,
  recordEntry,
  redoStep,
  restorePortStructure,
  restoreSlotStructure,
  samePortStructure,
  undoStep,
  type EditorHistory,
} from "../deviceEditorHistory";
import type { PortDraft } from "../deviceTemplateBuild";
import type { ConnectionEdge, DeviceData, InstalledSlot, SchematicNode } from "../types";

const fixture = buildTestSchematic();
const amp = fixture.nodes.find((n) => n.id === "device-6") as SchematicNode & { data: DeviceData };
/** The Amp's ports as the editor loads them (fixture: amp-xlr-in-1/2, amp-spk-out-1/2, amp-power). */
const loaded = (): PortDraft[] => amp.data.ports.map((p) => ({ ...p }));
const ids = (ps: PortDraft[]) => ps.map((p) => p.id);

/** What the editor does on a structural change: record the list from before, then replace it. */
function change(h: EditorHistory<PortDraft[]>, before: PortDraft[], after: PortDraft[]) {
  return { h: recordEntry(h, before), ports: after };
}
const undo = (h: EditorHistory<PortDraft[]>, current: PortDraft[]) => {
  const step = undoStep(h, () => current);
  return step ? { h: step.history, ports: restorePortStructure(step.restore, current) } : null;
};
const redo = (h: EditorHistory<PortDraft[]>, current: PortDraft[]) => {
  const step = redoStep(h, () => current);
  return step ? { h: step.history, ports: restorePortStructure(step.restore, current) } : null;
};

function bulk(count: number): PortDraft[] {
  return buildBulkPorts(
    { direction: "input", prefix: "Dante In", start: 1, count, signalType: "dante", connectorType: "none" },
    (i) => `draft-1700000000000-abcd-${i}`,
  );
}

describe("device editor undo — ports (#412)", () => {
  it("undoes a Bulk Add, and redoes it", () => {
    const start = loaded();
    let s = change(emptyHistory(), start, [...start, ...bulk(8)]);
    expect(s.ports).toHaveLength(13);

    const u = undo(s.h, s.ports)!;
    expect(ids(u.ports)).toEqual(ids(start));

    const r = redo(u.h, u.ports)!;
    expect(r.ports).toHaveLength(13);
    expect(ids(r.ports).slice(5)).toEqual(ids(bulk(8)));
    s = r;
    expect(undoStep(s.h, () => s.ports)).not.toBeNull(); // the redone step is undoable again
  });

  it("undoes a delete, putting the port back where it was with its data", () => {
    const start = loaded();
    const s = change(emptyHistory(), start, start.filter((p) => p.id !== "amp-xlr-in-2"));
    const u = undo(s.h, s.ports)!;
    expect(ids(u.ports)).toEqual(ids(start));
    expect(u.ports[1]).toMatchObject({ id: "amp-xlr-in-2", label: "XLR In 2", connectorType: "xlr-3" });
  });

  it("undoes a reorder, including a drag into another section", () => {
    const start = loaded();
    // Drag "XLR In 2" to the top of Outputs.
    const moved = movePortInList(start, "amp-xlr-in-2", "output", 0);
    expect(moved.find((p) => p.id === "amp-xlr-in-2")!.direction).toBe("output");
    const s = change(emptyHistory(), start, moved);
    const u = undo(s.h, s.ports)!;
    expect(ids(u.ports)).toEqual(ids(start));
    expect(u.ports.find((p) => p.id === "amp-xlr-in-2")!.direction).toBe("input");
  });

  it("keeps a rename made after the Bulk Add when the Bulk Add is undone", () => {
    // Field edits aren't on the stack; undoing a structural step must not roll them back.
    const start = loaded();
    const s = change(emptyHistory(), start, [...start, ...bulk(4)]);
    const renamed = s.ports.map((p) => (p.id === "amp-xlr-in-1" ? { ...p, label: "Lectern Mic" } : p));
    const u = undo(s.h, renamed)!;
    expect(ids(u.ports)).toEqual(ids(start));
    expect(u.ports[0].label).toBe("Lectern Mic");
  });

  it("steps back through several changes in order", () => {
    const start = loaded();
    let s = change(emptyHistory(), start, [...start, ...bulk(4)]);
    s = change(s.h, s.ports, s.ports.filter((p) => p.id !== "amp-power"));
    s = change(s.h, s.ports, movePortInList(s.ports, "amp-spk-out-2", "output", 0));

    let u = undo(s.h, s.ports)!; // reorder
    expect(ids(u.ports.filter((p) => p.direction === "output"))).toEqual(["amp-spk-out-1", "amp-spk-out-2"]);
    u = undo(u.h, u.ports)!; // delete
    expect(ids(u.ports)).toContain("amp-power");
    u = undo(u.h, u.ports)!; // bulk add
    expect(ids(u.ports)).toEqual(ids(start));
    expect(undo(u.h, u.ports)).toBeNull();
  });

  it("a new change drops the redo steps", () => {
    const start = loaded();
    const s = change(emptyHistory(), start, [...start, ...bulk(2)]);
    const u = undo(s.h, s.ports)!;
    const s2 = change(u.h, u.ports, u.ports.filter((p) => p.id !== "amp-power"));
    expect(redo(s2.h, s2.ports)).toBeNull();
  });

  it("caps how far back it goes", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 10; i++) h = recordEntry(h, i, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });

  it("a drop back where the port started is not a change", () => {
    const start = loaded();
    expect(samePortStructure(start, movePortInList(start, "amp-xlr-in-1", "input", 0))).toBe(true);
    expect(samePortStructure(start, movePortInList(start, "amp-xlr-in-1", "input", 1))).toBe(false);
  });
});

describe("device editor undo — expansion slots (#412)", () => {
  const slotA: InstalledSlot = { slotId: "slot-a", label: "Slot 1", slotFamily: "yamaha-my", portIds: [] };
  const slotB: InstalledSlot = {
    slotId: "slot-b", label: "Slot 2", slotFamily: "yamaha-my",
    cardTemplateId: "card-dante", cardLabel: "Dante card", portIds: ["slot-b-dante-in-1"],
  };

  it("restores membership, order and the installed card from the snapshot", () => {
    const before = [slotA];
    const after = [slotA, { ...slotB }];
    expect(restoreSlotStructure(before, after)).toEqual([slotA]);
    // Undoing a card install: the slot exists on both sides, the card comes from the snapshot.
    const emptyB: InstalledSlot = { slotId: "slot-b", label: "Slot 2", slotFamily: "yamaha-my", portIds: [] };
    expect(restoreSlotStructure([slotA, emptyB], [slotA, slotB])![1].cardTemplateId).toBeUndefined();
  });

  it("keeps a slot rename made after the step being undone", () => {
    const renamed = { ...slotA, label: "Stage Rack", hidden: true };
    const out = restoreSlotStructure([slotA], [renamed, slotB])!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ slotId: "slot-a", label: "Stage Rack", hidden: true });
  });

  it("leaves a device without slots without slots", () => {
    expect(restoreSlotStructure(undefined, [slotA])).toBeUndefined();
  });
});

describe("device editor keyboard (#412 / #413)", () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
    editorShortcut({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

  it("maps undo / redo / close, Caps Lock safe", () => {
    expect(key("z", { ctrlKey: true })).toBe("undo");
    expect(key("Z", { ctrlKey: true })).toBe("undo"); // Caps Lock (#179)
    expect(key("z", { metaKey: true })).toBe("undo");
    expect(key("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(key("y", { ctrlKey: true })).toBe("redo");
    expect(key("Escape")).toBe("close");
    expect(key("z")).toBeNull();
    expect(key("Enter", { ctrlKey: true })).toBeNull(); // Ctrl+Enter is Apply, handled elsewhere
    expect(key("z", { ctrlKey: true, altKey: true })).toBeNull();
  });

  it("stays out of an IME composition", () => {
    expect(editorShortcut({ key: "Escape", ctrlKey: false, metaKey: false, shiftKey: false, isComposing: true })).toBeNull();
    expect(editorShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, isComposing: true })).toBeNull();
    expect(editorShortcut({ key: "Process", ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
  });

  describe("which keys the device editor owns", () => {
    const editor = { name: "device editor root" };
    const confirm = { name: "Discard changes? prompt" };

    it("owns nothing when the device editor isn't rendered (Room / Annotation editor, text-stub edit)", () => {
      // editingNodeId is shared: with a room or text stub being edited the device editor
      // renders null. A target in no layer used to compare null === null and steal Esc.
      expect(ownsEditorKey({ editor: null, targetLayer: null, nestedOpen: false })).toBe(false);
      expect(ownsEditorKey({ editor: null, targetLayer: confirm, nestedOpen: false })).toBe(false);
    });

    it("owns keys from inside the editor, and from no layer when nothing is stacked on it", () => {
      expect(ownsEditorKey({ editor, targetLayer: editor, nestedOpen: false })).toBe(true);
      // Body with nothing focused, or the canvas device still focused after double-click.
      expect(ownsEditorKey({ editor, targetLayer: null, nestedOpen: false })).toBe(true);
    });

    it("leaves a dialog stacked on the editor its own keys", () => {
      expect(ownsEditorKey({ editor, targetLayer: confirm, nestedOpen: true })).toBe(false);
      expect(ownsEditorKey({ editor, targetLayer: null, nestedOpen: true })).toBe(false);
    });
  });

  it("leaves typing undo to text fields only", () => {
    expect(isTextEditingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextEditingTarget({ tagName: "INPUT", type: "number" })).toBe(true);
    expect(isTextEditingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEditingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextEditingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextEditingTarget({ tagName: "INPUT", type: "color" })).toBe(false);
    expect(isTextEditingTarget({ tagName: "SELECT" })).toBe(false);
    expect(isTextEditingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEditingTarget({ tagName: "BODY" })).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });

  it("the canvas undo shortcut stands down while the device editor is open", () => {
    const nodes = fixture.nodes;
    expect(isDeviceEditorOpen({ editingNodeId: "device-6", nodes })).toBe(true);
    expect(isDeviceEditorOpen({ editingNodeId: null, nodes })).toBe(false);
    // Room / annotation editors share editingNodeId; this guard is the device editor's.
    const room = nodes.find((n) => n.type === "room")!;
    expect(isDeviceEditorOpen({ editingNodeId: room.id, nodes })).toBe(false);
  });
});

// ── Store side: undoing a slot edit puts the device and its connections back ──────────

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
let edgesTouching: typeof import("../deviceEditorHistory")["edgesTouching"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
  ({ edgesTouching } = await import("../deviceEditorHistory"));
});

/** The fixture's Amp with a populated Dante card slot, wired to the FOH console. */
function seedAmpWithCard() {
  const f = buildTestSchematic();
  const nodes = f.nodes.map((n) => {
    if (n.id !== "device-6") return n;
    const data = n.data as DeviceData;
    return {
      ...n,
      data: {
        ...data,
        ports: [...data.ports, { id: "slot-b-dante-in-1", label: "Dante In 1", signalType: "dante", direction: "input", connectorType: "rj45" }],
        slots: [
          { slotId: "slot-a", label: "Slot 1", slotFamily: "yamaha-my", portIds: [] },
          { slotId: "slot-b", label: "Slot 2", slotFamily: "yamaha-my", cardTemplateId: "card-dante", cardLabel: "Dante card", portIds: ["slot-b-dante-in-1"] },
        ],
      },
    };
  }) as SchematicNode[];
  const danteEdge = {
    id: "edge-dante-test",
    source: "device-15",
    sourceHandle: "foh-xlr-out-l",
    target: "device-6",
    targetHandle: "slot-b-dante-in-1",
    data: { signalType: "dante" },
  } as ConnectionEdge;
  useSchematicStore.setState({ nodes, edges: [...(f.edges as ConnectionEdge[]), danteEdge] });
}

function snapshot(nodeId: string) {
  const s = useSchematicStore.getState();
  const d = s.nodes.find((n) => n.id === nodeId)!.data as DeviceData;
  return { slots: d.slots, ports: d.ports, edges: edgesTouching(s.edges, nodeId) };
}

describe("discardProvisionalDevice — Cancel on a just-created device (#413)", () => {
  const camera = () => ({
    label: "PTZ Camera",
    deviceType: "camera",
    ports: [
      { id: "ptz-sdi-out", label: "SDI Out", signalType: "sdi", direction: "output", connectorType: "bnc" },
      { id: "ptz-ip-in", label: "Control In", signalType: "ethernet", direction: "input", connectorType: "rj45" },
    ],
  }) as unknown as import("../types").DeviceTemplate;

  function seed() {
    // Loaded the way the app loads ?fixture=test, so new device ids don't collide with it.
    useSchematicStore.getState().importFromJSON(buildTestSchematic());
    // One PTZ Camera already on the schematic, so placing another renumbers it "PTZ Camera 1".
    useSchematicStore.getState().addDevice(camera(), { x: 0, y: 0 });
    return {
      nodes: useSchematicStore.getState().nodes,
      edges: useSchematicStore.getState().edges,
      undoSize: useSchematicStore.getState().undoSize,
    };
  }

  it("removes the device even after slot edits and editor undo pushed canvas steps", () => {
    const before = seed();
    useSchematicStore.getState().createAndEditDevice(camera(), { x: 400, y: 0 });
    const id = useSchematicStore.getState().creatingNodeId!;
    expect(useSchematicStore.getState().nodes.find((n) => n.id === before.nodes[before.nodes.length - 1].id)!.data.label).toBe("PTZ Camera 1");

    // In the editor: + Add Slot, then Ctrl+Z on it (each pushes a canvas step).
    const snap = snapshot(id);
    useSchematicStore.getState().addSlot(id, { label: "Slot 1", slotFamily: "" });
    useSchematicStore.getState().restoreDeviceSlotState(id, snap);
    useSchematicStore.getState().addSlots(id, [{ label: "Slot 1", slotFamily: "" }, { label: "Slot 2", slotFamily: "" }]);

    useSchematicStore.getState().discardProvisionalDevice(id);
    const s = useSchematicStore.getState();
    expect(s.nodes.some((n) => n.id === id)).toBe(false);
    expect(s.nodes.map((n) => n.id)).toEqual(before.nodes.map((n) => n.id));
    // The placement's renumbering is undone too.
    expect(s.nodes.find((n) => n.id === before.nodes[before.nodes.length - 1].id)!.data.label).toBe("PTZ Camera");
    expect(s.edges.map((e) => e.id)).toEqual(before.edges.map((e) => e.id));
    // Nothing from the cancelled session is left in canvas history.
    expect(s.undoSize).toBe(before.undoSize);
    expect(s.redoSize).toBe(0);
    expect(s.creatingNodeId).toBeNull();
  });

  it("still removes the device when its placement step has aged out of the history cap", () => {
    const before = seed();
    useSchematicStore.getState().createAndEditDevice(camera(), { x: 400, y: 0 });
    const id = useSchematicStore.getState().creatingNodeId!;
    useSchematicStore.getState().addSlot(id, { label: "Slot 1", slotFamily: "" });
    const slotId = (useSchematicStore.getState().nodes.find((n) => n.id === id)!.data as DeviceData).slots![0].slotId;
    // Typing a slot label pushes a canvas step per keystroke — 60 of them evicts the placement.
    for (let i = 0; i < 60; i++) useSchematicStore.getState().updateSlot(id, slotId, { label: `Slot ${i}` });

    useSchematicStore.getState().discardProvisionalDevice(id);
    const s = useSchematicStore.getState();
    expect(s.nodes.some((n) => n.id === id)).toBe(false);
    expect(s.nodes.map((n) => n.id)).toEqual(before.nodes.map((n) => n.id));
    expect(s.nodes.find((n) => n.id === before.nodes[before.nodes.length - 1].id)!.data.label).toBe("PTZ Camera");
  });

  it("a device committed with Apply is not discardable afterwards", () => {
    seed();
    useSchematicStore.getState().createAndEditDevice(camera(), { x: 400, y: 0 });
    const id = useSchematicStore.getState().creatingNodeId!;
    useSchematicStore.getState().setCreatingNodeId(null); // what Apply does
    const undoSize = useSchematicStore.getState().undoSize;
    useSchematicStore.getState().discardProvisionalDevice(id);
    expect(useSchematicStore.getState().nodes.some((n) => n.id === id)).toBe(true);
    expect(useSchematicStore.getState().undoSize).toBe(undoSize);
  });
});

describe("restoreDeviceSlotState (#412)", () => {
  it("undoing Remove Slot brings back the slot, its card ports and the connection it dropped", () => {
    seedAmpWithCard();
    const before = snapshot("device-6");
    const edgeCount = useSchematicStore.getState().edges.length;

    useSchematicStore.getState().removeSlot("device-6", "slot-b");
    expect(snapshot("device-6").slots!.map((s) => s.slotId)).toEqual(["slot-a"]);
    expect(useSchematicStore.getState().edges.some((e) => e.id === "edge-dante-test")).toBe(false);

    useSchematicStore.getState().restoreDeviceSlotState("device-6", before);
    const after = snapshot("device-6");
    expect(after.slots!.map((s) => s.slotId)).toEqual(["slot-a", "slot-b"]);
    expect(after.ports.map((p) => p.id)).toContain("slot-b-dante-in-1");
    expect(useSchematicStore.getState().edges.some((e) => e.id === "edge-dante-test")).toBe(true);
    expect(useSchematicStore.getState().edges).toHaveLength(edgeCount);
    // The Amp's original FOH connection survived untouched, in place.
    expect(useSchematicStore.getState().edges.some((e) => e.id === "edge-7")).toBe(true);
  });

  it("undoing a slot Bulk Add removes the added slots and touches nothing else", () => {
    seedAmpWithCard();
    const before = snapshot("device-6");
    const edgesBefore = useSchematicStore.getState().edges;
    useSchematicStore.getState().addSlots("device-6", [
      { label: "Slot 3", slotFamily: "yamaha-my" },
      { label: "Slot 4", slotFamily: "yamaha-my" },
    ]);
    expect(snapshot("device-6").slots).toHaveLength(4);

    useSchematicStore.getState().restoreDeviceSlotState("device-6", before);
    expect(snapshot("device-6").slots!.map((s) => s.slotId)).toEqual(["slot-a", "slot-b"]);
    expect(useSchematicStore.getState().edges.map((e) => e.id)).toEqual(edgesBefore.map((e) => e.id));
  });

  it("is itself one canvas undo step", () => {
    seedAmpWithCard();
    const before = snapshot("device-6");
    useSchematicStore.getState().addSlot("device-6", { label: "Slot 3", slotFamily: "" });
    const sizeAfterAdd = useSchematicStore.getState().undoSize;
    useSchematicStore.getState().restoreDeviceSlotState("device-6", before);
    expect(useSchematicStore.getState().undoSize).toBe(Math.min(sizeAfterAdd + 1, 50));
  });

  it("ignores an unknown device", () => {
    seedAmpWithCard();
    const nodesBefore = useSchematicStore.getState().nodes;
    useSchematicStore.getState().restoreDeviceSlotState("nope", snapshot("device-6"));
    expect(useSchematicStore.getState().nodes).toBe(nodesBefore);
  });
});
