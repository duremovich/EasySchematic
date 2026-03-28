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
  // All coordinates in this report are GRID units (1 unit = 20px cell)
  const g = px2g; // shorthand

  const allEdges = routeStates.map((rs) => ({
    edgeId: rs.edgeId,
    segments: rs.segments,
  }));

  // Build full crossing matrix
  const crossings: {
    edgeA: string;
    edgeB: string;
    count: number;
    points: string[];
  }[] = [];

  for (let i = 0; i < allEdges.length; i++) {
    for (let j = i + 1; j < allEdges.length; j++) {
      const a = allEdges[i];
      const b = allEdges[j];
      let crossCount = 0;
      const crossPts: string[] = [];
      for (const sa of a.segments) {
        for (const sb of b.segments) {
          if (segmentsCross(sa, sb)) {
            crossCount++;
            const h = sa.axis === "h" ? sa : sb;
            const v = sa.axis === "v" ? sa : sb;
            crossPts.push(`(${g(v.x1)}, ${g(h.y1)})`);
          }
        }
      }
      if (crossCount > 0) {
        crossings.push({
          edgeA: a.edgeId,
          edgeB: b.edgeId,
          count: crossCount,
          points: crossPts,
        });
      }
    }
  }

  // Build overlap list
  const overlaps: { edgeA: string; edgeB: string; axis: string }[] = [];
  for (let i = 0; i < allEdges.length; i++) {
    for (let j = i + 1; j < allEdges.length; j++) {
      for (const sa of allEdges[i].segments) {
        for (const sb of allEdges[j].segments) {
          if (segmentsOverlap(sa, sb)) {
            overlaps.push({
              edgeA: allEdges[i].edgeId,
              edgeB: allEdges[j].edgeId,
              axis: sa.axis,
            });
          }
        }
      }
    }
  }

  // Per-edge crossing summary
  const edgeCrossingSummary = new Map<
    string,
    { total: number; pairs: Map<string, number> }
  >();
  for (const rs of routeStates) {
    edgeCrossingSummary.set(rs.edgeId, { total: 0, pairs: new Map() });
  }
  for (const c of crossings) {
    const a = edgeCrossingSummary.get(c.edgeA)!;
    const b = edgeCrossingSummary.get(c.edgeB)!;
    a.total += c.count;
    a.pairs.set(c.edgeB, c.count);
    b.total += c.count;
    b.pairs.set(c.edgeA, c.count);
  }

  // Sort edges by total crossings (worst offenders first)
  const sorted = [...edgeCrossingSummary.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  );

  // Double-crossings (weaving) — edges that cross the SAME edge 2+ times
  const weaves = crossings.filter((c) => c.count >= 2);

  console.group(
    `%c🔀 Edge Routing Report — ${routeStates.length} edges (grid coords, 1 unit = 20px)`,
    "font-weight:bold; font-size:14px; color:#4fc3f7",
  );

  // Routing order table
  const orderData = edgeEndpoints.map((ep, i) => ({
    "#": i,
    edge: ep.edge.id,
    src: `(${g(ep.sourceX)}, ${g(ep.sourceY)})`,
    tgt: `(${g(ep.targetX)}, ${g(ep.targetY)})`,
    gSpan: Math.abs(g(ep.targetX) - g(ep.sourceX)),
    stub: ep.stubSpread,
  }));
  console.log("%cRouting order:", "font-weight:bold; color:#81c784");
  console.table(orderData);

  // Vertical segments per edge (the key diagnostic)
  console.log(
    "%cVertical segments (X corridors):",
    "font-weight:bold; color:#81c784",
  );
  for (const rs of routeStates) {
    const vSegs = rs.segments.filter((s) => s.axis === "v");
    if (vSegs.length === 0) continue;
    const desc = vSegs
      .map(
        (s) =>
          `x=${g(s.x1)} y=[${g(Math.min(s.y1, s.y2))}..${g(Math.max(s.y1, s.y2))}]`,
      )
      .join(", ");
    console.log(`  ${rs.edgeId}: ${desc}`);
  }

  // Crossing summary
  if (crossings.length > 0) {
    console.log(
      "%cCrossings:",
      "font-weight:bold; color:#ffb74d",
    );
    for (const c of crossings) {
      const icon = c.count >= 2 ? "⚠️ WEAVE" : "✕";
      console.log(
        `  ${icon} ${c.edgeA} × ${c.edgeB}: ${c.count}x at ${c.points.join(", ")}`,
      );
    }
  } else {
    console.log("%c✓ No crossings!", "font-weight:bold; color:#66bb6a");
  }

  // Overlaps
  if (overlaps.length > 0) {
    console.log(
      "%cOverlaps (shared segments):",
      "font-weight:bold; color:#ef5350",
    );
    for (const o of overlaps) {
      console.log(`  ${o.edgeA} ↔ ${o.edgeB} (${o.axis})`);
    }
  }

  // Weaving (the worst kind of violation)
  if (weaves.length > 0) {
    console.log(
      "%c⚠️ Double-crossings (weaving):",
      "font-weight:bold; color:#ef5350; font-size:13px",
    );
    for (const w of weaves) {
      const epA = edgeEndpoints.find((e) => e.edge.id === w.edgeA);
      const epB = edgeEndpoints.find((e) => e.edge.id === w.edgeB);
      console.log(
        `  ${w.edgeA} ↔ ${w.edgeB}: ${w.count} crossings at ${w.points.join(", ")}`,
      );
      if (epA) {
        const rsA = routeStates.find((r) => r.edgeId === w.edgeA);
        console.log(
          `    ${w.edgeA}: src=(${g(epA.sourceX)},${g(epA.sourceY)}) tgt=(${g(epA.targetX)},${g(epA.targetY)}) turns=[${rsA?.turns}]`,
        );
      }
      if (epB) {
        const rsB = routeStates.find((r) => r.edgeId === w.edgeB);
        console.log(
          `    ${w.edgeB}: src=(${g(epB.sourceX)},${g(epB.sourceY)}) tgt=(${g(epB.targetX)},${g(epB.targetY)}) turns=[${rsB?.turns}]`,
        );
      }
    }
  }

  // Worst offenders
  const worstOffenders = sorted.filter(([, v]) => v.total > 0);
  if (worstOffenders.length > 0) {
    console.log(
      "%cWorst offenders (by total crossings):",
      "font-weight:bold; color:#ffb74d",
    );
    for (const [edgeId, summary] of worstOffenders.slice(0, 10)) {
      const pairStr = [...summary.pairs.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${id}(${n}x)`)
        .join(", ");
      console.log(`  ${edgeId}: ${summary.total} crossings — ${pairStr}`);
    }
  }

  const totalCrossings = crossings.reduce((sum, c) => sum + c.count, 0);
  const totalWeaves = weaves.reduce((sum, w) => sum + w.count, 0);
  console.log(
    `%cSummary: ${totalCrossings} total crossings, ${totalWeaves} weave crossings, ${overlaps.length} overlaps`,
    `font-weight:bold; color:${totalWeaves > 0 ? "#ef5350" : totalCrossings > 0 ? "#ffb74d" : "#66bb6a"}`,
  );

  console.groupEnd();

  // Stash compact report on window for clipboard copy
  const report = {
    edgeCount: routeStates.length,
    coordSystem: "grid (1 unit = 20px)",
    routingOrder: orderData,
    verticalSegments: routeStates
      .map((rs) => {
        const vSegs = rs.segments.filter((s) => s.axis === "v");
        if (vSegs.length === 0) return null;
        return {
          edge: rs.edgeId,
          corridors: vSegs.map((s) => ({
            x: g(s.x1),
            yMin: g(Math.min(s.y1, s.y2)),
            yMax: g(Math.max(s.y1, s.y2)),
          })),
        };
      })
      .filter(Boolean),
    crossings: crossings.map((c) => ({
      edges: [c.edgeA, c.edgeB],
      count: c.count,
      at: c.points,
      weave: c.count >= 2,
    })),
    overlaps,
    worstOffenders: worstOffenders.slice(0, 10).map(([edgeId, summary]) => ({
      edge: edgeId,
      totalCrossings: summary.total,
      pairs: Object.fromEntries(summary.pairs),
    })),
    summary: { totalCrossings, weaves: totalWeaves, overlaps: overlaps.length },
    edges: routeStates.map((rs) => {
      const ep = edgeEndpoints.find((e) => e.edge.id === rs.edgeId);
      return {
        id: rs.edgeId,
        src: ep ? { x: g(ep.sourceX), y: g(ep.sourceY) } : null,
        tgt: ep ? { x: g(ep.targetX), y: g(ep.targetY) } : null,
        turns: rs.turns,
        waypoints: rs.waypoints.map((p) => ({ x: g(p.x), y: g(p.y) })),
      };
    }),
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
