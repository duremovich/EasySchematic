import { useState, useEffect, useMemo, useRef } from "react";
import { useSchematicStore } from "../store";
import {
  planDeviceSwap,
  applyManualMapping,
  toggleAutoInstalledCard,
  summarizePlan,
  type SwapPlan,
  type PortMapping,
  type PortConflict,
} from "../deviceSwap";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { scoreTemplate } from "../templateSearch";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "../types";
import type { DeviceTemplate, DeviceNode, Port } from "../types";

export default function DeviceSwapDialog() {
  const target = useSchematicStore((s) => s.deviceSwapTarget);
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const swapDevice = useSchematicStore((s) => s.swapDevice);

  const oldNode = useMemo(() => {
    if (!target) return null;
    const n = nodes.find((nn) => nn.id === target.nodeId && nn.type === "device");
    return (n ?? null) as DeviceNode | null;
  }, [target, nodes]);

  const [pickedTemplate, setPickedTemplate] = useState<DeviceTemplate | null>(null);
  const [plan, setPlan] = useState<SwapPlan | null>(null);
  const [search, setSearch] = useState("");
  const [libraryTemplates, setLibraryTemplates] = useState<DeviceTemplate[]>(getBundledTemplates);
  const [showFactualChanges, setShowFactualChanges] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTemplates().then(setLibraryTemplates).catch(() => { /* keep empty TateSide fallback */ });
  }, []);

  // Reset internal state when the target opens / closes / changes.
  useEffect(() => {
    setPickedTemplate(null);
    setPlan(null);
    setSearch("");
    setShowFactualChanges(false);
  }, [target?.nodeId]);

  // Focus search input on phase 1.
  useEffect(() => {
    if (target && !pickedTemplate) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [target, pickedTemplate]);

  // Compute plan when a template is picked.
  useEffect(() => {
    if (!pickedTemplate || !oldNode) return;
    const p = planDeviceSwap(
      oldNode.data,
      oldNode.id,
      pickedTemplate,
      edges,
      customTemplates,
    );
    setPlan(p);
  }, [pickedTemplate, oldNode, edges, customTemplates]);

  const allTemplates = useMemo(
    () => [...libraryTemplates, ...customTemplates].filter((t) => t.category !== "Expansion Cards"),
    [libraryTemplates, customTemplates],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return allTemplates
      .map((t) => ({ template: t, score: scoreTemplate(t, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.template.label.localeCompare(b.template.label))
      .slice(0, 50)
      .map((r) => r.template);
  }, [allTemplates, search]);

  const close = () => useSchematicStore.setState({ deviceSwapTarget: null });
  const back = () => { setPickedTemplate(null); setPlan(null); };

  if (!target || !oldNode) return null;
  const oldDevice = oldNode.data;

  // ─────────────── Phase 1: Pick replacement template ───────────────
  if (!pickedTemplate) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        onClick={close}
      >
        <div
          className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[440px] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
            <span className="text-sm font-semibold text-[var(--color-text-heading)]">
              Swap '{oldDevice.label}' for...
            </span>
            <button
              onClick={close}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer"
            >
              &times;
            </button>
          </div>
          <div className="px-5 py-3 flex flex-col gap-2">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") close(); }}
              placeholder="Search the device library..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
            />
            <div className="max-h-[300px] overflow-y-auto -mx-2 px-2">
              {!search.trim() ? (
                <div className="text-[11px] text-[var(--color-text-muted)] py-4 text-center">
                  Type to search {allTemplates.length} library devices
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-[11px] text-[var(--color-text-muted)] py-4 text-center">
                  No matching devices
                </div>
              ) : (
                filtered.map((t) => {
                  const key = t.id ?? t.deviceType;
                  return (
                    <button
                      key={key}
                      onClick={() => setPickedTemplate(t)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-surface)] transition-colors flex items-center gap-2"
                    >
                      {t.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: t.color }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-[var(--color-text-heading)] truncate">
                          {t.label}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                          {t.manufacturer ? `${t.manufacturer} · ` : ""}
                          {t.deviceType} · {t.ports.length} port{t.ports.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
            <button
              onClick={close}
              className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────── Phase 2: Port mapping & confirm ───────────────
  if (!plan) return null;

  const summary = summarizePlan(plan);

  const onChangeMapping = (oldHandle: string, oldEndpoint: "source" | "target", newPortId: string | null) => {
    setPlan((p) => p ? applyManualMapping(p, oldHandle, oldEndpoint, newPortId) : p);
  };

  const onToggleCard = (slotId: string, enabled: boolean) => {
    setPlan((p) => p ? toggleAutoInstalledCard(p, slotId, enabled) : p);
  };

  const confirm = () => {
    if (!plan) return;
    swapDevice(target.nodeId, plan);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={close}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[720px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-heading)]">
            Swap '{oldDevice.label}' → '{pickedTemplate.label}'
          </span>
          <button
            onClick={close}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Auto-installed cards */}
          {plan.installedCards.length > 0 && (
            <section>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Installed cards
              </div>
              <div className="flex flex-col gap-1">
                {plan.installedCards.map((c) => (
                  <label
                    key={c.slotId}
                    className="flex items-center gap-2 px-2 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface)] cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) => onToggleCard(c.slotId, e.target.checked)}
                      className="cursor-pointer"
                    />
                    <span className="flex-1 text-[var(--color-text)]">
                      <span className="font-medium">{c.slotLabel}</span>
                      <span className="text-[var(--color-text-muted)]"> ← {c.cardLabel}</span>
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {c.source === "carried-over" ? "carried over" : "auto-installed"}
                      {c.satisfiedHandles.length > 0 ? ` · satisfies ${c.satisfiedHandles.length}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Mapping rows */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
              Connections ({plan.mappings.length})
            </div>
            {plan.mappings.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)] italic px-1 py-2">
                No existing connections — swap will simply replace the device.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {plan.mappings.map((m) => (
                  <MappingRow
                    key={m.oldHandle + "|" + m.oldEndpoint}
                    mapping={m}
                    pool={plan.newPortPool}
                    onChange={(newId) => onChangeMapping(m.oldHandle, m.oldEndpoint, newId)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Cards lost */}
          {plan.cardsLost.length > 0 && (
            <section>
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠ {plan.cardsLost.length} card{plan.cardsLost.length !== 1 ? "s" : ""} could not be carried over:{" "}
                {plan.cardsLost.map((c, i) => (
                  <span key={i}>
                    {i > 0 ? ", " : ""}{c.cardLabel} ({c.slotLabel})
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Factual changes (collapsible) */}
          {plan.factualChanges.length > 0 && (
            <section>
              <button
                onClick={() => setShowFactualChanges((v) => !v)}
                className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              >
                {showFactualChanges ? "▼" : "▶"} Specification changes ({plan.factualChanges.length})
              </button>
              {showFactualChanges && (
                <div className="mt-2 flex flex-col gap-0.5 text-[11px]">
                  {plan.factualChanges.map((f) => (
                    <div key={f.field} className="flex gap-2 px-1 py-0.5">
                      <span className="font-medium text-[var(--color-text)] w-32">{f.field}</span>
                      <span className="text-[var(--color-text-muted)]">{String(f.before ?? "—")} → {String(f.after ?? "—")}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <div className="text-[11px] text-[var(--color-text-muted)]">
            <span className="text-green-700 font-medium">{summary.remapped}</span> remapped
            {summary.dropped > 0 && (
              <>, <span className="text-red-700 font-medium">{summary.dropped}</span> will be dropped</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={back}
              className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
            >
              ← Pick different
            </button>
            <button
              onClick={close}
              className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Confirm Swap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function MappingRow({
  mapping,
  pool,
  onChange,
}: {
  mapping: PortMapping;
  pool: Port[];
  onChange: (newPortId: string | null) => void;
}) {
  const { oldPort, oldHandleSuffix, edges, newPortPreview, conflict, matchSource } = mapping;

  // Group new ports by direction for the dropdown.
  const grouped = useMemo(() => {
    const byDir: Record<string, Port[]> = { input: [], output: [], bidirectional: [], passthrough: [] };
    for (const p of pool) byDir[p.direction]?.push(p);
    return byDir;
  }, [pool]);

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${
        conflict ? "border-amber-300 bg-amber-50/40" : "border-[var(--color-border)]"
      }`}
    >
      {/* Old port */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[var(--color-text-heading)] truncate">
          {oldPort.label}
          {oldHandleSuffix && (
            <span className="text-[10px] text-[var(--color-text-muted)] ml-1">
              ({oldHandleSuffix.slice(1)})
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] truncate">
          {DirChip(oldPort.direction)} · {SIGNAL_LABELS[oldPort.signalType] ?? oldPort.signalType}
          {oldPort.connectorType ? ` · ${CONNECTOR_LABELS[oldPort.connectorType] ?? oldPort.connectorType}` : ""}
          {edges.length > 1 ? ` · ${edges.length} edges` : ""}
        </div>
      </div>

      {/* Arrow + match source badge */}
      <div className="flex flex-col items-center text-[var(--color-text-muted)] shrink-0 w-24">
        <div className="text-sm">→</div>
        <div className="text-[9px] uppercase tracking-wider">{matchSourceLabel(matchSource)}</div>
      </div>

      {/* New port dropdown */}
      <div className="flex-1 min-w-0">
        <select
          value={newPortPreview?.id ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
        >
          <option value="">— Drop these connections —</option>
          {(["input", "output", "bidirectional", "passthrough"] as const).map((dir) =>
            grouped[dir] && grouped[dir].length > 0 ? (
              <optgroup key={dir} label={dir}>
                {grouped[dir].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({SIGNAL_LABELS[p.signalType] ?? p.signalType}
                    {p.connectorType ? `, ${CONNECTOR_LABELS[p.connectorType] ?? p.connectorType}` : ""})
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        {conflict && (
          <div className="text-[10px] text-amber-700 mt-0.5 truncate">
            ⚠ {conflictLabel(conflict)}
          </div>
        )}
      </div>
    </div>
  );
}

function DirChip(dir: string): string {
  if (dir === "input") return "in";
  if (dir === "output") return "out";
  if (dir === "bidirectional") return "in/out";
  if (dir === "passthrough") return "passthrough";
  return dir;
}

function matchSourceLabel(s: PortMapping["matchSource"]): string {
  switch (s) {
    case "templatePortId": return "id match";
    case "label": return "by label";
    case "signal+connector+dir": return "exact";
    case "signal+dir": return "by signal";
    case "carried-card": return "via card";
    case "auto-installed-card": return "via card";
    case "manual": return "manual";
    case "none": return "drop";
  }
}

function conflictLabel(c: PortConflict): string {
  switch (c.kind) {
    case "directionMismatch": return `direction: ${c.old} → ${c.nw}`;
    case "signalMismatch":
      return `signal: ${SIGNAL_LABELS[c.old] ?? c.old} → ${SIGNAL_LABELS[c.nw] ?? c.nw}`;
    case "connectorMismatch":
      return `connector: ${c.old ? (CONNECTOR_LABELS[c.old] ?? c.old) : "?"} → ${c.nw ? (CONNECTOR_LABELS[c.nw] ?? c.nw) : "?"}`;
    case "capacityExceeded": return "target port doesn't accept multiple connections";
  }
}
