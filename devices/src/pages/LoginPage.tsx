import { useState, useEffect } from "react";
import { requestMagicLink } from "../api";

const API_URL = import.meta.env.VITE_API_URL || "https://api.easyschematic.live";

const ERROR_MESSAGES: Record<string, string> = {
  expired: "Login link expired or already used. Please request a new one.",
  oauth_denied: "Google sign-in was cancelled.",
  oauth_failed: "Google sign-in failed. Please try again.",
  email_not_verified: "Your Google email is not verified. Please use a verified Google account.",
  account_conflict: "This email is already linked to a different Google account.",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check for error param from failed verify/OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] || "Login failed. Please try again.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    try {
      await requestMagicLink(email.trim(), window.location.href);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send login link");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm p-6 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Check your email</h2>
          <p className="text-sm text-slate-500">
            We sent a login link to <strong className="text-slate-700">{email}</strong>. Click it to sign in.
          </p>
          <p className="text-xs text-slate-400 mt-3">The link expires in 30 minutes.</p>
          <p className="text-xs text-slate-400 mt-2">
            Don't see it? Check your spam folder. Some corporate email systems may block it
            — <button
              type="button"
              onClick={() => { window.location.href = `${API_URL}/auth/google/start?returnTo=${encodeURIComponent(window.location.href)}`; }}
              className="underline text-blue-500 hover:text-blue-700"
            >try Google sign-in instead</button>.
          </p>
          <button
            onClick={() => { setSent(false); setEmail(""); }}
            className="mt-4 text-sm text-blue-600 hover:text-blue-800"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold mb-1">Log in</h2>
        <p className="text-sm text-slate-500 mb-4">Sign in to submit devices and manage your account.</p>
        <button
          type="button"
          onClick={() => { window.location.href = `${API_URL}/auth/google/start?returnTo=${encodeURIComponent(window.location.href)}`; }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </button>
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "Sending..." : "Send login link"}
        </button>
      </form>
    </div>
  );
}
