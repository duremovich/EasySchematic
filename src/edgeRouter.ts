/**
 * Centralized iterative edge routing engine.
 * Routes all edges with awareness of each other to avoid shared segments.
 *
 * Pure algorithm — no React dependencies.
 */

import type { ReactFlowInstance } from "@xyflow/react";
import type { SchematicNode, ConnectionEdge } from "./types";
import {
  buildObstacles,
  computeEdgePath,
  g2px,
  pixelRectsToGrid,
  px2g,
  simplifyWaypoints,
  waypointsToSvgPath,
  waypointsToSvgPathWithHops,
  type PenaltyZone,
  type Rect,
} from "./pathfinding";
import { computePageGrid } from "./printPageGrid";
import {
  type Orientation,
  getPaperSize,
  PAGE_MARGIN_IN,
  TITLE_BLOCK_HEIGHT_IN,
} from "./printConfig";

// ---------- Types ----------

export interface CrossingPoint {
  x: number;
  y: number;
}

export interface RoutedEdge {
  edgeId: string;
  svgPath: string;
  /** SVG path with arc hops on horizontal segments and gap cuts on vertical segments at crossings */
  svgPathWithHops?: string;
  waypoints: Point[];
  segments: Segment[];
  labelX: number;
  labelY: number;
  turns: string;
  crossingPoints?: CrossingPoint[];
}

interface Point {
  x: number;
  y: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  axis: "h" | "v";
}

interface HandlePos {
  id: string;
  absX: number;
  absY: number;
}

// ---------- Orthogonalize ----------

/**
 * Insert intermediate waypoints between consecutive non-aligned points
 * so the path stays strictly orthogonal (horizontal/vertical segments only).
 * For each pair where both X and Y differ, inserts a bend point going
 * horizontal-first from the source side then vertical into the next point.
 */
export function orthogonalize(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const cur = points[i];
    if (prev.x !== cur.x && prev.y !== cur.y) {
      // Insert a bend: go horizontal first, then vertical
      result.push({ x: cur.x, y: prev.y });
    }
    result.push(cur);
  }
  return result;
}

/** Optional print-view configuration for title block obstacle avoidance. */
export interface PrintConfig {
  paperId: string;
  orientation: Orientation;
  scale: number;
  customWidthIn?: number;
  customHeightIn?: number;
}

// ---------- Constants ----------

const DPI = 96;

/** Default routing orchestration parameters. */
export const ROUTER_DEFAULTS = {
  MAX_ITERATIONS: 5,
  SEPARATION_THRESHOLD: 8,
  CX_THRESHOLD: 15,
  EDGE_GAP: 0,          // no parallel edge offset — start simple
  Y_GAP_THRESHOLD: 50,
  STUB_GAP: 0,          // no stub spread — start simple
  /** Edge sort strategy: 0=default(signal-type→shortest→position), 1=longest-first, 2=most-connected-first */
  SORT_STRATEGY: 1 as number,
};

/** Live-overridable via window.__routingParams for debug tuning. */
export const ROUTER_PARAMS: typeof ROUTER_DEFAULTS = new Proxy(ROUTER_DEFAULTS, {
  get(target, prop) {
    const overrides = (globalThis as unknown as Record<string, unknown>).__routingParams as Record<string, number> | undefined;
    if (overrides && prop in overrides) return overrides[prop as string];
    return target[prop as keyof typeof target];
  },
}) as typeof ROUTER_DEFAULTS;

// ---------- Handle resolution ----------

function getHandlePositions(
  nodeId: string,
  rfInstance: ReactFlowInstance,
): HandlePos[] {
  const internal = rfInstance.getInternalNode(nodeId);
  if (!internal) return [];

  const absX = internal.internals.positionAbsolute.x;
  const absY = internal.internals.positionAbsolute.y;
  const bounds = internal.internals.handleBounds;
  const result: HandlePos[] = [];

  for (const handle of bounds?.source ?? []) {
    if (handle.id) {
      result.push({
        id: handle.id,
        absX: Math.round(absX + handle.x + handle.width / 2),
        absY: Math.round(absY + handle.y + handle.height / 2),
      });
    }
  }
  for (const handle of bounds?.target ?? []) {
    if (handle.id) {
      result.push({
        id: handle.id,
        absX: Math.round(absX + handle.x + handle.width / 2),
        absY: Math.round(absY + handle.y + handle.height / 2),
      });
    }
  }
  return result;
}

function getAbsPos(node: SchematicNode, nodes: SchematicNode[]) {
  let x = node.position.x;
  let y = node.position.y;
  if (node.parentId) {
    const parent = nodes.find((n) => n.id === node.parentId);
    if (parent) {
      x += parent.position.x;
      y += parent.position.y;
    }
  }
  return { x, y };
}

// ---------- Stub spread (moved from OffsetEdge) ----------

function computeStubSpread(
  edgeId: string,
  sourceNodeId: string,
  edges: ConnectionEdge[],
  nodes: SchematicNode[],
): number {
  const allFromSource: { edgeId: string; handleY: number }[] = [];
  for (const e of edges) {
    if (e.source !== sourceNodeId) continue;
    const tgt = nodes.find((n) => n.id === e.target);
    if (!tgt) continue;
    const tgtPos = getAbsPos(tgt, nodes);
    const tgtH = tgt.measured?.height ?? 80;
    allFromSource.push({ edgeId: e.id, handleY: tgtPos.y + tgtH / 2 });
  }

  if (allFromSource.length <= 1) return 0;

  allFromSource.sort(
    (a, b) => a.handleY - b.handleY || a.edgeId.localeCompare(b.edgeId),
  );
  const index = allFromSource.findIndex((e) => e.edgeId === edgeId);
  const mid = (allFromSource.length - 1) / 2;
  return (index - mid) * ROUTER_PARAMS.STUB_GAP;
}

// ---------- Segment extraction ----------

