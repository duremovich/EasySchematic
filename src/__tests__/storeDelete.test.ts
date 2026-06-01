import { beforeEach, describe, expect, it } from "vitest";
import { useSchematicStore } from "../store";
import type { ConnectionEdge, DeviceData, DeviceNode, StubLabelNode } from "../types";

function deviceNode(id: string, label: string): DeviceNode {
  return {
    id,
    type: "device",
    position: { x: 0, y: 0 },
    data: {
      label,
      deviceType: "test-device",
      ports: [],
    } as DeviceData,
  } as DeviceNode;
}

function stubNode(id: string, linkedConnectionId: string, side: "source" | "target"): StubLabelNode {
  return {
    id,
    type: "stub-label",
    position: { x: 0, y: 0 },
    data: {
      signalType: "sdi",
      linkedConnectionId,
      side,
    },
  } as StubLabelNode;
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  linkedConnectionId?: string,
): ConnectionEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: {
      signalType: "sdi",
      ...(linkedConnectionId ? { linkedConnectionId } : {}),
    },
  } as ConnectionEdge;
}

beforeEach(() => {
  useSchematicStore.setState({
    nodes: [],
    edges: [],
    pages: [],
  });
});

describe("deleteNode", () => {
  it("removes both halves of a stubbed connection when deleting a connected device", () => {
    const linkedConnectionId = "link-123";
    useSchematicStore.setState({
      nodes: [
        deviceNode("dev-delete", "Deleted device"),
        deviceNode("dev-keep", "Kept device"),
        stubNode("stub-src", linkedConnectionId, "source"),
        stubNode("stub-tgt", linkedConnectionId, "target"),
      ],
      edges: [
        edge("edge-src", "dev-delete", "p-1", "stub-src", "in", linkedConnectionId),
        edge("edge-tgt", "stub-tgt", "out", "dev-keep", "p-2", linkedConnectionId),
      ],
    });

    useSchematicStore.getState().deleteNode("dev-delete");

    const state = useSchematicStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(["dev-keep"]);
    expect(state.edges).toHaveLength(0);
  });
});
