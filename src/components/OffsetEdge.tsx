import { memo, useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  useReactFlow,
} from "@xyflow/react";
import { useSchematicStore } from "../store";
import { LINE_STYLE_DASHARRAY, type CableIdLabelMode, type ConnectionEdge, type LineStyle } from "../types";

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
  const { screenToFlowPosition } = useReactFlow();
  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const debugShowLabels = useSchematicStore((s) => s.debugShowLabels);

  // Hover state for showing visual reconnect indicators in HTML layer
  const [isHovered, setIsHovered] = useState(false);
  // Tooltip state — tracks which updater circle the mouse is over
  const [tooltipType, setTooltipType] = useState<"source" | "target" | null>(null);
  const [manualDragPosition, setManualDragPosition] = useState<number | null>(null);
  const [isDraggingCableId, setIsDraggingCableId] = useState(false);
  const cleanupManualDragRef = useRef<(() => void) | null>(null);

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

  useEffect(() => () => {
    cleanupManualDragRef.current?.();
    cleanupManualDragRef.current = null;
  }, []);

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
  // Per-end label overrides (#114)
  const edgeSourceLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.sourceLabel as string) ?? "";
  });
  const edgeTargetLabel = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return (edge?.data?.targetLabel as string) ?? "";
  });

  // Cable ID label from pre-computed map
  const showCableIdLabels = useSchematicStore((s) => s.showCableIdLabels);
  const showCustomLabels = useSchematicStore((s) => s.showCustomLabels);
  const globalCableIdGap = useSchematicStore((s) => s.cableIdGap);
  const globalCableIdMidOffset = useSchematicStore((s) => s.cableIdMidOffset);
  const globalCableIdLabelMode = useSchematicStore((s) => s.cableIdLabelMode);
  const cableId = useSchematicStore((s) => s.cableIdMap[id] ?? "");
  const hideCableId = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.hideCableId === true || edge?.data?.hideLabel === true;
  });
  const edgeCableIdGap = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdGap as number | undefined;
  });
  const edgeCableIdMidOffset = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdMidOffset as number | undefined;
  });
  const edgeCableIdLabelMode = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdLabelMode as CableIdLabelMode | undefined;
  });
  const edgeCableIdManualPosition = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    return edge?.data?.cableIdManualPosition as number | undefined;
  });

  // Endpoint cable-ID labels are suppressed at any stub-label endpoint — the stub box
  // itself already identifies the connection there; printing the cable ID at both the
  // device port AND the stub label would yield 4 IDs per logical cable instead of 2.
  const sourceIsStub = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return false;
    return s.nodes.find((n) => n.id === edge.source)?.type === "stub-label";
  });
  const targetIsStub = useSchematicStore((s) => {
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return false;
    return s.nodes.find((n) => n.id === edge.target)?.type === "stub-label";
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

  // Show label at both source and target ends so it's visible even if the path goes behind a device
  const debugLabel = (debugEdges && debugShowLabels) ? (
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

  // Compute direction vectors at source and target from routed waypoints
  // (needed early for stub exit direction and label positioning)
  let srcDx = 0, srcDy = 0, tgtDx = 0, tgtDy = 0;
  if (routeWpStr) {
    const wps = routeWpStr.split("|").map((s) => {
      const [x, y] = s.split(",");
      return { x: Number(x), y: Number(y) };
    });
    if (wps.length >= 2) {
      const sdx = wps[1].x - wps[0].x;
      const sdy = wps[1].y - wps[0].y;
      const slen = Math.sqrt(sdx * sdx + sdy * sdy);
      if (slen > 0) { srcDx = sdx / slen; srcDy = sdy / slen; }
      const tdx = wps[wps.length - 1].x - wps[wps.length - 2].x;
      const tdy = wps[wps.length - 1].y - wps[wps.length - 2].y;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tlen > 0) { tgtDx = tdx / tlen; tgtDy = tdy / tlen; }
    }
  }

  // --- Label rendering (#5, #61, #114) ---
  const signalColor = (style?.stroke as string) ?? "#6b7280";
  const labelText = cableId;
  const cableIdGap = edgeCableIdGap ?? globalCableIdGap;
  const cableIdLabelMode = edgeCableIdLabelMode ?? globalCableIdLabelMode;
  const cidMidOff = edgeCableIdMidOffset ?? globalCableIdMidOffset;
  // Custom labels use a fixed endpoint gap (#114 rework — no longer user-tunable).
  const CUSTOM_LABEL_GAP = 4;

  // Build cumulative distances along the routed path (shared by midpoint calculations)
  let pathWps: { x: number; y: number }[] = [];
  let cumDist: number[] = [];
  let totalLen = 0;
  if (routeWpStr) {
    pathWps = routeWpStr.split("|").map((s) => {
      const [wx, wy] = s.split(",");
      return { x: Number(wx), y: Number(wy) };
    });
    if (pathWps.length >= 2) {
      cumDist = [0];
      for (let i = 1; i < pathWps.length; i++) {
        const ddx = pathWps[i].x - pathWps[i - 1].x;
        const ddy = pathWps[i].y - pathWps[i - 1].y;
        cumDist.push(cumDist[i - 1] + Math.sqrt(ddx * ddx + ddy * ddy));
      }
      totalLen = cumDist[cumDist.length - 1];
    }
  }

  // Interpolate a point + direction along the path at a given distance from the start
  const pointAtDistance = (dist: number): { x: number; y: number; dx: number; dy: number } => {
    const d = Math.max(0, Math.min(totalLen, dist));
    for (let i = 1; i < cumDist.length; i++) {
      if (cumDist[i] >= d) {
        const segLen = cumDist[i] - cumDist[i - 1];
        const t = segLen > 0 ? (d - cumDist[i - 1]) / segLen : 0;
        const sdx = pathWps[i].x - pathWps[i - 1].x;
        const sdy = pathWps[i].y - pathWps[i - 1].y;
        const len = Math.sqrt(sdx * sdx + sdy * sdy);
        return {
          x: pathWps[i - 1].x + t * sdx,
          y: pathWps[i - 1].y + t * sdy,
          dx: len > 0 ? sdx / len : 1,
          dy: len > 0 ? sdy / len : 0,
        };
      }
    }
    const last = pathWps.length > 0 ? pathWps[pathWps.length - 1] : { x: lx, y: ly };
    return { ...last, dx: 1, dy: 0 };
  };

  const pointAtNormalizedDistance = (normalizedPos: number) =>
    pointAtDistance(totalLen * Math.max(0, Math.min(1, normalizedPos)));

  const projectToPathPosition = (x: number, y: number): number | null => {
    if (pathWps.length < 2 || totalLen <= 0) return null;

    let bestDistSq = Infinity;
    let bestNormalized = 0.5;
    for (let i = 1; i < pathWps.length; i++) {
      const a = pathWps[i - 1];
      const b = pathWps[i];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const segLenSq = vx * vx + vy * vy;
      const t = segLenSq > 0
        ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / segLenSq))
        : 0;
      const px = a.x + vx * t;
      const py = a.y + vy * t;
      const distSq = (x - px) * (x - px) + (y - py) * (y - py);
      if (distSq < bestDistSq) {
        const segLen = Math.sqrt(segLenSq);
        bestDistSq = distSq;
        bestNormalized = totalLen > 0 ? (cumDist[i - 1] + segLen * t) / totalLen : 0.5;
      }
    }
    return Math.max(0, Math.min(1, bestNormalized));
  };

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

  const manualCableIdLabelStyle: React.CSSProperties = {
    ...cableIdLabelStyle,
    pointerEvents: "auto",
    cursor: isDraggingCableId ? "grabbing" : "grab",
    userSelect: "none",
    touchAction: "none",
    boxShadow: isDraggingCableId ? "0 0 0 1px rgba(59,130,246,0.35)" : undefined,
  };

  const customLabelStyle: React.CSSProperties = {
    position: "absolute",
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
  };

  // Estimate badge width from text length (for offset positioning)
  const estimateBadgeWidth = (text: string, fontSize: number, paddingH: number) =>
    text.length * fontSize * 0.58 + paddingH * 2 + 2; // +2 for border

  // Build a positioned endpoint label that follows the cable path
  const makeEndpointLabel = (
    fromSource: boolean, offset: number,
    text: string, labelStyle: React.CSSProperties, key: string,
    // Fallbacks when no routed path is available
    fallbackX: number, fallbackY: number, fallbackDx: number, fallbackDy: number,
  ) => {
    let px: number, py: number, dirDx: number, dirDy: number;
    if (totalLen > 0) {
      // Walk along the path from source or target end
      const dist = fromSource ? offset : totalLen - offset;
      const pt = pointAtDistance(dist);
      px = pt.x;
      py = pt.y;
      // Direction pointing away from the endpoint (for anchor alignment)
      dirDx = fromSource ? pt.dx : -pt.dx;
      dirDy = fromSource ? pt.dy : -pt.dy;
    } else {
      // No route yet — fall back to straight-line offset
      const isHoriz = Math.abs(fallbackDx) >= Math.abs(fallbackDy);
      px = isHoriz ? fallbackX + Math.sign(fallbackDx) * offset : fallbackX;
      py = isHoriz ? fallbackY : fallbackY + Math.sign(fallbackDy) * offset;
      dirDx = fallbackDx;
      dirDy = fallbackDy;
    }
    const isHoriz = Math.abs(dirDx) >= Math.abs(dirDy);
    const anchorX = isHoriz ? (dirDx < 0 ? "-100%" : "0%") : "-50%";
    const anchorY = isHoriz ? "-50%" : (dirDy < 0 ? "-100%" : "0%");

    return (
      <div
        key={key}
        style={{
          ...labelStyle,
          transform: `translate(${anchorX}, ${anchorY}) translate(${px}px, ${py}px)`,
        }}
      >
        {text}
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

  // Determine which labels to show
  const showCableId = showCableIdLabels && !hideCableId && labelText && routeStr;
  const showAnyCustom = !!showCustomLabels && !!routeStr;
  const effectiveCableIdMode = (edgeCableIdLabelMode ?? globalCableIdLabelMode) as CableIdLabelMode;
  const activeManualPosition = manualDragPosition ?? edgeCableIdManualPosition ?? 0.5;

  // Each custom label slot is visible iff its text is non-empty (#114 rework).
  const showSrcLabel = showAnyCustom && !!edgeSourceLabel;
  const showMidLabel = showAnyCustom && !!edgeLabel;
  const showTgtLabel = showAnyCustom && !!edgeTargetLabel;

  // Calculate custom label endpoint offset (past cable ID badge when cable ID is also at the same endpoint)
  const MIN_CABLE_ID_ENDPOINT_GAP = 10;
  const cableIdEndpointGap = Math.max(cableIdGap, MIN_CABLE_ID_ENDPOINT_GAP);
  const cableIdBadgeWidth = labelText ? estimateBadgeWidth(labelText, 9, 3) : 0;
  const customEndpointOffset = (showCableId && cableIdLabelMode === "endpoint")
    ? cableIdEndpointGap + cableIdBadgeWidth + 3 // minimum clearance + badge + 3px padding
    : CUSTOM_LABEL_GAP;

  // Compute midpoint position along the path (for cable ID midpoint and custom midpoint label)
  const cidMidPt = totalLen > 0 ? pointAtDistance(totalLen / 2 + cidMidOff) : { x: lx, y: ly };
  const cidManualPt = totalLen > 0 ? pointAtNormalizedDistance(activeManualPosition) : { x: lx, y: ly, dx: 1, dy: 0 };
  const customMidPt = totalLen > 0 ? pointAtDistance(totalLen / 2) : { x: lx, y: ly };

  const handleCableIdPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!showCableId || effectiveCableIdMode !== "manual" || totalLen <= 0) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCableId(true);

    const updateFromPointer = (clientX: number, clientY: number) => {
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      const normalized = projectToPathPosition(flowPos.x, flowPos.y);
      if (normalized != null) setManualDragPosition(normalized);
      return normalized;
    };

    updateFromPointer(e.clientX, e.clientY);

    const onPointerMove = (evt: PointerEvent) => {
      evt.preventDefault();
      updateFromPointer(evt.clientX, evt.clientY);
    };

    const onPointerUp = (evt: PointerEvent) => {
      const normalized = updateFromPointer(evt.clientX, evt.clientY);
      cleanupManualDragRef.current?.();
      cleanupManualDragRef.current = null;
      setIsDraggingCableId(false);
      setManualDragPosition(null);
      if (normalized != null) {
        useSchematicStore.getState().patchEdgeData(id, {
          cableIdLabelMode: "manual",
          cableIdManualPosition: normalized,
        });
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    cleanupManualDragRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  };

  // Cable ID labels — endpoints, midpoint, or draggable manual placement.
  const cableIdLabels = showCableId ? (
    effectiveCableIdMode === "endpoint" ? (
      <>
        {!sourceIsStub && makeEndpointLabel(true, cableIdEndpointGap, labelText, cableIdLabelStyle, "cid-src",
          sourceX, sourceY, srcDx, srcDy)}
        {!targetIsStub && makeEndpointLabel(false, cableIdEndpointGap, labelText, cableIdLabelStyle, "cid-tgt",
          tgtLabelX, tgtLabelY, -tgtDx, -tgtDy)}
      </>
    ) : effectiveCableIdMode === "manual" ? (
      <div
        key="cid-manual"
        className="nodrag nopan"
        onPointerDown={handleCableIdPointerDown}
        style={{
          ...manualCableIdLabelStyle,
          transform: `translate(-50%, -50%) translate(${cidManualPt.x}px, ${cidManualPt.y}px)`,
        }}
        title="Drag to place cable ID"
      >
        {labelText}
      </div>
    ) : (
      <div
        key="cid-mid"
        style={{
          ...cableIdLabelStyle,
          transform: `translate(-50%, -50%) translate(${cidMidPt.x}px, ${cidMidPt.y}px)`,
        }}
      >
        {labelText}
      </div>
    )
  ) : null;

  // Custom labels — three independent slots (#114 rework). Each renders if its text is set.
  const customLabels = (showSrcLabel || showMidLabel || showTgtLabel) ? (
    <>
      {showSrcLabel && makeEndpointLabel(true, customEndpointOffset, edgeSourceLabel, customLabelStyle, "clbl-src",
        sourceX, sourceY, srcDx, srcDy)}
      {showMidLabel && (
        <div
          key="clbl-mid"
          style={{
            ...customLabelStyle,
            transform: `translate(-50%, -50%) translate(${customMidPt.x}px, ${customMidPt.y}px)`,
          }}
        >
          {edgeLabel}
        </div>
      )}
      {showTgtLabel && makeEndpointLabel(false, customEndpointOffset, edgeTargetLabel, customLabelStyle, "clbl-tgt",
        tgtLabelX, tgtLabelY, -tgtDx, -tgtDy)}
    </>
  ) : null;

  // Visual-only reconnect circles + tooltip — rendered in HTML layer above cable labels.
  // Interaction is handled by RF's native SVG updater circles (pointer events pass through
  // labels since they have pointer-events: none). These HTML elements are purely decorative.
  const RECONNECT_OFFSET = 12; // matches reconnectRadius prop on <ReactFlow>
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
  const hasPortalContent = customLabels || cableIdLabels || reconnectVisuals;
  const edgeLabelsPortal = hasPortalContent ? (
    <EdgeLabelRenderer>
      {cableIdLabels}
      {customLabels}
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

  // Hidden virtual edges (secondary half of adapter pair) — render nothing
  if (isHiddenVirtualEdge) {
    return null;
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
      {debugLabel}
    </>
  );
}

export default memo(OffsetEdgeComponent);
