import { useState, useEffect, type ReactNode } from "react";
import type { Port } from "../../../src/types";
import { fetchTemplate, fetchDeviceTypes, fetchSearchTerms } from "../api";
import PortEditor from "./PortEditor";
import AutocompleteInput from "./AutocompleteInput";
import TagAutocompleteInput from "./TagAutocompleteInput";

export interface DeviceFormData {
  label: string;
  deviceType: string;
  ports: Port[];
  manufacturer: string;
  modelNumber?: string;
  referenceUrl?: string;
  color?: string;
  searchTerms?: string[];
}

interface DeviceFormProps {
  /** Template ID to load for editing */
  id?: string;
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

export default function DeviceForm({ id, onSubmit, submitLabel = "Save", cancelHref, extraFields, footer }: DeviceFormProps) {
  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [searchTerms, setSearchTerms] = useState("");
  const [color, setColor] = useState("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [knownSearchTerms, setKnownSearchTerms] = useState<string[]>([]);

  useEffect(() => {
    fetchDeviceTypes().then(setDeviceTypes);
    fetchSearchTerms().then(setKnownSearchTerms);
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchTemplate(id)
      .then((t) => {
        setLabel(t.label);
        setDeviceType(t.deviceType);
        setManufacturer(t.manufacturer ?? "");
        setModelNumber(t.modelNumber ?? "");
        setReferenceUrl(t.referenceUrl ?? "");
        setSearchTerms(t.searchTerms?.join(", ") ?? "");
        setColor(t.color ?? "");
        setPorts(t.ports);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!label.trim()) { setError("Label is required"); return; }
    if (!deviceType.trim()) { setError("Device type is required"); return; }
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
        ports,
        manufacturer: manufacturer.trim(),
        ...(modelNumber.trim() && { modelNumber: modelNumber.trim() }),
        ...(referenceUrl.trim() && { referenceUrl: referenceUrl.trim() }),
        ...(color.trim() && { color: color.trim() }),
        ...(searchTerms.trim() && { searchTerms: searchTerms.split(",").map((s) => s.trim()).filter(Boolean) }),
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

      <div className="grid grid-cols-2 gap-4 mb-8">
        <label className="col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Label *</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Device Type *</span>
          <AutocompleteInput value={deviceType} onChange={setDeviceType} suggestions={deviceTypes} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Manufacturer *</span>
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Blackmagic Design, or Generic" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Model Number {!isGenericMfr ? "*" : ""}</span>
          <input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Reference URL {!isGenericMfr ? "*" : ""}</span>
          <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://manufacturer.com/product-page" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 mt-1 block">{isGenericMfr ? "Optional for generic devices" : "Link to the manufacturer's product page for verification"}</span>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Search Terms</span>
          <TagAutocompleteInput value={searchTerms} onChange={setSearchTerms} suggestions={knownSearchTerms} placeholder="comma, separated, terms" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Color</span>
          <div className="flex items-center gap-2">
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#3b82f6" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {color && <span className="w-8 h-8 rounded border border-slate-200" style={{ backgroundColor: color }} />}
          </div>
        </label>
        {extraFields}
      </div>

      <PortEditor ports={ports} onChange={setPorts} />

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
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
