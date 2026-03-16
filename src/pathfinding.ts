/**
 * A* orthogonal edge routing on a sparse event-coordinate grid.
 * Pure algorithm — no React dependencies.
 *
 * See ROUTING_RULES.md for the full aesthetic ruleset.
 *
 * Key design decisions:
 *  - Direction-aware A* state: (x, y, dir) prevents the closed set from
 *    rejecting better arrivals from a different direction.
 *  - Must arrive at goal horizontally (R2) — vertical arrivals rejected.
 *  - Post-hoc (X, Y) offset on interior waypoints separates parallel edges
 *    in both axes. Jog segments at stubs maintain orthogonality (R3).
 */

// ---------- Types ----------

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PenaltyZone {
  axis: "h" | "v";
  coordinate: number;  // the X (for vertical seg) or Y (for horizontal seg)
  rangeMin: number;     // start of segment
  rangeMax: number;     // end of segment
  signalType?: string;  // signal type of the edge that created this zone
}

interface GridNode {
  xi: number;
  yi: number;
  g: number;
  f: number;
  dir: number; // 0=right,1=down,2=left,3=up, -1=start
  parent: GridNode | null;
}

// ---------- Constants ----------

const PAD = 20; // Padding around device nodes for obstacle rects
const GAP = 8; // Extra grid lines just outside obstacle edges (routing channel)
const STUB = 30; // Minimum horizontal distance from handle before first turn
const TURN_PENALTY = 100; // Penalty for changing direction (strongly prefer fewer turns)
const CORNER_RADIUS = 8;
const ESCAPE_MARGIN = 40; // Grid lines beyond the overall bounding box
const SEPARATION_PX = 10; // Offset distance for penalty zone grid lines
const CROSS_TYPE_SEPARATION = 20; // Wider separation between edges of different signal types
const PROXIMITY_PENALTY = 50; // Extra A* cost when near a penalty zone (parallel)
const CROSSING_PENALTY = 120; // Extra A* cost when crossing a penalty zone (perpendicular)
const EARLY_TURN_BIAS = 30; // Extra cost for turning far from target (spreads vertical segments)

// ---------- Obstacles ----------

export function buildObstacles(
  nodes: readonly { id: string; position: { x: number; y: number }; parentId?: string; measured?: { width?: number; height?: number }; type?: string }[],
  excludeIds: string[],
  getAbsPos: (node: typeof nodes[number]) => { x: number; y: number },
): { rects: Rect[] } {
  const rects: Rect[] = [];
  for (const n of nodes) {
    if (n.type === "room" || n.type === "note") continue;
    if (excludeIds.length > 0 && excludeIds.includes(n.id)) continue;
    const pos = getAbsPos(n);
    const w = n.measured?.width ?? 180;
    const h = n.measured?.height ?? 60;
    const rect: Rect = {
      left: pos.x - PAD,
      top: pos.y - PAD,
      right: pos.x + w + PAD,
      bottom: pos.y + h + PAD,
    };
    rects.push(rect);
  }
  return { rects };
}

// ---------- Sparse grid ----------

interface SparseGrid {
  xs: number[];
  ys: number[];
  blocked: boolean[][]; // blocked[xi][yi]
}

