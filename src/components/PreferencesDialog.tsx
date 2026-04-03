import { useState } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_SCROLL_CONFIG } from "../types";
import type { ScrollAction, ScrollConfig } from "../types";

const AUTOROUTE_PREF_KEY = "easyschematic-autoroute-pref";

const ACTION_LABELS: Record<ScrollAction, string> = {
  "zoom": "Zoom",
  "pan-x": "Pan left / right",
  "pan-y": "Pan up / down",
};

const ACTION_OPTIONS: ScrollAction[] = ["zoom", "pan-x", "pan-y"];

const selectClass =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none cursor-pointer w-[140px]";

function ScrollRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ScrollAction;
  onChange: (v: ScrollAction) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-[var(--color-text)]">{label}</span>
      <select
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value as ScrollAction)}
      >
        {ACTION_OPTIONS.map((a) => (
          <option key={a} value={a}>{ACTION_LABELS[a]}</option>
        ))}
      </select>
    </div>
  );
}

function SensitivityRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.25}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-[100px] accent-blue-600 cursor-pointer"
        />
        <span className="text-xs text-[var(--color-text-muted)] w-[32px] text-right">
          {value.toFixed(value % 1 === 0 ? 1 : 2)}x
        </span>
      </div>
    </div>
  );
}

export default function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const scrollConfig = useSchematicStore((s) => s.scrollConfig);
  const setScrollConfig = useSchematicStore((s) => s.setScrollConfig);
  const edgeHitboxSize = useSchematicStore((s) => s.edgeHitboxSize);
  const setEdgeHitboxSize = useSchematicStore((s) => s.setEdgeHitboxSize);
  const [autoRoutePref, setAutoRoutePref] = useState(
    () => localStorage.getItem(AUTOROUTE_PREF_KEY) ?? "ask",
  );

  const update = (patch: Partial<ScrollConfig>) =>
    setScrollConfig({ ...scrollConfig, ...patch });

  const isDefault =
    scrollConfig.scroll === DEFAULT_SCROLL_CONFIG.scroll &&
    scrollConfig.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll &&
    scrollConfig.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll &&
    scrollConfig.zoomSpeed === DEFAULT_SCROLL_CONFIG.zoomSpeed &&
    scrollConfig.panSpeed === DEFAULT_SCROLL_CONFIG.panSpeed &&
    scrollConfig.trackpadEnabled === DEFAULT_SCROLL_CONFIG.trackpadEnabled &&
    edgeHitboxSize === 10 &&
    autoRoutePref === "ask";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[420px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-heading)]">
            Preferences
          </span>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Scroll Wheel */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Scroll Wheel
            </div>
            <div className="space-y-0.5">
              <ScrollRow
                label="Scroll"
                value={scrollConfig.scroll}
                onChange={(v) => update({ scroll: v })}
              />
              <ScrollRow
                label="Shift + Scroll"
                value={scrollConfig.shiftScroll}
                onChange={(v) => update({ shiftScroll: v })}
              />
              <ScrollRow
                label="Ctrl + Scroll"
                value={scrollConfig.ctrlScroll}
                onChange={(v) => update({ ctrlScroll: v })}
              />
            </div>
          </div>

          {/* Sensitivity */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Sensitivity
            </div>
            <div className="space-y-0.5">
              <SensitivityRow
                label="Zoom speed"
                value={scrollConfig.zoomSpeed}
                onChange={(v) => update({ zoomSpeed: v })}
              />
              <SensitivityRow
                label="Pan speed"
                value={scrollConfig.panSpeed}
                onChange={(v) => update({ panSpeed: v })}
              />
            </div>
          </div>

          {/* Trackpad */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Trackpad
            </div>
            <label className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-xs text-[var(--color-text)]">Auto-detect trackpad</span>
              <input
                type="checkbox"
                checked={scrollConfig.trackpadEnabled}
                onChange={(e) => update({ trackpadEnabled: e.target.checked })}
                className="accent-blue-600 cursor-pointer"
              />
            </label>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              When off, all scroll input uses the scroll wheel settings above
            </p>
          </div>

          {/* Edge Interaction */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Edge Interaction
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-[var(--color-text)]">Connection hitbox width</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={4}
                  max={20}
                  step={2}
                  value={edgeHitboxSize}
                  onChange={(e) => setEdgeHitboxSize(Number(e.target.value))}
                  className="w-[100px] accent-blue-600 cursor-pointer"
                />
                <span className="text-xs text-[var(--color-text-muted)] w-[32px] text-right">
                  {edgeHitboxSize}px
                </span>
              </div>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              Smaller = easier to create new connections without selecting existing ones
            </p>
          </div>

          {/* Auto-Route */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Auto-Route
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-[var(--color-text)]">When disabling auto-route</span>
              <select
                className={selectClass}
                value={autoRoutePref}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "ask") localStorage.removeItem(AUTOROUTE_PREF_KEY);
                  else localStorage.setItem(AUTOROUTE_PREF_KEY, v);
                  setAutoRoutePref(v);
                }}
              >
                <option value="ask">Ask me</option>
                <option value="keep">Always keep routes</option>
                <option value="revert">Always restore previous</option>
              </select>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              Choose whether to keep auto-routed paths or revert to your previous routing
            </p>
          </div>

          {!isDefault && (
            <button
              onClick={() => {
                setScrollConfig({ ...DEFAULT_SCROLL_CONFIG });
                setEdgeHitboxSize(10);
                localStorage.removeItem(AUTOROUTE_PREF_KEY);
                setAutoRoutePref("ask");
              }}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              Reset to defaults
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
