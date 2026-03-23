import { useState } from "react";
import { requestLogin } from "../templateApi";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LoginDialog({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setSending(true);
    setError("");
    try {
      await requestLogin(trimmed, window.location.href);
      setSentEmail(trimmed);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send login link");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setSent(false);
    setSentEmail("");
    setError("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={handleClose}
    >
      <div
        className="rounded-lg shadow-xl w-[380px] max-w-[90vw]"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-heading)" }}>
            Log in to submit
          </h2>
        </div>
        <div className="px-5 py-4">
          {sent ? (
            <div className="text-center py-2">
              <p className="text-sm mb-1" style={{ color: "var(--color-text-heading)" }}>
                Check your email
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                We sent a login link to <strong>{sentEmail}</strong>. Click it to log in, then come back here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
                Enter your email to get a magic login link. This is the same account used on the devices site.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-xs rounded"
                style={{
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                autoFocus
              />
              {error && (
                <p className="text-xs mt-2 text-red-500">{error}</p>
              )}
            </>
          )}
        </div>
        <div
          className="px-5 py-3 flex justify-end gap-2 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs rounded transition-colors cursor-pointer"
            style={{
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sent ? "Close" : "Cancel"}
          </button>
          {!sent && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send login link"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
