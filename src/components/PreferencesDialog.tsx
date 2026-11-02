import { useEffect, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import { HEADER_COLOR_SWATCH_FALLBACK, resolveDefaultDeviceHeaderColor } from "../deviceHeaderColor";
import { DEFAULT_SCROLL_CONFIG, DEFAULT_STUB_LABEL_SHOW_ARROW, DEFAULT_STUB_LABEL_SHOW_PORT, DEFAULT_STUB_LABEL_PAGE_MODE, DEFAULT_STUB_LABEL_MODE, DEFAULT_CONNECTION_TYPE, PROJECT_STATUS_LABELS } from "../types";
import type { DefaultConnectionType, LabelCaseMode, PanMode, ProjectStatus, ScrollAction, ScrollConfig, StubLabelMode, StubLabelPageMode } from "../types";
import CustomTypesPanel from "./CustomTypesPanel";

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

/** How long the picker sits still before the chosen color is committed (#354). */
const COLOR_COMMIT_DELAY_MS = 250;

/** Header-color picker row (#354) — the same swatch + Reset pairing the device editor's
 *  header color picker uses, laid out as a preferences row. `undefined` = not set.
 *
 *  Dragging in the OS color wheel fires an event per frame, and committing the project
 *  override autosaves the whole document, so the swatch tracks the wheel from local state
 *  and only commits once the picker goes quiet, loses focus, or the row unmounts. */
function ColorRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | undefined;
  /** Swatch shown while nothing is set — the color that would apply anyway. */
  placeholder: string;
  onChange: (v: string | undefined) => void;
}) {
  // null = no uncommitted choice, so the swatch follows the setting itself.
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Read by the delayed commit and by the unmount cleanup, neither of which can see the
  // render they were scheduled from.
  const pending = useRef<{ draft: string | null; onChange: (v: string | undefined) => void }>({
    draft: null,
    onChange,
  });
  useEffect(() => {
    pending.current = { draft, onChange };
  });

  const commit = () => {
    clearTimeout(timer.current);
    const next = pending.current.draft;
    if (next === null) return;
    setDraft(null);
    pending.current.onChange(next);
  };

  // Closing the dialog mid-drag still keeps the color the user picked.
  useEffect(() => () => {
    clearTimeout(timer.current);
    const next = pending.current.draft;
    if (next !== null) pending.current.onChange(next);
  }, []);

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-[var(--color-text)]">{label}</span>
      <div className="flex items-center gap-2 w-[140px] justify-end">
        {(draft ?? value) ? (
          <button
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            onClick={() => {
              clearTimeout(timer.current);
              setDraft(null);
              onChange(undefined);
            }}
          >
            Reset
          </button>
        ) : (
          <span className="text-[10px] text-[var(--color-text-muted)]">Not set</span>
        )}
        <input
          type="color"
          className="w-6 h-6 rounded border border-[var(--color-border)] cursor-pointer p-0"
          value={draft ?? value ?? placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(commit, COLOR_COMMIT_DELAY_MS);
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
}

type PrefTab = "canvas" | "display" | "types" | "ai";

const TAB_LABELS: Record<PrefTab, string> = {
  canvas: "Canvas",
  display: "Display",
  types: "Custom types",
  ai: "AI (Beta)",
};

const MCP_STATUS_LABELS: Record<string, string> = {
  off: "Off",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Not connected",
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
  const status = useSchematicStore((s) => s.status);
  const setProjectStatus = useSchematicStore((s) => s.setProjectStatus);
  const panMode = useSchematicStore((s) => s.panMode);
  const setPanMode = useSchematicStore((s) => s.setPanMode);
  const stubLabelShowArrow = useSchematicStore((s) => s.stubLabelShowArrow);
  const setStubLabelShowArrow = useSchematicStore((s) => s.setStubLabelShowArrow);
  const stubLabelShowPort = useSchematicStore((s) => s.stubLabelShowPort);
  const setStubLabelShowPort = useSchematicStore((s) => s.setStubLabelShowPort);
  const stubLabelShowRoom = useSchematicStore((s) => s.stubLabelShowRoom);
  const setStubLabelShowRoom = useSchematicStore((s) => s.setStubLabelShowRoom);
  const stubLabelPageMode = useSchematicStore((s) => s.stubLabelPageMode);
  const setStubLabelPageMode = useSchematicStore((s) => s.setStubLabelPageMode);
  const appStubLabelMode = useSchematicStore((s) => s.appDefaultStubLabelMode);
  const setAppStubLabelMode = useSchematicStore((s) => s.setAppDefaultStubLabelMode);
  const projectStubLabelMode = useSchematicStore((s) => s.defaultStubLabelMode);
  const setProjectStubLabelMode = useSchematicStore((s) => s.setDefaultStubLabelMode);
  const defaultConnectionType = useSchematicStore((s) => s.defaultConnectionType);
  const setDefaultConnectionType = useSchematicStore((s) => s.setDefaultConnectionType);
  const useShortNames = useSchematicStore((s) => s.useShortNames);
  const setUseShortNames = useSchematicStore((s) => s.setUseShortNames);
  const wrapDeviceLabels = useSchematicStore((s) => s.wrapDeviceLabels);
  const setWrapDeviceLabels = useSchematicStore((s) => s.setWrapDeviceLabels);
  const appHeaderColor = useSchematicStore((s) => s.appDefaultDeviceHeaderColor);
  const setAppHeaderColor = useSchematicStore((s) => s.setAppDefaultDeviceHeaderColor);
  const projectHeaderColor = useSchematicStore((s) => s.defaultDeviceHeaderColor);
  const setProjectHeaderColor = useSchematicStore((s) => s.setDefaultDeviceHeaderColor);
  const mcpEnabled = useSchematicStore((s) => s.mcpBridgeEnabled);
  const setMcpEnabled = useSchematicStore((s) => s.setMcpBridgeEnabled);
  const mcpToken = useSchematicStore((s) => s.mcpBridgeToken);
  const setMcpToken = useSchematicStore((s) => s.setMcpBridgeToken);
  const mcpPort = useSchematicStore((s) => s.mcpBridgePort);
  const setMcpPort = useSchematicStore((s) => s.setMcpBridgePort);
  const mcpStatus = useSchematicStore((s) => s.mcpBridgeStatus);
  const mcpStatusDetail = useSchematicStore((s) => s.mcpBridgeStatusDetail);
  const [autoRoutePref, setAutoRoutePref] = useState(
    () => localStorage.getItem(AUTOROUTE_PREF_KEY) ?? "ask",
  );
  const [activeTab, setActiveTab] = useState<PrefTab>("canvas");

  const update = (patch: Partial<ScrollConfig>) =>
    setScrollConfig({ ...scrollConfig, ...patch });

  // Which of the two header-color settings a device placed right now would take (#354).
  const effectiveHeaderColor = resolveDefaultDeviceHeaderColor(projectHeaderColor, appHeaderColor);

  const isDefault =
    scrollConfig.scroll === DEFAULT_SCROLL_CONFIG.scroll &&
    scrollConfig.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll &&
    scrollConfig.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll &&
    scrollConfig.zoomSpeed === DEFAULT_SCROLL_CONFIG.zoomSpeed &&
    scrollConfig.panSpeed === DEFAULT_SCROLL_CONFIG.panSpeed &&
    scrollConfig.trackpadEnabled === DEFAULT_SCROLL_CONFIG.trackpadEnabled &&
    edgeHitboxSize === 10 &&
    autoRoutePref === "ask" &&
    labelCase === "as-typed" &&
    currency === "USD" &&
    panMode === "select-first" &&
    stubLabelShowArrow === DEFAULT_STUB_LABEL_SHOW_ARROW &&
    stubLabelShowPort === DEFAULT_STUB_LABEL_SHOW_PORT &&
    stubLabelPageMode === DEFAULT_STUB_LABEL_PAGE_MODE &&
    defaultConnectionType === DEFAULT_CONNECTION_TYPE &&
    // The per-project override is document data (like the project status), so it is not
    // part of "reset preferences" — only the app-level default header color is (#354).
    appHeaderColor === undefined &&
    // Same split for the default stub tag mode: only the app preference resets (#377).
    appStubLabelMode === DEFAULT_STUB_LABEL_MODE;

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

              {/* New Connections */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  New Connections
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Draw new connections as</span>
                  <select
                    className={selectClass}
                    value={defaultConnectionType}
                    onChange={(e) => setDefaultConnectionType(e.target.value as DefaultConnectionType)}
                  >
                    <option value="wire">Wire</option>
                    <option value="stub">Stub</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Stub creates each new connection already stubbed at both ends, the same as right-clicking it and choosing Stub Connection. Existing connections are left alone, and connections through an auto-inserted adapter stay wires.
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
                  Display style for device, port, room, slot, and card labels on the canvas and in exports. Doesn't modify your data — switch back to As-typed any time to see original casing.
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

              {/* Device header color (#354) */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Device header color
                </div>
                <ColorRow
                  label="Default for new devices"
                  value={appHeaderColor}
                  placeholder={HEADER_COLOR_SWATCH_FALLBACK}
                  onChange={setAppHeaderColor}
                />
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Header bar color given to every device you place from here on, in this and
                  every other project on this computer. Not set = the standard header color.
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  This is the device's header color everywhere it is drawn, not just on the
                  canvas: it also overrides the device's own color in the rack elevation, the
                  rack SVG and PDF, the face plate editor, and the DXF export. Set it and every
                  new device shares one color in those views instead of being colored by device
                  type — leave it unset, or clear a device's header color in the device editor,
                  to keep that color coding.
                </p>
                <div className="mt-2">
                  <ColorRow
                    label="This project only"
                    value={projectHeaderColor}
                    placeholder={appHeaderColor ?? HEADER_COLOR_SWATCH_FALLBACK}
                    onChange={setProjectHeaderColor}
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Overrides the default above for this schematic, and is saved in the schematic
                  file so it travels with it. Devices already on the canvas keep their own
                  colors either way — change one from the device editor's header color picker.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    New devices here get
                  </span>
                  <span
                    className="w-4 h-4 shrink-0 rounded border border-[var(--color-border)]"
                    style={{ backgroundColor: effectiveHeaderColor ?? "var(--color-surface)" }}
                  />
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {effectiveHeaderColor
                      ? projectHeaderColor
                        ? `${effectiveHeaderColor} (this project)`
                        : `${effectiveHeaderColor} (app default)`
                      : "the standard header color"}
                  </span>
                </div>
              </div>

              {/* Stub labels */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Stub labels
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Show direction arrow on stub labels</span>
                  <input
                    type="checkbox"
                    checked={stubLabelShowArrow}
                    onChange={(e) => setStubLabelShowArrow(e.target.checked)}
                    className="cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Prefixes each stub label with an arrow pointing toward the far end (e.g. <code className="text-[10px]">→ Projector</code>). Off by default — the destination name already says where the connection goes.
                </p>
                <div className="flex items-center justify-between py-1 mt-2">
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
                  Adds the destination room (e.g. <code className="text-[10px]">(Server Room)</code>) after the device name on stubbed connections, when the far device is in a different room. A tag between two devices in the same room leaves the room off unless you right-click it and set Show room to On.
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
                {/* Default stub tag mode (#377) — same app + project pair as the header color (#354) */}
                <div className="flex items-center justify-between py-1 mt-2">
                  <span className="text-xs text-[var(--color-text)]">Tag text for new stubs</span>
                  <select
                    className={selectClass}
                    value={appStubLabelMode}
                    onChange={(e) => setAppStubLabelMode(e.target.value as StubLabelMode)}
                  >
                    <option value="full">Destination</option>
                    <option value="cableId">Cable ID only</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  What both tags of a connection show when you stub it, in this and every other project on this computer. Destination names the far device; Cable ID only shows just the cable ID.
                </p>
                <div className="flex items-center justify-between py-1 mt-2">
                  <span className="text-xs text-[var(--color-text)]">This project only</span>
                  <select
                    className={selectClass}
                    value={projectStubLabelMode ?? ""}
                    onChange={(e) =>
                      setProjectStubLabelMode(e.target.value === "" ? undefined : (e.target.value as StubLabelMode))
                    }
                  >
                    <option value="">Use default</option>
                    <option value="full">Destination</option>
                    <option value="cableId">Cable ID only</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Overrides the default above for this schematic, and is saved in the schematic file. Stub tags already on the canvas keep their tag text either way; right-click a tag to switch it, and its partner tag at the other end switches with it.
                </p>
              </div>

              {/* Project */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Project
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--color-text)]">Status</span>
                  <select
                    className={selectClass}
                    value={status ?? ""}
                    onChange={(e) =>
                      setProjectStatus(e.target.value === "" ? undefined : (e.target.value as ProjectStatus))
                    }
                  >
                    <option value="">Active (default)</option>
                    {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((key) => (
                      <option key={key} value={key}>
                        {PROJECT_STATUS_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Lifecycle status for this project. Stored in the file and shown in project metadata.
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
                    <option value="AED">AED — United Arab Emirates Dirham (د.إ)</option>
                  </select>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Symbol used for cost fields in reports. All entered costs are assumed to be in this currency — no conversion is applied.
                </p>
              </div>
            </>
          )}

          {activeTab === "types" && <CustomTypesPanel />}

          {activeTab === "ai" && (
            <>
              {/* AI Assistant (MCP) — Beta */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  AI Assistant (MCP) — Beta
                </div>
                <label className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-xs text-[var(--color-text)]">Let Claude read &amp; edit this schematic</span>
                  <input
                    type="checkbox"
                    checked={mcpEnabled}
                    onChange={(e) => setMcpEnabled(e.target.checked)}
                    className="cursor-pointer accent-blue-600"
                  />
                </label>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Connects this tab to the EasySchematic MCP server running on your computer, so an AI assistant (Claude) can add devices, set properties, and make connections live. Off by default; your drawing is only reachable while this is on.
                </p>

                <div className="flex items-center justify-between py-1 mt-3">
                  <span className="text-xs text-[var(--color-text)]">Pairing token</span>
                  <input
                    type="password"
                    value={mcpToken}
                    onChange={(e) => setMcpToken(e.target.value)}
                    placeholder="Paste from the server"
                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none w-[180px]"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Copy the token the MCP server prints on startup and paste it here. This stops other programs on your computer from reaching the bridge.
                </p>

                <div className="flex items-center justify-between py-1 mt-3">
                  <span className="text-xs text-[var(--color-text)]">Server port</span>
                  <input
                    type="number"
                    value={mcpPort}
                    onChange={(e) => setMcpPort(Number(e.target.value) || mcpPort)}
                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none w-[100px]"
                  />
                </div>

                <div className="flex items-center justify-between py-1 mt-3">
                  <span className="text-xs text-[var(--color-text)]">Status</span>
                  <span
                    className={`text-xs font-medium ${
                      mcpStatus === "connected"
                        ? "text-green-600"
                        : mcpStatus === "error"
                          ? "text-red-600"
                          : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {MCP_STATUS_LABELS[mcpStatus] ?? mcpStatus}
                  </span>
                </div>
                {mcpStatusDetail && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{mcpStatusDetail}</p>
                )}
                <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
                  Setup help is in the docs under “AI Assistant (MCP)”. This is an early Beta — only a core set of actions is supported.
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
                setEdgeHitboxSize(10);
                localStorage.removeItem(AUTOROUTE_PREF_KEY);
                setAutoRoutePref("ask");
                setLabelCase("as-typed");
                setCurrency("USD");
                setPanMode("select-first");
                setStubLabelShowArrow(DEFAULT_STUB_LABEL_SHOW_ARROW);
                setStubLabelShowPort(DEFAULT_STUB_LABEL_SHOW_PORT);
                setStubLabelPageMode(DEFAULT_STUB_LABEL_PAGE_MODE);
                setDefaultConnectionType(DEFAULT_CONNECTION_TYPE);
                setAppHeaderColor(undefined);
                setAppStubLabelMode(DEFAULT_STUB_LABEL_MODE);
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
