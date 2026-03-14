import type { DeviceData, SchematicNode } from "./types";

const SNAP_THRESHOLD = 5;

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

function nodeRect(node: SchematicNode): Rect {
  const w = node.measured?.width ?? 180;
  const h = node.measured?.height ?? 60;
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

  const others = allNodes.filter(
    (n) => n.id !== draggedNode.id && n.type !== "room",
  );

  const xCandidates: XCandidate[] = [];
  const yCandidates: YCandidate[] = [];

  for (const other of others) {
    if (other.parentId !== draggedNode.parentId) continue;
    const r = nodeRect(other);
    const absOffset = getParentOffset(other, allNodes);
    const absR = offsetRect(r, absOffset.dx, absOffset.dy);

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
 * Returns null if no correction is needed.
 */
export function enforceMinSpacing(
  draggedNode: SchematicNode,
  allNodes: SchematicNode[],
): { x: number; y: number } | null {
  if (draggedNode.type === "room") return null;

  const dragged = nodeRect(draggedNode);
  let newX = draggedNode.position.x;
  let newY = draggedNode.position.y;
  let changed = false;

  for (const other of allNodes) {
    if (other.id === draggedNode.id) continue;
    if (other.type === "room") continue;
    if (other.parentId !== draggedNode.parentId) continue;

    const or = nodeRect(other);

    // Only enforce horizontal spacing when the devices' Y ranges overlap
    // (otherwise they're stacked vertically and stubs don't conflict)
    const yOverlap = dragged.top < or.bottom + PAD && dragged.bottom > or.top - PAD;
    if (!yOverlap) continue;

    // Determine which side faces which based on center positions
    const draggedRight = newX + (dragged.right - dragged.left);

    if (newX < or.left) {
      // Dragged is to the LEFT of other
      const spreadA = maxSpread(rightPortCount(draggedNode));
      const spreadB = maxSpread(leftPortCount(other));
      const minGap = STUB + PAD + ROUTING_GAP + Math.max(spreadA, spreadB);
      const currentGap = or.left - draggedRight;
      if (currentGap < minGap) {
        newX -= (minGap - currentGap);
        changed = true;
      }
    } else if (newX >= or.right) {
      // Dragged is to the RIGHT of other
      const spreadA = maxSpread(leftPortCount(draggedNode));
      const spreadB = maxSpread(rightPortCount(other));
      const minGap = STUB + PAD + ROUTING_GAP + Math.max(spreadA, spreadB);
      const currentGap = newX - or.right;
      if (currentGap < minGap) {
        newX += (minGap - currentGap);
        changed = true;
      }
    } else {
      // Horizontally overlapping — push to whichever side is closer
      const pushLeft = newX - (or.left - (dragged.right - dragged.left));
      const pushRight = or.right - newX;
      const spreadOut = maxSpread(rightPortCount(draggedNode));
      const spreadIn = maxSpread(leftPortCount(draggedNode));
      const minGap = STUB + PAD + ROUTING_GAP + Math.max(spreadOut, spreadIn);

      if (pushLeft <= pushRight) {
        newX = or.left - (dragged.right - dragged.left) - minGap;
      } else {
        newX = or.right + minGap;
      }
      changed = true;
    }
  }

  return changed ? { x: newX, y: newY } : null;
}
