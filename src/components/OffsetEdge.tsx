import { memo, useRef, useEffect, useCallback } from "react";
import {
  BaseEdge,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useSchematicStore } from "../store";
import { GRID_SIZE } from "../store";
import type { ConnectionEdge } from "../types";
import { extractSegments, orthogonalize } from "../edgeRouter";
import { waypointsToSvgPath, simplifyWaypoints } from "../pathfinding";

/** Snap a value to the nearest grid increment. */
function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

function OffsetEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  selected,
}: EdgeProps<ConnectionEdge>) {
  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const rfInstance = useReactFlow();

  // Read pre-computed route from store (serialized to string to avoid re-render loops)
  const routeStr = useSchematicStore((s) => {
    const r = s.routedEdges[id];
    if (!r) return "";
    return `${r.svgPath}\0${r.labelX}\0${r.labelY}\0${r.turns}`;
  });

  // Read connector mismatch flag (stable primitive selector)
  const connectorMismatch = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.connectorMismatch === true;
  });

  // Read allow incompatible override (stable primitive selector)
  const allowIncompatible = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.allowIncompatible === true;
  });

  // Read user-defined connection label (stable primitive selector)
  const edgeLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.label as string) ?? "";
  });

  // Read stubbed flag (stable primitive selector)
  const stubbed = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.stubbed === true;
  });

  // Read routed waypoints for stub computation (serialized for stability)
  const routeWpStr = useSchematicStore((s) => {
    if (!stubbed) return "";
    const r = s.routedEdges[id];
    if (!r?.waypoints?.length) return "";
    return r.waypoints.map((p) => `${p.x},${p.y}`).join("|");
  });

  // Read manual waypoints directly (serialized for stable selector)
  const manualWpStr = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge?.data?.manualWaypoints?.length) return "";
    return edge.data.manualWaypoints.map((p) => `${p.x},${p.y}`).join("|");
  });

  const isManual = manualWpStr.length > 0;

  let edgePath: string;
  let lx: number;
  let ly: number;
  let turns: string;

  if (routeStr) {
    const parts = routeStr.split("\0");
    edgePath = parts[0];
    lx = Number(parts[1]);
    ly = Number(parts[2]);
    turns = parts[3];
  } else {
    edgePath = `M ${sourceX} ${sourceY} L ${sourceX} ${sourceY}`;
    lx = sourceX;
    ly = sourceY;
    turns = "pending";
  }

  const edgeStyle = routeStr
    ? {
        ...style,
        strokeWidth: selected ? 3 : 2,
        ...(connectorMismatch && !allowIncompatible ? { strokeDasharray: "6 3" } : {}),
      }
    : { ...style, strokeWidth: 0, opacity: 0 };

  // --- Waypoint dragging ---
  const dragStateRef = useRef<{
    wpIdx: number;
    startFlowPos: { x: number; y: number };
    originalWaypoints: { x: number; y: number }[];
    originalPos: { x: number; y: number };
  } | null>(null);

  // Parse manual waypoints for rendering drag handles
  const manualWaypoints = manualWpStr
    ? manualWpStr.split("|").map((s) => {
        const [x, y] = s.split(",");
        return { x: Number(x), y: Number(y) };
      })
    : [];

  /**
   * Write manual waypoints to edge data AND immediately update routedEdges
   * so the visual reflects the new path without waiting for the recompute timer.
   */
  function applyManualWaypoints(newManualWps: { x: number; y: number }[]) {
    const store = useSchematicStore.getState();

    // Build full visual path: source + user-placed points + target
    // Orthogonalize to maintain horizontal/vertical segments with smooth corners
    const fullWp = simplifyWaypoints(orthogonalize([
      { x: sourceX, y: sourceY },
      ...newManualWps,
      { x: targetX, y: targetY },
    ]));

    const svgPath = waypointsToSvgPath(fullWp);

    const segs = extractSegments(fullWp);
    const midIdx = Math.floor(fullWp.length / 2);

    useSchematicStore.setState({
      edges: store.edges.map((edge) =>
        edge.id === id
          ? { ...edge, data: { ...edge.data!, manualWaypoints: newManualWps } }
          : edge,
      ),
      routedEdges: {
        ...store.routedEdges,
        [id]: {
          edgeId: id,
          svgPath,
          waypoints: fullWp,
          segments: segs,
          labelX: fullWp[midIdx]?.x ?? sourceX,
          labelY: fullWp[midIdx]?.y ?? sourceY,
          turns: "manual",
        },
      },
    });
  }

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, wpIdx: number) => {
      e.stopPropagation();
      e.preventDefault();

      const store = useSchematicStore.getState();
      store.pushSnapshot();

      const currentWps = manualWaypoints.map((p) => ({ ...p }));
      if (wpIdx < 0 || wpIdx >= currentWps.length) return;

      const flowPos = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      dragStateRef.current = {
        wpIdx,
        startFlowPos: flowPos,
        originalWaypoints: currentWps,
        originalPos: { ...currentWps[wpIdx] },
      };

      useSchematicStore.setState({ isDragging: true });

      const onMouseMove = (me: MouseEvent) => {
        const ds = dragStateRef.current;
        if (!ds) return;

        const currentFlowPos = rfInstance.screenToFlowPosition({
          x: me.clientX,
          y: me.clientY,
        });

        const newWaypoints = ds.originalWaypoints.map((p) => ({ ...p }));
        newWaypoints[ds.wpIdx] = {
          x: snapToGrid(ds.originalPos.x + (currentFlowPos.x - ds.startFlowPos.x)),
          y: snapToGrid(ds.originalPos.y + (currentFlowPos.y - ds.startFlowPos.y)),
        };

        applyManualWaypoints(newWaypoints);
      };

      const onMouseUp = () => {
        dragStateRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        useSchematicStore.setState({ isDragging: false });
        useSchematicStore.getState().saveToLocalStorage();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, manualWpStr, sourceX, sourceY, targetX, targetY],
  );

  // --- Render handles ---
  // Only show draggable circles at manually-placed waypoints
  const waypointHandles =
    selected && isManual && manualWaypoints.length > 0
      ? manualWaypoints.map((wp, i) => (
          <g key={`wp-${i}`}>
            <circle
              cx={wp.x}
              cy={wp.y}
              r={5}
              fill="white"
              stroke="#1a73e8"
              strokeWidth={2}
              style={{ pointerEvents: "none" }}
            />
            {/* Fat invisible circle as hit target */}
            <circle
              cx={wp.x}
              cy={wp.y}
              r={10}
              fill="rgba(0,0,0,0.001)"
              stroke="rgba(0,0,0,0.001)"
              strokeWidth={4}
              style={{ cursor: "grab", pointerEvents: "all" }}
              onMouseDown={(e) => onHandleMouseDown(e, i)}
            />
          </g>
        ))
      : null;

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
          {id}{isManual ? " [manual]" : ""}
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

  // --- Stubbed connection rendering ---
  // When stubbed, draw short ~40px stubs from source and target instead of full path
  let stubPaths: { srcPath: string; tgtPath: string; srcEnd: {x:number;y:number;dx:number;dy:number}; tgtEnd: {x:number;y:number;dx:number;dy:number} } | null = null;
  if (stubbed && routeWpStr) {
    const wps = routeWpStr.split("|").map((s) => {
      const [x, y] = s.split(",");
      return { x: Number(x), y: Number(y) };
    });
    const STUB_LEN = 40;

    // Walk from start along waypoints for STUB_LEN px
    const walkStub = (points: {x:number;y:number}[], maxLen: number) => {
      let remaining = maxLen;
      const result: {x:number;y:number}[] = [{ ...points[0] }];
      let lastDx = 0, lastDy = 0;
      for (let i = 1; i < points.length && remaining > 0; i++) {
        const dx = points[i].x - points[i-1].x;
        const dy = points[i].y - points[i-1].y;
        const segLen = Math.sqrt(dx*dx + dy*dy);
        if (segLen === 0) continue;
        const nx = dx / segLen, ny = dy / segLen;
        if (segLen <= remaining) {
          result.push({ ...points[i] });
          remaining -= segLen;
          lastDx = nx;
          lastDy = ny;
        } else {
          result.push({ x: points[i-1].x + nx * remaining, y: points[i-1].y + ny * remaining });
          lastDx = nx;
          lastDy = ny;
          remaining = 0;
        }
      }
      return { path: result, dx: lastDx, dy: lastDy };
    };

    const srcStub = walkStub(wps, STUB_LEN);
    const tgtStub = walkStub([...wps].reverse(), STUB_LEN);

    const toPath = (pts: {x:number;y:number}[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    const srcEnd = srcStub.path[srcStub.path.length - 1];
    const tgtEnd = tgtStub.path[tgtStub.path.length - 1];

    stubPaths = {
      srcPath: toPath(srcStub.path),
      tgtPath: toPath(tgtStub.path),
      srcEnd: { ...srcEnd, dx: srcStub.dx, dy: srcStub.dy },
      tgtEnd: { ...tgtEnd, dx: tgtStub.dx, dy: tgtStub.dy },
    };
  }

  // User-defined connection label rendered at the midpoint
  const connectionLabel = edgeLabel && routeStr ? (
    <foreignObject
      x={lx}
      y={ly - 9}
      width={1}
      height={1}
      style={{ pointerEvents: "none", overflow: "visible" }}
    >
      <div style={{
        fontSize: 10,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 500,
        color: "#374151",
        background: "rgba(255,255,255,0.92)",
        padding: "1px 4px",
        borderRadius: 3,
        whiteSpace: "nowrap",
        width: "max-content",
        transform: "translateX(-50%)",
        border: "1px solid #e5e7eb",
      }}>
        {edgeLabel}
      </div>
    </foreignObject>
  ) : null;

  // Log routing data when debug mode is active
  const prevDebugRef = useRef(false);
  useEffect(() => {
    if (debugEdges && !prevDebugRef.current) {
      console.log(`[EDGE_DEBUG] ${id} | src=${Math.round(sourceX)},${Math.round(sourceY)} tgt=${Math.round(targetX)},${Math.round(targetY)} | ${turns}`);
    }
    prevDebugRef.current = debugEdges;
  }, [debugEdges, id, sourceX, sourceY, targetX, targetY, turns]);

  // Render slash mark at stub end perpendicular to the path direction
  const renderSlash = (end: {x:number;y:number;dx:number;dy:number}, key: string) => {
    // Perpendicular to direction, 6px half-length
    const px = -end.dy, py = end.dx;
    const len = 6;
    return (
      <line
        key={key}
        x1={end.x - px * len} y1={end.y - py * len}
        x2={end.x + px * len} y2={end.y + py * len}
        stroke={edgeStyle.stroke as string ?? "currentColor"}
        strokeWidth={edgeStyle.strokeWidth ?? 2}
        style={{ pointerEvents: "none" }}
      />
    );
  };

  if (stubbed && stubPaths) {
    return (
      <>
        <path d={stubPaths.srcPath} fill="none" style={edgeStyle} markerEnd={undefined} />
        <path d={stubPaths.tgtPath} fill="none" style={edgeStyle} markerEnd={markerEnd} />
        {renderSlash(stubPaths.srcEnd, "slash-src")}
        {renderSlash(stubPaths.tgtEnd, "slash-tgt")}
        {connectionLabel}
        {debugLabel}
      </>
    );
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        labelX={lx}
        labelY={ly}
        style={edgeStyle}
        markerEnd={markerEnd}
      />
      {connectionLabel}
      {waypointHandles}
      {debugLabel}
    </>
  );
}

export default memo(OffsetEdgeComponent);