export function buildSparseGrid(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  obstacles: Rect[],
  forceOpen?: { x: number; y: number }[],
  penalties?: PenaltyZone[],
  currentSignalType?: string,
): SparseGrid {
  const xSet = new Set<number>();
  const ySet = new Set<number>();

  // Source and target points
  xSet.add(sx);
  xSet.add(tx);
  ySet.add(sy);
  ySet.add(ty);

  // Midpoint X — the "natural" centerX for a smooth-step path
  xSet.add((sx + tx) / 2);

  for (const r of obstacles) {
    // Obstacle edges + narrow routing channels just outside
    xSet.add(r.left);
    xSet.add(r.right);
    xSet.add(r.left - GAP);
    xSet.add(r.right + GAP);
    ySet.add(r.top);
    ySet.add(r.bottom);
    ySet.add(r.top - GAP);
    ySet.add(r.bottom + GAP);
  }

  // Inject penalty zone coordinates as additional grid lines so A* can route around them
  if (penalties) {
    for (const pz of penalties) {
      const crossType = currentSignalType && pz.signalType && pz.signalType !== currentSignalType;
      if (pz.axis === "v") {
        // Vertical penalty: add offset X lines on both sides
        xSet.add(pz.coordinate - SEPARATION_PX);
        xSet.add(pz.coordinate + SEPARATION_PX);
        if (crossType) {
          xSet.add(pz.coordinate - CROSS_TYPE_SEPARATION);
          xSet.add(pz.coordinate + CROSS_TYPE_SEPARATION);
        }
        ySet.add(pz.rangeMin);
        ySet.add(pz.rangeMax);
      } else {
        // Horizontal penalty: add offset Y lines on both sides
        ySet.add(pz.coordinate - SEPARATION_PX);
        ySet.add(pz.coordinate + SEPARATION_PX);
        if (crossType) {
          ySet.add(pz.coordinate - CROSS_TYPE_SEPARATION);
          ySet.add(pz.coordinate + CROSS_TYPE_SEPARATION);
        }
        xSet.add(pz.rangeMin);
        xSet.add(pz.rangeMax);
      }
    }
  }

  // Escape coords beyond overall bounding box (so paths can route around everything)
  let allLeft = Math.min(sx, tx);
  let allRight = Math.max(sx, tx);
  let allTop = Math.min(sy, ty);
  let allBottom = Math.max(sy, ty);
  for (const r of obstacles) {
    allLeft = Math.min(allLeft, r.left);
    allRight = Math.max(allRight, r.right);
    allTop = Math.min(allTop, r.top);
    allBottom = Math.max(allBottom, r.bottom);
  }
  xSet.add(allLeft - ESCAPE_MARGIN);
  xSet.add(allRight + ESCAPE_MARGIN);
  ySet.add(allTop - ESCAPE_MARGIN);
  ySet.add(allBottom + ESCAPE_MARGIN);

  const xs = [...xSet].sort((a, b) => a - b);
  const ys = [...ySet].sort((a, b) => a - b);

  // Build blocked grid — a cell is blocked if its coordinate lies inside or on the boundary
  // of any obstacle. Non-strict inequality prevents paths from riding along obstacle edges.
  const blocked: boolean[][] = Array.from({ length: xs.length }, () =>
    Array.from({ length: ys.length }, () => false),
  );
  for (let xi = 0; xi < xs.length; xi++) {
    for (let yi = 0; yi < ys.length; yi++) {
      const px = xs[xi];
      const py = ys[yi];
      for (const r of obstacles) {
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
          blocked[xi][yi] = true;
          break;
        }
      }
    }
  }

  // Force-unblock start, end, and any explicitly open points
  if (forceOpen) {
    for (const pt of forceOpen) {
      const xi = xs.indexOf(pt.x);
      const yi = ys.indexOf(pt.y);
      if (xi >= 0 && yi >= 0) {
        blocked[xi][yi] = false;
      }
    }
  }

  return { xs, ys, blocked };
}

// ---------- A* ----------

// Directions: right, down, left, up
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

