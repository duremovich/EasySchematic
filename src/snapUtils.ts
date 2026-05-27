import type { ConnectionEdge, DeviceData, SchematicNode } from "./types";
import { portSide } from "./types";

import { GRID_SIZE } from "./gridConstants";
import { totalAuxHeight, headerBandHeight, HEADER_LABEL_ZONE_PX, HEADER_LABEL_ZONE_2_PX } from "./auxiliaryData";
import { resolveDeviceLabel } from "./displayName";
import { STUB_GAP as STUB_PORT_GAP, STUB_W_EST, STUB_H_EST } from "./stubPlacement";
import {
  EXTERNAL_ENDPOINT_HEIGHT,
  estimateExternalEndpointWidth,
  isExternalEndpointData,
  snapExternalEndpointY,
} from "./externalEndpoint";

// Must be >= half the grid size so alignment snapping works with grid-snapped positions.
// React Flow's snapToGrid moves nodes in GRID_SIZE increments, so we need to catch
// candidates within one grid step.
const SNAP_THRESHOLD = GRID_SIZE;

// Proximity gating for the alignment engine. In a sparse canvas, two devices on
// opposite sides of the screen still snap (they fit inside MAX_SNAP_DISTANCE).
// In a crowded one, only the K nearest neighbors are considered, killing the
// noise of far-away edges accidentally lining up.
const MAX_SNAP_DISTANCE = 800;
const NEAREST_K_DEVICE = 8;
const NEAREST_K_STUB = 12;

export interface DisplayDefaults {
  useShortNames: boolean;
  wrapDeviceLabels: boolean;
}
const DEFAULT_DISPLAY: DisplayDefaults = { useShortNames: false, wrapDeviceLabels: false };

export interface GuideLine {
  orientation: "h" | "v";
  pos: number; // x for vertical lines, y for horizontal lines (absolute flow-space)
  from: number; // start of the line (in the cross-axis)
  to: number; // end of the line
}

export interface SnapResult {
  x: number; // snapped position (same coordinate space as input)
  y: number;
  guides: GuideLine[]; // in absolute flow-space
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

function estimateDeviceHeight(node: SchematicNode): number {
  const data = node.data as DeviceData;
  if (node.type === "device" && isExternalEndpointData(data) && (data.ports?.length ?? 0) <= 1) {
    return EXTERNAL_ENDPOINT_HEIGHT;
  }
  const ports = data.ports ?? [];
  const left = ports.filter((p) => p.direction !== "bidirectional" && (p.direction === "input" ? !p.flipped : !!p.flipped)).length;
  const right = ports.filter((p) => p.direction !== "bidirectional" && (p.direction === "output" ? !p.flipped : !!p.flipped)).length;
  const bidirs = ports.filter((p) => p.direction === "bidirectional").length;
  const portRows = Math.max(left, right) + bidirs;
  // Base: 1px top border + 40px header band (min) + 1px header border-b
  //     + 8px port-area pt + rows×20 + 9px port-area pb + 1px bottom border
  //     = 60 + rows×20.
  // totalAuxHeight adds (a) header band surplus above the 40-px baseline and (b) footer block height.
  // Per-instance wrapLabel override is honored here; schematic-wide default is not threaded — React Flow's
  // measured height supersedes this estimate after the first render.
  const labelZone = data.wrapLabel ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  return 60 + portRows * 20 + totalAuxHeight(data.auxiliaryData, labelZone);
}

function isDrawBoxNode(node: SchematicNode): boolean {
  if (node.type !== "annotation") return false;
  const data = node.data as { role?: string; shape?: string; borderStyle?: string };
  return data.role === "draw-box" || (data.shape === "rectangle" && data.borderStyle === "dashed");
}

function nodeRect(node: SchematicNode): Rect {
  const isExternalEndpoint = node.type === "device" && isExternalEndpointData(node.data as DeviceData);
  const w = node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? (node.type === "room" ? 400 : isExternalEndpoint ? estimateExternalEndpointWidth((node.data as DeviceData).label, (node.data as DeviceData).ports?.[0]?.direction) : 180);
  const h = node.measured?.height ?? (node.height as number) ?? (node.style?.height as number) ?? (node.type === "room" ? 300 : estimateDeviceHeight(node));
  return {
    left: node.position.x,
    right: node.position.x + w,
    top: node.position.y,
    bottom: node.position.y + h,
    centerX: node.position.x + w / 2,
    centerY: node.position.y + h / 2,
  };
}

/** Absolute canvas offset contributed by a node's parent chain ({0,0} if top-level).
 *  Walks the full chain so nested parents (e.g. rack-in-room) compose correctly. */
function parentOffsetFromMap(
  node: SchematicNode,
  nodeMap: Map<string, SchematicNode>,
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    dx += parent.position.x;
    dy += parent.position.y;
    parentId = parent.parentId;
  }
  return { dx, dy };
}

