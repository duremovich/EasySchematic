import { memo } from "react";
import {
  getSmoothStepPath,
  BaseEdge,
  type EdgeProps,
} from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { ConnectionEdge, SchematicNode } from "../types";

const EDGE_GAP = 12;
const CX_THRESHOLD = 15;
const Y_GAP_THRESHOLD = 50;
const NODE_PAD = 20;

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

interface EdgeInfo {
  id: string;
  cx: number;
  yMin: number;
  yMax: number;
  sourceCenterY: number;
  targetCenterY: number;
}

function areNeighbors(a: EdgeInfo, b: EdgeInfo): boolean {
  if (Math.abs(a.cx - b.cx) >= CX_THRESHOLD) return false;
  const gap = Math.max(0, Math.max(a.yMin, b.yMin) - Math.min(a.yMax, b.yMax));
  return gap < Y_GAP_THRESHOLD;
}

function findComponent(startId: string, edges: EdgeInfo[]): EdgeInfo[] {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = edges.find((e) => e.id === currentId)!;
    for (const other of edges) {
      if (visited.has(other.id)) continue;
      if (areNeighbors(current, other)) {
        visited.add(other.id);
        queue.push(other.id);
      }
    }
  }
  return edges.filter((e) => visited.has(e.id));
}

function OffsetEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps<ConnectionEdge>) {
  // Overlap offset for parallel edges (returns stable number)
  const overlapOffset = useSchematicStore((state) => {
    const edgeInfo: EdgeInfo[] = [];
    for (const e of state.edges) {
      const src = state.nodes.find((n) => n.id === e.source);
      const tgt = state.nodes.find((n) => n.id === e.target);
      if (!src || !tgt) continue;

      const srcPos = getAbsPos(src, state.nodes);
      const tgtPos = getAbsPos(tgt, state.nodes);
      const srcRight = srcPos.x + (src.measured?.width ?? 180);
      const tgtLeft = tgtPos.x;
      const srcH = src.measured?.height ?? 80;
      const tgtH = tgt.measured?.height ?? 80;

      edgeInfo.push({
        id: e.id,
        cx: (srcRight + tgtLeft) / 2,
        yMin: Math.min(srcPos.y, tgtPos.y),
        yMax: Math.max(srcPos.y + srcH, tgtPos.y + tgtH),
        sourceCenterY: srcPos.y + srcH / 2,
        targetCenterY: tgtPos.y + tgtH / 2,
      });
    }

    const thisEdge = edgeInfo.find((ec) => ec.id === id);
    if (!thisEdge) return 0;

    const component = findComponent(id, edgeInfo);
    if (component.length <= 1) return 0;

    // Sort by vertical extent: edges spanning further down get outermost (leftmost) position.
    // Primary: max Y of vertical (ascending) — deeper verticals go further left.
    // Tiebreak: min Y of vertical (descending) — shorter verticals are innermost.
    component.sort((a, b) => {
      const maxA = Math.max(a.sourceCenterY, a.targetCenterY);
      const maxB = Math.max(b.sourceCenterY, b.targetCenterY);
      if (maxA !== maxB) return maxA - maxB;
      const minA = Math.min(a.sourceCenterY, a.targetCenterY);
      const minB = Math.min(b.sourceCenterY, b.targetCenterY);
      if (minA !== minB) return minB - minA;
      return a.id.localeCompare(b.id);
    });

    const index = component.findIndex((ec) => ec.id === id);
    const mid = (component.length - 1) / 2;
    return (mid - index) * EDGE_GAP;
  });

  // Compute a centerX that avoids blocking nodes (returns stable number)
  const centerX = useSchematicStore((state) => {
    const defaultCX = (sourceX + targetX) / 2 + overlapOffset;
    const pathYMin = Math.min(sourceY, targetY);
    const pathYMax = Math.max(sourceY, targetY);

    let result = defaultCX;
    for (let pass = 0; pass < 5; pass++) {
      let blocked = false;
      for (const n of state.nodes) {
        if (n.id === source || n.id === target) continue;
        if (n.type === "room") continue;
        const pos = getAbsPos(n, state.nodes);
        const w = n.measured?.width ?? 180;
        const h = n.measured?.height ?? 60;

        // Skip nodes outside the path's Y range
        if (pos.y + h < pathYMin - NODE_PAD || pos.y > pathYMax + NODE_PAD) continue;

        const left = pos.x - NODE_PAD;
        const right = pos.x + w + NODE_PAD;
        if (result > left && result < right) {
          const goLeft = left;
          const goRight = right;
          result =
            Math.abs(defaultCX - goLeft) <= Math.abs(defaultCX - goRight)
              ? goLeft
              : goRight;
          blocked = true;
          break;
        }
      }
      if (!blocked) break;
    }
    return result;
  });

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    centerX,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      labelX={labelX}
      labelY={labelY}
      style={{
        ...style,
        strokeWidth: selected ? 3 : 2,
      }}
      markerEnd={markerEnd}
    />
  );
}

export default memo(OffsetEdgeComponent);
