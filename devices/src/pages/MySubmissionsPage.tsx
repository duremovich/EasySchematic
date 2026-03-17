import { useState, useEffect } from "react";
import { fetchMySubmissions } from "../api";
import type { Submission } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function MySubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMySubmissions()
      .then(setSubmissions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Submissions</h1>
        <a href="#/submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          Submit New Device
        </a>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="mb-2">No submissions yet.</p>
          <a href="#/submit" className="text-sm text-blue-600 hover:text-blue-800">Submit your first device</a>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className="p-4 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-start justify-between">
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
                  <p className="text-xs text-slate-400 mt-1">
                    Submitted {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {s.templateId && (
                  <a href={`#/device/${s.templateId}`} className="text-xs text-blue-600 hover:text-blue-800">
                    View original
                  </a>
                )}
              </div>
              {s.status === "rejected" && s.reviewerNote && (
                <div className="mt-3 p-2 rounded bg-red-50 text-sm text-red-700">
                  <strong>Reviewer note:</strong> {s.reviewerNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
