/**
 * A* orthogonal edge routing on an integer grid.
 * Pure algorithm — no React dependencies.
 *
 * All internal computation uses integer grid coordinates where each cell = 20×20 pixels.
 * Conversion to/from pixel coordinates happens only at the entry/exit boundaries.
 *
 * Key design decisions:
 *  - Direction-aware A* state: (x, y, dir) prevents the closed set from
 *    rejecting better arrivals from a different direction.
 *  - Must arrive at goal horizontally (R2) — vertical arrivals rejected.
 */

// ---------- Types ----------

/** Pixel-coordinate rectangle (used at the boundary for obstacle input). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  nodeId?: string;
}

/** Integer grid-coordinate rectangle. All fields are grid cell indices. */
export interface GridRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  nodeId?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PenaltyZone {
  axis: "h" | "v";
  coordinate: number;  // grid coordinate (col for vertical, row for horizontal)
  rangeMin: number;     // start of segment (grid coord)
  rangeMax: number;     // end of segment (grid coord)
  signalType?: string;
}

interface GridNode {
  xi: number;
  yi: number;
  g: number;
  f: number;
  dir: number; // 0=right,1=down,2=left,3=up
}

// ---------- Constants ----------

/** Grid cell size in pixels. All grid coordinates are multiples of this. */
export const CELL_SIZE = 20;

/** Convert pixel coordinate to grid coordinate. */
export const px2g = (px: number) => Math.round(px / CELL_SIZE);
/** Convert grid coordinate to pixel coordinate. */
export const g2px = (g: number) => g * CELL_SIZE;

/** Default routing parameters. Values are in GRID CELLS unless noted. */
export const ROUTING_DEFAULTS = {
  TURN_PENALTY: 7,        // cost per 90° turn (in grid-cell units)
  SEPARATION_PX: 1,       // overlap penalty zone width (grid cells)
  CROSS_TYPE_SEPARATION: 0,
  OVERLAP_PENALTY: 20,    // full cost for overlapping an existing edge corridor
  SAME_SIGNAL_GAP: 0,
  CROSSING_PENALTY: 12,
  NESTING_BIAS: 0,         // disabled — needs topology-aware direction, revisiting later
  EARLY_TURN_BIAS: 0,
  PAD: 1,                 // 1 grid cell rim around devices
  GAP: 0,
  ESCAPE_MARGIN: 2,       // grid cells of margin beyond bounding box
  STUB: 1,                // 1 grid cell horizontal exit from port
};

/** Tunable routing parameters. Live-overridable via window.__routingParams for debug tuning. */
export const ROUTING_PARAMS: typeof ROUTING_DEFAULTS = new Proxy(ROUTING_DEFAULTS, {
  get(target, prop) {
    const overrides = (globalThis as unknown as Record<string, unknown>).__routingParams as Record<string, number> | undefined;
    if (overrides && prop in overrides) return overrides[prop as string];
    return target[prop as keyof typeof target];
  },
}) as typeof ROUTING_DEFAULTS;

const CORNER_RADIUS = 8;
export const ARC_R = 6;
const GAP_HALF = 3;
const PENALTY_BUCKET = 10; // Grid-cell bucket size for penalty zone spatial index

// ---------- Obstacles ----------

/** Build obstacle rects from nodes. Returns pixel-coordinate rects (converted to grid later). */
export function buildObstacles(
  nodes: readonly { id: string; position: { x: number; y: number }; parentId?: string; measured?: { width?: number; height?: number }; type?: string }[],
  excludeIds: string[],
  getAbsPos: (node: typeof nodes[number]) => { x: number; y: number },
): { rects: Rect[] } {
  const rects: Rect[] = [];
  const pad = ROUTING_PARAMS.PAD * CELL_SIZE; // PAD is in grid cells
  for (const n of nodes) {
    if (n.type === "room" || n.type === "note") continue;
    if (excludeIds.length > 0 && excludeIds.includes(n.id)) continue;
    const pos = getAbsPos(n);
    const w = n.measured?.width ?? 180;
    const h = n.measured?.height ?? 60;
    rects.push({
      left: pos.x - pad,
      top: pos.y - pad,
      right: pos.x + w + pad,
      bottom: pos.y + h + pad,
      nodeId: n.id,
    });
  }
  return { rects };
}

/** Convert pixel-coordinate obstacle rects to grid-coordinate rects. */
export function pixelRectsToGrid(rects: Rect[]): GridRect[] {
  return rects.map((r) => ({
    left: Math.floor(r.left / CELL_SIZE),
    top: Math.floor(r.top / CELL_SIZE),
    right: Math.ceil(r.right / CELL_SIZE),
    bottom: Math.ceil(r.bottom / CELL_SIZE),
    nodeId: r.nodeId,
  }));
}

// ---------- Integer Grid ----------

