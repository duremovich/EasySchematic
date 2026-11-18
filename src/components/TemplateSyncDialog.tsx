import { useMemo } from "react";
import type { DeviceData, DeviceTemplate, ConnectionEdge } from "../types";
import { syncDeviceWithTemplate } from "../templateSync";

const FIELD_LABELS: Record<string, string> = {
  manufacturer: "Manufacturer",
  modelNumber: "Model number",
  model: "Model",
  heightMm: "Height (mm)",
  widthMm: "Width (mm)",
  depthMm: "Depth (mm)",
  weightKg: "Weight (kg)",
  powerDrawW: "Power draw (W)",
  powerCapacityW: "Power capacity (W)",
  voltage: "Voltage",
  poeBudgetW: "PoE budget (W)",
  poeDrawW: "PoE draw (W)",
  unitCost: "Unit cost ($)",
  isCableAccessory: "Cable accessory",
  integratedWithCable: "Integrated with cable",
};

function formatValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

interface TemplateSyncDialogProps {
  deviceId: string;
  device: DeviceData;
  template: DeviceTemplate;
  edges: ConnectionEdge[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TemplateSyncDialog({
  deviceId,
  device,
  template,
  edges,
  onConfirm,
  onCancel,
}: TemplateSyncDialogProps) {
  const { preview } = useMemo(
    () => syncDeviceWithTemplate(device, template, deviceId, edges),
    [device, template, deviceId, edges],
  );

  const hasPortChanges =
    preview.portsAdded.length > 0 ||
    preview.portsRemovedSafe.length > 0 ||
    preview.portsOrphanedWithEdges.length > 0;

  return (
    <div
      data-editor-layer
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[480px] flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-heading)]">
            Update from template — v{device.templateVersion} → v{template.version}
          </span>
          <button
            onClick={onCancel}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {preview.factualChanges.length === 0 && !hasPortChanges && (
            <p className="text-xs text-[var(--color-text-muted)] italic">
              No material changes — version bump only. Applying will update the stored template version.
            </p>
          )}

          {preview.factualChanges.length > 0 && (
            <section>
              <h3 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Specs that will update
              </h3>
              <ul className="text-xs flex flex-col gap-1">
                {preview.factualChanges.map((c) => (
                  <li key={c.field} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--color-text)]">
                      {FIELD_LABELS[c.field] ?? c.field}
                    </span>
                    <span className="text-[var(--color-text-muted)] font-mono text-[11px]">
                      {formatValue(c.before)} → <span className="text-[var(--color-text-heading)]">{formatValue(c.after)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasPortChanges && (
            <section>
              <h3 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Ports
              </h3>
              <ul className="text-xs flex flex-col gap-0.5">
                {preview.portsAdded.length > 0 && (
                  <li>
                    <span className="text-green-700">+ {preview.portsAdded.length} added:</span>{" "}
                    <span className="text-[var(--color-text-muted)]">{preview.portsAdded.map((p) => p.label).join(", ")}</span>
                  </li>
                )}
                {preview.portsRemovedSafe.length > 0 && (
                  <li>
                    <span className="text-red-700">− {preview.portsRemovedSafe.length} removed:</span>{" "}
                    <span className="text-[var(--color-text-muted)]">{preview.portsRemovedSafe.map((p) => p.label).join(", ")}</span>
                  </li>
                )}
                {preview.portsOrphanedWithEdges.length > 0 && (
                  <li className="text-amber-700">
                    ⚠ {preview.portsOrphanedWithEdges.length} orphaned (have connections — kept for manual cleanup):{" "}
                    <span className="text-[var(--color-text-muted)]">{preview.portsOrphanedWithEdges.map((p) => p.label).join(", ")}</span>
                  </li>
                )}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Preserved
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Custom label, color, hostname, port labels, DHCP config, installed cards, and existing connections are all kept.
            </p>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
