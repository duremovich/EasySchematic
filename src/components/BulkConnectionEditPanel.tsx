import { useState, useMemo } from "react";

import { useSchematicStore } from "../store";
import { LINE_STYLE_LABELS, LINE_STYLE_DASHARRAY, type LineStyle } from "../types";
import { generateIncrementingLabelSeries } from "../spreadsheet/fillSeries";

const LINE_STYLES: LineStyle[] = ["solid", "dashed", "dotted", "dash-dot"];

interface Props {
  onClose: () => void;
}

export default function BulkConnectionEditPanel({ onClose }: Props) {
  // Serialize to a stable string — avoids the "new array ref every tick" infinite-loop
  // trap. Include relevant data fields so the panel reflects applied patches.
  const selectionKey = useSchematicStore((s) =>
    s.edges
      .filter((e) => e.selected)
      .map(
        (e) =>
          `${e.id}:${e.data?.lineStyle ?? ""}:${e.data?.directAttach ? "1" : "0"}:${e.data?.hideCableId ? "1" : "0"}:${String(e.data?.sourceLabel ?? "")}:${String(e.data?.label ?? "")}:${String(e.data?.targetLabel ?? "")}:${String(e.data?.color ?? "")}`,
      )
      .join("|"),
  );

  // selectionKey is the invalidation signal for this getState() snapshot
  const selectedEdges = useMemo(
    () => useSchematicStore.getState().edges.filter((e) => e.selected),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectionKey],
  );

  const [srcLabelInput, setSrcLabelInput] = useState("");
  const [midLabelInput, setMidLabelInput] = useState("");
  const [tgtLabelInput, setTgtLabelInput] = useState("");
  const [cableIdInput, setCableIdInput] = useState("");

  const hasEdges = selectedEdges.length >= 2;

  const lineStyles = selectedEdges.map((e) => (e.data?.lineStyle as LineStyle | undefined) ?? "solid");
  const allSameStyle = lineStyles.every((s) => s === lineStyles[0]);
  const consensusStyle: LineStyle | null = allSameStyle ? lineStyles[0] : null;

  function boolState(field: "directAttach" | "hideCableId") {
    const vals = selectedEdges.map((e) => e.data?.[field] === true);
    const allOn = vals.every(Boolean);
    const anyOn = vals.some(Boolean);
    return { allOn, mixed: anyOn && !allOn };
  }
  const directAttach = boolState("directAttach");
  const hideCableId = boolState("hideCableId");

  // --- Actions ---
  const applyLineStyle = (ls: LineStyle) => {
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({ edgeId: e.id, patch: { lineStyle: ls === "solid" ? undefined : ls } })),
    );
  };

  const applyToggle = (
    field: "directAttach" | "hideCableId",
    allOn: boolean,
    mixed: boolean,
  ) => {
    const newValue = allOn && !mixed ? undefined : (true as const);
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({ edgeId: e.id, patch: { [field]: newValue } })),
    );
  };

  const applyLabels = () => {
    const src = srcLabelInput.trim();
    const mid = midLabelInput.trim();
    const tgt = tgtLabelInput.trim();
    if (!src && !mid && !tgt) return;
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({
        edgeId: e.id,
        patch: {
          ...(src ? { sourceLabel: src } : {}),
          ...(mid ? { label: mid } : {}),
          ...(tgt ? { targetLabel: tgt } : {}),
        },
      })),
    );
    setSrcLabelInput("");
    setMidLabelInput("");
    setTgtLabelInput("");
  };

  const clearAllLabels = () => {
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({
        edgeId: e.id,
        patch: { sourceLabel: undefined, label: undefined, targetLabel: undefined },
      })),
    );
    setSrcLabelInput("");
    setMidLabelInput("");
    setTgtLabelInput("");
  };

  const applyCableIds = () => {
    const start = cableIdInput.trim();
    if (!start) return;
    const series = generateIncrementingLabelSeries(start, selectedEdges.length, 1);
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e, index) => ({
        edgeId: e.id,
        patch: { cableId: series[index] },
      })),
    );
    setCableIdInput("");
  };

  const clearAllCableIds = () => {
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({
        edgeId: e.id,
        patch: { cableId: undefined },
      })),
    );
    setCableIdInput("");
  };

  const anyLabelSet = selectedEdges.some(
    (e) => (e.data?.sourceLabel as string | undefined)
      || (e.data?.label as string | undefined)
      || (e.data?.targetLabel as string | undefined),
  );
  const anyCableIdSet = selectedEdges.some((e) => (e.data?.cableId as string | undefined));

  // Color override — true when every selected edge has the same color set.
  const colorValues = selectedEdges.map((e) => (e.data?.color as string | undefined) ?? "");
  const allSameColor = colorValues.every((c) => c === colorValues[0]);
  const sharedColor = allSameColor ? colorValues[0] : "";
  // Hide the picker entirely if any selection is direct-attach (override would no-op).
  const anyDirectAttach = selectedEdges.some((e) => e.data?.directAttach === true);

  const applyColor = (hex: string) => {
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({ edgeId: e.id, patch: { color: hex } })),
    );
  };

  const clearColor = () => {
    useSchematicStore.getState().batchPatchEdgeData(
      selectedEdges.map((e) => ({ edgeId: e.id, patch: { color: undefined } })),
    );
  };

  return (
    <div
      className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[40] bg-white border border-[var(--color-border)] rounded-lg shadow-lg p-3 w-72"
      data-print-hide
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--color-text)]">
          {hasEdges ? `Edit ${selectedEdges.length} connections` : "Edit connections"}
        </span>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs leading-none cursor-pointer"
        >
          ✕
        </button>
      </div>

      {!hasEdges && (
        <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
          Select 2 or more connections to edit them.
        </p>
      )}

      {hasEdges && <>{/* Labels */}
      <section className="mb-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
          Cable ID
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] leading-tight mb-1.5">
          Applies a series across the selection. Example: Output 1, Output 2 or SPK-101-HL, SPK-102-HL.
        </p>
        <input
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs outline-none focus:border-blue-500"
          value={cableIdInput}
          onChange={(e) => setCableIdInput(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyCableIds(); }}
          placeholder="Cable ID start value…"
        />
        <div className="flex gap-1 mt-1.5">
          <button
            onClick={applyCableIds}
            disabled={!cableIdInput.trim()}
            className="flex-1 px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
          >
            Apply
          </button>
          <button
            onClick={clearAllCableIds}
            disabled={!anyCableIdSet}
            className="flex-1 px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-red-600 border border-[var(--color-border)] rounded hover:border-red-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear all
          </button>
        </div>
      </section>

      {/* Labels */}
      <section className="mb-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
          Labels
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] leading-tight mb-1.5">
          Each slot is visible when it has text. Leave blank to hide.
        </p>
        <div className="space-y-1">
          <input
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs outline-none focus:border-blue-500"
            value={srcLabelInput}
            onChange={(e) => setSrcLabelInput(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyLabels(); }}
            placeholder="Source-end label…"
          />
          <input
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs outline-none focus:border-blue-500"
            value={midLabelInput}
            onChange={(e) => setMidLabelInput(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyLabels(); }}
            placeholder="Midpoint label…"
          />
          <input
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs outline-none focus:border-blue-500"
            value={tgtLabelInput}
            onChange={(e) => setTgtLabelInput(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyLabels(); }}
            placeholder="Target-end label…"
          />
        </div>
        <div className="flex gap-1 mt-1.5">
          <button
            onClick={applyLabels}
            disabled={!srcLabelInput.trim() && !midLabelInput.trim() && !tgtLabelInput.trim()}
            className="flex-1 px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
          >
            Apply
          </button>
          <button
            onClick={clearAllLabels}
            disabled={!anyLabelSet}
            className="flex-1 px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-red-600 border border-[var(--color-border)] rounded hover:border-red-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear all
          </button>
        </div>
      </section>

      {/* Line style */}
      <section className="mb-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
          Line Style{!allSameStyle && <span className="ml-1 normal-case text-[var(--color-text-muted)]">(mixed)</span>}
        </div>
        <div className="flex gap-1">
          {LINE_STYLES.map((ls) => (
            <button
              key={ls}
              title={LINE_STYLE_LABELS[ls]}
              onClick={() => applyLineStyle(ls)}
              className={`flex-1 py-1.5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                consensusStyle === ls
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              <svg width="24" height="8" className="block">
                <line
                  x1="2"
                  y1="4"
                  x2="22"
                  y2="4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={LINE_STYLE_DASHARRAY[ls] ?? "none"}
                />
              </svg>
            </button>
          ))}
        </div>
      </section>

      {/* Color override */}
      {!anyDirectAttach && (
        <section className="mb-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Color{!allSameColor && <span className="ml-1 normal-case">(mixed)</span>}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={sharedColor || "#9ca3af"}
              onChange={(e) => applyColor(e.target.value)}
              className="w-8 h-7 cursor-pointer border border-[var(--color-border)] rounded p-0.5 bg-white"
              title={sharedColor ? `Override: ${sharedColor}` : "Pick a custom cable color"}
            />
            <span className="flex-1 text-[11px] text-[var(--color-text-muted)] truncate">
              {sharedColor ? sharedColor : "Signal-type default"}
            </span>
            <button
              onClick={clearColor}
              disabled={selectedEdges.every((e) => !e.data?.color)}
              className="px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-red-600 border border-[var(--color-border)] rounded hover:border-red-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title="Reset to signal-type color"
            >
              Reset
            </button>
          </div>
        </section>
      )}

      {/* Options / toggles */}
      <section>
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
          Options
        </div>
        <div className="space-y-1">
          {(
            [
              { field: "directAttach" as const, label: "Direct Attach", state: directAttach },
              { field: "hideCableId" as const, label: "Hide Cable ID", state: hideCableId },
            ] as const
          ).map(({ field, label, state }) => (
            <label key={field} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.allOn}
                ref={(el) => {
                  if (el) el.indeterminate = state.mixed;
                }}
                onChange={() => applyToggle(field, state.allOn, state.mixed)}
                className="cursor-pointer"
              />
              <span className="text-xs text-[var(--color-text)]">
                {label}
                {state.mixed && (
                  <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">(mixed)</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>
      </>}
    </div>
  );
}