/** Walk full parent chain to compute absolute world position. */
function absoluteNodePos(
  node: SchematicNode,
  nodeMap: Map<string, SchematicNode>,
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

/** Node rect in absolute world coords. Single allocation per call (parent
 *  chain walk inlined; intermediate nodeRect/absoluteNodePos avoided). */
function absRect(node: SchematicNode, nodeMap: Map<string, SchematicNode>): Rect {
  const isExternalEndpoint = node.type === "device" && isExternalEndpointData(node.data as DeviceData);
  const w = node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? (node.type === "room" ? 400 : isExternalEndpoint ? estimateExternalEndpointWidth((node.data as DeviceData).label, (node.data as DeviceData).ports?.[0]?.direction) : 180);
  const h = node.measured?.height ?? (node.height as number) ?? (node.style?.height as number) ?? (node.type === "room" ? 300 : estimateDeviceHeight(node));
  let nx = node.position.x;
  let ny = node.position.y;
  let pid = node.parentId;
  while (pid) {
    const p = nodeMap.get(pid);
    if (!p) break;
    nx += p.position.x;
    ny += p.position.y;
    pid = p.parentId;
  }
  return {
    left: nx,
    right: nx + w,
    top: ny,
    bottom: ny + h,
    centerX: nx + w / 2,
    centerY: ny + h / 2,
  };
}

/** Bbox-to-bbox squared distance. 0 if rects overlap. We compare distances to
 *  squared thresholds, which avoids one Math.hypot per candidate. */
function bboxDistSq(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return dx * dx + dy * dy;
}

/** In-place insertion into a top-K buffer sorted ascending by dist. K is small
 *  (≤ ~12), so linear bubble-up is fine and avoids any transient allocations
 *  (no splice, no sort, no slice). */
function insertTopK(rects: Rect[], dists: number[], k: number, r: Rect, d: number): void {
  const len = dists.length;
  let i: number;
  if (len < k) {
    rects.push(r);
    dists.push(d);
    i = len;
  } else {
    if (d >= dists[k - 1]) return;
    rects[k - 1] = r;
    dists[k - 1] = d;
    i = k - 1;
  }
  while (i > 0 && dists[i - 1] > dists[i]) {
    const tr = rects[i]; rects[i] = rects[i - 1]; rects[i - 1] = tr;
    const td = dists[i]; dists[i] = dists[i - 1]; dists[i - 1] = td;
    i--;
  }
}

/** Same as insertTopK, but also tracks the source node alongside each rect.
 *  Used by the stub-snap path which needs to enumerate ports of survivors. */
function insertTopKWithNode(
  nodes: SchematicNode[],
  rects: Rect[],
  dists: number[],
  k: number,
  n: SchematicNode,
  r: Rect,
  d: number,
): void {
  const len = dists.length;
  let i: number;
  if (len < k) {
    nodes.push(n);
    rects.push(r);
    dists.push(d);
    i = len;
  } else {
    if (d >= dists[k - 1]) return;
    nodes[k - 1] = n;
    rects[k - 1] = r;
    dists[k - 1] = d;
    i = k - 1;
  }
  while (i > 0 && dists[i - 1] > dists[i]) {
    const tn = nodes[i]; nodes[i] = nodes[i - 1]; nodes[i - 1] = tn;
    const tr = rects[i]; rects[i] = rects[i - 1]; rects[i - 1] = tr;
    const td = dists[i]; dists[i] = dists[i - 1]; dists[i - 1] = td;
    i--;
  }
}

export interface PortPosition {
  /** Full React Flow handle id (e.g. "p1", "p1-in", "p1-rear"). */
  handleId: string;
  /** Base port id (the `id` field on the Port object). */
  portId: string;
  side: "left" | "right";
  /** Absolute world-space X (the device edge the port lives on). */
  absX: number;
  /** Absolute world-space Y (vertical center of the port row). */
  absY: number;
}

/**
 * Absolute world-space positions of every connectable handle on a device.
 *
 * Must mirror DeviceNode's render order — otherwise stub labels (which depend
 * on this for their port-Y alignment) land on the wrong row. Render layout:
 *
 *   [header band]
 *   [port area: 9px top pad]
 *     [L/R column block]
 *       - sectioned: independent leftItems / rightItems columns
 *       - non-sectioned: paired rows
 *       - patch panels always prepend "Rear" (left) / "Front" (right) sections
 *     [empty expansion slot rows]
 *     [passthrough block: 1 header row + passthrough items]
 *     [bidirectional block: bidirItems]
 *   [9px bottom pad + footer aux]
 *
 * Every row is 20px (h-5). Bidirectional and passthrough ports expose two
 * handles each (-in/-out, -rear/-front) on opposite sides of the same row.
 */
export function getPortAbsolutePositions(
  device: SchematicNode,
  nodeMap: Map<string, SchematicNode>,
  displayDefaults: DisplayDefaults = DEFAULT_DISPLAY,
): PortPosition[] {
  if (device.type !== "device") return [];
  const dd = device.data as DeviceData;
  const ports = dd.ports ?? [];
  if (isExternalEndpointData(dd) && ports.length === 1) {
    const port = ports[0];
    if (!port) return [];
    const rawDeviceAbs = absoluteNodePos(device, nodeMap);
    const deviceAbs = { x: Math.round(rawDeviceAbs.x), y: Math.round(rawDeviceAbs.y) };
    const deviceW = Math.round(
      (device.measured?.width as number | undefined) ??
      (device.width as number | undefined) ??
      (device.style?.width as number | undefined) ??
      estimateExternalEndpointWidth(dd.label, port.direction),
    );
    const deviceH = Math.round(
      (device.measured?.height as number | undefined) ??
      (device.height as number | undefined) ??
      (device.style?.height as number | undefined) ??
      EXTERNAL_ENDPOINT_HEIGHT,
    );
    const absY = deviceAbs.y + deviceH / 2;
    if (port.direction === "input") {
      return [{ handleId: port.id, portId: port.id, side: "left", absX: deviceAbs.x, absY }];
    }
    if (port.direction === "output") {
      return [{ handleId: port.id, portId: port.id, side: "right", absX: deviceAbs.x + deviceW, absY }];
    }
    if (port.direction === "passthrough") {
      return [
        { handleId: `${port.id}-rear`, portId: port.id, side: "left", absX: deviceAbs.x, absY },
        { handleId: `${port.id}-front`, portId: port.id, side: "right", absX: deviceAbs.x + deviceW, absY },
      ];
    }
    return [
      { handleId: `${port.id}-in`, portId: port.id, side: "left", absX: deviceAbs.x, absY },
      { handleId: `${port.id}-out`, portId: port.id, side: "right", absX: deviceAbs.x + deviceW, absY },
    ];
  }
  const resolved = resolveDeviceLabel(dd, displayDefaults);
  const labelZone = resolved.wrap ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  const headerBand = headerBandHeight(dd.auxiliaryData, labelZone);
  // Round to integer pixels — absoluteNodePos walks the parent chain summing
  // positions, and any sub-pixel ancestor (older saves, room dragged to non-
  // integer Y) propagates through everything emitted here. The downstream edge
  // router rounds independently per handle, so a fractional pixel can land
  // port and stub on adjacent integers and produce a 1-px jog at the endpoint.
  const rawDeviceAbs = absoluteNodePos(device, nodeMap);
  const deviceAbs = { x: Math.round(rawDeviceAbs.x), y: Math.round(rawDeviceAbs.y) };
  const deviceW = Math.round(
    (device.measured?.width as number | undefined) ??
    (device.width as number | undefined) ??
    (device.style?.width as number | undefined) ??
    180,
  );
  const out: PortPosition[] = [];

  // Mirror DeviceNode's port partitioning (without the optional visibility
  // filters — callers that need them can post-filter).
  const leftPorts: typeof ports = [];
  const rightPorts: typeof ports = [];
  const bidirPorts: typeof ports = [];
  const passthroughPorts: typeof ports = [];
  for (const p of ports) {
    if (p.direction === "passthrough") passthroughPorts.push(p);
    else if (p.direction === "bidirectional") bidirPorts.push(p);
    else if (portSide(p) === "left") leftPorts.push(p);
    else rightPorts.push(p);
  }

  const isPatchPanel = dd.deviceType === "patch-panel";

  // Walk a column the way buildColumnItems does, yielding row indices for ports.
  // Returns the column's total row count and a {portId -> row} map.
  const walkColumn = (
    columnPorts: typeof ports,
    prefixSection: boolean,
  ): { rows: Map<string, number>; height: number } => {
    const rowsByPort = new Map<string, number>();
    let row = prefixSection ? 1 : 0;
    let lastSection: string | undefined;
    for (const p of columnPorts) {
      if (p.section && p.section !== lastSection) {
        row++;
        lastSection = p.section;
      }
      rowsByPort.set(p.id, row);
      row++;
    }
    return { rows: rowsByPort, height: row };
  };

  const hasSectionedPorts =
    leftPorts.some((p) => p.section) || rightPorts.some((p) => p.section);
  const hasSections = hasSectionedPorts || (isPatchPanel && (leftPorts.length > 0 || rightPorts.length > 0));

  // L/R port block
  let lrBlockHeight = 0;
  let leftRowByPort: Map<string, number>;
  let rightRowByPort: Map<string, number>;
  if (hasSections) {
    const left = walkColumn(leftPorts, isPatchPanel && leftPorts.length > 0);
    const right = walkColumn(rightPorts, isPatchPanel && rightPorts.length > 0);
    leftRowByPort = left.rows;
    rightRowByPort = right.rows;
    lrBlockHeight = Math.max(left.height, right.height);
  } else {
    // Non-sectioned paired layout — leftPorts[i] and rightPorts[i] share row i.
    leftRowByPort = new Map(leftPorts.map((p, i) => [p.id, i] as const));
    rightRowByPort = new Map(rightPorts.map((p, i) => [p.id, i] as const));
    lrBlockHeight =
      (leftPorts.length === 0 && rightPorts.length === 0)
        ? 0
        : Math.max(leftPorts.length, rightPorts.length, 1);
  }

  // Empty-slot rows render between the L/R block and the passthrough block.
  // Match DeviceNode.tsx: `data.slots.filter((s) => !s.cardTemplateId && !s.hideWhenEmpty)`.
  const emptySlotsCount = (dd.slots ?? []).filter(
    (s) => !s.cardTemplateId && !s.hideWhenEmpty,
  ).length;
  let cursor = lrBlockHeight + emptySlotsCount;

  // Y of a port row's vertical center. Layers from device top:
  //   1px top border + headerBand + 1px header border-b + 8px port-area pt
  // For headerBand a 20-multiple, the row center lands on `device.y + 20k`,
  // i.e. exactly on the 20-px routing grid. (The `pt-8` in DeviceNode.tsx is
  // intentional — it compensates for the header band's `border-b` so ports
  // remain grid-aligned; using `pt-9` would push every row off-grid by 1px.)
  const PORT_AREA_TOP = 1 + headerBand + 1 + 8;
  const rowCenterY = (row: number) => deviceAbs.y + PORT_AREA_TOP + row * 20 + 10;

  // Passthrough block: one "Rear / Front" header row, then passthroughItems.
  if (passthroughPorts.length > 0) {
    cursor += 1; // header row
    let lastSection: string | undefined;
    for (const p of passthroughPorts) {
      if (p.section && p.section !== lastSection) {
        cursor++;
        lastSection = p.section;
      }
      const absY = rowCenterY(cursor);
      out.push({
        handleId: `${p.id}-rear`,
        portId: p.id,
        side: "left",
        absX: deviceAbs.x,
        absY,
      });
      out.push({
        handleId: `${p.id}-front`,
        portId: p.id,
        side: "right",
        absX: deviceAbs.x + deviceW,
        absY,
      });
      cursor++;
    }
  }

  // Bidirectional block
  if (bidirPorts.length > 0) {
    let lastSection: string | undefined;
    for (const p of bidirPorts) {
      if (p.section && p.section !== lastSection) {
        cursor++;
        lastSection = p.section;
      }
      const absY = rowCenterY(cursor);
      out.push({
        handleId: `${p.id}-in`,
        portId: p.id,
        side: "left",
        absX: deviceAbs.x,
        absY,
      });
      out.push({
        handleId: `${p.id}-out`,
        portId: p.id,
        side: "right",
        absX: deviceAbs.x + deviceW,
        absY,
      });
      cursor++;
    }
  }

  // L/R single-handle ports — emit after computing layout for the L/R block,
  // since their rows live in the maps built above.
  for (const p of leftPorts) {
    const row = leftRowByPort.get(p.id);
    if (row === undefined) continue;
    const absY = rowCenterY(row);
    out.push({
      handleId: p.id,
      portId: p.id,
      side: "left",
      absX: deviceAbs.x,
      absY,
    });
  }
  for (const p of rightPorts) {
    const row = rightRowByPort.get(p.id);
    if (row === undefined) continue;
    const absY = rowCenterY(row);
    out.push({
      handleId: p.id,
      portId: p.id,
      side: "right",
      absX: deviceAbs.x + deviceW,
      absY,
    });
  }

  return out;
}

type CandidateKind = "edge" | "center" | "port" | "connected-port" | "stub";

interface AxisCandidate {
  /** How much to shift dragged.position to land on this alignment. */
  delta: number;
  /** Absolute world coord where the visual guide line should be drawn. */
  guideAbsPos: number;
  /** Absolute rect of the anchor (used to compute the guide line's cross-axis extent). */
  anchorAbsRect: Rect;
  kind: CandidateKind;
}

/**
 * Pick the best candidate within SNAP_THRESHOLD. Among candidates within
 * threshold, a connected port wins over any nearby port, and any port wins
 * over edge/center/stub alignment.
 */
function pickBest(candidates: AxisCandidate[]): AxisCandidate | null {
  const priority = (kind: CandidateKind) => {
    if (kind === "connected-port") return 2;
    if (kind === "port") return 1;
    return 0;
  };
  let best: AxisCandidate | null = null;
  for (const c of candidates) {
    if (Math.abs(c.delta) > SNAP_THRESHOLD) continue;
    if (!best) {
      best = c;
      continue;
    }
    if (priority(c.kind) > priority(best.kind)) {
      best = c;
    } else if (priority(c.kind) < priority(best.kind)) {
      // keep best
    } else if (Math.abs(c.delta) < Math.abs(best.delta)) {
      best = c;
    }
  }
  return best;
}

// Squared form of MAX_SNAP_DISTANCE so we can compare against bboxDistSq
// without a sqrt in the hot loop.
const MAX_SNAP_DISTANCE_SQ = MAX_SNAP_DISTANCE * MAX_SNAP_DISTANCE;

export function computeSnap(
  draggedNode: SchematicNode,
  allNodes: SchematicNode[],
  displayDefaults: DisplayDefaults = DEFAULT_DISPLAY,
  edges: readonly ConnectionEdge[] = [],
): SnapResult {
  // Build nodeMap with a for-loop (skips the intermediate tuple array that
  // `new Map(allNodes.map(...))` would allocate).
  const nodeMap = new Map<string, SchematicNode>();
  for (const n of allNodes) nodeMap.set(n.id, n);

  if (draggedNode.type === "stub-label") {
    return computeStubSnap(draggedNode, allNodes, nodeMap, displayDefaults);
  }

  // Generic path: rooms snap to other rooms; devices snap to cross-room peers
  // (proximity-gated) plus their own parent room's edges.
  const draggedAbs = absRect(draggedNode, nodeMap);
  const dw = draggedAbs.right - draggedAbs.left;
  const dh = draggedAbs.bottom - draggedAbs.top;
  const isDraggedRoom = draggedNode.type === "room";
  const isExternalEndpoint = draggedNode.type === "device" && isExternalEndpointData(draggedNode.data as DeviceData);
  const draggedParentId = draggedNode.parentId;

  // Single pass: filter, compute absRect for survivors, run top-K via in-place
  // bubble-insert. No transient {node, rect} or {c, dist} wrappers.
  const topRects: Rect[] = [];
  const topDistsSq: number[] = [];
  const nearbyDevices: SchematicNode[] = [];
  const nearbyDeviceRects: Rect[] = [];
  const nearbyDeviceDistsSq: number[] = [];

  for (const n of allNodes) {
    if (n.id === draggedNode.id) continue;
    if (isDraggedRoom) {
      if (n.type !== "room") continue;
    } else if (n.type === "room") {
      // Child devices only align to their own parent room; top-level devices
      // see every room (placement-time alignment).
      if (draggedParentId && n.id !== draggedParentId) continue;
    } else if (n.type === "stub-label" || n.type === "waypoint") {
      // Stubs sit at sub-grid Y by design (centered on a port row); waypoints
      // are router-positioned. Aligning a device to either pulls the device
      // off the 20px grid, and snapNodesToGrid then yanks it back on the next
      // reload — looking like the device "jumped."
      continue;
    }
    // else: device or other top-level type — cross-room alignment allowed.

    const r = absRect(n, nodeMap);
    const dSq = bboxDistSq(draggedAbs, r);
    if (dSq > MAX_SNAP_DISTANCE_SQ) continue;
    if (isExternalEndpoint && n.type === "device") {
      insertTopKWithNode(nearbyDevices, nearbyDeviceRects, nearbyDeviceDistsSq, NEAREST_K_STUB, n, r, dSq);
    }
    insertTopK(topRects, topDistsSq, NEAREST_K_DEVICE, r, dSq);
  }

  const xCands: AxisCandidate[] = [];
  const yCands: AxisCandidate[] = [];
  for (let i = 0; i < topRects.length; i++) {
    pushBoxCandidates(xCands, yCands, draggedAbs, topRects[i], "edge", "center");
  }

  if (isExternalEndpoint) {
    const connectedHandles = new Map<string, Set<string>>();
    for (const edge of edges) {
      let nodeId: string | undefined;
      let handleId: string | null | undefined;
      if (edge.source === draggedNode.id) {
        nodeId = edge.target;
        handleId = edge.targetHandle;
      } else if (edge.target === draggedNode.id) {
        nodeId = edge.source;
        handleId = edge.sourceHandle;
      }
      if (!nodeId || !handleId) continue;
      let handles = connectedHandles.get(nodeId);
      if (!handles) {
        handles = new Set<string>();
        connectedHandles.set(nodeId, handles);
      }
      handles.add(handleId);
    }

    for (const [nodeId, exactHandles] of connectedHandles) {
      const device = nodeMap.get(nodeId);
      if (!device || device.type !== "device") continue;
      const rect = absRect(device, nodeMap);
      for (const port of getPortAbsolutePositions(device, nodeMap, displayDefaults)) {
        if (!exactHandles.has(port.handleId)) continue;
        yCands.push({
          delta: port.absY - draggedAbs.centerY,
          guideAbsPos: port.absY,
          anchorAbsRect: rect,
          kind: "connected-port",
        });
      }
    }

    for (let i = 0; i < nearbyDevices.length; i++) {
      const device = nearbyDevices[i];
      const rect = nearbyDeviceRects[i];
      for (const port of getPortAbsolutePositions(device, nodeMap, displayDefaults)) {
        yCands.push({
          delta: port.absY - draggedAbs.centerY,
          guideAbsPos: port.absY,
          anchorAbsRect: rect,
          kind: "port",
        });
      }
    }
  }

  const bestY = isExternalEndpoint ? pickBest(yCands) : null;
  const result = finalizeSnap(draggedNode, draggedAbs, dw, dh, xCands, yCands, nodeMap);
  if (isExternalEndpoint && bestY?.kind !== "port" && bestY?.kind !== "connected-port") {
    const dragOff = parentOffsetFromMap(draggedNode, nodeMap);
    return {
      ...result,
      y: snapExternalEndpointY(result.y + dragOff.dy) - dragOff.dy,
    };
  }
  return result;
}

/** Push the 5 X-axis + 5 Y-axis edge/center alignment candidates for one
 *  target rect against the dragged rect. Inlining this kept the hot loop
 *  in computeSnap manageable. */
function pushBoxCandidates(
  xCands: AxisCandidate[],
  yCands: AxisCandidate[],
  draggedAbs: Rect,
  r: Rect,
  edgeKind: CandidateKind,
  centerKind: CandidateKind,
): void {
  xCands.push({ delta: r.left - draggedAbs.left, guideAbsPos: r.left, anchorAbsRect: r, kind: edgeKind });
  xCands.push({ delta: r.right - draggedAbs.right, guideAbsPos: r.right, anchorAbsRect: r, kind: edgeKind });
  xCands.push({ delta: r.centerX - draggedAbs.centerX, guideAbsPos: r.centerX, anchorAbsRect: r, kind: centerKind });
  xCands.push({ delta: r.right - draggedAbs.left, guideAbsPos: r.right, anchorAbsRect: r, kind: edgeKind });
  xCands.push({ delta: r.left - draggedAbs.right, guideAbsPos: r.left, anchorAbsRect: r, kind: edgeKind });
  yCands.push({ delta: r.top - draggedAbs.top, guideAbsPos: r.top, anchorAbsRect: r, kind: edgeKind });
  yCands.push({ delta: r.bottom - draggedAbs.bottom, guideAbsPos: r.bottom, anchorAbsRect: r, kind: edgeKind });
  yCands.push({ delta: r.centerY - draggedAbs.centerY, guideAbsPos: r.centerY, anchorAbsRect: r, kind: centerKind });
  yCands.push({ delta: r.bottom - draggedAbs.top, guideAbsPos: r.bottom, anchorAbsRect: r, kind: edgeKind });
  yCands.push({ delta: r.top - draggedAbs.bottom, guideAbsPos: r.top, anchorAbsRect: r, kind: edgeKind });
}

/**
 * Stub labels snap to (1) ports of nearby devices (primary), (2) edges/centers of
 * nearby other stubs (so vertical columns of stubs align), (3) center-snapped grid
 * as a fallback. Device-edge alignment is intentionally absent — stubs care about
 * ports, not bounding boxes.
 */
function computeStubSnap(
  stubNode: SchematicNode,
  allNodes: SchematicNode[],
  nodeMap: Map<string, SchematicNode>,
  displayDefaults: DisplayDefaults,
): SnapResult {
  const stubW = (stubNode.measured?.width as number | undefined) ?? STUB_W_EST;
  const stubH = (stubNode.measured?.height as number | undefined) ?? STUB_H_EST;
  const stubAbsXY = absoluteNodePos(stubNode, nodeMap);
  const stubAbs: Rect = {
    left: stubAbsXY.x,
    right: stubAbsXY.x + stubW,
    top: stubAbsXY.y,
    bottom: stubAbsXY.y + stubH,
    centerX: stubAbsXY.x + stubW / 2,
    centerY: stubAbsXY.y + stubH / 2,
  };

  const xCands: AxisCandidate[] = [];
  const yCands: AxisCandidate[] = [];

  // 1. Port targets on nearby devices — single-pass top-K, no wrappers.
  const deviceTopRects: Rect[] = [];
  const deviceTopDistsSq: number[] = [];
  const deviceTopNodes: SchematicNode[] = [];
  for (const n of allNodes) {
    if (n.type !== "device") continue;
    const r = absRect(n, nodeMap);
    const dSq = bboxDistSq(stubAbs, r);
    if (dSq > MAX_SNAP_DISTANCE_SQ) continue;
    // Custom inline insertion that also tracks the underlying node (we need it
    // to enumerate ports for survivors).
    insertTopKWithNode(deviceTopNodes, deviceTopRects, deviceTopDistsSq, NEAREST_K_STUB, n, r, dSq);
  }
  for (let i = 0; i < deviceTopNodes.length; i++) {
    const ports = getPortAbsolutePositions(deviceTopNodes[i], nodeMap, displayDefaults);
    const tRect = deviceTopRects[i];
    for (const p of ports) {
      yCands.push({
        delta: p.absY - stubAbs.centerY,
        guideAbsPos: p.absY,
        anchorAbsRect: tRect,
        kind: "port",
      });
      const targetCenterX =
        p.side === "right"
          ? p.absX + STUB_PORT_GAP + stubW / 2
          : p.absX - STUB_PORT_GAP - stubW / 2;
      xCands.push({
        delta: targetCenterX - stubAbs.centerX,
        guideAbsPos: p.absX,
        anchorAbsRect: tRect,
        kind: "port",
      });
    }
  }

  // 2. Other-stub alignment (column / row of stubs).
  const stubTopRects: Rect[] = [];
  const stubTopDistsSq: number[] = [];
  for (const n of allNodes) {
    if (n.type !== "stub-label" || n.id === stubNode.id) continue;
    const r = absRect(n, nodeMap);
    const dSq = bboxDistSq(stubAbs, r);
    if (dSq > MAX_SNAP_DISTANCE_SQ) continue;
    insertTopK(stubTopRects, stubTopDistsSq, NEAREST_K_STUB, r, dSq);
  }
  for (let i = 0; i < stubTopRects.length; i++) {
    const r = stubTopRects[i];
    xCands.push({ delta: r.left - stubAbs.left, guideAbsPos: r.left, anchorAbsRect: r, kind: "stub" });
    xCands.push({ delta: r.right - stubAbs.right, guideAbsPos: r.right, anchorAbsRect: r, kind: "stub" });
    xCands.push({ delta: r.centerX - stubAbs.centerX, guideAbsPos: r.centerX, anchorAbsRect: r, kind: "stub" });
    yCands.push({ delta: r.top - stubAbs.top, guideAbsPos: r.top, anchorAbsRect: r, kind: "stub" });
    yCands.push({ delta: r.bottom - stubAbs.bottom, guideAbsPos: r.bottom, anchorAbsRect: r, kind: "stub" });
    yCands.push({ delta: r.centerY - stubAbs.centerY, guideAbsPos: r.centerY, anchorAbsRect: r, kind: "stub" });
  }

  // Pick best (port-priority) per axis. If nothing fires, fall back to
  // grid-snapping the stub's CENTER (so the side handle's Y stays on the grid).
  const bestX = pickBest(xCands);
  const bestY = pickBest(yCands);

  const dragOff = parentOffsetFromMap(stubNode, nodeMap);

  let absSnappedLeft: number;
  let absSnappedTop: number;
  if (bestX) {
    absSnappedLeft = stubAbs.left + bestX.delta;
  } else {
    absSnappedLeft = Math.round(stubAbs.centerX / GRID_SIZE) * GRID_SIZE - stubW / 2;
  }
  if (bestY) {
    absSnappedTop = stubAbs.top + bestY.delta;
  } else {
    absSnappedTop = Math.round(stubAbs.centerY / GRID_SIZE) * GRID_SIZE - stubH / 2;
  }

  // Defensive integer pixel rounding: deltas can be sub-pixel if either side
  // came from a DOM measurement. The edge router rounds handle positions
  // independently, so sub-pixel position.y can land port and stub handles on
  // adjacent integers and produce a 1-px jog at the endpoint.
  absSnappedLeft = Math.round(absSnappedLeft);
  absSnappedTop = Math.round(absSnappedTop);

  const snappedAbs: Rect = {
    left: absSnappedLeft,
    right: absSnappedLeft + stubW,
    top: absSnappedTop,
    bottom: absSnappedTop + stubH,
    centerX: absSnappedLeft + stubW / 2,
    centerY: absSnappedTop + stubH / 2,
  };

  const guides = collectGuides(snappedAbs, bestX, bestY, xCands, yCands);

  return {
    x: absSnappedLeft - dragOff.dx,
    y: absSnappedTop - dragOff.dy,
    guides,
  };
}

/** Shared finalization: pick best per axis, build guides, return parent-relative position. */
function finalizeSnap(
  draggedNode: SchematicNode,
  draggedAbs: Rect,
  dw: number,
  dh: number,
  xCands: AxisCandidate[],
  yCands: AxisCandidate[],
  nodeMap: Map<string, SchematicNode>,
): SnapResult {
  const bestX = pickBest(xCands);
  const bestY = pickBest(yCands);

  const dragOff = parentOffsetFromMap(draggedNode, nodeMap);
  const absSnappedLeft = bestX ? draggedAbs.left + bestX.delta : draggedAbs.left;
  const absSnappedTop = bestY ? draggedAbs.top + bestY.delta : draggedAbs.top;

  const snappedAbs: Rect = {
    left: absSnappedLeft,
    right: absSnappedLeft + dw,
    top: absSnappedTop,
    bottom: absSnappedTop + dh,
    centerX: absSnappedLeft + dw / 2,
    centerY: absSnappedTop + dh / 2,
  };

  const guides = collectGuides(snappedAbs, bestX, bestY, xCands, yCands);

  return {
    x: absSnappedLeft - dragOff.dx,
    y: absSnappedTop - dragOff.dy,
    guides,
  };
}

function collectGuides(
  snappedAbs: Rect,
  bestX: AxisCandidate | null,
  bestY: AxisCandidate | null,
  xCands: AxisCandidate[],
  yCands: AxisCandidate[],
): GuideLine[] {
  const guides: GuideLine[] = [];
  if (bestX) {
    const seen = new Set<number>();
    for (const c of xCands) {
      if (Math.abs(c.delta - bestX.delta) > 0.5) continue;
      const key = Math.round(c.guideAbsPos * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      const from = Math.min(c.anchorAbsRect.top, snappedAbs.top);
      const to = Math.max(c.anchorAbsRect.bottom, snappedAbs.bottom);
      guides.push({ orientation: "v", pos: c.guideAbsPos, from, to });
    }
  }
  if (bestY) {
    const seen = new Set<number>();
    for (const c of yCands) {
      if (Math.abs(c.delta - bestY.delta) > 0.5) continue;
      const key = Math.round(c.guideAbsPos * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      const from = Math.min(c.anchorAbsRect.left, snappedAbs.left);
      const to = Math.max(c.anchorAbsRect.right, snappedAbs.right);
      guides.push({ orientation: "h", pos: c.guideAbsPos, from, to });
    }
  }
  return guides;
}

// ---------- Resize snap ----------

export interface ResizeSnapResult {
  x: number;
  y: number;
  width: number;
  height: number;
  guides: GuideLine[];
}

/**
 * Snap a room's edges to other rooms while resizing.
 * `direction` is [dx, dy] from React Flow's NodeResizer — indicates which edges move.
 *   dx: -1 = left edge moving, 0 = neither, 1 = right edge moving
 *   dy: -1 = top edge moving, 0 = neither, 1 = bottom edge moving
 */
export function computeResizeSnap(
  nodeId: string,
  params: { x: number; y: number; width: number; height: number },
  direction: number[],
  allNodes: SchematicNode[],
): ResizeSnapResult {
  const { x, y, width, height } = params;
  const [dx, dy] = direction;

  // Current edges of the resizing room
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;

  const others = allNodes.filter((n) => n.id !== nodeId && n.type === "room");

  let bestLeftDelta: number | null = null;
  let bestRightDelta: number | null = null;
  let bestTopDelta: number | null = null;
  let bestBottomDelta: number | null = null;

  interface EdgeCandidate { delta: number; anchorRect: Rect }

  const leftCandidates: EdgeCandidate[] = [];
  const rightCandidates: EdgeCandidate[] = [];
  const topCandidates: EdgeCandidate[] = [];
  const bottomCandidates: EdgeCandidate[] = [];

  for (const other of others) {
    const r = nodeRect(other);

    if (dx !== 0) {
      // The moving horizontal edge
      const movingX = dx < 0 ? left : right;
      const targets = [r.left, r.right, r.centerX];
      const bucket = dx < 0 ? leftCandidates : rightCandidates;
      for (const t of targets) {
        const delta = t - movingX;
        if (Math.abs(delta) <= SNAP_THRESHOLD) {
          bucket.push({ delta, anchorRect: r });
          const best = dx < 0 ? bestLeftDelta : bestRightDelta;
          if (best === null || Math.abs(delta) < Math.abs(best)) {
            if (dx < 0) bestLeftDelta = delta;
            else bestRightDelta = delta;
          }
        }
      }
    }

    if (dy !== 0) {
      const movingY = dy < 0 ? top : bottom;
      const targets = [r.top, r.bottom, r.centerY];
      const bucket = dy < 0 ? topCandidates : bottomCandidates;
      for (const t of targets) {
        const delta = t - movingY;
        if (Math.abs(delta) <= SNAP_THRESHOLD) {
          bucket.push({ delta, anchorRect: r });
          const best = dy < 0 ? bestTopDelta : bestBottomDelta;
          if (best === null || Math.abs(delta) < Math.abs(best)) {
            if (dy < 0) bestTopDelta = delta;
            else bestBottomDelta = delta;
          }
        }
      }
    }
  }

  // Apply snaps
  let newX = x, newY = y, newW = width, newH = height;

  if (dx < 0 && bestLeftDelta !== null) {
    newX = x + bestLeftDelta;
    newW = width - bestLeftDelta;
  } else if (dx > 0 && bestRightDelta !== null) {
    newW = width + bestRightDelta;
  }

  if (dy < 0 && bestTopDelta !== null) {
    newY = y + bestTopDelta;
    newH = height - bestTopDelta;
  } else if (dy > 0 && bestBottomDelta !== null) {
    newH = height + bestBottomDelta;
  }

  // Build guide lines
  const guides: GuideLine[] = [];
  const snappedLeft = newX;
  const snappedRight = newX + newW;
  const snappedTop = newY;
  const snappedBottom = newY + newH;

  const addXGuides = (candidates: EdgeCandidate[], bestDelta: number, absX: number) => {
    const matching = candidates.filter((c) => Math.abs(c.delta - bestDelta) < 0.5);
    const seen = new Set<number>();
    for (const m of matching) {
      const key = Math.round(absX * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      const from = Math.min(m.anchorRect.top, snappedTop);
      const to = Math.max(m.anchorRect.bottom, snappedBottom);
      guides.push({ orientation: "v", pos: absX, from, to });
    }
  };

  const addYGuides = (candidates: EdgeCandidate[], bestDelta: number, absY: number) => {
    const matching = candidates.filter((c) => Math.abs(c.delta - bestDelta) < 0.5);
    const seen = new Set<number>();
    for (const m of matching) {
      const key = Math.round(absY * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      const from = Math.min(m.anchorRect.left, snappedLeft);
      const to = Math.max(m.anchorRect.right, snappedRight);
      guides.push({ orientation: "h", pos: absY, from, to });
    }
  };

  if (bestLeftDelta !== null) addXGuides(leftCandidates, bestLeftDelta, snappedLeft);
  if (bestRightDelta !== null) addXGuides(rightCandidates, bestRightDelta, snappedRight);
  if (bestTopDelta !== null) addYGuides(topCandidates, bestTopDelta, snappedTop);
  if (bestBottomDelta !== null) addYGuides(bottomCandidates, bestBottomDelta, snappedBottom);

  return { x: newX, y: newY, width: newW, height: newH, guides };
}

// ---------- Minimum spacing enforcement ----------

// Must match pathfinding.ts constants
const STUB = 30;
const PAD = 20;
const ROUTING_GAP = 8; // Buffer so stubs land in the routing channel, not on obstacle boundary
const STUB_GAP = 6; // Must match OffsetEdge STUB_GAP

/** Count ports on the right side (outputs + flipped inputs + bidirectional) */
function rightPortCount(node: SchematicNode): number {
  if (node.type === "room") return 0;
  const ports = (node.data as DeviceData).ports ?? [];
  return ports.filter((p) => {
    if (p.direction === "bidirectional") return true;
    return (p.direction === "output") !== (p.flipped ?? false);
  }).length;
}

/** Count ports on the left side (inputs + flipped outputs + bidirectional) */
function leftPortCount(node: SchematicNode): number {
  if (node.type === "room") return 0;
  const ports = (node.data as DeviceData).ports ?? [];
  return ports.filter((p) => {
    if (p.direction === "bidirectional") return true;
    return (p.direction === "input") !== (p.flipped ?? false);
  }).length;
}

/** Max stub spread for N ports on a side: (N-1)/2 * STUB_GAP */
function maxSpread(portCount: number): number {
  return portCount <= 1 ? 0 : ((portCount - 1) / 2) * STUB_GAP;
}

/**
 * After a node is dropped, check if it's too close to any neighbor
 * for stubs to clear obstacle rects. If so, return a corrected position
 * that scoots the node to the minimum safe distance.
 *
 * When snapResult is provided, the algorithm penalizes movement on
 * aligned axes so nudges prefer to preserve snap alignment.
 *
 * Returns null if no correction is needed.
 */
export function enforceMinSpacing(
  draggedNode: SchematicNode,
  allNodes: SchematicNode[],
  hiddenNodeIds?: Set<string>,
  snapResult?: SnapResult,
): { x: number; y: number } | null {
  if (draggedNode.type === "room") return null;
  if (isDrawBoxNode(draggedNode)) return null;
  // Stub labels are visual annotations, not routing obstacles. They also center-snap
  // to the grid — the final round-to-grid below would clobber that offset.
  if (draggedNode.type === "stub-label") return null;

  const dragged = nodeRect(draggedNode);
  const dw = dragged.right - dragged.left;
  const dh = dragged.bottom - dragged.top;
  const origX = draggedNode.position.x;
  const origY = draggedNode.position.y;

  // Penalize movement on axes that have active snap alignment
  const hasXAlignment = snapResult?.guides.some((g) => g.orientation === "v") ?? false;
  const hasYAlignment = snapResult?.guides.some((g) => g.orientation === "h") ?? false;
  const ALIGN_PENALTY = 3;

  let newX = origX;
  let newY = origY;
  let changed = false;

  const neighbors = allNodes.filter((n) => {
    if (n.id === draggedNode.id) return false;
    if (isDrawBoxNode(n)) return false;
    if (n.type === "room" || n.type === "note" || n.type === "stub-label") return false;
    if (n.parentId !== draggedNode.parentId) return false;
    if (hiddenNodeIds?.has(n.id)) return false;
    return true;
  });

  // Iterate to handle cascade (nudged into another device)
  for (let iter = 0; iter < 3; iter++) {
    let iterChanged = false;

    for (const other of neighbors) {
      const or = nodeRect(other);
      const draggedRight = newX + dw;
      const draggedBottom = newY + dh;

      // Actual overlap check (strict — no PAD buffer)
      const actualOverlap =
        newX < or.right && draggedRight > or.left &&
        newY < or.bottom && draggedBottom > or.top;

      if (actualOverlap) {
        // Find bounding box of ALL devices overlapping the dragged device
        let clusterLeft = or.left, clusterRight = or.right;
        let clusterTop = or.top, clusterBottom = or.bottom;
        for (const n of neighbors) {
          if (n.id === other.id) continue;
          const nr = nodeRect(n);
          if (newX < nr.right && draggedRight > nr.left &&
              newY < nr.bottom && draggedBottom > nr.top) {
            clusterLeft = Math.min(clusterLeft, nr.left);
            clusterRight = Math.max(clusterRight, nr.right);
            clusterTop = Math.min(clusterTop, nr.top);
            clusterBottom = Math.max(clusterBottom, nr.bottom);
          }
        }

        const spreadDragR = maxSpread(rightPortCount(draggedNode));
        const spreadDragL = maxSpread(leftPortCount(draggedNode));
        const spreadOtherL = maxSpread(leftPortCount(other));
        const spreadOtherR = maxSpread(rightPortCount(other));

        const minGapLeft = STUB + PAD + ROUTING_GAP + Math.max(spreadDragR, spreadOtherL);
        const minGapRight = STUB + PAD + ROUTING_GAP + Math.max(spreadDragL, spreadOtherR);

        // Escape candidates clear the entire cluster, not just the single device
        const candidates = [
          { x: clusterLeft - dw - minGapLeft, y: newY },  // push left of cluster
          { x: clusterRight + minGapRight, y: newY },      // push right of cluster
          { x: newX, y: clusterTop - dh },                 // push above cluster (flush)
          { x: newX, y: clusterBottom },                    // push below cluster (flush)
        ];

        let best = candidates[0];
        let bestScore = Infinity;
        for (const c of candidates) {
          const dx = Math.abs(c.x - origX);
          const dy = Math.abs(c.y - origY);
          let score =
            dx * (hasXAlignment ? ALIGN_PENALTY : 1) +
            dy * (hasYAlignment ? ALIGN_PENALTY : 1);

          // Penalize candidates that would land on a non-cluster device
          for (const n of neighbors) {
            const nr = nodeRect(n);
            if (c.x < nr.right && c.x + dw > nr.left &&
                c.y < nr.bottom && c.y + dh > nr.top) {
              score += 10000;
              break;
            }
          }

          if (score < bestScore) {
            bestScore = score;
            best = c;
          }
        }

        if (best.x !== newX || best.y !== newY) {
          newX = best.x;
          newY = best.y;
          iterChanged = true;
        }
        break; // Escaped the whole cluster — let next iteration handle any remaining conflicts
      } else {
        // No actual overlap — enforce horizontal spacing when Y ranges are close
        // (PAD buffer ensures routing stubs have clearance)
        const yClose = newY < or.bottom + PAD && draggedBottom > or.top - PAD;
        if (!yClose) continue;

        if (draggedRight <= or.left) {
          // Dragged is to the LEFT of other
          const spreadA = maxSpread(rightPortCount(draggedNode));
          const spreadB = maxSpread(leftPortCount(other));
          const minGap = STUB + PAD + ROUTING_GAP + Math.max(spreadA, spreadB);
          const currentGap = or.left - draggedRight;
          if (currentGap < minGap) {
            newX -= minGap - currentGap;
            iterChanged = true;
          }
        } else if (newX >= or.right) {
          // Dragged is to the RIGHT of other
          const spreadA = maxSpread(leftPortCount(draggedNode));
          const spreadB = maxSpread(rightPortCount(other));
          const minGap = STUB + PAD + ROUTING_GAP + Math.max(spreadA, spreadB);
          const currentGap = newX - or.right;
          if (currentGap < minGap) {
            newX += minGap - currentGap;
            iterChanged = true;
          }
        }
        // else: X ranges overlap but no actual overlap — no action needed
      }
    }

    if (iterChanged) changed = true;
    else break;
  }

  if (!changed) return null;

  // Do not overwrite compact endpoint port-row placement with background-grid snapping.
  newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
  if (!(draggedNode.type === "device" && isExternalEndpointData(draggedNode.data as DeviceData))) {
    newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
  }

  return { x: newX, y: newY };
}

/**
 * Check whether a node conflicts with any neighbor (same logic as
 * enforceMinSpacing but returns a simple boolean). Used for the
 * red overlap indicator during drag.
 */
export function detectOverlap(
  draggedNode: SchematicNode,
  allNodes: SchematicNode[],
  hiddenNodeIds?: Set<string>,
): boolean {
  return enforceMinSpacing(draggedNode, allNodes, hiddenNodeIds) !== null;
}

/**
 * Pure speculative reparent: if the node's center falls inside a room,
 * return a copy with parentId set and position converted to room-relative.
 * Used before enforcement so overlap detection works across room boundaries.
 */
export function speculativeReparent(
  node: SchematicNode,
  allNodes: SchematicNode[],
): SchematicNode {
  if (node.parentId) return node;

  const nodeW = node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? (node.type === "device" && isExternalEndpointData(node.data as DeviceData) ? estimateExternalEndpointWidth((node.data as DeviceData).label, (node.data as DeviceData).ports?.[0]?.direction) : 180);
  const nodeH = node.measured?.height ?? (node.height as number) ?? (node.style?.height as number) ?? estimateDeviceHeight(node);
  const centerX = node.position.x + nodeW / 2;
  const centerY = node.position.y + nodeH / 2;

  let bestRoom: SchematicNode | undefined;
  let bestArea = Infinity;
  for (const room of allNodes) {
    if (room.type !== "room") continue;
    const rw = room.measured?.width ?? (room.style?.width as number) ?? (room.width as number) ?? 400;
    const rh = room.measured?.height ?? (room.style?.height as number) ?? (room.height as number) ?? 300;
    if (
      centerX >= room.position.x && centerX <= room.position.x + rw &&
      centerY >= room.position.y && centerY <= room.position.y + rh
    ) {
      const area = rw * rh;
      if (area < bestArea) {
        bestRoom = room;
        bestArea = area;
      }
    }
  }
  if (bestRoom) {
    return {
      ...node,
      parentId: bestRoom.id,
      position: {
        x: node.position.x - bestRoom.position.x,
        y: node.position.y - bestRoom.position.y,
      },
    };
  }
  return node;
}
