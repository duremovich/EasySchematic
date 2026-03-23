import { useState, useMemo } from "react";
import { SIGNAL_LABELS, SIGNAL_COLORS, type SignalType } from "../types";
import { useSchematicStore } from "../store";

const ALL_SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];

export default function ViewOptionsPanel({ mobile, onClose }: { mobile?: boolean; onClose?: () => void } = {}) {
  const [collapsed, setCollapsed] = useState(true);
  const hiddenSignalTypesStr = useSchematicStore((s) => s.hiddenSignalTypes);
  const hideDeviceTypes = useSchematicStore((s) => s.hideDeviceTypes);
  const hideUnconnectedPorts = useSchematicStore((s) => s.hideUnconnectedPorts);
  const toggleSignalTypeVisibility = useSchematicStore((s) => s.toggleSignalTypeVisibility);
  const setHideDeviceTypes = useSchematicStore((s) => s.setHideDeviceTypes);
  const setHideUnconnectedPorts = useSchematicStore((s) => s.setHideUnconnectedPorts);
  const showLineJumps = useSchematicStore((s) => s.showLineJumps);
  const setShowLineJumps = useSchematicStore((s) => s.setShowLineJumps);
  const showConnectionLabels = useSchematicStore((s) => s.showConnectionLabels);
  const setShowConnectionLabels = useSchematicStore((s) => s.setShowConnectionLabels);
  const showAllSignalTypes = useSchematicStore((s) => s.showAllSignalTypes);

  const hiddenSet = useMemo(
    () => (hiddenSignalTypesStr ? new Set(hiddenSignalTypesStr.split(",")) : new Set<string>()),
    [hiddenSignalTypesStr],
  );

  const anyHidden = hiddenSet.size > 0;

  if (!mobile && collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col items-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="View options"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
        <div
          className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          View
        </div>
      </div>
    );
  }

  return (
    <div className={`${mobile ? "w-full" : "w-48"} bg-[var(--color-surface)] ${mobile ? "" : "border-l"} border-[var(--color-border)] flex flex-col h-full overflow-hidden`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          View Options
        </h2>
        <button
          onClick={() => mobile ? onClose?.() : setCollapsed(true)}
          className="cursor-pointer hover:bg-[var(--color-surface-hover)] rounded p-0.5 transition-colors"
          title={mobile ? "Close" : "Collapse"}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d={mobile ? "M4 4l8 8M12 4l-8 8" : "M6 3l5 5-5 5"} />
          </svg>
        </button>
      </div>

      {/* Ports + Signal Types */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Ports
        </div>
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
          <input
            type="checkbox"
            checked={hideUnconnectedPorts}
            onChange={(e) => setHideUnconnectedPorts(e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Hide unconnected ports</span>
        </label>

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-2" />

        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Signal Types
        </div>
        {ALL_SIGNAL_TYPES.map((type) => (
          <label
            key={type}
            className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            <input
              type="checkbox"
              checked={!hiddenSet.has(type)}
              onChange={() => toggleSignalTypeVisibility(type)}
              className="w-3 h-3 accent-blue-500 cursor-pointer"
            />
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: SIGNAL_COLORS[type] }}
            />
            <span className="text-xs text-[var(--color-text)] flex-1 truncate">
              {SIGNAL_LABELS[type]}
            </span>
          </label>
        ))}

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-2" />

        {/* Labels section */}
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Labels
        </div>
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
          <input
            type="checkbox"
            checked={!hideDeviceTypes}
            onChange={(e) => setHideDeviceTypes(!e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Show device types</span>
        </label>

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-2" />

        {/* Connections */}
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Connections
        </div>
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
          <input
            type="checkbox"
            checked={showLineJumps}
            onChange={(e) => setShowLineJumps(e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Show line jumps at crossings</span>
        </label>
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
          <input
            type="checkbox"
            checked={showConnectionLabels}
            onChange={(e) => setShowConnectionLabels(e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Show cable IDs on connections</span>
        </label>

      </div>

      {/* Show All button */}
      {anyHidden && (
        <div className="px-2 py-2 border-t border-[var(--color-border)]">
          <button
            onClick={showAllSignalTypes}
            className="w-full text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer py-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Show all signal types
          </button>
        </div>
      )}
    </div>
  );
}
