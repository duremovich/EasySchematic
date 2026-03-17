import { useState } from "react";
import { createTemplate, updateTemplate, deleteTemplate, getAdminToken, clearAdminToken } from "../api";
import AuthGate from "../components/AuthGate";
import DeviceForm, { type DeviceFormData } from "../components/DeviceForm";

function Editor({ id }: { id?: string }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = !!id;

  const handleSubmit = async (data: DeviceFormData) => {
    const token = getAdminToken();
    if (!token) throw new Error("Not authenticated");

    try {
      if (isEdit) {
        await updateTemplate(id, data, token);
        window.location.hash = `#/device/${id}`;
      } else {
        const created = await createTemplate(data, token);
        window.location.hash = `#/device/${created.id}`;
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        clearAdminToken();
        throw new Error("Token expired or invalid. Please re-authenticate.");
      }
      throw e;
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
      // Re-throw so the form displays it — but delete errors are rare
      throw e;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">{isEdit ? "Edit Device" : "New Device"}</h1>

      <DeviceForm
        id={id}
        onSubmit={handleSubmit}
        submitLabel="Save"
        cancelHref={isEdit ? `#/device/${id}` : "#/"}
        footer={isEdit && (
          <>
            {!confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">
                Delete
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Are you sure?</span>
                <button onClick={handleDelete} className="px-3 py-1 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              </div>
            )}
          </>
        )}
      />
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
