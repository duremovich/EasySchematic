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

/** Segments for an edge using its own endpoints, following a stub-split partner leg
 *  to the real target when linkedConnectionId is set. Convenience for UI/PDF callers;
 *  cableSchedule builds endpoints from its already-reconciled rows instead. */
export function segmentsForEdge(
  edge: ConnectionEdge,
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  baseCableId: string,
): PatchSegmentInfo[] {
  const partner = edge.data?.linkedConnectionId
    ? edges.find((p) => p.id !== edge.id && p.data?.linkedConnectionId === edge.data?.linkedConnectionId)
    : undefined;
  const tgtEdge = partner ?? edge;
  return getPatchSegments(
    edge, nodes, baseCableId,
    devicePoint(nodes, edge.source, edge.sourceHandle),
    devicePoint(nodes, tgtEdge.target, tgtEdge.targetHandle),
  );
}

export interface PortFaceDisplay {
  /** Segment (or wired-cable) label shown on the chip / strip. */
  cableLabel: string;
  /** Far-end device/panel name. */
  farLabel: string;
  farPortLabel: string;
  /** Segment index for hop faces (enables label override editing); undefined for wired faces. */
  segIndex?: number;
  overridden?: boolean;
}

export interface PortDisplay {
  kind: "hop" | "wired";
  /** The hop edge, or the first wired edge, occupying this port. */
  edgeId: string;
  signalType?: string;
  /** Arriving / field side. */
  rear?: PortFaceDisplay;
  /** Departing / patch side. */
  front?: PortFaceDisplay;
}

/** Resolve what to show for one panel port — hop-routed segments or physically wired
 *  remotes. Shared by the Patch Panels page renderer and the strips PDF so screen and
 *  paper never disagree. Returns null for spare ports. */
export function resolvePortDisplay(
  panelNodeId: string,
  portId: string,
  occ: Map<string, Map<string, PortOccupant>>,
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  cableIdFor: (edge: ConnectionEdge) => string,
): PortDisplay | null {
  const occupant = occ.get(panelNodeId)?.get(portId);
  if (!occupant) return null;

  if (occupant.kind === "hop") {
    const edge = edges.find((e) => e.id === occupant.edgeId);
    if (!edge) return null;
    const segs = segmentsForEdge(edge, nodes, edges, cableIdFor(edge));
    const inn = segs[occupant.hopIndex];
    const outSeg = segs[occupant.hopIndex + 1];
    if (!inn || !outSeg) return null;
    return {
      kind: "hop",
      edgeId: edge.id,
      signalType: edge.data?.signalType as string | undefined,
      rear: {
        cableLabel: inn.label, farLabel: inn.from.label, farPortLabel: inn.from.portLabel,
        segIndex: inn.index, overridden: inn.overridden,
      },
      front: {
        cableLabel: outSeg.label, farLabel: outSeg.to.label, farPortLabel: outSeg.to.portLabel,
        segIndex: outSeg.index, overridden: outSeg.overridden,
      },
    };
  }

  const wiredFace = (edgeId: string | undefined): PortFaceDisplay | undefined => {
    if (!edgeId) return undefined;
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return undefined;
    const isSource = edge.source === panelNodeId;
    const p = devicePoint(nodes, isSource ? edge.target : edge.source, isSource ? edge.targetHandle : edge.sourceHandle);
    return { cableLabel: cableIdFor(edge), farLabel: p.label, farPortLabel: p.portLabel };
  };
  const rear = wiredFace(occupant.rearEdgeId);
  const front = wiredFace(occupant.frontEdgeId);
  const firstEdgeId = occupant.rearEdgeId ?? occupant.frontEdgeId ?? "";
  const firstEdge = edges.find((e) => e.id === firstEdgeId);
  return {
    kind: "wired",
    edgeId: firstEdgeId,
    signalType: firstEdge?.data?.signalType as string | undefined,
    rear,
    front,
  };
}
