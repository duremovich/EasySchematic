/**
 * A* orthogonal edge routing on a sparse event-coordinate grid.
 * Pure algorithm — no React dependencies.
 *
 * Priority rules:
 *  1. Never intersect a device node (hard constraint — blocked cells)
 *  2. Never intersect a parallel line (handled by overlapOffset in OffsetEdge)
 *  3. Prefer crossing a perpendicular line over a massive detour
 *
 * Key design decisions:
 *  - Direction-aware A* state: (x, y, dir) prevents the closed set from
 *    rejecting better arrivals from a different direction.
 *  - Offset edges route A* at the actual offset position (no post-hoc shift),
 *    eliminating overshoot jog patterns and invalid-through-obstacle paths.
 */

// ---------- Types ----------

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Point {
  x: number;
  y: number;
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

// ---------- Obstacles ----------

export function buildObstacles(
  nodes: readonly { id: string; position: { x: number; y: number }; parentId?: string; measured?: { width?: number; height?: number }; type?: string }[],
  sourceId: string,
  targetId: string,
  getAbsPos: (node: typeof nodes[number]) => { x: number; y: number },
): { rects: Rect[] } {
  const rects: Rect[] = [];
  for (const n of nodes) {
    if (n.type === "room") continue;
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
): Point[] | null {
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
    return h;
  };

  const closed = new Set<number>();
  const bestG = new Map<number, number>();

  // Start direction is RIGHT (0) — source handles exit rightward
  const startDir = 0;
  const startSK = stateKey(sxi, syi, startDir);

  const startNode: GridNode = {
    xi: sxi,
    yi: syi,
    g: 0,
    f: heuristic(sxi, syi, startDir),
    dir: startDir,
    parent: null,
  };

  const open = new MinHeap();
  open.push(startNode);
  bestG.set(startSK, 0);

  while (open.length > 0) {
    const current = open.pop()!;
    const ck = stateKey(current.xi, current.yi, current.dir);

    if (current.xi === exi && current.yi === eyi) {
      const path: Point[] = [];
      let node: GridNode | null = current;
      while (node) {
        path.push({ x: xs[node.xi], y: ys[node.yi] });
        node = node.parent;
      }
      path.reverse();
      return path;
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

      if (d !== current.dir) {
        g += TURN_PENALTY;
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
): { path: string; labelX: number; labelY: number; turns: string } | null {
  // Short-circuit: if source and target are at (nearly) the same Y and the direct
  // horizontal path is unobstructed, just draw a straight line — no stubs, no offset.
  // Skip obstacles that contain the source or target handle (the endpoint devices).
  const ALIGN_TOLERANCE = 2;
  if (Math.abs(sourceY - targetY) <= ALIGN_TOLERANCE && sourceX < targetX) {
    const midY = (sourceY + targetY) / 2;
    const blocked = obstacles.some((r) => {
      // Skip obstacles containing the source or target point (endpoint devices)
      const containsSource = sourceX >= r.left && sourceX <= r.right && sourceY >= r.top && sourceY <= r.bottom;
      const containsTarget = targetX >= r.left && targetX <= r.right && targetY >= r.top && targetY <= r.bottom;
      if (containsSource || containsTarget) return false;
      return midY >= r.top && midY <= r.bottom && targetX >= r.left && sourceX <= r.right;
    });
    if (!blocked) {
      const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      const labelX = (sourceX + targetX) / 2;
      const labelY = (sourceY + targetY) / 2;
      return { path, labelX, labelY, turns: "straight" };
    }
  }

  // Stub lengths:
  // - stubSpread: small per-port spread from same-device sibling counting (prevents stub overlaps)
  // - Signed value: positive pushes stubs further out, negative pulls them closer.
  //   Each edge from the same device gets a unique spread so their vertical stubs don't overlap.
  let stubSX = sourceX + STUB + stubSpread;
  let stubTX = targetX - STUB - stubSpread;

  // If stubs cross (source/target close in X with large spread), clamp to midpoint.
  // Only applies when target is to the right of source (normal flow).
  if (sourceX < targetX && stubSX >= stubTX) {
    const mid = (sourceX + targetX) / 2;
    stubSX = mid - 1;
    stubTX = mid + 1;
  }

  // Route A* at the actual offset position — no post-hoc shifting.
  // This ensures the path is validated against obstacles at its real position.
  const astarSY = sourceY + offset;
  const astarTY = targetY + offset;

  // Build grid between the stub points at offset Y positions
  const grid = buildSparseGrid(stubSX, astarSY, stubTX, astarTY, obstacles, [
    { x: stubSX, y: astarSY },
    { x: stubTX, y: astarTY },
  ]);

  const rawPath = astarOrthogonal(grid, stubSX, astarSY, stubTX, astarTY, obstacles);
  if (!rawPath) {
    return null;
  }

  // Simplify the A* interior path
  const interior = simplifyWaypoints(rawPath);

  // Build the full waypoint list with pinned endpoints and stub transitions.
  // Endpoints (handle positions) are NEVER offset — they must land exactly on the handle.
  const waypoints: Point[] = [];

  // 1. Source handle (pinned)
  waypoints.push({ x: sourceX, y: sourceY });

  if (offset !== 0) {
    // 2. Horizontal stub at handle Y
    waypoints.push({ x: stubSX, y: sourceY });
    // 3. Vertical jog to offset lane (stub → A* start)
    waypoints.push({ x: stubSX, y: astarSY });
    // 4. Interior A* path (already at offset position, no shifting needed)
    for (const p of interior) {
      if (p.x === stubSX && p.y === astarSY) continue; // skip duplicate at start
      if (p.x === stubTX && p.y === astarTY) continue; // skip duplicate at end
      waypoints.push(p);
    }
    // 5. Vertical jog back from offset lane to handle Y
    waypoints.push({ x: stubTX, y: astarTY });
    waypoints.push({ x: stubTX, y: targetY });
  } else {
    // No offset — just use interior directly
    for (const p of interior) {
      waypoints.push(p);
    }
  }

  // 6. Target handle (pinned)
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

  return { path, labelX, labelY, turns };
}