export function astarOrthogonal(
  grid: SparseGrid,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  obstacles: Rect[],
  penalties?: PenaltyZone[],
  currentSignalType?: string,
  /** Allow starting in any direction (for handle-to-handle legs). */
  freeStartDir?: boolean,
  /** Allow arriving from any direction (for legs ending at a handle). */
  freeEndDir?: boolean,
  /** Direction to exclude from starting (prevents U-turn at handle junctions). */
  excludeStartDir?: number,
  /** Direction to exclude from arriving (reserves exit side at target handle). */
  excludeEndDir?: number,
): { path: Point[]; arrivalDir: number } | null {
  const { xs, ys, blocked } = grid;

  const sxi = xs.indexOf(startX);
  const syi = ys.indexOf(startY);
  const exi = xs.indexOf(endX);
  const eyi = ys.indexOf(endY);

  if (sxi < 0 || syi < 0 || exi < 0 || eyi < 0) return null;
  if (blocked[sxi][syi] || blocked[exi][eyi]) return null;

  const cols = xs.length;
  const rows = ys.length;

  // Direction-aware state key: (xi, yi, dir) — 4 directions per cell.
  // Start uses dir=0 (RIGHT) since source handles always exit rightward.
  const NUM_DIRS = 4;
  const stateKey = (xi: number, yi: number, dir: number) =>
    (xi * rows + yi) * NUM_DIRS + dir;

  const goalX = xs[exi];
  const goalY = ys[eyi];

  // Tighter admissible heuristic: Manhattan + guaranteed turn penalty if not aligned
  const heuristic = (xi: number, yi: number, dir: number) => {
    const dx = Math.abs(xs[xi] - goalX);
    const dy = Math.abs(ys[yi] - goalY);
    let h = dx + dy;
    // If goal is not on same row or column, at least one turn is required
    if (dx > 0 && dy > 0) {
      h += TURN_PENALTY;
    }
    // If we're moving in a direction that can't reach the goal without turning,
    // and the goal is on the same axis, we still might need a turn
    if (dx > 0 && dy === 0 && dir !== 0 && dir !== 2 && dir >= 0) {
      h += TURN_PENALTY;
    }
    if (dy > 0 && dx === 0 && dir !== 1 && dir !== 3 && dir >= 0) {
      h += TURN_PENALTY;
    }
    // Must arrive at goal horizontally (unless freeEndDir allows any direction)
    if (!freeEndDir && dx === 0 && dy === 0 && (dir === 1 || dir === 3)) {
      h += TURN_PENALTY;
    }
    return h;
  };

  const closed = new Set<number>();
  const bestG = new Map<number, number>();

  const open = new MinHeap();

  if (freeStartDir) {
    // Seed all 4 directions — heavily penalize the excluded direction (the reverse
    // of the previous leg's arrival) to prevent doubling back, but don't hard-block
    // it since some handle placements may require it as a last resort.
    const UTURN_START_PENALTY = TURN_PENALTY * 10;
    for (let d = 0; d < NUM_DIRS; d++) {
      const g = d === excludeStartDir ? UTURN_START_PENALTY : 0;
      const sk = stateKey(sxi, syi, d);
      bestG.set(sk, g);
      open.push({ xi: sxi, yi: syi, g, f: g + heuristic(sxi, syi, d), dir: d, parent: null });
    }
  } else {
    // Start direction is RIGHT (0) — source handles exit rightward
    const startDir = 0;
    const startSK = stateKey(sxi, syi, startDir);
    bestG.set(startSK, 0);
    open.push({ xi: sxi, yi: syi, g: 0, f: heuristic(sxi, syi, startDir), dir: startDir, parent: null });
  }

  while (open.length > 0) {
    const current = open.pop()!;
    const ck = stateKey(current.xi, current.yi, current.dir);

    // Accept arrival at goal: horizontally for device ports, any direction for handles
    // (but exclude the reserved exit direction so the next leg can depart freely)
    const atGoal = current.xi === exi && current.yi === eyi;
    const dirOk = (freeEndDir || current.dir === 0 || current.dir === 2)
      && current.dir !== excludeEndDir;
    if (atGoal && dirOk) {
      const path: Point[] = [];
      let node: GridNode | null = current;
      while (node) {
        path.push({ x: xs[node.xi], y: ys[node.yi] });
        node = node.parent;
      }
      path.reverse();
      return { path, arrivalDir: current.dir };
    }

    if (closed.has(ck)) continue;
    closed.add(ck);

    for (let d = 0; d < 4; d++) {
      const nxi = current.xi + DX[d];
      const nyi = current.yi + DY[d];
      if (nxi < 0 || nxi >= cols || nyi < 0 || nyi >= rows) continue;
      if (blocked[nxi][nyi]) continue;

      const nk = stateKey(nxi, nyi, d);
      if (closed.has(nk)) continue;

      const cx = xs[current.xi];
      const cy = ys[current.yi];
      const nx = xs[nxi];
      const ny = ys[nyi];

      if (segmentBlocked(cx, cy, nx, ny, obstacles)) continue;

      const dist = Math.abs(nx - cx) + Math.abs(ny - cy);
      let g = current.g + dist;

      if (d !== current.dir && current.dir >= 0) {
        // U-turn (180° reversal) is much worse than a 90° turn
        const isUturn = d === ((current.dir + 2) % 4);
        g += isUturn ? TURN_PENALTY * 5 : TURN_PENALTY;

        // Bias: prefer turns closer to target — penalize early turns.
        // This spreads vertical segments across X corridors instead of
        // clustering them all at the same X coordinate.
        const totalXSpan = Math.abs(goalX - startX);
        if (totalXSpan > 0) {
          const distFromTarget = Math.abs(cx - goalX);
          g += EARLY_TURN_BIAS * (distFromTarget / totalXSpan);
        }
      }

      // Penalty zone proximity cost: penalize segments that run parallel
      // and close to an existing good edge's segment.
      // Use wider threshold for edges of different signal types to visually
      // separate signal groups (e.g., ethernet columns vs SDI columns).
      if (penalties) {
        for (const pz of penalties) {
          const crossType = currentSignalType && pz.signalType && pz.signalType !== currentSignalType;
          const proxThreshold = crossType ? CROSS_TYPE_SEPARATION : SEPARATION_PX;
          if (pz.axis === "v" && (d === 1 || d === 3)) {
            // Moving vertically — check if X is close to a vertical penalty
            if (Math.abs(nx - pz.coordinate) < proxThreshold) {
              const segMinY = Math.min(cy, ny);
              const segMaxY = Math.max(cy, ny);
              if (segMaxY > pz.rangeMin && segMinY < pz.rangeMax) {
                g += PROXIMITY_PENALTY;
              }
            }
          } else if (pz.axis === "h" && (d === 0 || d === 2)) {
            // Moving horizontally — check if Y is close to a horizontal penalty
            if (Math.abs(ny - pz.coordinate) < proxThreshold) {
              const segMinX = Math.min(cx, nx);
              const segMaxX = Math.max(cx, nx);
              if (segMaxX > pz.rangeMin && segMinX < pz.rangeMax) {
                g += PROXIMITY_PENALTY;
              }
            }
          }
          // Crossing penalty: moving perpendicular across a penalty zone's segment.
          // Uses <= on upper bound so crossings are detected even when the penalty
          // coordinate is itself a grid line (from overlapping penalty zone offsets).
          if (pz.axis === "v" && (d === 0 || d === 2)) {
            // Moving horizontally — does this step cross a vertical segment?
            const minX = Math.min(cx, nx);
            const maxX = Math.max(cx, nx);
            if (pz.coordinate > minX && pz.coordinate <= maxX &&
                cy >= pz.rangeMin && cy <= pz.rangeMax) {
              g += CROSSING_PENALTY;
            }
          } else if (pz.axis === "h" && (d === 1 || d === 3)) {
            // Moving vertically — does this step cross a horizontal segment?
            const minY = Math.min(cy, ny);
            const maxY = Math.max(cy, ny);
            if (pz.coordinate > minY && pz.coordinate <= maxY &&
                cx >= pz.rangeMin && cx <= pz.rangeMax) {
              g += CROSSING_PENALTY;
            }
          }
        }
      }

      const prev = bestG.get(nk);
      if (prev !== undefined && g >= prev) continue;
      bestG.set(nk, g);

      const h = heuristic(nxi, nyi, d);
      open.push({
        xi: nxi,
        yi: nyi,
        g,
        f: g + h,
        dir: d,
        parent: current,
      });
    }
  }

  return null; // No path found
}

