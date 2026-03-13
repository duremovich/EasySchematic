import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import { useSchematicStore } from "../store";
import {
  SIGNAL_LABELS,
  SIGNAL_COLORS,
  type SignalType,
  type Port,
  type PortDirection,
  type DeviceData,
  type DeviceNode,
} from "../types";

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];

interface PortDraft {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
}

function newPortDraft(direction: PortDirection): PortDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    signalType: "sdi",
    direction,
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

    const data: DeviceData = {
      label: label.trim() || "Untitled",
      deviceType: deviceType.trim() || "custom",
      ports: finalPorts,
    };
    updateDevice(editingNodeId, data);
    close();
  }, [editingNodeId, ports, label, deviceType, updateDevice, close]);

  const handleSaveAsTemplate = useCallback(() => {
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));

    addCustomTemplate({
      deviceType: `custom-${Date.now()}`,
      label: label.trim() || "Custom Device",
      ports: finalPorts,
    });
  }, [ports, label, addCustomTemplate]);

  const addPort = (direction: PortDirection) => {
    setPorts([...ports, newPortDraft(direction)]);
  };

  const removePort = (id: string) => {
    setPorts(ports.filter((p) => p.id !== id));
  };

  const updatePort = (id: string, updates: Partial<PortDraft>) => {
    setPorts(ports.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  // Drag-and-drop: move a port to a new position/section
  const movePortTo = useCallback(
    (portId: string, targetDirection: PortDirection, targetIndex: number) => {
      setPorts((prev) => {
        const port = prev.find((p) => p.id === portId);
        if (!port) return prev;

        // Remove port from current position
        const without = prev.filter((p) => p.id !== portId);
        const updated = { ...port, direction: targetDirection };

        // Find insertion point: get ports of target direction and insert at targetIndex
        const sectionPorts = without.filter((p) => p.direction === targetDirection);
        const insertAfterId = targetIndex > 0 ? sectionPorts[targetIndex - 1]?.id : null;

        if (sectionPorts.length === 0 || targetIndex === 0) {
          // Insert before first port of this direction, or at end if none exist
          const firstOfSection = without.findIndex((p) => p.direction === targetDirection);
          if (firstOfSection === -1) {
            // No ports of this direction — append at end
            return [...without, updated];
          }
          without.splice(firstOfSection, 0, updated);
          return [...without];
        }

        // Insert after the port at targetIndex - 1
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
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[520px] max-h-[85vh] flex flex-col"
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

          <PortSection
            title="Inputs"
            direction="input"
            ports={inputs}
            onAdd={() => addPort("input")}
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

function PortSection({
  title,
  direction,
  ports,
  onAdd,
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
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PortDraft>) => void;
  draggedPortId: string | null;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);

  const handleSectionDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // If dragging over the empty area of the section, target end of list
    if (ports.length === 0) {
      setDropTarget({ direction, index: 0 });
    }
  };

  const handleSectionDrop = (e: DragEvent) => {
    e.preventDefault();
    onDragEnd();
  };

  const handleSectionDragLeave = (e: DragEvent) => {
    // Only clear if leaving the section entirely
    if (sectionRef.current && !sectionRef.current.contains(e.relatedTarget as Node)) {
      if (dropTarget?.direction === direction) {
        setDropTarget(null);
      }
    }
  };

  const showDropIndicator = dropTarget?.direction === direction;

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
        <button
          onClick={onAdd}
          className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
        >
          + Add
        </button>
      </div>
      {ports.length === 0 && !showDropIndicator && (
        <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-2">
          No {title.toLowerCase()} — click &quot;+ Add&quot; or drag a port here
        </div>
      )}
      {ports.length === 0 && showDropIndicator && (
        <div className="h-1 bg-blue-500 rounded-full my-1" />
      )}
      <div className="space-y-0">
        {ports.map((port, i) => (
          <PortRow
            key={port.id}
            port={port}
            index={i}
            direction={direction}
            onRemove={() => onRemove(port.id)}
            onUpdate={(u) => onUpdate(port.id, u)}
            isDragging={draggedPortId === port.id}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={onDragEnd}
            isLast={i === ports.length - 1}
          />
        ))}
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
          onChange={(e) => onUpdate({ signalType: e.target.value as SignalType })}
        >
          {ALL_SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {SIGNAL_LABELS[t]}
            </option>
          ))}
        </select>

        <button
          onClick={onRemove}
          className="text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove port"
        >
          &times;
        </button>
      </div>
      {showIndicatorAfter && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
    </>
  );
}
