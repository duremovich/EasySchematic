import type { ConnectionEdge, DeviceData, DeviceNode, DeviceTemplate, Port, PortDirection, SchematicNode } from "./types";
import { GRID_SIZE } from "./gridConstants";

export const EXTERNAL_ENDPOINT_DEVICE_TYPE = "external-endpoint";
export const EXTERNAL_ENDPOINT_DEFAULT_LABEL = "External Endpoint";
export const EXTERNAL_ENDPOINT_PORT_ID = "endpoint";
export const EXTERNAL_ENDPOINT_PORT_LABEL = "Endpoint";
export const EXTERNAL_ENDPOINT_MIN_WIDTH = 40;
export const EXTERNAL_ENDPOINT_MAX_WIDTH = 520;
export const EXTERNAL_ENDPOINT_HEIGHT = 14;

/** Compact endpoint handles sit at the vertical centre, so snap that centre to the cable grid. */
export function snapExternalEndpointY(y: number): number {
  return Math.round((y + EXTERNAL_ENDPOINT_HEIGHT / 2) / GRID_SIZE) * GRID_SIZE - EXTERNAL_ENDPOINT_HEIGHT / 2;
}

export function isExternalEndpointData(
  data: Pick<DeviceData | DeviceTemplate, "deviceType"> | null | undefined,
): boolean {
  return data?.deviceType === EXTERNAL_ENDPOINT_DEVICE_TYPE;
}

export function createExternalEndpointPort(): Port {
  return {
    id: EXTERNAL_ENDPOINT_PORT_ID,
    label: EXTERNAL_ENDPOINT_PORT_LABEL,
    signalType: "ethernet",
    direction: "bidirectional",
    connectorType: "rj45",
    addressable: false,
  };
}

export function estimateExternalEndpointWidth(
  label: string | undefined,
  direction: PortDirection = "bidirectional",
): number {
  const prefixChars = direction === "input" || direction === "output" ? 2 : 2;
  const textLength = Math.max(1, (label?.trim() || EXTERNAL_ENDPOINT_DEFAULT_LABEL).length + prefixChars);
  const estimated = 10 + textLength * 5.5;
  return Math.ceil(Math.min(EXTERNAL_ENDPOINT_MAX_WIDTH, Math.max(EXTERNAL_ENDPOINT_MIN_WIDTH, estimated)));
}

export function createExternalEndpointData(
  label = EXTERNAL_ENDPOINT_DEFAULT_LABEL,
): DeviceData {
  return {
    label,
    model: EXTERNAL_ENDPOINT_DEFAULT_LABEL,
    deviceType: EXTERNAL_ENDPOINT_DEVICE_TYPE,
    ports: [createExternalEndpointPort()],
    auxiliaryData: [],
  };
}

function expectedExternalEndpointHandleId(
  portId: string,
  direction: PortDirection,
  edgeEnd: "source" | "target",
): string {
  if (direction === "bidirectional") return `${portId}-${edgeEnd === "source" ? "out" : "in"}`;
  if (direction === "passthrough" && edgeEnd === "source") return `${portId}-front`;
  return portId;
}

/**
 * Repairs legacy external-endpoint connections after a port direction has changed.
 * The existing edge orientation is preserved; only the endpoint's declared direction
 * and the corresponding React Flow handle suffix are reconciled.
 */
export function reconcileExternalEndpointConnections(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
): { nodes: SchematicNode[]; edges: ConnectionEdge[]; changed: boolean } {
  const endpointDirections = new Map<string, PortDirection>();

  for (const node of nodes) {
    if (node.type !== "device" || !isExternalEndpointData(node.data) || node.data.ports.length !== 1) continue;

    const port = node.data.ports[0];
    const hasSourceConnection = edges.some((edge) => edge.source === node.id);
    const hasTargetConnection = edges.some((edge) => edge.target === node.id);
    let direction = port.direction;

    if (hasSourceConnection && hasTargetConnection) direction = "bidirectional";
    else if (hasSourceConnection && direction === "input") direction = "output";
    else if (hasTargetConnection && (direction === "output" || direction === "passthrough")) direction = "input";

    endpointDirections.set(node.id, direction);
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.type !== "device") return node;
    const direction = endpointDirections.get(node.id);
    if (!direction || !isExternalEndpointData(node.data) || node.data.ports[0]?.direction === direction) return node;

    changed = true;
    const port = node.data.ports[0];
    return {
      ...node,
      data: {
        ...node.data,
        ports: [{ ...port, direction }],
      },
    } as DeviceNode;
  });

  const nextEdges = edges.map((edge) => {
    const sourceDirection = endpointDirections.get(edge.source);
    const targetDirection = endpointDirections.get(edge.target);
    const sourceNode = sourceDirection ? nextNodes.find((node) => node.id === edge.source) : undefined;
    const targetNode = targetDirection ? nextNodes.find((node) => node.id === edge.target) : undefined;
    const sourcePortId = sourceNode?.type === "device" ? sourceNode.data.ports[0]?.id : undefined;
    const targetPortId = targetNode?.type === "device" ? targetNode.data.ports[0]?.id : undefined;
    const sourceHandle = sourceDirection && sourcePortId
      ? expectedExternalEndpointHandleId(sourcePortId, sourceDirection, "source")
      : edge.sourceHandle;
    const targetHandle = targetDirection && targetPortId
      ? expectedExternalEndpointHandleId(targetPortId, targetDirection, "target")
      : edge.targetHandle;

    if (sourceHandle === edge.sourceHandle && targetHandle === edge.targetHandle) return edge;
    changed = true;
    return { ...edge, sourceHandle, targetHandle };
  });

  return { nodes: nextNodes, edges: nextEdges, changed };
}

export const EXTERNAL_ENDPOINT_TEMPLATE: DeviceTemplate = {
  deviceType: EXTERNAL_ENDPOINT_DEVICE_TYPE,
  label: EXTERNAL_ENDPOINT_DEFAULT_LABEL,
  category: "Infrastructure",
  ports: [createExternalEndpointPort()],
  auxiliaryData: [],
  searchTerms: [
    "external endpoint",
    "off page connector",
    "off page endpoint",
    "stub endpoint",
    "network handoff",
  ],
};
