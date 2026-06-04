import { useMemo, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import { SIGNAL_LABELS, type DeviceTemplate, type SignalType } from "../types";
import { DEVICE_TYPE_LABELS, DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import { parseJsonImport } from "../import/parseJson";
import { parseCsvImport } from "../import/parseCsv";
import type { ParsedTemplate } from "../import/types";
import { validateTemplate } from "../import/validate";
import { saveTatesideDeviceTemplates } from "../tatesideApi";

type Tab = "json" | "csv";

const ALL_SIGNAL_TYPES = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort(
  (a, b) => SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);

const ALL_DEVICE_TYPES = Object.keys(DEVICE_TYPE_TO_CATEGORY).sort((a, b) =>
  (DEVICE_TYPE_LABELS[a] ?? a).localeCompare(DEVICE_TYPE_LABELS[b] ?? b),
);

function remapUnknownSignalTypes(raw: string, unknownSignalTypes: string[], replacement: SignalType): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const unknown = new Set(unknownSignalTypes);

  function walk(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => walk(item));
    if (!value || typeof value !== "object") return value;

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "signalType" && typeof child === "string" && unknown.has(child)) {
        out[key] = replacement;
      } else {
        out[key] = walk(child);
      }
    }
    return out;
  }

  return JSON.stringify(walk(parsed), null, 2);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onLibraryChanged?: () => void | Promise<void>;
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

function rowKey(pt: ParsedTemplate): string {
  return pt.template.id ?? pt.template.label;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreDeviceTypeCandidate(candidate: string, current: string, label: string, category?: string): number {
  const candidateNorm = normalizeToken(candidate);
  const currentNorm = normalizeToken(current);
  const labelNorm = normalizeToken(label);
  const categoryNorm = normalizeToken(category ?? "");

  let score = 0;
  if (candidateNorm === currentNorm) score += 1000;
  if (candidateNorm.includes(currentNorm) || currentNorm.includes(candidateNorm)) score += 350;

  const searchTokens = new Set([
    ...tokenize(current),
    ...tokenize(label),
    ...tokenize(category ?? ""),
  ]);

  for (const token of searchTokens) {
    if (!token) continue;
    if (candidateNorm.includes(token) || token.includes(candidateNorm)) score += 60;
  }

  const keywordWeights: Array<[RegExp, string[], number]> = [
    [/touch|pad|panel|screen/, ["touch-screen", "button-panel", "controller"], 180],
    [/switch|matrix|router/, ["switcher", "router", "presentation-system"], 180],
    [/camera|ptz/, ["camera", "ptz-camera", "camera-ccu"], 180],
    [/speaker|audio|sound/, ["speaker", "amplifier", "audio-dsp"], 170],
    [/display|monitor|tv|screen/, ["display", "monitor", "tv"], 170],
    [/codec|conference|bar/, ["codec", "video-bar", "presentation-system"], 160],
    [/media|player|stream/, ["media-player", "streaming-encoder", "media-server"], 160],
    [/control|processor|controller/, ["control-processor", "controller", "button-panel"], 150],
    [/intercom|comms|commentary/, ["intercom", "commentary-box", "phone-hybrid"], 150],
    [/wireless|mic|rf/, ["wireless-mic-receiver", "wired-mic", "antenna"], 140],
  ];

  const haystack = `${current} ${label} ${category ?? ""}`.toLowerCase();
  for (const [pattern, candidates, weight] of keywordWeights) {
    if (!pattern.test(haystack)) continue;
    const idx = candidates.indexOf(candidate);
    if (idx >= 0) score += weight - (idx * 15);
  }

  if (candidateNorm === "touchscreen" || candidateNorm === "touchscreen") {
    if (/touch|pad|panel|screen/.test(haystack)) score += 200;
  }

  // Slight bonus when the human-readable device type label overlaps the text.
  const candidateLabel = DEVICE_TYPE_LABELS[candidate] ?? candidate;
  const candidateLabelTokens = new Set(tokenize(candidateLabel));
  for (const token of searchTokens) {
    if (candidateLabelTokens.has(token)) score += 20;
  }

  // Keep obviously unrelated options from floating up due to shared words.
  if (candidateNorm === currentNorm) score += 500;
  if (candidateNorm === labelNorm || candidateNorm === categoryNorm) score += 40;

  return score;
}

function getDeviceTypeSuggestions(template: DeviceTemplate): string[] {
  const current = template.deviceType || "";
  const label = template.label || "";
  const category = template.category || "";
  const candidates = Object.keys(DEVICE_TYPE_TO_CATEGORY);
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreDeviceTypeCandidate(candidate, current, label, category),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || DEVICE_TYPE_LABELS[a.candidate].localeCompare(DEVICE_TYPE_LABELS[b.candidate]))
    .slice(0, 4)
    .map((entry) => entry.candidate);
}

