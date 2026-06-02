import type { DatabaseSync } from "node:sqlite";
import type { ExtractedQuoteDevice, JetbuiltProjectSearchResult, QuoteImportExtractionResponse } from "../../src/quoteImportTypes.js";
import { inspectQuoteDevicesAgainstLibrary, normalizedLookupKey } from "./quoteImport.js";

const DEFAULT_BASE_URL = "https://app.jetbuilt.com/api";
const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "TateSide Schematic Jetbuilt Import/1.0",
};
const REQUEST_GAP_MS = 260;
const REQUEST_TIMEOUT_MS = 30_000;

let lastRequestAt = 0;
let authMode: "Bearer" | "Token" = "Bearer";

interface JetbuiltClientOptions {
  apiKey: string;
  baseUrl?: string;
}

interface JetbuiltRawProject {
  id?: unknown;
  project_id?: unknown;
  name?: unknown;
  title?: unknown;
  custom_id?: unknown;
  customId?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  stage?: unknown;
  active?: unknown;
  item_count?: unknown;
  currency?: unknown;
  total?: unknown;
  custom_fields?: unknown;
}

interface JetbuiltRawItem {
  manufacturer_name?: unknown;
  manufacturer?: unknown;
  model?: unknown;
  part_number?: unknown;
  short_description?: unknown;
  description?: unknown;
  product_name?: unknown;
  quantity?: unknown;
  product_id?: unknown;
  category_name?: unknown;
  item_type?: unknown;
  type?: unknown;
  room_name?: unknown;
  room?: unknown;
  system_name?: unknown;
  system?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeToken(value: unknown): string {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toIsoDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return 0;
}

function getLinkHeaderNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const urlMatch = part.match(/<([^>]+)>/);
    const relMatch = part.match(/rel="?next"?/i);
    if (urlMatch && relMatch) return urlMatch[1];
  }
  return null;
}

function extractCustomId(project: JetbuiltRawProject): string | null {
  const direct = compact(project.custom_id ?? project.customId);
  if (direct) return direct;

  const fields = project.custom_fields;
  if (fields && typeof fields === "object") {
    const record = fields as Record<string, unknown>;
    const fromKnownKey = compact(record.CustomID ?? record.customId ?? record.custom_id);
    if (fromKnownKey) return fromKnownKey;
  }

  return null;
}

