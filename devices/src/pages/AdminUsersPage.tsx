import { useState, useEffect } from "react";
import { fetchUsers, updateUserRole, updateUserBan } from "../api";
import type { UserRecord } from "../api";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((data) => { if (!cancelled) setUsers(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleRoleChange = async (user: UserRecord, role: string) => {
    try {
      await updateUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleBanToggle = async (user: UserRecord) => {
    const newBanned = user.banned ? 0 : 1;
    try {
      await updateUserBan(user.id, !!newBanned);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, banned: newBanned } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update ban status");
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Users</h1>

      {users.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No users yet.</div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="py-2 px-3 font-medium text-slate-500">Email</th>
              <th className="py-2 px-3 font-medium text-slate-500">Name</th>
              <th className="py-2 px-3 font-medium text-slate-500">Role</th>
              <th className="py-2 px-3 font-medium text-slate-500">Status</th>
              <th className="py-2 px-3 font-medium text-slate-500">Joined</th>
              <th className="py-2 px-3 font-medium text-slate-500">Last Login</th>
              <th className="py-2 px-3 font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2 px-3">{u.email}</td>
                <td className="py-2 px-3 text-slate-500">{u.name || "—"}</td>
                <td className="py-2 px-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    className="px-2 py-1 rounded border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="contributor">contributor</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="py-2 px-3">
                  {u.banned ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">banned</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">active</span>
                  )}
                </td>
                <td className="py-2 px-3 text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="py-2 px-3 text-slate-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "—"}</td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => handleBanToggle(u)}
                    className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                      u.banned
                        ? "text-green-700 hover:bg-green-50"
                        : "text-red-600 hover:bg-red-50"
                    }`}
                  >
                    {u.banned ? "Unban" : "Ban"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
