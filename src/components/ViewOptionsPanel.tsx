import { useState, useMemo, useRef, useCallback } from "react";
import { SIGNAL_LABELS, SIGNAL_COLORS, LINE_STYLE_DASHARRAY, type SignalType, type LineStyle, type Port } from "../types";
import { useSchematicStore } from "../store";
import { DEFAULT_SIGNAL_COLORS, loadSignalColors } from "../signalColors";

const ALL_SIGNAL_TYPES = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort(
  (a, b) => SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);
const LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted", "dash-dot"];
const LINE_STYLE_TIPS: Record<LineStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  "dash-dot": "Dash-Dot",
};

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
  const showCableIdLabels = useSchematicStore((s) => s.showCableIdLabels);
  const setShowCableIdLabels = useSchematicStore((s) => s.setShowCableIdLabels);
  const showCustomLabels = useSchematicStore((s) => s.showCustomLabels);
  const setShowCustomLabels = useSchematicStore((s) => s.setShowCustomLabels);
  const cableIdGap = useSchematicStore((s) => s.cableIdGap);
  const setCableIdGap = useSchematicStore((s) => s.setCableIdGap);
  const customLabelGap = useSchematicStore((s) => s.customLabelGap);
  const setCustomLabelGap = useSchematicStore((s) => s.setCustomLabelGap);
  const cableIdMidOffset = useSchematicStore((s) => s.cableIdMidOffset);
  const setCableIdMidOffset = useSchematicStore((s) => s.setCableIdMidOffset);
  const customLabelMidOffset = useSchematicStore((s) => s.customLabelMidOffset);
  const setCustomLabelMidOffset = useSchematicStore((s) => s.setCustomLabelMidOffset);
  const cableIdLabelMode = useSchematicStore((s) => s.cableIdLabelMode);
  const setCableIdLabelMode = useSchematicStore((s) => s.setCableIdLabelMode);
  const customLabelMode = useSchematicStore((s) => s.customLabelMode);
  const setCustomLabelMode = useSchematicStore((s) => s.setCustomLabelMode);
  const hideAdapters = useSchematicStore((s) => s.hideAdapters);
  const setHideAdapters = useSchematicStore((s) => s.setHideAdapters);
  const showAllSignalTypes = useSchematicStore((s) => s.showAllSignalTypes);
  const setSignalColors = useSchematicStore((s) => s.setSignalColors);
  const signalLineStyles = useSchematicStore((s) => s.signalLineStyles);
  const setSignalLineStyles = useSchematicStore((s) => s.setSignalLineStyles);
  const signalColors = useSchematicStore((s) => s.signalColors);

  // Compute which signal types are actually used in the current schematic
  const usedSignalTypesStr = useSchematicStore((s) => {
    const used = new Set<string>();
    for (const node of s.nodes) {
      const ports = (node.data as Record<string, unknown>)?.ports as Port[] | undefined;
      if (ports) {
        for (const port of ports) {
          if (port.signalType) used.add(port.signalType);
        }
      }
    }
    for (const edge of s.edges) {
      if (edge.data?.signalType) used.add(edge.data.signalType);
    }
    return [...used].sort().join(",");
  });

  const usedSignalTypes = useMemo(
    () => new Set(usedSignalTypesStr ? usedSignalTypesStr.split(",") : []),
    [usedSignalTypesStr],
  );

  const [showFullList, setShowFullList] = useState(false);

  const displayedSignalTypes = useMemo(
    () => showFullList
      ? ALL_SIGNAL_TYPES
      : ALL_SIGNAL_TYPES.filter((t) => usedSignalTypes.has(t)),
    [showFullList, usedSignalTypes],
  );

  const hiddenSet = useMemo(
    () => (hiddenSignalTypesStr ? new Set(hiddenSignalTypesStr.split(",")) : new Set<string>()),
    [hiddenSignalTypesStr],
  );

  const anyHidden = hiddenSet.size > 0;
  const hasCustomizations = !!(signalColors && Object.keys(signalColors).length > 0) ||
    !!(signalLineStyles && Object.keys(signalLineStyles).length > 0);

  // Color picker ref — shared across rows, opened programmatically
  const colorInputRef = useRef<HTMLInputElement>(null);
  const colorTargetRef = useRef<SignalType | null>(null);

  const handleColorClick = useCallback((type: SignalType, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!colorInputRef.current) return;
    colorTargetRef.current = type;
    // Get current computed color for this signal type
    const computed = getComputedStyle(document.documentElement).getPropertyValue(`--color-${type}`).trim();
    colorInputRef.current.value = computed || DEFAULT_SIGNAL_COLORS[type];
    colorInputRef.current.click();
  }, []);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const type = colorTargetRef.current;
    if (!type) return;
    const currentColors = loadSignalColors();
    currentColors[type] = e.target.value;
    setSignalColors(currentColors);
  }, [setSignalColors]);

  const handleLineStyleClick = useCallback((type: SignalType, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const current = signalLineStyles?.[type] ?? "solid";
    const idx = LINE_STYLES.indexOf(current);
    const next = LINE_STYLES[(idx + 1) % LINE_STYLES.length];
    const updated = { ...signalLineStyles, [type]: next };
    setSignalLineStyles(updated);
  }, [signalLineStyles, setSignalLineStyles]);

  const handleReset = useCallback(() => {
    setSignalColors({ ...DEFAULT_SIGNAL_COLORS });
    setSignalLineStyles({});
  }, [setSignalColors, setSignalLineStyles]);

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
      {/* Hidden color picker input */}
      <input
        ref={colorInputRef}
        type="color"
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        onChange={handleColorChange}
      />

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

        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Signal Types
          </div>
          <div className="flex items-center gap-1">
            {hasCustomizations && (
              <button
                onClick={handleReset}
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                title="Reset colors and line styles to defaults"
              >
                Reset
              </button>
            )}
            {hasCustomizations && usedSignalTypes.size < ALL_SIGNAL_TYPES.length && (
              <span className="text-[var(--color-text-muted)] text-[8px]">|</span>
            )}
            {usedSignalTypes.size < ALL_SIGNAL_TYPES.length && (
              <button
                onClick={() => setShowFullList((v) => !v)}
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              >
                {showFullList ? "Used only" : `All (${ALL_SIGNAL_TYPES.length})`}
              </button>
            )}
          </div>
        </div>
        {displayedSignalTypes.length === 0 ? (
          <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-1">
            No signal types in schematic
          </div>
        ) : (
          displayedSignalTypes.map((type) => {
            const ls = signalLineStyles?.[type] ?? "solid";
            return (
              <div
                key={type}
                className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)]"
              >
                <input
                  type="checkbox"
                  checked={!hiddenSet.has(type)}
                  onChange={() => toggleSignalTypeVisibility(type)}
                  className="w-3 h-3 accent-blue-500 cursor-pointer shrink-0"
                />
                <button
                  className="w-2.5 h-2.5 rounded-full shrink-0 cursor-pointer border border-transparent hover:border-[var(--color-text-muted)] transition-colors"
                  style={{ background: SIGNAL_COLORS[type] }}
                  onClick={(e) => handleColorClick(type, e)}
                  title="Change color"
                />
                <span className="text-xs text-[var(--color-text)] flex-1 truncate">
                  {SIGNAL_LABELS[type]}
                </span>
                <button
                  className="shrink-0 cursor-pointer rounded hover:bg-[var(--color-surface)] p-0.5 transition-colors"
                  onClick={(e) => handleLineStyleClick(type, e)}
                  title={`Line style: ${LINE_STYLE_TIPS[ls]} (click to cycle)`}
                >
                  <svg width="16" height="6" className="block">
                    <line
                      x1="0" y1="3" x2="16" y2="3"
                      stroke={SIGNAL_COLORS[type]}
                      strokeWidth="2"
                      strokeDasharray={LINE_STYLE_DASHARRAY[ls] ?? "none"}
                    />
                  </svg>
                </button>
              </div>
            );
          })
        )}

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
            checked={showCableIdLabels}
            onChange={(e) => setShowCableIdLabels(e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Show cable IDs</span>
        </label>
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
          <input
            type="checkbox"
            checked={showCustomLabels}
            onChange={(e) => setShowCustomLabels(e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Show custom labels</span>
        </label>
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-xs text-[var(--color-text)]">Cable ID position</span>
          <select
            value={cableIdLabelMode}
            onChange={(e) => setCableIdLabelMode(e.target.value as "endpoint" | "midpoint")}
            className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[var(--color-text)] cursor-pointer"
          >
            <option value="endpoint">At endpoints</option>
            <option value="midpoint">At midpoint</option>
          </select>
        </div>
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-xs text-[var(--color-text)]">
            {cableIdLabelMode === "endpoint" ? "Cable ID spacing" : "Cable ID offset"}
          </span>
          <input
            type="range"
            min={cableIdLabelMode === "endpoint" ? 1 : -100}
            max={cableIdLabelMode === "endpoint" ? 40 : 100}
            step={1}
            value={cableIdLabelMode === "endpoint" ? cableIdGap : cableIdMidOffset}
            onChange={(e) => cableIdLabelMode === "endpoint"
              ? setCableIdGap(Number(e.target.value))
              : setCableIdMidOffset(Number(e.target.value))
            }
            className="w-16 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-[10px] text-[var(--color-text-muted)] w-5 text-right">
            {cableIdLabelMode === "endpoint" ? cableIdGap : cableIdMidOffset}
          </span>
        </div>
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-xs text-[var(--color-text)]">Custom label position</span>
          <select
            value={customLabelMode}
            onChange={(e) => setCustomLabelMode(e.target.value as "endpoint" | "midpoint")}
            className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[var(--color-text)] cursor-pointer"
          >
            <option value="endpoint">At endpoints</option>
            <option value="midpoint">At midpoint</option>
          </select>
        </div>
        <div className="flex items-center gap-2 px-1 py-0.5">
          <span className="text-xs text-[var(--color-text)]">
            {customLabelMode === "endpoint" ? "Custom label spacing" : "Custom label offset"}
          </span>
          <input
            type="range"
            min={customLabelMode === "endpoint" ? 1 : -100}
            max={customLabelMode === "endpoint" ? 40 : 100}
            step={1}
            value={customLabelMode === "endpoint" ? customLabelGap : customLabelMidOffset}
            onChange={(e) => customLabelMode === "endpoint"
              ? setCustomLabelGap(Number(e.target.value))
              : setCustomLabelMidOffset(Number(e.target.value))
            }
            className="w-16 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-[10px] text-[var(--color-text-muted)] w-5 text-right">
            {customLabelMode === "endpoint" ? customLabelGap : customLabelMidOffset}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-2" />

        {/* Adapters */}
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          Adapters
        </div>
        <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer">
          <input
            type="checkbox"
            checked={hideAdapters}
            onChange={(e) => setHideAdapters(e.target.checked)}
            className="w-3 h-3 accent-blue-500 cursor-pointer"
          />
          <span className="text-xs text-[var(--color-text)]">Hide all adapters</span>
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