/** Check if a straight segment between two grid-adjacent points crosses any obstacle.
 *  Uses non-strict inequality so segments can't ride along obstacle boundaries. */
function segmentBlocked(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obstacles: Rect[],
): boolean {
  if (x1 === x2) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (const r of obstacles) {
      if (x1 >= r.left && x1 <= r.right && maxY >= r.top && minY <= r.bottom) {
        return true;
      }
    }
  } else {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (const r of obstacles) {
      if (y1 >= r.top && y1 <= r.bottom && maxX >= r.left && minX <= r.right) {
        return true;
      }
    }
  }
  return false;
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

// ---------- Main entry point ----------

export function computeEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacles: Rect[],
  offset: number,
  stubSpread: number = 0,
  penalties?: PenaltyZone[],
  currentSignalType?: string,
  /** Skip the source-side horizontal stub (for legs starting at a manual handle). */
  noSourceStub?: boolean,
  /** Skip the target-side horizontal stub (for legs ending at a manual handle). */
  noTargetStub?: boolean,
  /** Direction to exclude from starting (prevents U-turn at handle junctions). */
  excludeStartDir?: number,
  /** Direction to exclude from arriving (reserves exit side at target handle). */
  excludeEndDir?: number,
): { path: string; labelX: number; labelY: number; turns: string; waypoints: Point[]; arrivalDir: number } | null {
  // Short-circuit: if source and target are at (nearly) the same Y and the direct
  // horizontal path is unobstructed, just draw a straight line — no stubs, no offset.
  // Skip obstacles that contain the source or target handle (the endpoint devices).
  const ALIGN_TOLERANCE = 2;
  if (Math.abs(sourceY - targetY) <= ALIGN_TOLERANCE && sourceX < targetX) {
    const alignedY = Math.round((sourceY + targetY) / 2);
    const blocked = obstacles.some((r) => {
      const containsSource = sourceX >= r.left && sourceX <= r.right && sourceY >= r.top && sourceY <= r.bottom;
      const containsTarget = targetX >= r.left && targetX <= r.right && targetY >= r.top && targetY <= r.bottom;
      if (containsSource || containsTarget) return false;
      return alignedY >= r.top && alignedY <= r.bottom && targetX >= r.left && sourceX <= r.right;
    });
    if (!blocked) {
      const path = `M ${sourceX} ${alignedY} L ${targetX} ${alignedY}`;
      const labelX = (sourceX + targetX) / 2;
      const waypoints: Point[] = [{ x: sourceX, y: alignedY }, { x: targetX, y: alignedY }];
      // Horizontal line: arrival direction is RIGHT (0)
      return { path, labelX, labelY: alignedY, turns: "straight", waypoints, arrivalDir: 0 };
    }
  }

  // Short-circuit: same X (vertical straight line) — common for handle-to-handle legs
  if (Math.abs(sourceX - targetX) <= ALIGN_TOLERANCE) {
    const alignedX = Math.round((sourceX + targetX) / 2);
    const minY = Math.min(sourceY, targetY);
    const maxY = Math.max(sourceY, targetY);
    const blocked = obstacles.some((r) => {
      const containsSource = sourceX >= r.left && sourceX <= r.right && sourceY >= r.top && sourceY <= r.bottom;
      const containsTarget = targetX >= r.left && targetX <= r.right && targetY >= r.top && targetY <= r.bottom;
      if (containsSource || containsTarget) return false;
      return alignedX >= r.left && alignedX <= r.right && maxY >= r.top && minY <= r.bottom;
    });
    if (!blocked) {
      const path = `M ${alignedX} ${sourceY} L ${alignedX} ${targetY}`;
      const labelY = (sourceY + targetY) / 2;
      const waypoints: Point[] = [{ x: alignedX, y: sourceY }, { x: alignedX, y: targetY }];
      // Vertical line: arrival is DOWN (1) or UP (3)
      const arrivalDir = targetY > sourceY ? 1 : 3;
      return { path, labelX: alignedX, labelY, turns: "straight", waypoints, arrivalDir };
    }
  }

  // Stub lengths:
  // - stubSpread: small per-port spread from same-device sibling counting (prevents stub overlaps)
  // - noStubs: skip stubs entirely (for handle-to-handle legs in manual routing)
  let stubSX = noSourceStub ? sourceX : sourceX + STUB + stubSpread;
  let stubTX = noTargetStub ? targetX : targetX - STUB - stubSpread;

  // If stubs cross (source/target close in X with large spread), clamp to midpoint.
  if (!noSourceStub && !noTargetStub && sourceX < targetX && stubSX >= stubTX) {
    const mid = (sourceX + targetX) / 2;
    stubSX = mid - 1;
    stubTX = mid + 1;
  }

  // Route A* at handle Y positions — the actual source/target coordinates.
  // Offset is applied as an X-shift on interior waypoints AFTER routing,
  // which separates parallel edges' vertical segments without adding turns.
  const forceOpen = [
    { x: stubSX, y: sourceY },
    { x: stubTX, y: targetY },
  ];
  const grid = buildSparseGrid(stubSX, sourceY, stubTX, targetY, obstacles, forceOpen, penalties, currentSignalType);

  const astarResult = astarOrthogonal(grid, stubSX, sourceY, stubTX, targetY, obstacles, penalties, currentSignalType, noSourceStub, noTargetStub, excludeStartDir, excludeEndDir);
  if (!astarResult) {
    return null;
  }

  // Simplify the A* interior path
  const interior = simplifyWaypoints(astarResult.path);

  // Build the full waypoint list.
  // Endpoints (handle positions) are pinned — they must land exactly on the handle.
  // Interior waypoints are shifted by (offset, offset) to separate parallel edges.
  // X-shift separates shared vertical segments, Y-shift separates shared horizontal
  // segments (common in wrap-around edges that cross the full canvas).
  // Jog segments at the stubs maintain orthogonality: the first and last interior
  // points stay at handle Y, with a short vertical step to the offset Y.
  const waypoints: Point[] = [];

  // 1. Source handle (pinned, no offset)
  waypoints.push({ x: sourceX, y: sourceY });

  // 2. Interior A* path with offset applied
  for (let i = 0; i < interior.length; i++) {
    const p = interior[i];
    if (i === 0) {
      // Source stub: stay at handle Y, shift X only
      waypoints.push({ x: p.x + offset, y: p.y });
      // Jog to offset Y (skip if offset is 0 or only one interior point)
      if (offset !== 0 && interior.length > 2) {
        waypoints.push({ x: p.x + offset, y: p.y + offset });
      }
    } else if (i === interior.length - 1) {
      // Target stub: jog back from offset Y to handle Y
      if (offset !== 0 && interior.length > 2) {
        waypoints.push({ x: p.x + offset, y: p.y + offset });
      }
      waypoints.push({ x: p.x + offset, y: p.y });
    } else {
      // Middle interior: shift both X and Y
      waypoints.push({ x: p.x + offset, y: p.y + offset });
    }
  }

  // 3. Target handle (pinned, no offset)
  waypoints.push({ x: targetX, y: targetY });

  // Simplify again to remove any collinear points from the assembly
  const simplified = simplifyWaypoints(waypoints);

  // Generate SVG path
  const path = waypointsToSvgPath(simplified);

  // Label position: midpoint of the path
  const midIdx = Math.floor(simplified.length / 2);
  const labelPt = simplified[midIdx];
  const prevPt = simplified[Math.max(0, midIdx - 1)];
  const labelX = (labelPt.x + prevPt.x) / 2;
  const labelY = (labelPt.y + prevPt.y) / 2;

  // Build compact turn summary: only the bend points (not start/end)
  const turns = simplified.length > 2
    ? simplified.slice(1, -1).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" → ")
    : "straight";

  return { path, labelX, labelY, turns, waypoints: simplified, arrivalDir: astarResult.arrivalDir };
}
