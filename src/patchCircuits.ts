/**
 * Derived logic for patched connections (edge.data.patchHops).
 *
 * A "patched" connection is one canvas edge A→B whose physical path passes through
 * N patch-panel ports. This module derives the N+1 physical segments and per-panel
 * port occupancy. Pure functions — no store access.
 */
import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
  Port,
  PatchHop,
} from "./types";
import { resolvePortLabel, getRoomLabel } from "./packList";
import { transformLabelNow } from "./labelCaseUtils";

export interface PatchPointInfo {
  kind: "device" | "panel";
  nodeId: string;
  /** Display label of the device/panel at this point. */
  label: string;
  portLabel: string;
  /** Resolved Port object when available (used for connector-pair cable typing). */
  port?: Port;
  /** Room label ("Unknown" when unparented / off-canvas). */
  room: string;
}

export interface PatchSegmentInfo {
  index: number;
  /** "A", "B", … — "" when the connection has no hops. */
  suffix: string;
  /** `${baseCableId}-${suffix}`, or baseCableId when unpatched. */
  autoLabel: string;
  /** Override (patchSegments[index].label) if set, else autoLabel. */
  label: string;
  overridden: boolean;
  from: PatchPointInfo;
  to: PatchPointInfo;
  /** Per-segment length override, "" when unset. */
  cableLength: string;
}

const SUFFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function stripFaceSuffix(handleId: string | null | undefined): string {
  return (handleId ?? "").replace(/-(in|out|rear|front)$/, "");
}

/** Find the Port object for an edge endpoint handle on a device node. */
function portForHandle(node: SchematicNode | undefined, handleId: string | null | undefined): Port | undefined {
  if (!node || node.type !== "device") return undefined;
  const baseId = stripFaceSuffix(handleId);
  return (node.data as DeviceData).ports.find((p) => p.id === baseId);
}

/** Build a PatchPointInfo for a real device endpoint of an edge. */
export function devicePoint(
  nodes: SchematicNode[],
  nodeId: string,
  handleId: string | null | undefined,
): PatchPointInfo {
  const node = nodes.find((n) => n.id === nodeId);
  const label = node?.type === "device"
    ? transformLabelNow((node.data as DeviceData).label || "Unnamed")
    : "Unknown";
  return {
    kind: "device",
    nodeId,
    label,
    portLabel: node ? resolvePortLabel(node, handleId) : "",
    port: portForHandle(node, handleId),
    room: node ? getRoomLabel(nodes, node.parentId) : "Unknown",
  };
}

/** Panel-side point. `face` picks the connector reported for cable typing:
 *  a segment ARRIVING at a panel lands on the rear (field) face; a segment
 *  LEAVING a panel departs from the front (patch) face. */
function panelPoint(
  nodes: SchematicNode[],
  hop: PatchHop,
  face: "rear" | "front",
): PatchPointInfo | null {
  const node = nodes.find((n) => n.id === hop.panelNodeId);
  if (!node || node.type !== "device") return null;
  const data = node.data as DeviceData;
  const port = data.ports.find((p) => p.id === hop.portId);
  if (!port) return null;
  const faced: Port = {
    ...port,
    connectorType: (face === "rear" ? port.rearConnectorType : port.frontConnectorType) ?? port.connectorType,
    gender: (face === "rear" ? port.rearGender : port.frontGender) ?? port.gender,
  };
  return {
    kind: "panel",
    nodeId: node.id,
    label: transformLabelNow(data.label || "Unnamed Panel"),
    portLabel: transformLabelNow(port.label || port.id),
    port: faced,
    room: getRoomLabel(nodes, node.parentId),
  };
}

/** Hops whose panel node + port still resolve. Stale hops (panel deleted while the file
 *  was edited elsewhere) are dropped defensively rather than crashing schedules. */
export function resolvableHops(edge: ConnectionEdge, nodes: SchematicNode[]): PatchHop[] {
  const hops = edge.data?.patchHops ?? [];
  if (hops.length === 0) return hops;
  return hops.filter((h) => panelPoint(nodes, h, "rear") !== null);
}

