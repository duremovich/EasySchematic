import { memo, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType, Port } from "../types";
import { SIGNAL_COLORS, SIGNAL_LABELS, portSide } from "../types";
import { useSchematicStore } from "../store";

type ColumnItem =
  | { type: "port"; port: Port }
  | { type: "section"; name: string };

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
  const hiddenPinSignalTypesStr = useSchematicStore((s) => s.hiddenPinSignalTypes);
  const hideDeviceTypes = useSchematicStore((s) => s.hideDeviceTypes);
  const isHiddenAdapter = useSchematicStore((s) => s.hiddenAdapterNodeIds.has(id));
  const isOverlapping = useSchematicStore((s) => s.overlapNodeId === id);

  const hiddenPinSignalTypes = useMemo(
    () => (hiddenPinSignalTypesStr ? new Set(hiddenPinSignalTypesStr.split(",")) : null),
    [hiddenPinSignalTypesStr],
  );

  const hideUnconnectedPorts = useSchematicStore((s) => s.hideUnconnectedPorts);
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
          : connectedHandles.has(p.id);
        if (!connected) return false;
      }
      return true;
    });
  }, [data.ports, data.showAllPorts, data.hiddenPorts,
      hiddenPinSignalTypes, templateHiddenStr, hideUnconnectedPorts, connectedHandles]);

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
  const { leftPorts, rightPorts, bidirectional, collapsedBidir } = useMemo(() => {
    const collapsedBidir = new Map<string, "in" | "out">();
    const leftPorts: Port[] = [];
    const rightPorts: Port[] = [];
    const bidirectional: Port[] = [];
    for (const p of visiblePorts) {
      if (p.direction === "bidirectional") {
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
    return { leftPorts, rightPorts, bidirectional, collapsedBidir };
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

  const leftItems = useMemo(() => buildColumnItems(leftPorts), [leftPorts]);
  const rightItems = useMemo(() => buildColumnItems(rightPorts), [rightPorts]);

  const hasSections = leftItems.some((i) => i.type === "section") ||
    rightItems.some((i) => i.type === "section");

  // Build bidirectional items with section support
  const bidirItems = useMemo(() => buildColumnItems(bidirectional), [bidirectional]);

  /** Render a port row for a column (left or right). */
  const renderColumnPort = (port: Port, side: "left" | "right") => {
    const h = handleProps(port, side);
    const isLeft = side === "left";
    return (
      <div
        key={port.id}
        className={`flex items-center gap-1 ${isLeft ? "pl-3" : "pr-3 justify-end"} h-5 relative`}
        onContextMenu={(e) => openPortMenu(e, port)}
      >
        {isLeft && (
          <Handle
            type={h.handleType}
            position={Position.Left}
            id={h.handleId}
            data-connected={connectedHandles.has(h.handleId) || undefined}
            className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
            style={{ background: SIGNAL_COLORS[port.signalType], top: "50%" }}
          />
        )}
        <span
          className="text-[10px] leading-5 truncate"
          style={{ color: SIGNAL_COLORS[port.signalType] }}
          title={`${port.label} (${SIGNAL_LABELS[port.signalType]})`}
        >
          {port.label}
        </span>
        {!isLeft && (
          <Handle
            type={h.handleType}
            position={Position.Right}
            id={h.handleId}
            data-connected={connectedHandles.has(h.handleId) || undefined}
            className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
            style={{ background: SIGNAL_COLORS[port.signalType], top: "50%" }}
          />
        )}
      </div>
    );
  };

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

  return (
    <div
      onDoubleClick={() => setEditingNodeId(id)}
      className={`
        relative rounded-lg border bg-white
        ${isOverlapping ? "border-red-400 shadow-lg shadow-red-400/30" : selected ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-[var(--color-border)]"}
      `}
      style={{ width: 180 }}
    >
      {/* Header */}
      <div
        className="px-3 h-10 flex flex-col justify-center border-b border-[var(--color-border)] rounded-t-lg"
        style={{ backgroundColor: data.headerColor || "var(--color-surface)" }}
      >
        <div className="text-xs font-semibold text-[var(--color-text-heading)] truncate leading-tight">
          {data.label}
        </div>
        {!hideDeviceTypes && (
          <div className="text-[10px] text-[var(--color-text-muted)] capitalize leading-tight">
            {data.deviceType.replace(/-/g, " ")}
          </div>
        )}
      </div>

      {/* Port area — 9px top padding aligns handle centers to the 20px grid.
           Math: 1px (border) + 40px (header) + 9px (pad) + 10px (half row) = 60px ≡ 0 mod 20
           9px bottom padding makes total height a multiple of 20 (60 + rows×20). */}
      <div className="pt-[9px] pb-[9px]">
      {/* Input/Output Ports — two independent columns */}
      {(leftPorts.length > 0 || rightPorts.length > 0) && (
        hasSections ? (
          /* Sectioned layout: independent columns */
          <div className="flex">
            {/* Left column */}
            <div className="flex-1 min-w-0">
              {leftItems.map((item, i) =>
                item.type === "section" ? (
                  <div key={`lsec-${i}`} className="h-5 flex items-end pl-2">
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
                  <div key={`rsec-${i}`} className="h-5 flex items-end pr-2">
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
                  <div className="flex items-center gap-1 pl-3 min-w-0 flex-1" onContextMenu={left ? (e) => openPortMenu(e, left) : undefined}>
                    {left && lh && (
                      <>
                        <Handle
                          type={lh.handleType}
                          position={Position.Left}
                          id={lh.handleId}
                          data-connected={connectedHandles.has(lh.handleId) || undefined}
                          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                          style={{ background: SIGNAL_COLORS[left.signalType], top: "50%" }}
                        />
                        <span
                          className="text-[10px] leading-5 truncate"
                          style={{ color: SIGNAL_COLORS[left.signalType] }}
                          title={`${left.label} (${SIGNAL_LABELS[left.signalType]})`}
                        >
                          {left.label}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pr-3 min-w-0 flex-1 justify-end" onContextMenu={right ? (e) => openPortMenu(e, right) : undefined}>
                    {right && rh && (
                      <>
                        <span
                          className="text-[10px] leading-5 truncate"
                          style={{ color: SIGNAL_COLORS[right.signalType] }}
                          title={`${right.label} (${SIGNAL_LABELS[right.signalType]})`}
                        >
                          {right.label}
                        </span>
                        <Handle
                          type={rh.handleType}
                          position={Position.Right}
                          id={rh.handleId}
                          data-connected={connectedHandles.has(rh.handleId) || undefined}
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

      {/* Empty Expansion Slots */}
      {data.slots?.some((s) => !s.cardTemplateId) && (
        <div>
          {data.slots.filter((s) => !s.cardTemplateId).map((slot) => (
            <div key={slot.slotId} className="flex justify-center items-center h-5 mx-1">
              <span className="text-[9px] text-[var(--color-text-muted)] opacity-40 truncate text-center italic">
                {slot.label} (empty)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bidirectional Ports */}
      {bidirectional.length > 0 && (
        <div>
          {bidirItems.map((item, i) => {
            if (item.type === "section") {
              return (
                <div key={`bsec-${i}`} className="flex justify-center items-end h-5 mx-1">
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
                  title={`${port.label} (${SIGNAL_LABELS[port.signalType]}) — bidirectional`}
                >
                  ↔ {port.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={outId}
                  data-connected={connectedHandles.has(outId) || undefined}
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
      {/* Auxiliary data — grid-aligned with compact 12px line height.
           Raw height = 1(border-t) + N×12. Pad to next multiple of 20. */}
      {data.auxiliaryData?.length ? (() => {
        const n = data.auxiliaryData!.length;
        const raw = 1 + n * 12;
        const totalPad = Math.ceil(raw / 20) * 20 - raw;
        const pt = Math.floor(totalPad / 2);
        const pb = totalPad - pt;
        return (
          <div className="auxiliaryData px-3 border-t border-[var(--color-border)]" style={{ paddingTop: pt, paddingBottom: pb }}>
            {data.auxiliaryData!.map((line, i) => (
              <div
                key={i}
                className="text-[9px] text-[var(--color-text-muted)] leading-3 truncate whitespace-nowrap text-center"
                title={line}
              >
                {line}
              </div>
            ))}
          </div>
        );
      })() : null}
      </div>
    </div>
  );
}

export default memo(DeviceNodeComponent);
