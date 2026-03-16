import { useState, type ReactNode } from "react";
import { getAdminToken, setAdminToken } from "../api";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [authed, setAuthed] = useState(!!getAdminToken());

  if (authed) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) { setError("Token required"); return; }
    setAdminToken(token.trim());
    setAuthed(true);
    setError("");
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Admin Authentication</h2>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter admin token"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Authenticate
        </button>
      </form>
    </div>
  );
}