export interface IntGrid {
  cols: number;
  rows: number;
  originX: number; // grid X of column 0 (so pixel X = (originX + col) * CELL_SIZE)
  originY: number; // grid Y of row 0
  blocked: Uint8Array; // flat: blocked[col * rows + row], 1=blocked 0=free
}

export function buildGrid(
  srcGX: number, srcGY: number,
  tgtGX: number, tgtGY: number,
  gridRects: GridRect[],
  forceOpen?: { gx: number; gy: number }[],
): IntGrid {
  // Bounding box in grid coordinates
  let minGX = Math.min(srcGX, tgtGX);
  let maxGX = Math.max(srcGX, tgtGX);
  let minGY = Math.min(srcGY, tgtGY);
  let maxGY = Math.max(srcGY, tgtGY);
  for (const r of gridRects) {
    minGX = Math.min(minGX, r.left);
    maxGX = Math.max(maxGX, r.right);
    minGY = Math.min(minGY, r.top);
    maxGY = Math.max(maxGY, r.bottom);
  }
  // Escape margin
  const margin = ROUTING_PARAMS.ESCAPE_MARGIN;
  minGX -= margin;
  maxGX += margin;
  minGY -= margin;
  maxGY += margin;

  const cols = maxGX - minGX + 1;
  const rows = maxGY - minGY + 1;

  // Build blocked grid — flat Uint8Array for single allocation + cache locality
  const blocked = new Uint8Array(cols * rows);

  for (const r of gridRects) {
    const cl = Math.max(0, r.left - minGX);
    const cr = Math.min(cols - 1, r.right - minGX);
    const rt = Math.max(0, r.top - minGY);
    const rb = Math.min(rows - 1, r.bottom - minGY);
    for (let c = cl; c <= cr; c++) {
      const base = c * rows;
      for (let row = rt; row <= rb; row++) {
        blocked[base + row] = 1;
      }
    }
  }

  // Force-unblock specific cells (source, target, stub endpoints)
  if (forceOpen) {
    for (const pt of forceOpen) {
      const c = pt.gx - minGX;
      const r = pt.gy - minGY;
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        blocked[c * rows + r] = 0;
      }
    }
  }

  return { cols, rows, originX: minGX, originY: minGY, blocked };
}

/** Build a single global grid covering all obstacles and edge endpoints.
 *  Shared across all A* calls — avoids per-edge grid allocation + obstacle marking. */
export function buildGlobalGrid(
  gridRects: GridRect[],
  endpointGXs: number[],
  endpointGYs: number[],
): IntGrid {
  const margin = ROUTING_PARAMS.ESCAPE_MARGIN;

  let minGX = Infinity, maxGX = -Infinity;
  let minGY = Infinity, maxGY = -Infinity;
  for (const r of gridRects) {
    if (r.left < minGX) minGX = r.left;
    if (r.right > maxGX) maxGX = r.right;
    if (r.top < minGY) minGY = r.top;
    if (r.bottom > maxGY) maxGY = r.bottom;
  }
  for (let i = 0; i < endpointGXs.length; i++) {
    const gx = endpointGXs[i], gy = endpointGYs[i];
    if (gx < minGX) minGX = gx;
    if (gx > maxGX) maxGX = gx;
    if (gy < minGY) minGY = gy;
    if (gy > maxGY) maxGY = gy;
  }

  minGX -= margin + 2;
  maxGX += margin + 2;
  minGY -= margin + 2;
  maxGY += margin + 2;

  const cols = maxGX - minGX + 1;
  const rows = maxGY - minGY + 1;
  const blocked = new Uint8Array(cols * rows);

  for (const r of gridRects) {
    const cl = Math.max(0, r.left - minGX);
    const cr = Math.min(cols - 1, r.right - minGX);
    const rt = Math.max(0, r.top - minGY);
    const rb = Math.min(rows - 1, r.bottom - minGY);
    for (let c = cl; c <= cr; c++) {
      const base = c * rows;
      for (let row = rt; row <= rb; row++) {
        blocked[base + row] = 1;
      }
    }
  }

  return { cols, rows, originX: minGX, originY: minGY, blocked };
}

// ---------- A* ----------

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** Min-heap for A* open set */
class MinHeap {
  private data: GridNode[] = [];

  get length() {
    return this.data.length;
  }