export default function ImportDevicesDialog({ open, onClose, onLibraryChanged }: Props) {
  const importCustomTemplates = useSchematicStore((s) => s.importCustomTemplates);
  const addToast = useSchematicStore((s) => s.addToast);
  const customConnectorTypes = useSchematicStore((s) => s.customConnectorTypes);
  const addCustomConnectorTypes = useSchematicStore((s) => s.addCustomConnectorTypes);

  const [tab, setTab] = useState<Tab>("json");
  const [text, setText] = useState("");
  const [signalTypeReplacement, setSignalTypeReplacement] = useState<SignalType>("custom");
  const [libraryNote, setLibraryNote] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, Partial<DeviceTemplate>>>({});
  const [savingShared, setSavingShared] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedResult = useMemo(() => {
    if (!text.trim()) return null;
    return tab === "json" ? parseJsonImport(text) : parseCsvImport(text);
  }, [text, tab, customConnectorTypes]);

  const result = useMemo(() => {
    if (!parsedResult) return null;
    const templates = parsedResult.templates.map((pt) => {
      const key = rowKey(pt);
      const override = templateOverrides[key] ?? {};
      const template = { ...pt.template, ...override } as DeviceTemplate;
      const validation = validateTemplate(template);
      return { ...pt, template, validation };
    });
    return { ...parsedResult, templates };
  }, [parsedResult, templateOverrides]);

  const selectedTemplates = (result?.templates ?? []).filter(
    (pt) => !skipped.has(rowKey(pt)) && pt.validation.ok,
  );
  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pt of result?.templates ?? []) {
      const manufacturer = (pt.template.manufacturer ?? "").trim().toLowerCase();
      if (!manufacturer) continue;
      counts.set(manufacturer, (counts.get(manufacturer) ?? 0) + 1);
    }
    return counts;
  }, [result]);
  const unknownConnectorTypes = useMemo(() => {
    if (!result) return [];
    const found = new Set<string>();
    for (const pt of result.templates) {
      for (const error of pt.validation.errors) {
        const match = error.match(/unknown connectorType "([^"]+)"/i);
        if (match?.[1]) found.add(match[1]);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [result]);

  const unknownSignalTypes = useMemo(() => {
    if (!result || tab !== "json") return [];
    const found = new Set<string>();
    for (const pt of result.templates) {
      for (const error of pt.validation.errors) {
        const match = error.match(/unknown signalType "([^"]+)"/i);
        if (match?.[1]) found.add(match[1]);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [result, tab]);

  const handleAddUnknownConnectorTypes = () => {
    if (unknownConnectorTypes.length === 0) return;
    const added = addCustomConnectorTypes(unknownConnectorTypes);
    if (added.length > 0) {
      addToast(
        `Added ${added.length} custom connector type${added.length === 1 ? "" : "s"} locally`,
        "success",
      );
    }
  };

  const applyTemplateOverride = (pt: ParsedTemplate, patch: Partial<DeviceTemplate>) => {
    const key = rowKey(pt);
    applyTemplateOverrideByKey(key, patch);
  };

  const applyTemplateOverrideByKey = (key: string, patch: Partial<DeviceTemplate>) => {
    setTemplateOverrides((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {}),
        ...patch,
      },
    }));
    setSkipped((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const applyReferenceUrlToBrand = (manufacturer: string, referenceUrl: string) => {
    const brand = manufacturer.trim().toLowerCase();
    if (!brand || brand === "generic") return;
    for (const pt of result?.templates ?? []) {
      if ((pt.template.manufacturer ?? "").trim().toLowerCase() !== brand) continue;
      applyTemplateOverrideByKey(rowKey(pt), { referenceUrl });
    }
  };

  const handleRemapUnknownSignalTypes = () => {
    if (unknownSignalTypes.length === 0) return;
    const rewritten = remapUnknownSignalTypes(text, unknownSignalTypes, signalTypeReplacement);
    if (!rewritten) {
      addToast("Could not rewrite the JSON with the selected signal type", "error");
      return;
    }
    setText(rewritten);
    setSaveError(null);
    addToast(
      `Mapped ${unknownSignalTypes.length} unknown signal type${unknownSignalTypes.length === 1 ? "" : "s"} to ${SIGNAL_LABELS[signalTypeReplacement] ?? signalTypeReplacement}`,
      "success",
    );
  };

  if (!open) return null;

  const close = () => {
    setText("");
    setSkipped(new Set());
    setTemplateOverrides({});
    setLibraryNote("");
    setSaveError(null);
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
    setTemplateOverrides({});
    setSkipped(new Set());
    setSaveError(null);
    e.target.value = "";
  };

  const loadSample = () => {
    setText(tab === "json" ? SAMPLE_JSON : SAMPLE_CSV);
    setTemplateOverrides({});
    setSkipped(new Set());
    setSaveError(null);
  };

  const handleAddLocalOnly = () => {
    if (selectedTemplates.length === 0) return;
    importCustomTemplates(selectedTemplates.map((pt) => pt.template));
    addToast(`Added ${selectedTemplates.length} template${selectedTemplates.length === 1 ? "" : "s"} locally`, "success");
    close();
  };

  const handleAddToTatesideLibrary = async () => {
    if (selectedTemplates.length === 0) return;
    setSavingShared(true);
    const source = tab === "json" ? "bulk-json" : "bulk-csv";
    const templates = selectedTemplates.map((pt) => {
      const { id, version, ...data } = pt.template as DeviceTemplate & { version?: number };
      void id; void version;
      return data;
    });

    try {
      setSaveError(null);
      const result = await saveTatesideDeviceTemplates(templates, { note: libraryNote || undefined, source });
      importCustomTemplates(result.templates.length > 0 ? result.templates : selectedTemplates.map((pt) => pt.template));
      await onLibraryChanged?.();
      addToast(
        `Added ${selectedTemplates.length} template${selectedTemplates.length === 1 ? "" : "s"} to TateSide library`,
        "success",
      );
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add devices to TateSide library";
      setSaveError(message);
      addToast(message, "error");
    } finally {
      setSavingShared(false);
    }
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
            Bulk-add device templates to the shared TateSide library, with a local-only fallback while the API is being built. See the{" "}
            <a href="https://docs.easyschematic.live/import-devices" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              import guide
            </a>{" "}
            for sample files and walkthroughs, or the{" "}
            <a href="https://docs.easyschematic.live/device-template-schema" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              schema reference
            </a>{" "}
            for the full field list.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
          {(["json", "csv"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setText(""); setSkipped(new Set()); setTemplateOverrides({}); setSaveError(null); }}
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
            onChange={(e) => {
              setText(e.target.value);
              if (saveError) setSaveError(null);
            }}
            placeholder={tab === "json" ? "Paste device JSON here…" : "Paste CSV here…"}
            className="w-full h-32 px-2 py-1 text-[11px] font-mono rounded border outline-none focus:border-blue-500 resize-y"
            style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />

          {saveError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
              <div className="text-xs font-semibold text-red-800 mb-1">Could not add to TateSide library</div>
              <div className="text-[11px] text-red-700 whitespace-pre-wrap">{saveError}</div>
            </div>
          )}

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

              {unknownConnectorTypes.length > 0 && (
                <div className="mb-2 px-3 py-2 rounded bg-amber-50 border border-amber-200">
                  <div className="text-xs font-semibold text-amber-900 mb-1">New connector type(s) found</div>
                  <div className="text-[11px] text-amber-800">
                    {unknownConnectorTypes.join(", ")}. Add them to the app so these devices import with their original port types?
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={handleAddUnknownConnectorTypes}
                      className="px-2 py-1 rounded bg-amber-600 text-white text-[11px] hover:bg-amber-500 cursor-pointer"
                    >
                      Add port type(s)
                    </button>
                  </div>
                </div>
              )}

              {unknownSignalTypes.length > 0 && tab === "json" && (
                <div className="mb-2 px-3 py-2 rounded bg-sky-50 border border-sky-200">
                  <div className="text-xs font-semibold text-sky-900 mb-1">Unknown signal type(s) found</div>
                  <div className="text-[11px] text-sky-800">
                    {unknownSignalTypes.join(", ")}. Pick a known signal type to use for all of them during import.
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={signalTypeReplacement}
                      onChange={(e) => setSignalTypeReplacement(e.target.value as SignalType)}
                      className="px-2 py-1 rounded border border-sky-200 bg-white text-[11px] text-[var(--color-text)] outline-none focus:border-sky-400"
                    >
                      {ALL_SIGNAL_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {SIGNAL_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleRemapUnknownSignalTypes}
                      className="px-2 py-1 rounded bg-sky-600 text-white text-[11px] hover:bg-sky-500 cursor-pointer"
                    >
                      Remap signal types
                    </button>
                  </div>
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
                        key={rowKey(pt)}
                        pt={pt}
                        skipped={skipped.has(rowKey(pt))}
                        brandCount={brandCounts.get((pt.template.manufacturer ?? "").trim().toLowerCase()) ?? 0}
                        onToggle={() => toggleSkip(rowKey(pt))}
                        onApplyFix={(patch) => applyTemplateOverride(pt, patch)}
                        onApplyBrandUrl={applyReferenceUrlToBrand}
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
                Library note (optional)
              </label>
              <input
                value={libraryNote}
                onChange={(e) => setLibraryNote(e.target.value)}
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
            onClick={handleAddLocalOnly}
            disabled={selectedTemplates.length === 0 || savingShared}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-white text-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Adds only to this browser's local custom device library"
          >
            Add Locally Only
          </button>
          <button
            onClick={handleAddToTatesideLibrary}
            disabled={selectedTemplates.length === 0 || savingShared}
            className="px-4 py-1.5 rounded bg-blue-500 text-white text-xs hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {savingShared ? "Saving..." : `Add ${selectedTemplates.length} to TateSide Library`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  pt,
  skipped,
  brandCount,
  onToggle,
  onApplyFix,
  onApplyBrandUrl,
}: {
  pt: ParsedTemplate;
  skipped: boolean;
  brandCount: number;
  onToggle: () => void;
  onApplyFix: (patch: Partial<DeviceTemplate>) => void;
  onApplyBrandUrl: (manufacturer: string, referenceUrl: string) => void;
}) {
  const t = pt.template;
  const errCount = pt.validation.errors.length;
  const warnCount = pt.validation.warnings.length;
  const badRow = errCount > 0;
  const needsDeviceType = pt.validation.errors.some((error) => error.toLowerCase().includes("devicetype is required"))
    || pt.validation.errors.some((error) => error.toLowerCase().includes("unknown devicetype"));
  const needsReferenceUrl = !t.referenceUrl || !/^https?:\/\//i.test(t.referenceUrl);
  const manufacturer = (t.manufacturer ?? "").trim();
  const deviceTypeSuggestions = getDeviceTypeSuggestions(t);
  const currentIsKnownType = t.deviceType ? Boolean(DEVICE_TYPE_TO_CATEGORY[t.deviceType]) : false;
  const deviceTypeOptions = currentIsKnownType
    ? [t.deviceType, ...ALL_DEVICE_TYPES.filter((type) => type !== t.deviceType)]
    : ALL_DEVICE_TYPES;

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
        {needsDeviceType && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                Choose a known type
              </span>
              {deviceTypeSuggestions.length > 0 && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Suggestions: {deviceTypeSuggestions.slice(0, 3).map((type) => DEVICE_TYPE_LABELS[type] ?? type).join(", ")}
                </span>
              )}
            </div>
            <select
              value={t.deviceType && deviceTypeOptions.includes(t.deviceType) ? t.deviceType : ""}
              onChange={(e) => {
                const nextType = e.target.value;
                if (!nextType) return;
                onApplyFix({
                  deviceType: nextType,
                  ...(DEVICE_TYPE_TO_CATEGORY[nextType] ? { category: DEVICE_TYPE_TO_CATEGORY[nextType] } : {}),
                });
              }}
              className="w-full px-2 py-1 rounded border border-sky-200 bg-white text-[11px] text-[var(--color-text)] outline-none focus:border-sky-400"
            >
              <option value="">
                {t.deviceType ? `Current: ${DEVICE_TYPE_LABELS[t.deviceType] ?? t.deviceType} (unknown)` : "Select a known device type..."}
              </option>
              {deviceTypeSuggestions.length > 0 && (
                <optgroup label="Suggested matches">
                  {deviceTypeSuggestions.map((type) => (
                    <option key={`suggested-${type}`} value={type}>
                      {DEVICE_TYPE_LABELS[type] ?? type}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All device types">
                {deviceTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {DEVICE_TYPE_LABELS[type] ?? type}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        )}
        {needsReferenceUrl && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                Add a web address
              </span>
              {brandCount > 1 && manufacturer && manufacturer.toLowerCase() !== "generic" && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Shared brand: {brandCount} items
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={t.referenceUrl ?? ""}
                onChange={(e) => onApplyFix({ referenceUrl: e.target.value })}
                placeholder="https://example.com/product-page"
                className="flex-1 px-2 py-1 rounded border border-sky-200 bg-white text-[11px] text-[var(--color-text)] outline-none focus:border-sky-400"
              />
              {brandCount > 1 && manufacturer && manufacturer.toLowerCase() !== "generic" && (
                <button
                  onClick={() => onApplyBrandUrl(manufacturer, t.referenceUrl ?? "")}
                  disabled={!t.referenceUrl?.trim()}
                  className="px-2 py-1 rounded border border-sky-200 bg-sky-50 text-[10px] text-sky-700 hover:bg-sky-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title={`Apply this URL to all ${manufacturer} rows`}
                >
                  Apply to brand
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
