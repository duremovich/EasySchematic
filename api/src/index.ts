import { Hono } from "hono";
import { cors } from "hono/cors";
import { rowToTemplate, templateToRow } from "./db";
import { authMiddleware } from "./auth";
import { validateTemplate } from "./validate";

type Bindings = {
  easyschematic_db: D1Database;
  ADMIN_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: [
      "https://easyschematic.live",
      "https://www.easyschematic.live",
      "https://devices.easyschematic.live",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  })
);

app.use("/templates/*", authMiddleware);
app.use("/templates", authMiddleware);

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=3600",
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache",
};

// --- Read endpoints ---

app.get("/templates", async (c) => {
  const { results } = await c.env.easyschematic_db.prepare(
    "SELECT * FROM templates ORDER BY sort_order, label"
  ).all();

  const templates = results.map((row) => rowToTemplate(row as never));
  return c.json(templates, 200, CACHE_HEADERS);
});

app.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.easyschematic_db.prepare(
    "SELECT * FROM templates WHERE id = ?"
  ).bind(id).first();

  if (!row) {
    return c.json({ error: "Template not found" }, 404);
  }

  return c.json(rowToTemplate(row as never), 200, CACHE_HEADERS);
});

// --- Write endpoints ---

app.post("/templates", async (c) => {
  const body = await c.req.json();
  const result = validateTemplate(body);

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const id = crypto.randomUUID();
  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db.prepare(
    `INSERT INTO templates (id, version, device_type, label, manufacturer, model_number, color, image_url, search_terms, ports, sort_order)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id,
    row.device_type,
    row.label,
    row.manufacturer,
    row.model_number,
    row.color,
    row.image_url,
    row.search_terms,
    row.ports,
    row.sort_order,
  ).run();

  const created = await c.env.easyschematic_db.prepare(
    "SELECT * FROM templates WHERE id = ?"
  ).bind(id).first();

  return c.json(rowToTemplate(created as never), 201, NO_CACHE_HEADERS);
});

app.put("/templates/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db.prepare(
    "SELECT * FROM templates WHERE id = ?"
  ).bind(id).first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  const body = await c.req.json();
  const result = validateTemplate(body);

  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  const row = templateToRow({ ...result.data, id });

  await c.env.easyschematic_db.prepare(
    `UPDATE templates
     SET device_type = ?, label = ?, manufacturer = ?, model_number = ?,
         color = ?, image_url = ?, search_terms = ?, ports = ?, sort_order = ?,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    row.device_type,
    row.label,
    row.manufacturer,
    row.model_number,
    row.color,
    row.image_url,
    row.search_terms,
    row.ports,
    row.sort_order,
    id,
  ).run();

  const updated = await c.env.easyschematic_db.prepare(
    "SELECT * FROM templates WHERE id = ?"
  ).bind(id).first();

  return c.json(rowToTemplate(updated as never), 200, NO_CACHE_HEADERS);
});

app.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.easyschematic_db.prepare(
    "SELECT id FROM templates WHERE id = ?"
  ).bind(id).first();

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  await c.env.easyschematic_db.prepare(
    "DELETE FROM templates WHERE id = ?"
  ).bind(id).run();

  return c.body(null, 204);
});

// --- Health ---

app.get("/health", (c) => {
  return c.json({ ok: true });
});

export default app;