  push(node: GridNode) {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): GridNode | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  private _bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private _sinkDown(i: number) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

/** A* pathfinding on an integer grid. All coordinates are grid cell indices. */
export function astarOrthogonal(
  grid: IntGrid,
  startCol: number, startRow: number,
  endCol: number, endRow: number,
  penalties?: PenaltyZone[],
  freeStartDir?: boolean,
  freeEndDir?: boolean,
  excludeStartDir?: number,
  excludeEndDir?: number,
  sourceExitsRight?: boolean,
  penaltySpatialIndex?: PenaltySpatialIndex,
): { path: { gx: number; gy: number }[]; arrivalDir: number } | null {
  const { cols, rows, originX, originY, blocked } = grid;

  // Cache routing params into locals — avoids Proxy trap overhead in hot loop
  const TURN_PENALTY = ROUTING_PARAMS.TURN_PENALTY;
  const SEPARATION_PX = ROUTING_PARAMS.SEPARATION_PX;
  const OVERLAP_PENALTY = ROUTING_PARAMS.OVERLAP_PENALTY;
  const CROSSING_PENALTY = ROUTING_PARAMS.CROSSING_PENALTY;
  const NESTING_BIAS = ROUTING_PARAMS.NESTING_BIAS;

  // Convert grid-absolute coords to grid-local indices
  const sci = startCol - originX;
  const sri = startRow - originY;
  const eci = endCol - originX;
  const eri = endRow - originY;

  if (sci < 0 || sci >= cols || sri < 0 || sri >= rows) return null;
  if (eci < 0 || eci >= cols || eri < 0 || eri >= rows) return null;
  if (blocked[sci * rows + sri] || blocked[eci * rows + eri]) return null;

  // Penalty zone spatial index (grid coordinates) — reuse pre-built index or build locally
  let penaltyGrid: Map<number, PenaltyZone[]> | null = null;
  if (penaltySpatialIndex) {
    penaltyGrid = penaltySpatialIndex.grid.size > 0 ? penaltySpatialIndex.grid : null;
  } else if (penalties && penalties.length > 0) {
    penaltyGrid = new Map();
    for (const pz of penalties) {
      let minC: number, maxC: number, minR: number, maxR: number;
      if (pz.axis === "v") {
        minC = pz.coordinate - SEPARATION_PX; maxC = pz.coordinate + SEPARATION_PX;
        minR = pz.rangeMin; maxR = pz.rangeMax;
      } else {
        minC = pz.rangeMin; maxC = pz.rangeMax;
        minR = pz.coordinate - SEPARATION_PX; maxR = pz.coordinate + SEPARATION_PX;
      }
      const bcMin = Math.floor(minC / PENALTY_BUCKET);
      const bcMax = Math.floor(maxC / PENALTY_BUCKET);
      const brMin = Math.floor(minR / PENALTY_BUCKET);
      const brMax = Math.floor(maxR / PENALTY_BUCKET);
      for (let bc = bcMin; bc <= bcMax; bc++) {
        for (let br = brMin; br <= brMax; br++) {
          const key = bc * 100003 + br;
          let bucket = penaltyGrid.get(key);
          if (!bucket) { bucket = []; penaltyGrid.set(key, bucket); }
          bucket.push(pz);
        }
      }
    }
  }

  const NUM_DIRS = 4;
  const stateCount = cols * rows * NUM_DIRS;

  // Per-call typed arrays — small for per-edge grids, good cache locality
  const closedArr = new Uint8Array(stateCount);
  const bestGArr = new Float64Array(stateCount);
  bestGArr.fill(Infinity);
  // Flat parent array — path reconstruction without keeping GridNode objects alive
  const parentKey = new Int32Array(stateCount);

  const heuristic = (ci: number, ri: number, dir: number) => {
    const dc = Math.abs(ci - eci);
    const dr = Math.abs(ri - eri);
    let h = dc + dr;
    if (dc > 0 && dr > 0) h += TURN_PENALTY;
    if (dc > 0 && dr === 0 && dir !== 0 && dir !== 2 && dir >= 0) h += TURN_PENALTY;
    if (dr > 0 && dc === 0 && dir !== 1 && dir !== 3 && dir >= 0) h += TURN_PENALTY;
    if (!freeEndDir && dc === 0 && dr === 0 && (dir === 1 || dir === 3)) h += TURN_PENALTY;
    return h;
  };

  const open = new MinHeap();

  if (freeStartDir) {
    const UTURN_COST = TURN_PENALTY * 10;
    for (let d = 0; d < NUM_DIRS; d++) {
      const g = d === excludeStartDir ? UTURN_COST : 0;
      const sk = (sci * rows + sri) * NUM_DIRS + d;
      bestGArr[sk] = g;
      parentKey[sk] = -1;
      open.push({ xi: sci, yi: sri, g, f: g + heuristic(sci, sri, d), dir: d });
    }
  } else {
    const startDir = (sourceExitsRight ?? true) ? 0 : 2;
    const sk = (sci * rows + sri) * NUM_DIRS + startDir;
    bestGArr[sk] = 0;
    parentKey[sk] = -1;
    open.push({ xi: sci, yi: sri, g: 0, f: heuristic(sci, sri, startDir), dir: startDir });
  }

  while (open.length > 0) {
    const current = open.pop()!;
    const ck = (current.xi * rows + current.yi) * NUM_DIRS + current.dir;

    if (current.xi === eci && current.yi === eri) {
      const dirOk = (freeEndDir || current.dir === 0 || current.dir === 2)
        && current.dir !== excludeEndDir;
      if (dirOk) {
        // Reconstruct path from flat parentKey array
        const path: { gx: number; gy: number }[] = [];
        let key = ck;
        while (key >= 0) {
          const d = key % NUM_DIRS;
          const posKey = (key - d) / NUM_DIRS;
          const row = posKey % rows;
          const col = (posKey - row) / rows;
          path.push({ gx: col + originX, gy: row + originY });
          key = parentKey[key];
        }
        path.reverse();
        return { path, arrivalDir: current.dir };
      }
    }

    if (closedArr[ck]) continue;
    closedArr[ck] = 1;

    for (let d = 0; d < 4; d++) {
      const nci = current.xi + DX[d];
      const nri = current.yi + DY[d];
      if (nci < 0 || nci >= cols || nri < 0 || nri >= rows) continue;
      if (blocked[nci * rows + nri]) continue;

      const nk = (nci * rows + nri) * NUM_DIRS + d;
      if (closedArr[nk]) continue;

      // Distance is always 1 (one grid cell step)
      let g = current.g + 1;

      // Turn penalty with nesting bias
      if (d !== current.dir && current.dir >= 0) {
        const isUturn = d === ((current.dir + 2) % 4);
        let turnCost = isUturn ? TURN_PENALTY * 5 : TURN_PENALTY;
        const hSpan = Math.abs(eci - sci);
        if (hSpan > 0 && NESTING_BIAS > 0) {
          const progress = Math.abs(nci - sci) / hSpan;
          const vSpan = Math.abs(endRow - startRow);
          turnCost -= NESTING_BIAS * vSpan * progress;
        }
        g += turnCost;
      }

      // Overlap penalty (grid coordinates)
      if (penaltyGrid) {
        const ngx = nci + originX;
        const ngy = nri + originY;
        const cgx = current.xi + originX;
        const cgy = current.yi + originY;
        const bc = Math.floor(ngx / PENALTY_BUCKET);
        const br = Math.floor(ngy / PENALTY_BUCKET);
        const bucket = penaltyGrid.get(bc * 100003 + br);
        if (bucket) {
          for (const pz of bucket) {
            if (pz.axis === "v" && (d === 1 || d === 3)) {
              const dist = Math.abs(ngx - pz.coordinate);
              if (dist < SEPARATION_PX) {
                const segMin = Math.min(cgy, ngy);
                const segMax = Math.max(cgy, ngy);
                if (segMax > pz.rangeMin && segMin < pz.rangeMax) {
                  const closeness = 1 - dist / SEPARATION_PX;
                  g += OVERLAP_PENALTY * closeness * closeness;
                }
              }
            } else if (pz.axis === "h" && (d === 0 || d === 2)) {
              const dist = Math.abs(ngy - pz.coordinate);
              if (dist < SEPARATION_PX) {
                const segMin = Math.min(cgx, ngx);
                const segMax = Math.max(cgx, ngx);
                if (segMax > pz.rangeMin && segMin < pz.rangeMax) {
                  const closeness = 1 - dist / SEPARATION_PX;
                  g += OVERLAP_PENALTY * closeness * closeness;
                }
              }
            }

            if (CROSSING_PENALTY > 0) {
              if (pz.axis === "v" && (d === 0 || d === 2)) {
                const minX = Math.min(cgx, ngx);
                const maxX = Math.max(cgx, ngx);
                if (pz.coordinate >= minX && pz.coordinate <= maxX) {
                  if (ngy >= pz.rangeMin && ngy <= pz.rangeMax) {
                    g += CROSSING_PENALTY;
                  }
                }
              } else if (pz.axis === "h" && (d === 1 || d === 3)) {
                const minY = Math.min(cgy, ngy);
                const maxY = Math.max(cgy, ngy);
                if (pz.coordinate >= minY && pz.coordinate <= maxY) {
                  if (ngx >= pz.rangeMin && ngx <= pz.rangeMax) {
                    g += CROSSING_PENALTY;
                  }
                }
              }
            }
          }
        }
      }

      if (g >= bestGArr[nk]) continue;
      bestGArr[nk] = g;
      parentKey[nk] = ck;

      open.push({
        xi: nci, yi: nri, g, f: g + heuristic(nci, nri, d), dir: d,
      });
    }
  }

  return null;
}

// ---------- Penalty spatial index ----------

/** Reusable spatial index for penalty zones, grown incrementally as edges are routed. */
export interface PenaltySpatialIndex {
  grid: Map<number, PenaltyZone[]>;
  indexedCount: number;
}

/** Create a new empty penalty spatial index. */
export function createPenaltySpatialIndex(): PenaltySpatialIndex {
  return { grid: new Map(), indexedCount: 0 };
}

/** Grow the spatial index to cover any newly appended penalty zones. */
export function growPenaltyIndex(
  index: PenaltySpatialIndex,
  allZones: PenaltyZone[],
): void {
  const sep = ROUTING_PARAMS.SEPARATION_PX;
  for (let i = index.indexedCount; i < allZones.length; i++) {
    const pz = allZones[i];
    let minC: number, maxC: number, minR: number, maxR: number;
    if (pz.axis === "v") {
      minC = pz.coordinate - sep; maxC = pz.coordinate + sep;
      minR = pz.rangeMin; maxR = pz.rangeMax;
    } else {
      minC = pz.rangeMin; maxC = pz.rangeMax;
      minR = pz.coordinate - sep; maxR = pz.coordinate + sep;
    }
    const bcMin = Math.floor(minC / PENALTY_BUCKET);
    const bcMax = Math.floor(maxC / PENALTY_BUCKET);
    const brMin = Math.floor(minR / PENALTY_BUCKET);
    const brMax = Math.floor(maxR / PENALTY_BUCKET);
    for (let bc = bcMin; bc <= bcMax; bc++) {
      for (let br = brMin; br <= brMax; br++) {
        const key = bc * 100003 + br;
        let bucket = index.grid.get(key);
        if (!bucket) { bucket = []; index.grid.set(key, bucket); }
        bucket.push(pz);
      }
    }
  }
  index.indexedCount = allZones.length;
}

// ---------- Path simplification ----------

export function simplifyWaypoints(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = points[i + 1];
    const cur = points[i];
    const sameX = prev.x === cur.x && cur.x === next.x;
    const sameY = prev.y === cur.y && cur.y === next.y;
    if (!sameX && !sameY) {
      result.push(cur);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

// ---------- SVG path generation ----------

export function waypointsToSvgPath(waypoints: Point[], radius: number = CORNER_RADIUS): string {
  if (waypoints.length < 2) return "";
  if (waypoints.length === 2) {
    return `M ${waypoints[0].x} ${waypoints[0].y} L ${waypoints[1].x} ${waypoints[1].y}`;
  }

  const parts: string[] = [`M ${waypoints[0].x} ${waypoints[0].y}`];

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const cur = waypoints[i];
    const next = waypoints[i + 1];

    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);

    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);

    const bx = cur.x - inDx * r;
    const by = cur.y - inDy * r;
    const ax = cur.x + outDx * r;
    const ay = cur.y + outDy * r;

    parts.push(`L ${bx} ${by}`);
    parts.push(`Q ${cur.x} ${cur.y} ${ax} ${ay}`);
  }

