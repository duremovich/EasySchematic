import { timingSafeEqual } from "node:crypto";

/** Constant-time compare of the pairing token. Returns false on any length/empty
 *  mismatch without leaking timing about how much matched. */
export function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Origin allowlist — defense-in-depth on top of the token. Browsers always send
 * an Origin header on a WebSocket handshake, so a missing Origin is rejected.
 * localhost / 127.0.0.1 (any port) are allowed by default for the dev & preview
 * servers; self-hosters on another domain add it via EASYSCHEMATIC_MCP_ORIGINS.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}