export function extractSegments(waypoints: Point[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    const axis: "h" | "v" = a.y === b.y ? "h" : "v";
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, axis });
  }
  return segs;
}

// ---------- Violation detection ----------

/** Do two perpendicular segments actually cross? */
function segmentsCross(a: Segment, b: Segment): boolean {
  if (a.axis === b.axis) return false;
  // Ensure h is horizontal, v is vertical
  const h = a.axis === "h" ? a : b;
  const v = a.axis === "v" ? a : b;
  const hY = h.y1;
  const hMinX = Math.min(h.x1, h.x2);
  const hMaxX = Math.max(h.x1, h.x2);
  const vX = v.x1;
  const vMinY = Math.min(v.y1, v.y2);
  const vMaxY = Math.max(v.y1, v.y2);
  return vX > hMinX && vX < hMaxX && hY > vMinY && hY < vMaxY;
}

function segmentsOverlap(a: Segment, b: Segment): boolean {
  if (a.axis !== b.axis) return false;

  if (a.axis === "v") {
    // Vertical segments: close in X, overlapping Y range
    if (Math.abs(a.x1 - b.x1) >= ROUTER_PARAMS.SEPARATION_THRESHOLD) return false;
    const aMinY = Math.min(a.y1, a.y2);
    const aMaxY = Math.max(a.y1, a.y2);
    const bMinY = Math.min(b.y1, b.y2);
    const bMaxY = Math.max(b.y1, b.y2);
    const overlapLen = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
    return overlapLen > ROUTER_PARAMS.SEPARATION_THRESHOLD;
  } else {
    // Horizontal segments: close in Y, overlapping X range
    if (Math.abs(a.y1 - b.y1) >= ROUTER_PARAMS.SEPARATION_THRESHOLD) return false;
    const aMinX = Math.min(a.x1, a.x2);
    const aMaxX = Math.max(a.x1, a.x2);
    const bMinX = Math.min(b.x1, b.x2);
    const bMaxX = Math.max(b.x1, b.x2);
    const overlapLen = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
    return overlapLen > ROUTER_PARAMS.SEPARATION_THRESHOLD;
  }
}

export function findViolations(
  allEdges: { edgeId: string; segments: Segment[]; signalType?: string }[],
): Set<string> {
  const bad = new Set<string>();
  // Track per-edge crossing counts: how many times each edge crosses
  // the SAME other edge. Weaving through one edge (2+ crossings) is
  // much worse than crossing two different edges once each.
  const pairCrossings = new Map<string, Map<string, number>>();
  for (const e of allEdges) {
    pairCrossings.set(e.edgeId, new Map());
  }

  for (let i = 0; i < allEdges.length; i++) {
    for (let j = i + 1; j < allEdges.length; j++) {
      const a = allEdges[i];
      const b = allEdges[j];
      let hasOverlap = false;
      let crossCount = 0;
      for (const sa of a.segments) {
        for (const sb of b.segments) {
          if (segmentsOverlap(sa, sb)) hasOverlap = true;
          if (segmentsCross(sa, sb)) crossCount++;
        }
      }

      if (hasOverlap) {
        bad.add(a.edgeId);
        bad.add(b.edgeId);
      }

      if (crossCount > 0) {
        pairCrossings.get(a.edgeId)!.set(b.edgeId, crossCount);
        pairCrossings.get(b.edgeId)!.set(a.edgeId, crossCount);

        // Crossing the same edge 2+ times is always a violation (weaving)
        if (crossCount >= 2) {
          bad.add(a.edgeId);
          bad.add(b.edgeId);
        }

        // Even a single crossing between same-signal edges looks wrong
        // (identical colors make crossings very visible)
        if (crossCount >= 1 && a.signalType && a.signalType === b.signalType) {
          bad.add(a.edgeId);
          bad.add(b.edgeId);
        }
      }
    }
  }

  // An edge that crosses 3+ distinct other edges is also flagged —
  // likely has a cleaner route available
  for (const e of allEdges) {
    const crosses = pairCrossings.get(e.edgeId)!;
    if (crosses.size >= 3) {
      bad.add(e.edgeId);
    }
  }

  return bad;
}

// ---------- Penalty zone construction ----------

export function buildPenaltyZones(
  goodEdges: { segments: Segment[]; signalType?: string }[],
): PenaltyZone[] {
  const zones: PenaltyZone[] = [];
  for (const edge of goodEdges) {
    for (const seg of edge.segments) {
      if (seg.axis === "v") {
        zones.push({
          axis: "v",
          coordinate: px2g(seg.x1),
          rangeMin: px2g(Math.min(seg.y1, seg.y2)),
          rangeMax: px2g(Math.max(seg.y1, seg.y2)),
          signalType: edge.signalType,
        });
      } else {
        zones.push({
          axis: "h",
          coordinate: px2g(seg.y1),
          rangeMin: px2g(Math.min(seg.x1, seg.x2)),
          rangeMax: px2g(Math.max(seg.x1, seg.x2)),
          signalType: edge.signalType,
        });
      }
    }
  }
  return zones;
}

// ---------- Debug reporting ----------

interface EdgeEndpoints {
  edge: ConnectionEdge;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  stubSpread: number;
  /** True if source handle exits to the right (normal), false if to the left (flipped) */
  sourceExitsRight: boolean;
  /** True if target handle enters from the left (normal), false if from the right (flipped) */
  targetEntersLeft: boolean;
}

interface RouteState {
  edgeId: string;
  waypoints: Point[];
  segments: Segment[];
  svgPath: string;
  labelX: number;
  labelY: number;
  turns: string;
  status: "good" | "bad";
  signalType?: string;
}

