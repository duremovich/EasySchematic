import { useState, useMemo } from "react";
import { useSchematicStore, type PortEditConflict } from "../store";
import { findAdaptersForSignalBridge, findAdaptersForConnectorBridge } from "../connectorTypes";
import type { DeviceData, DeviceTemplate } from "../types";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import { connectorLabel, signalLabel } from "../typeRegistry";

/** After a port edit invalidates live connections (#306): one dialog listing every
 *  affected cable, each resolvable as disconnect, insert adapter, or keep-with-flag. */
export default function PortEditConflictDialog() {
  const conflicts = useSchematicStore((s) => s.pendingPortEditConflicts);
  const nodes = useSchematicStore((s) => s.nodes);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const dismiss = useSchematicStore((s) => s.dismissPortEditConflicts);
  const resolve = useSchematicStore((s) => s.resolvePortEditConflict);
  const resolveAll = useSchematicStore((s) => s.resolveAllPortEditConflicts);

  const [adapterChoice, setAdapterChoice] = useState<Record<string, number>>({});

  const adaptersByEdge = useMemo(() => {
    if (!conflicts) return new Map<string, DeviceTemplate[]>();
    const allTemplates = [...DEVICE_TEMPLATES, ...customTemplates];
    const map = new Map<string, DeviceTemplate[]>();
    for (const c of conflicts) {
      // Match on the effective face connectors/signals the cable actually uses.
      // An "incompatible" conflict is something no adapter can fix (direction,
      // multi-connect, multicore) — offer none. Endpoints filter out bridges
      // insertAdapterBetween could not wire drawably (#310).
      const endpoints = {
        sourcePort: { direction: c.sourcePort.direction, signalType: c.sourceSignal },
        targetPort: { direction: c.targetPort.direction, signalType: c.targetSignal },
      };
      const found =
        c.reason === "connector-mismatch" && c.sourceConnector && c.targetConnector
          ? findAdaptersForConnectorBridge(c.sourceConnector, c.targetConnector, c.sourceSignal, allTemplates, endpoints)
          : c.reason === "signal-mismatch" && c.sourceSignal !== c.targetSignal
            ? findAdaptersForSignalBridge(c.sourceSignal, c.targetSignal, allTemplates, endpoints)
            : [];
      map.set(c.edgeId, found);
    }
    return map;
  }, [conflicts, customTemplates]);

  if (!conflicts || conflicts.length === 0) return null;

  const deviceLabel = (nodeId: string) => {
    const n = nodes.find((nn) => nn.id === nodeId);
    return n && n.type === "device" ? (n.data as DeviceData).label : nodeId;
  };

  const portSummary = (c: PortEditConflict) => {
    const srcConn = c.sourceConnector ? connectorLabel(c.sourceConnector) : "";
    const tgtConn = c.targetConnector ? connectorLabel(c.targetConnector) : "";
    if (c.reason === "incompatible") {
      return `${signalLabel(c.sourceSignal)} — the edited port's direction or connection rules no longer allow this cable`;
    }
    return c.reason === "connector-mismatch"
      ? `${srcConn || "?"} → ${tgtConn || "?"} (${signalLabel(c.sourceSignal)})`
      : `${signalLabel(c.sourceSignal)}${srcConn ? ` (${srcConn})` : ""} → ${signalLabel(c.targetSignal)}${tgtConn ? ` (${tgtConn})` : ""}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={dismiss}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[520px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-heading)]">
            {conflicts.length === 1
              ? "Connection No Longer Compatible"
              : `${conflicts.length} Connections No Longer Compatible`}
          </span>
          <button
            onClick={dismiss}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs text-[var(--color-text)]">
            The port change made {conflicts.length === 1 ? "this connection" : "these connections"} incompatible.
            Disconnect, insert an adapter, or keep the cable flagged as a known mismatch.
          </p>

          <div className="border border-[var(--color-border)] rounded divide-y divide-[var(--color-border)]">
            {conflicts.map((c) => {
              const adapters = adaptersByEdge.get(c.edgeId) ?? [];
              const choice = Math.min(adapterChoice[c.edgeId] ?? 0, Math.max(adapters.length - 1, 0));
              return (
                <div key={c.edgeId} className="px-3 py-2.5 flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-text-heading)]">
                    {deviceLabel(c.source)} &middot; {c.sourcePort.label} &rarr; {deviceLabel(c.target)} &middot; {c.targetPort.label}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">{portSummary(c)}</span>
                  {c.adapterFailed && (
                    <span className="text-xs text-red-600">
                      The adapter could not bridge this cable — choose another resolution.
                    </span>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => resolve(c.edgeId, "disconnect")}
                      className="px-2 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
                    >
                      Disconnect
                    </button>
                    {adapters.length > 0 && (
                      <>
                        <button
                          onClick={() => resolve(c.edgeId, "adapter", adapters[choice])}
                          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          Insert Adapter
                        </button>
                        {adapters.length > 1 ? (
                          <select
                            value={choice}
                            onChange={(e) => setAdapterChoice((m) => ({ ...m, [c.edgeId]: Number(e.target.value) }))}
                            className="text-xs border border-[var(--color-border)] rounded px-1 py-1 bg-white text-[var(--color-text)] max-w-[200px]"
                          >
                            {adapters.map((t, i) => (
                              <option key={t.id ?? t.label + i} value={i}>{t.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{adapters[0].label}</span>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => resolve(c.edgeId, "keep")}
                      className="px-2 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
                    >
                      Keep (flag mismatch)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          {conflicts.length > 1 && (
            <>
              <button
                onClick={() => resolveAll("disconnect")}
                className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
              >
                Disconnect All
              </button>
              <button
                onClick={() => resolveAll("keep")}
                className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
              >
                Keep All (flag mismatch)
              </button>
            </>
          )}
          <button
            onClick={dismiss}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
