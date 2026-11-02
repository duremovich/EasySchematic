import { useState, useEffect, useRef, type ReactNode } from "react";
import type { Port, SlotDefinition, DeviceTemplate } from "../../../src/types";
import { buildBulkSlots } from "../../../src/slotBulk";
import { fetchTemplate, fetchSearchTerms, loadAllTemplates, fetchDraft, fetchManufacturers, fetchSubmission } from "../api";
import { linkClick } from "../navigate";
import PortEditor from "./PortEditor";
import DevicePreview from "./DevicePreview";
import AutocompleteInput from "./AutocompleteInput";
import SearchableSelect from "./SearchableSelect";
import TagInput from "./TagInput";
import { ALL_CATEGORIES, carriesPowerCapacity } from "../../../src/deviceTypeCategories";
import { useDeviceTypeCatalog } from "../hooks/useDeviceTypeCatalog";

const toKebab = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface DeviceFormData {
  label: string;
  deviceType: string;
  category: string;
  ports: Port[];
  manufacturer: string;
  modelNumber?: string;
  referenceUrl?: string;
  color?: string;
  searchTerms?: string[];
  slots?: SlotDefinition[];
  slotFamily?: string;
  powerDrawW?: number;
  powerCapacityW?: number;
  voltage?: string;
  thermalBtuh?: number;
  poeBudgetW?: number;
  poeDrawW?: number;
  heightMm?: number;
  widthMm?: number;
  depthMm?: number;
  weightKg?: number;
  isVenueProvided?: boolean;
  submitterNote?: string;
}

interface DeviceFormProps {
  /** Template ID to load for editing */
  id?: string;
  /** Draft ID from main app cross-submission */
  draftId?: string;
  /** Template ID to clone as a new device */
  cloneId?: string;
  /** Pending submission ID — preload the form from the submission's data (edit-pending mode) */
  pendingSubmissionId?: string;
  /** Called with validated data on submit */
  onSubmit: (data: DeviceFormData) => Promise<void>;
  /** Text for the submit button */
  submitLabel?: string;
  /** Where the cancel link goes */
  cancelHref: string;
  /** Extra fields rendered inside the form grid (e.g. sort order) */
  extraFields?: ReactNode;
  /** Extra content rendered in the footer left side (e.g. delete button) */
  footer?: ReactNode;
}

