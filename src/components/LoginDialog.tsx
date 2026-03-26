import { useState } from "react";
import { requestLogin } from "../templateApi";

const API_URL =
  import.meta.env?.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

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
              <button
                type="button"
                onClick={() => {
                  const returnTo = encodeURIComponent(window.location.href);
                  window.location.href = `${API_URL}/auth/google/start?returnTo=${returnTo}`;
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded transition-colors cursor-pointer"
                style={{
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </button>
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>or</span>
                <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
              </div>
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
