import { useEffect, useMemo, useState } from "react";
import { DEFAULT_CONNECTOR } from "../connectorTypes";
import { useSchematicStore } from "../store";
import {
  CONNECTOR_GROUPS,
  CONNECTOR_LABELS,
  SIGNAL_LABELS,
  type ConnectorType,
  type DeviceTemplate,
  type Port,
  type PortDirection,
  type SignalType,
} from "../types";
import { deleteTatesideDeviceTemplate, updateTatesideDeviceTemplate } from "../tatesideApi";

interface Props {
  open: boolean;
  template: DeviceTemplate | null;
  onClose: () => void;
  onSaved: (template: DeviceTemplate) => void;
  onDeleted: (templateId: string) => void;
}

const ALL_SIGNAL_TYPES = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort(
  (a, b) => SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);

const CONNECTOR_GROUP_ENTRIES: Array<[string, ConnectorType[]]> = (() => {
  const groups = Object.entries(CONNECTOR_GROUPS).map(
    ([name, list]) => [name, [...list].sort((a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]))] as [string, ConnectorType[]],
  );
  const grouped = new Set<ConnectorType>(groups.flatMap(([, list]) => list));
  const orphans = (Object.keys(CONNECTOR_LABELS) as ConnectorType[]).filter((c) => !grouped.has(c));
  if (orphans.length > 0) {
    groups.push(["Other", orphans.sort((a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]))]);
  }
  return groups;
})();

function cloneEditableTemplate(template: DeviceTemplate): Omit<DeviceTemplate, "id" | "version"> {
  const { id, version, ...editable } = structuredClone(template);
  void id;
  void version;
  return editable;
}

