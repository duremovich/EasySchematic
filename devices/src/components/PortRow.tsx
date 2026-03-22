import type { Port, SignalType, ConnectorType } from "../../../src/types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "../../../src/types";

const NETWORK_SIGNAL_TYPES = new Set(["ethernet", "ndi", "dante", "srt", "hdbaset"]);

const SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];
const CONNECTOR_TYPES = Object.keys(CONNECTOR_LABELS) as ConnectorType[];

interface PortRowProps {
  port: Port;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onChange: (updates: Partial<Port>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export default function PortRow({ port, selected, onSelect, onChange, onRemove, onMoveUp, onMoveDown }: PortRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300"
          : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: `var(--color-${port.signalType})` }}
      />
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={port.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full sm:flex-1 sm:w-auto min-w-0 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Label"
        />
        <select
          value={port.signalType}
          onChange={(e) => onChange({ signalType: e.target.value as SignalType })}
          className="px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{SIGNAL_LABELS[s]}</option>)}
        </select>
        <select
          value={port.connectorType ?? "none"}
          onChange={(e) => onChange({ connectorType: e.target.value as ConnectorType })}
          className="px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {CONNECTOR_TYPES.map((c) => <option key={c} value={c}>{CONNECTOR_LABELS[c]}</option>)}
        </select>
        <input
          type="text"
          value={port.section ?? ""}
          onChange={(e) => onChange({ section: e.target.value || undefined })}
          className="w-full sm:w-24 px-2 py-1 rounded border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Section"
        />
        {NETWORK_SIGNAL_TYPES.has(port.signalType) && (
          <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap" title="Port has an IP address / network stack">
            <input
              type="checkbox"
              checked={port.addressable !== false}
              onChange={(e) => onChange({ addressable: e.target.checked ? undefined : false })}
              className="cursor-pointer"
            />
            Addr
          </label>
        )}
        <div className="flex flex-col">
          <button onClick={onMoveUp} className="text-slate-400 hover:text-slate-600 text-xs leading-none" title="Move up">&#9650;</button>
          <button onClick={onMoveDown} className="text-slate-400 hover:text-slate-600 text-xs leading-none" title="Move down">&#9660;</button>
        </div>
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-600 text-lg leading-none px-1 transition-colors"
          title="Remove port"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