  const last = waypoints[waypoints.length - 1];
  parts.push(`L ${last.x} ${last.y}`);

  return parts.join(" ");
}

// ---------- SVG path with hop arcs ----------

/**
 * Like waypointsToSvgPath but inserts semicircular arc hops on horizontal
 * segments and gap (moveTo) cuts on vertical segments at crossing points.
 * Horizontal edges arc over; vertical edges gap under — standard CAD convention.
 *
 * Falls back to waypointsToSvgPath when there are no crossings.
 */
export function waypointsToSvgPathWithHops(
  waypoints: Point[],
  arcCrossings: { x: number; y: number }[],
  gapCrossings: { x: number; y: number }[],
  radius: number = CORNER_RADIUS,
): string {
  if (arcCrossings.length === 0 && gapCrossings.length === 0) return waypointsToSvgPath(waypoints, radius);
  if (waypoints.length < 2) return "";

  // Index arc crossings by Y so we can quickly find relevant ones per horizontal segment
  const crossingsByY = new Map<number, number[]>();
  for (const cp of arcCrossings) {
    const key = Math.round(cp.y);
    let list = crossingsByY.get(key);
    if (!list) { list = []; crossingsByY.set(key, list); }
    list.push(cp.x);
  }

  // Index gap crossings by X so we can quickly find relevant ones per vertical segment
  const gapCrossingsByX = new Map<number, number[]>();
  for (const cp of gapCrossings) {
    const key = Math.round(cp.x);
    let list = gapCrossingsByX.get(key);
    if (!list) { list = []; gapCrossingsByX.set(key, list); }
    list.push(cp.y);
  }

  // Build path using the same corner-radius logic as waypointsToSvgPath,
  // but intercept each L command on a horizontal segment to inject arcs,
  // and on vertical segments to inject gaps.
  if (waypoints.length === 2) {
    const [a, b] = waypoints;
    if (Math.abs(a.y - b.y) < 0.5) {
      // Single horizontal segment — insert arcs directly
      return buildHorizontalSegmentWithArcs(a.x, b.x, a.y, crossingsByY);
    }
    if (Math.abs(a.x - b.x) < 0.5) {
      // Single vertical segment — insert gaps directly
      return buildVerticalSegmentWithGaps(a.y, b.y, a.x, gapCrossingsByX);
    }
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  const parts: string[] = [`M ${waypoints[0].x} ${waypoints[0].y}`];

  // We need to track the "current position" after each corner's Q command
  // so we can inject arcs on the segment from that position to the next
  // corner's entry point (or the final endpoint).
  //
  // For each segment between waypoints, the path goes:
  //   prev → [corner entry at cur] Q [corner exit at cur] → [corner entry at next] ...
  // So the actual line segments are:
  //   cornerExit[i-1] → cornerEntry[i]  (for intermediate waypoints)
  //   start → cornerEntry[1]            (first segment)
  //   cornerExit[N-2] → end             (last segment)

  // Pre-compute corner entry/exit points
  interface Corner { bx: number; by: number; cx: number; cy: number; ax: number; ay: number }
  const corners: (Corner | null)[] = [null]; // index 0 = start, no corner
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const cur = waypoints[i];
    const next = waypoints[i + 1];
    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    corners.push({
      bx: cur.x - inDx * r, by: cur.y - inDy * r,
      cx: cur.x, cy: cur.y,
      ax: cur.x + outDx * r, ay: cur.y + outDy * r,
    });
  }
  corners.push(null); // last waypoint, no corner

  // Now emit segments. Between each pair of consecutive waypoints,
  // the drawn line goes from segStart to segEnd.
  for (let i = 0; i < waypoints.length - 1; i++) {
    const segStartX = i === 0 ? waypoints[0].x : corners[i]!.ax;
    const segStartY = i === 0 ? waypoints[0].y : corners[i]!.ay;
    const segEndX = i === waypoints.length - 2 ? waypoints[waypoints.length - 1].x : corners[i + 1]!.bx;
    const segEndY = i === waypoints.length - 2 ? waypoints[waypoints.length - 1].y : corners[i + 1]!.by;

    // Is this a horizontal segment?
    if (Math.abs(segStartY - segEndY) < 0.5) {
      const y = segStartY;
      const yKey = Math.round(y);
      const cxList = crossingsByY.get(yKey);
      if (cxList && cxList.length > 0) {
        // Filter crossings that actually fall within this segment
        const minX = Math.min(segStartX, segEndX);
        const maxX = Math.max(segStartX, segEndX);
        const relevant = cxList.filter((cx) => cx > minX + ARC_R && cx < maxX - ARC_R);

        if (relevant.length > 0) {
          const leftToRight = segEndX > segStartX;
          relevant.sort((a, b) => leftToRight ? a - b : b - a);

          // Filter out overlapping arcs (too close together)
          const filtered: number[] = [];
          let lastArcEnd = -Infinity;
          for (const cx of relevant) {
            const arcStart = leftToRight ? cx - ARC_R : cx + ARC_R;
            if (Math.abs(arcStart - lastArcEnd) < 0.5) continue; // overlapping
            // Check distance from previous arc
            if (filtered.length > 0) {
              const prevCx = filtered[filtered.length - 1];
              if (Math.abs(cx - prevCx) < 2 * ARC_R) continue;
            }
            filtered.push(cx);
            lastArcEnd = leftToRight ? cx + ARC_R : cx - ARC_R;
          }

          // Emit L commands with arc insertions
          for (const cx of filtered) {
            if (leftToRight) {
              parts.push(`L ${cx - ARC_R} ${y}`);
              parts.push(`A ${ARC_R} ${ARC_R} 0 0 1 ${cx + ARC_R} ${y}`);
            } else {
              parts.push(`L ${cx + ARC_R} ${y}`);
              parts.push(`A ${ARC_R} ${ARC_R} 0 0 0 ${cx - ARC_R} ${y}`);
            }
          }
          parts.push(`L ${segEndX} ${y}`);
        } else {
          parts.push(`L ${segEndX} ${segEndY}`);
        }
      } else {
        parts.push(`L ${segEndX} ${segEndY}`);
      }
    } else if (Math.abs(segStartX - segEndX) < 0.5) {
      // Vertical segment — insert gap (moveTo) cuts at crossing points
      const x = segStartX;
      const xKey = Math.round(x);
      const cyList = gapCrossingsByX.get(xKey);
      if (cyList && cyList.length > 0) {
        const minY = Math.min(segStartY, segEndY);
        const maxY = Math.max(segStartY, segEndY);
        // Gap center is at cy - ARC_R, so ensure that falls within segment bounds
        const relevant = cyList.filter((cy) => {
          const gc = cy - ARC_R;
          return gc - GAP_HALF > minY + 1 && gc + GAP_HALF < maxY - 1;
        });

        if (relevant.length > 0) {
          const topToBottom = segEndY > segStartY;
          relevant.sort((a, b) => topToBottom ? a - b : b - a);

          // Filter out overlapping gaps (too close together)
          const filtered: number[] = [];
          for (const cy of relevant) {
            if (filtered.length > 0 && Math.abs(cy - filtered[filtered.length - 1]) < 2 * GAP_HALF + 2) continue;
            filtered.push(cy);
          }

          for (const cy of filtered) {
            // The arc peaks at cy - ARC_R (top of the semicircle) — center the gap there
            const gapCenter = cy - ARC_R;
            if (topToBottom) {
              // Traveling downward (increasing Y): stop above gap, jump past it
              parts.push(`L ${x} ${gapCenter - GAP_HALF}`);
              parts.push(`M ${x} ${gapCenter + GAP_HALF}`);
            } else {
              // Traveling upward (decreasing Y): stop below gap, jump past it
              parts.push(`L ${x} ${gapCenter + GAP_HALF}`);
              parts.push(`M ${x} ${gapCenter - GAP_HALF}`);
            }
          }
          parts.push(`L ${segEndX} ${segEndY}`);
        } else {
          parts.push(`L ${segEndX} ${segEndY}`);
        }
      } else {
        parts.push(`L ${segEndX} ${segEndY}`);
      }
    } else {
      parts.push(`L ${segEndX} ${segEndY}`);
    }

    // Emit corner Q command if this isn't the last segment
    if (i < waypoints.length - 2) {
      const c = corners[i + 1]!;
      parts.push(`Q ${c.cx} ${c.cy} ${c.ax} ${c.ay}`);
    }
  }

  return parts.join(" ");
}

