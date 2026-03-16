import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import { useSchematicStore } from "../store";
import {
  SIGNAL_LABELS,
  SIGNAL_COLORS,
  CONNECTOR_LABELS,
  type SignalType,
  type ConnectorType,
  type Port,
  type PortDirection,
  type PortNetworkConfig,
  type PortCapabilities,
  type DeviceData,
  type DeviceNode,
} from "../types";
import { DEFAULT_CONNECTOR, NETWORK_SIGNAL_TYPES, VIDEO_SIGNAL_TYPES } from "../connectorTypes";

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];
const ALL_CONNECTOR_TYPES = Object.keys(CONNECTOR_LABELS) as ConnectorType[];

interface PortDraft {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  section?: string;
  connectorType?: ConnectorType;
  networkConfig?: PortNetworkConfig;
  capabilities?: PortCapabilities;
}

function newPortDraft(direction: PortDirection): PortDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    signalType: "sdi",
    direction,
    connectorType: DEFAULT_CONNECTOR["sdi"],
  };
}

const MIME = "application/easyschematic-port";

export default function DeviceEditor() {
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const nodes = useSchematicStore((s) => s.nodes);
  const updateDevice = useSchematicStore((s) => s.updateDevice);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const addCustomTemplate = useSchematicStore((s) => s.addCustomTemplate);

  const node = nodes.find((n) => n.id === editingNodeId && n.type === "device") as DeviceNode | undefined;

  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [ports, setPorts] = useState<PortDraft[]>([]);

  // Drag state — which port is being dragged and where it would drop
  const [draggedPortId, setDraggedPortId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ direction: PortDirection; index: number } | null>(null);

  useEffect(() => {
    if (!node) return;
    setLabel(node.data.label);
    setDeviceType(node.data.deviceType);
    setPorts(
      node.data.ports.map((p) => ({
        id: p.id,
        label: p.label,
        signalType: p.signalType,
        direction: p.direction,
        section: p.section,
        connectorType: p.connectorType,
        networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
        capabilities: p.capabilities ? { ...p.capabilities } : undefined,
      })),
    );
  }, [node]);

  const close = useCallback(() => setEditingNodeId(null), [setEditingNodeId]);

  const handleSave = useCallback(() => {
    if (!editingNodeId) return;
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: p.id.startsWith("draft-") ? `p${Date.now()}-${i}` : p.id,
        label: p.label.trim(),
      }));

    // Preserve existing metadata fields from the node
    const existing = node?.data;
    const data: DeviceData = {
      label: label.trim() || "Untitled",
      deviceType: deviceType.trim() || "custom",
      ports: finalPorts,
      ...(existing?.manufacturer ? { manufacturer: existing.manufacturer } : {}),
      ...(existing?.modelNumber ? { modelNumber: existing.modelNumber } : {}),
      ...(existing?.templateId ? { templateId: existing.templateId } : {}),
      ...(existing?.templateVersion ? { templateVersion: existing.templateVersion } : {}),
    };
    updateDevice(editingNodeId, data);
    close();
  }, [editingNodeId, ports, label, deviceType, node, updateDevice, close]);

  const handleSaveAsTemplate = useCallback(() => {
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));

    const existing = node?.data;
    addCustomTemplate({
      deviceType: `custom-${Date.now()}`,
      label: label.trim() || "Custom Device",
      ports: finalPorts,
      ...(existing?.manufacturer ? { manufacturer: existing.manufacturer } : {}),
      ...(existing?.modelNumber ? { modelNumber: existing.modelNumber } : {}),
    });
  }, [ports, label, node, addCustomTemplate]);

  const addPort = (direction: PortDirection) => {
    setPorts([...ports, newPortDraft(direction)]);
  };

  const removePort = (id: string) => {
    setPorts(ports.filter((p) => p.id !== id));
  };

  const updatePort = (id: string, updates: Partial<PortDraft>) => {
    setPorts(ports.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const bulkAddPorts = (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => {
    const newPorts: PortDraft[] = [];
    for (let i = 0; i < count; i++) {
      newPorts.push({
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
        label: `${prefix} ${start + i}`,
        signalType,
        direction,
        section: section || undefined,
      });
    }
    setPorts([...ports, ...newPorts]);
  };

  // Drag-and-drop: move a port to a new position/section
  const movePortTo = useCallback(
    (portId: string, targetDirection: PortDirection, targetIndex: number) => {
      setPorts((prev) => {
        const port = prev.find((p) => p.id === portId);
        if (!port) return prev;

        const without = prev.filter((p) => p.id !== portId);
        const updated = { ...port, direction: targetDirection };

        const sectionPorts = without.filter((p) => p.direction === targetDirection);
        const insertAfterId = targetIndex > 0 ? sectionPorts[targetIndex - 1]?.id : null;

        if (sectionPorts.length === 0 || targetIndex === 0) {
          const firstOfSection = without.findIndex((p) => p.direction === targetDirection);
          if (firstOfSection === -1) {
            return [...without, updated];
          }
          without.splice(firstOfSection, 0, updated);
          return [...without];
        }

        const insertAfterIdx = without.findIndex((p) => p.id === insertAfterId);
        without.splice(insertAfterIdx + 1, 0, updated);
        return [...without];
      });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (draggedPortId && dropTarget) {
      movePortTo(draggedPortId, dropTarget.direction, dropTarget.index);
    }
    setDraggedPortId(null);
    setDropTarget(null);
  }, [draggedPortId, dropTarget, movePortTo]);

  if (!editingNodeId || !node) return null;

  const inputs = ports.filter((p) => p.direction === "input");
  const outputs = ports.filter((p) => p.direction === "output");
  const bidir = ports.filter((p) => p.direction === "bidirectional");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={close}>
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[560px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Device Properties</h2>
          <button
            onClick={close}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Device Name">
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Camera 1"
              />
            </Field>
            <Field label="Device Type">
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                placeholder="e.g. camera"
              />
            </Field>
          </div>

          {(node.data.manufacturer || node.data.modelNumber) && (
            <div className="text-[10px] text-[var(--color-text-muted)] -mt-2">
              {[node.data.manufacturer, node.data.modelNumber].filter(Boolean).join(" ")}
            </div>
          )}

          <PortSection
            title="Inputs"
            direction="input"
            ports={inputs}
            onAdd={() => addPort("input")}
            onBulkAdd={bulkAddPorts}
            onRemove={removePort}
            onUpdate={updatePort}
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={handleDragEnd}
          />

          <PortSection
            title="Outputs"
            direction="output"
            ports={outputs}
            onAdd={() => addPort("output")}
            onBulkAdd={bulkAddPorts}
            onRemove={removePort}
            onUpdate={updatePort}
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={handleDragEnd}
          />

          <PortSection
            title="Bidirectional"
            direction="bidirectional"
            ports={bidir}
            onAdd={() => addPort("bidirectional")}
            onBulkAdd={bulkAddPorts}
            onRemove={removePort}
            onUpdate={updatePort}
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={handleDragEnd}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center gap-2">
          <button
            onClick={handleSaveAsTemplate}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
            title="Save this device configuration as a reusable template"
          >
            Save as Template
          </button>
          <div className="flex-1" />
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function BulkAddForm({
  direction,
  onBulkAdd,
  onClose,
}: {
  direction: PortDirection;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState("Input");
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(8);
  const [signalType, setSignalType] = useState<SignalType>("sdi");
  const [section, setSection] = useState("");

  const handleSubmit = () => {
    if (count < 1 || !prefix.trim()) return;
    onBulkAdd(direction, prefix.trim(), start, count, signalType, section.trim());
    onClose();
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded p-2 space-y-2 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          className="w-20 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Prefix"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">from</span>
          <input
            type="number"
            className="w-12 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
            value={start}
            onChange={(e) => setStart(parseInt(e.target.value) || 1)}
            min={0}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">&times;</span>
          <input
            type="number"
            className="w-12 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            min={1}
            max={200}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <select
          className="bg-white border border-[var(--color-border)] rounded px-1 py-1 text-xs outline-none focus:border-blue-500 cursor-pointer"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {ALL_SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--color-text-muted)]">Section:</span>
        <input
          className="flex-1 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="(optional)"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          onClick={handleSubmit}
          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)]">
        Preview: {prefix} {start}, {prefix} {start + 1}, ... {prefix} {start + count - 1}
      </div>
    </div>
  );
}

function PortSection({
  title,
  direction,
  ports,
  onAdd,
  onBulkAdd,
  onRemove,
  onUpdate,
  draggedPortId,
  setDraggedPortId,
  dropTarget,
  setDropTarget,
  onDragEnd,
}: {
  title: string;
  direction: PortDirection;
  ports: PortDraft[];
  onAdd: () => void;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PortDraft>) => void;
  draggedPortId: string | null;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  const handleSectionDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (ports.length === 0) {
      setDropTarget({ direction, index: 0 });
    }
  };

  const handleSectionDrop = (e: DragEvent) => {
    e.preventDefault();
    onDragEnd();
  };

  const handleSectionDragLeave = (e: DragEvent) => {
    if (sectionRef.current && !sectionRef.current.contains(e.relatedTarget as Node)) {
      if (dropTarget?.direction === direction) {
        setDropTarget(null);
      }
    }
  };

  const showDropIndicator = dropTarget?.direction === direction;

  // Group ports by section for visual grouping in editor
  const groups: { section: string | undefined; ports: PortDraft[] }[] = [];
  for (const port of ports) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.section === port.section) {
      lastGroup.ports.push(port);
    } else {
      groups.push({ section: port.section, ports: [port] });
    }
  }

  // Track running index across groups for drop targeting
  let runningIndex = 0;

  return (
    <div
      ref={sectionRef}
      onDragOver={handleSectionDragOver}
      onDrop={handleSectionDrop}
      onDragLeave={handleSectionDragLeave}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Bulk Add
          </button>
          <button
            onClick={onAdd}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Add
          </button>
        </div>
      </div>

      {showBulkAdd && (
        <BulkAddForm
          direction={direction}
          onBulkAdd={onBulkAdd}
          onClose={() => setShowBulkAdd(false)}
        />
      )}

      {ports.length === 0 && !showDropIndicator && (
        <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-2">
          No {title.toLowerCase()} — click &quot;+ Add&quot; or drag a port here
        </div>
      )}
      {ports.length === 0 && showDropIndicator && (
        <div className="h-1 bg-blue-500 rounded-full my-1" />
      )}

      <div className="space-y-0">
        {groups.map((group, gi) => {
          const startIndex = runningIndex;
          runningIndex += group.ports.length;

          return (
            <div key={gi}>
              {group.section && (
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-surface)] px-1.5 py-0.5 mt-1 mb-0.5 rounded border-b border-[var(--color-border)]/30">
                  {group.section}
                </div>
              )}
              {group.ports.map((port, i) => (
                <PortRow
                  key={port.id}
                  port={port}
                  index={startIndex + i}
                  direction={direction}
                  onRemove={() => onRemove(port.id)}
                  onUpdate={(u) => onUpdate(port.id, u)}
                  isDragging={draggedPortId === port.id}
                  setDraggedPortId={setDraggedPortId}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  onDragEnd={onDragEnd}
                  isLast={startIndex + i === ports.length - 1}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortRow({
  port,
  index,
  direction,
  onRemove,
  onUpdate,
  isDragging,
  setDraggedPortId,
  dropTarget,
  setDropTarget,
  onDragEnd,
  isLast,
}: {
  port: PortDraft;
  index: number;
  direction: PortDirection;
  onRemove: () => void;
  onUpdate: (updates: Partial<PortDraft>) => void;
  isDragging: boolean;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
  isLast: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showSection, setShowSection] = useState(false);

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(MIME, port.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPortId(port.id);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midY = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midY ? index : index + 1;
    setDropTarget({ direction, index: insertIndex });
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragEnd();
  };

  const showIndicatorBefore =
    dropTarget?.direction === direction && dropTarget.index === index;
  const showIndicatorAfter =
    isLast && dropTarget?.direction === direction && dropTarget.index === index + 1;

  return (
    <>
      {showIndicatorBefore && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
      <div
        ref={rowRef}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDraggedPortId(null);
          setDropTarget(null);
        }}
        className={`flex items-center gap-1.5 group py-0.5 ${
          isDragging ? "opacity-30" : ""
        }`}
      >
        {/* Drag handle */}
        <span
          className="text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing text-[10px] select-none shrink-0"
          title="Drag to reorder"
        >
          ⠿
        </span>

        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: SIGNAL_COLORS[port.signalType] }}
        />

        <input
          className="flex-1 min-w-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
          value={port.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Port label"
          onKeyDown={(e) => e.stopPropagation()}
        />

        <select
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
          value={port.signalType}
          onChange={(e) => {
            const newSignal = e.target.value as SignalType;
            onUpdate({
              signalType: newSignal,
              connectorType: DEFAULT_CONNECTOR[newSignal],
            });
          }}
        >
          {ALL_SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {SIGNAL_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-1 text-[10px] text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer max-w-[80px]"
          value={port.connectorType ?? DEFAULT_CONNECTOR[port.signalType]}
          onChange={(e) => onUpdate({ connectorType: e.target.value as ConnectorType })}
          title="Connector type"
        >
          {ALL_CONNECTOR_TYPES.map((c) => (
            <option key={c} value={c}>
              {CONNECTOR_LABELS[c]}
            </option>
          ))}
        </select>

        {/* Section badge */}
        <button
          onClick={() => setShowSection(!showSection)}
          className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
            port.section
              ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100"
          }`}
          title="Set section group"
        >
          {port.section || "§"}
        </button>

        <button
          onClick={onRemove}
          className="text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove port"
        >
          &times;
        </button>
      </div>

      {showSection && (
        <div className="flex items-center gap-1.5 pl-6 pb-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">Section:</span>
          <input
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={port.section || ""}
            onChange={(e) => onUpdate({ section: e.target.value || undefined })}
            placeholder="e.g. Cameras"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") setShowSection(false);
            }}
            autoFocus
          />
          <button
            onClick={() => setShowSection(false)}
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {/* Network Config (collapsible, only for network signal types) */}
      {NETWORK_SIGNAL_TYPES.has(port.signalType) && (
        <PortNetworkSection
          config={port.networkConfig}
          onChange={(nc) => onUpdate({ networkConfig: nc })}
        />
      )}

      {/* Capabilities (collapsible, only for video signal types) */}
      {VIDEO_SIGNAL_TYPES.has(port.signalType) && (
        <PortCapabilitiesSection
          capabilities={port.capabilities}
          onChange={(caps) => onUpdate({ capabilities: caps })}
        />
      )}

      {showIndicatorAfter && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
    </>
  );
}

function PortNetworkSection({
  config,
  onChange,
}: {
  config?: PortNetworkConfig;
  onChange: (config: PortNetworkConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = config ?? {};
  const hasData = c.ip || c.subnetMask || c.gateway || c.vlan || c.dhcp;

  return (
    <div className="pl-6 mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[9px] cursor-pointer transition-colors ${
          hasData ? "text-blue-600" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        {open ? "▾" : "▸"} Network{hasData ? " (configured)" : ""}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1 mt-1">
          <label className="flex items-center gap-1 col-span-2 text-[9px] text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={c.dhcp ?? false}
              onChange={(e) => onChange({ ...c, dhcp: e.target.checked })}
              className="cursor-pointer"
            />
            DHCP
          </label>
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.ip ?? ""}
            onChange={(e) => onChange({ ...c, ip: e.target.value || undefined })}
            placeholder="IP Address"
            disabled={c.dhcp}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.subnetMask ?? ""}
            onChange={(e) => onChange({ ...c, subnetMask: e.target.value || undefined })}
            placeholder="Subnet Mask"
            disabled={c.dhcp}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.gateway ?? ""}
            onChange={(e) => onChange({ ...c, gateway: e.target.value || undefined })}
            placeholder="Gateway"
            disabled={c.dhcp}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            type="number"
            value={c.vlan ?? ""}
            onChange={(e) => onChange({ ...c, vlan: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="VLAN"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function PortCapabilitiesSection({
  capabilities,
  onChange,
}: {
  capabilities?: PortCapabilities;
  onChange: (caps: PortCapabilities) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = capabilities ?? {};
  const hasData = c.maxResolution || c.maxFrameRate || c.maxBitDepth;

  return (
    <div className="pl-6 mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[9px] cursor-pointer transition-colors ${
          hasData ? "text-blue-600" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        {open ? "▾" : "▸"} Capabilities{hasData ? " (set)" : ""}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1 mt-1">
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.maxResolution ?? ""}
            onChange={(e) => onChange({ ...c, maxResolution: e.target.value || undefined })}
            placeholder="Max Resolution (e.g. 3840x2160)"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            type="number"
            value={c.maxFrameRate ?? ""}
            onChange={(e) => onChange({ ...c, maxFrameRate: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Max FPS"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            type="number"
            value={c.maxBitDepth ?? ""}
            onChange={(e) => onChange({ ...c, maxBitDepth: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Bit Depth"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.colorSpaces?.join(", ") ?? ""}
            onChange={(e) => onChange({ ...c, colorSpaces: e.target.value ? e.target.value.split(",").map((s) => s.trim()) : undefined })}
            placeholder="Color Spaces (comma sep)"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