/**
 * Derive the physical segments of a connection.
 * `srcPoint`/`tgtPoint` are the OUTER endpoints, prebuilt by the caller — this keeps
 * stub-split reconciliation (linkedConnectionId partner-following) in one place
 * (cableSchedule) instead of duplicating it here.
 */
export function getPatchSegments(
  edge: ConnectionEdge,
  nodes: SchematicNode[],
  baseCableId: string,
  srcPoint: PatchPointInfo,
  tgtPoint: PatchPointInfo,
): PatchSegmentInfo[] {
  const hops = resolvableHops(edge, nodes);
  const overrides = edge.data?.patchSegments ?? [];

  if (hops.length === 0) {
    return [{
      index: 0, suffix: "", autoLabel: baseCableId, label: baseCableId,
      overridden: false, from: srcPoint, to: tgtPoint, cableLength: "",
    }];
  }

  const segs: PatchSegmentInfo[] = [];
  const segCount = hops.length + 1;
  for (let i = 0; i < segCount; i++) {
    const from = i === 0 ? srcPoint : panelPoint(nodes, hops[i - 1], "front")!;
    const to = i === segCount - 1 ? tgtPoint : panelPoint(nodes, hops[i], "rear")!;
    const suffix = SUFFIXES[i] ?? `Z${i}`;
    const autoLabel = `${baseCableId}-${suffix}`;
    const ov = overrides[i];
    segs.push({
      index: i,
      suffix,
      autoLabel,
      label: ov?.label?.trim() || autoLabel,
      overridden: !!ov?.label?.trim(),
      from,
      to,
      cableLength: ov?.cableLength ?? "",
    });
  }
  return segs;
}

export type PortOccupant =
  | { kind: "hop"; edgeId: string; hopIndex: number }
  | { kind: "wired"; rearEdgeId?: string; frontEdgeId?: string };

/**
 * Port occupancy per panel: merges metadata hops AND physically wired edges
 * (panel on canvas with edges on `${portId}-rear` / `${portId}-front` handles).
 * A port is available for a new hop only when it has NO occupant of either kind.
 */
export function getPanelOccupancy(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
): Map<string, Map<string, PortOccupant>> {
  const occ = new Map<string, Map<string, PortOccupant>>();
  const panelIds = new Set(
    nodes
      .filter((n) => n.type === "device" && (n.data as DeviceData).deviceType === "patch-panel")
      .map((n) => n.id),
  );
  const put = (panelId: string, portId: string, o: PortOccupant) => {
    let m = occ.get(panelId);
    if (!m) { m = new Map(); occ.set(panelId, m); }
    m.set(portId, o);
  };

  // Wired edges first (hop assignment is blocked on wired ports, so hops never collide).
  for (const e of edges) {
    for (const side of ["source", "target"] as const) {
      const nodeId = side === "source" ? e.source : e.target;
      const handle = side === "source" ? e.sourceHandle : e.targetHandle;
      if (!panelIds.has(nodeId) || !handle) continue;
      const m = /^(.*)-(rear|front)$/.exec(handle);
      if (!m) continue;
      const [, portId, face] = m;
      const existing = occ.get(nodeId)?.get(portId);
      const wired: PortOccupant = existing?.kind === "wired" ? { ...existing } : { kind: "wired" };
      if (face === "rear") wired.rearEdgeId = e.id; else wired.frontEdgeId = e.id;
      put(nodeId, portId, wired);
    }
  }
  for (const e of edges) {
    const hops = e.data?.patchHops ?? [];
    hops.forEach((h, i) => {
      if (!panelIds.has(h.panelNodeId)) return;
      if (occ.get(h.panelNodeId)?.get(h.portId)) return; // wired wins (shouldn't co-occur)
      put(h.panelNodeId, h.portId, { kind: "hop", edgeId: e.id, hopIndex: i });
    });
  }
  return occ;
}

export function isPortAvailable(
  occ: Map<string, Map<string, PortOccupant>>,
  panelNodeId: string,
  portId: string,
): boolean {
  return !occ.get(panelNodeId)?.get(portId);
}
