import { beforeEach, describe, expect, it } from "vitest";
import { useSchematicStore } from "../store";
import type { DeviceData, DeviceNode } from "../types";

function deviceNode(id: string, x: number, y: number): DeviceNode {
  return {
    id,
    type: "device",
    position: { x, y },
    measured: { width: 100, height: 50 },
    data: {
      label: "Source",
      deviceType: "test-device",
      ports: [],
    } as DeviceData,
  } as DeviceNode;
}

beforeEach(() => {
  useSchematicStore.setState({
    nodes: [],
    edges: [],
    pages: [],
    pastePosition: null,
  });
});

describe("pasteClipboard", () => {
  it("pastes the copied selection at the last canvas mouse position", () => {
    useSchematicStore.setState({
      nodes: [deviceNode("device-1", 100, 200)],
      edges: [],
    });

    useSchematicStore.setState({
      nodes: useSchematicStore.getState().nodes.map((n) => ({ ...n, selected: n.id === "device-1" })),
    });
    const store = useSchematicStore.getState();
    store.copySelected();
    store.setPastePosition({ x: 500, y: 600 });
    store.pasteClipboard();

    const state = useSchematicStore.getState();
    expect(state.nodes).toHaveLength(2);
    const pasted = state.nodes.find((n) => n.position.x !== 100 || n.position.y !== 200) as DeviceNode;
    expect(pasted.position).toEqual({ x: 520, y: 620 });
    expect(pasted.selected).toBe(true);
  });
});
