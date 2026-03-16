import { useState, useEffect } from "react";
import type { DeviceTemplate, Port } from "../../../src/types";
import { fetchTemplate, createTemplate, updateTemplate, deleteTemplate, getAdminToken, clearAdminToken } from "../api";
import AuthGate from "../components/AuthGate";
import PortEditor from "../components/PortEditor";

function Editor({ id }: { id?: string }) {
  const [label, setLabel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [searchTerms, setSearchTerms] = useState("");
  const [color, setColor] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = !!id;

  useEffect(() => {
    if (!id) return;
    fetchTemplate(id)
      .then((t) => {
        setLabel(t.label);
        setDeviceType(t.deviceType);
        setManufacturer(t.manufacturer ?? "");
        setModelNumber(t.modelNumber ?? "");
        setSearchTerms(t.searchTerms?.join(", ") ?? "");
        setColor(t.color ?? "");
        setPorts(t.ports);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    const token = getAdminToken();
    if (!token) { setError("Not authenticated"); return; }
    if (!label.trim()) { setError("Label is required"); return; }
    if (!deviceType.trim()) { setError("Device type is required"); return; }

    setSaving(true);
    setError("");

    const body: Omit<DeviceTemplate, "id" | "version"> = {
      label: label.trim(),
      deviceType: deviceType.trim(),
      ports,
      ...(manufacturer.trim() && { manufacturer: manufacturer.trim() }),
      ...(modelNumber.trim() && { modelNumber: modelNumber.trim() }),
      ...(color.trim() && { color: color.trim() }),
      ...(searchTerms.trim() && { searchTerms: searchTerms.split(",").map((s) => s.trim()).filter(Boolean) }),
    };

    try {
      if (isEdit) {
        await updateTemplate(id, body, token);
      } else {
        const created = await createTemplate(body, token);
        window.location.hash = `#/device/${created.id}`;
        return;
      }
      window.location.hash = `#/device/${id}`;
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        clearAdminToken();
        setError("Token expired or invalid. Please re-authenticate.");
      } else {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const token = getAdminToken();
    if (!token) return;

    try {
      await deleteTemplate(id, token);
      window.location.hash = "#/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">{isEdit ? "Edit Device" : "New Device"}</h1>

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
          <input value={deviceType} onChange={(e) => setDeviceType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Manufacturer</span>
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Model Number</span>
          <input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Search Terms</span>
          <input value={searchTerms} onChange={(e) => setSearchTerms(e.target.value)} placeholder="comma, separated, terms" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Color</span>
          <div className="flex items-center gap-2">
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#3b82f6" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {color && <span className="w-8 h-8 rounded border border-slate-200" style={{ backgroundColor: color }} />}
          </div>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-700 mb-1">Sort Order</span>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(+e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
      </div>

      <PortEditor ports={ports} onChange={setPorts} />

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
        <div>
          {isEdit && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Are you sure?</span>
              <button onClick={handleDelete} className="px-3 py-1 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors">Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a href={isEdit ? `#/device/${id}` : "#/"} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminEditorPage({ id }: { id?: string }) {
  return (
    <AuthGate>
      <Editor id={id} />
    </AuthGate>
  );
}
