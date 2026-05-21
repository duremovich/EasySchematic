import { memo, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType, Port } from "../types";
import { SIGNAL_COLORS, SIGNAL_LABELS, portSide } from "../types";
import { useSchematicStore } from "../store";
import {
  resolveAuxiliaryLine,
  auxRowHeight,
  rowsInSlot,
  headerBandHeight,
  HEADER_LABEL_ZONE_PX,
  HEADER_LABEL_ZONE_2_PX,
} from "../auxiliaryData";
import type { AuxRow } from "../types";
import { useDisplayLabel } from "../labelCaseUtils";
import { resolveDeviceLabel } from "../displayName";
import {
  EXTERNAL_ENDPOINT_HEIGHT,
  EXTERNAL_ENDPOINT_MAX_WIDTH,
  EXTERNAL_ENDPOINT_MIN_WIDTH,
  isExternalEndpointData,
} from "../externalEndpoint";

type ColumnItem =
  | { type: "port"; port: Port }
  | { type: "section"; name: string };

const DEVICE_NODE_WIDTH = 180;

/** Build a list of ports interleaved with section headers where section changes. */
function buildColumnItems(ports: Port[]): ColumnItem[] {
  const items: ColumnItem[] = [];
  let lastSection: string | undefined;
  for (const port of ports) {
    if (port.section && port.section !== lastSection) {
      items.push({ type: "section", name: port.section });
    }
    items.push({ type: "port", port });
    lastSection = port.section;
  }
  return items;
}

