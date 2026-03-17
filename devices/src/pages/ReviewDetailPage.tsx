import { useState, useEffect } from "react";
import { fetchSubmission, fetchTemplate, approveSubmission, rejectSubmission } from "../api";
import type { Submission } from "../api";
import type { DeviceTemplate, Port } from "../../../src/types";
import { CONNECTOR_LABELS } from "../../../src/types";
import StatusBadge from "../components/StatusBadge";
import SignalBadge from "../components/SignalBadge";

export default function ReviewDetailPage({ id }: { id: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [existing, setExisting] = useState<DeviceTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    fetchSubmission(id)
      .then(async (s) => {
        setSubmission(s);
        if (s.action === "update" && s.templateId) {
          try {
            const t = await fetchTemplate(s.templateId);
            setExisting(t);
          } catch {
            // Template may have been deleted
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    setActing(true);
    try {
      await approveSubmission(id);
      setDone("approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await rejectSubmission(id, rejectNote || undefined);
      setDone("rejected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!submission) return <div className="p-8 text-center text-slate-500">Not found</div>;

  if (done) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${done === "approved" ? "bg-green-100" : "bg-red-100"}`}>
          {done === "approved" ? (
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <h2 className="text-xl font-semibold mb-2">Submission {done}</h2>
        <a href="#/review" className="text-sm text-blue-600 hover:text-blue-800">Back to review queue</a>
      </div>
    );
  }

  const proposed = submission.data;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <a href="#/review" className="text-sm text-blue-600 hover:text-blue-800">&larr; Review Queue</a>
        <StatusBadge status={submission.status} />
        <span className="text-xs text-slate-400 capitalize">{submission.action}</span>
      </div>

      {existing && submission.action === "update" ? (
        // Side-by-side diff for edits
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <h2 className="text-lg font-semibold text-slate-700 mb-3">Current</h2>
            <DeviceInfo data={existing} />
            <PortTable ports={existing.ports} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-blue-700 mb-3">Proposed</h2>
            <DeviceInfo data={proposed as DeviceTemplate} />
            <PortTable ports={(proposed.ports ?? []) as Port[]} />
          </div>
        </div>
      ) : (
        // Single view for new submissions
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-3">Proposed New Device</h2>
          <DeviceInfo data={proposed as DeviceTemplate} />
          <PortTable ports={(proposed.ports ?? []) as Port[]} />
        </div>
      )}

      {/* Actions */}
      {submission.status === "pending" && (
        <div className="border-t border-slate-200 pt-6">
          {showReject ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Rejection note (optional)</span>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Reason for rejection or feedback for the submitter..."
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows={3}
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReject}
                  disabled={acting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {acting ? "Rejecting..." : "Confirm Reject"}
                </button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleApprove}
                disabled={acting}
                className="px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {acting ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="px-6 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceInfo({ data }: { data: Pick<DeviceTemplate, "label" | "deviceType" | "manufacturer" | "modelNumber" | "color"> }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm mb-4">
      <div><span className="text-slate-500">Label:</span> <span className="font-medium">{data.label}</span></div>
      <div><span className="text-slate-500">Type:</span> {data.deviceType}</div>
      {data.manufacturer && <div><span className="text-slate-500">Manufacturer:</span> {data.manufacturer}</div>}
      {data.modelNumber && <div><span className="text-slate-500">Model:</span> {data.modelNumber}</div>}
      {data.color && (
        <div className="flex items-center gap-1">
          <span className="text-slate-500">Color:</span>
          <span className="w-4 h-4 rounded border border-slate-200 inline-block" style={{ backgroundColor: data.color }} />
          <span>{data.color}</span>
        </div>
      )}
    </div>
  );
}

function PortTable({ ports }: { ports: Port[] }) {
  if (!ports.length) return <p className="text-sm text-slate-400">No ports</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
          <th className="pb-1">Label</th>
          <th className="pb-1">Direction</th>
          <th className="pb-1">Signal</th>
          <th className="pb-1">Connector</th>
        </tr>
      </thead>
      <tbody>
        {ports.map((p, i) => (
          <tr key={i} className="border-b border-slate-100">
            <td className="py-1">{p.label}</td>
            <td className="py-1">{p.direction}</td>
            <td className="py-1"><SignalBadge signalType={p.signalType} /></td>
            <td className="py-1 text-slate-500">{p.connectorType ? (CONNECTOR_LABELS[p.connectorType] ?? p.connectorType) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
