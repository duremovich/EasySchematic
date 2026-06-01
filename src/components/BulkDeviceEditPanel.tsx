import { useMemo } from "react";

import { useSchematicStore } from "../store";
import type { DeviceData, DeviceNode, Port } from "../types";

interface Props {
  onClose: () => void;
}

interface SharedPortRow {
  key: string;
  portIndex: number;
  templatePortId?: string;
  label: string;
  direction: Port["direction"];
  hiddenCount: number;
}

function portMatchKey(port: Port, index: number): string {
  return port.templatePortId ?? `${port.direction}::${port.label}::${index}`;
}

function deviceIdentityKey(data: DeviceData): string {
  return data.templateId
    ? `template:${data.templateId}`
    : `shape:${data.deviceType}::${data.ports.map((port, index) => portMatchKey(port, index)).join("|")}`;
}

function findMatchingPort(device: DeviceNode, row: Pick<SharedPortRow, "portIndex" | "templatePortId" | "label" | "direction">): Port | undefined {
  if (row.templatePortId) {
    const byTemplatePortId = device.data.ports.find((port) => port.templatePortId === row.templatePortId);
    if (byTemplatePortId) return byTemplatePortId;
  }

  const byIndex = device.data.ports[row.portIndex];
  if (byIndex && byIndex.direction === row.direction && byIndex.label === row.label) return byIndex;

  return device.data.ports.find((port) => port.direction === row.direction && port.label === row.label);
}

function buildSharedPortRows(devices: DeviceNode[]): SharedPortRow[] {
  if (devices.length < 2) return [];

  const [first, ...rest] = devices;
  const firstHidden = new Set(first.data.hiddenPorts ?? []);

  return first.data.ports.flatMap((port, index) => {
    const matchKey = portMatchKey(port, index);
    const matches = [{ nodeId: first.id, portId: port.id, hidden: firstHidden.has(port.id) }];

    for (const device of rest) {
      const hidden = new Set(device.data.hiddenPorts ?? []);
      const candidate = findMatchingPort(device, {
        portIndex: index,
        templatePortId: port.templatePortId,
        label: port.label,
        direction: port.direction,
      });
      if (!candidate) return [];
      matches.push({ nodeId: device.id, portId: candidate.id, hidden: hidden.has(candidate.id) });
    }

    return [{
      key: matchKey,
      portIndex: index,
      templatePortId: port.templatePortId,
      label: port.label,
      direction: port.direction,
      hiddenCount: matches.filter((entry) => entry.hidden).length,
    }];
  });
}

export default function BulkDeviceEditPanel({ onClose }: Props) {
  const selectionKey = useSchematicStore((s) => {
    let nodeBits = "";
    for (const n of s.nodes) if (n.selected && n.type === "device") nodeBits += `${n.id};`;
    let edgeBits = "";
    for (const e of s.edges) if (e.selected) edgeBits += `${e.id};`;
    return `${nodeBits}|${edgeBits}`;
  });

  const selectedDevices = useMemo(
    () => useSchematicStore.getState().nodes.filter((n): n is DeviceNode => !!n.selected && n.type === "device"),
    [selectionKey],
  );
  const selectedEdgeCount = useMemo(
    () => useSchematicStore.getState().edges.filter((e) => e.selected).length,
    [selectionKey],
  );

  const compatible = useMemo(() => {
    if (selectedDevices.length < 2) return false;
    const identity = deviceIdentityKey(selectedDevices[0].data);
    return selectedDevices.every((device) => deviceIdentityKey(device.data) === identity);
  }, [selectedDevices]);

  const sharedPorts = useMemo(
    () => (compatible ? buildSharedPortRows(selectedDevices) : []),
    [compatible, selectedDevices],
  );

  const applyPortVisibility = (row: SharedPortRow, hide: boolean) => {
    const changes: { nodeId: string; patch: Partial<DeviceData> }[] = [];
    for (const device of selectedDevices) {
      const current = new Set(device.data.hiddenPorts ?? []);
      const port = findMatchingPort(device, row);
      if (!port) continue;
      if (hide) current.add(port.id);
      else current.delete(port.id);
      const hiddenPorts = [...current];
      changes.push({
        nodeId: device.id,
        patch: { hiddenPorts: hiddenPorts.length > 0 ? hiddenPorts : undefined },
      });
    }

    useSchematicStore.getState().batchPatchDeviceData(changes);
  };

  return (
    <div
      className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[40] bg-white border border-[var(--color-border)] rounded-lg shadow-lg p-3 w-80"
      data-print-hide
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--color-text)]">
          {selectedDevices.length >= 2 ? `Edit ${selectedDevices.length} devices` : "Edit devices"}
        </span>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs leading-none cursor-pointer"
        >
          ✕
        </button>
      </div>

      {!compatible && (
        <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
          Select 2 or more identical devices to group edit shared ports.
        </p>
      )}

      {selectedEdgeCount > 0 && compatible && (
        <p className="text-[10px] text-[var(--color-text-muted)] leading-tight mb-2">
          {selectedEdgeCount} connected selection{selectedEdgeCount === 1 ? " item was" : " items were"} ignored while editing devices.
        </p>
      )}

      {compatible && sharedPorts.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
          No shared ports were found across the selected devices.
        </p>
      )}

      {compatible && sharedPorts.length > 0 && (
        <>
          <p className="text-[10px] text-[var(--color-text-muted)] leading-tight mb-2">
            Port visibility is applied across all selected devices in one step.
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {sharedPorts.map((row) => {
              const allHidden = row.hiddenCount === selectedDevices.length;
              const mixed = row.hiddenCount > 0 && row.hiddenCount < selectedDevices.length;
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-2 border border-[var(--color-border)] rounded px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--color-text)] truncate">{row.label}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      {row.direction} port{mixed ? " - mixed" : allHidden ? " - hidden" : " - visible"}
                    </div>
                  </div>
                  <button
                    onClick={() => applyPortVisibility(row, !allHidden)}
                    className={`shrink-0 px-2 py-1 text-[11px] rounded border cursor-pointer transition-colors ${
                      allHidden
                        ? "text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-blue-700 hover:border-blue-300"
                        : "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
                    }`}
                    title={allHidden ? "Show this port on all selected devices" : "Hide this port on all selected devices"}
                  >
                    {allHidden ? "Show" : "Hide"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
