import { Hono } from "hono";
import { cors } from "hono/cors";
import { rowToTemplate, rowToSummary, templateToRow } from "./db";
import { authMiddleware, sessionMiddleware, requireSession, requireModerator, requireModeratorOrToken, requireAdmin, requireAdminOrToken } from "./auth";
import type { Env } from "./auth";
import { validateTemplate } from "./validate";
import { checkRateLimit, cleanupExpiredRateLimits } from "./rateLimiter";

const app = new Hono<Env>();

app.use(
  "*",
  cors({
    origin: [
      "https://easyschematic.live",
      "https://www.easyschematic.live",
      "https://devices.easyschematic.live",
      "http://localhost:4173",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

// Security response headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

// Session middleware on all routes
app.use("*", sessionMiddleware);

// Admin token auth on template write routes
app.use("/templates/*", authMiddleware);
app.use("/templates", authMiddleware);

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=3600",
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache",
};

// Matches the minor portion of package.json's 0.<schema>.<patch> — stamped on
// approved templates so moderators can find entries predating newer fields.
const SCHEMA_VERSION = "29";

function sessionCookie(sessionId: string, maxAge: number): string {
  // No Domain attribute — host-only cookie for api.easyschematic.live.
  // Both frontends fetch from api.easyschematic.live directly, so domain scoping is unnecessary.
  // Omitting Domain also avoids a Firefox bug where domain-scoped cookies aren't sent.
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

/** Expire the legacy domain-scoped cookie from before cd89a31.
 *  Browsers treat host-only and domain-scoped cookies as separate entries,
 *  so the old one lingers and shadows the new one until explicitly cleared. */
const LEGACY_COOKIE_CLEAR = "session=; Path=/; HttpOnly; SameSite=Lax; Secure; Domain=easyschematic.live; Max-Age=0";

function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

const ALLOWED_ORIGINS = [
  "https://easyschematic.live",
  "https://www.easyschematic.live",
  "https://devices.easyschematic.live",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

function isAllowedOrigin(url: string): boolean {
  try { return ALLOWED_ORIGINS.includes(new URL(url).origin); }
  catch { return false; }
}

function sqliteDatetime(offsetMs: number): string {
  return new Date(Date.now() + offsetMs)
    .toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

/** Return a 200 HTML page that sets the cookie and redirects via JS + meta-refresh.
 *  Firefox blocks Set-Cookie on 302 redirects (Bug 1465402); a 200 page avoids this.
 *  Small delay (1s meta-refresh, 500ms JS) gives browsers time to commit the cookie. */
function cookieRedirect(c: { header: (k: string, v: string, options?: { append?: boolean }) => void; html: (h: string) => Response | Promise<Response> }, cookie: string, dest: string): Response | Promise<Response> {
  c.header("Set-Cookie", cookie);
  c.header("Set-Cookie", LEGACY_COOKIE_CLEAR, { append: true });
  const safe = dest.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return c.html(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="1;url=${safe}">` +
    `<title>Redirecting\u2026</title></head><body><p>Redirecting\u2026</p>` +
    `<script>setTimeout(function(){window.location.href=${JSON.stringify(dest)}},500)</script></body></html>`
  );
}

// ==================== AUTH ENDPOINTS ====================

app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ email?: string; returnTo?: string }>();
  const email = body.email?.trim().toLowerCase();
  const returnTo = body.returnTo && isAllowedOrigin(body.returnTo) ? body.returnTo : undefined;

  if (!email || !email.includes("@")) {
    return c.json({ error: "Valid email is required" }, 400);
  }

  const db = c.env.easyschematic_db;

  // Rate limit: 20 per email per hour, 50 per IP per hour
  const ip = getClientIP(c);
  const emailLimit = await checkRateLimit(db, `login:email:${email}`, 20);
  if (!emailLimit.allowed) {
    return c.json({ error: "Too many login attempts for this email. Try again later." }, 429);
  }
  const ipLimit = await checkRateLimit(db, `login:ip:${ip}`, 50);
  if (!ipLimit.allowed) {
    return c.json({ error: "Too many login attempts. Try again later." }, 429);
  }

  // Generate magic link token
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const id = crypto.randomUUID();
  const expiresAt = sqliteDatetime(30 * 60 * 1000);

  await db
    .prepare("INSERT INTO magic_links (id, email, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, email, token, expiresAt)
    .run();

  // Send magic link email via Resend
  const verifyUrl = returnTo
    ? `https://api.easyschematic.live/auth/verify?token=${token}&returnTo=${encodeURIComponent(returnTo)}`
    : `https://api.easyschematic.live/auth/verify?token=${token}`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "EasySchematic <login@easyschematic.live>",
      to: email,
      reply_to: "support@easyschematic.live",
      subject: "EasySchematic — Log in to your account",
      headers: { "X-Entity-Ref-ID": id },
      text: [
        "Log in to EasySchematic",
        "",
        `We received a login request for ${email}. Visit the link below to sign in:`,
        "",
        verifyUrl,
        "",
        "This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.",
        "",
        "— EasySchematic · AV System Design Tool · https://easyschematic.live",
      ].join("\n"),
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="font-size:18px;color:#0f172a;margin:0 0 16px">Log in to EasySchematic</h2>
<p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 8px">We received a login request for <strong>${email}</strong>.</p>
<p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 24px">Click the button below to sign in:</p>
<p style="margin:0 0 24px"><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#1e293b;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Log in to EasySchematic</a></p>
<p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 4px">Or copy and paste this URL into your browser:</p>
<p style="color:#64748b;font-size:12px;word-break:break-all;margin:0 0 16px">${verifyUrl}</p>
<p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 24px">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px">
<p style="color:#94a3b8;font-size:12px;margin:0">EasySchematic · AV System Design Tool<br><a href="https://easyschematic.live" style="color:#94a3b8">easyschematic.live</a></p>
</div>`,
    }),
  });

  if (!emailRes.ok) {
    console.error("Resend error:", await emailRes.text());
    return c.json({ error: "Failed to send login email" }, 500);
  }

  return c.json({ ok: true });
});

/** Branded HTML page for the magic link landing page and error states. */
function authPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — EasySchematic</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#e2e8f0;
    display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
  .card{background:#1e293b;border-radius:12px;padding:2.5rem;max-width:420px;width:100%;text-align:center;
    box-shadow:0 4px 24px rgba(0,0,0,.4)}
  .logo{font-size:1.5rem;font-weight:700;margin-bottom:1.5rem;color:#f8fafc}
  h1{font-size:1.25rem;margin-bottom:.75rem;color:#f1f5f9}
  p{color:#94a3b8;font-size:.95rem;line-height:1.5;margin-bottom:1.5rem}
  .btn{display:inline-block;padding:14px 32px;background:#3b82f6;color:#fff;border:none;border-radius:8px;
    font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s}
  .btn:hover{background:#2563eb}
  .link{color:#60a5fa;text-decoration:none;font-size:.9rem}
  .link:hover{text-decoration:underline}
</style></head><body><div class="card">
<div class="logo">EasySchematic</div>
${body}
</div></body></html>`;
}

app.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  const returnTo = c.req.query("returnTo");
  const validReturnTo = returnTo && isAllowedOrigin(returnTo) ? returnTo : undefined;

  if (!token) {
    return c.html(authPage("Invalid Link", `<h1>Invalid Link</h1><p>This login link is missing a token.</p>
      <a class="link" href="https://devices.easyschematic.live/#/login">Back to login</a>`));
  }

  const db = c.env.easyschematic_db;
  const ua = c.req.header("User-Agent") ?? "unknown";
  const ip = getClientIP(c);

  // Check token validity WITHOUT consuming it (scanners do GET requests)
  const link = await db
    .prepare("SELECT email, used, expires_at FROM magic_links WHERE token = ?")
    .bind(token)
    .first<{ email: string; used: number; expires_at: string }>();

  const isValid = link && !link.used && new Date(link.expires_at + "Z") > new Date();

  console.log(`[auth/verify GET] ip=${ip} ua=${ua} token_found=${!!link} used=${link?.used ?? "N/A"} valid=${isValid}`);

  if (!isValid) {
    const loginUrl = validReturnTo
      ? `${new URL(validReturnTo).origin}/#/login`
      : "https://devices.easyschematic.live/#/login";
    return c.html(authPage("Link Expired", `<h1>Link Expired</h1>
      <p>This login link has already been used or has expired. Please request a new one.</p>
      <a class="btn" href="${loginUrl}">Back to Login</a>`));
  }

  // Show confirmation page — token is only consumed on POST (defeats email scanners)
  const formAction = validReturnTo
    ? `/auth/verify?returnTo=${encodeURIComponent(validReturnTo)}`
    : "/auth/verify";

  return c.html(authPage("Confirm Login", `<h1>Confirm Login</h1>
    <p>Click below to complete your login as <strong>${link.email}</strong>.</p>
    <form method="POST" action="${formAction}">
      <input type="hidden" name="token" value="${token}">
      <button type="submit" class="btn">Complete Login</button>
    </form>`));
});

app.post("/auth/verify", async (c) => {
  // Accept token from form body (landing page) or query string
  const contentType = c.req.header("Content-Type") ?? "";
  let token: string | undefined;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await c.req.parseBody();
    token = form["token"] as string | undefined;
  } else {
    const body = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));
    token = body.token;
  }

  const returnTo = c.req.query("returnTo");
  const validReturnTo = returnTo && isAllowedOrigin(returnTo) ? returnTo : undefined;

  if (!token) {
    return c.html(authPage("Invalid Request", `<h1>Invalid Request</h1><p>No token provided.</p>
      <a class="link" href="https://devices.easyschematic.live/#/login">Back to login</a>`));
  }

  const db = c.env.easyschematic_db;
  const ip = getClientIP(c);
  const ua = c.req.header("User-Agent") ?? "unknown";

  // Atomically mark as used — only succeeds if not already used
  const markResult = await db
    .prepare("UPDATE magic_links SET used = 1 WHERE token = ? AND used = 0 AND expires_at > datetime('now')")
    .bind(token)
    .run();

  if (!markResult.meta.changes) {
    console.log(`[auth/verify POST] ip=${ip} ua=${ua} token_consumed=false (already used or expired)`);
    const loginUrl = validReturnTo
      ? `${new URL(validReturnTo).origin}/#/login`
      : "https://devices.easyschematic.live/#/login";
    return c.html(authPage("Link Expired", `<h1>Link Expired</h1>
      <p>This login link has already been used or has expired. Please request a new one.</p>
      <a class="btn" href="${loginUrl}">Back to Login</a>`));
  }

  // Fetch the email (safe — we own the row after the atomic UPDATE)
  const link = await db
    .prepare("SELECT email FROM magic_links WHERE token = ?")
    .bind(token)
    .first<{ email: string }>();

  if (!link) {
    const loginUrl = validReturnTo
      ? `${new URL(validReturnTo).origin}/#/login`
      : "https://devices.easyschematic.live/#/login";
    return c.html(authPage("Link Expired", `<h1>Link Expired</h1>
      <p>This login link has already been used or has expired. Please request a new one.</p>
      <a class="btn" href="${loginUrl}">Back to Login</a>`));
  }

  // Find or create user
  let user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(link.email).first<{ id: string }>();

  if (!user) {
    const userId = crypto.randomUUID();
    await db
      .prepare("INSERT INTO users (id, email, last_login_at) VALUES (?, ?, datetime('now'))")
      .bind(userId, link.email)
      .run();
    user = { id: userId };
  } else {
    await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();
  }

  // Create session (30-day TTL)
  const sessionId = crypto.randomUUID();
  const sessionExpires = sqliteDatetime(30 * 24 * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, sessionExpires)
    .run();

  console.log(`[auth/verify POST] ip=${ip} ua=${ua} email=${link.email} session=${sessionId.slice(0, 8)}… created`);

  const dest = validReturnTo || "https://devices.easyschematic.live/#/";
  return cookieRedirect(c, sessionCookie(sessionId, 30 * 24 * 60 * 60), dest);
});

app.post("/auth/logout", async (c) => {
  const cookie = c.req.header("Cookie");
  const match = cookie?.match(/(?:^|;\s*)session=([^\s;]+)/);

  if (match) {
    await c.env.easyschematic_db.prepare("DELETE FROM sessions WHERE id = ?").bind(match[1]).run();
  }

  c.header("Set-Cookie", sessionCookie("", 0));
  c.header("Set-Cookie", LEGACY_COOKIE_CLEAR, { append: true });
  return c.json({ ok: true });
});

// ==================== GOOGLE OAUTH ENDPOINTS ====================

app.get("/auth/google/start", async (c) => {
  const returnTo = c.req.query("returnTo");
  const validReturnTo = returnTo && isAllowedOrigin(returnTo) ? returnTo : undefined;

  const db = c.env.easyschematic_db;

  // Rate limit by IP
  const ip = getClientIP(c);
  const ipLimit = await checkRateLimit(db, `login:ip:${ip}`, 10);
  if (!ipLimit.allowed) {
    return c.json({ error: "Too many login attempts. Try again later." }, 429);
  }

  // Generate CSRF state, store with 10-min TTL
  const state = crypto.randomUUID();
  const expiresAt = sqliteDatetime(10 * 60 * 1000);
  await db
    .prepare("INSERT INTO oauth_states (id, return_to, expires_at) VALUES (?, ?, ?)")
    .bind(state, validReturnTo ?? null, expiresAt)
    .run();

  const isLocalhost = new URL(c.req.url).hostname === "localhost";
  const redirectUri = isLocalhost
    ? "http://localhost:8787/auth/google/callback"
    : "https://api.easyschematic.live/auth/google/callback";

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (c) => {
  const db = c.env.easyschematic_db;
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  // Look up state first to get returnTo for error redirects
  const stateRow = state
    ? await db
        .prepare("SELECT return_to, expires_at FROM oauth_states WHERE id = ?")
        .bind(state)
        .first<{ return_to: string | null; expires_at: string }>()
    : null;

  // Delete state regardless (one-time use)
  if (state) {
    await db.prepare("DELETE FROM oauth_states WHERE id = ?").bind(state).run();
  }

  const returnOrigin = stateRow?.return_to
    ? new URL(stateRow.return_to).origin
    : null;

  const redirectWithError = (err: string) => {
    if (returnOrigin) {
      return c.redirect(`${returnOrigin}/?error=${err}`);
    }
    return c.redirect(`https://devices.easyschematic.live/#/login?error=${err}`);
  };

  // User denied consent
  if (error) return redirectWithError("oauth_denied");

  // Validate state exists and isn't expired
  if (!stateRow) return redirectWithError("expired");
  const now = sqliteDatetime(0);
  if (stateRow.expires_at <= now) return redirectWithError("expired");
  if (!code) return redirectWithError("expired");

  // Exchange code for tokens
  const isLocalhost = new URL(c.req.url).hostname === "localhost";
  const redirectUri = isLocalhost
    ? "http://localhost:8787/auth/google/callback"
    : "https://api.easyschematic.live/auth/google/callback";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", await tokenRes.text());
    return redirectWithError("oauth_failed");
  }

  const tokenData = await tokenRes.json<{ id_token?: string }>();
  if (!tokenData.id_token) return redirectWithError("oauth_failed");

  // Decode id_token payload (trusted — direct from Google over HTTPS)
  const payload = JSON.parse(atob(tokenData.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const { sub, email, email_verified, name } = payload as {
    sub: string; email: string; email_verified: boolean; name?: string;
  };

  if (!email_verified) return redirectWithError("email_not_verified");

  const normalizedEmail = email.toLowerCase();

  // Account resolution: google_id first, then email
  let user = await db
    .prepare("SELECT id FROM users WHERE google_id = ?")
    .bind(sub)
    .first<{ id: string }>();

  if (!user) {
    const existing = await db
      .prepare("SELECT id, google_id FROM users WHERE email = ?")
      .bind(normalizedEmail)
      .first<{ id: string; google_id: string | null }>();

    if (existing) {
      if (existing.google_id && existing.google_id !== sub) {
        return redirectWithError("account_conflict");
      }
      // Link Google account to existing magic-link user
      if (!existing.google_id) {
        await db.prepare("UPDATE users SET google_id = ? WHERE id = ?").bind(sub, existing.id).run();
      }
      user = { id: existing.id };
    } else {
      // Create new user
      const userId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO users (id, email, name, google_id, last_login_at) VALUES (?, ?, ?, ?, datetime('now'))")
        .bind(userId, normalizedEmail, name ?? null, sub)
        .run();
      user = { id: userId };
    }
  }

  await db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();

  // Create session (30-day TTL)
  const sessionId = crypto.randomUUID();
  const sessionExpires = sqliteDatetime(30 * 24 * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, sessionExpires)
    .run();

  const dest = stateRow.return_to || "https://devices.easyschematic.live/#/";
  return cookieRedirect(c, sessionCookie(sessionId, 30 * 24 * 60 * 60), dest);
});

app.get("/auth/me", async (c) => {
  const user = requireSession(c);
  const hasCookie = !!c.req.header("Cookie")?.includes("session=");
  if (!user) {
    console.log(`[auth/me] not authenticated — cookie_present=${hasCookie} ip=${getClientIP(c)} origin=${c.req.header("Origin") ?? "none"}`);
    return c.json({ error: "Not authenticated" }, 401);
  }

  // Fetch submission stats
  const stats = await c.env.easyschematic_db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
       FROM submissions WHERE user_id = ?`,
    )
    .bind(user.id)
    .first<{ total: number; approved: number; pending: number; rejected: number }>();

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    stats: stats ?? { total: 0, approved: 0, pending: 0, rejected: 0 },
  });
});

app.put("/auth/me", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const body = await c.req.json<{ name?: string }>();

  if (body.name != null) {
    const name = body.name.trim();
    if (name.length > 50) {
      return c.json({ error: "Name must be 50 characters or fewer" }, 400);
    }
    await c.env.easyschematic_db
      .prepare("UPDATE users SET name = ? WHERE id = ?")
      .bind(name || null, user.id)
      .run();
  }

  return c.json({ ok: true });
});

// ==================== AUTH HANDOFF ENDPOINTS ====================

app.post("/auth/handoff", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = c.env.easyschematic_db;

  const limit = await checkRateLimit(db, `handoff:user:${user.id}`, 10);
  if (!limit.allowed) {
    return c.json({ error: "Too many handoff tokens. Try again later." }, 429);
  }

  const id = crypto.randomUUID();
  const expiresAt = sqliteDatetime(5 * 60 * 1000);

  await db
    .prepare("INSERT INTO auth_handoffs (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(id, user.id, expiresAt)
    .run();

  return c.json({ token: id });
});

app.post("/auth/claim", async (c) => {
  const body = await c.req.json<{ token?: string }>();
  if (!body.token) return c.json({ error: "Token required" }, 400);

  const db = c.env.easyschematic_db;

  const handoff = await db
    .prepare("SELECT * FROM auth_handoffs WHERE id = ? AND used = 0 AND expires_at > datetime('now')")
    .bind(body.token)
    .first<{ id: string; user_id: string }>();

  if (!handoff) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Mark as used
  await db.prepare("UPDATE auth_handoffs SET used = 1 WHERE id = ?").bind(handoff.id).run();

  // Look up user
  const user = await db
    .prepare("SELECT id, email, name, role FROM users WHERE id = ?")
    .bind(handoff.user_id)
    .first<{ id: string; email: string; name: string | null; role: string }>();

  if (!user) return c.json({ error: "User not found" }, 404);

  // Create session
  const sessionId = crypto.randomUUID();
  const sessionExpires = sqliteDatetime(30 * 24 * 60 * 60 * 1000);

  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, sessionExpires)
    .run();

  c.header("Set-Cookie", sessionCookie(sessionId, 30 * 24 * 60 * 60));
  c.header("Set-Cookie", LEGACY_COOKIE_CLEAR, { append: true });
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// ==================== DRAFT ENDPOINTS ====================

app.post("/drafts", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.banned) return c.json({ error: "Account suspended" }, 403);

  const db = c.env.easyschematic_db;

  const limit = await checkRateLimit(db, `draft:user:${user.id}`, 20);
  if (!limit.allowed) {
    return c.json({ error: "Too many drafts. Try again later." }, 429);
  }

  const body = await c.req.json<{ data?: unknown }>();
  const json = JSON.stringify(body.data);
  if (!body.data || json.length > 100_000) {
    return c.json({ error: "Invalid or oversized draft data" }, 400);
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await db
    .prepare("INSERT INTO drafts (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, user.id, json, expiresAt)
    .run();

  // Opportunistic cleanup
  await db.prepare("DELETE FROM drafts WHERE expires_at < datetime('now')").run().catch(() => {});

  return c.json({ id }, 201);
});

app.get("/drafts/:id", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const draft = await c.env.easyschematic_db
    .prepare("SELECT * FROM drafts WHERE id = ? AND expires_at > datetime('now')")
    .bind(id)
    .first<{ user_id: string; data: string }>();

  if (!draft || draft.user_id !== user.id) {
    return c.json({ error: "Draft not found or expired" }, 404);
  }

  return c.json(JSON.parse(draft.data));
});

// ==================== SUBMISSION ENDPOINTS ====================

app.post("/submissions", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.banned) return c.json({ error: "Account suspended" }, 403);

  const db = c.env.easyschematic_db;

  // Rate limit: 30 submissions per user per hour
  const limit = await checkRateLimit(db, `submit:user:${user.id}`, 30);
  if (!limit.allowed) {
    return c.json({ error: "Submission limit is 30 per hour. Try again later." }, 429);
  }

  // Cap on total in-flight pending submissions per user. Matches the hourly
  // limit so a user can burst up to 30 in one go; beyond that they have to
  // wait for moderator review to free slots.
  const pendingRow = await db
    .prepare("SELECT COUNT(*) as count FROM submissions WHERE user_id = ? AND status = 'pending'")
    .bind(user.id)
    .first<{ count: number }>();
  if ((pendingRow?.count ?? 0) >= 30) {
    return c.json({ error: "You have 30 or more pending submissions awaiting review. Wait for moderators to clear some before submitting more." }, 429);
  }

  const body = await c.req.json<{ action?: string; templateId?: string; data?: unknown; submitterNote?: string; source?: string }>();

  if (!body.action || (body.action !== "create" && body.action !== "update")) {
    return c.json({ error: "action must be 'create' or 'update'" }, 400);
  }

  if (body.action === "update" && !body.templateId) {
    return c.json({ error: "templateId is required for update submissions" }, 400);
  }

  // Validate the template data
  const validation = validateTemplate(body.data);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }

  // Duplicate detection — only for "create" actions with a real model number.
  // Updates can legitimately target an existing template, and Generic devices
  // without a model number can't be meaningfully deduped.
  const tpl = validation.data;
  if (body.action === "create" && tpl.manufacturer && tpl.modelNumber) {
    const mfr = tpl.manufacturer.trim().toLowerCase();
    const model = tpl.modelNumber.trim().toLowerCase();

    const existingTemplate = await db
      .prepare(
        "SELECT id, label FROM templates WHERE lower(manufacturer) = ? AND lower(model_number) = ? LIMIT 1",
      )
      .bind(mfr, model)
      .first<{ id: string; label: string }>();
    if (existingTemplate) {
      return c.json(
        {
          error: `A template for ${tpl.manufacturer} ${tpl.modelNumber} already exists in the community library. Submit an edit to that template instead.`,
          existingTemplateId: existingTemplate.id,
        },
        409,
      );
    }

    // Pending submission from anyone for the same device — avoid queue stacking.
    const pendingDup = await db
      .prepare(
        `SELECT s.id FROM submissions s
         WHERE s.status = 'pending'
           AND s.action = 'create'
           AND lower(json_extract(s.data, '$.manufacturer')) = ?
           AND lower(json_extract(s.data, '$.modelNumber')) = ?
         LIMIT 1`,
      )
      .bind(mfr, model)
      .first<{ id: string }>();
    if (pendingDup) {
      return c.json(
        {
          error: `A pending submission for ${tpl.manufacturer} ${tpl.modelNumber} is already in the review queue.`,
          existingSubmissionId: pendingDup.id,
        },
        409,
      );
    }
  }

  // Validate optional submitter note
  const submitterNote = body.submitterNote && typeof body.submitterNote === "string"
    ? body.submitterNote.trim().slice(0, 1000) || null
    : null;

  // Optional source tag — used by bulk import UI so moderators can triage batches.
  const ALLOWED_SOURCES = new Set(["manual", "bulk-json", "bulk-csv"]);
  const source = body.source && typeof body.source === "string" && ALLOWED_SOURCES.has(body.source)
    ? body.source
    : null;

  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO submissions (id, user_id, action, template_id, data, submitter_note, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, user.id, body.action, body.templateId ?? null, JSON.stringify(body.data), submitterNote, source)
    .run();

  const created = await db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  return c.json(formatSubmission(created as unknown as SubmissionRow), 201, NO_CACHE_HEADERS);
});

app.get("/submissions/mine", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id)
    .all();

  return c.json(results.map((r) => formatSubmission(r as unknown as SubmissionRow)));
});

app.get("/submissions/pending", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);

  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT s.*, u.email as submitter_email, u.name as submitter_name,
              c.email as claimer_email, c.name as claimer_name
       FROM submissions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN users c ON s.claimed_by = c.id
       WHERE s.status IN ('pending', 'deferred') ORDER BY s.status DESC, s.created_at ASC`,
    )
    .all();

  return c.json(results.map((r) => formatSubmission(r as unknown as SubmissionRow)));
});

app.get("/submissions/:id", async (c) => {
  const auth = requireModeratorOrToken(c);
  const user = auth === "token" ? null : requireSession(c);
  if (!auth && !user) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const row = await c.env.easyschematic_db.prepare(
    `SELECT s.*, c.email as claimer_email, c.name as claimer_name
     FROM submissions s LEFT JOIN users c ON s.claimed_by = c.id
     WHERE s.id = ?`
  ).bind(id).first();

  if (!row) return c.json({ error: "Submission not found" }, 404);

  const submission = row as unknown as SubmissionRow;
  // Token gets full access, users can see their own, moderators can see all
  if (auth !== "token" && user && submission.user_id !== user.id && user.role !== "moderator" && user.role !== "admin") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(formatSubmission(submission));
});

// Soft-claim a submission while reviewing (advisory, not blocking)
app.post("/submissions/:id/claim", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);
  if (auth === "token") return c.json({ error: "Token auth cannot claim" }, 400);

  const id = c.req.param("id");
  await c.env.easyschematic_db
    .prepare("UPDATE submissions SET claimed_by = ?, claimed_at = datetime('now') WHERE id = ? AND status IN ('pending', 'deferred')")
    .bind(auth.id, id)
    .run();

  return c.json({ ok: true }, 200, NO_CACHE_HEADERS);
});

app.post("/submissions/:id/approve", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);
  const reviewerId = auth === "token" ? null : auth.id;

  const id = c.req.param("id");
  const db = c.env.easyschematic_db;

  const row = await db.prepare("SELECT * FROM submissions WHERE id = ? AND status IN ('pending', 'deferred')").bind(id).first();
  if (!row) return c.json({ error: "Submission not found or already resolved" }, 404);

  const submission = row as unknown as SubmissionRow;

  // Allow moderator to override submission data with edits
  const body = await c.req.json<{ data?: unknown }>().catch(() => ({}) as { data?: unknown });
  let data = JSON.parse(submission.data);
  const overrideJson = body.data ? JSON.stringify(body.data) : null;
  if (body.data) {
    const validation = validateTemplate(body.data);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }
    data = body.data;
  }

  // For update actions, snapshot existing template state before mutation (audit log)
  let beforeData: string | null = null;
  if (submission.action === "update" && submission.template_id) {
    const existing = await db.prepare("SELECT * FROM templates WHERE id = ?").bind(submission.template_id).first();
    beforeData = existing ? JSON.stringify(existing) : null;
  }

  let templateId: string | null = null;
  if (submission.action === "create") {
    // Create new template with attribution
    templateId = crypto.randomUUID();
    const templateRow = templateToRow({ ...data, id: templateId });

    await db
      .prepare(
        `INSERT INTO templates (id, version, device_type, category, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, slots, slot_family, power_draw_w, power_capacity_w, voltage, poe_budget_w, poe_draw_w, is_venue_provided, height_mm, width_mm, depth_mm, weight_kg, sort_order, submitted_by, approved_at, approved_by, approved_schema_version, needs_review, needs_review_reason)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, 0, NULL)`,
      )
      .bind(
        templateRow.id,
        templateRow.device_type,
        templateRow.category,
        templateRow.label,
        templateRow.manufacturer,
        templateRow.model_number,
        templateRow.color,
        templateRow.image_url,
        templateRow.reference_url,
        templateRow.search_terms,
        templateRow.ports,
        templateRow.slots,
        templateRow.slot_family,
        templateRow.power_draw_w,
        templateRow.power_capacity_w,
        templateRow.voltage,
        templateRow.poe_budget_w,
        templateRow.poe_draw_w,
        templateRow.is_venue_provided,
        templateRow.height_mm,
        templateRow.width_mm,
        templateRow.depth_mm,
        templateRow.weight_kg,
        templateRow.sort_order,
        submission.user_id,
        reviewerId,
        SCHEMA_VERSION,
      )
      .run();
  } else if (submission.action === "update" && submission.template_id) {
    // Update existing template with edit attribution
    const templateRow = templateToRow({ ...data, id: submission.template_id });

    await db
      .prepare(
        `UPDATE templates
         SET device_type = ?, category = ?, label = ?, manufacturer = ?, model_number = ?,
             color = ?, image_url = ?, reference_url = ?, search_terms = ?, ports = ?, slots = ?, slot_family = ?,
             power_draw_w = ?, power_capacity_w = ?, voltage = ?, poe_budget_w = ?, poe_draw_w = ?, is_venue_provided = ?,
             height_mm = ?, width_mm = ?, depth_mm = ?, weight_kg = ?, sort_order = ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP, last_edited_by = ?,
             approved_at = datetime('now'), approved_by = ?, approved_schema_version = ?,
             needs_review = 0, needs_review_reason = NULL
         WHERE id = ?`,
      )
      .bind(
        templateRow.device_type,
        templateRow.category,
        templateRow.label,
        templateRow.manufacturer,
        templateRow.model_number,
        templateRow.color,
        templateRow.image_url,
        templateRow.reference_url,
        templateRow.search_terms,
        templateRow.ports,
        templateRow.slots,
        templateRow.slot_family,
        templateRow.power_draw_w,
        templateRow.power_capacity_w,
        templateRow.voltage,
        templateRow.poe_budget_w,
        templateRow.poe_draw_w,
        templateRow.is_venue_provided,
        templateRow.height_mm,
        templateRow.width_mm,
        templateRow.depth_mm,
        templateRow.weight_kg,
        templateRow.sort_order,
        submission.user_id,
        reviewerId,
        SCHEMA_VERSION,
        submission.template_id,
      )
      .run();
  }

  // Mark submission approved (and backfill template_id for create actions)
  await db
    .prepare("UPDATE submissions SET status = 'approved', reviewer_id = ?, reviewed_at = datetime('now'), template_id = COALESCE(template_id, ?), claimed_by = NULL, claimed_at = NULL WHERE id = ?")
    .bind(reviewerId, templateId, id)
    .run();

  // Append audit log entry — try/catch so a logging failure never masks a successful approve
  if (reviewerId) {
    try {
      const finalTemplateId = templateId ?? submission.template_id ?? null;
      await db
        .prepare(
          "INSERT INTO mod_actions (moderator_id, action, submission_id, template_id, before_data, after_data, submission_data_override) VALUES (?, 'approve', ?, ?, ?, ?, ?)",
        )
        .bind(reviewerId, id, finalTemplateId, beforeData, JSON.stringify(data), overrideJson)
        .run();
    } catch (e) {
      console.error("Failed to write mod_actions audit log for approve:", e);
    }
  }

  return c.json({ ok: true, status: "approved" }, 200, NO_CACHE_HEADERS);
});

