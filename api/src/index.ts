import { Hono } from "hono";
import { cors } from "hono/cors";
import { rowToTemplate, templateToRow } from "./db";
import { authMiddleware, sessionMiddleware, requireSession, requireModeratorOrToken, requireAdmin } from "./auth";
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
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

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

function sessionCookie(sessionId: string, maxAge: number): string {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

function getClientIP(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

// ==================== AUTH ENDPOINTS ====================

app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return c.json({ error: "Valid email is required" }, 400);
  }

  const db = c.env.easyschematic_db;

  // Rate limit: 3 per email per hour, 10 per IP per hour
  const ip = getClientIP(c);
  const emailLimit = await checkRateLimit(db, `login:email:${email}`, 3);
  if (!emailLimit.allowed) {
    return c.json({ error: "Too many login attempts for this email. Try again later." }, 429);
  }
  const ipLimit = await checkRateLimit(db, `login:ip:${ip}`, 10);
  if (!ipLimit.allowed) {
    return c.json({ error: "Too many login attempts. Try again later." }, 429);
  }

  // Generate magic link token
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await db
    .prepare("INSERT INTO magic_links (id, email, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, email, token, expiresAt)
    .run();

  // Send magic link email via Resend
  const verifyUrl = `https://api.easyschematic.live/auth/verify?token=${token}`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "EasySchematic <noreply@easyschematic.live>",
      to: email,
      subject: "Your login link",
      html: `<p>Click below to log in to EasySchematic Devices:</p>
<p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#1e293b;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Log in to EasySchematic</a></p>
<p style="color:#64748b;font-size:14px;">This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
    }),
  });

  if (!emailRes.ok) {
    console.error("Resend error:", await emailRes.text());
    return c.json({ error: "Failed to send login email" }, 500);
  }

  return c.json({ ok: true });
});

app.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ error: "Token required" }, 400);
  }

  const db = c.env.easyschematic_db;

  // Find and validate magic link
  const link = await db
    .prepare("SELECT * FROM magic_links WHERE token = ? AND used = 0 AND expires_at > datetime('now')")
    .bind(token)
    .first<{ id: string; email: string }>();

  if (!link) {
    return c.redirect("https://devices.easyschematic.live/#/login?error=expired");
  }

  // Mark as used
  await db.prepare("UPDATE magic_links SET used = 1 WHERE id = ?").bind(link.id).run();

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
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, sessionExpires)
    .run();

  // Redirect to devices site with session cookie
  return new Response(null, {
    status: 302,
    headers: {
      Location: "https://devices.easyschematic.live/#/",
      "Set-Cookie": sessionCookie(sessionId, 30 * 24 * 60 * 60),
    },
  });
});

app.post("/auth/logout", async (c) => {
  const cookie = c.req.header("Cookie");
  const match = cookie?.match(/(?:^|;\s*)session=([^\s;]+)/);

  if (match) {
    await c.env.easyschematic_db.prepare("DELETE FROM sessions WHERE id = ?").bind(match[1]).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie("", 0),
    },
  });
});

app.get("/auth/me", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

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

// ==================== SUBMISSION ENDPOINTS ====================

app.post("/submissions", async (c) => {
  const user = requireSession(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.banned) return c.json({ error: "Account suspended" }, 403);

  const db = c.env.easyschematic_db;

  // Rate limit: 10 submissions per user per hour
  const limit = await checkRateLimit(db, `submit:user:${user.id}`, 10);
  if (!limit.allowed) {
    return c.json({ error: "Too many submissions. Try again later." }, 429);
  }

  const body = await c.req.json<{ action?: string; templateId?: string; data?: unknown }>();

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

  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO submissions (id, user_id, action, template_id, data) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, user.id, body.action, body.templateId ?? null, JSON.stringify(body.data))
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
      `SELECT s.*, u.email as submitter_email, u.name as submitter_name
       FROM submissions s JOIN users u ON s.user_id = u.id
       WHERE s.status = 'pending' ORDER BY s.created_at ASC`,
    )
    .all();

  return c.json(results.map((r) => formatSubmission(r as unknown as SubmissionRow)));
});

app.get("/submissions/:id", async (c) => {
  const auth = requireModeratorOrToken(c);
  const user = auth === "token" ? null : requireSession(c);
  if (!auth && !user) return c.json({ error: "Not authenticated" }, 401);

  const id = c.req.param("id");
  const row = await c.env.easyschematic_db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();

  if (!row) return c.json({ error: "Submission not found" }, 404);

  const submission = row as unknown as SubmissionRow;
  // Token gets full access, users can see their own, moderators can see all
  if (auth !== "token" && user && submission.user_id !== user.id && user.role !== "moderator" && user.role !== "admin") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(formatSubmission(submission));
});

app.post("/submissions/:id/approve", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);
  const reviewerId = auth === "token" ? null : auth.id;

  const id = c.req.param("id");
  const db = c.env.easyschematic_db;

  const row = await db.prepare("SELECT * FROM submissions WHERE id = ? AND status = 'pending'").bind(id).first();
  if (!row) return c.json({ error: "Pending submission not found" }, 404);

  const submission = row as unknown as SubmissionRow;

  // Allow moderator to override submission data with edits
  const body = await c.req.json<{ data?: unknown }>().catch(() => ({}) as { data?: unknown });
  let data = JSON.parse(submission.data);
  if (body.data) {
    const validation = validateTemplate(body.data);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }
    data = body.data;
  }

  let templateId: string | null = null;
  if (submission.action === "create") {
    // Create new template with attribution
    templateId = crypto.randomUUID();
    const templateRow = templateToRow({ ...data, id: templateId });

    await db
      .prepare(
        `INSERT INTO templates (id, version, device_type, category, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, sort_order, submitted_by)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        templateRow.sort_order,
        submission.user_id,
      )
      .run();
  } else if (submission.action === "update" && submission.template_id) {
    // Update existing template with edit attribution
    const templateRow = templateToRow({ ...data, id: submission.template_id });

    await db
      .prepare(
        `UPDATE templates
         SET device_type = ?, category = ?, label = ?, manufacturer = ?, model_number = ?,
             color = ?, image_url = ?, reference_url = ?, search_terms = ?, ports = ?, sort_order = ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP, last_edited_by = ?
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
        templateRow.sort_order,
        submission.user_id,
        submission.template_id,
      )
      .run();
  }

  // Mark submission approved (and backfill template_id for create actions)
  await db
    .prepare("UPDATE submissions SET status = 'approved', reviewer_id = ?, reviewed_at = datetime('now'), template_id = COALESCE(template_id, ?) WHERE id = ?")
    .bind(reviewerId, templateId, id)
    .run();

  return c.json({ ok: true, status: "approved" }, 200, NO_CACHE_HEADERS);
});

app.post("/submissions/:id/reject", async (c) => {
  const auth = requireModeratorOrToken(c);
  if (!auth) return c.json({ error: "Moderator access required" }, 403);
  const reviewerId = auth === "token" ? null : auth.id;

  const id = c.req.param("id");
  const body = await c.req.json<{ note?: string }>();

  const row = await c.env.easyschematic_db
    .prepare("SELECT id FROM submissions WHERE id = ? AND status = 'pending'")
    .bind(id)
    .first();

  if (!row) return c.json({ error: "Pending submission not found" }, 404);

  await c.env.easyschematic_db
    .prepare(
      "UPDATE submissions SET status = 'rejected', reviewer_id = ?, reviewer_note = ?, reviewed_at = datetime('now') WHERE id = ?",
    )
    .bind(reviewerId, body.note ?? null, id)
    .run();

  return c.json({ ok: true, status: "rejected" }, 200, NO_CACHE_HEADERS);
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

// ==================== CONTRIBUTORS (public) ====================

app.get("/contributors", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare(
      `SELECT u.id, u.name, u.email,
              COUNT(*) as approved_count,
              SUM(CASE WHEN s.action = 'create' THEN 1 ELSE 0 END) as created_count,
              SUM(CASE WHEN s.action = 'update' THEN 1 ELSE 0 END) as edited_count
       FROM submissions s JOIN users u ON s.user_id = u.id
       WHERE s.status = 'approved'
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
              MAX(CASE WHEN s.action = 'create' THEN 1 ELSE 0 END) as is_creator,
              MAX(CASE WHEN s.action = 'update' THEN 1 ELSE 0 END) as is_editor
       FROM submissions s
       JOIN templates t ON s.template_id = t.id
       WHERE s.user_id = ? AND s.status = 'approved'
       GROUP BY t.id
       ORDER BY t.label`,
    )
    .bind(userId)
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
    .prepare("SELECT DISTINCT category FROM templates ORDER BY category")
    .all();
  return c.json(results.map((r) => (r as { category: string }).category), 200, CACHE_HEADERS);
});

app.get("/templates/device-types", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT DISTINCT device_type FROM templates ORDER BY device_type")
    .all();
  return c.json(results.map((r) => (r as { device_type: string }).device_type), 200, CACHE_HEADERS);
});

app.get("/templates/search-terms", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT search_terms FROM templates WHERE search_terms IS NOT NULL")
    .all();
  const allTerms = new Set<string>();
  for (const row of results) {
    const terms = JSON.parse((row as { search_terms: string }).search_terms) as string[];
    for (const t of terms) allTerms.add(t.toLowerCase());
  }
  const sorted = [...allTerms].sort();
  return c.json(sorted, 200, CACHE_HEADERS);
});

app.get("/templates", async (c) => {
  const { results } = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates ORDER BY sort_order, label")
    .all();

  const templates = results.map((row) => rowToTemplate(row as never));
  return c.json(templates, 200, CACHE_HEADERS);
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

  const template = rowToTemplate(row as never);
  const r = row as Record<string, unknown>;
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

  return c.json(result, 200, CACHE_HEADERS);
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
      `INSERT INTO templates (id, version, device_type, category, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, sort_order)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db
    .prepare(
      `UPDATE templates
     SET device_type = ?, category = ?, label = ?, manufacturer = ?, model_number = ?,
         color = ?, image_url = ?, reference_url = ?, search_terms = ?, ports = ?, sort_order = ?,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
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
      row.sort_order,
      id,
    )
    .run();

  const updated = await c.env.easyschematic_db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .bind(id)
    .first();

  return c.json(rowToTemplate(updated as never), 200, NO_CACHE_HEADERS);
});

app.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db
    .prepare("SELECT id FROM templates WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  await c.env.easyschematic_db.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

// ==================== HEALTH ====================

app.get("/health", async (c) => {
  // Opportunistically clean up expired rate limits
  await cleanupExpiredRateLimits(c.env.easyschematic_db).catch(() => {});
  return c.json({ ok: true });
});

export default app;

// ==================== HELPERS ====================

interface SubmissionRow {
  id: string;
  user_id: string;
  action: string;
  template_id: string | null;
  data: string;
  status: string;
  reviewer_id: string | null;
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Joined fields (optional)
  submitter_email?: string;
  submitter_name?: string;
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
  };
}
