import { useMemo, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import type { DeviceTemplate } from "../types";
import { parseJsonImport } from "../import/parseJson";
import { parseCsvImport } from "../import/parseCsv";
import type { ParsedTemplate } from "../import/types";
import { createSubmission } from "../templateApi";

type Tab = "json" | "csv";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SAMPLE_JSON = `{
  "label": "Extron DTP2 T 212",
  "manufacturer": "Extron",
  "modelNumber": "60-1271-01",
  "deviceType": "hdbaset-extender",
  "referenceUrl": "https://www.extron.com/product/dtp2t212",
  "heightMm": 25,
  "widthMm": 216,
  "depthMm": 114,
  "weightKg": 0.68,
  "powerDrawW": 12,
  "ports": [
    { "label": "HDMI IN",   "signalType": "hdmi",    "connectorType": "hdmi",    "direction": "input" },
    { "label": "HDMI LOOP", "signalType": "hdmi",    "connectorType": "hdmi",    "direction": "output" },
    { "label": "DTP2 OUT",  "signalType": "hdbaset", "connectorType": "rj45",    "direction": "output" },
    { "label": "RS-232",    "signalType": "serial",  "connectorType": "phoenix", "direction": "bidirectional" },
    { "label": "12V DC",    "signalType": "power",   "connectorType": "barrel",  "direction": "input" }
  ]
}`;

const SAMPLE_CSV = `model_number,manufacturer,label,device_type,height_mm,width_mm,depth_mm,weight_kg,power_draw_w,reference_url,port_label,port_direction,port_signal_type,port_connector_type,port_section
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,HDMI IN,input,hdmi,hdmi,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,HDMI LOOP,output,hdmi,hdmi,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,DTP2 OUT,output,hdbaset,rj45,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,RS-232,bidirectional,serial,phoenix,Rear
60-1271-01,Extron,Extron DTP2 T 212,hdbaset-extender,25,216,114,0.68,12,https://www.extron.com/product/dtp2t212,12V DC,input,power,barrel,Rear`;

export default function ImportDevicesDialog({ open, onClose }: Props) {
  const importCustomTemplates = useSchematicStore((s) => s.importCustomTemplates);
  const addToast = useSchematicStore((s) => s.addToast);

  const [tab, setTab] = useState<Tab>("json");
  const [text, setText] = useState("");
  const [submitterNote, setSubmitterNote] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => {
    if (!text.trim()) return null;
    return tab === "json" ? parseJsonImport(text) : parseCsvImport(text);
  }, [text, tab]);

  if (!open) return null;

  const close = () => {
    setText("");
    setSkipped(new Set());
    setSubmitterNote("");
    onClose();
  };

  const toggleSkip = (id: string) => {
    const next = new Set(skipped);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSkipped(next);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    e.target.value = "";
  };

  const loadSample = () => setText(tab === "json" ? SAMPLE_JSON : SAMPLE_CSV);

  const selectedTemplates = (result?.templates ?? []).filter(
    (pt) => !skipped.has(pt.template.id ?? pt.template.label) && pt.validation.ok,
  );

  const handleAddToLibrary = () => {
    if (selectedTemplates.length === 0) return;
    importCustomTemplates(selectedTemplates.map((pt) => pt.template));
    addToast(`Added ${selectedTemplates.length} template${selectedTemplates.length === 1 ? "" : "s"} to your library`, "success");
    close();
  };

  const handleAddAndSubmit = async () => {
    if (selectedTemplates.length === 0) return;
    setSubmitting(true);
    importCustomTemplates(selectedTemplates.map((pt) => pt.template));

    let submitted = 0;
    let failed = 0;
    for (const pt of selectedTemplates) {
      try {
        // Strip id/version since the submission API generates these
        const { id, version, ...data } = pt.template as DeviceTemplate & { version?: number };
        void id; void version;
        await createSubmission("create", data, undefined, submitterNote || undefined);
        submitted++;
      } catch (err) {
        failed++;
        console.error("Submission failed:", err);
      }
    }
    setSubmitting(false);

    if (failed > 0) {
      addToast(
        `Added ${selectedTemplates.length} to library. Submitted ${submitted}, ${failed} failed (sign-in required?)`,
        "error",
      );
    } else {
      addToast(`Added ${selectedTemplates.length} to library and submitted to community`, "success");
    }
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={close}
    >
      <div
        className="rounded-lg shadow-xl w-[820px] max-w-[95vw] max-h-[92vh] flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-heading)" }}>
              Import Devices
            </h2>
            <button onClick={close} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">✕</button>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
            Bulk-add device templates to your library. See the{" "}
            <a href="https://docs.easyschematic.live/device-template-schema" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              schema reference
            </a>{" "}
            for valid signal/connector/device types.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
          {(["json", "csv"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setText(""); setSkipped(new Set()); }}
              className={`px-4 py-2 text-xs cursor-pointer ${
                tab === t
                  ? "border-b-2 border-blue-500 text-[var(--color-text-heading)] font-medium"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              Upload {tab === "json" ? "JSON file" : "CSV file"}
            </button>
            <button
              onClick={loadSample}
              className="px-3 py-1 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              Load sample
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={tab === "json" ? ".json,application/json" : ".csv,text/csv"}
              className="hidden"
              onChange={handleFileUpload}
            />
            <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
              Or paste below ↓
            </span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tab === "json" ? "Paste device JSON here…" : "Paste CSV here…"}
            className="w-full h-32 px-2 py-1 text-[11px] font-mono rounded border outline-none focus:border-blue-500 resize-y"
            style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />

          {result && (
            <div>
              {result.fatalErrors.length > 0 && (
                <div className="mb-2 px-3 py-2 rounded bg-red-50 border border-red-200">
                  <div className="text-xs font-semibold text-red-800 mb-1">Could not parse:</div>
                  <ul className="text-[11px] text-red-700 list-disc ml-5 space-y-0.5">
                    {result.fatalErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {result.templates.length > 0 && (
                <div className="border rounded" style={{ borderColor: "var(--color-border)" }}>
                  <div className="px-3 py-2 border-b text-[11px] text-[var(--color-text-muted)] flex items-center gap-2"
                       style={{ borderColor: "var(--color-border)" }}>
                    <span>
                      {result.templates.length} template{result.templates.length === 1 ? "" : "s"} parsed •{" "}
                      <span className="text-emerald-700">{result.templates.filter((t) => t.validation.ok).length} valid</span>
                      {result.templates.some((t) => !t.validation.ok) && (
                        <> • <span className="text-red-700">{result.templates.filter((t) => !t.validation.ok).length} with errors</span></>
                      )}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {result.templates.map((pt) => (
                      <PreviewRow
                        key={pt.template.id ?? pt.template.label}
                        pt={pt}
                        skipped={skipped.has(pt.template.id ?? pt.template.label)}
                        onToggle={() => toggleSkip(pt.template.id ?? pt.template.label)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTemplates.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                Submitter note (optional, used if you submit to community)
              </label>
              <input
                value={submitterNote}
                onChange={(e) => setSubmitterNote(e.target.value)}
                placeholder="e.g. Imported from Extron stencil 2024.1"
                className="w-full px-2 py-1 text-xs rounded border outline-none focus:border-blue-500"
                style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={close}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleAddAndSubmit}
            disabled={selectedTemplates.length === 0 || submitting}
            className="px-3 py-1.5 rounded border border-blue-300 bg-white text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Adds to your library AND submits to the community library for review"
          >
            {submitting ? "Submitting…" : `Add & Submit (${selectedTemplates.length})`}
          </button>
          <button
            onClick={handleAddToLibrary}
            disabled={selectedTemplates.length === 0 || submitting}
            className="px-4 py-1.5 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Add {selectedTemplates.length} to Library
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ pt, skipped, onToggle }: { pt: ParsedTemplate; skipped: boolean; onToggle: () => void }) {
  const t = pt.template;
  const errCount = pt.validation.errors.length;
  const warnCount = pt.validation.warnings.length;
  const badRow = errCount > 0;

  return (
    <div
      className={`px-3 py-2 border-b flex items-start gap-2 text-xs ${
        skipped ? "opacity-40" : ""
      } ${badRow ? "bg-red-50/40" : ""}`}
      style={{ borderColor: "var(--color-border)" }}
    >
      <input
        type="checkbox"
        checked={!skipped && pt.validation.ok}
        disabled={!pt.validation.ok}
        onChange={onToggle}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--color-text-heading)] truncate">
            {t.label || <em className="text-[var(--color-text-muted)]">(no label)</em>}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {t.manufacturer} {t.modelNumber && `· ${t.modelNumber}`}
          </span>
        </div>
        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {t.deviceType || "?"} → {t.category || "?"} · {t.ports?.length ?? 0} ports
          {pt.source && <> · {pt.source}</>}
        </div>
        {errCount > 0 && (
          <ul className="text-[10px] text-red-700 mt-1 list-disc ml-4 space-y-0.5">
            {pt.validation.errors.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
            {errCount > 3 && <li>+ {errCount - 3} more</li>}
          </ul>
        )}
        {warnCount > 0 && errCount === 0 && (
          <div className="text-[10px] text-amber-700 mt-1">
            ⚠ {pt.validation.warnings.join("; ")}
          </div>
        )}
      </div>
    </div>
  );
}
