import { memo, useRef, useEffect } from "react";
import {
  // getSmoothStepPath,  // OLD: commented out to see pure A* routing
  BaseEdge,
  type EdgeProps,
} from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { ConnectionEdge, SchematicNode } from "../types";
import { buildObstacles, computeEdgePath, type Rect } from "../pathfinding";

const EDGE_GAP = 12;
const STUB_GAP = 6;
const CX_THRESHOLD = 15;
const Y_GAP_THRESHOLD = 50;

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

/** Compute a stable string digest of obstacle rects for cache invalidation */
function obstacleDigest(rects: Rect[]): string {
  if (rects.length === 0) return "";
  const sorted = [...rects].sort((a, b) => a.left - b.left || a.top - b.top);
  return sorted.map((r) => `${r.left|0},${r.top|0},${r.right|0},${r.bottom|0}`).join(";");
}

function OffsetEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  // sourcePosition,  // OLD: only needed for getSmoothStepPath
  // targetPosition,  // OLD: only needed for getSmoothStepPath
  style,
  markerEnd,
  selected,
}: EdgeProps<ConnectionEdge>) {
  // Overlap offset for parallel edges in the MIDDLE of the path (cx-based BFS grouping)
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

  // Stub offset: small spread for edges sharing the same source device.
  // Prevents overlapping vertical segments at device exits, separate from mid-path offset.
  const stubOffset = useSchematicStore((state) => {
    const siblings = state.edges.filter((e) => e.source === source && e.id !== id);
    if (siblings.length === 0) return 0;

    // Collect sourceY for this edge and siblings — sort by handle Y to assign stable indices
    const allFromSource: { edgeId: string; handleY: number }[] = [];
    for (const e of state.edges) {
      if (e.source !== source) continue;
      const src = state.nodes.find((n) => n.id === e.source);
      const tgt = state.nodes.find((n) => n.id === e.target);
      if (!src || !tgt) continue;
      const srcPos = getAbsPos(src, state.nodes);
      const tgtPos = getAbsPos(tgt, state.nodes);
      const srcH = src.measured?.height ?? 80;
      const tgtH = tgt.measured?.height ?? 80;
      // Use target center Y as differentiator (where the edge is heading)
      allFromSource.push({ edgeId: e.id, handleY: tgtPos.y + tgtH / 2 });
    }

    if (allFromSource.length <= 1) return 0;

    allFromSource.sort((a, b) => a.handleY - b.handleY || a.edgeId.localeCompare(b.edgeId));
    const index = allFromSource.findIndex((e) => e.edgeId === id);
    const mid = (allFromSource.length - 1) / 2;
    return (index - mid) * STUB_GAP;
  });

  // Build obstacles from nodes (returns stable digest string)
  const digest = useSchematicStore((state) => {
    const obs = buildObstacles(state.nodes, source, target, (n) =>
      getAbsPos(n as SchematicNode, state.nodes as SchematicNode[]),
    );
    return obstacleDigest(obs.rects);
  });

  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const isDragging = useSchematicStore((s) => s.isDragging);

  // Cache ref for A* result
  const cacheRef = useRef<{
    key: string;
    result: { path: string; labelX: number; labelY: number; turns: string } | null;
  } | null>(null);

  const cacheKey = `${sourceX},${sourceY},${targetX},${targetY},${overlapOffset},${stubOffset},${digest}`;

  let astarResult: { path: string; labelX: number; labelY: number; turns: string } | null = null;

  if (isDragging && cacheRef.current) {
    // Freeze edges during drag — use last cached result
    astarResult = cacheRef.current.result;
  } else if (cacheRef.current?.key === cacheKey) {
    astarResult = cacheRef.current.result;
  } else {
    const nodes = useSchematicStore.getState().nodes;
    const obs = buildObstacles(nodes, source, target, (n) =>
      getAbsPos(n as SchematicNode, nodes as SchematicNode[]),
    );
    astarResult = computeEdgePath(
      sourceX, sourceY, targetX, targetY,
      obs.rects, overlapOffset, stubOffset,
    );
    cacheRef.current = { key: cacheKey, result: astarResult };
  }

  const edgePath = astarResult?.path ?? `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  const lx = astarResult?.labelX ?? (sourceX + targetX) / 2;
  const ly = astarResult?.labelY ?? (sourceY + targetY) / 2;
  const turns = astarResult?.turns ?? "fallback";

  // Show label at both source and target ends so it's visible even if the path goes behind a device
  const debugLabel = debugEdges ? (
    <>
      <foreignObject
        x={sourceX + 4}
        y={sourceY - 7}
        width={1}
        height={1}
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        <div style={{
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "#e44",
          background: "rgba(255,255,255,0.9)",
          padding: "0 3px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          width: "max-content",
          border: "1px solid #fcc",
        }}>
          {id}
        </div>
      </foreignObject>
      <foreignObject
        x={targetX - 4}
        y={targetY - 7}
        width={1}
        height={1}
        style={{ pointerEvents: "none", overflow: "visible" }}
      >
        <div style={{
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "#e44",
          background: "rgba(255,255,255,0.9)",
          padding: "0 3px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          width: "max-content",
          direction: "rtl",
          border: "1px solid #fcc",
        }}>
          {id}
        </div>
      </foreignObject>
    </>
  ) : null;

  // Log routing data when debug mode is active
  const prevDebugRef = useRef(false);
  useEffect(() => {
    if (debugEdges && !prevDebugRef.current) {
      console.log(`[EDGE_DEBUG] ${id} | src=${Math.round(sourceX)},${Math.round(sourceY)} tgt=${Math.round(targetX)},${Math.round(targetY)} off=${overlapOffset} stub=${stubOffset} | ${turns}`);
    }
    prevDebugRef.current = debugEdges;
  }, [debugEdges, id, sourceX, sourceY, targetX, targetY, overlapOffset, stubOffset, turns]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        labelX={lx}
        labelY={ly}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
        }}
        markerEnd={markerEnd}
      />
      {debugLabel}
    </>
  );
}

export default memo(OffsetEdgeComponent);
