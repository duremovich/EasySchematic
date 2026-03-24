import type { DeviceData, SchematicNode } from "./types";

import { GRID_SIZE } from "./store";

// Must be >= half the grid size so alignment snapping works with grid-snapped positions.
// React Flow's snapToGrid moves nodes in GRID_SIZE increments, so we need to catch
// candidates within one grid step.
const SNAP_THRESHOLD = GRID_SIZE;

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
  const ports = (node.data as DeviceData).ports ?? [];
  const inputs = ports.filter((p) => p.direction === "input" || p.direction === "bidirectional").length;
  const outputs = ports.filter((p) => p.direction === "output" || p.direction === "bidirectional").length;
  const portRows = Math.max(inputs, outputs);
  return Math.max(60, 32 + portRows * 20);
}

function nodeRect(node: SchematicNode): Rect {
  const w = node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? (node.type === "room" ? 400 : 180);
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

/** Get absolute position offset for a node's parent chain. */
function getParentOffset(
  node: SchematicNode,
  allNodes: SchematicNode[],
): { dx: number; dy: number } {
  if (!node.parentId) return { dx: 0, dy: 0 };
  const parent = allNodes.find((n) => n.id === node.parentId);
  if (!parent) return { dx: 0, dy: 0 };
  return { dx: parent.position.x, dy: parent.position.y };
}

function offsetRect(r: Rect, dx: number, dy: number): Rect {
  return {
    left: r.left + dx,
    right: r.right + dx,
    top: r.top + dy,
    bottom: r.bottom + dy,
    centerX: r.centerX + dx,
    centerY: r.centerY + dy,
  };
}

interface XCandidate {
  delta: number;
  alignX: number; // relative coordinate for the guide
  anchorAbsRect: Rect; // anchor rect in absolute flow-space
}

interface YCandidate {
  delta: number;
  alignY: number;
  anchorAbsRect: Rect;
}

export function computeSnap(
  draggedNode: SchematicNode,
  allNodes: SchematicNode[],
): SnapResult {
  const dragged = nodeRect(draggedNode);
  const dw = dragged.right - dragged.left;
  const dh = dragged.bottom - dragged.top;

  const isDraggedRoom = draggedNode.type === "room";
  const others = allNodes.filter((n) => {
    if (n.id === draggedNode.id) return false;
    // Rooms snap to other rooms
    if (isDraggedRoom) return n.type === "room";
    // Devices snap to other devices (same parent) and top-level rooms
    return true;
  });

  const xCandidates: XCandidate[] = [];
  const yCandidates: YCandidate[] = [];

  for (const other of others) {
    // Same-parent check for device-to-device snapping; skip for room targets
    if (other.type !== "room" && other.parentId !== draggedNode.parentId) continue;

    // For room targets when dragging a child device, compute delta in the
    // dragged node's coordinate space (relative to its parent)
    const isRoomTarget = other.type === "room" && !isDraggedRoom;
    let r: Rect;
    if (isRoomTarget && draggedNode.parentId) {
      // Convert room's absolute coords to the parent-relative space of the dragged device
      const parentOff = getParentOffset(draggedNode, allNodes);
      r = offsetRect(nodeRect(other), -parentOff.dx, -parentOff.dy);
    } else {
      r = nodeRect(other);
    }
    const absOffset = getParentOffset(other, allNodes);
    const absR = offsetRect(nodeRect(other), absOffset.dx, absOffset.dy);

    // X-axis snaps (produce vertical guide lines)
    xCandidates.push({ delta: r.left - dragged.left, alignX: r.left, anchorAbsRect: absR });
    xCandidates.push({ delta: r.right - dragged.right, alignX: r.right, anchorAbsRect: absR });
    xCandidates.push({ delta: r.centerX - dragged.centerX, alignX: r.centerX, anchorAbsRect: absR });
    xCandidates.push({ delta: r.right - dragged.left, alignX: r.right, anchorAbsRect: absR });
    xCandidates.push({ delta: r.left - dragged.right, alignX: r.left, anchorAbsRect: absR });

    // Y-axis snaps (produce horizontal guide lines)
    yCandidates.push({ delta: r.top - dragged.top, alignY: r.top, anchorAbsRect: absR });
    yCandidates.push({ delta: r.bottom - dragged.bottom, alignY: r.bottom, anchorAbsRect: absR });
    yCandidates.push({ delta: r.centerY - dragged.centerY, alignY: r.centerY, anchorAbsRect: absR });
    yCandidates.push({ delta: r.bottom - dragged.top, alignY: r.bottom, anchorAbsRect: absR });
    yCandidates.push({ delta: r.top - dragged.bottom, alignY: r.top, anchorAbsRect: absR });
  }

  // Find best X delta
  let bestXDelta: number | null = null;
  for (const c of xCandidates) {
    if (Math.abs(c.delta) > SNAP_THRESHOLD) continue;
    if (bestXDelta === null || Math.abs(c.delta) < Math.abs(bestXDelta)) {
      bestXDelta = c.delta;
    }
  }

  // Find best Y delta
  let bestYDelta: number | null = null;
  for (const c of yCandidates) {
    if (Math.abs(c.delta) > SNAP_THRESHOLD) continue;
    if (bestYDelta === null || Math.abs(c.delta) < Math.abs(bestYDelta)) {
      bestYDelta = c.delta;
    }
  }

  const snappedX = bestXDelta !== null ? dragged.left + bestXDelta : dragged.left;
  const snappedY = bestYDelta !== null ? dragged.top + bestYDelta : dragged.top;

  // Compute absolute position of snapped dragged node
  const dragOffset = getParentOffset(draggedNode, allNodes);
  const snappedAbs: Rect = {
    left: snappedX + dragOffset.dx,
    right: snappedX + dw + dragOffset.dx,
    top: snappedY + dragOffset.dy,
    bottom: snappedY + dh + dragOffset.dy,
    centerX: snappedX + dw / 2 + dragOffset.dx,
    centerY: snappedY + dh / 2 + dragOffset.dy,
  };

  const guides: GuideLine[] = [];

  // Collect X guides — use absolute coordinates
  if (bestXDelta !== null) {
    const matching = xCandidates.filter(
      (c) => Math.abs(c.delta - bestXDelta!) < 0.5,
    );
    const seen = new Set<number>();
    for (const m of matching) {
      // Convert the relative alignX to absolute
      const absAlignX = m.alignX + dragOffset.dx;
      const key = Math.round(absAlignX * 10);
      if (seen.has(key)) continue;
      seen.add(key);

      const from = Math.min(m.anchorAbsRect.top, snappedAbs.top);
      const to = Math.max(m.anchorAbsRect.bottom, snappedAbs.bottom);
      guides.push({ orientation: "v", pos: absAlignX, from, to });
    }
  }

  // Collect Y guides — use absolute coordinates
  if (bestYDelta !== null) {
    const matching = yCandidates.filter(
      (c) => Math.abs(c.delta - bestYDelta!) < 0.5,
    );
    const seen = new Set<number>();
    for (const m of matching) {
      const absAlignY = m.alignY + dragOffset.dy;
      const key = Math.round(absAlignY * 10);
      if (seen.has(key)) continue;
      seen.add(key);

      const from = Math.min(m.anchorAbsRect.left, snappedAbs.left);
      const to = Math.max(m.anchorAbsRect.right, snappedAbs.right);
      guides.push({ orientation: "h", pos: absAlignY, from, to });
    }
  }

  return { x: snappedX, y: snappedY, guides };
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

/** Count ports on the right side (outputs + bidirectional) */
function rightPortCount(node: SchematicNode): number {
  if (node.type === "room") return 0;
  const ports = (node.data as DeviceData).ports ?? [];
  return ports.filter((p) => p.direction === "output" || p.direction === "bidirectional").length;
}

/** Count ports on the left side (inputs + bidirectional) */
function leftPortCount(node: SchematicNode): number {
  if (node.type === "room") return 0;
  const ports = (node.data as DeviceData).ports ?? [];
  return ports.filter((p) => p.direction === "input" || p.direction === "bidirectional").length;
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
    if (n.type === "room" || n.type === "note") return false;
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

  // Snap corrected position to grid
  newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
  newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

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
