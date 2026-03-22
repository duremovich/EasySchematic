import { useState, useEffect } from "react";
import { fetchPendingSubmissions } from "../api";
import type { Submission } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function ReviewQueuePage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPendingSubmissions()
      .then(setSubmissions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Review Queue</h1>

      {submissions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No pending submissions to review.
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <a
              key={s.id}
              href={`#/review/${s.id}`}
              className="block p-4 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">{s.data.label}</span>
                    <StatusBadge status={s.status} />
                    <span className="text-xs text-slate-400 capitalize">{s.action}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {s.data.deviceType}
                    {s.data.manufacturer && ` \u00b7 ${s.data.manufacturer}`}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm text-slate-500">{s.submitterEmail}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
