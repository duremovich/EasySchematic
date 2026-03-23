import { useState, useCallback, useEffect, useRef } from "react";
import { SIGNAL_LABELS, type SignalType } from "../types";
import {
  DEFAULT_SIGNAL_COLORS,
  applySignalColors,
  loadSignalColors,
  saveSignalColors,
} from "../signalColors";
import { useSchematicStore } from "../store";

const SIGNAL_TYPES = Object.keys(DEFAULT_SIGNAL_COLORS) as SignalType[];

export default function SignalColorPanel({ mobile, onClose }: { mobile?: boolean; onClose?: () => void } = {}) {
  const [collapsed, setCollapsed] = useState(true);
  const [colors, setColors] = useState<Record<SignalType, string>>(loadSignalColors);

  // Sync colors when schematic is loaded/imported
  // Serialize to string so the effect fires even when signalColors goes from object → undefined
  const storeColorsKey = useSchematicStore((s) =>
    s.signalColors ? JSON.stringify(s.signalColors) : "",
  );
  const hasInitialized = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- syncing store state to local state */
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return; // skip initial mount — local state is already correct
    }
    const merged = { ...DEFAULT_SIGNAL_COLORS, ...(storeColorsKey ? JSON.parse(storeColorsKey) : {}) };
    setColors(merged);
  }, [storeColorsKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateColor = useCallback((type: SignalType, color: string) => {
    setColors((prev) => {
      const next = { ...prev, [type]: color };
      document.documentElement.style.setProperty(`--color-${type}`, color);
      saveSignalColors(next);
      useSchematicStore.getState().setSignalColors(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const defaults = { ...DEFAULT_SIGNAL_COLORS };
    setColors(defaults);
    applySignalColors(defaults);
    saveSignalColors(defaults);
    useSchematicStore.getState().setSignalColors(defaults);
  }, []);

  if (!mobile && collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col items-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="Show signal colors"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
        <div
          className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          Colors
        </div>
      </div>
    );
  }

  return (
    <div className={`${mobile ? "w-full" : "w-48"} bg-[var(--color-surface)] ${mobile ? "" : "border-l"} border-[var(--color-border)] flex flex-col h-full overflow-hidden`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          Signal Colors
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

      {/* Color list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {SIGNAL_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer group">
            <input
              type="color"
              value={colors[type]}
              onChange={(e) => updateColor(type, e.target.value)}
              className="w-5 h-5 rounded cursor-pointer border border-[var(--color-border)] p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
            />
            <span className="text-xs text-[var(--color-text)] flex-1">{SIGNAL_LABELS[type]}</span>
            {colors[type] !== DEFAULT_SIGNAL_COLORS[type] && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  updateColor(type, DEFAULT_SIGNAL_COLORS[type]);
                }}
                className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-[10px] transition-opacity"
                title="Reset to default"
              >
                reset
              </button>
            )}
          </label>
        ))}
      </div>

      {/* Reset all */}
      <div className="px-2 py-2 border-t border-[var(--color-border)]">
        <button
          onClick={resetAll}
          className="w-full text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer py-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          Reset all to defaults
        </button>
      </div>
    </div>
  );
}