function DeviceNodeComponent({ id, data, selected }: NodeProps<DeviceNodeType>) {
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const displayLabel = useDisplayLabel();
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const resolvedLabel = useMemo(
    () => resolveDeviceLabel(data, { useShortNames, wrapDeviceLabels }),
    [data, useShortNames, wrapDeviceLabels],
  );
  const labelZone = resolvedLabel.wrap ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  const hiddenPinSignalTypesStr = useSchematicStore((s) => s.hiddenPinSignalTypes);
  const isHiddenAdapter = useSchematicStore((s) => s.hiddenAdapterNodeIds.has(id));
  const isOverlapping = useSchematicStore((s) => s.overlapNodeId === id);

  const hiddenPinSignalTypes = useMemo(
    () => (hiddenPinSignalTypesStr ? new Set(hiddenPinSignalTypesStr.split(",")) : null),
    [hiddenPinSignalTypesStr],
  );

  const hideUnconnectedPorts = useSchematicStore((s) => s.hideUnconnectedPorts);
  const showPortCounts = useSchematicStore((s) => s.showPortCounts);
  const currency = useSchematicStore((s) => s.currency);
  const templateHiddenStr = useSchematicStore((s) => {
    if (!data.templateId) return "";
    const arr = s.templateHiddenSignals[data.templateId];
    return arr ? arr.sort().join(",") : "";
  });

  const connectedHandleStr = useSchematicStore((s) => {
    const ids: string[] = [];
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) ids.push(e.sourceHandle);
      if (e.target === id && e.targetHandle) ids.push(e.targetHandle);
    }
    return ids.sort().join(",");
  });
  const connectedHandles = useMemo(
    () => new Set(connectedHandleStr ? connectedHandleStr.split(",") : []),
    [connectedHandleStr],
  );

  // Reactive signal-type map for edges connected to this node — drives passthrough port
  // color/label when the port inherits its signal type from the connected edge. Serialized
  // as "handleId:signalType" pairs so Zustand's shallow equality catches signal-type edits.
  const connectedEdgeSignalsStr = useSchematicStore((s) => {
    const parts: string[] = [];
    for (const e of s.edges) {
      if (!e.data?.signalType) continue;
      if (e.source === id && e.sourceHandle) parts.push(`${e.sourceHandle}:${e.data.signalType}`);
      if (e.target === id && e.targetHandle) parts.push(`${e.targetHandle}:${e.data.signalType}`);
    }
    return parts.sort().join(",");
  });
  const signalByHandle = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    if (!connectedEdgeSignalsStr) return m;
    for (const pair of connectedEdgeSignalsStr.split(",")) {
      const colon = pair.lastIndexOf(":");
      if (colon > 0) m.set(pair.slice(0, colon), pair.slice(colon + 1));
    }
    return m;
  }, [connectedEdgeSignalsStr]);

  const visiblePorts = useMemo(() => {
    if (data.showAllPorts) {
      return hiddenPinSignalTypes
        ? data.ports.filter((p) => !hiddenPinSignalTypes.has(p.signalType))
        : data.ports;
    }

    const tplHidden = templateHiddenStr ? new Set(templateHiddenStr.split(",")) : null;
    const devHiddenPorts = data.hiddenPorts?.length ? new Set(data.hiddenPorts) : null;

    return data.ports.filter((p) => {
      if (hiddenPinSignalTypes?.has(p.signalType)) return false;
      if (tplHidden?.has(p.signalType)) return false;
      if (devHiddenPorts?.has(p.id)) return false;
      if (hideUnconnectedPorts) {
        const connected = p.direction === "bidirectional"
          ? connectedHandles.has(`${p.id}-in`) || connectedHandles.has(`${p.id}-out`)
          : p.direction === "passthrough"
          ? connectedHandles.has(`${p.id}-rear`) || connectedHandles.has(`${p.id}-front`)
          : connectedHandles.has(p.id);
        if (!connected) return false;
      }
      return true;
    });
  }, [data.ports, data.showAllPorts, data.hiddenPorts,
      hiddenPinSignalTypes, templateHiddenStr, hideUnconnectedPorts, connectedHandles]);

  const headerAuxRows = useMemo(
    () => rowsInSlot(data.auxiliaryData, "header"),
    [data.auxiliaryData],
  );
  const footerAuxRows = useMemo(
    () => rowsInSlot(data.auxiliaryData, "footer"),
    [data.auxiliaryData],
  );

  const portCountInfo = useMemo(() => {
    if (!showPortCounts) return null;
    const total = data.ports.length;
    if (total === 0) return null;
    let connected = 0;
    for (const p of data.ports) {
      if (p.direction === "bidirectional") {
        if (connectedHandles.has(`${p.id}-in`) || connectedHandles.has(`${p.id}-out`)) connected++;
      } else if (p.direction === "passthrough") {
        if (connectedHandles.has(`${p.id}-rear`) || connectedHandles.has(`${p.id}-front`)) connected++;
      } else {
        if (connectedHandles.has(p.id)) connected++;
      }
    }
    return { connected, total };
  }, [showPortCounts, data.ports, connectedHandles]);

  const openPortMenu = useCallback((e: React.MouseEvent, port: Port) => {
    e.preventDefault();
    e.stopPropagation();
    useSchematicStore.setState({
      portContextMenu: { nodeId: id, portId: port.id, screenX: e.clientX, screenY: e.clientY },
    });
  }, [id]);


  // Split ports by visual side (respects flip), not semantic direction.
  // When hideUnconnectedPorts is on, bidir ports with only one side connected
  // collapse into the appropriate column so the device gets smaller.
  // Passthrough ports go into their own list — they render as full-width rows with
  // two handles (rear-left, front-right), similar to bidirectional but spanning both sides.
  const { leftPorts, rightPorts, bidirectional, passthroughPorts, collapsedBidir } = useMemo(() => {
    const collapsedBidir = new Map<string, "in" | "out">();
    const leftPorts: Port[] = [];
    const rightPorts: Port[] = [];
    const bidirectional: Port[] = [];
    const passthroughPorts: Port[] = [];
    for (const p of visiblePorts) {
      if (p.direction === "passthrough") {
        passthroughPorts.push(p);
      } else if (p.direction === "bidirectional") {
        if (hideUnconnectedPorts) {
          const inConn = connectedHandles.has(`${p.id}-in`);
          const outConn = connectedHandles.has(`${p.id}-out`);
          if (inConn && !outConn) {
            (p.flipped ? rightPorts : leftPorts).push(p);
            collapsedBidir.set(p.id, "in");
            continue;
          }
          if (outConn && !inConn) {
            (p.flipped ? leftPorts : rightPorts).push(p);
            collapsedBidir.set(p.id, "out");
            continue;
          }
        }
        bidirectional.push(p);
      } else if (portSide(p) === "left") {
        leftPorts.push(p);
      } else {
        rightPorts.push(p);
      }
    }
    return { leftPorts, rightPorts, bidirectional, passthroughPorts, collapsedBidir };
  }, [visiblePorts, hideUnconnectedPorts, connectedHandles]);

  /** Get handle ID and type for a port in a column, accounting for collapsed bidir ports.
   *  All bidirectional handles use type="source" so React Flow always includes them in
   *  handleBounds.source — its getEdgePosition only searches source bounds for sourceHandle,
   *  even in ConnectionMode.Loose. Our isValidConnection handles real direction checks. */
  const handleProps = (port: Port, _side: "left" | "right") => {
    const connSide = collapsedBidir.get(port.id);
    if (connSide) {
      return connSide === "in"
        ? { handleId: `${port.id}-in`, handleType: "source" as const }
        : { handleId: `${port.id}-out`, handleType: "source" as const };
    }
    return {
      handleId: port.id,
      handleType: (port.direction === "input" ? "target" : "source") as "target" | "source",
    };
  };

  const isSpeaker = data.deviceType === "speaker";
  const isPatchPanel = data.deviceType === "patch-panel";
  const contentInsetPx = isSpeaker ? 30 : 12;
  const dividerInsetPx = isSpeaker ? 26 : 0;

  const leftItems = useMemo(() => {
    const items = buildColumnItems(leftPorts);
    if (isPatchPanel && leftPorts.length > 0) {
      return [{ type: "section" as const, name: "Rear" }, ...items];
    }
    return items;
  }, [leftPorts, isPatchPanel]);
  const rightItems = useMemo(() => {
    const items = buildColumnItems(rightPorts);
    if (isPatchPanel && rightPorts.length > 0) {
      return [{ type: "section" as const, name: "Front" }, ...items];
    }
    return items;
  }, [rightPorts, isPatchPanel]);

  const hasSections = leftItems.some((i) => i.type === "section") ||
    rightItems.some((i) => i.type === "section");

  // Build bidirectional items with section support
  const bidirItems = useMemo(() => buildColumnItems(bidirectional), [bidirectional]);

  // Build passthrough items. On patch panels, prepend Rear/Front column headers in the
  // passthrough row header so the label row shows "Rear ← label → Front".
  const passthroughItems = useMemo(
    () => buildColumnItems(passthroughPorts),
    [passthroughPorts],
  );

  /** Render a port row for a column (left or right). */
  const renderColumnPort = (port: Port, side: "left" | "right") => {
    const h = handleProps(port, side);
    const isLeft = side === "left";
    return (
      <div
        key={port.id}
        className={`flex items-center gap-1 ${isLeft ? "" : "justify-end"} h-5 relative`}
        style={isLeft ? { paddingLeft: contentInsetPx } : { paddingRight: contentInsetPx }}
        onContextMenu={(e) => openPortMenu(e, port)}
      >
        {isLeft && (
          <Handle
            type={h.handleType}
            position={Position.Left}
            id={h.handleId}
            data-connected={connectedHandles.has(h.handleId) || undefined}
            data-multi-connect={port.multiConnect || undefined}
            className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
            style={{ background: SIGNAL_COLORS[port.signalType], top: "50%" }}
          />
        )}
        <span
          className="text-[10px] leading-5 truncate"
          style={{ color: SIGNAL_COLORS[port.signalType] }}
          title={`${displayLabel(port.label)} (${SIGNAL_LABELS[port.signalType]})`}
        >
          {displayLabel(port.label)}
        </span>
        {!isLeft && (
          <Handle
            type={h.handleType}
            position={Position.Right}
            id={h.handleId}
            data-connected={connectedHandles.has(h.handleId) || undefined}
            data-multi-connect={port.multiConnect || undefined}
            className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
            style={{ background: SIGNAL_COLORS[port.signalType], top: "50%" }}
          />
        )}
      </div>
    );
  };

  /** Render a passthrough port as a full-width row with rear (left) and front (right) handles. */
  const renderPassthroughPort = (port: Port) => {
    const rearId = `${port.id}-rear`;
    const frontId = `${port.id}-front`;
    const rearConnected = connectedHandles.has(rearId);
    const frontConnected = connectedHandles.has(frontId);
    // For inheriting ports, pick up the connected edge's signal type reactively from
    // signalByHandle (derived from connectedEdgeSignalsStr selector). Prefer rear side;
    // fall back to front, then to the port's stored placeholder.
    const resolvedSignal: string = port.inheritsSignal
      ? (signalByHandle.get(rearId) ?? signalByHandle.get(frontId) ?? port.signalType)
      : port.signalType;
    const signalColor = SIGNAL_COLORS[resolvedSignal as keyof typeof SIGNAL_COLORS] ?? SIGNAL_COLORS.custom;
    const signalLabel = SIGNAL_LABELS[resolvedSignal as keyof typeof SIGNAL_LABELS] ?? resolvedSignal;
    return (
      <div
        key={port.id}
        className="flex justify-between items-center relative h-5"
        onContextMenu={(e) => openPortMenu(e, port)}
      >
        {/* Rear handle — left edge, source (ConnectionMode.Loose; isValidConnection enforces direction) */}
        <Handle
          type="source"
          position={Position.Left}
          id={rearId}
          data-connected={rearConnected || undefined}
          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
          style={{ background: signalColor, top: "50%" }}
        />
        <span
          className="text-[10px] leading-5 truncate px-3 flex-1 text-center"
          style={{ color: signalColor, paddingLeft: contentInsetPx, paddingRight: contentInsetPx }}
          title={`${displayLabel(port.label)} (${signalLabel}) — passthrough`}
        >
          ⇔ {displayLabel(port.label)}
        </span>
        {/* Front handle — right edge, source (same reasoning as rear) */}
        <Handle
          type="source"
          position={Position.Right}
          id={frontId}
          data-connected={frontConnected || undefined}
          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
          style={{ background: signalColor, top: "50%" }}
        />
      </div>
    );
  };

  if (isExternalEndpointData(data) && data.ports.length === 1) {
    const port = data.ports[0];
    const endpointText = data.label.trim() || data.model || "External Endpoint";
    const endpointFill = data.color ?? "#ffffff";
    const endpointTextColor = data.textColor ?? "#374151";
    if (!port) {
      return (
        <div
          onDoubleClick={() => setEditingNodeId(id)}
          className="relative inline-flex items-center border bg-white"
          style={{
            boxSizing: "border-box",
            width: "max-content",
            minWidth: EXTERNAL_ENDPOINT_MIN_WIDTH,
            maxWidth: EXTERNAL_ENDPOINT_MAX_WIDTH,
            height: EXTERNAL_ENDPOINT_HEIGHT,
            padding: "0 4px",
            backgroundColor: endpointFill,
            borderRadius: 2,
            borderColor: isOverlapping ? "#f87171" : selected ? "#1a73e8" : "#9ca3af",
          }}
        >
          <span
            className="block truncate text-[9px] font-medium leading-none text-center whitespace-nowrap"
            style={{ color: endpointTextColor, fontFamily: "'Inter', system-ui, sans-serif" }}
            title={endpointText}
          >
            {endpointText}
          </span>
        </div>
      );
    }
    const direction = port?.direction ?? "bidirectional";
    const signalType = port?.signalType ?? "custom";
    const signalLabel = SIGNAL_LABELS[signalType] ?? signalType;
    const signalColor = SIGNAL_COLORS[signalType] ?? SIGNAL_COLORS.custom;
    const showLeft = direction === "input" || direction === "bidirectional" || direction === "passthrough";
    const showRight = direction === "output" || direction === "bidirectional" || direction === "passthrough";
    const leftHandleId =
      direction === "bidirectional" ? `${port.id}-in`
      : direction === "passthrough" ? `${port.id}-rear`
      : port?.id;
    const rightHandleId =
      direction === "bidirectional" ? `${port.id}-out`
      : direction === "passthrough" ? `${port.id}-front`
      : port?.id;
    const labelPrefix =
      direction === "input" ? "← "
      : direction === "output" ? "→ "
      : direction === "passthrough" ? "⇔ "
      : "↔ ";

    return (
      <div
        onDoubleClick={() => setEditingNodeId(id)}
        className="relative inline-flex items-center border bg-white"
        style={{
          boxSizing: "border-box",
          width: "max-content",
          minWidth: EXTERNAL_ENDPOINT_MIN_WIDTH,
          maxWidth: EXTERNAL_ENDPOINT_MAX_WIDTH,
          height: EXTERNAL_ENDPOINT_HEIGHT,
          paddingLeft: 4,
          paddingRight: 4,
          backgroundColor: endpointFill,
          borderRadius: 2,
          borderColor: isOverlapping ? "#f87171" : selected ? "#1a73e8" : signalColor,
          boxShadow: isOverlapping
            ? "0 0 0 1px rgba(248, 113, 113, 0.35)"
            : selected
            ? "0 0 0 1px rgba(26, 115, 232, 0.3)"
            : undefined,
        }}
      >
        {showLeft && leftHandleId && (
          <Handle
            type={direction === "input" || direction === "bidirectional" ? "target" : "source"}
            position={Position.Left}
            id={leftHandleId}
            data-connected={connectedHandles.has(leftHandleId) || undefined}
            data-multi-connect={port?.multiConnect || undefined}
            className="!w-2 !h-2 !border !border-white !-left-1"
            style={{ background: signalColor, top: "50%" }}
          />
        )}
        <span
          className="block truncate text-[9px] font-medium leading-none text-center whitespace-nowrap"
          style={{ color: endpointTextColor, fontFamily: "'Inter', system-ui, sans-serif" }}
          title={`${endpointText} (${signalLabel})`}
        >
          {labelPrefix}{endpointText}
        </span>
        {showRight && rightHandleId && (
          <Handle
            type="source"
            position={Position.Right}
            id={rightHandleId}
            data-connected={connectedHandles.has(rightHandleId) || undefined}
            data-multi-connect={port?.multiConnect || undefined}
            className="!w-2 !h-2 !border !border-white !-right-1"
            style={{ background: signalColor, top: "50%" }}
          />
        )}
      </div>
    );
  }

  if (isHiddenAdapter) {
    // Render 1x1 invisible placeholder — keeps React Flow handle refs valid but
    // doesn't block device placement (RF re-measures this as ~1px)
    return (
      <div style={{ width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        {data.ports.map((p) => {
          if (p.direction === "bidirectional") {
            return (
              <span key={p.id}>
                <Handle type="target" position={Position.Left} id={`${p.id}-in`} style={{ opacity: 0 }} />
                <Handle type="source" position={Position.Right} id={`${p.id}-out`} style={{ opacity: 0 }} />
              </span>
            );
          }
          if (p.direction === "passthrough") {
            return (
              <span key={p.id}>
                <Handle type="source" position={Position.Left} id={`${p.id}-rear`} style={{ opacity: 0 }} />
                <Handle type="source" position={Position.Right} id={`${p.id}-front`} style={{ opacity: 0 }} />
              </span>
            );
          }
          const side = portSide(p);
          return (
            <Handle
              key={p.id}
              type={p.direction === "input" ? "target" : "source"}
              position={side === "left" ? Position.Left : Position.Right}
              id={p.id}
              style={{ opacity: 0 }}
            />
          );
        })}
      </div>
    );
  }

  /** Footer aux block — rows below the port area. Grid-rounded (20-multiple) so device
   *  bottom stays on the snap grid. Blank rows render as 6-px separator gaps. */
  function renderFooterAuxBlock(rows: AuxRow[]) {
    if (rows.length === 0) return null;
    const raw = 1 + rows.reduce((sum, r) => sum + auxRowHeight(r), 0);
    const totalPad = Math.ceil(raw / 20) * 20 - raw;
    const pt = Math.floor(totalPad / 2);
    const pb = totalPad - pt;
    return (
      <div
        className={`auxiliaryData border-t border-[var(--color-border)] ${isSpeaker ? "" : "px-3"}`}
        style={{
          paddingTop: pt,
          paddingBottom: pb,
          paddingLeft: contentInsetPx,
          paddingRight: contentInsetPx,
          marginLeft: dividerInsetPx,
          marginRight: dividerInsetPx,
        }}
      >
        {rows.map((row, i) => renderAuxRow(row, i))}
      </div>
    );
  }

  /** Individual aux row markup shared between header band and footer block. */
  function renderAuxRow(row: AuxRow, key: number) {
    if (!row.text.trim()) {
      return <div key={key} aria-hidden style={{ height: 6 }} />;
    }
    const resolved = displayLabel(resolveAuxiliaryLine(row.text, data, { connectedCount: portCountInfo?.connected, currency }));
    return (
      <div
        key={key}
        className="text-[9px] text-[var(--color-text-muted)] leading-3 truncate whitespace-nowrap text-center"
        title={resolved}
      >
        {resolved}
      </div>
    );
  }

  /** Header band — label zone + header aux rows, centered together in a 20-multiple band.
   *  Replaces the old separate 40-px name strip + header aux block: eliminates the ~14-px
   *  wasted whitespace between the label and the first aux row.
   *
   *  Keep the band-height formula in sync with `headerBandHeight()` in auxiliaryData.ts —
   *  snapUtils uses it to estimate device height before React Flow measures it. */
  function renderHeaderBand(rows: AuxRow[]) {
    const bandH = headerBandHeight(data.auxiliaryData, labelZone);
    const content = labelZone + rows.reduce((sum, r) => sum + auxRowHeight(r), 0);
    const totalPad = bandH - content;
    const pt = Math.floor(totalPad / 2);
    const pb = totalPad - pt;
    const labelStyle = resolvedLabel.wrap
      ? {
          display: "-webkit-box" as const,
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden" as const,
          wordBreak: "break-word" as const,
          textAlign: "center" as const,
          lineHeight: "14px",
        }
      : undefined;
    const bandContent = (
      <>
        <div
          className="flex items-center justify-center"
          style={{ height: labelZone }}
        >
          <span
            className={
              resolvedLabel.wrap
                ? "text-xs font-semibold text-[var(--color-text-heading)]"
                : "text-xs font-semibold text-[var(--color-text-heading)] truncate leading-tight"
            }
            style={labelStyle}
            title={displayLabel(resolvedLabel.text)}
          >
            {displayLabel(resolvedLabel.text)}
          </span>
        </div>
        {rows.map((row, i) => renderAuxRow(row, i))}
      </>
    );

    if (isSpeaker) {
      return (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            top: 12,
            left: 74,
            right: 28,
          }}
        >
          <div
            className="truncate text-center text-[11px] font-semibold leading-tight"
            style={{ color: "#111827", fontFamily: "'Inter', system-ui, sans-serif" }}
            title={displayLabel(resolvedLabel.text)}
          >
            {displayLabel(resolvedLabel.text)}
          </div>
          {rows.length > 0 && (
            <div className="mt-0.5 space-y-0.5">
              {rows.map((row, i) => renderAuxRow(row, i))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className="px-3 border-b border-[var(--color-border)] rounded-t-lg flex flex-col"
        style={{
          backgroundColor: data.headerColor || "var(--color-surface)",
          paddingTop: pt,
          paddingBottom: pb,
        }}
      >
        {bandContent}
      </div>
    );
  }

  function renderSpeakerShell() {
    const lineColor = isOverlapping
      ? "#f87171"
      : selected
      ? "#1a73e8"
      : "#111827";
    return (
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full pointer-events-none"
        viewBox={`0 0 ${DEVICE_NODE_WIDTH} 100`}
        preserveAspectRatio="none"
      >
        <path
          d="M42 24 H80 L156 6 V94 L80 76 H42 Z"
          fill="white"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <line
          x1="4"
          y1="36"
          x2="42"
          y2="36"
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="4"
          y1="64"
          x2="42"
          y2="64"
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <div
      onDoubleClick={() => setEditingNodeId(id)}
      className={`
        relative
        ${isSpeaker ? "" : "rounded-lg border bg-white"}
        ${isSpeaker ? "" : (isOverlapping ? "border-red-400 shadow-lg shadow-red-400/30" : selected ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-[var(--color-border)]")}
      `}
      style={{ width: DEVICE_NODE_WIDTH }}
    >
      {isSpeaker && renderSpeakerShell()}
      {/* Header band — merged name strip + header aux rows. Height is always a 20-multiple
           (min 40) so the first port below stays on the pathfinding grid. */}
      {renderHeaderBand(headerAuxRows)}

      {/* Port area — 8px top padding lands handle centers on the 20px grid:
           1px (outer top border) + headerBand(20-mult) + 1px (header border-b)
           + 8px (pt) + 10px (half row) ≡ 0 mod 20.
           The header's `border-b` adds 1px between the band and the port column,
           which the `pt` value (8 not 9) compensates for. */}
      <div className={isSpeaker ? "relative z-10 pt-[48px] pb-[18px]" : "pt-[8px] pb-[9px]"}>
      {/* Input/Output Ports — two independent columns */}
      {(leftPorts.length > 0 || rightPorts.length > 0) && (
        hasSections ? (
          /* Sectioned layout: independent columns */
          <div className="flex">
            {/* Left column */}
            <div className="flex-1 min-w-0">
              {leftItems.map((item, i) =>
                item.type === "section" ? (
                  <div
                    key={`lsec-${i}`}
                    className="h-5 flex items-end"
                    style={{ paddingLeft: contentInsetPx }}
                  >
                    <span className="text-[9px] text-[var(--color-text-muted)] truncate border-b border-[var(--color-border)]/30 w-full pb-0.5 mr-1">
                      {item.name}
                    </span>
                  </div>
                ) : renderColumnPort(item.port, "left"),
              )}
            </div>

            {/* Right column */}
            <div className="flex-1 min-w-0">
              {rightItems.map((item, i) =>
                item.type === "section" ? (
                  <div
                    key={`rsec-${i}`}
                    className="h-5 flex items-end"
                    style={{ paddingRight: contentInsetPx }}
                  >
                    <span className="text-[9px] text-[var(--color-text-muted)] truncate text-right border-b border-[var(--color-border)]/30 w-full pb-0.5 ml-1">
                      {item.name}
                    </span>
                  </div>
                ) : renderColumnPort(item.port, "right"),
              )}
            </div>
          </div>
        ) : (
          /* Non-sectioned layout: paired rows */
          <div>
            {Array.from({ length: Math.max(leftPorts.length, rightPorts.length, 1) }, (_, i) => {
              const left = leftPorts[i];
              const right = rightPorts[i];
              const lh = left ? handleProps(left, "left") : null;
              const rh = right ? handleProps(right, "right") : null;
              return (
                <div key={i} className="flex justify-between items-center relative h-5">
                  <div
                    className="flex items-center gap-1 min-w-0 flex-1"
                    style={{ paddingLeft: contentInsetPx }}
                    onContextMenu={left ? (e) => openPortMenu(e, left) : undefined}
                  >
                    {left && lh && (
                      <>
                        <Handle
                          type={lh.handleType}
                          position={Position.Left}
                          id={lh.handleId}
                          data-connected={connectedHandles.has(lh.handleId) || undefined}
                          data-multi-connect={left.multiConnect || undefined}
                          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                          style={{ background: SIGNAL_COLORS[left.signalType], top: "50%" }}
                        />
                        <span
                          className="text-[10px] leading-5 truncate"
                          style={{ color: SIGNAL_COLORS[left.signalType] }}
                          title={`${displayLabel(left.label)} (${SIGNAL_LABELS[left.signalType]})`}
                        >
                          {displayLabel(left.label)}
                        </span>
                      </>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-1 min-w-0 flex-1 justify-end"
                    style={{ paddingRight: contentInsetPx }}
                    onContextMenu={right ? (e) => openPortMenu(e, right) : undefined}
                  >
                    {right && rh && (
                      <>
                        <span
                          className="text-[10px] leading-5 truncate"
                          style={{ color: SIGNAL_COLORS[right.signalType] }}
                          title={`${displayLabel(right.label)} (${SIGNAL_LABELS[right.signalType]})`}
                        >
                          {displayLabel(right.label)}
                        </span>
                        <Handle
                          type={rh.handleType}
                          position={Position.Right}
                          id={rh.handleId}
                          data-connected={connectedHandles.has(rh.handleId) || undefined}
                          data-multi-connect={right.multiConnect || undefined}
                          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
                          style={{ background: SIGNAL_COLORS[right.signalType], top: "50%" }}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Empty Expansion Slots — hidden when slot.hideWhenEmpty (storage media etc.) */}
      {data.slots?.some((s) => !s.cardTemplateId && !s.hideWhenEmpty) && (
        <div>
          {data.slots.filter((s) => !s.cardTemplateId && !s.hideWhenEmpty).map((slot) => (
            <div
              key={slot.slotId}
              className="flex justify-center items-center h-5"
              style={{ marginLeft: contentInsetPx, marginRight: contentInsetPx }}
            >
              <span className="text-[9px] text-[var(--color-text-muted)] opacity-40 truncate text-center italic">
                {displayLabel(slot.label)} (empty)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Passthrough Ports — one row per circuit, rear handle left, front handle right */}
      {passthroughPorts.length > 0 && (
        <div>
          <div className="flex h-5">
            <div className="flex-1 flex items-end" style={{ paddingLeft: contentInsetPx }}>
              <span className="text-[9px] text-[var(--color-text-muted)] truncate border-b border-[var(--color-border)]/30 w-full pb-0.5 mr-1">
                Rear
              </span>
            </div>
            <div className="flex-1 flex items-end justify-end" style={{ paddingRight: contentInsetPx }}>
              <span className="text-[9px] text-[var(--color-text-muted)] truncate text-right border-b border-[var(--color-border)]/30 w-full pb-0.5 ml-1">
                Front
              </span>
            </div>
          </div>
          {passthroughItems.map((item, i) =>
            item.type === "section" ? (
              <div
                key={`psec-${i}`}
                className="flex justify-center items-end h-5"
                style={{ marginLeft: contentInsetPx, marginRight: contentInsetPx }}
              >
                <span className="text-[9px] text-[var(--color-text-muted)] pb-0.5 truncate border-b border-[var(--color-border)]/30 w-full text-center">
                  {item.name}
                </span>
              </div>
            ) : renderPassthroughPort(item.port),
          )}
        </div>
      )}

      {/* Bidirectional Ports */}
      {bidirectional.length > 0 && (
        <div>
          {bidirItems.map((item, i) => {
            if (item.type === "section") {
              return (
                <div
                  key={`bsec-${i}`}
                  className="flex justify-center items-end h-5"
                  style={{ marginLeft: contentInsetPx, marginRight: contentInsetPx }}
                >
                  <span className="text-[9px] text-[var(--color-text-muted)] pb-0.5 truncate border-b border-[var(--color-border)]/30 w-full text-center">
                    {item.name}
                  </span>
                </div>
              );
            }

            const port = item.port;
            const inId = `${port.id}-in`;
            const outId = `${port.id}-out`;
            const inConnected = connectedHandles.has(inId);
            const outConnected = connectedHandles.has(outId);
            const inDisabled = outConnected;
            const outDisabled = inConnected;

            return (
              <div key={port.id} className="flex justify-center items-center relative h-5">
                <Handle
                  type="source"
                  position={Position.Left}
                  id={inId}
                  data-connected={connectedHandles.has(inId) || undefined}
                  data-multi-connect={port.multiConnect || undefined}
                  className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                  style={{
                    background: inDisabled ? "#d1d5db" : SIGNAL_COLORS[port.signalType],
                    opacity: inDisabled ? 0.4 : 1,
                    top: "50%",
                  }}
                />
                <span
                  className="text-[10px] leading-5 truncate"
                  style={{ color: SIGNAL_COLORS[port.signalType] }}
                  title={`${displayLabel(port.label)} (${SIGNAL_LABELS[port.signalType]}) — bidirectional`}
                >
                  ↔ {displayLabel(port.label)}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={outId}
                  data-connected={connectedHandles.has(outId) || undefined}
                  data-multi-connect={port.multiConnect || undefined}
                  className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
                  style={{
                    background: outDisabled ? "#d1d5db" : SIGNAL_COLORS[port.signalType],
                    opacity: outDisabled ? 0.4 : 1,
                    top: "50%",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {portCountInfo && (
        <div className="text-center h-5 flex items-center justify-center">
          <span className="text-[9px] text-[var(--color-text-muted)]">
            {portCountInfo.connected} / {portCountInfo.total} IOs connected
          </span>
        </div>
      )}
      {renderFooterAuxBlock(footerAuxRows)}
      </div>
    </div>
  );
}

export default memo(DeviceNodeComponent);
