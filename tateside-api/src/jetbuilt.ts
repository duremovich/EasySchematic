import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type {
  ExtractedQuoteDevice,
  JetbuiltClientSearchResult,
  JetbuiltIndexStatus,
  JetbuiltProjectSearchResult,
  QuoteImportExtractionResponse,
} from "../../src/quoteImportTypes.js";
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

export interface JetbuiltClientOptions {
  apiKey: string;
  baseUrl?: string;
  indexPath: string;
  refreshMs: number;
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
  client?: { id?: unknown; company_name?: unknown } | null;
  total_contract_cost?: { cents?: unknown; currency_iso?: unknown } | null;
}

interface JetbuiltRawClient {
  id?: unknown;
  company_name?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
  primary_contact_first_name?: unknown;
  primary_contact_last_name?: unknown;
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
  room_name?: unknown;
  room?: unknown;
  system_name?: unknown;
  system?: unknown;
}

interface JetbuiltIndexData {
  syncedAt: string | null;
  clients: JetbuiltClientSearchResult[];
  projects: JetbuiltProjectSearchResult[];
}

interface JetbuiltIndexState {
  data: JetbuiltIndexData;
  refreshing: boolean;
  lastError: string | null;
  refreshPromise: Promise<void> | null;
  refreshTimerStarted: boolean;
}

const indexState: JetbuiltIndexState = {
  data: {
    syncedAt: null,
    clients: [],
    projects: [],
  },
  refreshing: false,
  lastError: null,
  refreshPromise: null,
  refreshTimerStarted: false,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: unknown): string {
  return compact(value).toLowerCase();
}

function normalizeToken(value: unknown): string {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
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

function extractProjectId(project: JetbuiltRawProject): string | null {
  const raw = project.id ?? project.project_id;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
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

function projectTotal(project: JetbuiltRawProject): number | null {
  const direct = maybeNumber(project.total);
  if (direct != null) return direct;
  const cents = maybeNumber(project.total_contract_cost?.cents);
  return cents == null ? null : cents / 100;
}

function projectCurrency(project: JetbuiltRawProject): string | null {
  return compact(project.currency ?? project.total_contract_cost?.currency_iso) || null;
}

function toProjectSearchResult(project: JetbuiltRawProject): JetbuiltProjectSearchResult | null {
  const id = extractProjectId(project);
  if (!id) return null;
  return {
    id,
    customId: extractCustomId(project),
    name: compact(project.name ?? project.title) || `Project ${id}`,
    clientId: project.client?.id == null ? null : String(project.client.id),
    clientName: compact(project.client?.company_name) || null,
    stage: compact(project.stage) || null,
    active: maybeBoolean(project.active),
    updatedAt: compact(project.updated_at ?? project.updatedAt) || null,
    itemCount: maybeNumber(project.item_count),
    currency: projectCurrency(project),
    total: projectTotal(project),
  };
}

function toClientSearchResult(client: JetbuiltRawClient, projectCount: number): JetbuiltClientSearchResult | null {
  const id = client.id == null ? null : String(client.id).trim();
  const companyName = compact(client.company_name);
  if (!id || !companyName) return null;
  const firstName = compact(client.primary_contact_first_name);
  const lastName = compact(client.primary_contact_last_name);
  const primaryContactName = [firstName, lastName].filter(Boolean).join(" ") || null;
  return {
    id,
    companyName,
    primaryContactName,
    updatedAt: compact(client.updated_at ?? client.updatedAt) || null,
    projectCount,
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

function extractCollectionItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record.projects)) return record.projects;
    if (Array.isArray(record.clients)) return record.clients;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.line_items)) return record.line_items;
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

async function fetchPagedCollection(startUrl: string, options: JetbuiltClientOptions): Promise<unknown[]> {
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
    all.push(...extractCollectionItems(json));
    url = getLinkHeaderNextUrl(response.headers.get("link"));
  }
  return all;
}

function ensureIndexDirectory(indexPath: string): void {
  mkdirSync(path.dirname(indexPath), { recursive: true });
}

