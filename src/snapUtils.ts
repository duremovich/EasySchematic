import type { ConnectionEdge, DeviceData, SchematicNode, StubLabelData, TextStubData } from "./types";
import { portSide } from "./types";

import { GRID_SIZE } from "./gridConstants";
import { hopHiddenAdapters } from "./adapterVisibility";
import { totalAuxHeight, headerBandHeight, HEADER_LABEL_ZONE_PX, HEADER_LABEL_ZONE_2_PX } from "./auxiliaryData";
import { resolveDeviceLabel } from "./displayName";
import { estimateDeviceWidth } from "./deviceWidth";
import { STUB_GAP as STUB_PORT_GAP, STUB_W_EST, STUB_H_EST } from "./stubPlacement";

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

// How far ACROSS a row the tag-to-tag scan reaches (#342). Column alignment (the
// vertical-guide candidates) keeps the full MAX_SNAP_DISTANCE — a deliberate column of
// tags is tall and that reach is what makes it snap. Row alignment (the horizontal-guide
// candidates) does not: a tag's Y belongs to its own port row, and every port row on the
// page sits on the same GRID_SIZE pitch, so at 800px there is nearly always SOME
// unrelated tag whose row falls inside SNAP_THRESHOLD. 20 cells still covers the two tags
// flanking one device (272px apart at STUB_GAP) and its immediate neighbours.
const STUB_ROW_REACH = 20 * GRID_SIZE;

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

export function estimateDeviceHeight(node: SchematicNode): number {
  const data = node.data as DeviceData;
  const ports = data.ports ?? [];
  const left = ports.filter((p) => p.direction !== "bidirectional" && (p.direction === "input" ? !p.flipped : !!p.flipped)).length;
  const right = ports.filter((p) => p.direction !== "bidirectional" && (p.direction === "output" ? !p.flipped : !!p.flipped)).length;
  const bidirs = ports.filter((p) => p.direction === "bidirectional").length;
  const portRows = Math.max(left, right) + bidirs;
  // Base: 1px top border + 32px header band (min) + 1px header border-b
  //     + 6px port-area pt + rows×16 + 7px port-area pb + 1px bottom border
  //     = 48 + rows×16.
  // totalAuxHeight adds (a) header band surplus above the 32-px baseline and (b) footer block height.
  // Per-instance wrapLabel override is honored here; schematic-wide default is not threaded — React Flow's
  // measured height supersedes this estimate after the first render. `resolveDeviceLabel` also decides
  // whether the name is actually wide enough to need line two, so this matches what DeviceNode renders.
  const labelZone = resolveDeviceLabel(data, {}).wrapsInHeader ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  return 48 + portRows * 16 + totalAuxHeight(data.auxiliaryData, labelZone);
}

/** Box size before React Flow has measured the DOM. A tag is not device-sized, and
 *  assuming it is put its right edge 64px out and its row 17px down — the router and
 *  placement both estimate tags at STUB_W_EST × STUB_H_EST, so match them. */
function fallbackWidth(node: SchematicNode): number {
  if (node.type === "room") return 400;
  if (node.type === "device") return estimateDeviceWidth(node.data as DeviceData);
  return node.type === "stub-label" || node.type === "text-stub" ? STUB_W_EST : 144;
}

function fallbackHeight(node: SchematicNode): number {
  if (node.type === "room") return 300;
  return node.type === "stub-label" || node.type === "text-stub" ? STUB_H_EST : estimateDeviceHeight(node);
}

function nodeRect(node: SchematicNode): Rect {
  const w = node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? fallbackWidth(node);
  const h = node.measured?.height ?? (node.height as number) ?? (node.style?.height as number) ?? fallbackHeight(node);
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
 *  Walks the full chain so nested parents (e.g. rack-in-room) compose correctly.
 *  `positionOverride` supplies pending positions for parents mid-update (room
 *  child re-snap). A corrupt save (hand-merged Dropbox conflict) can carry a
 *  cyclic parentId chain — a revisited id ends the walk instead of hanging. */
export function parentOffsetFromMap(
  node: SchematicNode,
  nodeMap: Map<string, SchematicNode>,
  positionOverride?: ReadonlyMap<string, { x: number; y: number }>,
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  let parentId = node.parentId;
  if (!parentId) return { dx, dy };
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    const pos = positionOverride?.get(parentId) ?? parent.position;
    dx += pos.x;
    dy += pos.y;
    parentId = parent.parentId;
  }
  return { dx, dy };
}