function logRoutingReport(
  routeStates: RouteState[],
  edgeEndpoints: EdgeEndpoints[],
) {
  // All coordinates in GRID units (1 unit = 20px cell)
  const g = px2g;

  // --- Build edge info with corridor X ---
  type EdgeInfo = {
    id: string;
    srcX: number; srcY: number;
    tgtX: number; tgtY: number;
    corridorX: number | null; // primary vertical corridor, null if straight
    dir: "down" | "up" | "flat";
    vSpan: number; // absolute vertical span in grid cells
    crossings: number;
  };
  const edgeInfos: EdgeInfo[] = [];
  for (const rs of routeStates) {
    const ep = edgeEndpoints.find((e) => e.edge.id === rs.edgeId);
    if (!ep) continue;
    const srcX = g(ep.sourceX), srcY = g(ep.sourceY);
    const tgtX = g(ep.targetX), tgtY = g(ep.targetY);
    // Primary corridor = longest vertical segment
    const vSegs = rs.segments.filter((s) => s.axis === "v");
    let corridorX: number | null = null;
    if (vSegs.length > 0) {
      const longest = vSegs.reduce((a, b) =>
        Math.abs(a.y2 - a.y1) > Math.abs(b.y2 - b.y1) ? a : b
      );
      corridorX = g(longest.x1);
    }
    const dir = tgtY > srcY ? "down" : tgtY < srcY ? "up" : "flat";
    edgeInfos.push({ id: rs.edgeId, srcX, srcY, tgtX, tgtY, corridorX, dir, vSpan: Math.abs(tgtY - srcY), crossings: 0 });
  }

  // --- Crossing detection ---
  const weaves: { a: string; b: string; count: number }[] = [];
  const allSegments = routeStates.map((rs) => ({ id: rs.edgeId, segments: rs.segments }));
  let totalCrossings = 0;
  let totalWeaves = 0;
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      let count = 0;
      for (const sa of allSegments[i].segments) {
        for (const sb of allSegments[j].segments) {
          if (segmentsCross(sa, sb)) count++;
        }
      }
      if (count > 0) {
        totalCrossings += count;
        const ai = edgeInfos.find((e) => e.id === allSegments[i].id);
        const bi = edgeInfos.find((e) => e.id === allSegments[j].id);
        if (ai) ai.crossings += count;
        if (bi) bi.crossings += count;
        if (count >= 2) {
          totalWeaves += count;
          weaves.push({ a: allSegments[i].id, b: allSegments[j].id, count });
        }
      }
    }
  }

  // --- Fan group detection ---
  // Group edges by (srcX, tgtX) proximity — edges within 5 grid cells of each other's src/tgt X
  type FanGroup = { srcXRange: [number, number]; tgtXRange: [number, number]; edges: EdgeInfo[] };
  const fanGroups: FanGroup[] = [];
  for (const ei of edgeInfos) {
    if (ei.corridorX === null) continue; // skip straight lines
    let placed = false;
    for (const fg of fanGroups) {
      if (Math.abs(ei.srcX - fg.srcXRange[0]) <= 15 && Math.abs(ei.tgtX - fg.tgtXRange[0]) <= 5) {
        fg.edges.push(ei);
        fg.srcXRange[0] = Math.min(fg.srcXRange[0], ei.srcX);
        fg.srcXRange[1] = Math.max(fg.srcXRange[1], ei.srcX);
        fg.tgtXRange[0] = Math.min(fg.tgtXRange[0], ei.tgtX);
        fg.tgtXRange[1] = Math.max(fg.tgtXRange[1], ei.tgtX);
        placed = true;
        break;
      }
    }
    if (!placed) {
      fanGroups.push({ srcXRange: [ei.srcX, ei.srcX], tgtXRange: [ei.tgtX, ei.tgtX], edges: [ei] });
    }
  }

  // --- Console output ---
  console.group(`%c🔀 Routing Report — ${routeStates.length} edges`, "font-weight:bold; font-size:14px; color:#4fc3f7");

  for (const fg of fanGroups) {
    if (fg.edges.length < 2) continue;
    const srcDesc = fg.srcXRange[0] === fg.srcXRange[1] ? `x=${fg.srcXRange[0]}` : `x=${fg.srcXRange[0]}..${fg.srcXRange[1]}`;
    const tgtDesc = fg.tgtXRange[0] === fg.tgtXRange[1] ? `x=${fg.tgtXRange[0]}` : `x=${fg.tgtXRange[0]}..${fg.tgtXRange[1]}`;
    console.log(`%cFan: ${srcDesc} → ${tgtDesc} (${fg.edges.length} edges)`, "font-weight:bold; color:#81c784");
    // Sort by target Y for display
    const sorted = [...fg.edges].sort((a, b) => a.tgtY - b.tgtY);
    for (const e of sorted) {
      const cx = e.crossings > 0 ? ` ✗ ${e.crossings}cx` : " ✓";
      console.log(`  src=(${e.srcX},${e.srcY}) tgt=(${e.tgtX},${e.tgtY}) corridor=x${e.corridorX} ${e.dir} span=${e.vSpan}${cx}`);
    }
  }

  if (weaves.length > 0) {
    console.log(`%cWeaves: ${weaves.length} pairs`, "font-weight:bold; color:#ef5350");
    for (const w of weaves) {
      console.log(`  ${w.a} ↔ ${w.b}: ${w.count}x`);
    }
  }

  console.log(
    `%cSummary: ${totalCrossings} crossings, ${totalWeaves} weave crossings`,
    `font-weight:bold; color:${totalWeaves > 0 ? "#ef5350" : totalCrossings > 0 ? "#ffb74d" : "#66bb6a"}`,
  );
  console.groupEnd();

  // --- Clipboard report (compact, fan-group focused) ---
  const report = {
    edgeCount: routeStates.length,
    grid: "1 unit = 20px",
    summary: { crossings: totalCrossings, weaves: totalWeaves },
    fanGroups: fanGroups.filter((fg) => fg.edges.length >= 2).map((fg) => ({
      src: fg.srcXRange[0] === fg.srcXRange[1] ? fg.srcXRange[0] : fg.srcXRange,
      tgt: fg.tgtXRange[0] === fg.tgtXRange[1] ? fg.tgtXRange[0] : fg.tgtXRange,
      edges: [...fg.edges].sort((a, b) => a.tgtY - b.tgtY).map((e) => ({
        id: e.id,
        srcY: e.srcY,
        tgtY: e.tgtY,
        corridor: e.corridorX,
        dir: e.dir,
        span: e.vSpan,
        crossings: e.crossings,
      })),
    })),
    weaves: weaves.map((w) => ({ edges: [w.a, w.b], count: w.count })),
    soloEdges: edgeInfos.filter((e) => e.corridorX !== null && !fanGroups.some((fg) => fg.edges.length >= 2 && fg.edges.includes(e))).map((e) => ({
      id: e.id,
      src: { x: e.srcX, y: e.srcY },
      tgt: { x: e.tgtX, y: e.tgtY },
      corridor: e.corridorX,
      crossings: e.crossings,
    })),
  };
  (window as unknown as Record<string, unknown>).__routingReport = report;
}

