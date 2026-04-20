import { useState, useCallback, useMemo } from "react";
import type { Port, SignalType, PortDirection, ConnectorType } from "../../../src/types";
import { SIGNAL_LABELS, CONNECTOR_LABELS, SIGNAL_GROUPS, CONNECTOR_GROUPS } from "../../../src/types";
import { DEFAULT_CONNECTOR } from "../../../src/connectorTypes";

const NETWORK_SIGNAL_TYPES = new Set(["ethernet", "ndi", "dante", "avb", "srt", "hdbaset"]);
import PortRow from "./PortRow";
import SearchableSelect from "./SearchableSelect";

interface PortEditorProps {
  ports: Port[];
  onChange: (ports: Port[]) => void;
  deviceType?: string;
}

export default function PortEditor({ ports, onChange, deviceType }: PortEditorProps) {
  const isPatchPanel = deviceType === "patch-panel";
  const [bulkOpen, setBulkOpen] = useState<PortDirection | null>(null);
  const [bulkPrefix, setBulkPrefix] = useState("IN");
  const [bulkStart, setBulkStart] = useState(1);
  const [bulkCount, setBulkCount] = useState(4);
  const [bulkSignal, setBulkSignal] = useState<SignalType>("sdi");
  const [bulkConnector, setBulkConnector] = useState<ConnectorType>("bnc");

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  // Bulk edit toolbar state
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  const grouped = {
    input: ports.filter((p) => p.direction === "input"),
    output: ports.filter((p) => p.direction === "output"),
    bidirectional: ports.filter((p) => p.direction === "bidirectional"),
  };

  // Flat ordered list for shift-click range selection
  const orderedIds = useMemo(
    () => [...grouped.input, ...grouped.output, ...grouped.bidirectional].map((p) => p.id),
    [grouped.input, grouped.output, grouped.bidirectional],
  );

  const handlePortClick = useCallback((portId: string, e: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClicked) {
        // Range select
        const startIdx = orderedIds.indexOf(lastClicked);
        const endIdx = orderedIds.indexOf(portId);
        if (startIdx >= 0 && endIdx >= 0) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = lo; i <= hi; i++) {
            next.add(orderedIds[i]);
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle individual
        if (next.has(portId)) next.delete(portId);
        else next.add(portId);
      } else {
        // Single select (or deselect if already the only one selected)
        if (next.size === 1 && next.has(portId)) {
          next.clear();
        } else {
          next.clear();
          next.add(portId);
        }
      }
      return next;
    });
    setLastClicked(portId);
  }, [lastClicked, orderedIds]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, []);

  // Bulk edit actions on selected ports
  const applyToSelected = (updates: Partial<Port>) => {
    onChange(ports.map((p) => selected.has(p.id) ? { ...p, ...updates } : p));
  };

  const applyFindReplace = () => {
    if (!findText) return;
    onChange(ports.map((p) => {
      if (!selected.has(p.id)) return p;
      return { ...p, label: p.label.split(findText).join(replaceText) };
    }));
    setFindText("");
    setReplaceText("");
  };

  const deleteSelected = () => {
    onChange(ports.filter((p) => !selected.has(p.id)));
    clearSelection();
  };

  const updatePort = (id: string, updates: Partial<Port>) => {
    onChange(ports.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePort = (id: string) => {
    onChange(ports.filter((p) => p.id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const insertAtTop = (direction: PortDirection, newPorts: Port[]) => {
    const idx = ports.findIndex((p) => p.direction === direction);
    if (idx < 0) {
      onChange([...ports, ...newPorts]);
    } else {
      const next = [...ports];
      next.splice(idx, 0, ...newPorts);
      onChange(next);
    }
  };

  const addPort = (direction: PortDirection) => {
    const id = crypto.randomUUID().slice(0, 8);
    const dirLabel = direction === "input" ? "IN" : direction === "output" ? "OUT" : "IO";
    const count = grouped[direction].length + 1;
    insertAtTop(direction, [{
      id,
      label: `${dirLabel} ${count}`,
      signalType: "sdi",
      connectorType: DEFAULT_CONNECTOR["sdi"],
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
    insertAtTop(direction, newPorts);
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

  const selectedCount = selected.size;

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
              onClick={() => {
                onChange(ports.filter((p) => p.direction !== direction));
                setSelected((prev) => {
                  const next = new Set(prev);
                  grouped[direction].forEach((p) => next.delete(p.id));
                  return next;
                });
              }}
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
            <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} className="w-full sm:w-20 px-2 py-1 rounded border border-slate-300 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Start #</span>
            <input type="number" value={bulkStart} onChange={(e) => setBulkStart(+e.target.value)} className="w-full sm:w-16 px-2 py-1 rounded border border-slate-300 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Count</span>
            <input type="number" value={bulkCount} onChange={(e) => setBulkCount(+e.target.value)} className="w-full sm:w-16 px-2 py-1 rounded border border-slate-300 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Signal</span>
            <SearchableSelect<SignalType>
              value={bulkSignal}
              onChange={(v) => { setBulkSignal(v); setBulkConnector(DEFAULT_CONNECTOR[v]); }}
              groups={SIGNAL_GROUPS}
              labels={SIGNAL_LABELS}
              className="px-2 py-1 rounded border border-slate-300 text-sm min-w-[120px]"
            />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Connector</span>
            <SearchableSelect<ConnectorType>
              value={bulkConnector}
              onChange={setBulkConnector}
              groups={CONNECTOR_GROUPS}
              labels={CONNECTOR_LABELS}
              recommended={DEFAULT_CONNECTOR[bulkSignal]}
              recommendedLabel={`Default for ${SIGNAL_LABELS[bulkSignal]}`}
              className="px-2 py-1 rounded border border-slate-300 text-sm min-w-[120px]"
            />
          </label>
          <button onClick={() => addBulk(direction)} className="w-full sm:w-auto px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">Add</button>
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
              selected={selected.has(port.id)}
              onSelect={(e) => handlePortClick(port.id, e)}
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
      <h2 className="text-base font-semibold text-slate-900 mb-1">Ports</h2>
      <p className="text-xs text-slate-400 mb-4">Click to select, Ctrl+click to toggle, Shift+click for range</p>

      {/* Selection toolbar */}
      {selectedCount > 0 && (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-indigo-700">{selectedCount} port{selectedCount > 1 ? "s" : ""} selected</span>
            <button onClick={clearSelection} className="text-xs text-indigo-500 hover:text-indigo-700">Deselect all</button>
          </div>

          {/* Find & Replace */}
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <label className="text-xs">
              <span className="block text-indigo-600 mb-1">Find in labels</span>
              <input value={findText} onChange={(e) => setFindText(e.target.value)} className="w-full sm:w-32 px-2 py-1 rounded border border-indigo-200 text-sm" placeholder="IN" />
            </label>
            <label className="text-xs">
              <span className="block text-indigo-600 mb-1">Replace with</span>
              <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} className="w-full sm:w-32 px-2 py-1 rounded border border-indigo-200 text-sm" placeholder="XLR IN" />
            </label>
            <button onClick={applyFindReplace} disabled={!findText} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">Replace</button>
          </div>

          {/* Bulk property changes */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="block text-indigo-600 mb-1">Signal</span>
              <SearchableSelect<SignalType>
                value={"" as SignalType}
                onChange={(st) => { const updates: Partial<Port> = { signalType: st, connectorType: DEFAULT_CONNECTOR[st] }; if (!NETWORK_SIGNAL_TYPES.has(st)) updates.addressable = undefined; applyToSelected(updates); }}
                groups={SIGNAL_GROUPS}
                labels={SIGNAL_LABELS}
                placeholder="Change..."
                className="px-2 py-1 rounded border border-indigo-200 text-sm min-w-[100px]"
              />
            </label>
            <label className="text-xs">
              <span className="block text-indigo-600 mb-1">Connector</span>
              <SearchableSelect<ConnectorType>
                value={"" as ConnectorType}
                onChange={(ct) => applyToSelected({ connectorType: ct })}
                groups={CONNECTOR_GROUPS}
                labels={CONNECTOR_LABELS}
                placeholder="Change..."
                className="px-2 py-1 rounded border border-indigo-200 text-sm min-w-[100px]"
              />
            </label>
            <label className="text-xs">
              <span className="block text-indigo-600 mb-1">Direction</span>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { applyToSelected({ direction: e.target.value as PortDirection }); e.target.value = ""; } }} className="px-2 py-1 rounded border border-indigo-200 text-sm">
                <option value="" disabled>Change...</option>
                <option value="input">Input</option>
                <option value="output">Output</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </label>
            <button onClick={deleteSelected} className="px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700 transition-colors">Delete Selected</button>
          </div>
        </div>
      )}

      {renderSection("input", isPatchPanel ? "Rear" : "Inputs")}
      {renderSection("output", isPatchPanel ? "Front" : "Outputs")}
      {!isPatchPanel && renderSection("bidirectional", "Bidirectional")}
    </div>
  );
}
