import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType } from "../types";
import { SIGNAL_COLORS, SIGNAL_LABELS } from "../types";
import { useSchematicStore } from "../store";

function DeviceNodeComponent({ id, data, selected }: NodeProps<DeviceNodeType>) {
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);

  // Track which bidirectional handles are connected (return a stable string for zustand comparison)
  const connectedHandleStr = useSchematicStore((s) => {
    const ids: string[] = [];
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) ids.push(e.sourceHandle);
      if (e.target === id && e.targetHandle) ids.push(e.targetHandle);
    }
    return ids.sort().join(",");
  });
  const connectedHandles = new Set(connectedHandleStr ? connectedHandleStr.split(",") : []);

  const inputs = data.ports.filter((p) => p.direction === "input");
  const outputs = data.ports.filter((p) => p.direction === "output");
  const bidirectional = data.ports.filter((p) => p.direction === "bidirectional");
  const maxPorts = Math.max(inputs.length, outputs.length, 1);

  return (
    <div
      onDoubleClick={() => setEditingNodeId(id)}
      className={`
        relative rounded-lg border bg-white min-w-[180px]
        ${selected ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-[var(--color-border)]"}
      `}
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[var(--color-border)] rounded-t-lg bg-[var(--color-surface)]">
        <div className="text-xs font-semibold text-[var(--color-text-heading)] truncate">
          {data.label}
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] capitalize">
          {data.deviceType.replace(/-/g, " ")}
        </div>
      </div>

      {/* Input/Output Ports */}
      <div className="py-1">
        {Array.from({ length: maxPorts }, (_, i) => {
          const input = inputs[i];
          const output = outputs[i];
          return (
            <div key={i} className="flex justify-between items-center relative h-7">
              {/* Input port */}
              <div className="flex items-center gap-1 pl-3 min-w-0 flex-1">
                {input && (
                  <>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={input.id}
                      className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                      style={{ background: SIGNAL_COLORS[input.signalType], top: "auto" }}
                    />
                    <span
                      className="text-[10px] truncate"
                      style={{ color: SIGNAL_COLORS[input.signalType] }}
                      title={`${input.label} (${SIGNAL_LABELS[input.signalType]})`}
                    >
                      {input.label}
                    </span>
                  </>
                )}
              </div>

              {/* Output port */}
              <div className="flex items-center gap-1 pr-3 min-w-0 flex-1 justify-end">
                {output && (
                  <>
                    <span
                      className="text-[10px] truncate"
                      style={{ color: SIGNAL_COLORS[output.signalType] }}
                      title={`${output.label} (${SIGNAL_LABELS[output.signalType]})`}
                    >
                      {output.label}
                    </span>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={output.id}
                      className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
                      style={{ background: SIGNAL_COLORS[output.signalType], top: "auto" }}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Bidirectional Ports */}
        {bidirectional.map((port) => {
          const inId = `${port.id}-in`;
          const outId = `${port.id}-out`;
          const inConnected = connectedHandles.has(inId);
          const outConnected = connectedHandles.has(outId);
          // If one side is connected, the other is disabled
          const inDisabled = outConnected;
          const outDisabled = inConnected;

          return (
            <div key={port.id} className="flex justify-center items-center relative h-7">
              <Handle
                type="target"
                position={Position.Left}
                id={inId}
                className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-left-[5px]"
                style={{
                  background: inDisabled ? "#d1d5db" : SIGNAL_COLORS[port.signalType],
                  opacity: inDisabled ? 0.4 : 1,
                  top: "auto",
                }}
              />
              <span
                className="text-[10px] truncate"
                style={{ color: SIGNAL_COLORS[port.signalType] }}
                title={`${port.label} (${SIGNAL_LABELS[port.signalType]}) — bidirectional`}
              >
                ↔ {port.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={outId}
                className="!w-2.5 !h-2.5 !border-2 !border-[var(--color-border)] !-right-[5px]"
                style={{
                  background: outDisabled ? "#d1d5db" : SIGNAL_COLORS[port.signalType],
                  opacity: outDisabled ? 0.4 : 1,
                  top: "auto",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(DeviceNodeComponent);
