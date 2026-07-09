import { useEffect, useMemo, useState } from "react";
import type { ConnectionEdge, DeviceData, DeviceTemplate } from "../types";
import { useSchematicStore } from "../store";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { getPanelOccupancy, segmentsForEdge } from "../patchCircuits";
import { scoreTemplate } from "../templateSearch";

type CableFilter = "all" | "patched" | "direct";

/** Left sidebar of the Patch Panels page: panel inventory + logical cable list with
 *  the patch/unpatch assignment flow. */
export default function PatchPanelSidebar() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const cableIdMap = useSchematicStore((s) => s.cableIdMap);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const patchAssignEdgeId = useSchematicStore((s) => s.patchAssignEdgeId);
  const patchTracedEdgeId = useSchematicStore((s) => s.patchTracedEdgeId);
  const setPatchAssignEdge = useSchematicStore((s) => s.setPatchAssignEdge);
  const setPatchTracedEdge = useSchematicStore((s) => s.setPatchTracedEdge);
  const clearEdgePatchHops = useSchematicStore((s) => s.clearEdgePatchHops);
  const addOffCanvasPanel = useSchematicStore((s) => s.addOffCanvasPanel);
  const setPanelOffCanvas = useSchematicStore((s) => s.setPanelOffCanvas);
  const deleteNode = useSchematicStore((s) => s.deleteNode);
  const updateDeviceLabel = useSchematicStore((s) => s.updateDeviceLabel);

  const [filter, setFilter] = useState<CableFilter>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [apiTemplates, setApiTemplates] = useState<DeviceTemplate[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Load the library once when the picker first opens (bundled templates as fallback).
  useEffect(() => {
    if (!pickerOpen || apiTemplates !== null) return;
    let cancelled = false;
    fetchTemplates()
      .then((t) => { if (!cancelled) setApiTemplates(t); })
      .catch(() => { if (!cancelled) setApiTemplates(getBundledTemplates()); });
    return () => { cancelled = true; };
  }, [pickerOpen, apiTemplates]);

  const panels = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "device" && (n.data as DeviceData).deviceType === "patch-panel")
        .sort((a, b) => ((a.data as DeviceData).label || "").localeCompare((b.data as DeviceData).label || "")),
    [nodes],
  );

  const occupancy = useMemo(() => getPanelOccupancy(nodes, edges), [nodes, edges]);

  const panelTemplates = useMemo(() => {
    const all = [...customTemplates, ...(apiTemplates ?? getBundledTemplates())];
    const seen = new Set<string>();
    return all.filter((t) => {
      if (t.deviceType !== "patch-panel") return false;
      const key = t.id ?? t.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customTemplates, apiTemplates]);

  const pickerResults = useMemo(() => {
    if (!pickerQuery.trim()) return panelTemplates.slice(0, 20);
    return panelTemplates
      .map((t) => ({ t, score: scoreTemplate(t, pickerQuery) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.t);
  }, [panelTemplates, pickerQuery]);

  // Logical connections: skip target-side stub legs (the source leg represents the cable).
  const nodeTypeById = useMemo(() => new Map(nodes.map((n) => [n.id, n.type])), [nodes]);
  const cables = useMemo(
    () =>
      edges.filter((e) => {
        if (!e.data?.signalType || e.data?.directAttach) return false;
        if (e.data?.linkedConnectionId && nodeTypeById.get(e.source) === "stub-label") return false;
        return true;
      }),
    [edges, nodeTypeById],
  );

  const panelLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of panels) m.set(p.id, (p.data as DeviceData).label || "Panel");
    return m;
  }, [panels]);

  const filteredCables = cables.filter((e) => {
    const patched = (e.data?.patchHops?.length ?? 0) > 0;
    return filter === "all" ? true : filter === "patched" ? patched : !patched;
  });

  const baseIdFor = (e: ConnectionEdge) => cableIdMap[e.id] ?? (e.data?.cableId as string | undefined) ?? "—";

  const commitRename = () => {
    if (renamingId && renameValue.trim()) updateDeviceLabel(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  return (
    <div className="w-72 shrink-0 bg-white border-r border-neutral-200 overflow-y-auto text-xs" data-print-hide>
      {/* ── Panels ── */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Panels in project</span>
        <button
          className="text-blue-600 hover:text-blue-800"
          onClick={() => setPickerOpen((v) => !v)}
        >
          + Add panel
        </button>
      </div>

      {pickerOpen && (
        <div className="mx-3 mb-2 border border-neutral-200 rounded p-2 bg-neutral-50">
          <input
            autoFocus
            className="w-full border border-neutral-300 rounded px-2 py-1 mb-1 outline-none focus:border-blue-400"
            placeholder="Search patch panels…"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setPickerOpen(false); }}
          />
          <div className="max-h-48 overflow-y-auto">
            {apiTemplates === null && <div className="text-neutral-400 px-1 py-2">Loading library…</div>}
            {apiTemplates !== null && pickerResults.length === 0 && (
              <div className="text-neutral-400 px-1 py-2">No patch panel templates match.</div>
            )}
            {pickerResults.map((t) => (
              <button
                key={t.id ?? t.label}
                className="w-full text-left px-1.5 py-1 rounded hover:bg-blue-50 hover:text-blue-700"
                onClick={() => {
                  addOffCanvasPanel(t);
                  setPickerOpen(false);
                  setPickerQuery("");
                }}
              >
                {t.label}
                <span className="text-neutral-400"> · {t.ports.filter((p) => p.direction === "passthrough").length} ports</span>
              </button>
            ))}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            Panels added here are “virtual” — in reports and racks, but never on the schematic.
          </div>
        </div>
      )}

      {panels.length === 0 && !pickerOpen && (
        <div className="px-3 py-2 text-neutral-400">No patch panels yet.</div>
      )}
      {panels.map((p) => {
        const data = p.data as DeviceData;
        const passthroughCount = data.ports.filter((pt) => pt.direction === "passthrough").length;
        const used = occupancy.get(p.id)?.size ?? 0;
        const offCanvas = !!data.offCanvas;
        const wired = edges.some((e) => e.source === p.id || e.target === p.id);
        return (
          <div key={p.id} className="group px-3 py-1.5 hover:bg-blue-50">
            <div className="flex items-baseline gap-2">
              {renamingId === p.id ? (
                <input
                  autoFocus
                  className="border border-blue-400 rounded px-1 flex-1 outline-none"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <button
                  className="font-semibold text-neutral-800 truncate text-left"
                  title="Click to scroll to panel · double-click to rename"
                  onClick={() => document.getElementById(`ppblk-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  onDoubleClick={() => { setRenamingId(p.id); setRenameValue(data.label || ""); }}
                >
                  {data.label || "Unnamed Panel"}
                </button>
              )}
              <span className="text-neutral-400 whitespace-nowrap ml-auto">
                {used}/{passthroughCount} used{offCanvas ? " · virtual" : ""}
              </span>
            </div>
            <div className="hidden group-hover:flex gap-3 pt-0.5">
              <button
                className="text-blue-600 hover:underline disabled:text-neutral-300 disabled:no-underline"
                disabled={!offCanvas && wired}
                title={!offCanvas && wired ? "Panel has wired connections on the schematic" : undefined}
                onClick={() => setPanelOffCanvas(p.id, !offCanvas)}
              >
                {offCanvas ? "Show on canvas" : "Make virtual"}
              </button>
              <button
                className="text-red-600 hover:underline"
                onClick={() => {
                  if (confirm(`Delete panel "${data.label}"? Patch assignments through it are removed; connections stay.`)) {
                    deleteNode(p.id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Cables ── */}
      <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Cables</div>
      <div className="px-3 pb-2 flex gap-1">
        {(["all", "patched", "direct"] as const).map((f) => (
          <button
            key={f}
            className={`px-2 py-0.5 rounded-full border text-[11px] ${
              filter === f
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-neutral-300 text-neutral-500 hover:bg-neutral-100"
            }`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "patched" ? "Patched" : "Direct"}
          </button>
        ))}
      </div>

      {filteredCables.length === 0 && (
        <div className="px-3 py-2 text-neutral-400 border-t border-neutral-100">No cables match.</div>
      )}
      {filteredCables.map((e) => {
        const patched = (e.data?.patchHops?.length ?? 0) > 0;
        const segs = segmentsForEdge(e, nodes, edges, baseIdFor(e));
        const fromLabel = segs[0]?.from.label ?? "?";
        const toLabel = segs[segs.length - 1]?.to.label ?? "?";
        const via = (e.data?.patchHops ?? [])
          .map((h) => panelLabelById.get(h.panelNodeId) ?? "?")
          .join(" → ");
        const isAssigning = patchAssignEdgeId === e.id;
        const isTraced = patchTracedEdgeId === e.id;
        return (
          <div
            key={e.id}
            className={`px-3 py-1.5 border-t border-neutral-100 ${isTraced ? "bg-amber-50" : ""} ${isAssigning ? "bg-blue-50" : ""}`}
            onMouseEnter={() => setPatchTracedEdge(e.id)}
            onMouseLeave={() => setPatchTracedEdge(null)}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: `var(--color-${e.data?.signalType ?? "custom"})` }}
              />
              <span className="font-bold font-mono text-[11px]">{baseIdFor(e)}</span>
              <span className="text-neutral-500 truncate flex-1" title={`${fromLabel} → ${toLabel}`}>
                {fromLabel} → {toLabel}
              </span>
              <span
                className={`px-1.5 rounded-full text-[10px] whitespace-nowrap ${
                  patched ? "bg-green-100 text-green-700 font-semibold" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {patched ? "Patched" : "Direct"}
              </span>
            </div>
            {patched && via && (
              <div className="pl-4 text-[10px] text-neutral-400 font-mono truncate">via {via}</div>
            )}
            <div className="pl-4 pt-0.5 flex gap-3">
              {patched ? (
                <>
                  <button className="text-blue-600 hover:underline" onClick={() => clearEdgePatchHops(e.id)}>
                    Unpatch
                  </button>
                  <button className="text-blue-600 hover:underline" onClick={() => setPatchAssignEdge(e.id)}>
                    Add hop…
                  </button>
                </>
              ) : (
                <button className="text-blue-600 hover:underline" onClick={() => setPatchAssignEdge(e.id)}>
                  Patch…
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