app.post("/submissions/:id/reject", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);
  const reviewerId = auth === "token" ? null : auth.id;

  const id = c.req.param("id");
  const body = await c.req.json<{ note?: string }>();

  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM submissions WHERE id = ? AND status IN ('pending', 'deferred')")
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Submission not found or already resolved" }, 404);

  await c.env.easyschematic_db
    .prepare(
      "UPDATE submissions SET status = 'rejected', reviewer_id = ?, reviewer_note = ?, reviewed_at = datetime('now'), claimed_by = NULL, claimed_at = NULL WHERE id = ?",
    )
    .bind(reviewerId, body.note ?? null, id)
    .run();

  if (reviewerId) {
    try {
      await c.env.easyschematic_db
        .prepare("INSERT INTO mod_actions (moderator_id, action, submission_id, note) VALUES (?, 'reject', ?, ?)")
        .bind(reviewerId, id, body.note ?? null)
        .run();
    } catch (e) {
      console.error("Failed to write mod_actions audit log for reject:", e);
    }
  }

  return c.json({ ok: true, status: "rejected" }, 200, NO_CACHE_HEADERS);
});

// Defer submission — requires codebase changes before approval
app.post("/submissions/:id/defer", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);
  const reviewerId = auth === "token" ? null : auth.id;

  const id = c.req.param("id");
  const body = await c.req.json<{ note?: string }>();

  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM submissions WHERE id = ? AND status IN ('pending', 'deferred')")
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Submission not found or already resolved" }, 404);

  await c.env.easyschematic_db
    .prepare(
      "UPDATE submissions SET status = 'deferred', reviewer_id = ?, reviewer_note = ?, reviewed_at = datetime('now'), claimed_by = NULL, claimed_at = NULL WHERE id = ?",
    )
    .bind(reviewerId, body.note ?? null, id)
    .run();

  if (reviewerId) {
    try {
      await c.env.easyschematic_db
        .prepare("INSERT INTO mod_actions (moderator_id, action, submission_id, note) VALUES (?, 'defer', ?, ?)")
        .bind(reviewerId, id, body.note ?? null)
        .run();
    } catch (e) {
      console.error("Failed to write mod_actions audit log for defer:", e);
    }
  }

  return c.json({ ok: true, status: "deferred" }, 200, NO_CACHE_HEADERS);
});

