import { useState } from "react";
import { useSchematicStore } from "../store";
import {
  SIGNAL_LABELS,
  CONNECTOR_LABELS,
  type SignalType,
  type ConnectorType,
  type Port,
  type PortDirection,
  type DeviceTemplate,
} from "../types";
import { DEFAULT_CONNECTOR } from "../connectorTypes";
import { duplicatePortLabel } from "../portNaming";

const ALL_SIGNALS = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort(
  (a, b) => SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);
const ALL_CONNECTORS = (Object.keys(CONNECTOR_LABELS) as ConnectorType[]).sort(
  (a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]),
);

interface PortRow {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  connectorType?: ConnectorType;
}

function newPortRow(direction: PortDirection): PortRow {
  return {
    id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    signalType: "sdi",
    direction,
    connectorType: DEFAULT_CONNECTOR["sdi"],
  };
}

interface Props {
  open: boolean;
  initialFamily: string;
  familySuggestions: string[];
  onClose: () => void;
  onCreated: (cardTemplateId: string, finalFamily: string) => void;
}

export default function CardCreatorDialog({
  open,
  initialFamily,
  familySuggestions,
  onClose,
  onCreated,
}: Props) {
  const addCustomTemplate = useSchematicStore((s) => s.addCustomTemplate);

  const [label, setLabel] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [slotFamily, setSlotFamily] = useState(initialFamily);
  const [ports, setPorts] = useState<PortRow[]>([]);

  if (!open) return null;

  const reset = () => {
    setLabel("");
    setManufacturer("");
    setModelNumber("");
    setUnitCost("");
    setSlotFamily(initialFamily);
    setPorts([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const addPort = (direction: PortDirection) => setPorts([...ports, newPortRow(direction)]);
  const removePort = (id: string) => setPorts(ports.filter((p) => p.id !== id));
  const updatePort = (id: string, patch: Partial<PortRow>) =>
    setPorts(ports.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  // Duplicate a port row, inserting the clone right after the original with a
  // uniquified name (e.g. "SDI 1" → "SDI 2", "HDMI" → "HDMI (copy)").
  const duplicatePort = (id: string) =>
    setPorts((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1) return prev;
      const orig = prev[idx];
      const clone: PortRow = {
        ...orig,
        id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: duplicatePortLabel(orig.label, prev.map((p) => p.label)),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });

  const canSave = label.trim().length > 0 && slotFamily.trim().length > 0;

  const handleSave = () => {
    const trimmedLabel = label.trim();
    const trimmedFamily = slotFamily.trim();
    if (!trimmedLabel || !trimmedFamily) return;

    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        id: `card-${i}`,
        label: p.label.trim(),
        signalType: p.signalType,
        direction: p.direction,
        ...(p.connectorType ? { connectorType: p.connectorType } : {}),
      }));

    const id = `custom-card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const template: DeviceTemplate = {
      id,
      deviceType: "expansion-card",
      label: trimmedLabel,
      slotFamily: trimmedFamily,
      ports: finalPorts,
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(modelNumber.trim() ? { modelNumber: modelNumber.trim() } : {}),
      ...(unitCost.trim() && !Number.isNaN(Number(unitCost)) ? { unitCost: Number(unitCost) } : {}),
    };

    addCustomTemplate(template);
    onCreated(id, trimmedFamily);
    reset();
  };

  const inputs = ports.filter((p) => p.direction === "input");
  const outputs = ports.filter((p) => p.direction === "output");
  const bidir = ports.filter((p) => p.direction === "bidirectional");

  const renderPortRow = (p: PortRow) => (
    <div key={p.id} className="flex items-center gap-1 mb-1">
      <input
        value={p.label}
        onChange={(e) => updatePort(p.id, { label: e.target.value })}
        placeholder="Label"
        className="flex-1 min-w-0 px-1.5 py-0.5 text-xs rounded border outline-none focus:border-blue-500"
        style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
      />
      <select
        value={p.signalType}
        onChange={(e) => {
          const sig = e.target.value as SignalType;
          updatePort(p.id, { signalType: sig, connectorType: DEFAULT_CONNECTOR[sig] });
        }}
        className="px-1 py-0.5 text-[10px] rounded border outline-none focus:border-blue-500"
        style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
      >
        {ALL_SIGNALS.map((s) => (
          <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>
        ))}
      </select>
      <select
        value={p.connectorType ?? ""}
        onChange={(e) => updatePort(p.id, { connectorType: (e.target.value || undefined) as ConnectorType | undefined })}
        className="px-1 py-0.5 text-[10px] rounded border outline-none focus:border-blue-500"
        style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
      >
        <option value="">—</option>
        {ALL_CONNECTORS.map((c) => (
          <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => duplicatePort(p.id)}
        className="text-[10px] text-blue-500 hover:text-blue-600 cursor-pointer px-1 leading-none"
        title="Duplicate port"
      >
        Dup
      </button>
      <button
        type="button"
        onClick={() => removePort(p.id)}
        className="text-red-400 hover:text-red-500 text-xs cursor-pointer px-1 leading-none"
        title="Remove port"
      >
        &times;
      </button>
    </div>
  );

  const portSection = (title: string, direction: PortDirection, list: PortRow[]) => (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          {title}
        </div>
        <button
          type="button"
          onClick={() => addPort(direction)}
          className="text-[10px] text-blue-500 hover:text-blue-600 cursor-pointer"
        >
          + Add
        </button>
      </div>
      {list.length === 0 && (
        <div className="text-[10px] italic mb-1" style={{ color: "var(--color-text-muted)" }}>none</div>
      )}
      {list.map(renderPortRow)}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={close}
    >
      <div
        className="rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-sm font-semibold">Create Custom Card</div>
          <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            This card will be saved to your custom templates and installed in the slot.
          </div>
        </div>

        <div className="px-4 py-3 space-y-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>
              Label <span className="text-red-500">*</span>
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Fiber SFP+ Module"
              className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>
              Slot Family <span className="text-red-500">*</span>
            </label>
            <input
              value={slotFamily}
              onChange={(e) => setSlotFamily(e.target.value)}
              placeholder="e.g. disguise-vfc, my-custom-family"
              list="card-creator-families"
              className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
            />
            <datalist id="card-creator-families">
              {familySuggestions.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                Manufacturer
              </label>
              <input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
                style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                Model Number
              </label>
              <input
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
                style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-muted)" }}>
              Unit Cost (USD)
            </label>
            <input
              type="number"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0"
              min={0}
              className="w-32 px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
            />
          </div>

          <div className="pt-2 mt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
            <div className="text-xs font-semibold mb-2">Ports</div>
            {portSection("Inputs", "input", inputs)}
            {portSection("Outputs", "output", outputs)}
            {portSection("Bidirectional", "bidirectional", bidir)}
          </div>
        </div>

        <div
          className="px-4 py-2 flex items-center justify-end gap-2 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            type="button"
            onClick={close}
            className="px-3 py-1 text-xs rounded border cursor-pointer"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-3 py-1 text-xs rounded bg-blue-500 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            Create &amp; Install
          </button>
        </div>
      </div>
    </div>
  );
}
