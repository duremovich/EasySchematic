import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { getConfig } from "./config.js";
import { openDatabase, runMigrations } from "./db.js";
import { deleteTemplate, listCurrentTemplates, saveTemplates, updateTemplate } from "./deviceStore.js";
import type { ExtractedQuoteDevice, QuoteImportResearchJobResponse, QuoteImportResearchResponse } from "../../src/quoteImportTypes.js";
import { researchQuoteDevices } from "./deviceResearch.js";
import { importQuoteDevicesFromPdf } from "./quoteImport.js";

const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
}

interface ResearchJobRecord {
  jobId: string;
  fileName: string;
  status: QuoteImportResearchJobResponse["status"];
  total: number;
  completed: number;
  currentLabel: string | null;
  result: QuoteImportResearchResponse | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
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

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  try {
    const raw = (await readBody(req, MAX_JSON_BODY_BYTES)).toString("utf8");
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    if (err instanceof Error && err.message === "Request body is too large") throw err;
    throw new Error("Invalid JSON body");
  }
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
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
const quoteResearchJobs = new Map<string, ResearchJobRecord>();

function publicResearchJob(record: ResearchJobRecord): QuoteImportResearchJobResponse {
  return {
    jobId: record.jobId,
    status: record.status,
    fileName: record.fileName,
    total: record.total,
    completed: record.completed,
    currentLabel: record.currentLabel,
    result: record.result,
    error: record.error,
  };
}

function createResearchJobRecord(fileName: string, devices: ExtractedQuoteDevice[]): ResearchJobRecord {
  const now = new Date().toISOString();
  return {
    jobId: randomUUID(),
    fileName,
    status: "queued",
    total: devices.length,
    completed: 0,
    currentLabel: null,
    result: null,
    error: null,
    startedAt: now,
    updatedAt: now,
  };
}

async function runResearchJob(record: ResearchJobRecord, devices: ExtractedQuoteDevice[], forceEscalation: boolean): Promise<void> {
  try {
    record.status = "running";
    record.updatedAt = new Date().toISOString();

    const aggregatedResults: QuoteImportResearchResponse["results"] = [];
    const warnings = new Set<string>();

    for (let index = 0; index < devices.length; index += 1) {
      const device = devices[index];
      record.currentLabel = `${device.manufacturer ? `${device.manufacturer} ` : ""}${device.model}`.trim();
      record.updatedAt = new Date().toISOString();

      const response = await researchQuoteDevices({
        fileName: record.fileName,
        devices: [device],
        forceEscalation,
      });

      aggregatedResults.push(...response.results);
      response.warnings.forEach((warning) => warnings.add(warning));
      record.completed = index + 1;
      record.result = {
        fileName: record.fileName,
        results: [...aggregatedResults],
        warnings: [...warnings],
      };
      record.updatedAt = new Date().toISOString();
    }

    record.status = "complete";
    record.result = {
      fileName: record.fileName,
      results: [...aggregatedResults],
      warnings: [...warnings],
    };
    record.currentLabel = null;
    record.updatedAt = new Date().toISOString();
  } catch (err) {
    record.status = "error";
    record.error = err instanceof Error ? err.message : "Research failed";
    record.updatedAt = new Date().toISOString();
  }
}

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

  if (ctx.req.method === "POST" && path === "/api/tateside/quote-import/extract") {
    const email = requireIdentity(ctx, config.requireAccessIdentity);
    if (email === undefined) return;
    void email;

    if (!process.env.OPENAI_API_KEY) {
      sendJson(ctx.res, 503, {
        error: "Import Devices from Quote is not available because OPENAI_API_KEY is not configured on the TateSide API server",
      }, corsHeaders);
      return;
    }

    const contentType = ctx.req.headers["content-type"] ?? "";
    const fileNameHeader = ctx.req.headers["x-tateside-upload-filename"];
    const fileNameRaw = Array.isArray(fileNameHeader) ? fileNameHeader[0] : fileNameHeader;
    const fileName = fileNameRaw ? decodeURIComponent(fileNameRaw) : "quote.pdf";

    if (!contentType.toLowerCase().includes("application/pdf")) {
      sendJson(ctx.res, 400, { error: "Import Devices from Quote currently supports PDF files only" }, corsHeaders);
      return;
    }

    const fileBuffer = await readBody(ctx.req, config.quoteImportMaxFileBytes);
    const result = await importQuoteDevicesFromPdf(db, fileName, fileBuffer, "application/pdf");
    sendJson(ctx.res, 200, result, corsHeaders);
    return;
  }

  const researchJobMatch = path.match(/^\/api\/tateside\/quote-import\/research\/([^/]+)$/);
  if (ctx.req.method === "GET" && researchJobMatch) {
    const email = requireIdentity(ctx, config.requireAccessIdentity);
    if (email === undefined) return;
    void email;

    const jobId = decodeURIComponent(researchJobMatch[1]);
    const job = quoteResearchJobs.get(jobId);
    if (!job) {
      sendJson(ctx.res, 404, { error: "Quote research job not found" }, corsHeaders);
      return;
    }
    sendJson(ctx.res, 200, publicResearchJob(job), corsHeaders);
    return;
  }

  if (ctx.req.method === "POST" && path === "/api/tateside/quote-import/research") {
    const email = requireIdentity(ctx, config.requireAccessIdentity);
    if (email === undefined) return;
    void email;

    if (!process.env.OPENAI_API_KEY) {
      sendJson(ctx.res, 503, {
        error: "AI quote import is not available because OPENAI_API_KEY is not configured on the TateSide API server",
      }, corsHeaders);
      return;
    }

    const body = await readJson(ctx.req) as {
      fileName?: unknown;
      devices?: unknown[];
      forceEscalation?: unknown;
    } | null;

    const fileName = typeof body?.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "quote.pdf";
    const devices = Array.isArray(body?.devices) ? body.devices as ExtractedQuoteDevice[] : [];

    if (devices.length === 0) {
      sendJson(ctx.res, 400, { error: "At least one missing device is required for research" }, corsHeaders);
      return;
    }

    const job = createResearchJobRecord(fileName, devices);
    quoteResearchJobs.set(job.jobId, job);
    void runResearchJob(job, devices, body?.forceEscalation === true);
    sendJson(ctx.res, 202, publicResearchJob(job), corsHeaders);
    return;
  }

  const templateMatch = path.match(/^\/api\/tateside\/devices\/templates\/([^/]+)$/);
  if (templateMatch) {
    const email = requireIdentity(ctx, config.requireAccessIdentity);
    if (email === undefined) return;
    const deviceId = decodeURIComponent(templateMatch[1]);

    if (ctx.req.method === "PUT") {
      const body = await readJson(ctx.req) as { template?: unknown; note?: unknown; source?: unknown } | null;
      const template = updateTemplate(db, deviceId, {
        template: body?.template,
        note: typeof body?.note === "string" ? body.note : undefined,
        source: typeof body?.source === "string" ? body.source : undefined,
        actorEmail: email,
      });
      sendJson(ctx.res, 200, { template }, corsHeaders);
      return;
    }

    if (ctx.req.method === "DELETE") {
      const body = ctx.req.headers["content-length"] && ctx.req.headers["content-length"] !== "0"
        ? await readJson(ctx.req) as { note?: unknown } | null
        : null;
      deleteTemplate(db, deviceId, {
        actorEmail: email,
        note: typeof body?.note === "string" ? body.note : undefined,
      });
      sendEmpty(ctx.res, 204, corsHeaders);
      return;
    }
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