function extractProjectId(project: JetbuiltRawProject): string | null {
  const raw = project.id ?? project.project_id;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

function maybeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maybeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function toProjectSearchResult(project: JetbuiltRawProject): JetbuiltProjectSearchResult | null {
  const id = extractProjectId(project);
  if (!id) return null;
  return {
    id,
    customId: extractCustomId(project),
    name: compact(project.name ?? project.title) || `Project ${id}`,
    stage: compact(project.stage) || null,
    active: maybeBoolean(project.active),
    updatedAt: compact(project.updated_at ?? project.updatedAt) || null,
    itemCount: maybeNumber(project.item_count),
    currency: compact(project.currency) || null,
    total: maybeNumber(project.total),
  };
}

async function requestJson<T>(url: string, options: JetbuiltClientOptions): Promise<T> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < REQUEST_GAP_MS) {
    await sleep(REQUEST_GAP_MS - elapsed);
  }
  lastRequestAt = Date.now();

  const headers = {
    ...DEFAULT_HEADERS,
    Authorization: authMode === "Bearer" ? `Bearer ${options.apiKey}` : `Token token=${options.apiKey}`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Jetbuilt request timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    headers,
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (response.status === 401 && authMode === "Bearer") {
    authMode = "Token";
    return requestJson<T>(url, options);
  }

  if (response.status === 429 || response.status >= 500) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    await sleep(Math.max(retryAfter, 750));
    return requestJson<T>(url, options);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Jetbuilt request failed (${response.status})${text ? `: ${text}` : ""}`);
  }

  return response.json() as Promise<T>;
}

async function fetchCollection(startUrl: string, options: JetbuiltClientOptions): Promise<unknown[]> {
  const all: unknown[] = [];
  let url: string | null = startUrl;
  while (url) {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_GAP_MS) {
      await sleep(REQUEST_GAP_MS - elapsed);
    }
    lastRequestAt = Date.now();

    const headers = {
      ...DEFAULT_HEADERS,
      Authorization: authMode === "Bearer" ? `Bearer ${options.apiKey}` : `Token token=${options.apiKey}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Jetbuilt request timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 401 && authMode === "Bearer") {
      authMode = "Token";
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      await sleep(Math.max(retryAfter, 750));
      continue;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Jetbuilt collection fetch failed (${response.status})${text ? `: ${text}` : ""}`);
    }

    const json = await response.json() as unknown;
    if (Array.isArray(json)) {
      all.push(...json);
    } else if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      if (Array.isArray(record.projects)) all.push(...record.projects);
      else if (Array.isArray(record.items)) all.push(...record.items);
      else if (Array.isArray(record.line_items)) all.push(...record.line_items);
      else if (Array.isArray(record.data)) all.push(...record.data);
    }

    url = getLinkHeaderNextUrl(response.headers.get("link"));
  }

  return all;
}

function projectScore(project: JetbuiltProjectSearchResult, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;

  const customId = normalizeText(project.customId);
  const name = normalizeText(project.name);
  const id = normalizeText(project.id);

  if (customId && customId === q) return 1000;
  if (id === q) return 900;
  if (customId && customId.startsWith(q)) return 800;
  if (name.startsWith(q)) return 700;
  if (name.includes(q)) return 600;
  if (customId && customId.includes(q)) return 500;
  return 0;
}

const EXCLUDE_KEYWORDS = [
  "mount",
  "bracket",
  "shelf",
  "rack rail",
  "rack ears",
  "rack ear",
  "wall mount",
  "ceiling mount",
  "projector mount",
  "tv mount",
  "display mount",
  "table mount",
  "pole mount",
  "unistrut",
  "box",
  "enclosure",
  "furniture",
  "labor",
  "installation",
  "install",
  "commissioning",
  "cable",
  "cord",
  "patch cord",
  "connector",
  "adapter plate",
  "faceplate",
  "face plate",
  "blank plate",
  "trim kit",
  "fastener",
  "bolt",
  "screw",
  "clip",
];

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function itemText(item: JetbuiltRawItem): string {
  return normalizeText([
    item.short_description,
    item.description,
    item.manufacturer_name,
    item.manufacturer,
    item.model,
    item.part_number,
    item.product_name,
    item.category_name,
  ].filter(Boolean).join(" "));
}

function isSchematicRelevant(item: JetbuiltRawItem): boolean {
  const text = itemText(item);
  if (!text) return false;
  if (hasKeyword(text, EXCLUDE_KEYWORDS)) return false;

  const positives = [
    "projector", "display", "monitor", "tv", "screen", "switch", "router", "matrix", "processor",
    "scaler", "converter", "codec", "encoder", "decoder", "amplifier", "speaker", "microphone",
    "camera", "control", "touch", "panel", "transmitter", "receiver", "extender", "server", "storage",
    "access point", "dsp", "recorder", "media server", "wireless", "intercom", "kvm", "patch panel",
    "wall plate", "audio", "video", "network", "presentation",
  ];

  return hasKeyword(text, positives) || item.product_id != null;
}

function sanitizeQuantity(value: unknown): number | null {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  return null;
}

function mergeDevices(devices: ExtractedQuoteDevice[]): ExtractedQuoteDevice[] {
  const merged = new Map<string, ExtractedQuoteDevice>();
  for (const device of devices) {
    const key = device.normalizedLookupKey || normalizeToken(device.sourceLineText || device.description || device.model) || `device-${merged.size + 1}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...device });
      continue;
    }

    merged.set(key, {
      manufacturer: existing.manufacturer ?? device.manufacturer,
      model: existing.model.length >= device.model.length ? existing.model : device.model,
      description: compact(existing.description).length >= compact(device.description).length ? existing.description : device.description,
      quantity: existing.quantity == null && device.quantity == null ? null : (existing.quantity ?? 0) + (device.quantity ?? 0),
      sourceLineText: compact(existing.sourceLineText).length >= compact(device.sourceLineText).length ? existing.sourceLineText : device.sourceLineText,
      normalizedLookupKey: existing.normalizedLookupKey || device.normalizedLookupKey,
    });
  }

  return [...merged.values()].sort((a, b) => {
    const makerCompare = (a.manufacturer ?? "").localeCompare(b.manufacturer ?? "");
    if (makerCompare !== 0) return makerCompare;
    return a.model.localeCompare(b.model);
  });
}

