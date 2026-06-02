import { useEffect, useMemo, useState } from "react";
import type { DeviceTemplate } from "../types";
import { deleteTatesideDeviceTemplate, updateTatesideDeviceTemplate } from "../tatesideApi";
import { useSchematicStore } from "../store";

interface Props {
  open: boolean;
  template: DeviceTemplate | null;
  onClose: () => void;
  onSaved: (template: DeviceTemplate) => void;
  onDeleted: (templateId: string) => void;
}

function editableTemplateJson(template: DeviceTemplate): string {
  const { id, version, ...editable } = template;
  void id;
  void version;
  return JSON.stringify(editable, null, 2);
}

function normalizeEditableTemplate(value: unknown): Omit<DeviceTemplate, "id" | "version"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Template JSON must be a single object");
  }

  const candidate = value as Partial<DeviceTemplate> & { id?: string; version?: number };
  const { id, version, ...editable } = candidate;
  void id;
  void version;
  return editable as Omit<DeviceTemplate, "id" | "version">;
}

export default function ManageTatesideTemplateDialog({
  open,
  template,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const addToast = useSchematicStore((s) => s.addToast);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !template) return;
    setText(editableTemplateJson(template));
    setNote("");
  }, [open, template]);

  const parsedPreview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return normalizeEditableTemplate(JSON.parse(text));
    } catch {
      return null;
    }
  }, [text]);

  useEffect(() => {
    if (!text.trim()) {
      setParseError(null);
      return;
    }
    try {
      normalizeEditableTemplate(JSON.parse(text));
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }, [text]);

  if (!open || !template) return null;

  const handleSave = async () => {
    if (!template.id) {
      addToast("This shared template is missing its library ID", "error");
      return;
    }
    if (!parsedPreview) {
      addToast(parseError || "Please fix the JSON before saving", "error");
      return;
    }

    setSaving(true);
    try {
      const result = await updateTatesideDeviceTemplate(template.id, parsedPreview, {
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
    const confirmed = window.confirm(`Remove "${template.label}" from the TateSide library?`);
    if (!confirmed) return;

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

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-[900px] max-w-[96vw] max-h-[92vh] flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-heading)" }}>
              Manage TateSide Library Entry
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Edit the shared template JSON, save a new version, or remove this entry from the shared library.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">✕</button>
        </div>

        <div className="px-4 py-3 border-b grid grid-cols-2 gap-3 text-[11px]" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <div className="uppercase tracking-wide text-[10px] text-[var(--color-text-muted)] mb-1">Current entry</div>
            <div className="font-medium text-[var(--color-text-heading)]">{template.label}</div>
            <div className="text-[var(--color-text-muted)]">{template.manufacturer || "Unknown manufacturer"}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-[10px] text-[var(--color-text-muted)] mb-1">Version</div>
            <div className="font-medium text-[var(--color-text-heading)]">v{template.version ?? 1}</div>
            <div className="text-[var(--color-text-muted)]">{template.id}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
              Library note (optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Corrected model number and rear port labels"
              className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
              Editable template JSON
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-[420px] px-2 py-2 text-[11px] font-mono rounded border outline-none focus:border-blue-500 resize-y"
              style={{ backgroundColor: "var(--color-bg)", borderColor: parseError ? "#ef4444" : "var(--color-border)" }}
              spellCheck={false}
            />
            {parseError && (
              <div className="mt-2 text-[11px] text-red-600">
                {parseError}
              </div>
            )}
          </div>

          {parsedPreview && (
            <div className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}>
              <div className="font-medium text-[var(--color-text-heading)] mb-1">Preview</div>
              <div className="text-[var(--color-text-muted)]">
                {parsedPreview.label || "Untitled"} • {parsedPreview.deviceType || "No device type"} • {parsedPreview.ports?.length ?? 0} port{(parsedPreview.ports?.length ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="px-3 py-1.5 rounded border text-xs text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {deleting ? "Removing..." : "Remove From Library"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="px-3 py-1.5 rounded border text-xs border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving ? "Saving..." : "Save New Version"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