// ---------- Title block obstacles ----------

/**
 * Compute obstacle rects for the title block area on each print page.
 * The title block occupies the bottom of each page's content area.
 */
function buildTitleBlockObstacles(
  nodes: SchematicNode[],
  printConfig: PrintConfig,
): Rect[] {
  const paper = getPaperSize(printConfig.paperId, printConfig.customWidthIn, printConfig.customHeightIn);

  const pages = computePageGrid(
    paper,
    printConfig.orientation,
    printConfig.scale,
    nodes,
  );

  const marginPx = (PAGE_MARGIN_IN * DPI) / printConfig.scale;
  const titleBlockPx = (TITLE_BLOCK_HEIGHT_IN * DPI) / printConfig.scale;

  const rects: Rect[] = [];
  for (const page of pages) {
    // Title block sits below the content area, above the bottom margin
    const top = page.y + page.heightPx - marginPx - titleBlockPx;
    const bottom = top + titleBlockPx;
    const left = page.contentX;
    const right = page.contentX + page.contentW;
    rects.push({ left, top, right, bottom });
  }
  return rects;
}

/**
 * After routing an edge, add its turn points as obstacle rects so
 * subsequent edges can't use those grid points. Each turn point becomes
 * a single-pixel obstacle that covers the exact grid cell.
 */
function blockTurnPoints(waypoints: Point[], obstacleRects: Rect[]) {
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    const isTurn = (prev.x !== next.x) && (prev.y !== next.y);
    if (isTurn) {
      // Create a rect that exactly covers the grid cell at this pixel position
      obstacleRects.push({
        left: curr.x,
        top: curr.y,
        right: curr.x,
        bottom: curr.y,
        nodeId: `turn-${curr.x}-${curr.y}`,
      });
    }
  }
}

// ---------- Main routing function ----------

export interface RouteAllResult {
  routes: Record<string, RoutedEdge>;
  overBudget: boolean;
}

const DEFAULT_TIME_BUDGET_MS = 3000;

