/**
 * Store-level tests for the Ship-2 "editing & layout" MCP tools' mutation paths:
 *   - moveDevice (the move_device tool) — repositions a node in one undo step.
 *   - onEdgesChange remove (the delete_connection tool) — removes a single edge.
 *
 * The store reads editor preferences from localStorage at import time, so we install
 * a minimal in-memory localStorage and import the store dynamically afterwards. Pure
 * decision logic (validatePosition / planConnectionRemoval) is covered separately in
 * mcpValidation.test.ts.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { ConnectionEdge, DeviceData, SchematicNode, StubLabelData } from "../types";

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

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
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