// ==================== USER MANAGEMENT (ADMIN) ====================

app.get("/users", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, email, name, role, banned, created_at, last_login_at FROM users ORDER BY created_at DESC")
    .all();

  return c.json(results);
});

app.put("/users/:id/role", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ role?: string }>();

  if (!body.role || !["contributor", "moderator", "admin"].includes(body.role)) {
    return c.json({ error: "role must be 'contributor', 'moderator', or 'admin'" }, 400);
  }

  await c.env.easyschematic_db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(body.role, id).run();
  return c.json({ ok: true });
});

app.put("/users/:id/ban", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ banned?: boolean }>();

  await c.env.easyschematic_db
    .prepare("UPDATE users SET banned = ? WHERE id = ?")
    .bind(body.banned ? 1 : 0, id)
    .run();
  return c.json({ ok: true });
});

// ==================== MOD ACTIVITY (admin) ====================

app.get("/admin/mod-activity", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const moderatorId = c.req.query("moderator_id");
  const action = c.req.query("action");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let query = `SELECT m.*, u.email as moderator_email, u.name as moderator_name,
                      s.data as submission_data, s.action as submission_action
               FROM mod_actions m
               JOIN users u ON m.moderator_id = u.id
               LEFT JOIN submissions s ON m.submission_id = s.id
               WHERE 1=1`;
  const binds: (string | number)[] = [];

  if (moderatorId) {
    query += " AND m.moderator_id = ?";
    binds.push(moderatorId);
  }
  if (action) {
    query += " AND m.action = ?";
    binds.push(action);
  }

  query += " ORDER BY m.created_at DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const { results } = await c.env.easyschematic_db
    .prepare(query)
    .bind(...binds)
    .all();

  return c.json(results, 200, NO_CACHE_HEADERS);
});

