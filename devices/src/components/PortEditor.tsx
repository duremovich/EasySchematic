import { useState } from "react";
import type { Port, SignalType, PortDirection, ConnectorType } from "../../../src/types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "../../../src/types";
import PortRow from "./PortRow";

const SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];

interface PortEditorProps {
  ports: Port[];
  onChange: (ports: Port[]) => void;
}

export default function PortEditor({ ports, onChange }: PortEditorProps) {
  const [bulkOpen, setBulkOpen] = useState<PortDirection | null>(null);
  const [bulkPrefix, setBulkPrefix] = useState("IN");
  const [bulkStart, setBulkStart] = useState(1);
  const [bulkCount, setBulkCount] = useState(4);
  const [bulkSignal, setBulkSignal] = useState<SignalType>("sdi");
  const [bulkConnector, setBulkConnector] = useState<ConnectorType>("bnc");

  const grouped = {
    input: ports.filter((p) => p.direction === "input"),
    output: ports.filter((p) => p.direction === "output"),
    bidirectional: ports.filter((p) => p.direction === "bidirectional"),
  };

  const updatePort = (id: string, updates: Partial<Port>) => {
    onChange(ports.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePort = (id: string) => {
    onChange(ports.filter((p) => p.id !== id));
  };

  const addPort = (direction: PortDirection) => {
    const id = crypto.randomUUID().slice(0, 8);
    const dirLabel = direction === "input" ? "IN" : direction === "output" ? "OUT" : "IO";
    const count = grouped[direction].length + 1;
    onChange([...ports, {
      id,
      label: `${dirLabel} ${count}`,
      signalType: "sdi",
      direction,
    }]);
  };

  const addBulk = (direction: PortDirection) => {
    const newPorts: Port[] = [];
    for (let i = 0; i < bulkCount; i++) {
      newPorts.push({
        id: crypto.randomUUID().slice(0, 8),
        label: `${bulkPrefix} ${bulkStart + i}`,
        signalType: bulkSignal,
        direction,
        connectorType: bulkConnector,
      });
    }
    onChange([...ports, ...newPorts]);
    setBulkOpen(null);
  };

  const movePort = (id: string, dir: -1 | 1) => {
    const idx = ports.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= ports.length) return;
    const next = [...ports];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const renderSection = (direction: PortDirection, label: string) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">{label}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (bulkOpen === direction) { setBulkOpen(null); }
              else { setBulkPrefix(direction === "input" ? "IN" : direction === "output" ? "OUT" : "IO"); setBulkOpen(direction); }
            }}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Bulk Add
          </button>
          {grouped[direction].length > 0 && (
            <button
              onClick={() => onChange(ports.filter((p) => p.direction !== direction))}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Clear All
            </button>
          )}
          <button
            onClick={() => addPort(direction)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            + Add Port
          </button>
        </div>
      </div>
      {bulkOpen === direction && (
        <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap gap-3 items-end">
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Prefix</span>
            <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} className="w-20 px-2 py-1 rounded border border-slate-300 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Start #</span>
            <input type="number" value={bulkStart} onChange={(e) => setBulkStart(+e.target.value)} className="w-16 px-2 py-1 rounded border border-slate-300 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Count</span>
            <input type="number" value={bulkCount} onChange={(e) => setBulkCount(+e.target.value)} className="w-16 px-2 py-1 rounded border border-slate-300 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Signal</span>
            <select value={bulkSignal} onChange={(e) => setBulkSignal(e.target.value as SignalType)} className="px-2 py-1 rounded border border-slate-300 text-sm">
              {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Connector</span>
            <select value={bulkConnector} onChange={(e) => setBulkConnector(e.target.value as ConnectorType)} className="px-2 py-1 rounded border border-slate-300 text-sm">
              {(Object.keys(CONNECTOR_LABELS) as ConnectorType[]).map((c) => <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>)}
            </select>
          </label>
          <button onClick={() => addBulk(direction)} className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">Add</button>
        </div>
      )}
      {grouped[direction].length === 0 ? (
        <p className="text-sm text-slate-400 italic">No {label.toLowerCase()}</p>
      ) : (
        <div className="space-y-1">
          {grouped[direction].map((port) => (
            <PortRow
              key={port.id}
              port={port}
              onChange={(updates) => updatePort(port.id, updates)}
              onRemove={() => removePort(port.id)}
              onMoveUp={() => movePort(port.id, -1)}
              onMoveDown={() => movePort(port.id, 1)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-4">Ports</h2>
      {renderSection("input", "Inputs")}
      {renderSection("output", "Outputs")}
      {renderSection("bidirectional", "Bidirectional")}
    </div>
  );
}
