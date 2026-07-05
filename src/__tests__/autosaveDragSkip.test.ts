import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import type { NodeChange } from "@xyflow/react";
import type { DeviceTemplate, Port, SchematicNode } from "../types";

// Count writes to the autosave slot so we can assert the drag-tick skip. Vitest runs in the node
// environment where localStorage is absent, so install a minimal in-memory stub before importing
// the store.
const AUTOSAVE_KEY = "easyschematic-autosave";
let autosaveWrites = 0;

function installLocalStorageStub() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (k === AUTOSAVE_KEY) autosaveWrites++;
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  });
}

let useSchematicStore: typeof import("../store").useSchematicStore;
let flushTrailingDragSave: typeof import("../store").flushTrailingDragSave;

beforeAll(async () => {
  installLocalStorageStub();
  // Autosave no-ops until the store is hydrated (a data-loss guard). Seed a minimal valid autosave
  // blob and load it so the synchronous hydration path runs and sets the hydrated flag.
  const { CURRENT_SCHEMA_VERSION } = await import("../migrations");
  localStorage.setItem(
    AUTOSAVE_KEY,
    JSON.stringify({ version: CURRENT_SCHEMA_VERSION, name: "test", nodes: [], edges: [] }),
  );
  ({ useSchematicStore, flushTrailingDragSave } = await import("../store"));
  useSchematicStore.getState().loadFromLocalStorage();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  useSchematicStore.getState().newSchematic();
});

function port(id: string): Port {
  return { id, label: id, signalType: "custom" as Port["signalType"], direction: "input" };
}

function template(id: string, ports: Port[]): DeviceTemplate {
  return { id, deviceType: "misc", label: id, ports };
}

function addOneDevice(id: string): SchematicNode {
  useSchematicStore.getState().addDevice(template(id, [port("p")]), { x: 0, y: 0 });
  return useSchematicStore.getState().nodes.find((n) => n.type === "device")!;
}

describe("autosave skips intermediate drag ticks (store.ts onNodesChange)", () => {
  it("does not persist on a mid-drag position tick, but does persist on the drop", () => {
    const node = addOneDevice("drag-dev");

    autosaveWrites = 0;
    const midDrag: NodeChange<SchematicNode>[] = [
      { id: node.id, type: "position", position: { x: 40, y: 40 }, dragging: true },
    ];
    useSchematicStore.getState().onNodesChange(midDrag);
    expect(autosaveWrites).toBe(0);

    // React Flow emits a final dragging:false position change on drop — the resting position saves.
    const drop: NodeChange<SchematicNode>[] = [
      { id: node.id, type: "position", position: { x: 48, y: 48 }, dragging: false },
    ];
    useSchematicStore.getState().onNodesChange(drop);
    expect(autosaveWrites).toBeGreaterThanOrEqual(1);
  });

  it("still persists a non-drag change (e.g. selection)", () => {
    const node = addOneDevice("sel-dev");

    autosaveWrites = 0;
    const select: NodeChange<SchematicNode>[] = [{ id: node.id, type: "select", selected: true }];
    useSchematicStore.getState().onNodesChange(select);
    expect(autosaveWrites).toBeGreaterThanOrEqual(1);
  });

  it("persists immediately when a batch mixes a drag tick with any other change", () => {
    const node = addOneDevice("mix-dev");

    autosaveWrites = 0;
    const mixed: NodeChange<SchematicNode>[] = [
      { id: node.id, type: "position", position: { x: 40, y: 40 }, dragging: true },
      { id: node.id, type: "select", selected: true },
    ];
    useSchematicStore.getState().onNodesChange(mixed);
    expect(autosaveWrites).toBeGreaterThanOrEqual(1);
  });

  it("persists the resting position via the trailing save when a drag aborts without a drop", () => {
    // React Flow aborts a drag — emitting NO dragging:false batch and NOT calling onNodeDragStop —
    // when a second touch starts or the dragged node is deleted mid-drag. The trailing save must
    // persist the last dragged position anyway.
    const node = addOneDevice("abort-dev");
    vi.useFakeTimers();
    try {
      autosaveWrites = 0;
      useSchematicStore.getState().onNodesChange([
        { id: node.id, type: "position", position: { x: 40, y: 40 }, dragging: true },
      ]);
      expect(autosaveWrites).toBe(0); // the tick itself is still skipped

      vi.advanceTimersByTime(500); // TRAILING_DRAG_SAVE_MS
      expect(autosaveWrites).toBeGreaterThanOrEqual(1);

      // The dragged position — not a stale pre-drag one — is what got serialized.
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!);
      const savedNode = saved.nodes.find(
        (n: { id: string; position: { x: number; y: number } }) => n.id === node.id,
      );
      expect(savedNode.position).toEqual({ x: 40, y: 40 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes a pending trailing save synchronously (the pagehide/page-hidden path)", () => {
    const node = addOneDevice("flush-dev");
    vi.useFakeTimers();
    try {
      autosaveWrites = 0;
      useSchematicStore.getState().onNodesChange([
        { id: node.id, type: "position", position: { x: 40, y: 40 }, dragging: true },
      ]);
      expect(autosaveWrites).toBe(0);

      flushTrailingDragSave(); // what the pagehide / page-hidden listeners invoke
      expect(autosaveWrites).toBeGreaterThanOrEqual(1);
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!);
      const savedNode = saved.nodes.find(
        (n: { id: string; position: { x: number; y: number } }) => n.id === node.id,
      );
      expect(savedNode.position).toEqual({ x: 40, y: 40 });

      const writesAfterFlush = autosaveWrites;
      vi.advanceTimersByTime(1000);
      expect(autosaveWrites).toBe(writesAfterFlush); // the flush also cleared the timer
    } finally {
      vi.useRealTimers();
    }
  });

  it("any other save path cancels the pending trailing save", () => {
    const node = addOneDevice("other-save-dev");
    vi.useFakeTimers();
    try {
      autosaveWrites = 0;
      useSchematicStore.getState().onNodesChange([
        { id: node.id, type: "position", position: { x: 40, y: 40 }, dragging: true },
      ]);
      // Any store action that persists (an edge change, a delete, …) lands here eventually.
      useSchematicStore.getState().saveToLocalStorage();
      const writes = autosaveWrites;
      expect(writes).toBeGreaterThanOrEqual(1);

      vi.advanceTimersByTime(1000);
      expect(autosaveWrites).toBe(writes); // no redundant re-serialization 500ms later
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not double-save: a normal drop cancels the pending trailing save", () => {
    const node = addOneDevice("drop-dev");
    vi.useFakeTimers();
    try {
      autosaveWrites = 0;
      useSchematicStore.getState().onNodesChange([
        { id: node.id, type: "position", position: { x: 40, y: 40 }, dragging: true },
      ]);
      useSchematicStore.getState().onNodesChange([
        { id: node.id, type: "position", position: { x: 48, y: 48 }, dragging: false },
      ]);
      const writesAfterDrop = autosaveWrites;
      expect(writesAfterDrop).toBeGreaterThanOrEqual(1);

      vi.advanceTimersByTime(1000);
      expect(autosaveWrites).toBe(writesAfterDrop); // no extra write from the cancelled timer
    } finally {
      vi.useRealTimers();
    }
  });
});