/** Build an M...L path for a single horizontal segment with arc hops. */
function buildHorizontalSegmentWithArcs(
  x1: number, x2: number, y: number,
  crossingsByY: Map<number, number[]>,
): string {
  const parts: string[] = [`M ${x1} ${y}`];
  const yKey = Math.round(y);
  const cxList = crossingsByY.get(yKey);

  if (!cxList || cxList.length === 0) {
    parts.push(`L ${x2} ${y}`);
    return parts.join(" ");
  }

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const leftToRight = x2 > x1;
  const relevant = cxList
    .filter((cx) => cx > minX + ARC_R && cx < maxX - ARC_R)
    .sort((a, b) => leftToRight ? a - b : b - a);

  const filtered: number[] = [];
  for (const cx of relevant) {
    if (filtered.length > 0 && Math.abs(cx - filtered[filtered.length - 1]) < 2 * ARC_R) continue;
    filtered.push(cx);
  }

  for (const cx of filtered) {
    if (leftToRight) {
      parts.push(`L ${cx - ARC_R} ${y}`);
      parts.push(`A ${ARC_R} ${ARC_R} 0 0 1 ${cx + ARC_R} ${y}`);
    } else {
      parts.push(`L ${cx + ARC_R} ${y}`);
      parts.push(`A ${ARC_R} ${ARC_R} 0 0 0 ${cx - ARC_R} ${y}`);
    }
  }
  parts.push(`L ${x2} ${y}`);
  return parts.join(" ");
}