function readIndexFromDisk(indexPath: string): JetbuiltIndexData | null {
  try {
    const raw = readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw) as JetbuiltIndexData;
    if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeIndexToDisk(indexPath: string, data: JetbuiltIndexData): void {
  ensureIndexDirectory(indexPath);
  writeFileSync(indexPath, JSON.stringify(data, null, 2), "utf8");
}

function projectScore(project: JetbuiltProjectSearchResult, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const customId = normalizeText(project.customId);
  const name = normalizeText(project.name);
  const id = normalizeText(project.id);
  const clientName = normalizeText(project.clientName);
  if (customId && customId === q) return 1000;
  if (id === q) return 950;
  if (customId && customId.startsWith(q)) return 900;
  if (name.startsWith(q)) return 800;
  if (name.includes(q)) return 700;
  if (clientName && clientName.includes(q)) return 550;
  if (customId && customId.includes(q)) return 500;
  return 0;
}

function clientScore(client: JetbuiltClientSearchResult, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const companyName = normalizeText(client.companyName);
  const primaryContact = normalizeText(client.primaryContactName);
  const id = normalizeText(client.id);
  if (companyName === q) return 1000;
  if (id === q) return 950;
  if (companyName.startsWith(q)) return 900;
  if (companyName.includes(q)) return 800;
  if (primaryContact && primaryContact.includes(q)) return 650;
  return 0;
}

function sortByUpdatedDesc<T extends { updatedAt: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

async function refreshIndex(options: JetbuiltClientOptions): Promise<void> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const [rawClients, rawProjects] = await Promise.all([
    fetchPagedCollection(`${baseUrl}/clients`, options),
    fetchPagedCollection(`${baseUrl}/projects`, options),
  ]);

  const projects = rawProjects
    .map((project) => toProjectSearchResult(project as JetbuiltRawProject))
    .filter((project): project is JetbuiltProjectSearchResult => project !== null);

  const projectCountByClientId = new Map<string, number>();
  for (const project of projects) {
    if (!project.clientId) continue;
    projectCountByClientId.set(project.clientId, (projectCountByClientId.get(project.clientId) ?? 0) + 1);
  }

  const clients = rawClients
    .map((client) => toClientSearchResult(client as JetbuiltRawClient, projectCountByClientId.get(String((client as JetbuiltRawClient).id ?? "")) ?? 0))
    .filter((client): client is JetbuiltClientSearchResult => client !== null);

  const data: JetbuiltIndexData = {
    syncedAt: new Date().toISOString(),
    clients: sortByUpdatedDesc(clients),
    projects: sortByUpdatedDesc(projects),
  };

  indexState.data = data;
  indexState.lastError = null;
  writeIndexToDisk(options.indexPath, data);
}

function startRefresh(options: JetbuiltClientOptions): Promise<void> {
  if (indexState.refreshPromise) return indexState.refreshPromise;
  indexState.refreshing = true;
  indexState.refreshPromise = refreshIndex(options)
    .catch((err) => {
      indexState.lastError = err instanceof Error ? err.message : "Jetbuilt sync failed";
    })
    .finally(() => {
      indexState.refreshing = false;
      indexState.refreshPromise = null;
    });
  return indexState.refreshPromise;
}

function scheduleRefresh(options: JetbuiltClientOptions): void {
  if (indexState.refreshTimerStarted) return;
  indexState.refreshTimerStarted = true;
  setInterval(() => {
    void startRefresh(options);
  }, Math.max(60_000, options.refreshMs)).unref();
}

export function initializeJetbuiltIndex(options: JetbuiltClientOptions): void {
  const disk = readIndexFromDisk(options.indexPath);
  if (disk) {
    indexState.data = disk;
  }
  scheduleRefresh(options);
  void startRefresh(options);
}

export async function ensureJetbuiltIndexReady(options: JetbuiltClientOptions): Promise<void> {
  if (!indexState.refreshTimerStarted) {
    initializeJetbuiltIndex(options);
  }

  if (indexState.data.projects.length === 0 && indexState.data.clients.length === 0) {
    await startRefresh(options);
    return;
  }

  const syncedAt = indexState.data.syncedAt ? Date.parse(indexState.data.syncedAt) : 0;
  if (!syncedAt || Date.now() - syncedAt > options.refreshMs) {
    void startRefresh(options);
  }
}

export function getJetbuiltIndexStatus(): JetbuiltIndexStatus {
  return {
    syncedAt: indexState.data.syncedAt,
    refreshing: indexState.refreshing,
    projectCount: indexState.data.projects.length,
    clientCount: indexState.data.clients.length,
    lastError: indexState.lastError,
  };
}

export function searchJetbuiltProjects(query: string): JetbuiltProjectSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return indexState.data.projects
    .map((project) => ({ project, score: projectScore(project, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.project.updatedAt ?? "").localeCompare(a.project.updatedAt ?? ""))
    .slice(0, 25)
    .map((entry) => entry.project);
}

export function searchJetbuiltClients(query: string): JetbuiltClientSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return indexState.data.clients
    .map((client) => ({ client, score: clientScore(client, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.client.projectCount - a.client.projectCount))
    .slice(0, 25)
    .map((entry) => entry.client);
}

export function listJetbuiltProjectsForClient(clientId: string): JetbuiltProjectSearchResult[] {
  return indexState.data.projects
    .filter((project) => project.clientId === clientId)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
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

export async function importJetbuiltProject(
  db: DatabaseSync,
  projectId: string,
  options: JetbuiltClientOptions,
): Promise<QuoteImportExtractionResponse> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const project = await requestJson<JetbuiltRawProject>(`${baseUrl}/projects/${encodeURIComponent(projectId)}`, options).catch(() => null);
  const items = await fetchPagedCollection(`${baseUrl}/projects/${encodeURIComponent(projectId)}/items`, options);
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
      "Project/client search is powered by the cached Jetbuilt index and refreshes hourly.",
      "PDF quote upload remains available as a fallback path.",
    ],
  };
}
