import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType, Port } from "../types";
import { SIGNAL_COLORS, SIGNAL_LABELS } from "../types";
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
  const hiddenSignalTypesStr = useSchematicStore((s) => s.hiddenSignalTypes);
  const hideDeviceTypes = useSchematicStore((s) => s.hideDeviceTypes);

  const hiddenSignalTypes = useMemo(
    () => (hiddenSignalTypesStr ? new Set(hiddenSignalTypesStr.split(",")) : null),
    [hiddenSignalTypesStr],
  );

  const visiblePorts = useMemo(
    () => hiddenSignalTypes ? data.ports.filter((p) => !hiddenSignalTypes.has(p.signalType)) : data.ports,
    [data.ports, hiddenSignalTypes],
  );

  const connectedHandleStr = useSchematicStore((s) => {
    const ids: string[] = [];
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) ids.push(e.sourceHandle);
      if (e.target === id && e.targetHandle) ids.push(e.targetHandle);
    }
    return ids.sort().join(",");
  });
  const connectedHandles = new Set(connectedHandleStr ? connectedHandleStr.split(",") : []);

  const inputs = visiblePorts.filter((p) => p.direction === "input");
  const outputs = visiblePorts.filter((p) => p.direction === "output");
  const bidirectional = visiblePorts.filter((p) => p.direction === "bidirectional");

  const inputItems = useMemo(() => buildColumnItems(inputs), [inputs]);
  const outputItems = useMemo(() => buildColumnItems(outputs), [outputs]);

  const hasSections = inputItems.some((i) => i.type === "section") ||
    outputItems.some((i) => i.type === "section");

  // Build bidirectional items with section support
  const bidirItems = useMemo(() => buildColumnItems(bidirectional), [bidirectional]);

  return (
    <div
      onDoubleClick={() => setEditingNodeId(id)}
      className={`
        relative rounded-lg border bg-white min-w-[180px]
        ${selected ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-[var(--color-border)]"}
      `}
    >
      {/* Header */}
      <div className="px-3 h-10 flex flex-col justify-center border-b border-[var(--color-border)] rounded-t-lg bg-[var(--color-surface)]">
        <div className="text-xs font-semibold text-[var(--color-text-heading)] truncate leading-tight">
          {data.label}
        </div>
        {!hideDeviceTypes && (
          <div className="text-[10px] text-[var(--color-text-muted)] capitalize leading-tight">
            {data.deviceType.replace(/-/g, " ")}
          </div>
        )}
      </div>

      {/* Port area — 9px top padding aligns all handle centers to the 20px grid.
           Math: 1px (node border) + 40px (header) + 9px (pad) + 10px (half row) = 60px ≡ 0 mod 20 */}
      <div className="pt-[9px]">
      {/* Input/Output Ports — two independent columns */}
      {(inputs.length > 0 || outputs.length > 0) && (
        hasSections ? (
          /* Sectioned layout: independent columns */
          <div className="flex">
            {/* Input column */}
            <div className="flex-1 min-w-0">
              {inputItems.map((item, i) =>
                item.type === "section" ? (
                  <div key={`isec-${i}`} className="h-5 flex items-end pl-2">
                    <span className="text-[9px] text-[var(--color-text-muted)] truncate border-b border-[var(--color-border)]/30 w-full pb-0.5 mr-1">
                      {item.name}
                    </span>
                  </div>
                ) : (
                  <div key={item.port.id} className="flex items-center gap-1 pl-3 h-5 relative">
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={item.port.id}
                      data-connected={connectedHandles.has(item.port.id) || undefined}
                      className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                      style={{ background: SIGNAL_COLORS[item.port.signalType], top: "50%" }}
                    />
                    <span
                      className="text-[10px] leading-5 truncate"
                      style={{ color: SIGNAL_COLORS[item.port.signalType] }}
                      title={`${item.port.label} (${SIGNAL_LABELS[item.port.signalType]})`}
                    >
                      {item.port.label}
                    </span>
                  </div>
                ),
              )}
            </div>

            {/* Output column */}
            <div className="flex-1 min-w-0">
              {outputItems.map((item, i) =>
                item.type === "section" ? (
                  <div key={`osec-${i}`} className="h-5 flex items-end pr-2">
                    <span className="text-[9px] text-[var(--color-text-muted)] truncate text-right border-b border-[var(--color-border)]/30 w-full pb-0.5 ml-1">
                      {item.name}
                    </span>
                  </div>
                ) : (
                  <div key={item.port.id} className="flex items-center gap-1 pr-3 h-5 relative justify-end">
                    <span
                      className="text-[10px] leading-5 truncate"
                      style={{ color: SIGNAL_COLORS[item.port.signalType] }}
                      title={`${item.port.label} (${SIGNAL_LABELS[item.port.signalType]})`}
                    >
                      {item.port.label}
                    </span>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={item.port.id}
                      data-connected={connectedHandles.has(item.port.id) || undefined}
                      className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
                      style={{ background: SIGNAL_COLORS[item.port.signalType], top: "50%" }}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          /* Non-sectioned layout: paired rows (original behavior) */
          <div>
            {Array.from({ length: Math.max(inputs.length, outputs.length, 1) }, (_, i) => {
              const input = inputs[i];
              const output = outputs[i];
              return (
                <div key={i} className="flex justify-between items-center relative h-5">
                  <div className="flex items-center gap-1 pl-3 min-w-0 flex-1">
                    {input && (
                      <>
                        <Handle
                          type="target"
                          position={Position.Left}
                          id={input.id}
                          data-connected={connectedHandles.has(input.id) || undefined}
                          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                          style={{ background: SIGNAL_COLORS[input.signalType], top: "50%" }}
                        />
                        <span
                          className="text-[10px] leading-5 truncate"
                          style={{ color: SIGNAL_COLORS[input.signalType] }}
                          title={`${input.label} (${SIGNAL_LABELS[input.signalType]})`}
                        >
                          {input.label}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pr-3 min-w-0 flex-1 justify-end">
                    {output && (
                      <>
                        <span
                          className="text-[10px] leading-5 truncate"
                          style={{ color: SIGNAL_COLORS[output.signalType] }}
                          title={`${output.label} (${SIGNAL_LABELS[output.signalType]})`}
                        >
                          {output.label}
                        </span>
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={output.id}
                          data-connected={connectedHandles.has(output.id) || undefined}
                          className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
                          style={{ background: SIGNAL_COLORS[output.signalType], top: "50%" }}
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
                  type="target"
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
      </div>
    </div>
  );
}

export default memo(DeviceNodeComponent);
