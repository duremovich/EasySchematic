import { useState, useEffect } from "react";
import { fetchPendingSubmissions } from "../api";
import type { Submission } from "../api";
import StatusBadge from "../components/StatusBadge";
import ReviewGuidelines from "../components/ReviewGuidelines";
import { linkClick } from "../navigate";

const CLAIM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function claimAge(claimedAt: string | null): { expired: boolean; label: string } | null {
  if (!claimedAt) return null;
  const ms = Date.now() - new Date(claimedAt + "Z").getTime();
  if (ms > CLAIM_EXPIRY_MS) return { expired: true, label: "" };
  const min = Math.floor(ms / 60000);
  return { expired: false, label: min < 1 ? "just now" : `${min}m ago` };
}

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

      <ReviewGuidelines />

      {submissions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No pending submissions to review.
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <a
              key={s.id}
              href={`/review/${s.id}`}
              onClick={linkClick}
              className="block p-4 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">{s.data.label}</span>
                    <StatusBadge status={s.status} />
                    <span className="text-xs text-slate-400 capitalize">{s.action}</span>
                    {s.source && s.source !== "manual" && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wide"
                        title="Submitted via bulk import"
                      >
                        {s.source === "bulk-json" ? "bulk JSON" : "bulk CSV"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {s.data.deviceType}
                    {s.data.manufacturer && ` \u00b7 ${s.data.manufacturer}`}
                  </p>
                  {(() => {
                    const claim = claimAge(s.claimedAt);
                    if (!claim || claim.expired) return null;
                    const name = s.claimerName || s.claimerEmail || "Someone";
                    return <p className="text-xs text-amber-600 mt-0.5">{name} reviewing ({claim.label})</p>;
                  })()}
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
