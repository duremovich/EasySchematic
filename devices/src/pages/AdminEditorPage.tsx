import { useState } from "react";
import { createTemplate, updateTemplate, deleteTemplate, getAdminToken, clearAdminToken } from "../api";
import type { User } from "../api";
import AuthGate from "../components/AuthGate";
import DeviceForm, { type DeviceFormData } from "../components/DeviceForm";
import { navigateTo } from "../navigate";

function Editor({ id, currentUser }: { id?: string; currentUser?: User | null }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const isEdit = !!id;
  const isAdmin = currentUser?.role === "admin";
  const hasToken = !!getAdminToken();
  const canDelete = isAdmin || hasToken;

  const handleSubmit = async (data: DeviceFormData) => {
    const token = getAdminToken();
    const sessionAuthed = currentUser?.role === "admin" || currentUser?.role === "moderator";
    if (!token && !sessionAuthed) throw new Error("Not authenticated");

    try {
      if (isEdit) {
        await updateTemplate(id, data, token);
        navigateTo(`/device/${id}`);
      } else {
        const created = await createTemplate(data, token);
        navigateTo(`/device/${created.id}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        if (token) clearAdminToken();
        throw new Error("Your session or token is invalid. Please sign in again.");
      }
      throw e;
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const token = getAdminToken();
    if (!token && !isAdmin) {
      setDeleteError("Admin access required to delete.");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteTemplate(id, token);
      navigateTo("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">{isEdit ? "Edit Device" : "New Device"}</h1>

      <DeviceForm
        id={id}
        onSubmit={handleSubmit}
        submitLabel="Save"
        cancelHref={isEdit ? `/device/${id}` : "/"}
        footer={isEdit && canDelete && (
          <div className="flex flex-col gap-2">
            {!confirmDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition-colors self-start">
                Delete
              </button>
            )}
            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Are you sure?</span>
                <button type="button" onClick={handleDelete} disabled={deleting} className="px-3 py-1 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {deleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="px-3 py-1 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              </div>
            )}
            {deleteError && <span className="text-xs text-red-600">{deleteError}</span>}
          </div>
        )}
      />
    </div>
  );
}

export default function AdminEditorPage({ id, currentUser }: { id?: string; currentUser?: User | null }) {
  return (
    <AuthGate user={currentUser}>
      <Editor id={id} currentUser={currentUser} />
    </AuthGate>
  );
}