function extractItemsToDevices(items: JetbuiltRawItem[]): ExtractedQuoteDevice[] {
  return mergeDevices(
    items
      .filter(isSchematicRelevant)
      .map((item) => {
        const manufacturer = compact(item.manufacturer_name ?? item.manufacturer) || null;
        const model = compact(item.model ?? item.part_number ?? item.product_name);
        if (!model) return null;
        const description = compact(item.short_description ?? item.description ?? item.product_name) || null;
        const quantity = sanitizeQuantity(item.quantity);
        const room = compact(item.room_name ?? item.room);
        const system = compact(item.system_name ?? item.system);
        const sourceLineText = [manufacturer, model, description, room ? `Room: ${room}` : "", system ? `System: ${system}` : ""]
          .filter(Boolean)
          .join(" ")
          .trim();

        return {
          manufacturer,
          model,
          description,
          quantity,
          sourceLineText: sourceLineText || null,
          normalizedLookupKey: normalizedLookupKey(manufacturer, model),
        } satisfies ExtractedQuoteDevice;
      })
      .filter((item): item is ExtractedQuoteDevice => item !== null),
  );
}

export async function searchJetbuiltProjects(query: string, options: JetbuiltClientOptions): Promise<JetbuiltProjectSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const projectUrl = new URL(`${baseUrl}/projects`);
  projectUrl.searchParams.set("min_updated_at", toIsoDate(3650));
  projectUrl.searchParams.set("limit", "250");

  const projects = await fetchCollection(projectUrl.toString(), options);
  return projects
    .map((project) => toProjectSearchResult(project as JetbuiltRawProject))
    .filter((project): project is JetbuiltProjectSearchResult => project !== null)
    .map((project) => ({ project, score: projectScore(project, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.project.updatedAt ?? "").localeCompare(a.project.updatedAt ?? ""))
    .slice(0, 20)
    .map((entry) => entry.project);
}

export async function importJetbuiltProject(
  db: DatabaseSync,
  projectId: string,
  options: JetbuiltClientOptions,
): Promise<QuoteImportExtractionResponse> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const project = await requestJson<JetbuiltRawProject>(`${baseUrl}/projects/${encodeURIComponent(projectId)}`, options).catch(() => null);
  const items = await fetchCollection(`${baseUrl}/projects/${encodeURIComponent(projectId)}/items`, options);
  const devices = extractItemsToDevices(items as JetbuiltRawItem[]);
  const results = inspectQuoteDevicesAgainstLibrary(db, devices);
  const summary = project ? toProjectSearchResult(project) : null;

  return {
    fileName: summary?.customId ? `${summary.customId} ${summary.name}` : summary?.name ?? `Jetbuilt Project ${projectId}`,
    fileType: "jetbuilt/project",
    extractedCount: devices.length,
    extractionModel: "jetbuilt-project-api",
    extractionReasoningEffort: "low",
    results,
    warnings: [
      "Imported directly from Jetbuilt project data without PDF scanning.",
      "PDF quote upload remains available as a fallback path.",
    ],
  };
}
