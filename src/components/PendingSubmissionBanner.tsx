import { useState, useEffect } from "react";
import { checkSession, createDraft } from "../templateApi";

const STORAGE_KEY = "easyschematic-pending-submission";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

const DEVICES_URL =
  import.meta.env.VITE_DEVICES_URL ?? "https://devices.easyschematic.live";

export default function PendingSubmissionBanner() {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as { data: unknown; timestamp: number };
      if (Date.now() - pending.timestamp > MAX_AGE_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      checkSession().then(async (user) => {
        if (!user) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        // Auto-submit immediately
        try {
          const draftId = await createDraft(pending.data);
          window.open(`${DEVICES_URL}/#/submit?draft=${draftId}`, "_blank");
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Auto-submit failed — show banner as fallback
          setError(true);
          setVisible(true);
        }
      });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  if (!visible) return null;

  const handleSubmit = async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    setSubmitting(true);
    try {
      const pending = JSON.parse(raw) as { data: unknown };
      const draftId = await createDraft(pending.data);
      window.open(`${DEVICES_URL}/#/submit?draft=${draftId}`, "_blank");
      localStorage.removeItem(STORAGE_KEY);
      setVisible(false);
    } catch {
      // If draft creation fails, just dismiss
      localStorage.removeItem(STORAGE_KEY);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.removeItem(STORAGE_KEY);
    setVisible(false);
  };

  return (
    <div
      className="text-sm px-4 py-2 flex items-center justify-between gap-4"
      style={{
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text)",
        borderBottom: "1px solid var(--color-border)",
      }}
      data-print-hide
    >
      <span>
        {error
          ? "Auto-submit failed. Click to try again."
          : "Your device is ready to submit to the community library."}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit now"}
        </button>
        <button
          onClick={handleDismiss}
          className="text-xs cursor-pointer hover:underline"
          style={{ color: "var(--color-text-muted)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
