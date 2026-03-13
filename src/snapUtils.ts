import type { SchematicNode } from "./types";

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
