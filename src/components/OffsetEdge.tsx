import { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useSchematicStore } from "../store";
import { GRID_SIZE } from "../store";
import { LINE_STYLE_DASHARRAY, type ConnectionEdge, type LineStyle } from "../types";
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
  interactionWidth,
}: EdgeProps<ConnectionEdge>) {
  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const rfInstance = useReactFlow();

  // Hover state for showing visual reconnect indicators in HTML layer
  const [isHovered, setIsHovered] = useState(false);
  // Tooltip state — tracks which updater circle the mouse is over
  const [tooltipType, setTooltipType] = useState<"source" | "target" | null>(null);

  useEffect(() => {
    const el = document.querySelector(`.react-flow__edge[data-id="${id}"]`);
    if (!el) return;
    const onEnter = () => setIsHovered(true);
    const onLeave = () => { setIsHovered(false); setTooltipType(null); };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    // Track hover on individual updater circles for tooltip
    const srcUpdater = el.querySelector('.react-flow__edgeupdater-source');
    const tgtUpdater = el.querySelector('.react-flow__edgeupdater-target');
    const onEnterSrc = () => setTooltipType("source");
    const onEnterTgt = () => setTooltipType("target");
    const onLeaveUpdater = () => setTooltipType(null);
    srcUpdater?.addEventListener('mouseenter', onEnterSrc);
    tgtUpdater?.addEventListener('mouseenter', onEnterTgt);
    srcUpdater?.addEventListener('mouseleave', onLeaveUpdater);
    tgtUpdater?.addEventListener('mouseleave', onLeaveUpdater);

    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      srcUpdater?.removeEventListener('mouseenter', onEnterSrc);
      tgtUpdater?.removeEventListener('mouseenter', onEnterTgt);
      srcUpdater?.removeEventListener('mouseleave', onLeaveUpdater);
      tgtUpdater?.removeEventListener('mouseleave', onLeaveUpdater);
    };
  }, [id]);

  // Read pre-computed route from store (serialized to string to avoid re-render loops)
  const routeStr = useSchematicStore((s) => {
    const r = s.routedEdges[id];
    if (!r) return "";
    const path = (s.showLineJumps && r.svgPathWithHops) || r.svgPath;
    return `${path}\0${r.labelX}\0${r.labelY}\0${r.turns}`;
  });

  // Read connector mismatch flag (stable primitive selector)
  const connectorMismatch = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.connectorMismatch === true;
  });

  // Check if this edge is hidden (part of a virtual pair, the secondary half)
  const isHiddenVirtualEdge = useSchematicStore((s) => s.hiddenVirtualEdgeIds.has(id));

  // Check if this edge is the primary half of a virtual pair (target is a hidden adapter)
  const isVirtualPrimary = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge ? s.hiddenAdapterNodeIds.has(edge.target) : false;
  });

  // Check if this edge should render as a gradient (virtual edge bridging different signal types)
  const gradientColors = useSchematicStore((s) => {
    const g = s.virtualEdgeGradients[id];
    if (!g) return "";
    return `${g.sourceColor}\0${g.targetColor}`;
  });

  // Read allow incompatible override (stable primitive selector)
  const allowIncompatible = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.allowIncompatible === true;
  });

  // Read direct-attach flag (edge represents physical plug-in, not a cable)
  const directAttach = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.directAttach === true;
  });

  // Read user-defined connection label (stable primitive selector)
  const edgeLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.label as string) ?? "";
  });

  // Cable ID label from pre-computed map
  const showConnectionLabels = useSchematicStore((s) => s.showConnectionLabels);
  const cableId = useSchematicStore((s) => s.cableIdMap[id] ?? "");
  const hideLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.hideLabel === true;
  });

  // Read stubbed flag (stable primitive selector)
  const stubbed = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.stubbed === true;
  });

  // Read effective line style: per-connection override > per-signal-type default > solid
  const lineStyle = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (edge?.data?.lineStyle) return edge.data.lineStyle as LineStyle;
    const signalType = edge?.data?.signalType;
    if (signalType && s.signalLineStyles?.[signalType]) return s.signalLineStyles[signalType]!;
    return "solid" as LineStyle;
  });

  // Read routed waypoints (serialized for stability)
  const routeWpStr = useSchematicStore((s) => {
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

  // Gradient for virtual edges bridging different signal types
  const hasGradient = gradientColors.length > 0;
  const gradientId = hasGradient ? `gradient-${id}` : "";
  let gradientDef: React.ReactNode = null;
  if (hasGradient && routeStr) {
    const [srcColor, tgtColor] = gradientColors.split("\0");
    // Use the first and last waypoints for gradient direction
    const routeData = useSchematicStore.getState().routedEdges[id];
    const wps = routeData?.waypoints;
    if (wps && wps.length >= 2) {
      const first = wps[0];
      const last = wps[wps.length - 1];
      gradientDef = (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={first.x}
            y1={first.y}
            x2={last.x}
            y2={last.y}
          >
            <stop offset="0%" stopColor={srcColor} />
            <stop offset="100%" stopColor={tgtColor} />
          </linearGradient>
        </defs>
      );
    }
  }

  const edgeStyle = routeStr
    ? {
        ...style,
        ...(directAttach
          ? { stroke: "#9ca3af", strokeWidth: selected ? 2 : 1 }
          : { strokeWidth: selected ? 3 : 2 }),
        ...(connectorMismatch && !allowIncompatible
          ? { strokeDasharray: "6 3" }
          : LINE_STYLE_DASHARRAY[lineStyle]
            ? { strokeDasharray: LINE_STYLE_DASHARRAY[lineStyle] }
            : {}),
        ...(hasGradient ? { stroke: `url(#${gradientId})` } : {}),
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
          ? { ...edge, data: { ...edge.data!, manualWaypoints: newManualWps, autoRouteWaypoints: undefined } }
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

  // User-defined connection label rendered at the midpoint (via EdgeLabelRenderer)
  const connectionLabel = edgeLabel && routeStr ? (
    <div
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`,
        pointerEvents: "none",
        fontSize: 10,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 500,
        color: "#374151",
        background: "rgba(255,255,255,0.92)",
        padding: "1px 4px",
        borderRadius: 3,
        whiteSpace: "nowrap",
        border: "1px solid #e5e7eb",
      }}
    >
      {edgeLabel}
    </div>
  ) : null;

  // Cable ID labels at both ends of the connection, positioned along cable direction
  const signalColor = (style?.stroke as string) ?? "#6b7280";
  const labelText = cableId;

  // Compute direction vectors at source and target from routed waypoints
  let srcDx = 0, srcDy = 0, tgtDx = 0, tgtDy = 0;
  if (routeWpStr) {
    const wps = routeWpStr.split("|").map((s) => {
      const [x, y] = s.split(",");
      return { x: Number(x), y: Number(y) };
    });
    if (wps.length >= 2) {
      // Source: direction from first to second waypoint
      const sdx = wps[1].x - wps[0].x;
      const sdy = wps[1].y - wps[0].y;
      const slen = Math.sqrt(sdx * sdx + sdy * sdy);
      if (slen > 0) { srcDx = sdx / slen; srcDy = sdy / slen; }
      // Target: direction from last to second-to-last (approach direction, label goes outward)
      const tdx = wps[wps.length - 1].x - wps[wps.length - 2].x;
      const tdy = wps[wps.length - 1].y - wps[wps.length - 2].y;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tlen > 0) { tgtDx = tdx / tlen; tgtDy = tdy / tlen; }
    }
  }

  const LABEL_GAP = 4;
  const cableIdLabelStyle: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    fontSize: 9,
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 600,
    color: "#374151",
    background: "rgba(255,255,255,0.92)",
    padding: "0 3px",
    borderRadius: 2,
    whiteSpace: "nowrap",
    border: `1px solid ${signalColor}`,
  };

  // Build a positioned cable ID label div for EdgeLabelRenderer
  const makeCableIdLabel = (
    ex: number, ey: number, dx: number, dy: number, key: string,
  ) => {
    // Determine dominant axis (orthogonal cables: one of dx/dy is ~1, other ~0)
    const isHoriz = Math.abs(dx) >= Math.abs(dy);
    // Offset along the cable direction from the endpoint
    const px = isHoriz ? ex + Math.sign(dx) * LABEL_GAP : ex;
    const py = isHoriz ? ey : ey + Math.sign(dy) * LABEL_GAP;
    // CSS translate: place at (px, py) then anchor appropriately
    const anchorX = isHoriz ? (dx < 0 ? "-100%" : "0%") : "-50%";
    const anchorY = isHoriz ? "-50%" : (dy < 0 ? "-100%" : "0%");

    return (
      <div
        key={key}
        style={{
          ...cableIdLabelStyle,
          transform: `translate(${anchorX}, ${anchorY}) translate(${px}px, ${py}px)`,
        }}
      >
        {labelText}
      </div>
    );
  };

  // For virtual primary edges, the target label should be at the end of the routed path
  // (not at the hidden adapter's handle position)
  let tgtLabelX = targetX;
  let tgtLabelY = targetY;
  if (isVirtualPrimary && routeWpStr) {
    const wps = routeWpStr.split("|").map((s) => {
      const [x, y] = s.split(",");
      return { x: Number(x), y: Number(y) };
    });
    if (wps.length >= 1) {
      tgtLabelX = wps[wps.length - 1].x;
      tgtLabelY = wps[wps.length - 1].y;
    }
  }

  const cableIdLabels = showConnectionLabels && !hideLabel && labelText && routeStr ? (
    <>
      {makeCableIdLabel(sourceX, sourceY, srcDx, srcDy, "lbl-src")}
      {makeCableIdLabel(tgtLabelX, tgtLabelY, -tgtDx, -tgtDy, "lbl-tgt")}
    </>
  ) : null;

  // Visual-only reconnect circles + tooltip — rendered in HTML layer above cable labels.
  // Interaction is handled by RF's native SVG updater circles (pointer events pass through
  // labels since they have pointer-events: none). These HTML elements are purely decorative.
  const RECONNECT_OFFSET = 15; // matches reconnectRadius prop on <ReactFlow>
  const showReconnect = (selected || isHovered) && routeStr;
  const srcVisualX = sourceX + srcDx * RECONNECT_OFFSET;
  const srcVisualY = sourceY + srcDy * RECONNECT_OFFSET;
  const tgtVisualX = targetX - tgtDx * RECONNECT_OFFSET;
  const tgtVisualY = targetY - tgtDy * RECONNECT_OFFSET;

  const reconnectVisuals = showReconnect ? (
    <>
      <div className="reconnect-visual"
        style={{ transform: `translate(-50%, -50%) translate(${srcVisualX}px, ${srcVisualY}px)` }} />
      <div className="reconnect-visual"
        style={{ transform: `translate(-50%, -50%) translate(${tgtVisualX}px, ${tgtVisualY}px)` }} />
      {tooltipType === "source" && (
        <div className="reconnect-tooltip"
          style={{ transform: `translate(-50%, -100%) translate(${srcVisualX}px, ${srcVisualY - 10}px)` }}>
          Drag to reroute
        </div>
      )}
      {tooltipType === "target" && (
        <div className="reconnect-tooltip"
          style={{ transform: `translate(-50%, -100%) translate(${tgtVisualX}px, ${tgtVisualY - 10}px)` }}>
          Drag to reroute
        </div>
      )}
    </>
  ) : null;

  // All labels + reconnect visuals rendered via EdgeLabelRenderer (HTML layer above all SVG edges)
  const hasPortalContent = connectionLabel || cableIdLabels || reconnectVisuals;
  const edgeLabelsPortal = hasPortalContent ? (
    <EdgeLabelRenderer>
      {cableIdLabels}
      {connectionLabel}
      {reconnectVisuals}
    </EdgeLabelRenderer>
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

  // Hidden virtual edges (secondary half of adapter pair) — render nothing
  if (isHiddenVirtualEdge) {
    return null;
  }

  if (stubbed && stubPaths) {
    return (
      <>
        {gradientDef}
        <path d={stubPaths.srcPath} fill="none" style={edgeStyle} markerEnd={undefined} />
        <path d={stubPaths.tgtPath} fill="none" style={edgeStyle} markerEnd={markerEnd} />
        {renderSlash(stubPaths.srcEnd, "slash-src")}
        {renderSlash(stubPaths.tgtEnd, "slash-tgt")}
        {edgeLabelsPortal}
        {debugLabel}
      </>
    );
  }

  return (
    <>
      {gradientDef}
      <BaseEdge
        id={id}
        path={edgePath}
        labelX={lx}
        labelY={ly}
        style={edgeStyle}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />
      {edgeLabelsPortal}
      {waypointHandles}
      {debugLabel}
    </>
  );
}

export default memo(OffsetEdgeComponent);
