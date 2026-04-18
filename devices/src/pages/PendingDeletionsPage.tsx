import { useState, useEffect } from "react";
import { fetchPendingDeletions } from "../api";
import type { PendingDeletion } from "../api";
import { linkClick } from "../navigate";

function ageLabel(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
  if (isNaN(t)) return "";
  const ms = Date.now() - t;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export default function PendingDeletionsPage() {
  const [items, setItems] = useState<PendingDeletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPendingDeletions()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Pending Deletion</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Devices flagged for deletion by a moderator. Open one to restore it or confirm permanent deletion.
      </p>

      {items.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No devices flagged for deletion.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <a
              key={it.id}
              href={`/device/${it.id}`}
              onClick={linkClick}
              className="block p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20 hover:border-red-400 hover:shadow-sm transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{it.label}</span>
                    <span className="text-xs text-slate-400 capitalize">{it.deviceType.replace(/-/g, " ")}</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {it.manufacturer}
                    {it.modelNumber && ` \u00b7 ${it.modelNumber}`}
                  </p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap line-clamp-2">
                    {it.flaggedReason || "(no reason given)"}
                  </p>
                </div>
                <div className="sm:text-right text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  <p>{it.flaggedBy?.name ?? "Moderator"}</p>
                  <p>{ageLabel(it.flaggedAt)}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
