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

/** True for a loopback peer address as Node reports it (IPv4 127/8, IPv6 ::1, or
 *  an IPv4-mapped 127/8). */
export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase().startsWith("::ffff:") ? addr.slice(7) : addr;
  if (a === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}

/**
 * Route an incoming WebSocket handshake:
 *  - "tab": a browser editor tab — it sent an allowed Origin, and must then pass
 *    the `hello` token check. This path is unchanged by multi-instance support.
 *  - "peer": another local EasySchematic MCP server instance. Browsers ALWAYS send
 *    Origin on a WebSocket handshake, so a page can never arrive here; a peer
 *    sends none, must come from loopback, and must then pass the `peer_hello`
 *    token check before anything else (and can never bind as a tab).
 *  - "reject": a disallowed/malformed Origin, or a no-Origin non-loopback socket.
 */
export function classifyHandshake(
  origin: string | undefined,
  remoteAddress: string | undefined,
  allowedOrigins: string[],
): "tab" | "peer" | "reject" {
  if (origin === undefined) return isLoopbackAddress(remoteAddress) ? "peer" : "reject";
  return isOriginAllowed(origin, allowedOrigins) ? "tab" : "reject";
}
