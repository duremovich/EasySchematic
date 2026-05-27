import { useState } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_SCROLL_CONFIG, DEFAULT_STUB_LABEL_SHOW_PORT, DEFAULT_STUB_LABEL_PAGE_MODE } from "../types";
import type { LabelCaseMode, PanMode, ScrollAction, ScrollConfig, StubLabelPageMode } from "../types";
import {
  DEFAULT_NAVIGATION_INPUT_DEVICE,
  getNavigationInputDevice,
  saveNavigationInputDevice,
  type NavigationInputDevice,
} from "../navigationPreferences";

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

type PrefTab = "canvas" | "display";

const TAB_LABELS: Record<PrefTab, string> = {
  canvas: "Canvas",
  display: "Display",
};

export default function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const scrollConfig = useSchematicStore((s) => s.scrollConfig);
  const setScrollConfig = useSchematicStore((s) => s.setScrollConfig);
  const edgeHitboxSize = useSchematicStore((s) => s.edgeHitboxSize);
  const setEdgeHitboxSize = useSchematicStore((s) => s.setEdgeHitboxSize);
  const labelCase = useSchematicStore((s) => s.labelCase);
  const setLabelCase = useSchematicStore((s) => s.setLabelCase);
  const currency = useSchematicStore((s) => s.currency);
  const setCurrency = useSchematicStore((s) => s.setCurrency);
  const panMode = useSchematicStore((s) => s.panMode);
  const setPanMode = useSchematicStore((s) => s.setPanMode);
  const stubLabelShowPort = useSchematicStore((s) => s.stubLabelShowPort);
  const setStubLabelShowPort = useSchematicStore((s) => s.setStubLabelShowPort);
  const stubLabelShowRoom = useSchematicStore((s) => s.stubLabelShowRoom);
  const setStubLabelShowRoom = useSchematicStore((s) => s.setStubLabelShowRoom);
  const stubLabelPageMode = useSchematicStore((s) => s.stubLabelPageMode);
  const setStubLabelPageMode = useSchematicStore((s) => s.setStubLabelPageMode);
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const setUseShortNames = useSchematicStore((s) => s.setUseShortNames);
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const setWrapDeviceLabels = useSchematicStore((s) => s.setWrapDeviceLabels);
  const [autoRoutePref, setAutoRoutePref] = useState(
    () => localStorage.getItem(AUTOROUTE_PREF_KEY) ?? "ask",
  );
  const [navigationInputDevice, setNavigationInputDevice] = useState(getNavigationInputDevice);
  const [activeTab, setActiveTab] = useState<PrefTab>("canvas");

  const update = (patch: Partial<ScrollConfig>) =>
    setScrollConfig({ ...scrollConfig, ...patch });

  const isDefault =
    scrollConfig.scroll === DEFAULT_SCROLL_CONFIG.scroll &&
    scrollConfig.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll &&
    scrollConfig.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll &&
    scrollConfig.zoomSpeed === DEFAULT_SCROLL_CONFIG.zoomSpeed &&
    scrollConfig.panSpeed === DEFAULT_SCROLL_CONFIG.panSpeed &&
    navigationInputDevice === DEFAULT_NAVIGATION_INPUT_DEVICE &&
    edgeHitboxSize === 10 &&
    autoRoutePref === "ask" &&
    labelCase === "as-typed" &&
    currency === "USD" &&
    panMode === "select-first" &&
    stubLabelShowPort === DEFAULT_STUB_LABEL_SHOW_PORT &&
    stubLabelPageMode === DEFAULT_STUB_LABEL_PAGE_MODE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[420px] flex flex-col max-h-[calc(100vh-4rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] shrink-0">
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

        {/* Tab strip */}
        <div className="flex border-b border-[var(--color-border)] px-5 shrink-0">
          {(Object.keys(TAB_LABELS) as PrefTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {activeTab === "canvas" && (
            <>
              {/* Navigation */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Navigation
                </div>
                <div className="space-y-0.5">
                  {/* Configurable row */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--color-text)]">Left drag</span>
                    <select
                      className={selectClass}
                      value={panMode}
                      onChange={(e) => setPanMode(e.target.value as PanMode)}
                    >
                      <option value="select-first">Selection box</option>
                      <option value="pan-first">Pan canvas</option>
                    </select>
                  </div>
                  {/* Fixed / derived rows */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--color-text)]">Shift + left drag</span>
                    <span className="text-xs text-[var(--color-text-muted)] w-[140px] text-right">
                      {panMode === "pan-first" ? "Selection box" : "Add to selection"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--color-text)]">Middle drag</span>
                    <span className="text-xs text-[var(--color-text-muted)] w-[140px] text-right">Pan canvas</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--color-text)]">Space + drag</span>
                    <span className="text-xs text-[var(--color-text-muted)] w-[140px] text-right">Pan canvas</span>
                  </div>
                </div>
              </div>

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

              {/* Input Device */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Input Device
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Navigation input</span>
                  <select
                    className={selectClass}
                    value={navigationInputDevice}
                    onChange={(e) => {
                      const value = e.target.value as NavigationInputDevice;
                      saveNavigationInputDevice(value);
                      setNavigationInputDevice(value);
                    }}
                  >
                    <option value="auto">Automatic</option>
                    <option value="mouse">Mouse wheel</option>
                    <option value="trackpad">Trackpad</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Trackpad mode makes two-finger movement pan immediately and pinch zoom. Automatic preserves existing detection. This preference is saved in this browser.
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
            </>
          )}

          {activeTab === "display" && (
            <>
              {/* Labels */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Labels
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Display label case</span>
                  <select
                    className={selectClass}
                    value={labelCase}
                    onChange={(e) => setLabelCase(e.target.value as LabelCaseMode)}
                  >
                    <option value="as-typed">As-typed</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="capitalize">Capitalize Words</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Display style for device, port, slot, and card labels on the canvas and in exports. Doesn't modify your data — switch back to As-typed any time to see original casing.
                </p>
                <div className="flex items-center justify-between py-1 mt-2">
                  <span className="text-xs text-[var(--color-text)]">Use short device names</span>
                  <input
                    type="checkbox"
                    checked={useShortNames}
                    onChange={(e) => setUseShortNames(e.target.checked)}
                    className="cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Render device labels using a more compact identifier when available — curated short name first, then model number, falling back to the full label. Per-device override available in the device editor.
                </p>
                <div className="flex items-center justify-between py-1 mt-2">
                  <span className="text-xs text-[var(--color-text)]">Wrap device labels</span>
                  <input
                    type="checkbox"
                    checked={wrapDeviceLabels}
                    onChange={(e) => setWrapDeviceLabels(e.target.checked)}
                    className="cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Allow long device labels to wrap onto a second line on the schematic and rack views, instead of truncating with an ellipsis.
                </p>
              </div>

              {/* Stub labels */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Stub labels
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Show port name on stub labels</span>
                  <input
                    type="checkbox"
                    checked={stubLabelShowPort}
                    onChange={(e) => setStubLabelShowPort(e.target.checked)}
                    className="cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Adds the destination port (e.g. <code className="text-[10px]">[HDMI In 1]</code>) after the device name on stubbed connections.
                </p>
                <div className="flex items-center justify-between py-1 mt-2">
                  <span className="text-xs text-[var(--color-text)]">Show room name on stub labels</span>
                  <input
                    type="checkbox"
                    checked={stubLabelShowRoom}
                    onChange={(e) => setStubLabelShowRoom(e.target.checked)}
                    className="cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Adds the destination room (e.g. <code className="text-[10px]">(Server Room)</code>) after the device name on stubbed connections. Per-stub overrides via right-click on the label.
                </p>
                <div className="flex items-center justify-between py-1 mt-2">
                  <span className="text-xs text-[var(--color-text)]">Page number on stub labels</span>
                  <select
                    className={selectClass}
                    value={stubLabelPageMode}
                    onChange={(e) => setStubLabelPageMode(e.target.value as StubLabelPageMode)}
                  >
                    <option value="cross-page">Cross-page only</option>
                    <option value="always">Always</option>
                    <option value="never">Never</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  When to display the destination page on stub labels. Cross-page only suppresses the tag when both ends are on the same printed page.
                </p>
              </div>

              {/* Costs */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Costs
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Currency</span>
                  <select
                    className={selectClass}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="USD">USD — US Dollar ($)</option>
                    <option value="GBP">GBP — British Pound (£)</option>
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="CAD">CAD — Canadian Dollar (CA$)</option>
                    <option value="AUD">AUD — Australian Dollar (A$)</option>
                    <option value="JPY">JPY — Japanese Yen (¥)</option>
                    <option value="NZD">NZD — New Zealand Dollar (NZ$)</option>
                    <option value="CHF">CHF — Swiss Franc (CHF)</option>
                    <option value="SEK">SEK — Swedish Krona (kr)</option>
                    <option value="NOK">NOK — Norwegian Krone (kr)</option>
                    <option value="DKK">DKK — Danish Krone (kr.)</option>
                    <option value="CNY">CNY — Chinese Yuan (¥)</option>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Symbol used for cost fields in reports. All entered costs are assumed to be in this currency — no conversion is applied.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] shrink-0">
          {!isDefault ? (
            <button
              onClick={() => {
                setScrollConfig({ ...DEFAULT_SCROLL_CONFIG });
                saveNavigationInputDevice(DEFAULT_NAVIGATION_INPUT_DEVICE);
                setNavigationInputDevice(DEFAULT_NAVIGATION_INPUT_DEVICE);
                setEdgeHitboxSize(10);
                localStorage.removeItem(AUTOROUTE_PREF_KEY);
                setAutoRoutePref("ask");
                setLabelCase("as-typed");
                setCurrency("USD");
                setPanMode("select-first");
                setStubLabelShowPort(DEFAULT_STUB_LABEL_SHOW_PORT);
                setStubLabelPageMode(DEFAULT_STUB_LABEL_PAGE_MODE);
              }}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              Reset to defaults
            </button>
          ) : (
            <span />
          )}
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
