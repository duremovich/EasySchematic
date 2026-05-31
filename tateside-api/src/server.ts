import http from "node:http";
import { URL } from "node:url";
import { getConfig } from "./config.js";
import { openDatabase, runMigrations } from "./db.js";
import { listCurrentTemplates, saveTemplates } from "./deviceStore.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body).toString(),
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function sendEmpty(res: http.ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end();
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function accessEmail(req: http.IncomingMessage): string | null {
  const header = req.headers["cf-access-authenticated-user-email"];
  if (Array.isArray(header)) return header[0] ?? null;
  return header ?? null;
}

function makeCorsHeaders(origin: string | undefined, allowedOrigin: string): Record<string, string> {
  if (!origin) return {};
  if (origin !== allowedOrigin && !origin.startsWith("http://localhost:") && !origin.startsWith("http://127.0.0.1:")) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Vary": "Origin",
  };
}

function requireIdentity(ctx: RequestContext, requireAccessIdentity: boolean): string | null | undefined {
  const email = accessEmail(ctx.req);
  if (!requireAccessIdentity) return email;
  if (!email) {
    sendJson(ctx.res, 401, { error: "Cloudflare Access identity header is required" });
    return undefined;
  }
  return email;
}

const config = getConfig();
const db = openDatabase(config.dbPath);
runMigrations(db);

async function handleRequest(ctx: RequestContext): Promise<void> {
  const corsHeaders = makeCorsHeaders(ctx.req.headers.origin, config.allowedOrigin);

  if (ctx.req.method === "OPTIONS") {
    sendEmpty(ctx.res, 204, corsHeaders);
    return;
  }

  const path = ctx.url.pathname;

  if (ctx.req.method === "GET" && path === "/health") {
    sendJson(ctx.res, 200, { ok: true, service: "tateside-api" }, corsHeaders);
    return;
  }

  if (ctx.req.method === "GET" && path === "/api/tateside/devices/templates") {
    const email = requireIdentity(ctx, config.requireAccessIdentity);
    if (email === undefined) return;
    sendJson(ctx.res, 200, listCurrentTemplates(db), corsHeaders);
    return;
  }

  if (ctx.req.method === "POST" && path === "/api/tateside/devices/templates") {
    const email = requireIdentity(ctx, config.requireAccessIdentity);
    if (email === undefined) return;
    const body = await readJson(ctx.req) as { templates?: unknown[]; note?: unknown; source?: unknown } | null;
    const templates = saveTemplates(db, {
      templates: body?.templates ?? [],
      note: typeof body?.note === "string" ? body.note : undefined,
      source: typeof body?.source === "string" ? body.source : undefined,
      actorEmail: email,
    });
    sendJson(ctx.res, 201, { templates }, corsHeaders);
    return;
  }

  if (path.startsWith("/api/tateside/sharepoint/")) {
    sendJson(ctx.res, 501, { error: "SharePoint API is not implemented yet" }, corsHeaders);
    return;
  }

  sendJson(ctx.res, 404, { error: "Not found" }, corsHeaders);
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || `${config.host}:${config.port}`;
  const ctx: RequestContext = {
    req,
    res,
    url: new URL(req.url || "/", `http://${host}`),
  };

  handleRequest(ctx).catch((err) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendJson(res, message.includes("invalid") || message.includes("required") || message.includes("large") ? 400 : 500, {
      error: message,
    });
  });
});

server.listen(config.port, config.host, () => {
  process.stdout.write(`TateSide API listening on http://${config.host}:${config.port}\n`);
  process.stdout.write(`SQLite database: ${config.dbPath}\n`);
});