app.get("/admin/moderators", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, email, name, role FROM users WHERE role IN ('moderator', 'admin') ORDER BY name, email")
    .all();

  return c.json(results, 200, NO_CACHE_HEADERS);
});

// ==================== CONTRIBUTORS (public) ====================

app.get("/contributors", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT u.id, u.name, u.email,
              COUNT(*) as approved_count,
              SUM(is_creator) as created_count,
              SUM(CASE WHEN is_creator = 0 AND is_editor = 1 THEN 1 ELSE 0 END) as edited_count
       FROM (
         SELECT user_id, template_id,
                MAX(is_creator) as is_creator,
                MAX(is_editor) as is_editor
         FROM (
           SELECT submitted_by as user_id, id as template_id, 1 as is_creator, 0 as is_editor
           FROM templates WHERE submitted_by IS NOT NULL
           UNION ALL
           SELECT s.user_id, s.template_id, 0 as is_creator, 1 as is_editor
           FROM submissions s
           WHERE s.status = 'approved' AND s.action = 'update' AND s.template_id IS NOT NULL
         )
         GROUP BY user_id, template_id
       ) contrib
       JOIN users u ON contrib.user_id = u.id
       GROUP BY u.id
       ORDER BY approved_count DESC
       LIMIT 50`,
    )
    .all();

  // Only expose name (or anonymized email) — not full email
  const contributors = (results as unknown as { id: string; name: string | null; email: string; approved_count: number; created_count: number; edited_count: number }[]).map((r) => ({
    id: r.id,
    name: r.name || "Awesome Community Member",
    approvedCount: r.approved_count,
    createdCount: r.created_count,
    editedCount: r.edited_count,
  }));

  return c.json(contributors, 200, NO_CACHE_HEADERS);
});

app.get("/contributors/:id/templates", async (c) => {
  const userId = c.req.param("id");
  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT t.id, t.label, t.device_type, t.category,
              MAX(CASE WHEN t.submitted_by = ? THEN 1 ELSE 0 END) as is_creator,
              MAX(CASE WHEN s.action = 'update' THEN 1 ELSE 0 END) as is_editor
       FROM templates t
       LEFT JOIN submissions s
         ON s.template_id = t.id AND s.user_id = ? AND s.status = 'approved' AND s.action = 'update'
       WHERE t.flagged_for_deletion = 0 AND (t.submitted_by = ? OR s.id IS NOT NULL)
       GROUP BY t.id
       ORDER BY t.label`,
    )
    .bind(userId, userId, userId)
    .all();

  const templatesWithContribution = (results as unknown as { id: string; label: string; device_type: string; category: string; is_creator: number; is_editor: number }[]).map((r) => ({
    id: r.id,
    label: r.label,
    device_type: r.device_type,
    category: r.category,
    contribution: r.is_creator && r.is_editor ? "both" as const : r.is_editor ? "edited" as const : "created" as const,
  }));

  return c.json(templatesWithContribution, 200, NO_CACHE_HEADERS);
});

