import { createMiddleware } from "hono/factory";
import type { Context } from "hono";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  banned: number;
}

export type Env = {
  Bindings: {
    easyschematic_db: D1Database;
    SCHEMATIC_STORAGE: R2Bucket;
    ADMIN_TOKEN: string;
    RESEND_API_KEY: string;
    SUPPORT_FORWARD_EMAIL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
  };
  Variables: {
    user?: SessionUser;
    isAdminToken?: boolean;
  };
};

/**
 * Session middleware — runs on every request.
 * Reads `session` cookie, looks up user. Non-destructive: if no cookie, user is anonymous.
 */
export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const cookie = c.req.header("Cookie");
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)session=([^\s;]+)/);
    if (match) {
      const sessionId = match[1];
      const row = await c.env.easyschematic_db
        .prepare(
          `SELECT u.id, u.email, u.name, u.role, u.banned
           FROM sessions s JOIN users u ON s.user_id = u.id
           WHERE s.id = ? AND s.expires_at > datetime('now')`,
        )
        .bind(sessionId)
        .first<SessionUser>();

      if (row) {
        c.set("user", row);
      }
    }
  }
  return next();
});

/**
 * Legacy admin token middleware for /templates write ops.
 * Checks bearer token OR session with admin/moderator role.
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "OPTIONS") {
    return next();
  }

  // Check bearer token first (backward compat)
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    if (token === c.env.ADMIN_TOKEN) {
      c.set("isAdminToken", true);
      return next();
    }
  }

  // Check session — admin role can write templates directly
  const user = c.get("user");
  if (user && user.role === "admin") {
    return next();
  }

  return c.json({ error: "Unauthorized" }, 401);
});

/** Require any logged-in session */
export function requireSession(c: Context<Env>): SessionUser | null {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

/** Require moderator or admin role */
export function requireModerator(c: Context<Env>): SessionUser | null {
  const user = c.get("user");
  if (!user) return null;
  if (user.role !== "moderator" && user.role !== "admin") return null;
  return user;
}

/** Require moderator session OR valid ADMIN_TOKEN bearer */
export function requireModeratorOrToken(c: Context<Env>): SessionUser | "token" | null {
  const user = requireModerator(c);
  if (user) return user;

  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    if (token === c.env.ADMIN_TOKEN) return "token";
  }

  return null;
}

/** Require admin role */
export function requireAdmin(c: Context<Env>): SessionUser | null {
  const user = c.get("user");
  if (!user) return null;
  if (user.role !== "admin") return null;
  return user;
}