/** Build an M...L path for a single vertical segment with gap cuts. */
function buildVerticalSegmentWithGaps(
  y1: number, y2: number, x: number,
  gapCrossingsByX: Map<number, number[]>,
): string {
  const parts: string[] = [`M ${x} ${y1}`];
  const xKey = Math.round(x);
  const cyList = gapCrossingsByX.get(xKey);

  if (!cyList || cyList.length === 0) {
    parts.push(`L ${x} ${y2}`);
    return parts.join(" ");
  }

  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const topToBottom = y2 > y1;
  const relevant = cyList
    .filter((cy) => {
      const gc = cy - ARC_R;
      return gc - GAP_HALF > minY + 1 && gc + GAP_HALF < maxY - 1;
    })
    .sort((a, b) => topToBottom ? a - b : b - a);

  const filtered: number[] = [];
  for (const cy of relevant) {
    if (filtered.length > 0 && Math.abs(cy - filtered[filtered.length - 1]) < 2 * GAP_HALF + 2) continue;
    filtered.push(cy);
  }

  for (const cy of filtered) {
    // The arc peaks at cy - ARC_R (top of the semicircle) — center the gap there
    const gapCenter = cy - ARC_R;
    if (topToBottom) {
      parts.push(`L ${x} ${gapCenter - GAP_HALF}`);
      parts.push(`M ${x} ${gapCenter + GAP_HALF}`);
    } else {
      parts.push(`L ${x} ${gapCenter + GAP_HALF}`);
      parts.push(`M ${x} ${gapCenter - GAP_HALF}`);
    }
  }
  parts.push(`L ${x} ${y2}`);
  return parts.join(" ");
}