// ==================== TEMPLATE ENDPOINTS ====================

app.get("/templates/categories", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT DISTINCT category FROM templates WHERE flagged_for_deletion = 0 ORDER BY category")
    .all();
  return c.json(results.map((r) => (r as { category: string }).category), 200, CACHE_HEADERS);
});

app.get("/templates/device-types", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT DISTINCT device_type FROM templates WHERE flagged_for_deletion = 0 ORDER BY device_type")
    .all();
  return c.json(results.map((r) => (r as { device_type: string }).device_type), 200, CACHE_HEADERS);
});

app.get("/templates/manufacturers", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT DISTINCT manufacturer FROM templates WHERE manufacturer IS NOT NULL AND flagged_for_deletion = 0 ORDER BY manufacturer")
    .all();
  return c.json(results.map((r) => (r as { manufacturer: string }).manufacturer), 200, CACHE_HEADERS);
});

app.get("/templates/search-terms", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT search_terms FROM templates WHERE search_terms IS NOT NULL AND flagged_for_deletion = 0")
    .all();
  const allTerms = new Set<string>();
  for (const row of results) {
    const terms = JSON.parse((row as { search_terms: string }).search_terms) as string[];
    for (const t of terms) allTerms.add(t.toLowerCase());
  }
  const sorted = [...allTerms].sort();
  return c.json(sorted, 200, CACHE_HEADERS);
});

app.get("/templates/summary", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, label, device_type, category, manufacturer, model_number, color, search_terms, ports, slots FROM templates WHERE flagged_for_deletion = 0 ORDER BY sort_order, label")
    .all();

  const summaries = results.map((row) => rowToSummary(row as never));
  return c.json(summaries, 200, NO_CACHE_HEADERS);
});

app.get("/templates", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE flagged_for_deletion = 0 ORDER BY sort_order, label")
    .all();

  const templates = results.map((row) => rowToTemplate(row as never));
  return c.json(templates, 200, NO_CACHE_HEADERS);
});

app.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.easyschematic_db
    .prepare(
      `SELECT t.*,
              su.name as submitter_name, su.email as submitter_email,
              eu.name as editor_name, eu.email as editor_email
       FROM templates t
       LEFT JOIN users su ON t.submitted_by = su.id
       LEFT JOIN users eu ON t.last_edited_by = eu.id
       WHERE t.id = ?`,
    )
    .bind(id)
    .first();

  if (!row) {
    return c.json({ error: "Template not found" }, 404);
  }

  const r = row as Record<string, unknown>;
  const user = c.get("user");
  const isModOrAdmin = user && (user.role === "admin" || user.role === "moderator");

  // Flagged templates are hidden from the public. Mods and admins see the full record
  // (with a flag banner rendered client-side from the /admin endpoint).
  if (r.flagged_for_deletion && !isModOrAdmin) {
    return c.json({ error: "Template not found" }, 404);
  }

  const template = rowToTemplate(row as never);
  const result: Record<string, unknown> = { ...template };

  if (r.submitted_by) {
    result.submittedBy = {
      name: (r.submitter_name as string) || "Awesome Community Member",
    };
  }
  if (r.last_edited_by) {
    result.lastEditedBy = {
      name: (r.editor_name as string) || "Awesome Community Member",
    };
  }
  // Non-sensitive: lets the public device page render the "under review" banner
  // without needing a moderator session. The *reason* stays mod-only.
  if (r.needs_review) {
    result.needsReview = true;
  }
  if (r.flagged_for_deletion) {
    result.flaggedForDeletion = true;
  }

  // Flagged responses bypass CDN caching so unflag is instantly visible.
  const headers = r.flagged_for_deletion ? NO_CACHE_HEADERS : CACHE_HEADERS;
  return c.json(result, 200, headers);
});

app.post("/templates", async (c) => {
  const body = await c.req.json();
  const result = validateTemplate(body);

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const id = crypto.randomUUID();
  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db
    .prepare(
      `INSERT INTO templates (id, version, device_type, category, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, slots, slot_family, power_draw_w, power_capacity_w, voltage, poe_budget_w, poe_draw_w, is_venue_provided, height_mm, width_mm, depth_mm, weight_kg, sort_order)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.device_type,
      row.category,
      row.label,
      row.manufacturer,
      row.model_number,
      row.color,
      row.image_url,
      row.reference_url,
      row.search_terms,
      row.ports,
      row.slots,
      row.slot_family,
      row.power_draw_w,
      row.power_capacity_w,
      row.voltage,
      row.poe_budget_w,
      row.poe_draw_w,
      row.is_venue_provided,
      row.height_mm,
      row.width_mm,
      row.depth_mm,
      row.weight_kg,
      row.sort_order,
    )
    .run();

  const created = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  return c.json(rowToTemplate(created as never), 201, NO_CACHE_HEADERS);
});

app.put("/templates/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  const body = await c.req.json();
  const result = validateTemplate(body);

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  // authMiddleware already gated this to admin/moderator session or ADMIN_TOKEN.
  // Prefer session identity for last_edited_by; pure-token calls leave it null.
  const user = c.get("user");
  const editorId = user && (user.role === "admin" || user.role === "moderator") ? user.id : null;

  const beforeData = JSON.stringify(rowToTemplate(existing as never));
  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db
    .prepare(
      `UPDATE templates
     SET device_type = ?, category = ?, label = ?, manufacturer = ?, model_number = ?,
         color = ?, image_url = ?, reference_url = ?, search_terms = ?, ports = ?, slots = ?, slot_family = ?,
         power_draw_w = ?, power_capacity_w = ?, voltage = ?, poe_budget_w = ?, poe_draw_w = ?, is_venue_provided = ?,
         height_mm = ?, width_mm = ?, depth_mm = ?, weight_kg = ?, sort_order = ?,
         version = version + 1, updated_at = CURRENT_TIMESTAMP,
         last_edited_by = COALESCE(?, last_edited_by)
     WHERE id = ?`,
    )
    .bind(
      row.device_type,
      row.category,
      row.label,
      row.manufacturer,
      row.model_number,
      row.color,
      row.image_url,
      row.reference_url,
      row.search_terms,
      row.ports,
      row.slots,
      row.slot_family,
      row.power_draw_w,
      row.power_capacity_w,
      row.voltage,
      row.poe_budget_w,
      row.poe_draw_w,
      row.is_venue_provided,
      row.height_mm,
      row.width_mm,
      row.depth_mm,
      row.weight_kg,
      row.sort_order,
      editorId,
      id,
    )
    .run();

  const updated = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  // Audit log for direct moderator edits. Skip for pure-token calls (matches approve behaviour).
  if (editorId) {
    try {
      const afterData = JSON.stringify(rowToTemplate(updated as never));
      await c.env.easyschematic_db
        .prepare(
          "INSERT INTO mod_actions (moderator_id, action, template_id, before_data, after_data) VALUES (?, 'edit', ?, ?, ?)",
        )
        .bind(editorId, id, beforeData, afterData)
        .run();
    } catch (e) {
      console.error("Failed to write mod_actions audit log for edit:", e);
    }
  }

  return c.json(rowToTemplate(updated as never), 200, NO_CACHE_HEADERS);
});

// ==================== MODERATOR TEMPLATE ACTIONS ====================

// Send an approved device back into the review queue. Keeps it visible publicly
// with a "needs review" flag so the UI can warn users without hiding the record.
app.post("/templates/:id/send-back", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  const reason = (body.reason ?? "").trim();
  if (!reason) {
    return c.json({ error: "reason is required" }, 400);
  }

  const db = c.env.easyschematic_db;
  const existing = await db.prepare("SELECT * FROM templates WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Template not found" }, 404);

  const snapshot = rowToTemplate(existing as never);
  const snapshotJson = JSON.stringify(snapshot);

  await db
    .prepare(
      "UPDATE templates SET needs_review = 1, needs_review_reason = ? WHERE id = ?",
    )
    .bind(reason, id)
    .run();

  const submissionId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO submissions (id, user_id, action, template_id, data, status, submitter_note, source)
       VALUES (?, ?, 'update', ?, ?, 'pending', ?, 'moderator-flag')`,
    )
    .bind(
      submissionId,
      mod.id,
      id,
      snapshotJson,
      `Sent back by moderator: ${reason}`,
    )
    .run();

  try {
    await db
      .prepare(
        "INSERT INTO mod_actions (moderator_id, action, submission_id, template_id, before_data, note) VALUES (?, 'send_back', ?, ?, ?, ?)",
      )
      .bind(mod.id, submissionId, id, snapshotJson, reason)
      .run();
  } catch (e) {
    console.error("Failed to write mod_actions audit log for send_back:", e);
  }

  return c.json({ ok: true, submission_id: submissionId }, 200, NO_CACHE_HEADERS);
});