export default function DeviceForm({ id, draftId, cloneId, pendingSubmissionId, onSubmit, submitLabel = "Save", cancelHref, extraFields, footer }: DeviceFormProps) {
  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [category, setCategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [color, setColor] = useState("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [slots, setSlots] = useState<SlotDefinition[]>([]);
  const [slotFamily, setSlotFamily] = useState("");
  const [powerDrawW, setPowerDrawW] = useState<string>("");
  const [powerCapacityW, setPowerCapacityW] = useState<string>("");
  const [voltage, setVoltage] = useState("");
  const [thermalBtuh, setThermalBtuh] = useState<string>("");
  const [poeBudgetW, setPoeBudgetW] = useState<string>("");
  const [poeDrawW, setPoeDrawW] = useState<string>("");
  const [heightMm, setHeightMm] = useState<string>("");
  const [widthMm, setWidthMm] = useState<string>("");
  const [depthMm, setDepthMm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [isVenueProvided, setIsVenueProvided] = useState(false);
  const [submitterNote, setSubmitterNote] = useState("");
  const [loading, setLoading] = useState(!!(id || cloneId || pendingSubmissionId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [customDeviceType, setCustomDeviceType] = useState(false);
  const [customDeviceTypeText, setCustomDeviceTypeText] = useState("");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(true);
  const [knownSearchTerms, setKnownSearchTerms] = useState<string[]>([]);
  const [knownManufacturers, setKnownManufacturers] = useState<string[]>([]);
  const [allTemplates, setAllTemplates] = useState<DeviceTemplate[]>([]);
  const categoryAutoRef = useRef(true);
  // Built-in + community device types (custom-types P1); built-ins only until /types answers.
  const { catalog: deviceTypes } = useDeviceTypeCatalog();

  useEffect(() => {
    fetchSearchTerms().then(setKnownSearchTerms);
    fetchManufacturers().then(setKnownManufacturers);
    loadAllTemplates().then(setAllTemplates).catch(() => {});
  }, []);

  // Auto-populate category from device type
  useEffect(() => {
    if (!categoryAutoRef.current) return;
    const mapped = deviceTypes.toCategory[deviceType];
    if (mapped) setCategory(mapped);
  }, [deviceType, deviceTypes]);

  useEffect(() => {
    if (!id) return;
    categoryAutoRef.current = false; // don't overwrite saved category when editing
    fetchTemplate(id)
      .then((t) => {
        setLabel(t.label);
        setDeviceType(t.deviceType);
        setCategory(t.category ?? "");
        setManufacturer(t.manufacturer ?? "");
        const m = t.modelNumber;
        setModelNumber(m && m !== "undefined" ? m : "");
        setReferenceUrl(t.referenceUrl ?? "");
        setSearchTerms(t.searchTerms ?? []);
        setColor(t.color ?? "");
        setPorts(t.ports);
        setSlots(t.slots ?? []);
        setSlotFamily(t.slotFamily ?? "");
        setPowerDrawW(t.powerDrawW != null ? String(t.powerDrawW) : "");
        setPowerCapacityW(t.powerCapacityW != null ? String(t.powerCapacityW) : "");
        setVoltage(t.voltage ?? "");
        setThermalBtuh((t as DeviceTemplate & { thermalBtuh?: number }).thermalBtuh != null ? String((t as DeviceTemplate & { thermalBtuh?: number }).thermalBtuh) : "");
        setPoeBudgetW(t.poeBudgetW != null ? String(t.poeBudgetW) : "");
        setPoeDrawW(t.poeDrawW != null ? String(t.poeDrawW) : "");
        setHeightMm(t.heightMm != null ? String(t.heightMm) : "");
        setWidthMm(t.widthMm != null ? String(t.widthMm) : "");
        setDepthMm(t.depthMm != null ? String(t.depthMm) : "");
        setWeightKg(t.weightKg != null ? String(t.weightKg) : "");
        setIsVenueProvided((t as DeviceTemplate & { isVenueProvided?: boolean }).isVenueProvided ?? false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!pendingSubmissionId) return;
    categoryAutoRef.current = false;
    fetchSubmission(pendingSubmissionId)
      .then((s) => {
        const t = s.data;
        setLabel(t.label ?? "");
        setDeviceType(t.deviceType ?? "");
        setCategory(t.category ?? "");
        setManufacturer(t.manufacturer ?? "");
        const m = t.modelNumber;
        setModelNumber(m && m !== "undefined" ? m : "");
        setReferenceUrl(t.referenceUrl ?? "");
        setSearchTerms(t.searchTerms ?? []);
        setColor(t.color ?? "");
        setPorts(t.ports ?? []);
        setSlots(t.slots ?? []);
        setSlotFamily(t.slotFamily ?? "");
        setPowerDrawW(t.powerDrawW != null ? String(t.powerDrawW) : "");
        setPowerCapacityW(t.powerCapacityW != null ? String(t.powerCapacityW) : "");
        setVoltage(t.voltage ?? "");
        const thermal = (t as DeviceTemplate & { thermalBtuh?: number }).thermalBtuh;
        setThermalBtuh(thermal != null ? String(thermal) : "");
        setPoeBudgetW(t.poeBudgetW != null ? String(t.poeBudgetW) : "");
        setPoeDrawW(t.poeDrawW != null ? String(t.poeDrawW) : "");
        setHeightMm(t.heightMm != null ? String(t.heightMm) : "");
        setWidthMm(t.widthMm != null ? String(t.widthMm) : "");
        setDepthMm(t.depthMm != null ? String(t.depthMm) : "");
        setWeightKg(t.weightKg != null ? String(t.weightKg) : "");
        setIsVenueProvided((t as DeviceTemplate & { isVenueProvided?: boolean }).isVenueProvided ?? false);
        // Preload submitter note. Strip any auto-prepended "Suggested device type:"
        // line — it gets re-added on submit if customDeviceType is toggled.
        const note = (s.submitterNote ?? "").replace(/^Suggested device type:.*\n?/m, "").trim();
        setSubmitterNote(note);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [pendingSubmissionId]);

  useEffect(() => {
    if (!cloneId || id || pendingSubmissionId) return; // don't clone if editing an existing template or pending submission
    categoryAutoRef.current = false;
    fetchTemplate(cloneId)
      .then((t) => {
        setLabel(""); // clear label to encourage a new name
        setDeviceType(t.deviceType);
        setCategory(t.category ?? "");
        setManufacturer(t.manufacturer ?? "");
        const m = t.modelNumber;
        setModelNumber(m && m !== "undefined" ? m : "");
        setReferenceUrl(t.referenceUrl ?? "");
        setSearchTerms(t.searchTerms ?? []);
        setColor(t.color ?? "");
        setPorts(t.ports);
        setSlots(t.slots ?? []);
        setSlotFamily(t.slotFamily ?? "");
        setPowerDrawW(t.powerDrawW != null ? String(t.powerDrawW) : "");
        setPowerCapacityW(t.powerCapacityW != null ? String(t.powerCapacityW) : "");
        setVoltage(t.voltage ?? "");
        setThermalBtuh((t as DeviceTemplate & { thermalBtuh?: number }).thermalBtuh != null ? String((t as DeviceTemplate & { thermalBtuh?: number }).thermalBtuh) : "");
        setPoeBudgetW(t.poeBudgetW != null ? String(t.poeBudgetW) : "");
        setPoeDrawW(t.poeDrawW != null ? String(t.poeDrawW) : "");
        setHeightMm(t.heightMm != null ? String(t.heightMm) : "");
        setWidthMm(t.widthMm != null ? String(t.widthMm) : "");
        setDepthMm(t.depthMm != null ? String(t.depthMm) : "");
        setWeightKg(t.weightKg != null ? String(t.weightKg) : "");
        setIsVenueProvided((t as DeviceTemplate & { isVenueProvided?: boolean }).isVenueProvided ?? false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [cloneId, id]);

  useEffect(() => {
    if (!draftId || id || pendingSubmissionId) return; // don't load draft if editing an existing template or pending submission
    setLoading(true);
    fetchDraft(draftId)
      .then((t: Record<string, unknown>) => {
        setLabel((t.label as string) ?? "");
        setDeviceType((t.deviceType as string) ?? "");
        setCategory((t.category as string) ?? "");
        setManufacturer((t.manufacturer as string) ?? "");
        const m = t.modelNumber as string | undefined;
        setModelNumber(m && m !== "undefined" ? m : "");
        setReferenceUrl((t.referenceUrl as string) ?? "");
        setColor((t.color as string) ?? "");
        setPorts((t.ports as Port[]) ?? []);
        setSlots((t.slots as SlotDefinition[]) ?? []);
        setSlotFamily((t.slotFamily as string) ?? "");
        setPowerDrawW(t.powerDrawW != null ? String(t.powerDrawW) : "");
        setPowerCapacityW(t.powerCapacityW != null ? String(t.powerCapacityW) : "");
        setVoltage((t.voltage as string) ?? "");
        setThermalBtuh(t.thermalBtuh != null ? String(t.thermalBtuh) : "");
        setPoeBudgetW(t.poeBudgetW != null ? String(t.poeBudgetW) : "");
        setPoeDrawW(t.poeDrawW != null ? String(t.poeDrawW) : "");
        setHeightMm(t.heightMm != null ? String(t.heightMm) : "");
        setWidthMm(t.widthMm != null ? String(t.widthMm) : "");
        setDepthMm(t.depthMm != null ? String(t.depthMm) : "");
        setWeightKg(t.weightKg != null ? String(t.weightKg) : "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [draftId, id]);

  const getWarningsList = (): string[] => {
    const w: string[] = [];
    const otherConnectors = ports.filter((p) => p.connectorType === "other").length;
    if (otherConnectors > 0) w.push(`${otherConnectors} port${otherConnectors > 1 ? "s" : ""} use "Other" connector. If a specific type exists, please select it.`);
    const customSignals = ports.filter((p) => p.signalType === "custom").length;
    if (customSignals > 0) w.push(`${customSignals} port${customSignals > 1 ? "s" : ""} use "Custom" signal type. Is there a standard type that fits?`);
    if (customDeviceType) w.push("You're suggesting a new device type. A moderator will need to review and add it.");
    if (ports.length === 0) w.push("This device has no ports defined.");
    return w;
  };

  const doSubmit = async () => {
    const effectiveDeviceType = customDeviceType
      ? toKebab(customDeviceTypeText)
      : deviceType.trim();

    setSaving(true);
    setError("");
    setShowWarnings(false);

    const cleanModel = modelNumber.trim();

    try {
      await onSubmit({
        label: label.trim(),
        deviceType: effectiveDeviceType,
        category: category.trim(),
        ports,
        manufacturer: manufacturer.trim(),
        ...(cleanModel && cleanModel !== "undefined" && { modelNumber: cleanModel }),
        ...(referenceUrl.trim() && { referenceUrl: referenceUrl.trim() }),
        ...(color.trim() && { color: color.trim() }),
        ...(searchTerms.length > 0 && { searchTerms }),
        ...(slots.length > 0 && { slots }),
        ...(slotFamily.trim() && { slotFamily: slotFamily.trim() }),
        ...(powerDrawW.trim() && { powerDrawW: Number(powerDrawW) }),
        ...(powerCapacityW.trim() && carriesPowerCapacity(effectiveDeviceType) && { powerCapacityW: Number(powerCapacityW) }),
        ...(voltage.trim() && { voltage: voltage.trim() }),
        ...(thermalBtuh.trim() && { thermalBtuh: Number(thermalBtuh) }),
        ...(poeBudgetW.trim() && { poeBudgetW: Number(poeBudgetW) }),
        ...(poeDrawW.trim() && { poeDrawW: Number(poeDrawW) }),
        ...(heightMm.trim() && { heightMm: Number(heightMm) }),
        ...(widthMm.trim() && { widthMm: Number(widthMm) }),
        ...(depthMm.trim() && { depthMm: Number(depthMm) }),
        ...(weightKg.trim() && { weightKg: Number(weightKg) }),
        ...(isVenueProvided && { isVenueProvided: true }),
        ...(() => {
          const parts: string[] = [];
          if (customDeviceType && customDeviceTypeText.trim()) parts.push(`Suggested device type: "${customDeviceTypeText.trim()}" (${toKebab(customDeviceTypeText)})`);
          if (submitterNote.trim()) parts.push(submitterNote.trim());
          return parts.length > 0 ? { submitterNote: parts.join("\n") } : {};
        })(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!label.trim()) { setError("Device name is required"); return; }
    const effectiveDeviceType = customDeviceType ? toKebab(customDeviceTypeText) : deviceType.trim();
    if (!effectiveDeviceType) { setError("Device type is required"); return; }
    if (!category.trim()) { setError("Category is required"); return; }
    if (!manufacturer.trim()) { setError("Manufacturer is required (use \"Generic\" if not a specific brand)"); return; }
    const isGeneric = manufacturer.trim().toLowerCase() === "generic";
    if (!isGeneric && !modelNumber.trim()) { setError("Model number is required (unless manufacturer is Generic)"); return; }
    if (!isGeneric && !referenceUrl.trim()) { setError("Reference URL is required (unless manufacturer is Generic)"); return; }
    if (referenceUrl.trim() && !/^https?:\/\//i.test(referenceUrl.trim())) { setError("Reference URL must start with http:// or https://"); return; }

    setError("");
    const w = getWarningsList();
    if (w.length > 0) {
      setWarnings(w);
      setShowWarnings(true);
      return;
    }

    await doSubmit();
  };

  if (loading) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading...</div>;

  const isGenericMfr = manufacturer.trim().toLowerCase() === "generic";

  const previewDeviceType = customDeviceType ? toKebab(customDeviceTypeText) : deviceType;
  const preview = (
    <DevicePreview
      label={label}
      deviceType={previewDeviceType}
      ports={ports}
    />
  );

  return (
    <>
      {/* Live preview — collapsible, above the form at every width. A right-hand
          side rail squeezed the form fields too hard; centered-on-top keeps both
          the preview and the inputs readable (playtest feedback, 2026-07-09).
          items-start stops the flex row from clamping the card's height to the
          scroll container, which visually cut the node off on long port lists. */}
      <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <button
          type="button"
          onClick={() => setMobilePreviewOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <span>Node preview</span>
          <span className={`text-[10px] text-slate-400 dark:text-slate-500 transition-transform ${mobilePreviewOpen ? "rotate-90" : ""}`}>▶</span>
        </button>
        {mobilePreviewOpen && (
          <div className="px-4 pb-4 flex justify-center items-start max-h-[60vh] overflow-auto">
            {preview}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Device Name *</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <div>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Device Type *</span>
          {customDeviceType ? (
            <div>
              <div className="flex gap-2 items-center">
                <input
                  value={customDeviceTypeText}
                  onChange={(e) => setCustomDeviceTypeText(e.target.value)}
                  placeholder="e.g. Commentary Box"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={() => { setCustomDeviceType(false); setCustomDeviceTypeText(""); }} className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 whitespace-nowrap">Back to list</button>
              </div>
              {customDeviceTypeText.trim() && (
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  Will be saved as: <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">{toKebab(customDeviceTypeText)}</code>
                </span>
              )}
              <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 block">A moderator will review and add this new device type.</span>
            </div>
          ) : (
            <SearchableSelect
              value={deviceType}
              onChange={(v) => { setDeviceType(v); categoryAutoRef.current = true; }}
              groups={deviceTypes.byCategory}
              labels={deviceTypes.labels}
              placeholder="Search device types..."
              allowOther={{ label: "Other \u2014 suggest new type", onSelect: (q) => { setCustomDeviceType(true); setCustomDeviceTypeText(q); } }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <div>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category *</span>
          {!customDeviceType && deviceTypes.toCategory[deviceType] ? (
            <div className="flex items-center gap-2">
              <input value={category} readOnly className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300 cursor-default" />
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">Auto-filled</span>
            </div>
          ) : (
            <SearchableSelect
              value={category}
              onChange={(v) => { setCategory(v); categoryAutoRef.current = false; }}
              options={ALL_CATEGORIES}
              labels={Object.fromEntries(ALL_CATEGORIES.map((c) => [c, c]))}
              placeholder="Select category..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Manufacturer *</span>
          <AutocompleteInput value={manufacturer} onChange={setManufacturer} suggestions={knownManufacturers} placeholder="e.g. Blackmagic Design, or Generic" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Model Number {!isGenericMfr ? "*" : ""}</span>
          <input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="sm:col-span-2">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Reference URL {!isGenericMfr ? "*" : ""}</span>
          <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://manufacturer.com/product/specs" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">{isGenericMfr ? "Optional for generic devices" : "Link to the manufacturer's specifications page (not marketing overview) for verification"}</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Search Terms</span>
          <TagInput
            tags={searchTerms}
            onChange={setSearchTerms}
            suggestions={knownSearchTerms}
            autoSuggestions={(() => {
              const auto: string[] = [];
              if (manufacturer.trim() && manufacturer.trim().toLowerCase() !== "generic") auto.push(manufacturer.trim().toLowerCase());
              if (modelNumber.trim()) auto.push(modelNumber.trim().toLowerCase());
              // Add words from device type label
              const dtLabel = deviceTypes.labels[deviceType];
              if (dtLabel) dtLabel.split(" ").forEach((w) => { if (w.length > 2) auto.push(w.toLowerCase()); });
              return [...new Set(auto)];
            })()}
            placeholder="Type a tag and press Enter..."
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Power Draw (W)</span>
          <input type="number" min="0" value={powerDrawW} onChange={(e) => setPowerDrawW(e.target.value)} placeholder="e.g. 150" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Max power consumption from spec sheet</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Voltage</span>
          <input value={voltage} onChange={(e) => setVoltage(e.target.value)} placeholder="e.g. 100-240V" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Thermal (BTU/h)</span>
          <input
            type="number"
            min="0"
            value={thermalBtuh}
            onChange={(e) => setThermalBtuh(e.target.value)}
            placeholder={(() => {
              const w = Number(powerDrawW);
              return w > 0 ? `auto: ${Math.round(w * 3.412)}` : "e.g. 512";
            })()}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Leave blank to auto-derive from power draw (W × 3.412)</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Height (mm)</span>
          <input type="number" min="1" step="1" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} placeholder="e.g. 44" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Chassis height from spec sheet (1U = 44mm)</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Width (mm)</span>
          <input type="number" min="1" step="1" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} placeholder="e.g. 482" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Chassis width from spec sheet (19" rack = 482mm)</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Depth (mm)</span>
          <input type="number" min="1" step="1" value={depthMm} onChange={(e) => setDepthMm(e.target.value)} placeholder="e.g. 350" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Chassis depth from spec sheet</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Weight (kg)</span>
          <input type="number" min="0" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 2.5" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Device weight from spec sheet</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isVenueProvided} onChange={(e) => setIsVenueProvided(e.target.checked)} className="cursor-pointer" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Venue provided (exclude from pack list)</span>
        </label>
        {carriesPowerCapacity(previewDeviceType) && (
          <label>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Power Capacity (W)</span>
            <input type="number" min="0" value={powerCapacityW} onChange={(e) => setPowerCapacityW(e.target.value)} placeholder="e.g. 2400" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Total supply/output capacity (distros and power supplies)</span>
          </label>
        )}
        {ports.some((p) => p.connectorType === "rj45" || p.connectorType === "ethercon") && (
          <label>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PoE Source Budget (W)</span>
            <input type="number" min="0" value={poeBudgetW} onChange={(e) => setPoeBudgetW(e.target.value)} placeholder="e.g. 370" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Total PoE budget this device supplies (leave blank if not a PoE source)</span>
          </label>
        )}
        {ports.some((p) => p.connectorType === "rj45" || p.connectorType === "ethercon") && (
          <label>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PoE Draw (W)</span>
            <input type="number" min="0" step="0.1" value={poeDrawW} onChange={(e) => setPoeDrawW(e.target.value)} placeholder="e.g. 12.95" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Power this device consumes via PoE (leave blank if not PoE-powered)</span>
          </label>
        )}
        {category === "Expansion Cards" && (
          <label>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Slot Family</span>
            <input
              value={slotFamily}
              onChange={(e) => setSlotFamily(e.target.value)}
              list="slot-families"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="slot-families">
              {[...new Set(allTemplates.filter((t) => t.slotFamily).map((t) => t.slotFamily!))].map((f) => <option key={f} value={f} />)}
            </datalist>
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">Family this card belongs to (e.g. disguise-vfc)</span>
          </label>
        )}
        {extraFields}
      </div>

      <PortEditor ports={ports} onChange={setPorts} deviceType={deviceType} />

      {/* Expansion Slots */}
      <SlotEditor slots={slots} onChange={setSlots} allTemplates={allTemplates} />

      <label className="block mt-8">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes to Moderators</span>
        <textarea
          value={submitterNote}
          onChange={(e) => setSubmitterNote(e.target.value)}
          placeholder="e.g., This device has a connector type not listed, so I used the closest match…"
          rows={3}
          maxLength={1000}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
        <span className="text-xs text-slate-400 mt-1 block">Optional — anything the reviewer should know about this submission</span>
      </label>

      {/* Warnings confirmation dialog */}
      {showWarnings && (
        <div className="mt-6 p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Review before submitting</h3>
          <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 mb-4">
            {warnings.map((w, i) => <li key={i} className="flex gap-2"><span className="shrink-0">&#9888;</span> {w}</li>)}
          </ul>
          <div className="flex gap-3">
            <button onClick={() => setShowWarnings(false)} className="px-4 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors">Go Back</button>
            <button onClick={doSubmit} disabled={saving} className="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {saving ? "Submitting..." : "Submit Anyway"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
        <div>{footer}</div>
        <div className="flex items-center gap-3">
          <a href={cancelHref} onClick={linkClick} className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </a>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}

// ==================== Slot Editor ====================

/** Mirrors MAX_SLOTS in api/src/validate.ts — the API rejects a template with more slots. */
const MAX_SLOTS = 128;

function SlotEditor({
  slots,
  onChange,
  allTemplates,
}: {
  slots: SlotDefinition[];
  onChange: (slots: SlotDefinition[]) => void;
  allTemplates: DeviceTemplate[];
}) {
  const [open, setOpen] = useState(slots.length > 0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState("Slot");
  const [bulkStart, setBulkStart] = useState(1);
  const [bulkCount, setBulkCount] = useState(4);
  const [bulkFamily, setBulkFamily] = useState("");
  const knownFamilies = [...new Set(allTemplates.filter((t) => t.slotFamily).map((t) => t.slotFamily!))];

  const addSlot = () => {
    const id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...slots, { id, label: `Slot ${slots.length + 1}`, slotFamily: "" }]);
    setOpen(true);
  };

  const bulkRoom = Math.max(0, MAX_SLOTS - slots.length);
  const bulkCanAdd = !!bulkPrefix.trim() && !!bulkFamily.trim() && Math.floor(bulkCount) >= 1 && bulkRoom > 0;

  const addBulkSlots = () => {
    // The API rejects an empty slotFamily and more than MAX_SLOTS slots, so a bulk add that
    // violated either would just produce N failing slots.
    const count = Math.min(Math.floor(bulkCount), bulkRoom);
    const start = Math.floor(bulkStart);
    if (!bulkPrefix.trim() || !bulkFamily.trim() || !(count >= 1) || !Number.isFinite(start)) return;
    const stamp = Date.now();
    const created: SlotDefinition[] = buildBulkSlots(bulkPrefix.trim(), start, count, bulkFamily.trim()).map((s, i) => ({
      id: `slot-${stamp}-${Math.random().toString(36).slice(2, 6)}-${i}`,
      ...s,
    }));
    onChange([...slots, ...created]);
    setOpen(true);
    setBulkOpen(false);
  };

  const removeSlot = (index: number) => {
    onChange(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, patch: Partial<SlotDefinition>) => {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen(!open)}
          className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
        >
          <span className={`text-[10px] text-slate-400 dark:text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          Expansion Slots
          {slots.length > 0 && <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-1">({slots.length})</span>}
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => {
              if (!bulkOpen) setBulkStart(slots.length + 1);
              setBulkOpen(!bulkOpen);
              setOpen(true);
            }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            Bulk Add
          </button>
          <button
            onClick={addSlot}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
          >
            + Add Slot
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap gap-3 items-end">
          <label className="text-xs">
            <span className="block text-slate-500 dark:text-slate-400 mb-1">Prefix</span>
            <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} className="w-full sm:w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 dark:text-slate-400 mb-1">Start #</span>
            <input type="number" value={bulkStart} onChange={(e) => setBulkStart(+e.target.value)} className="w-full sm:w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 dark:text-slate-400 mb-1">Count</span>
            <input type="number" value={bulkCount} onChange={(e) => setBulkCount(+e.target.value)} className="w-full sm:w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 dark:text-slate-400 mb-1">Slot Family</span>
            <input
              value={bulkFamily}
              onChange={(e) => setBulkFamily(e.target.value)}
              list="slot-families-bulk"
              placeholder="e.g. yamaha-my"
              className="w-full sm:w-40 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
            />
            <datalist id="slot-families-bulk">
              {knownFamilies.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
          <button
            onClick={addBulkSlots}
            disabled={!bulkCanAdd}
            className="w-full sm:w-auto px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
          {!bulkFamily.trim() && (
            <p className="w-full text-xs text-slate-500 dark:text-slate-400">Slot family is required.</p>
          )}
          {bulkRoom === 0 ? (
            <p className="w-full text-xs text-amber-600 dark:text-amber-400">A device can have at most {MAX_SLOTS} slots.</p>
          ) : Math.floor(bulkCount) > bulkRoom ? (
            <p className="w-full text-xs text-amber-600 dark:text-amber-400">Only {bulkRoom} more slot{bulkRoom === 1 ? "" : "s"} fit (max {MAX_SLOTS}); the count will be capped.</p>
          ) : null}
        </div>
      )}

      {open && slots.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">No expansion slots defined. Add a slot for devices with modular card bays.</p>
      )}

      {open && slots.map((slot, i) => {
        const familyCards = allTemplates.filter((t) => t.slotFamily === slot.slotFamily);
        return (
          <div key={slot.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-3 bg-white dark:bg-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <input
                value={slot.label}
                onChange={(e) => updateSlot(i, { label: e.target.value })}
                className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Slot label (e.g. VFC Slot A)"
              />
              <button
                onClick={() => removeSlot(i)}
                className="text-red-400 hover:text-red-500 text-sm cursor-pointer px-1"
                title="Remove slot"
              >
                &times;
              </button>
            </div>

            {/* Slot Family */}
            <div className="mb-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Slot Family</label>
              <input
                value={slot.slotFamily}
                onChange={(e) => updateSlot(i, { slotFamily: e.target.value })}
                list="slot-families-inner"
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="slot-families-inner">
                {knownFamilies.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>

            {/* Default Card */}
            {slot.slotFamily && familyCards.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Default Card</label>
                <select
                  value={slot.defaultCardId ?? ""}
                  onChange={(e) => updateSlot(i, { defaultCardId: e.target.value || undefined })}
                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">(empty)</option>
                  {familyCards.map((card) => (
                    <option key={card.id} value={card.id!}>{card.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
