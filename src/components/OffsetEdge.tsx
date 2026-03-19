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
        ...(connectorMismatch ? { strokeDasharray: "6 3" } : {}),
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

  // Log routing data when debug mode is active
  const prevDebugRef = useRef(false);
  useEffect(() => {
    if (debugEdges && !prevDebugRef.current) {
      console.log(`[EDGE_DEBUG] ${id} | src=${Math.round(sourceX)},${Math.round(sourceY)} tgt=${Math.round(targetX)},${Math.round(targetY)} | ${turns}`);
    }
    prevDebugRef.current = debugEdges;
  }, [debugEdges, id, sourceX, sourceY, targetX, targetY, turns]);

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
      {waypointHandles}
      {debugLabel}
    </>
  );
}

export default memo(OffsetEdgeComponent);
