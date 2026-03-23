import { useState, useEffect, type ReactNode } from "react";
import type { Port, SlotDefinition, DeviceTemplate } from "../../../src/types";
import { fetchTemplate, fetchDeviceTypes, fetchSearchTerms, fetchCategories, fetchTemplates, fetchDraft } from "../api";
import PortEditor from "./PortEditor";
import AutocompleteInput from "./AutocompleteInput";
import TagAutocompleteInput from "./TagAutocompleteInput";

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
}

interface DeviceFormProps {
  /** Template ID to load for editing */
  id?: string;
  /** Draft ID from main app cross-submission */
  draftId?: string;
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

export default function DeviceForm({ id, draftId, onSubmit, submitLabel = "Save", cancelHref, extraFields, footer }: DeviceFormProps) {
  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [category, setCategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [searchTerms, setSearchTerms] = useState("");
  const [color, setColor] = useState("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [slots, setSlots] = useState<SlotDefinition[]>([]);
  const [slotFamily, setSlotFamily] = useState("");
  const [powerDrawW, setPowerDrawW] = useState<string>("");
  const [powerCapacityW, setPowerCapacityW] = useState<string>("");
  const [voltage, setVoltage] = useState("");
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [knownSearchTerms, setKnownSearchTerms] = useState<string[]>([]);
  const [allTemplates, setAllTemplates] = useState<DeviceTemplate[]>([]);

  useEffect(() => {
    fetchDeviceTypes().then(setDeviceTypes);
    fetchCategories().then(setKnownCategories);
    fetchSearchTerms().then(setKnownSearchTerms);
    fetchTemplates().then(setAllTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchTemplate(id)
      .then((t) => {
        setLabel(t.label);
        setDeviceType(t.deviceType);
        setCategory(t.category ?? "");
        setManufacturer(t.manufacturer ?? "");
        setModelNumber(t.modelNumber ?? "");
        setReferenceUrl(t.referenceUrl ?? "");
        setSearchTerms(t.searchTerms?.join(", ") ?? "");
        setColor(t.color ?? "");
        setPorts(t.ports);
        setSlots(t.slots ?? []);
        setSlotFamily(t.slotFamily ?? "");
        setPowerDrawW(t.powerDrawW != null ? String(t.powerDrawW) : "");
        setPowerCapacityW(t.powerCapacityW != null ? String(t.powerCapacityW) : "");
        setVoltage(t.voltage ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!draftId || id) return; // don't load draft if editing an existing template
    setLoading(true);
    fetchDraft(draftId)
      .then((t: Record<string, unknown>) => {
        setLabel((t.label as string) ?? "");
        setDeviceType((t.deviceType as string) ?? "");
        setCategory((t.category as string) ?? "");
        setManufacturer((t.manufacturer as string) ?? "");
        setModelNumber((t.modelNumber as string) ?? "");
        setReferenceUrl((t.referenceUrl as string) ?? "");
        setColor((t.color as string) ?? "");
        setPorts((t.ports as Port[]) ?? []);
        setSlots((t.slots as SlotDefinition[]) ?? []);
        setSlotFamily((t.slotFamily as string) ?? "");
        setPowerDrawW(t.powerDrawW != null ? String(t.powerDrawW) : "");
        setPowerCapacityW(t.powerCapacityW != null ? String(t.powerCapacityW) : "");
        setVoltage((t.voltage as string) ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [draftId, id]);

  const handleSubmit = async () => {
    if (!label.trim()) { setError("Label is required"); return; }
    if (!deviceType.trim()) { setError("Device type is required"); return; }
    if (!category.trim()) { setError("Category is required"); return; }
    if (!manufacturer.trim()) { setError("Manufacturer is required (use \"Generic\" if not a specific brand)"); return; }
    const isGeneric = manufacturer.trim().toLowerCase() === "generic";
    if (!isGeneric && !modelNumber.trim()) { setError("Model number is required (unless manufacturer is Generic)"); return; }
    if (!isGeneric && !referenceUrl.trim()) { setError("Reference URL is required (unless manufacturer is Generic)"); return; }
    if (referenceUrl.trim() && !referenceUrl.trim().startsWith("https://")) { setError("Reference URL must start with https://"); return; }

    setSaving(true);
    setError("");

    try {
      await onSubmit({
        label: label.trim(),
        deviceType: deviceType.trim(),
        category: category.trim(),
        ports,
        manufacturer: manufacturer.trim(),
        ...(modelNumber.trim() && { modelNumber: modelNumber.trim() }),
        ...(referenceUrl.trim() && { referenceUrl: referenceUrl.trim() }),
        ...(color.trim() && { color: color.trim() }),
        ...(searchTerms.trim() && { searchTerms: searchTerms.split(",").map((s) => s.trim()).filter(Boolean) }),
        ...(slots.length > 0 && { slots }),
        ...(slotFamily.trim() && { slotFamily: slotFamily.trim() }),
        ...(powerDrawW.trim() && { powerDrawW: Number(powerDrawW) }),
        ...(powerCapacityW.trim() && { powerCapacityW: Number(powerCapacityW) }),
        ...(voltage.trim() && { voltage: voltage.trim() }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  const isGenericMfr = manufacturer.trim().toLowerCase() === "generic";

  return (
    <>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <label className="sm:col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Label *</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Device Type *</span>
          <AutocompleteInput value={deviceType} onChange={setDeviceType} suggestions={deviceTypes} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Category *</span>
          <AutocompleteInput value={category} onChange={setCategory} suggestions={knownCategories} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Manufacturer *</span>
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Blackmagic Design, or Generic" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Model Number {!isGenericMfr ? "*" : ""}</span>
          <input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="sm:col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Reference URL {!isGenericMfr ? "*" : ""}</span>
          <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://manufacturer.com/product-page" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 mt-1 block">{isGenericMfr ? "Optional for generic devices" : "Link to the manufacturer's product page for verification"}</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Search Terms</span>
          <TagAutocompleteInput value={searchTerms} onChange={setSearchTerms} suggestions={knownSearchTerms} placeholder="comma, separated, terms" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Power Draw (W)</span>
          <input type="number" min="0" value={powerDrawW} onChange={(e) => setPowerDrawW(e.target.value)} placeholder="e.g. 150" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 mt-1 block">Max power consumption from spec sheet</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Voltage</span>
          <input value={voltage} onChange={(e) => setVoltage(e.target.value)} placeholder="e.g. 100-240V" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        {deviceType.includes("power-distribution") && (
          <label>
            <span className="block text-sm font-medium text-slate-700 mb-1">Power Capacity (W)</span>
            <input type="number" min="0" value={powerCapacityW} onChange={(e) => setPowerCapacityW(e.target.value)} placeholder="e.g. 2400" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400 mt-1 block">Total supply capacity (distros only)</span>
          </label>
        )}
        {category === "Expansion Cards" && (
          <label>
            <span className="block text-sm font-medium text-slate-700 mb-1">Slot Family</span>
            <AutocompleteInput
              value={slotFamily}
              onChange={setSlotFamily}
              suggestions={[...new Set(allTemplates.filter((t) => t.slotFamily).map((t) => t.slotFamily!))]}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400 mt-1 block">Family this card belongs to (e.g. disguise-vfc)</span>
          </label>
        )}
        {extraFields}
      </div>

      <PortEditor ports={ports} onChange={setPorts} />

      {/* Expansion Slots */}
      <SlotEditor slots={slots} onChange={setSlots} allTemplates={allTemplates} />

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-slate-200">
        <div>{footer}</div>
        <div className="flex items-center gap-3">
          <a href={cancelHref} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
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
  const knownFamilies = [...new Set(allTemplates.filter((t) => t.slotFamily).map((t) => t.slotFamily!))];

  const addSlot = () => {
    const id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...slots, { id, label: `Slot ${slots.length + 1}`, slotFamily: "" }]);
    setOpen(true);
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
          className="text-sm font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
        >
          <span className={`text-[10px] text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          Expansion Slots
          {slots.length > 0 && <span className="text-xs text-slate-400 font-normal ml-1">({slots.length})</span>}
        </button>
        <button
          onClick={addSlot}
          className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          + Add Slot
        </button>
      </div>

      {open && slots.length === 0 && (
        <p className="text-xs text-slate-400 mb-2">No expansion slots defined. Add a slot for devices with modular card bays.</p>
      )}

      {open && slots.map((slot, i) => {
        const familyCards = allTemplates.filter((t) => t.slotFamily === slot.slotFamily);
        return (
          <div key={slot.id} className="border border-slate-200 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                value={slot.label}
                onChange={(e) => updateSlot(i, { label: e.target.value })}
                className="flex-1 px-2 py-1 rounded border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-xs text-slate-500 mb-1">Slot Family</label>
              <AutocompleteInput
                value={slot.slotFamily}
                onChange={(v) => updateSlot(i, { slotFamily: v })}
                suggestions={knownFamilies}
                className="w-full px-2 py-1 rounded border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Default Card */}
            {slot.slotFamily && familyCards.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Default Card</label>
                <select
                  value={slot.defaultCardId ?? ""}
                  onChange={(e) => updateSlot(i, { defaultCardId: e.target.value || undefined })}
                  className="w-full px-2 py-1 rounded border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