// Moderator flags a template for deletion. Soft-hides from public reads; admin
// must confirm (hard delete) or restore (unflag) via the pending-deletions queue.
app.post("/templates/:id/flag-delete", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));
  const reason = (body.reason ?? "").trim();
  if (!reason) return c.json({ error: "reason is required" }, 400);

  const db = c.env.easyschematic_db;
  const existing = await db.prepare("SELECT * FROM templates WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Template not found" }, 404);

  const result = await db
    .prepare(
      `UPDATE templates
         SET flagged_for_deletion = 1,
             flagged_for_deletion_reason = ?,
             flagged_for_deletion_at = datetime('now'),
             flagged_for_deletion_by = ?
       WHERE id = ? AND flagged_for_deletion = 0`,
    )
    .bind(reason, mod.id, id)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Template is already flagged for deletion" }, 409);
  }

  try {
    await c.env.easyschematic_db
      .prepare(
        "INSERT INTO mod_actions (moderator_id, action, template_id, before_data, note) VALUES (?, 'flag-delete', ?, ?, ?)",
      )
      .bind(mod.id, id, JSON.stringify(rowToTemplate(existing as never)), reason)
      .run();
  } catch (e) {
    console.error("Failed to write mod_actions audit log for flag-delete:", e);
  }

  return c.json({ ok: true }, 200, NO_CACHE_HEADERS);
});

// Admin clears a deletion flag, restoring the template to public visibility.
app.post("/templates/:id/unflag-delete", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const db = c.env.easyschematic_db;
  const existing = await db.prepare("SELECT * FROM templates WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Template not found" }, 404);

  const r = existing as Record<string, unknown>;
  if (!r.flagged_for_deletion) {
    return c.json({ error: "Template is not flagged for deletion" }, 409);
  }

  await db
    .prepare(
      `UPDATE templates
         SET flagged_for_deletion = 0,
             flagged_for_deletion_reason = NULL,
             flagged_for_deletion_at = NULL,
             flagged_for_deletion_by = NULL
       WHERE id = ?`,
    )
    .bind(id)
    .run();

  try {
    await db
      .prepare(
        "INSERT INTO mod_actions (moderator_id, action, template_id, note) VALUES (?, 'unflag-delete', ?, ?)",
      )
      .bind(admin.id, id, (r.flagged_for_deletion_reason as string | null) ?? null)
      .run();
  } catch (e) {
    console.error("Failed to write mod_actions audit log for unflag-delete:", e);
  }

  return c.json({ ok: true }, 200, NO_CACHE_HEADERS);
});

// Admin-only queue of templates flagged for deletion, with flagger attribution.
app.get("/admin/pending-deletions", async (c) => {
  const admin = requireAdmin(c);
  if (!admin) return c.json({ error: "Admin access required" }, 403);

  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT t.id, t.label, t.device_type, t.category, t.manufacturer, t.model_number,
              t.flagged_for_deletion_reason, t.flagged_for_deletion_at, t.flagged_for_deletion_by,
              u.name AS flagger_name, u.email AS flagger_email
         FROM templates t
         LEFT JOIN users u ON t.flagged_for_deletion_by = u.id
        WHERE t.flagged_for_deletion = 1
        ORDER BY t.flagged_for_deletion_at DESC`,
    )
    .all();

  const items = (results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    deviceType: r.device_type as string,
    category: r.category as string,
    manufacturer: (r.manufacturer as string | null) ?? null,
    modelNumber: (r.model_number as string | null) ?? null,
    flaggedReason: (r.flagged_for_deletion_reason as string | null) ?? "",
    flaggedAt: (r.flagged_for_deletion_at as string | null) ?? "",
    flaggedBy: r.flagged_for_deletion_by
      ? {
          id: r.flagged_for_deletion_by as string,
          name: (r.flagger_name as string | null) ?? "Moderator",
          email: (r.flagger_email as string | null) ?? null,
        }
      : null,
  }));

  return c.json(items, 200, NO_CACHE_HEADERS);
});

// Internal moderator notes — shared across all moderators.
app.get("/templates/:id/notes", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT n.id, n.body, n.author_id, n.created_at, n.updated_at, u.name AS author_name
       FROM template_notes n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.template_id = ?
       ORDER BY n.created_at DESC`,
    )
    .bind(id)
    .all();

  const notes = (results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    body: r.body as string,
    authorId: r.author_id as string,
    authorName: (r.author_name as string | null) ?? "Moderator",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  return c.json(notes, 200, NO_CACHE_HEADERS);
});

app.post("/templates/:id/notes", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ body?: string }>().catch(() => ({} as { body?: string }));
  const text = (body.body ?? "").trim();
  if (!text) return c.json({ error: "body is required" }, 400);

  const db = c.env.easyschematic_db;
  const template = await db.prepare("SELECT id FROM templates WHERE id = ?").bind(id).first();
  if (!template) return c.json({ error: "Template not found" }, 404);

  const noteId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO template_notes (id, template_id, author_id, body) VALUES (?, ?, ?, ?)",
    )
    .bind(noteId, id, mod.id, text)
    .run();

  try {
    await db
      .prepare(
        "INSERT INTO mod_actions (moderator_id, action, template_id, note) VALUES (?, 'note_added', ?, ?)",
      )
      .bind(mod.id, id, text)
      .run();
  } catch (e) {
    console.error("Failed to write mod_actions audit log for note_added:", e);
  }

  const row = await db
    .prepare(
      `SELECT n.id, n.body, n.author_id, n.created_at, n.updated_at, u.name AS author_name
       FROM template_notes n LEFT JOIN users u ON n.author_id = u.id
       WHERE n.id = ?`,
    )
    .bind(noteId)
    .first<Record<string, unknown>>();

  return c.json(
    {
      id: row!.id,
      body: row!.body,
      authorId: row!.author_id,
      authorName: (row!.author_name as string | null) ?? "Moderator",
      createdAt: row!.created_at,
      updatedAt: row!.updated_at,
    },
    201,
    NO_CACHE_HEADERS,
  );
});

app.patch("/templates/:id/notes/:noteId", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const noteId = c.req.param("noteId");
  const body = await c.req.json<{ body?: string }>().catch(() => ({} as { body?: string }));
  const text = (body.body ?? "").trim();
  if (!text) return c.json({ error: "body is required" }, 400);

  const db = c.env.easyschematic_db;
  const existing = await db
    .prepare("SELECT id FROM template_notes WHERE id = ? AND template_id = ?")
    .bind(noteId, id)
    .first();
  if (!existing) return c.json({ error: "Note not found" }, 404);

  await db
    .prepare(
      "UPDATE template_notes SET body = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(text, noteId)
    .run();

  try {
    await db
      .prepare(
        "INSERT INTO mod_actions (moderator_id, action, template_id, note) VALUES (?, 'note_edited', ?, ?)",
      )
      .bind(mod.id, id, text)
      .run();
  } catch (e) {
    console.error("Failed to write mod_actions audit log for note_edited:", e);
  }

  return c.json({ ok: true }, 200, NO_CACHE_HEADERS);
});

app.delete("/templates/:id/notes/:noteId", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const noteId = c.req.param("noteId");
  const db = c.env.easyschematic_db;

  const existing = await db
    .prepare("SELECT body FROM template_notes WHERE id = ? AND template_id = ?")
    .bind(noteId, id)
    .first<{ body: string }>();
  if (!existing) return c.json({ error: "Note not found" }, 404);

  await db.prepare("DELETE FROM template_notes WHERE id = ?").bind(noteId).run();

  try {
    await db
      .prepare(
        "INSERT INTO mod_actions (moderator_id, action, template_id, note) VALUES (?, 'note_deleted', ?, ?)",
      )
      .bind(mod.id, id, existing.body)
      .run();
  } catch (e) {
    console.error("Failed to write mod_actions audit log for note_deleted:", e);
  }

  return c.body(null, 204);
});

// Moderator-only full view: template + approval metadata + notes + recent mod history.
app.get("/templates/:id/admin", async (c) => {
  const mod = requireModerator(c);
  if (!mod) return c.json({ error: "Moderator access required" }, 403);

  const id = c.req.param("id");
  const db = c.env.easyschematic_db;

  const row = await db
    .prepare(
      `SELECT t.*,
              su.name AS submitter_name,
              eu.name AS editor_name,
              au.name AS approver_name,
              fu.name AS flagger_name,
              fu.email AS flagger_email
         FROM templates t
         LEFT JOIN users su ON t.submitted_by = su.id
         LEFT JOIN users eu ON t.last_edited_by = eu.id
         LEFT JOIN users au ON t.approved_by = au.id
         LEFT JOIN users fu ON t.flagged_for_deletion_by = fu.id
        WHERE t.id = ?`,
    )
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Template not found" }, 404);

  const r = row as Record<string, unknown>;
  const template = rowToTemplate(row as never);

  const { results: noteRows } = await db
    .prepare(
      `SELECT n.id, n.body, n.author_id, n.created_at, n.updated_at, u.name AS author_name
         FROM template_notes n LEFT JOIN users u ON n.author_id = u.id
        WHERE n.template_id = ?
        ORDER BY n.created_at DESC`,
    )
    .bind(id)
    .all();

  const { results: historyRows } = await db
    .prepare(
      `SELECT ma.action, ma.note, ma.created_at, u.name AS moderator_name
         FROM mod_actions ma LEFT JOIN users u ON ma.moderator_id = u.id
        WHERE ma.template_id = ?
        ORDER BY ma.created_at DESC
        LIMIT 20`,
    )
    .bind(id)
    .all();

  return c.json(
    {
      ...template,
      submittedBy: r.submitted_by
        ? { name: (r.submitter_name as string) || "Awesome Community Member" }
        : undefined,
      lastEditedBy: r.last_edited_by
        ? { name: (r.editor_name as string) || "Awesome Community Member" }
        : undefined,
      approvedAt: (r.approved_at as string | null) ?? null,
      approvedBy: r.approved_by
        ? { name: (r.approver_name as string) || "Moderator" }
        : null,
      approvedSchemaVersion: (r.approved_schema_version as string | null) ?? null,
      needsReview: !!r.needs_review,
      needsReviewReason: (r.needs_review_reason as string | null) ?? null,
      flaggedForDeletion: !!r.flagged_for_deletion,
      flaggedForDeletionReason: (r.flagged_for_deletion_reason as string | null) ?? null,
      flaggedForDeletionAt: (r.flagged_for_deletion_at as string | null) ?? null,
      flaggedBy: r.flagged_for_deletion_by
        ? {
            id: r.flagged_for_deletion_by as string,
            name: (r.flagger_name as string | null) ?? "Moderator",
            email: (r.flagger_email as string | null) ?? null,
          }
        : null,
      modNotes: (noteRows as Record<string, unknown>[]).map((n) => ({
        id: n.id as string,
        body: n.body as string,
        authorId: n.author_id as string,
        authorName: (n.author_name as string | null) ?? "Moderator",
        createdAt: n.created_at as string,
        updatedAt: n.updated_at as string,
      })),
      modHistory: (historyRows as Record<string, unknown>[]).map((h) => ({
        action: h.action as string,
        note: (h.note as string | null) ?? null,
        createdAt: h.created_at as string,
        moderatorName: (h.moderator_name as string | null) ?? "Moderator",
      })),
    },
    200,
    NO_CACHE_HEADERS,
  );
});

