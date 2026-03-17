import { useState, useEffect } from "react";
import type { Port } from "../../../src/types";
import { fetchTemplate, createSubmission, fetchDeviceTypes, fetchSearchTerms } from "../api";
import PortEditor from "../components/PortEditor";
import AutocompleteInput from "../components/AutocompleteInput";
import TagAutocompleteInput from "../components/TagAutocompleteInput";

interface Props {
  id?: string; // existing template ID for edit suggestions
}

export default function SubmitPage({ id }: Props) {
  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [searchTerms, setSearchTerms] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [color, setColor] = useState("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [knownSearchTerms, setKnownSearchTerms] = useState<string[]>([]);

  const isEdit = !!id;

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

    const data = {
      label: label.trim(),
      deviceType: deviceType.trim(),
      ports,
      manufacturer: manufacturer.trim(),
      ...(referenceUrl.trim() && { referenceUrl: referenceUrl.trim() }),
      ...(modelNumber.trim() && { modelNumber: modelNumber.trim() }),
      ...(color.trim() && { color: color.trim() }),
      ...(searchTerms.trim() && { searchTerms: searchTerms.split(",").map((s) => s.trim()).filter(Boolean) }),
    };

    try {
      await createSubmission(isEdit ? "update" : "create", data, id);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Submission received!</h2>
        <p className="text-sm text-slate-500 mb-4">
          Your {isEdit ? "edit suggestion" : "new device"} has been submitted for review. A moderator will review it shortly.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a href="#/my-submissions" className="text-sm text-blue-600 hover:text-blue-800">View my submissions</a>
          <span className="text-slate-300">|</span>
          <a href="#/" className="text-sm text-blue-600 hover:text-blue-800">Browse devices</a>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {isEdit ? "Suggest Edit" : "Submit New Device"}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {isEdit
          ? "Propose changes to an existing device template. A moderator will review your suggestion."
          : "Submit a new device template for the community library. A moderator will review it before it goes live."}
      </p>

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
          <span className="block text-sm font-medium text-slate-700 mb-1">Model Number {manufacturer.trim().toLowerCase() !== "generic" ? "*" : ""}</span>
          <input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Reference URL {manufacturer.trim().toLowerCase() !== "generic" ? "*" : ""}</span>
          <input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://manufacturer.com/product-page" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-slate-400 mt-1 block">{manufacturer.trim().toLowerCase() === "generic" ? "Optional for generic devices" : "Link to the manufacturer's product page for verification"}</span>
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
      </div>

      <PortEditor ports={ports} onChange={setPorts} />

      <div className="flex items-center justify-end mt-8 pt-6 border-t border-slate-200 gap-3">
        <a href={isEdit ? `#/device/${id}` : "#/"} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
          Cancel
        </a>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Submitting..." : "Submit for Review"}
        </button>
      </div>
    </div>
  );
}