// ---------- Main entry point ----------

export function computeEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacles: Rect[],
  offset: number,
  _stubSpread: number = 0,
  penalties?: PenaltyZone[],
  _currentSignalType?: string,
  noSourceStub?: boolean,
  noTargetStub?: boolean,
  excludeStartDir?: number,
  excludeEndDir?: number,
  _congestion?: Map<string, number>,
  sourceExitsRight?: boolean,
  _targetEntersLeft?: boolean,
  precomputedGridRects?: GridRect[],
  penaltySpatialIndex?: PenaltySpatialIndex,
  globalGrid?: IntGrid,
): { path: string; labelX: number; labelY: number; turns: string; waypoints: Point[]; arrivalDir: number } | null {
  // Convert pixel coordinates to grid coordinates
  const sgx = px2g(sourceX);
  const sgy = px2g(sourceY);
  const tgx = px2g(targetX);
  const tgy = px2g(targetY);

  // Stub: 1 cell horizontal exit from port
  const srcRight = sourceExitsRight ?? true;
  const tgtLeft = _targetEntersLeft ?? true;
  const stub = ROUTING_PARAMS.STUB;
  const stubSGX = noSourceStub ? sgx : sgx + (srcRight ? stub : -stub);
  const stubTGX = noTargetStub ? tgx : tgx + (tgtLeft ? -stub : stub);

  // Use global grid if available (avoids per-edge grid construction),
  // otherwise build a per-edge grid
  let grid: IntGrid;
  let restoreCells: { idx: number; val: number }[] | null = null;
  if (globalGrid) {
    grid = globalGrid;
    // Temporarily unblock stub endpoints on the shared grid
    const { rows, originX, originY, cols, blocked } = grid;
    restoreCells = [];
    const forceOpen = [
      { gx: stubSGX, gy: sgy },
      { gx: stubTGX, gy: tgy },
    ];
    for (const pt of forceOpen) {
      const c = pt.gx - originX;
      const r = pt.gy - originY;
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        const idx = c * rows + r;
        if (blocked[idx]) {
          restoreCells.push({ idx, val: 1 });
          blocked[idx] = 0;
        }
      }
    }
  } else {
    const gridRects = precomputedGridRects ?? pixelRectsToGrid(obstacles);
    const forceOpen = [
      { gx: stubSGX, gy: sgy },
      { gx: stubTGX, gy: tgy },
    ];
    grid = buildGrid(stubSGX, sgy, stubTGX, tgy, gridRects, forceOpen);
  }

  // Run A* on integer grid
  const astarResult = astarOrthogonal(
    grid, stubSGX, sgy, stubTGX, tgy,
    penalties,
    noSourceStub, false, excludeStartDir, excludeEndDir, sourceExitsRight,
    penaltySpatialIndex,
  );

  // Restore temporarily unblocked cells on global grid
  if (restoreCells) {
    for (const cell of restoreCells) {
      grid.blocked[cell.idx] = cell.val;
    }
  }
  if (!astarResult) return null;

  // Convert grid path to pixel waypoints
  const interiorPixels: Point[] = astarResult.path.map((p) => ({ x: g2px(p.gx), y: g2px(p.gy) }));
  const interior = simplifyWaypoints(interiorPixels);

  // Build full waypoint list: source handle → A* path → target handle
  const waypoints: Point[] = [];
  waypoints.push({ x: g2px(sgx), y: g2px(sgy) }); // Source (grid-snapped pixel)
  for (const p of interior) {
    waypoints.push({ x: p.x + offset, y: p.y + offset });
  }
  waypoints.push({ x: g2px(tgx), y: g2px(tgy) }); // Target (grid-snapped pixel)

  const simplified = simplifyWaypoints(waypoints);
  const path = waypointsToSvgPath(simplified);

  const midIdx = Math.floor(simplified.length / 2);
  const labelPt = simplified[midIdx];
  const prevPt = simplified[Math.max(0, midIdx - 1)];
  const labelX = (labelPt.x + prevPt.x) / 2;
  const labelY = (labelPt.y + prevPt.y) / 2;

  const turns = simplified.length > 2
    ? simplified.slice(1, -1).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" → ")
    : "straight";

  return { path, labelX, labelY, turns, waypoints: simplified, arrivalDir: astarResult.arrivalDir };
}

