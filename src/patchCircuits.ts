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
  ConnectorType,
} from "./types";
import { resolvePort, resolvePortLabel, getRoomLabel } from "./packList";
import { transformLabelNow } from "./labelCaseUtils";
import { areConnectorsCompatible } from "./connectorTypes";

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
    port: resolvePort(node, handleId),
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
  const rawHops = edge.data?.patchHops ?? [];
  const hops = resolvableHops(edge, nodes);
  // Overrides are stored against the ORIGINAL segment indices. If read-time filtering
  // dropped a stale hop, positional indexing would bind every later override to the
  // wrong physical run — safer to ignore them all (matches stripDeadHops policy).
  const overrides = hops.length === rawHops.length ? (edge.data?.patchSegments ?? []) : [];

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

export interface HopConnectorMismatch {
  /** Which face of the new panel port doesn't mate. */
  face: "rear" | "front";
  panelConnector: ConnectorType;
  otherConnector: ConnectorType;
  /** "Device Label Port" on the other end of the offending segment. */
  otherLabel: string;
}

/**
 * Whether a hop can physically land on a panel port, checked at the CONNECTOR level only.
 * A patch panel is signal-agnostic conduit — AES3 through an analog XLR panel is a real
 * thing people do — but BNC does not fit an RJ45 jack no matter the signal.
 *
 * Hops append to the end of the path, so the new panel's REAR face takes over arrival
 * from the previous point and its FRONT face feeds the remaining run to the target.
 * Returns null when compatible, or when either side's connector is unknown
 * (`areConnectorsCompatible` treats missing info as "no mismatch").
 */
export function checkHopConnectors(
  edge: ConnectionEdge,
  nodes: SchematicNode[],
  hop: PatchHop,
  srcPoint: PatchPointInfo,
  tgtPoint: PatchPointInfo,
): HopConnectorMismatch | null {
  const newRear = panelPoint(nodes, hop, "rear");
  const newFront = panelPoint(nodes, hop, "front");
  if (!newRear || !newFront) return null;

  const hops = resolvableHops(edge, nodes);
  const prev = hops.length === 0
    ? srcPoint
    : panelPoint(nodes, hops[hops.length - 1], "front") ?? srcPoint;

  const checks = [
    { face: "rear" as const, panel: newRear, other: prev },
    { face: "front" as const, panel: newFront, other: tgtPoint },
  ];
  for (const c of checks) {
    const panelConnector = c.panel.port?.connectorType;
    const otherConnector = c.other.port?.connectorType;
    if (panelConnector && otherConnector && !areConnectorsCompatible(panelConnector, otherConnector)) {
      return {
        face: c.face,
        panelConnector,
        otherConnector,
        otherLabel: `${c.other.label} ${c.other.portLabel}`.trim(),
      };
    }
  }
  return null;
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
    // Iterate the FILTERED hop list so hopIndex lines up with getPatchSegments output
    // (which is also built from resolvableHops) even when a stale hop was dropped.
    resolvableHops(e, nodes).forEach((h, i) => {
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