function nextPortId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `port-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPort(direction: PortDirection): Port {
  const signalType: SignalType = "hdmi";
  return {
    id: nextPortId(),
    label: "",
    signalType,
    direction,
    connectorType: DEFAULT_CONNECTOR[signalType],
  };
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeForSave(
  draft: Omit<DeviceTemplate, "id" | "version">,
  searchTermsRaw: string,
): Omit<DeviceTemplate, "id" | "version"> {
  const searchTerms = searchTermsRaw
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);

  return {
    ...draft,
    label: draft.label.trim(),
    shortName: cleanOptionalString(draft.shortName),
    manufacturer: cleanOptionalString(draft.manufacturer),
    modelNumber: cleanOptionalString(draft.modelNumber),
    deviceType: draft.deviceType.trim(),
    category: cleanOptionalString(draft.category),
    referenceUrl: cleanOptionalString(draft.referenceUrl),
    color: cleanOptionalString(draft.color),
    searchTerms: searchTerms.length > 0 ? searchTerms : undefined,
    ports: draft.ports.map((port, index) => ({
      ...port,
      id: port.id || `port-${index + 1}`,
      label: port.label.trim(),
      section: cleanOptionalString(port.section),
      connectorType: port.connectorType ?? DEFAULT_CONNECTOR[port.signalType],
    })),
  };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function BulkAddForm({
  direction,
  onBulkAdd,
  onClose,
}: {
  direction: PortDirection;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState(direction === "input" ? "Input" : direction === "output" ? "Output" : "Port");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(8);
  const [signalType, setSignalType] = useState<SignalType>("hdmi");
  const [section, setSection] = useState("");

  const handleSubmit = () => {
    const count = end - start + 1;
    if (count < 1 || !prefix.trim()) return;
    onBulkAdd(direction, prefix.trim(), start, count, signalType, section.trim());
    onClose();
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded p-2 space-y-2 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          className="w-24 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Prefix"
        />
        <span className="text-[10px] text-[var(--color-text-muted)]">from</span>
        <input
          type="number"
          className="w-14 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={start}
          onChange={(e) => setStart(parseInt(e.target.value, 10) || 1)}
          min={1}
        />
        <span className="text-[10px] text-[var(--color-text-muted)]">to</span>
        <input
          type="number"
          className="w-14 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={end}
          onChange={(e) => setEnd(parseInt(e.target.value, 10) || 1)}
          min={start}
        />
        <select
          className="bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] rounded px-1 py-1 text-xs outline-none focus:border-blue-500 cursor-pointer"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {ALL_SIGNAL_TYPES.map((type) => (
            <option key={type} value={type}>{SIGNAL_LABELS[type]}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--color-text-muted)]">Section:</span>
        <input
          className="flex-1 bg-[var(--color-surface)] text-[var(--color-text-heading)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="Optional"
        />
        <button
          onClick={handleSubmit}
          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PortSection({
  title,
  direction,
  ports,
  onAdd,
  onBulkAdd,
  onRemove,
  onUpdate,
}: {
  title: string;
  direction: PortDirection;
  ports: Port[];
  onAdd: (direction: PortDirection) => void;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Port>) => void;
}) {
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkAdd((value) => !value)}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Bulk Add
          </button>
          <button
            onClick={() => onAdd(direction)}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Add
          </button>
        </div>
      </div>

      {showBulkAdd && (
        <BulkAddForm
          direction={direction}
          onBulkAdd={onBulkAdd}
          onClose={() => setShowBulkAdd(false)}
        />
      )}

      {ports.length === 0 ? (
        <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-2">
          No {title.toLowerCase()} yet.
        </div>
      ) : (
        <div className="space-y-2">
          {ports.map((port) => (
            <div key={port.id} className="space-y-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-2 py-2">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 min-w-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                  value={port.label}
                  onChange={(e) => onUpdate(port.id, { label: e.target.value })}
                  placeholder="Port label"
                />
                <select
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
                  value={port.signalType}
                  onChange={(e) => {
                    const nextSignalType = e.target.value as SignalType;
                    onUpdate(port.id, {
                      signalType: nextSignalType,
                      connectorType: DEFAULT_CONNECTOR[nextSignalType],
                    });
                  }}
                >
                  {ALL_SIGNAL_TYPES.map((type) => (
                    <option key={type} value={type}>{SIGNAL_LABELS[type]}</option>
                  ))}
                </select>
                <select
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
                  value={port.connectorType ?? DEFAULT_CONNECTOR[port.signalType]}
                  onChange={(e) => onUpdate(port.id, { connectorType: e.target.value as ConnectorType })}
                >
                  {CONNECTOR_GROUP_ENTRIES.map(([groupName, types]) => (
                    <optgroup key={groupName} label={groupName}>
                      {types.map((connectorType) => (
                        <option key={connectorType} value={connectorType}>{CONNECTOR_LABELS[connectorType]}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => onRemove(port.id)}
                  className="text-red-400/70 hover:text-red-500 text-sm cursor-pointer px-1"
                  title="Remove port"
                >
                  &times;
                </button>
              </div>
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={port.section ?? ""}
                onChange={(e) => onUpdate(port.id, { section: e.target.value || undefined })}
                placeholder="Section / group label (optional)"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManageTatesideTemplateDialog({
  open,
  template,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const addToast = useSchematicStore((s) => s.addToast);
  const [draft, setDraft] = useState<Omit<DeviceTemplate, "id" | "version"> | null>(null);
  const [searchTermsRaw, setSearchTermsRaw] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !template) return;
    const editable = cloneEditableTemplate(template);
    setDraft(editable);
    setSearchTermsRaw((editable.searchTerms ?? []).join(", "));
    setNote("");
  }, [open, template]);

  const inputs = useMemo(() => draft?.ports.filter((port) => port.direction === "input") ?? [], [draft]);
  const outputs = useMemo(() => draft?.ports.filter((port) => port.direction === "output") ?? [], [draft]);
  const bidirectional = useMemo(() => draft?.ports.filter((port) => port.direction === "bidirectional") ?? [], [draft]);

  if (!open || !template || !draft) return null;

  const updateDraft = (updates: Partial<Omit<DeviceTemplate, "id" | "version">>) => {
    setDraft((current) => (current ? { ...current, ...updates } : current));
  };

  const updatePort = (portId: string, updates: Partial<Port>) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ports: current.ports.map((port) => (port.id === portId ? { ...port, ...updates } : port)),
      };
    });
  };

  const removePort = (portId: string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ports: current.ports.filter((port) => port.id !== portId),
      };
    });
  };

  const addPort = (direction: PortDirection) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ports: [...current.ports, createPort(direction)],
      };
    });
  };

  const bulkAddPorts = (
    direction: PortDirection,
    prefix: string,
    start: number,
    count: number,
    signalType: SignalType,
    section: string,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const generated: Port[] = Array.from({ length: count }, (_, index) => ({
        id: nextPortId(),
        label: `${prefix} ${start + index}`,
        signalType,
        direction,
        connectorType: DEFAULT_CONNECTOR[signalType],
        section: cleanOptionalString(section),
      }));
      return {
        ...current,
        ports: [...current.ports, ...generated],
      };
    });
  };

  const handleSave = async () => {
    if (!template.id) {
      addToast("This shared template is missing its library ID", "error");
      return;
    }

    const normalized = normalizeForSave(draft, searchTermsRaw);
    if (!normalized.label) {
      addToast("Device name is required", "error");
      return;
    }
    if (!normalized.deviceType) {
      addToast("Device type is required", "error");
      return;
    }
    if (normalized.ports.some((port) => !port.label.trim())) {
      addToast("Every port needs a label", "error");
      return;
    }

    setSaving(true);
    try {
      const result = await updateTatesideDeviceTemplate(template.id, normalized, {
        note: note || undefined,
        source: "manual-edit",
      });
      addToast(`Updated ${result.template.label} in the TateSide library`, "success");
      onSaved(result.template);
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Could not update the TateSide template", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!template.id) {
      addToast("This shared template is missing its library ID", "error");
      return;
    }
    if (!window.confirm(`Remove "${template.label}" from the TateSide library?`)) return;

    setDeleting(true);
    try {
      await deleteTatesideDeviceTemplate(template.id, { note: note || undefined });
      addToast(`Removed ${template.label} from the TateSide library`, "success");
      onDeleted(template.id);
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Could not remove the TateSide template", "error");
    } finally {
      setDeleting(false);
    }
  };

  const searchTermsCount = searchTermsRaw.split(",").map((term) => term.trim()).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-[860px] max-w-[95vw] max-h-[94vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="text-lg font-semibold text-[var(--color-text-heading)]">
            Library Device Properties
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-2xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Device Name">
              <input
                value={draft.label}
                onChange={(e) => updateDraft({ label: e.target.value })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Short Name">
              <input
                value={draft.shortName ?? ""}
                onChange={(e) => updateDraft({ shortName: e.target.value || undefined })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Device Type">
              <input
                value={draft.deviceType}
                onChange={(e) => updateDraft({ deviceType: e.target.value })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Manufacturer">
              <input
                value={draft.manufacturer ?? ""}
                onChange={(e) => updateDraft({ manufacturer: e.target.value || undefined })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Model Number">
              <input
                value={draft.modelNumber ?? ""}
                onChange={(e) => updateDraft({ modelNumber: e.target.value || undefined })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Category">
              <input
                value={draft.category ?? ""}
                onChange={(e) => updateDraft({ category: e.target.value || undefined })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Reference URL" className="col-span-1">
              <input
                value={draft.referenceUrl ?? ""}
                onChange={(e) => updateDraft({ referenceUrl: e.target.value || undefined })}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="Header Color">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={draft.color ?? "#334155"}
                  onChange={(e) => updateDraft({ color: e.target.value })}
                  className="h-9 w-12 rounded border border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer"
                />
                <button
                  onClick={() => updateDraft({ color: undefined })}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </Field>
          </div>

          <Field label="Library Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. corrected model number and rear port labels"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
            />
          </Field>

          <div className="space-y-4">
            <PortSection
              title="Inputs"
              direction="input"
              ports={inputs}
              onAdd={addPort}
              onBulkAdd={bulkAddPorts}
              onRemove={removePort}
              onUpdate={updatePort}
            />
            <PortSection
              title="Outputs"
              direction="output"
              ports={outputs}
              onAdd={addPort}
              onBulkAdd={bulkAddPorts}
              onRemove={removePort}
              onUpdate={updatePort}
            />
            <PortSection
              title="Bidirectional"
              direction="bidirectional"
              ports={bidirectional}
              onAdd={addPort}
              onBulkAdd={bulkAddPorts}
              onRemove={removePort}
              onUpdate={updatePort}
            />
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Search Terms{searchTermsCount > 0 ? ` (${searchTermsCount})` : ""}
            </summary>
            <div className="pt-2">
              <textarea
                value={searchTermsRaw}
                onChange={(e) => setSearchTermsRaw(e.target.value)}
                placeholder="Comma-separated search terms"
                className="w-full min-h-[84px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 resize-y"
              />
            </div>
          </details>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Physical Dimensions
            </summary>
            <div className="grid grid-cols-2 gap-4 pt-2 pl-2">
              <Field label="Height (mm)">
                <input
                  type="number"
                  value={draft.heightMm ?? ""}
                  onChange={(e) => updateDraft({ heightMm: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                />
              </Field>
              <Field label="Width (mm)">
                <input
                  type="number"
                  value={draft.widthMm ?? ""}
                  onChange={(e) => updateDraft({ widthMm: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                />
              </Field>
              <Field label="Depth (mm)">
                <input
                  type="number"
                  value={draft.depthMm ?? ""}
                  onChange={(e) => updateDraft({ depthMm: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                />
              </Field>
              <Field label="Weight (kg)">
                <input
                  type="number"
                  value={draft.weightKg ?? ""}
                  onChange={(e) => updateDraft({ weightKg: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                />
              </Field>
            </div>
          </details>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Flags
            </summary>
            <div className="flex flex-col gap-2 pt-2 pl-2">
              <label className="flex items-center gap-2 text-[var(--color-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft.isVenueProvided ?? false}
                  onChange={(e) => updateDraft({ isVenueProvided: e.target.checked || undefined })}
                  className="cursor-pointer"
                />
                Venue provided (exclude from pack list)
              </label>
            </div>
          </details>
        </div>

        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="px-3 py-1.5 text-xs rounded border border-red-400/40 text-red-500 hover:text-red-400 hover:border-red-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Removing..." : "Remove From Library"}
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