// ---------- Debug utilities ----------

/** Generate an ASCII representation of an integer grid. */
export function asciiGrid(
  grid: IntGrid,
  path: { gx: number; gy: number }[],
  srcGX: number, srcGY: number,
  tgtGX: number, tgtGY: number,
): string {
  const { cols, rows, originX, originY, blocked } = grid;
  const pathSet = new Set(path.map((p) => `${p.gx},${p.gy}`));

  const colW = 5;
  const lines: string[] = [];

  // Header: grid X coordinates
  let header = " ".repeat(colW);
  for (let c = 0; c < cols; c++) header += String(c + originX).padStart(colW);
  lines.push(header);

  for (let r = 0; r < rows; r++) {
    const gy = r + originY;
    let row = String(gy).padStart(colW);
    for (let c = 0; c < cols; c++) {
      const gx = c + originX;
      const key = `${gx},${gy}`;
      let ch: string;
      if (gx === srcGX && gy === srcGY) ch = "S";
      else if (gx === tgtGX && gy === tgtGY) ch = "T";
      else if (pathSet.has(key)) ch = "*";
      else if (blocked[c * rows + r]) ch = "#";
      else ch = ".";
      row += ch.padStart(colW);
    }
    lines.push(row);
  }

  return lines.join("\n");
}

// Legacy export for compatibility
export type SparseGrid = IntGrid;
