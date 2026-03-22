import { useState } from "react";
import type { User } from "../api";
import { updateProfile } from "../api";

interface Props {
  user: User;
  onUpdate: (user: User) => void;
}

export default function ProfilePage({ user, onUpdate }: Props) {
  const [name, setName] = useState(user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateProfile({ name: name.trim() });
      onUpdate({ ...user, name: name.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const stats = user.stats ?? { total: 0, approved: 0, pending: 0, rejected: 0 };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Profile</h1>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="mb-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">Email</span>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>

        <div className="mb-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">Role</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 capitalize">
            {user.role}
          </span>
        </div>

        <label className="block mb-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">Display Name</span>
          <p className="text-xs text-slate-400 mb-1">
            This is shown on devices you contribute and the contributors page.
          </p>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            placeholder="How you want to be credited"
            maxLength={50}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {saved && <p className="mb-3 text-sm text-green-600">Saved!</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Submission Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total" value={stats.total} color="text-slate-700" />
          <StatCard label="Approved" value={stats.approved} color="text-green-600" />
          <StatCard label="Pending" value={stats.pending} color="text-yellow-600" />
          <StatCard label="Rejected" value={stats.rejected} color="text-red-600" />
        </div>
        {stats.total > 0 && (
          <a href="#/my-submissions" className="block mt-4 text-sm text-blue-600 hover:text-blue-800">
            View all submissions &rarr;
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