export function routeAllEdges(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  rfInstance: ReactFlowInstance,
  debug?: boolean,
  printConfig?: PrintConfig,
  timeBudgetMs: number = DEFAULT_TIME_BUDGET_MS,
): RouteAllResult {
  const startTime = performance.now();
  let overBudget = false;
  // Build handle position map
  const handleMap = new Map<string, HandlePos>();
  for (const node of nodes) {
    for (const hp of getHandlePositions(node.id, rfInstance)) {
      handleMap.set(`${node.id}:${hp.id}`, hp);
    }
  }

  // Build obstacles once (all devices)
  const getAbsPosAdapter = (n: { id: string; position: { x: number; y: number }; parentId?: string }) =>
    getAbsPos(n as SchematicNode, nodes);
  const obs = buildObstacles(nodes, [], getAbsPosAdapter);

  // Add title block obstacles in print view
  if (printConfig) {
    const tbRects = buildTitleBlockObstacles(nodes, printConfig);
    obs.rects.push(...tbRects);
  }

  // Resolve edge endpoints
  const edgeEndpoints: EdgeEndpoints[] = [];
  for (const edge of edges) {
    const srcHandle = handleMap.get(
      `${edge.source}:${edge.sourceHandle}`,
    );
    const tgtHandle = handleMap.get(
      `${edge.target}:${edge.targetHandle}`,
    );

    if (!srcHandle || !tgtHandle) continue; // node not measured yet

    const stubSpread = computeStubSpread(edge.id, edge.source, edges, nodes);

    // Determine handle exit directions by comparing handle X to node center X.
    // Handles on the right half of their device exit rightward, left half exit leftward.
    const srcNode = nodes.find((n) => n.id === edge.source);
    const tgtNode = nodes.find((n) => n.id === edge.target);
    const srcPos = srcNode ? getAbsPos(srcNode, nodes) : { x: 0, y: 0 };
    const tgtPos = tgtNode ? getAbsPos(tgtNode, nodes) : { x: 0, y: 0 };
    const srcCenterX = srcPos.x + (srcNode?.measured?.width ?? 180) / 2;
    const tgtCenterX = tgtPos.x + (tgtNode?.measured?.width ?? 180) / 2;

    edgeEndpoints.push({
      edge,
      sourceX: srcHandle.absX,
      sourceY: srcHandle.absY,
      targetX: tgtHandle.absX,
      targetY: tgtHandle.absY,
      stubSpread,
      sourceExitsRight: srcHandle.absX >= srcCenterX,
      targetEntersLeft: tgtHandle.absX <= tgtCenterX,
    });
  }

  // Sort order determines corridor priority — edges routed first claim corridors,
  // later edges route around them via penalty zones.
  // Strategy 0 (default): signal-type grouping → shortest Manhattan distance → position
  // Strategy 1: longest Manhattan distance first
  // Strategy 2: most-connected device first
  const signalTypeCounts = new Map<string, number>();
  for (const ep of edgeEndpoints) {
    const sig = ep.edge.data?.signalType ?? "";
    signalTypeCounts.set(sig, (signalTypeCounts.get(sig) ?? 0) + 1);
  }

  // Strategy 2 pre-computation: count edges per device
  let deviceEdgeCounts: Map<string, number> | undefined;
  if (ROUTER_PARAMS.SORT_STRATEGY === 2) {
    deviceEdgeCounts = new Map<string, number>();
    for (const ep of edgeEndpoints) {
      deviceEdgeCounts.set(ep.edge.source, (deviceEdgeCounts.get(ep.edge.source) ?? 0) + 1);
      deviceEdgeCounts.set(ep.edge.target, (deviceEdgeCounts.get(ep.edge.target) ?? 0) + 1);
    }
  }

  edgeEndpoints.sort((a, b) => {
    // Manual edges always route first regardless of strategy
    const aManual = a.edge.data?.manualWaypoints?.length ? 1 : 0;
    const bManual = b.edge.data?.manualWaypoints?.length ? 1 : 0;
    if (aManual !== bManual) return bManual - aManual; // manual first

    if (ROUTER_PARAMS.SORT_STRATEGY === 1) {
      // Strategy 1: longest Manhattan distance first
      const aDist = Math.abs(a.targetX - a.sourceX) + Math.abs(a.targetY - a.sourceY);
      const bDist = Math.abs(b.targetX - b.sourceX) + Math.abs(b.targetY - b.sourceY);
      if (aDist !== bDist) return bDist - aDist; // longest first
    } else if (ROUTER_PARAMS.SORT_STRATEGY === 2) {
      // Strategy 2: most-connected device first
      const aMax = Math.max(deviceEdgeCounts!.get(a.edge.source) ?? 0, deviceEdgeCounts!.get(a.edge.target) ?? 0);
      const bMax = Math.max(deviceEdgeCounts!.get(b.edge.source) ?? 0, deviceEdgeCounts!.get(b.edge.target) ?? 0);
      if (aMax !== bMax) return bMax - aMax; // most connections first
    } else {
      // Strategy 0 (default): signal-type grouping → shortest distance → position
      // Group by signal type — most common type routes first to establish
      // primary corridors. Same-signal edges route consecutively for clustering.
      const aSig = a.edge.data?.signalType ?? "";
      const bSig = b.edge.data?.signalType ?? "";
      if (aSig !== bSig) {
        const aCount = signalTypeCounts.get(aSig) ?? 0;
        const bCount = signalTypeCounts.get(bSig) ?? 0;
        if (aCount !== bCount) return bCount - aCount; // more edges first
        return aSig < bSig ? -1 : 1; // alphabetical tiebreaker
      }
      // Shortest connection length routes first — short connections need
      // direct corridors, longer ones can afford detours. Manhattan distance
      // captures both X and Y span, improving dense-layout convergence (#14).
      const aDist = Math.abs(a.targetX - a.sourceX) + Math.abs(a.targetY - a.sourceY);
      const bDist = Math.abs(b.targetX - b.sourceX) + Math.abs(b.targetY - b.sourceY);
      if (aDist !== bDist) return aDist - bDist;
    }

    // Position tiebreaker (shared by all strategies)
    const aY = Math.min(a.sourceY, a.targetY);
    const bY = Math.min(b.sourceY, b.targetY);
    if (aY !== bY) return aY - bY;
    const aX = Math.min(a.sourceX, a.targetX);
    const bX = Math.min(b.sourceX, b.targetX);
    return aX - bX;
  });

  const results: Record<string, RoutedEdge> = {};

  // PHASE 1 — Incremental routing (each edge aware of previously routed edges)
  // Edges are sorted top-to-bottom so upper edges claim corridors first,
  // and subsequent edges route around them via penalty zones.
  const routeStates: RouteState[] = [];

  for (const ep of edgeEndpoints) {
    const sigType = ep.edge.data?.signalType;

    // Build penalties from all edges routed so far
    const penalties = buildPenaltyZones(routeStates);

    // Manual waypoints — A* route each leg between user-placed handles
    const manualWps = ep.edge.data?.manualWaypoints;
    if (manualWps && manualWps.length >= 1) {
      // Build legs: source→h1, h1→h2, ..., hN→target
      const allPoints = [
        { x: ep.sourceX, y: ep.sourceY },
        ...manualWps,
        { x: ep.targetX, y: ep.targetY },
      ];

      const allWaypoints: Point[] = [];
      let allFailed = false;
      let prevArrivalDir: number | undefined;

      // Pre-compute the ideal exit direction at each handle by looking ahead
      // to the next point. This direction is "reserved" for the outgoing leg,
      // so the incoming leg must arrive from a different side.
      // Index i corresponds to allPoints[i] (handles are indices 1..N-1).
      const reservedExitDir: (number | undefined)[] = new Array(allPoints.length).fill(undefined);
      for (let i = 1; i < allPoints.length - 1; i++) {
        const handle = allPoints[i];
        const next = allPoints[i + 1];
        const dx = next.x - handle.x;
        const dy = next.y - handle.y;
        // Pick the dominant axis direction toward the next point
        if (Math.abs(dx) >= Math.abs(dy)) {
          reservedExitDir[i] = dx >= 0 ? 0 : 2; // RIGHT or LEFT
        } else {
          reservedExitDir[i] = dy >= 0 ? 1 : 3; // DOWN or UP
        }
      }

      const lastLeg = allPoints.length - 2;
      for (let leg = 0; leg < allPoints.length - 1; leg++) {
        const from = allPoints[leg];
        const to = allPoints[leg + 1];

        const isFirstLeg = leg === 0;
        const isLastLeg = leg === lastLeg;

        const spread = isFirstLeg ? ep.stubSpread : 0;
        const noSourceStub = !isFirstLeg;
        const noTargetStub = !isLastLeg;

        // Two constraints prevent doubling back at handles:
        // 1. Don't START in the reverse of the previous leg's arrival direction
        const excludeDir = prevArrivalDir !== undefined
          ? (prevArrivalDir + 2) % 4
          : undefined;
        // 2. Don't ARRIVE from the opposite of the reserved exit direction.
        //    If the reserved exit is RIGHT(0), arriving LEFT(2) would cause
        //    the next leg's U-turn prevention to block RIGHT — the exact
        //    direction it needs. So exclude arriving in (reservedExit+2)%4.
        const reserved = reservedExitDir[leg + 1];
        const reservedAtTarget = reserved !== undefined
          ? (reserved + 2) % 4
          : undefined;

        // Manual edges route first in the sort order, so penalties here
        // are empty or only from other manual edges — giving them a clean slate.
        // Auto edges route later and see the manual edge penalty zones.
        let legResult = computeEdgePath(
          from.x, from.y, to.x, to.y,
          obs.rects, 0, spread,
          penalties.length > 0 ? penalties : undefined,
          sigType,
          noSourceStub,
          noTargetStub,
          excludeDir,
          reservedAtTarget,
        );

        // Retry with relaxed obstacles if A* fails (filter cached list instead of rebuilding)
        if (!legResult) {
          const excludeSet = new Set([ep.edge.source, ep.edge.target]);
          const relaxedRects = obs.rects.filter((r) => !r.nodeId || !excludeSet.has(r.nodeId));
          legResult = computeEdgePath(
            from.x, from.y, to.x, to.y,
            relaxedRects, 0, spread,
            penalties.length > 0 ? penalties : undefined,
            sigType,
            noSourceStub,
            noTargetStub,
            excludeDir,
            reservedAtTarget,
          );
        }

        if (legResult) {
          prevArrivalDir = legResult.arrivalDir;
          // Concatenate waypoints, skip first point of subsequent legs (it's the
          // same as the last point of the previous leg)
          if (allWaypoints.length > 0) {
            allWaypoints.push(...legResult.waypoints.slice(1));
          } else {
            allWaypoints.push(...legResult.waypoints);
          }
        } else {
          allFailed = true;
          break;
        }
      }

      if (!allFailed && allWaypoints.length >= 2) {
        // Don't simplify the concatenated path — simplifyWaypoints removes collinear
        // points, which can eliminate the manual handle positions when they happen
        // to be collinear with adjacent A* waypoints. Each leg is already simplified
        // internally by computeEdgePath.
        const svgPath = waypointsToSvgPath(allWaypoints);
        const segments = extractSegments(allWaypoints);
        const midIdx = Math.floor(allWaypoints.length / 2);

        routeStates.push({
          edgeId: ep.edge.id,
          waypoints: allWaypoints,
          segments,
          svgPath,
          labelX: allWaypoints[midIdx]?.x ?? ep.sourceX,
          labelY: allWaypoints[midIdx]?.y ?? ep.sourceY,
          turns: "manual",
          status: "good",
          signalType: sigType,
        });
        continue;
      }

      // Fallback: orthogonalize if A* failed on any leg
      const fallbackWp = simplifyWaypoints(orthogonalize(allPoints));
      const fbSvg = waypointsToSvgPath(fallbackWp);
      const fbSegs = extractSegments(fallbackWp);
      const fbMid = Math.floor(fallbackWp.length / 2);
      routeStates.push({
        edgeId: ep.edge.id,
        waypoints: fallbackWp,
        segments: fbSegs,
        svgPath: fbSvg,
        labelX: fallbackWp[fbMid]?.x ?? ep.sourceX,
        labelY: fallbackWp[fbMid]?.y ?? ep.sourceY,
        turns: "manual-fallback",
        status: "good",
        signalType: sigType,
      });
      continue;
    }

    let result = computeEdgePath(
      ep.sourceX,
      ep.sourceY,
      ep.targetX,
      ep.targetY,
      obs.rects,
      0,
      ep.stubSpread,
      penalties.length > 0 ? penalties : undefined,
      sigType,
      undefined, undefined, undefined, undefined, undefined,
      ep.sourceExitsRight,
      ep.targetEntersLeft,
    );

    // If A* fails (often because endpoint devices' padded rects block the corridor),
    // retry with endpoint devices excluded from obstacles so the edge can route
    // through the visible gap between the devices it connects.
    if (!result) {
      const excludeSet2 = new Set([ep.edge.source, ep.edge.target]);
      const relaxedRects2 = obs.rects.filter((r) => !r.nodeId || !excludeSet2.has(r.nodeId));
      result = computeEdgePath(
        ep.sourceX,
        ep.sourceY,
        ep.targetX,
        ep.targetY,
        relaxedRects2,
        0,
        ep.stubSpread,
        penalties.length > 0 ? penalties : undefined,
        sigType,
        undefined, undefined, undefined, undefined, undefined,
        ep.sourceExitsRight,
        ep.targetEntersLeft,
      );
    }

    if (result) {
      const segments = extractSegments(result.waypoints);
      routeStates.push({
        edgeId: ep.edge.id,
        waypoints: result.waypoints,
        segments,
        svgPath: result.path,
        labelX: result.labelX,
        labelY: result.labelY,
        turns: result.turns,
        status: "good",
        signalType: sigType,
      });
      // Block turn points for subsequent edges — interior waypoints where direction changes
      blockTurnPoints(result.waypoints, obs.rects);
    } else {
      // Fallback: orthogonal L-shape (never draw a diagonal)
      // Go right from source, then vertical to target Y, then into target
      const midX = Math.max(ep.sourceX, ep.targetX) + 40;
      const wp: Point[] = [
        { x: ep.sourceX, y: ep.sourceY },
        { x: midX, y: ep.sourceY },
        { x: midX, y: ep.targetY },
        { x: ep.targetX, y: ep.targetY },
      ];
      const simplified = wp; // Already minimal waypoints
      const svgPath = simplified.map((p, i) =>
        i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
      ).join(" ");
      routeStates.push({
        edgeId: ep.edge.id,
        waypoints: simplified,
        segments: extractSegments(simplified),
        svgPath,
        labelX: midX,
        labelY: (ep.sourceY + ep.targetY) / 2,
        turns: "fallback",
        status: "bad",
        signalType: sigType,
      });
      blockTurnPoints(wp, obs.rects);
    }

    // Time budget check: bail out of Phase 1 early if over budget
    if (performance.now() - startTime > timeBudgetMs) {
      overBudget = true;
      break;
    }
  }

  // Stubbed edges should be excluded from crossing detection —
  // their invisible middle sections shouldn't affect other edges.
  const stubbedIds = new Set(edgeEndpoints.filter((ep) => ep.edge.data?.stubbed).map((ep) => ep.edge.id));

  // PHASE 2 — Fan-group track assignment (VLSI channel routing approach)
  // A* can't solve multi-edge nesting because it routes edges sequentially.
  // After Phase 1, detect fan groups (edges sharing a target device) and
  // reassign corridor positions so they nest cleanly: topmost target →
  // outermost corridor (highest X), bottommost → innermost (lowest X).
  if (!overBudget) {
    const g = px2g;

    // Build edge info for fan group detection
    type FanEdge = { id: string; srcX: number; srcY: number; tgtX: number; tgtY: number; corridorX: number | null; rs: RouteState; ep: EdgeEndpoints };
    const fanEdges: FanEdge[] = [];
    for (const rs of routeStates) {
      const ep = edgeEndpoints.find((e) => e.edge.id === rs.edgeId);
      if (!ep) continue;
      if (stubbedIds.has(rs.edgeId)) continue;
      if (ep.edge.data?.manualWaypoints?.length) continue;
      const vSegs = rs.segments.filter((s) => s.axis === "v");
      let corridorX: number | null = null;
      if (vSegs.length > 0) {
        const longest = vSegs.reduce((a, b) => Math.abs(a.y2 - a.y1) > Math.abs(b.y2 - b.y1) ? a : b);
        corridorX = g(longest.x1);
      }
      fanEdges.push({ id: rs.edgeId, srcX: g(ep.sourceX), srcY: g(ep.sourceY), tgtX: g(ep.targetX), tgtY: g(ep.targetY), corridorX, rs, ep });
    }

    // Group by target device (tgtX proximity ≤ 5 grid cells)
    type FanGroup = { tgtX: number; edges: FanEdge[] };
    const fanGroups: FanGroup[] = [];
    for (const fe of fanEdges) {
      if (fe.corridorX === null) continue;
      let placed = false;
      for (const fg of fanGroups) {
        if (Math.abs(fe.tgtX - fg.tgtX) <= 5) {
          fg.edges.push(fe);
          placed = true;
          break;
        }
      }
      if (!placed) {
        fanGroups.push({ tgtX: fe.tgtX, edges: [fe] });
      }
    }

    // Process each fan group with 2+ edges
    const gridRects = pixelRectsToGrid(obs.rects);
    const isColumnClear = (gx: number, gyMin: number, gyMax: number): boolean => {
      for (const r of gridRects) {
        // Skip turn-point obstacles (they'll be removed during rip-up)
        if (r.nodeId?.startsWith("turn-")) continue;
        if (gx >= r.left && gx <= r.right && gyMax >= r.top && gyMin <= r.bottom) {
          return false;
        }
      }
      return true;
    };

    console.log(`[Phase 2] ${fanGroups.length} fan groups detected, sizes: ${fanGroups.map((fg) => fg.edges.length).join(", ")}`);

    for (const fg of fanGroups) {
      if (fg.edges.length < 2) continue;

      // Sort by target Y ascending → assign corridors from highest X to lowest
      const sorted = [...fg.edges].sort((a, b) => a.tgtY - b.tgtY);

      // Check if already correctly nested (corridors monotonically decreasing)
      let alreadyNested = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].corridorX !== null && sorted[i - 1].corridorX !== null &&
            sorted[i].corridorX! >= sorted[i - 1].corridorX!) {
          alreadyNested = false;
          break;
        }
      }
      console.log(`[Phase 2] Group tgtX=${fg.tgtX}: ${sorted.length} edges, nested=${alreadyNested}, corridors=[${sorted.map((e) => e.corridorX).join(",")}]`);
      if (alreadyNested) continue;

      // Determine group direction: up-right vs down-right
      // For down-right: topmost target → highest X (outer near target)
      // For up-right: topmost target → lowest X (inner near source)
      const upCount = sorted.filter((e) => e.srcY > e.tgtY).length;
      const goingUp = upCount > sorted.length / 2;

      const maxTgtX = Math.max(...sorted.map((e) => e.tgtX));
      const minSrcX = Math.min(...sorted.map((e) => e.srcX));

      const assignments = new Map<string, number>(); // edgeId → assigned corridor X

      if (goingUp) {
        // Up-right: assign from source side outward (lowest X first)
        let nextX = minSrcX + 2; // Start just past source device
        for (const fe of sorted) {
          const yMin = Math.min(fe.srcY, fe.tgtY);
          const yMax = Math.max(fe.srcY, fe.tgtY);
          let assignedX: number | null = null;
          for (let gx = nextX; gx < maxTgtX - 1; gx++) {
            if (isColumnClear(gx, yMin, yMax)) {
              assignedX = gx;
              break;
            }
          }
          if (assignedX !== null) {
            assignments.set(fe.id, assignedX);
            nextX = assignedX + 1;
          }
        }
      } else {
        // Down-right: assign from target side inward (highest X first)
        let nextX = maxTgtX - 2;
        for (const fe of sorted) {
          const yMin = Math.min(fe.srcY, fe.tgtY);
          const yMax = Math.max(fe.srcY, fe.tgtY);
          let assignedX: number | null = null;
          for (let gx = nextX; gx > minSrcX + 2; gx--) {
            if (isColumnClear(gx, yMin, yMax)) {
              assignedX = gx;
              break;
            }
          }
          if (assignedX !== null) {
            assignments.set(fe.id, assignedX);
            nextX = assignedX - 1;
          }
        }
      }

      console.log(`[Phase 2] Assignments: ${[...assignments.entries()].map(([id, x]) => `${id.slice(0, 12)}→x${x}`).join(", ")}`);
      if (assignments.size === 0) continue;

      // Rip up assigned edges: remove from routeStates and clear turn-point obstacles
      const assignedIds = new Set(assignments.keys());
      for (const rs of routeStates) {
        if (!assignedIds.has(rs.edgeId)) continue;
        for (let wi = 1; wi < rs.waypoints.length - 1; wi++) {
          const prev = rs.waypoints[wi - 1];
          const curr = rs.waypoints[wi];
          const next = rs.waypoints[wi + 1];
          if ((prev.x !== next.x) && (prev.y !== next.y)) {
            const turnId = `turn-${curr.x}-${curr.y}`;
            for (let oi = obs.rects.length - 1; oi >= 0; oi--) {
              if (obs.rects[oi].nodeId === turnId) { obs.rects.splice(oi, 1); break; }
            }
          }
        }
      }
      const keptStates = routeStates.filter((rs) => !assignedIds.has(rs.edgeId));
      routeStates.length = 0;
      routeStates.push(...keptStates);

      // Rebuild L-shapes at assigned positions
      for (const fe of sorted) {
        const assignedX = assignments.get(fe.id);
        if (assignedX === undefined) continue;

        const turnPx = g2px(assignedX);
        const wp: Point[] = [
          { x: fe.ep.sourceX, y: fe.ep.sourceY },
          { x: turnPx, y: fe.ep.sourceY },
          { x: turnPx, y: fe.ep.targetY },
          { x: fe.ep.targetX, y: fe.ep.targetY },
        ];
        const svgPath = waypointsToSvgPath(wp);
        const sigType = fe.ep.edge.data?.signalType;
        routeStates.push({
          edgeId: fe.id,
          waypoints: wp,
          segments: extractSegments(wp),
          svgPath,
          labelX: turnPx,
          labelY: (fe.ep.sourceY + fe.ep.targetY) / 2,
          turns: `${turnPx},${fe.ep.sourceY} → ${turnPx},${fe.ep.targetY}`,
          status: "good",
          signalType: sigType,
        });
        blockTurnPoints(wp, obs.rects);
      }
    }
  }

  // Detect crossing points between all edge pairs (skip if over budget — cosmetic only).
  // Horizontal edge at a crossing gets an arc (hop over);
  // vertical edge at the same crossing gets a gap (moveTo cut).
  const arcCrossingMap = new Map<string, CrossingPoint[]>();
  const gapCrossingMap = new Map<string, CrossingPoint[]>();
  if (!overBudget) {
    for (const rs of routeStates) {
      arcCrossingMap.set(rs.edgeId, []);
      gapCrossingMap.set(rs.edgeId, []);
    }
    for (let i = 0; i < routeStates.length; i++) {
      for (let j = i + 1; j < routeStates.length; j++) {
        const a = routeStates[i];
        const b = routeStates[j];
        if (stubbedIds.has(a.edgeId) || stubbedIds.has(b.edgeId)) continue;
        for (const sa of a.segments) {
          for (const sb of b.segments) {
            if (segmentsCross(sa, sb)) {
              const h = sa.axis === "h" ? sa : sb;
              const v = sa.axis === "v" ? sa : sb;
              const pt: CrossingPoint = { x: v.x1, y: h.y1 };
              if (sa.axis === "h") {
                arcCrossingMap.get(a.edgeId)!.push(pt);
                gapCrossingMap.get(b.edgeId)!.push(pt);
              } else {
                arcCrossingMap.get(b.edgeId)!.push(pt);
                gapCrossingMap.get(a.edgeId)!.push(pt);
              }
            }
          }
        }
      }
    }
  }

  // Build final results
  for (const rs of routeStates) {
    const arcPts = arcCrossingMap.get(rs.edgeId) ?? [];
    const gapPts = gapCrossingMap.get(rs.edgeId) ?? [];
    const hopPath = (arcPts.length > 0 || gapPts.length > 0)
      ? waypointsToSvgPathWithHops(rs.waypoints, arcPts, gapPts)
      : undefined;
    results[rs.edgeId] = {
      edgeId: rs.edgeId,
      svgPath: rs.svgPath,
      svgPathWithHops: hopPath,
      waypoints: rs.waypoints,
      segments: rs.segments,
      labelX: rs.labelX,
      labelY: rs.labelY,
      turns: rs.turns,
      crossingPoints: arcPts,
    };
  }

  if (debug) {
    logRoutingReport(routeStates, edgeEndpoints);
  }

  // Export debug data for overlay and Claude analysis
  const finalPenalties = buildPenaltyZones(routeStates);

  const w = globalThis as unknown as Record<string, unknown>;
  w.__routingDebug = {
    obstacles: obs.rects,
    penaltyZones: finalPenalties,
    edges: Object.fromEntries(edgeEndpoints.map((ep) => {
      const rs = routeStates.find((r) => r.edgeId === ep.edge.id);
      return [ep.edge.id, {
        source: { x: ep.sourceX, y: ep.sourceY, exitsRight: ep.sourceExitsRight },
        target: { x: ep.targetX, y: ep.targetY, entersLeft: ep.targetEntersLeft },
        signalType: ep.edge.data?.signalType,
        path: rs?.waypoints ?? [],
        turns: rs?.turns ?? "",
        status: rs?.status ?? "unknown",
      }];
    })),
  };

  return { routes: results, overBudget };
}
