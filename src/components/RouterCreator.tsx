import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { SIGNAL_LABELS, type SignalType, type Port, type DeviceTemplate } from "../types";
import { useSchematicStore, GRID_SIZE } from "../store";

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];

interface SectionDef {
  id: string;
  name: string;
  prefix: string;
  count: number;
  signalType: SignalType;
}

function newSection(): SectionDef {
  return {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    prefix: "",
    count: 1,
    signalType: "sdi",
  };
}

function buildPorts(sections: SectionDef[], direction: "input" | "output"): Port[] {
  const ports: Port[] = [];
  let portNum = 0;
  for (const sec of sections) {
    for (let i = 0; i < sec.count; i++) {
      ports.push({
        id: `p-${direction[0]}-${portNum++}`,
        label: sec.prefix ? `${sec.prefix} ${i + 1}` : `${direction === "input" ? "In" : "Out"} ${portNum}`,
        signalType: sec.signalType,
        direction,
        section: sec.name || undefined,
      });
    }
  }
  return ports;
}

export default function RouterCreator({ onClose, position }: { onClose: () => void; position?: { x: number; y: number } }) {
  const addDevice = useSchematicStore((s) => s.addDevice);
  const addCustomTemplate = useSchematicStore((s) => s.addCustomTemplate);
  const rfInstance = useReactFlow();

  const [deviceName, setDeviceName] = useState("Router");
  const [deviceType, setDeviceType] = useState("router");
  const [inputSections, setInputSections] = useState<SectionDef[]>([
    { ...newSection(), name: "Inputs", prefix: "Input", count: 8 },
  ]);
  const [outputSections, setOutputSections] = useState<SectionDef[]>([
    { ...newSection(), name: "Outputs", prefix: "Output", count: 8 },
  ]);

  const updateSection = (
    setter: React.Dispatch<React.SetStateAction<SectionDef[]>>,
    id: string,
    updates: Partial<SectionDef>,
  ) => {
    setter((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const buildTemplate = (): DeviceTemplate => {
    const ports = [...buildPorts(inputSections, "input"), ...buildPorts(outputSections, "output")];
    return {
      deviceType: deviceType.trim() || "router",
      label: deviceName.trim() || "Router",
      ports,
    };
  };

  const totalInputs = inputSections.reduce((s, sec) => s + sec.count, 0);
  const totalOutputs = outputSections.reduce((s, sec) => s + sec.count, 0);

  const handleCreateOnCanvas = () => {
    const template = buildTemplate();
    let pos: { x: number; y: number };
    if (position) {
      // Center on the provided position (from quick-add double-click)
      const w = 180;
      const portRows = Math.max(totalInputs, totalOutputs);
      const h = Math.max(60, 32 + portRows * 20);
      pos = {
        x: Math.round((position.x - w / 2) / GRID_SIZE) * GRID_SIZE,
        y: Math.round((position.y - h / 2) / GRID_SIZE) * GRID_SIZE,
      };
    } else {
      // Center of current viewport
      const vp = rfInstance.getViewport();
      const container = document.querySelector(".react-flow");
      const cw = container?.clientWidth ?? window.innerWidth;
      const ch = container?.clientHeight ?? window.innerHeight;
      pos = {
        x: Math.round((-vp.x + cw / 2) / vp.zoom / GRID_SIZE) * GRID_SIZE,
        y: Math.round((-vp.y + ch / 2) / vp.zoom / GRID_SIZE) * GRID_SIZE,
      };
    }
    addDevice(template, pos);
    onClose();
  };

  const handleSaveAsTemplate = () => {
    const template = buildTemplate();
    template.deviceType = `custom-${Date.now()}`;
    addCustomTemplate(template);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[600px] max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Quick Create Router / Switcher</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Device Name
              </label>
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Ross Ultrix"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Device Type
              </label>
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                placeholder="e.g. router"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Input Sections */}
          <SectionList
            title="Input Sections"
            totalLabel={`${totalInputs} inputs`}
            sections={inputSections}
            onChange={setInputSections}
            onUpdate={(id, u) => updateSection(setInputSections, id, u)}
          />

          {/* Output Sections */}
          <SectionList
            title="Output Sections"
            totalLabel={`${totalOutputs} outputs`}
            sections={outputSections}
            onChange={setOutputSections}
            onUpdate={(id, u) => updateSection(setOutputSections, id, u)}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center gap-2">
          <button
            onClick={handleSaveAsTemplate}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Save as Template
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateOnCanvas}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Create on Canvas
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionList({
  title,
  totalLabel,
  sections,
  onChange,
  onUpdate,
}: {
  title: string;
  totalLabel: string;
  sections: SectionDef[];
  onChange: React.Dispatch<React.SetStateAction<SectionDef[]>>;
  onUpdate: (id: string, updates: Partial<SectionDef>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]">{totalLabel}</span>
          <button
            onClick={() => onChange((prev) => [...prev, newSection()])}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Add Section
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {sections.map((sec) => (
          <div key={sec.id} className="flex items-center gap-1.5 bg-[var(--color-surface)] rounded px-2 py-1.5 group">
            <input
              className="w-24 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
              value={sec.name}
              onChange={(e) => onUpdate(sec.id, { name: e.target.value })}
              placeholder="Section name"
              onKeyDown={(e) => e.stopPropagation()}
            />
            <input
              className="w-20 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
              value={sec.prefix}
              onChange={(e) => onUpdate(sec.id, { prefix: e.target.value })}
              placeholder="Prefix"
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] text-[var(--color-text-muted)]">&times;</span>
              <input
                type="number"
                className="w-12 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                value={sec.count}
                onChange={(e) => onUpdate(sec.id, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                min={1}
                max={200}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <select
              className="bg-white border border-[var(--color-border)] rounded px-1 py-1 text-xs outline-none focus:border-blue-500 cursor-pointer"
              value={sec.signalType}
              onChange={(e) => onUpdate(sec.id, { signalType: e.target.value as SignalType })}
            >
              {ALL_SIGNAL_TYPES.map((t) => (
                <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
              ))}
            </select>
            <button
              onClick={() => onChange((prev) => prev.filter((s) => s.id !== sec.id))}
              className="text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove section"
            >
              &times;
            </button>
          </div>
        ))}
        {sections.length === 0 && (
          <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-2">
            No sections — click &quot;+ Add Section&quot;
          </div>
        )}
      </div>
    </div>
  );
}