app.delete("/templates/:id", async (c) => {
  // authMiddleware now passes moderators through for PUT; delete stays admin-only.
  const isAdminToken = c.get("isAdminToken");
  const adminUser = requireAdmin(c);
  if (!isAdminToken && !adminUser) {
    return c.json({ error: "Admin access required" }, 403);
  }
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  const r = existing as Record<string, unknown>;
  const template = rowToTemplate(existing as never);
  // Include flag metadata alongside template fields for self-contained audit snapshot.
  const beforeSnapshot: Record<string, unknown> = { ...template };
  if (r.flagged_for_deletion) {
    beforeSnapshot.flaggedForDeletion = true;
    beforeSnapshot.flaggedForDeletionReason = r.flagged_for_deletion_reason ?? null;
    beforeSnapshot.flaggedForDeletionAt = r.flagged_for_deletion_at ?? null;
    beforeSnapshot.flaggedForDeletionBy = r.flagged_for_deletion_by ?? null;
  }

  // Insert the audit row BEFORE deleting: mod_actions.template_id has a FK to
  // templates(id), so writing it post-delete would fail. The ON DELETE SET NULL
  // from migration 0027 then nulls the FK as part of the subsequent delete.
  if (adminUser) {
    try {
      await c.env.easyschematic_db
        .prepare(
          "INSERT INTO mod_actions (moderator_id, action, template_id, before_data, note) VALUES (?, 'confirm-delete', ?, ?, ?)",
        )
        .bind(
          adminUser.id,
          id,
          JSON.stringify(beforeSnapshot),
          (r.flagged_for_deletion_reason as string | null) ?? null,
        )
        .run();
    } catch (e) {
      console.error("Failed to write mod_actions audit log for confirm-delete:", e);
    }
  }

  await c.env.easyschematic_db.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

// ==================== SUPPORT EMAIL ENDPOINTS ====================

app.get("/support-emails", async (c) => {
  const auth = requireAdminOrToken(c);
  if (!auth) return c.json({ error: "Admin access required" }, 403);

  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  let query = "SELECT id, message_id, from_email, from_name, subject, received_at, status FROM support_emails";
  const binds: string[] = [];

  if (status) {
    query += " WHERE status = ?";
    binds.push(status);
  }

  query += " ORDER BY received_at DESC LIMIT ?";
  binds.push(String(limit));

  const stmt = c.env.easyschematic_db.prepare(query);
  const { results } = await stmt.bind(...binds).all();

  return c.json(results, 200, NO_CACHE_HEADERS);
});

app.get("/support-emails/:id", async (c) => {
  const auth = requireAdminOrToken(c);
  if (!auth) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const row = await c.env.easyschematic_db
    .prepare("SELECT * FROM support_emails WHERE id = ?")
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Email not found" }, 404);
  return c.json(row, 200, NO_CACHE_HEADERS);
});

app.put("/support-emails/:id/status", async (c) => {
  const auth = requireAdminOrToken(c);
  if (!auth) return c.json({ error: "Admin access required" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json<{ status?: string }>();

  if (!body.status || !["read", "resolved", "spam"].includes(body.status)) {
    return c.json({ error: "status must be 'read', 'resolved', or 'spam'" }, 400);
  }

  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM support_emails WHERE id = ?")
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Email not found" }, 404);

  await c.env.easyschematic_db
    .prepare("UPDATE support_emails SET status = ? WHERE id = ?")
    .bind(body.status, id)
    .run();

  return c.json({ ok: true });
});

app.post("/support-emails/:id/reply", async (c) => {
  const auth = requireAdminOrToken(c);
  if (!auth) return c.json({ error: "Admin access required" }, 403);

  const replyKey = auth === "token" ? "support-reply:token" : `support-reply:${auth.id}`;
  const limit = await checkRateLimit(c.env.easyschematic_db, replyKey, 30);
  if (!limit.allowed) return c.json({ error: "Too many replies. Try again later." }, 429);

  const id = c.req.param("id");
  const body = await c.req.json<{ text: string }>();

  if (!body.text?.trim()) {
    return c.json({ error: "Reply text is required" }, 400);
  }

  const row = await c.env.easyschematic_db
    .prepare("SELECT * FROM support_emails WHERE id = ?")
    .bind(id)
    .first<{ id: string; from_email: string; from_name: string | null; subject: string | null; message_id: string | null }>();

  if (!row) return c.json({ error: "Email not found" }, 404);

  // Send reply via Resend
  const replySubject = row.subject?.startsWith("Re:") ? row.subject : `Re: ${row.subject || "(no subject)"}`;

  const headers: Record<string, string> = {};
  if (row.message_id) {
    headers["In-Reply-To"] = row.message_id;
    headers["References"] = row.message_id;
  }

  // Convert plain text to HTML body with signature (escape to prevent HTML injection)
  const bodyHtml = body.text.split("\n").map((l: string) => escapeHtml(l) || "<br>").join("<br>") +
    `<br><br>` +
    `<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:13px;color:#334155">` +
    `<tr><td style="padding-right:12px;vertical-align:middle">` +
    `<img src="https://easyschematic.live/email-logo.png" width="48" height="48" alt="EasySchematic" style="border-radius:8px">` +
    `</td><td style="vertical-align:middle">` +
    `<strong style="font-size:14px;color:#0f172a">EasySchematic</strong><br>` +
    `<span style="color:#64748b">AV System Design Tool</span><br>` +
    `<a href="https://easyschematic.live" style="color:#0ea5e9;text-decoration:none">easyschematic.live</a>` +
    `</td></tr></table>`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "EasySchematic Support <support@easyschematic.live>",
      to: row.from_email,
      bcc: c.env.SUPPORT_FORWARD_EMAIL,
      subject: replySubject,
      text: body.text,
      html: bodyHtml,
      headers,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("Resend reply error:", errText);
    return c.json({ error: "Failed to send reply" }, 500);
  }

  await c.env.easyschematic_db
    .prepare("UPDATE support_emails SET status = 'replied', reply_text = ?, replied_at = datetime('now') WHERE id = ?")
    .bind(body.text, id)
    .run();

  return c.json({ ok: true });
});

// ==================== HEALTH ====================

// ==================== SCHEMATIC CLOUD STORAGE ====================

const MAX_SCHEMATIC_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_SCHEMATICS_PER_USER = 10;
const MAX_NODES = 1000;
const MAX_EDGES = 5000;
const MAX_LOGO_BYTES = 500_000; // 500 KB — resized 400×200 PNG is typically 20-50 KB
const MAX_CUSTOM_TEMPLATES = 100;
const MAX_STRING_FIELD = 10_000;

function validateSchematicStructure(
  body: Record<string, unknown>
): { ok: true } | { ok: false; error: string } {
  const { nodes, edges, titleBlock, customTemplates, name } = body as {
    nodes?: unknown;
    edges?: unknown;
    titleBlock?: { logo?: string };
    customTemplates?: unknown;
    name?: unknown;
  };

  if (typeof name === "string" && name.length > 200) {
    return { ok: false, error: "Schematic name is too long — maximum 200 characters" };
  }

  if (Array.isArray(nodes) && nodes.length > MAX_NODES) {
    return { ok: false, error: `Too many devices — maximum ${MAX_NODES.toLocaleString()} allowed` };
  }

  if (Array.isArray(edges) && edges.length > MAX_EDGES) {
    return { ok: false, error: `Too many connections — maximum ${MAX_EDGES.toLocaleString()} allowed` };
  }

  if (titleBlock && typeof titleBlock.logo === "string" && titleBlock.logo.length > MAX_LOGO_BYTES) {
    return { ok: false, error: "Logo image is too large — please use a smaller image" };
  }

  if (Array.isArray(customTemplates) && customTemplates.length > MAX_CUSTOM_TEMPLATES) {
    return { ok: false, error: `Too many custom device templates — maximum ${MAX_CUSTOM_TEMPLATES} allowed` };
  }

  // Shallow check: flag any top-level string value that's unreasonably large
  for (const key of Object.keys(body)) {
    const val = body[key];
    if (typeof val === "string" && val.length > MAX_STRING_FIELD && key !== "nodes" && key !== "edges") {
      return { ok: false, error: `Field "${key}" is too large` };
    }
  }

  return { ok: true };
}

app.post("/schematics", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.banned) return c.json({ error: "Account suspended" }, 403);

  const db = c.env.easyschematic_db;

  const limit = await checkRateLimit(db, `save:user:${user.id}`, 30);
  if (!limit.allowed) {
    return c.json({ error: "Too many saves. Try again later." }, 429);
  }

  // Quota check
  const countRow = await db
    .prepare("SELECT COUNT(*) as cnt FROM schematics WHERE user_id = ?")
    .bind(user.id)
    .first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) >= MAX_SCHEMATICS_PER_USER) {
    return c.json({ error: `Maximum ${MAX_SCHEMATICS_PER_USER} schematics allowed. Delete one to save a new one.` }, 400);
  }

  const raw = await c.req.text();
  const sizeBytes = new TextEncoder().encode(raw).length;
  if (sizeBytes > MAX_SCHEMATIC_SIZE) {
    return c.json({ error: "Schematic too large (max 10 MB)" }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const structureCheck = validateSchematicStructure(body);
  if (!structureCheck.ok) {
    return c.json({ error: structureCheck.error }, 400);
  }

  if (!body.name || !body.version) {
    return c.json({ error: "Schematic must have name and version fields" }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.SCHEMATIC_STORAGE.put(`schematics/${id}.json`, raw, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  await db
    .prepare("INSERT INTO schematics (id, user_id, name, size_bytes) VALUES (?, ?, ?, ?)")
    .bind(id, user.id, body.name, sizeBytes)
    .run();

  const row = await db
    .prepare("SELECT id, name, size_bytes, shared, share_token, is_template, created_at, updated_at FROM schematics WHERE id = ?")
    .bind(id)
    .first();

  return c.json(row, 201);
});

app.get("/schematics", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { results } = await c.env.easyschematic_db
    .prepare("SELECT id, name, size_bytes, shared, share_token, is_template, created_at, updated_at FROM schematics WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(user.id)
    .all();

  return c.json(results);
});

app.get("/schematics/template", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM schematics WHERE user_id = ? AND is_template = 1")
    .bind(user.id)
    .first<{ id: string }>();
  if (!row) return c.json({ error: "No template set" }, 404);

  const obj = await c.env.SCHEMATIC_STORAGE.get(`schematics/${row.id}.json`);
  if (!obj) return c.json({ error: "Template data not found" }, 404);

  return c.body(obj.body as ReadableStream, 200, { "Content-Type": "application/json; charset=utf-8" });
});

app.get("/schematics/:id", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM schematics WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();

  if (!row) return c.json({ error: "Schematic not found" }, 404);

  const obj = await c.env.SCHEMATIC_STORAGE.get(`schematics/${id}.json`);
  if (!obj) return c.json({ error: "Schematic data not found" }, 404);

  return c.body(obj.body as ReadableStream, 200, { "Content-Type": "application/json; charset=utf-8" });
});

app.put("/schematics/:id", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = c.env.easyschematic_db;
  const id = c.req.param("id");

  const limit = await checkRateLimit(db, `save:user:${user.id}`, 30);
  if (!limit.allowed) {
    return c.json({ error: "Too many saves. Try again later." }, 429);
  }

  const existing = await db
    .prepare("SELECT id FROM schematics WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();
  if (!existing) return c.json({ error: "Schematic not found" }, 404);

  const raw = await c.req.text();
  const sizeBytes = new TextEncoder().encode(raw).length;
  if (sizeBytes > MAX_SCHEMATIC_SIZE) {
    return c.json({ error: "Schematic too large (max 10 MB)" }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const structureCheck = validateSchematicStructure(body);
  if (!structureCheck.ok) {
    return c.json({ error: structureCheck.error }, 400);
  }

  if (!body.name || !body.version) {
    return c.json({ error: "Schematic must have name and version fields" }, 400);
  }

  await c.env.SCHEMATIC_STORAGE.put(`schematics/${id}.json`, raw, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  await db
    .prepare("UPDATE schematics SET name = ?, size_bytes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(body.name, sizeBytes, id, user.id)
    .run();

  const row = await db
    .prepare("SELECT id, name, size_bytes, shared, share_token, is_template, created_at, updated_at FROM schematics WHERE id = ?")
    .bind(id)
    .first();

  return c.json(row);
});

app.delete("/schematics/template", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  await c.env.easyschematic_db
    .prepare("UPDATE schematics SET is_template = 0 WHERE user_id = ? AND is_template = 1")
    .bind(user.id)
    .run();

  return c.json({ ok: true });
});

app.delete("/schematics/:id", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = c.env.easyschematic_db;
  const id = c.req.param("id");

  const existing = await db
    .prepare("SELECT id FROM schematics WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();
  if (!existing) return c.json({ error: "Schematic not found" }, 404);

  await c.env.SCHEMATIC_STORAGE.delete(`schematics/${id}.json`);
  await db.prepare("DELETE FROM schematics WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

app.post("/schematics/:id/share", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = c.env.easyschematic_db;

  const limit = await checkRateLimit(db, `share:user:${user.id}`, 30);
  if (!limit.allowed) return c.json({ error: "Too many share requests. Try again later." }, 429);

  const id = c.req.param("id");

  const existing = await db
    .prepare("SELECT id, shared FROM schematics WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first<{ id: string; shared: number }>();
  if (!existing) return c.json({ error: "Schematic not found" }, 404);

  const body = await c.req.json<{ shared: boolean }>();
  const enabling = body.shared;

  if (enabling) {
    const shareToken = crypto.randomUUID();
    await db
      .prepare("UPDATE schematics SET shared = 1, share_token = ? WHERE id = ?")
      .bind(shareToken, id)
      .run();
  } else {
    await db
      .prepare("UPDATE schematics SET shared = 0, share_token = NULL WHERE id = ?")
      .bind(id)
      .run();
  }

  const row = await db
    .prepare("SELECT id, name, size_bytes, shared, share_token, is_template, created_at, updated_at FROM schematics WHERE id = ?")
    .bind(id)
    .first();

  return c.json(row);
});

app.get("/shared/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.env.easyschematic_db;

  const ip = getClientIP(c);
  const limit = await checkRateLimit(db, `shared:ip:${ip}`, 60);
  if (!limit.allowed) {
    return c.json({ error: "Too many requests. Try again later." }, 429);
  }

  const row = await db
    .prepare("SELECT id FROM schematics WHERE share_token = ? AND shared = 1")
    .bind(token)
    .first<{ id: string }>();
  if (!row) return c.json({ error: "Shared schematic not found" }, 404);

  const obj = await c.env.SCHEMATIC_STORAGE.get(`schematics/${row.id}.json`);
  if (!obj) return c.json({ error: "Schematic data not found" }, 404);

  return c.body(obj.body as ReadableStream, 200, { "Content-Type": "application/json; charset=utf-8" });
});

app.put("/schematics/:id/rename", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = c.env.easyschematic_db;

  const limit = await checkRateLimit(db, `save:user:${user.id}`, 30);
  if (!limit.allowed) return c.json({ error: "Too many requests. Try again later." }, 429);

  const id = c.req.param("id");

  const existing = await db
    .prepare("SELECT id FROM schematics WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();
  if (!existing) return c.json({ error: "Schematic not found" }, 404);

  const body = await c.req.json<{ name: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: "Name is required" }, 400);
  if (name.length > 100) return c.json({ error: "Name must be 100 characters or fewer" }, 400);

  await db
    .prepare("UPDATE schematics SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name, id)
    .run();

  const row = await db
    .prepare("SELECT id, name, size_bytes, shared, share_token, is_template, created_at, updated_at FROM schematics WHERE id = ?")
    .bind(id)
    .first();

  return c.json(row);
});

// ==================== TEMPLATE ENDPOINTS ====================

app.put("/schematics/:id/set-template", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = c.env.easyschematic_db;
  const id = c.req.param("id");

  const existing = await db
    .prepare("SELECT id FROM schematics WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .first();
  if (!existing) return c.json({ error: "Schematic not found" }, 404);

  // Clear any previous template, then set this one
  await db.batch([
    db.prepare("UPDATE schematics SET is_template = 0 WHERE user_id = ? AND is_template = 1").bind(user.id),
    db.prepare("UPDATE schematics SET is_template = 1 WHERE id = ? AND user_id = ?").bind(id, user.id),
  ]);

  return c.json({ ok: true });
});

app.get("/health", async (c) => {
  // Opportunistically clean up expired rate limits, drafts, sessions, and magic links
  await cleanupExpiredRateLimits(c.env.easyschematic_db).catch(() => {});
  await c.env.easyschematic_db.prepare("DELETE FROM drafts WHERE expires_at < datetime('now')").run().catch(() => {});
  await c.env.easyschematic_db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run().catch(() => {});
  await c.env.easyschematic_db.prepare("DELETE FROM magic_links WHERE expires_at < datetime('now')").run().catch(() => {});
  await c.env.easyschematic_db.prepare("DELETE FROM oauth_states WHERE expires_at < datetime('now')").run().catch(() => {});
  return c.json({ ok: true });
});

import { handleEmail } from "./email";

export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Env["Bindings"], _ctx: ExecutionContext) {
    await handleEmail(message, env);
  },
};

// ==================== HELPERS ====================

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface SubmissionRow {
  id: string;
  user_id: string;
  action: string;
  template_id: string | null;
  data: string;
  status: string;
  reviewer_id: string | null;
  reviewer_note: string | null;
  submitter_note: string | null;
  source: string | null;
  created_at: string;
  reviewed_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  // Joined fields (optional)
  submitter_email?: string;
  submitter_name?: string;
  claimer_email?: string;
  claimer_name?: string;
}


function formatSubmission(row: SubmissionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    templateId: row.template_id,
    data: JSON.parse(row.data),
    status: row.status,
    reviewerId: row.reviewer_id,
    reviewerNote: row.reviewer_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    ...(row.submitter_email && { submitterEmail: row.submitter_email }),
    ...(row.submitter_name && { submitterName: row.submitter_name }),
    ...(row.submitter_note && { submitterNote: row.submitter_note }),
    ...(row.source && { source: row.source }),
    claimedBy: row.claimed_by ?? null,
    claimedAt: row.claimed_at ?? null,
    ...(row.claimer_email && { claimerEmail: row.claimer_email }),
    ...(row.claimer_name && { claimerName: row.claimer_name }),
  };
}