/** Walk full parent chain to compute absolute world position. */
function absoluteNodePos(
  node: SchematicNode,
  nodeMap: Map<string, SchematicNode>,
): { x: number; y: number } {
  const { dx, dy } = parentOffsetFromMap(node, nodeMap);
  return { x: node.position.x + dx, y: node.position.y + dy };
}

/** Node rect in absolute world coords. Single allocation per call (parent
 *  chain walk inlined; intermediate nodeRect/absoluteNodePos avoided). */
function absRect(node: SchematicNode, nodeMap: Map<string, SchematicNode>): Rect {
  const w = node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? fallbackWidth(node);
  const h = node.measured?.height ?? (node.height as number) ?? (node.style?.height as number) ?? fallbackHeight(node);
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
  const resolved = resolveDeviceLabel(dd, displayDefaults);
  const labelZone = resolved.wrapsInHeader ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  const headerBand = headerBandHeight(dd.auxiliaryData, labelZone);
  // Round to integer pixels — absoluteNodePos walks the parent chain summing
  // positions, and any sub-pixel ancestor (older saves, room dragged to non-
  // integer Y) propagates through everything emitted here. The downstream edge
  // router rounds independently per handle, so a fractional pixel can land
  // port and stub on adjacent integers and produce a 1-px jog at the endpoint.
  const rawDeviceAbs = absoluteNodePos(device, nodeMap);
  const deviceAbs = { x: Math.round(rawDeviceAbs.x), y: Math.round(rawDeviceAbs.y) };
  const deviceW = Math.round((device.measured?.width as number | undefined) ?? estimateDeviceWidth(dd));
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
  //   1px top border + headerBand + 1px header border-b + 6px port-area pt
  // For headerBand a 16-multiple, the row center lands on `device.y + 16k`,
  // i.e. exactly on the 16-px routing grid. (The `pt-[6px]` in DeviceNode.tsx is
  // intentional — it compensates for the header band's `border-b` so ports
  // remain grid-aligned; using 7px would push every row off-grid by 1px.)
  const PORT_AREA_TOP = 1 + headerBand + 1 + 6;
  const rowCenterY = (row: number) => deviceAbs.y + PORT_AREA_TOP + row * 16 + 8;

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

type CandidateKind = "edge" | "center" | "port" | "stub";

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
 * threshold, port-snap wins over edge/center/stub snap so stubs prefer the
 * port they conceptually belong to over a coincidental device-edge alignment.
 */
function pickBest(candidates: AxisCandidate[]): AxisCandidate | null {
  let best: AxisCandidate | null = null;
  for (const c of candidates) {
    if (Math.abs(c.delta) > SNAP_THRESHOLD) continue;
    if (!best) {
      best = c;
      continue;
    }
    const cIsPort = c.kind === "port";
    const bestIsPort = best.kind === "port";
    if (cIsPort && !bestIsPort) {
      best = c;
    } else if (!cIsPort && bestIsPort) {
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
  /** Connections — only read for stub labels, to find the port a tag belongs to (#323). */
  allEdges: ConnectionEdge[] = [],
): SnapResult {
  // Build nodeMap with a for-loop (skips the intermediate tuple array that
  // `new Map(allNodes.map(...))` would allocate).
  const nodeMap = new Map<string, SchematicNode>();
  for (const n of allNodes) nodeMap.set(n.id, n);

  if (draggedNode.type === "stub-label") {
    return computeStubSnap(draggedNode, allNodes, nodeMap, displayDefaults, allEdges);
  }

  // Generic path: rooms snap to other rooms; devices snap to cross-room peers
  // (proximity-gated) plus their own parent room's edges.
  const draggedAbs = absRect(draggedNode, nodeMap);
  const dw = draggedAbs.right - draggedAbs.left;
  const dh = draggedAbs.bottom - draggedAbs.top;
  const isDraggedRoom = draggedNode.type === "room";
  const draggedParentId = draggedNode.parentId;

  // Single pass: filter, compute absRect for survivors, run top-K via in-place
  // bubble-insert. No transient {node, rect} or {c, dist} wrappers.
  const topRects: Rect[] = [];
  const topDistsSq: number[] = [];

  for (const n of allNodes) {
    if (n.id === draggedNode.id) continue;
    if (isDraggedRoom) {
      if (n.type !== "room") continue;
    } else if (n.type === "room") {
      // Child devices only align to their own parent room; top-level devices
      // see every room (placement-time alignment).
      if (draggedParentId && n.id !== draggedParentId) continue;
    } else if (n.type === "stub-label" || n.type === "waypoint" || n.type === "bundle-junction") {
      // Stubs sit at sub-grid Y by design (centered on a port row); waypoints
      // are router-positioned; bundle junctions are router/heal-positioned trunk
      // anchors. Aligning a device to any of them pulls the device off the 20px
      // grid, and snapNodesToGrid then yanks it back on the next reload — looking
      // like the device "jumped."
      continue;
    }
    // else: device or other top-level type — cross-room alignment allowed.

    const r = absRect(n, nodeMap);
    const dSq = bboxDistSq(draggedAbs, r);
    if (dSq > MAX_SNAP_DISTANCE_SQ) continue;
    insertTopK(topRects, topDistsSq, NEAREST_K_DEVICE, r, dSq);
  }

  const xCands: AxisCandidate[] = [];
  const yCands: AxisCandidate[] = [];
  for (let i = 0; i < topRects.length; i++) {
    pushBoxCandidates(xCands, yCands, draggedAbs, topRects[i], "edge", "center");
  }

  return finalizeSnap(draggedNode, draggedAbs, dw, dh, xCands, yCands, nodeMap);
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
 * Find the device port a stub tag belongs to: the far end of the tag's own leg (#323).
 * Returns null for a tag with no leg, or one whose handle no longer resolves to a port.
 */
function ownPortOfStub(
  stubNode: SchematicNode,
  nodeMap: Map<string, SchematicNode>,
  allEdges: ConnectionEdge[],
  displayDefaults: DisplayDefaults,
): { port: PortPosition; deviceRect: Rect } | null {
  let deviceId: string | undefined;
  let handleId: string | null | undefined;
  for (const e of allEdges) {
    if (e.source === stubNode.id) { deviceId = e.target; handleId = e.targetHandle; break; }
    if (e.target === stubNode.id) { deviceId = e.source; handleId = e.sourceHandle; break; }
  }
  if (!deviceId) return null;
  const device = nodeMap.get(deviceId);
  if (!device || device.type !== "device") return null;
  const ports = getPortAbsolutePositions(device, nodeMap, displayDefaults);
  // Same bare↔directional healing the router does — a port that became bidirectional
  // renders `-in`/`-out` handles the leg's stored id may predate.
  const bare = (handleId ?? "").replace(/-(in|out)$/, "");
  const port = ports.find((p) => p.handleId === handleId) ?? ports.find((p) => p.portId === bare);
  return port ? { port, deviceRect: absRect(device, nodeMap) } : null;
}

/**
 * Stub labels snap to (1) the port of the connector they belong to (primary), (2) edges/
 * centers of nearby other stubs (so vertical columns of stubs align), (3) center-snapped
 * grid as a fallback. Device-edge alignment is intentionally absent — stubs care about
 * ports, not bounding boxes.
 *
 * Only the tag's OWN port gets to snap (#323). Offering every port of every device within
 * MAX_SNAP_DISTANCE meant the nearest coincidental port row won — `pickBest` ranks all
 * port candidates equally — so dragging a tag near its device would just as happily latch
 * it onto an unrelated device's port across the page. When the own port can't be resolved
 * (an orphaned tag), fall back to the nearby-devices scan so there is still something to
 * align to.
 */
function computeStubSnap(
  stubNode: SchematicNode,
  allNodes: SchematicNode[],
  nodeMap: Map<string, SchematicNode>,
  displayDefaults: DisplayDefaults,
  allEdges: ConnectionEdge[],
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

  // 1. Port targets. The tag's own port when we can resolve it; otherwise the ports of
  //    nearby devices (single-pass top-K, no wrappers).
  const pushPortCandidates = (p: PortPosition, tRect: Rect) => {
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
  };

  const own = ownPortOfStub(stubNode, nodeMap, allEdges, displayDefaults);
  if (own) {
    pushPortCandidates(own.port, own.deviceRect);
  } else {
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
      for (const p of ports) pushPortCandidates(p, deviceTopRects[i]);
    }
  }

  // 2. Other-stub alignment, with an axis-asymmetric reach (#342). A stub dragged more
  //    than SNAP_THRESHOLD off its own port row has no port candidate left to win, so a
  //    far-but-in-range stub gets to claim it — which is the point when the two form a
  //    COLUMN (vertical guide: the peer is far below/above but its left/right/centre is
  //    within a cell) and noise when they only share a ROW (horizontal guide: the peer is
  //    most of a page to the side and its row happens to fall within a cell, as every port
  //    row does — they all sit on the same GRID_SIZE pitch). So columns keep the full
  //    MAX_SNAP_DISTANCE and rows reach only STUB_ROW_REACH. With no row candidate the tag
  //    falls back to grid-snapping its centre, which lands on that same pitch anyway.
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
    const gapX = Math.max(0, Math.max(stubAbs.left - r.right, r.left - stubAbs.right));
    if (gapX > STUB_ROW_REACH) continue;
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

// Must match pathfinding.ts constants (px; scaled with the 16px grid in v41)
const STUB = 24;
const PAD = 16;
const ROUTING_GAP = 6; // Buffer so stubs land in the routing channel, not on obstacle boundary
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
    if (n.type === "room" || n.type === "note" || n.type === "stub-label") return false;
    if (n.parentId !== draggedNode.parentId) return false;
    if (hiddenNodeIds?.has(n.id)) return false;
    // Off-canvas devices (virtual patch panels) are invisible — never push against them.
    if (n.type === "device" && (n.data as { offCanvas?: boolean }).offCanvas) return false;
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

  // Snap corrected position to grid — in ABSOLUTE space. A parented device
  // stores room-relative coords, and the room origin itself can sit off-grid
  // (edge-aligned resize); rounding the relative coords would land the device's
  // ports off the grid its unsectioned peers snap to (#322).
  let offX = 0;
  let offY = 0;
  if (draggedNode.parentId) {
    const nodeMap = new Map<string, SchematicNode>();
    for (const n of allNodes) nodeMap.set(n.id, n);
    const off = parentOffsetFromMap(draggedNode, nodeMap);
    offX = off.dx;
    offY = off.dy;
  }
  newX = Math.round((newX + offX) / GRID_SIZE) * GRID_SIZE - offX;
  newY = Math.round((newY + offY) / GRID_SIZE) * GRID_SIZE - offY;

  return { x: newX, y: newY };
}

/**
 * Final drag-stop correction for a parented node (#322). An axis that neither
 * computeSnap aligned nor enforceMinSpacing corrected rests where React Flow's
 * snapGrid left it — grid-rounded in room-RELATIVE coords. When the room origin
 * sits off-grid (edge-aligned resize), that puts the node's ports off the
 * absolute routing grid, so round the untouched axes in ABSOLUTE space. Axes
 * that did snap are left alone: alignment is deliberate (possibly flush to an
 * off-grid room edge) and enforceMinSpacing already rounds absolutely. Stubs
 * keep their port-centred sub-grid position, as everywhere else.
 */
export function snapParentedRestPosition(
  node: SchematicNode,
  final: { x: number; y: number },
  nodeMap: Map<string, SchematicNode>,
): { x: number; y: number } {
  if (!node.parentId) return final;
  if (node.type === "stub-label" || node.type === "text-stub") return final;
  const { dx, dy } = parentOffsetFromMap(node, nodeMap);
  let { x, y } = final;
  if (x === node.position.x) x = roundToGrid(x + dx) - dx;
  if (y === node.position.y) y = roundToGrid(y + dy) - dy;
  return { x, y };
}

/** Nearest grid multiple. Callers work in ABSOLUTE space — a parented node's
 *  relative coords have to have its parent-chain offset added first (#322). */
function roundToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

/**
 * Rest positions for a group drag (#327), extending #322's absolute-grid
 * invariant to the multi-selection path. React Flow lands a multi-selection by
 * rounding ONE reference node onto the grid and shifting every other member by
 * that same offset, so whichever sub-grid residue the reference had is imposed
 * on the whole group: a device parented into a room whose origin sits off-grid
 * leaves the group resting off the absolute routing grid, and the app's own
 * uniform-delta pass (#134) carries the error through.
 *
 * The correction places the group in a frame anchored on `anchorId` — the node
 * under the cursor, whose alignment `delta` the caller applies to everyone:
 *   - the anchor's own absolute position is grid-rounded on each axis its
 *     alignment did NOT move, and left as placed on the axes it did (alignment
 *     is deliberate and can be flush to an off-grid room edge, as in #322);
 *   - every other member keeps its pre-drag absolute offset from the anchor,
 *     rounded to a grid multiple.
 * So members inherit the anchor's residue rather than the React Flow
 * reference's: whenever the anchor rests on the grid the whole group does, and
 * when it deliberately does not, the group keeps its shape around it. Offsets
 * that were not grid multiples to begin with — members in rooms with different
 * origin residues — move by up to half a grid cell; that IS the residue being
 * removed, and it is the one case where the group's relative spacing changes.
 *
 * Rooms are exempt: a room origin is allowed to sit off-grid (#322 — it can be
 * deliberately edge-aligned to another room), and snapRoomChildrenToGrid puts
 * its devices back on the absolute grid after the move. A room that is itself
 * the anchor therefore keeps its origin while the devices around it still land
 * on the grid. Stub tags keep their port-centred sub-grid position, as
 * everywhere else — but a tag co-dragged with the device it hangs off rides by
 * that device's CORRECTED shift rather than the raw delta (#334). The residue
 * correction is up to half a cell, and a tag left behind by it sits up to 8px
 * off its port row for good: recomputeRoutes reads the offset as a deliberate
 * placement, healStubPortAlignment only heals strictly under half a cell, and
 * snapNodesToGrid exempts tags on reload. Moving the pair rigidly means the gap
 * is never opened. A tag whose device is not part of the drag still moves by
 * the raw delta — that is the user placing the tag by hand.
 *
 * Returns only the nodes whose position actually changes, keyed by id.
 */
export function snapGroupRestPositions(
  nodes: readonly SchematicNode[],
  draggedIds: ReadonlySet<string>,
  delta: { dx: number; dy: number },
  anchorId: string,
  /** Connections — only read to pair a stub tag with the device its leg ends at (#334). */
  edges: readonly ConnectionEdge[] = [],
  /** Inline adapters the canvas is hiding, so a leg that ends on one pairs with the
   *  device the connection visibly runs to instead. */
  hiddenAdapterIds?: ReadonlySet<string>,
): Map<string, { x: number; y: number }> {
  const nodeMap = new Map<string, SchematicNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  const moves = new Map<string, { x: number; y: number }>();

  const anchor = nodeMap.get(anchorId);
  let frame: { preX: number; preY: number; restX: number; restY: number } | null = null;
  if (anchor) {
    const off = parentOffsetFromMap(anchor, nodeMap);
    const preX = anchor.position.x + off.dx;
    const preY = anchor.position.y + off.dy;
    // A tag anchor cannot frame the group: computeStubSnap centres it on its port
    // row, which is a deliberate SUB-GRID rest, so the alignment delta is almost
    // never zero on either axis and every co-dragged device would inherit that
    // residue. Grid-round the frame on both axes instead; the anchor tag itself is
    // exempt below and the pairing pass re-hangs it off its own device (#334). A
    // ROOM anchor keeps its origin — off-grid there is deliberate (#322).
    const tagAnchor = anchor.type === "stub-label" || anchor.type === "text-stub";
    const rest = (pre: number, d: number) => (tagAnchor || d === 0 ? roundToGrid(pre + d) : pre + d);
    frame = { preX, preY, restX: rest(preX, delta.dx), restY: rest(preY, delta.dy) };
  }

  // Shift actually applied to each member, so tags can inherit their device's (#334).
  // A member's parent never moves in this pass (children of a dragged parent are
  // skipped), so its relative shift IS its absolute shift.
  const shifts = new Map<string, { dx: number; dy: number }>();
  const tags: SchematicNode[] = [];

  for (const n of nodes) {
    if (!draggedIds.has(n.id)) continue;
    // Children of a dragged node ride along in relative coords; a dragged
    // room's children are re-snapped absolutely by snapRoomChildrenToGrid.
    if (n.parentId && draggedIds.has(n.parentId)) continue;
    let rest = { x: n.position.x + delta.dx, y: n.position.y + delta.dy };
    const isTag = n.type === "stub-label" || n.type === "text-stub";
    const exempt = n.type === "room" || isTag;
    if (frame && !exempt) {
      const off = parentOffsetFromMap(n, nodeMap);
      const absX = frame.restX + roundToGrid(n.position.x + off.dx - frame.preX);
      const absY = frame.restY + roundToGrid(n.position.y + off.dy - frame.preY);
      rest = { x: absX - off.dx, y: absY - off.dy };
    }
    if (isTag) tags.push(n);
    shifts.set(n.id, { dx: rest.x - n.position.x, dy: rest.y - n.position.y });
    if (rest.x !== n.position.x || rest.y !== n.position.y) moves.set(n.id, rest);
  }

  // Re-hang each co-dragged tag off its own device (#334).
  for (const t of tags) {
    const hostId = tagHostId(t, nodes, edges, hiddenAdapterIds);
    const shift = hostId === undefined ? undefined : shifts.get(hostId);
    if (!shift) continue;
    const rest = { x: t.position.x + shift.dx, y: t.position.y + shift.dy };
    if (rest.x !== t.position.x || rest.y !== t.position.y) moves.set(t.id, rest);
    else moves.delete(t.id);
  }
  return moves;
}

/** The device a tag hangs off: the far end of a stub tag's leg, or a text stub's
 *  declared anchor. Undefined for a tag with no leg (an orphan awaiting cleanup).
 *
 *  `hiddenAdapterIds` is the canvas's hidden inline adapters. A leg can terminate on
 *  one — stubbing the device→adapter half of an adapted connection leaves the tag's leg
 *  pointing at the adapter — and the visible host is then the device beyond it, so hop. */
export function tagHostId(
  tag: SchematicNode,
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
  hiddenAdapterIds?: ReadonlySet<string>,
): string | undefined {
  if (tag.type === "text-stub") return (tag.data as TextStubData).anchorNodeId;
  let legId: string | undefined;
  let host: string | undefined;
  for (const e of edges) {
    if (e.source !== tag.id && e.target !== tag.id) continue;
    legId = e.id;
    host = e.source === tag.id ? e.target : e.source;
    break;
  }
  if (host === undefined || !hiddenAdapterIds?.size) return host;
  return hopHiddenAdapters({ nodeId: host, handleId: null }, legId, nodes, edges, hiddenAdapterIds).nodeId;
}

/**
 * Settle the tags around a move (#346) — the one rule for what a moved device does to
 * its tags, shared by both drag-stop paths, moveDevice and placeDeviceInRoom.
 *
 * Two things happen, decided per tag by whether the tag itself was in the move and
 * whether its device was:
 *
 * - Device moved, tag did not: stamp `placed: false`. That is #182's re-anchor —
 *   StubLabelNode.tryPlace re-runs and re-hangs the tag off the moved port instead of
 *   leaving it stranded. Only the single-device drag-stop path used to do this; the
 *   group path returned before reaching it and the store's copy was wired only into
 *   moveDevice / placeDeviceInRoom, neither of which the group path calls (reparentNode
 *   early-returns on an unchanged parent). So a tag left out of a multi-device selection
 *   stayed at its old coordinates for the whole drag distance — orders past the sub-cell
 *   drift #334 and healStubPortAlignment deal with.
 * - Tag moved, device did not: stamp `userMoved: true, placed: true`. The user pulled the
 *   tag off its device deliberately, so later device moves must leave it where it is.
 *   The single-device path already stamped that; the group path never did, which is what
 *   makes clearing `placed` safe there.
 *
 * A tag that moved WITH its device is left alone — snapGroupRestPositions already rode it
 * rigidly (#334), and clearing `placed` would throw that away and re-place it. Manually
 * positioned tags are never re-anchored, matching every other caller.
 *
 * "Moved" covers descendants: a dragged room carries its devices in relative coords, and
 * snapRoomChildrenToGrid nudges them again afterwards.
 *
 * The host lookup deliberately does NOT hop a hidden inline adapter the way
 * snapGroupRestPositions does. Riding a tag rigidly works off whichever device actually
 * shifted, but re-arming placement hands the tag to tryPlace, which resolves its anchor as
 * the literal far end of the leg — the adapter. Hopping here would re-arm a tag that the
 * placer then re-pins to the stationary adapter, moving it away from the device that moved.
 *
 * `hiddenAdapterIds` does not change that: it is read only to recognise the one case the
 * no-hop lookup gets wrong in the other direction (#356). When a tag's leg ends on a
 * hidden adapter and the device the user sees BEYOND it was in the same move, the tag was
 * carried by snapGroupRestPositions' hop (#348), not placed by hand — the stationary
 * adapter just makes it look like a hand placement to the no-hop lookup. Stamping
 * `userMoved` there would opt the tag out of every later re-anchor, including the one it
 * needs once Show Adapter makes the adapter draggable again.
 *
 * Returns a new nodes array, or null when no tag needs anything.
 */
export function settleTagsAfterMove(
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
  movedIds: ReadonlySet<string>,
  /** Inline adapters the canvas is hiding — see above; never used to re-anchor. */
  hiddenAdapterIds?: ReadonlySet<string>,
): SchematicNode[] | null {
  if (movedIds.size === 0) return null;
  const nodeMap = new Map<string, SchematicNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // A node moved if it or any ancestor did. A corrupt save can carry a cyclic parentId
  // chain — a revisited id ends the walk instead of hanging (as elsewhere).
  const moved = new Set<string>();
  for (const n of nodes) {
    const chain: string[] = [];
    let cur: string | undefined = n.id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      chain.push(cur);
      if (movedIds.has(cur) || moved.has(cur)) {
        for (const id of chain) moved.add(id);
        break;
      }
      cur = nodeMap.get(cur)?.parentId;
    }
  }

  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== "stub-label" && n.type !== "text-stub") return n;
    const hostId = tagHostId(n, nodes, edges);
    const hostMoved = hostId !== undefined && moved.has(hostId);
    const d = n.data as StubLabelData | TextStubData;
    if (movedIds.has(n.id)) {
      if (hostMoved) return n; // rode with its device — #334 already placed it
      // Same thing one hop further out: the leg ends on a hidden adapter that stayed put
      // and the visible device past it moved, so the tag rode with it (#348/#356).
      if (hiddenAdapterIds?.size) {
        const hopHostId = tagHostId(n, nodes, edges, hiddenAdapterIds);
        if (hopHostId !== hostId && hopHostId !== undefined && moved.has(hopHostId)) return n;
      }
      if (d.userMoved === true && d.placed === true) return n;
      changed = true;
      return { ...n, data: { ...d, userMoved: true, placed: true } } as SchematicNode;
    }
    if (!hostMoved) return n;
    if (d.userMoved || d.placed !== true) return n;
    changed = true;
    return { ...n, data: { ...d, placed: false } } as SchematicNode;
  });
  return changed ? (next as SchematicNode[]) : null;
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

  const nodeW = node.measured?.width ?? (node.type === "device" ? estimateDeviceWidth(node.data as DeviceData) : 144);
  const nodeH = node.measured?.height ?? estimateDeviceHeight(node);
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
