import type { DeviceTemplate } from "./types";
import fallbackData from "./deviceLibrary.fallback.json";
import communityTypesFallback from "./communityTypes.fallback.json";
import {
  loadCachedCommunityTypes,
  loadCachedTemplates,
  saveCachedCommunityTypes,
  saveCachedTemplates,
} from "./templateCache";
import { registerTypes } from "./typeRegistry";
import { isCustomTypeKind, typeDefsFromRecords, type CustomTypeRecord } from "./customTypes/model";

const API_URL =
  import.meta.env?.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

let cached: DeviceTemplate[] | null = null;

// True when the in-memory library came from the IndexedDB cache or bundled
// fallback rather than a fresh API fetch — the UI surfaces this so a fresh
// machine that can't reach the API isn't silently missing community devices. (#181)
let degraded = false;
export function isLibraryDegraded(): boolean {
  return degraded;
}

export function getBundledTemplates(): DeviceTemplate[] {
  return fallbackData as DeviceTemplate[];
}

/** Bundled templates as a floor under whatever the API returned. Used so a freshly-added
 *  card in src/devices/* shows up in slot pickers and lookups even before its row lands
 *  in D1. D1 wins on ID conflict (lets prod overrides shadow bundled defaults). */
function effectiveTemplates(): DeviceTemplate[] {
  const bundled = fallbackData as DeviceTemplate[];
  if (!cached) return bundled;
  const cachedIds = new Set(cached.map((t) => t.id).filter((id): id is string => !!id));
  const bundledFloor = bundled.filter((t) => t.id && !cachedIds.has(t.id));
  return [...cached, ...bundledFloor];
}

/** Look up a card template by ID from cached API data, bundled fallback, or caller-supplied extras (user's custom templates). */
export function getTemplateById(id: string, extra: DeviceTemplate[] = []): DeviceTemplate | undefined {
  return effectiveTemplates().find((t) => t.id === id) ?? extra.find((t) => t.id === id);
}

/** Return all card templates that belong to a given slot family, merging bundled and caller-supplied extras. */
export function getCardsByFamily(family: string, extra: DeviceTemplate[] = []): DeviceTemplate[] {
  return [
    ...effectiveTemplates().filter((t) => t.slotFamily === family),
    ...extra.filter((t) => t.slotFamily === family),
  ];
}

// ==================== AUTH & DRAFTS ====================

export async function checkSession(): Promise<{ id: string; email: string; name: string | null } | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function requestLogin(email: string, returnTo?: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, ...(returnTo ? { returnTo } : {}) }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error: string };
    throw new Error(data.error || "Failed to send login link");
  }
}

export async function createDraft(data: unknown): Promise<string> {
  const res = await fetch(`${API_URL}/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to create draft");
  }
  const result = (await res.json()) as { id: string };
  return result.id;
}

export async function createHandoff(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/handoff`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to create handoff token");
  }
  const result = (await res.json()) as { token: string };
  return result.token;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

// ==================== CLOUD SCHEMATICS ====================

export interface CloudSchematic {
  id: string;
  name: string;
  size_bytes: number;
  shared: number;
  share_token: string | null;
  is_template: number;
  created_at: string;
  updated_at: string;
}

export async function saveSchematicToCloud(data: unknown): Promise<CloudSchematic> {
  const res = await fetch(`${API_URL}/schematics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to save schematic");
  }
  return res.json();
}

export async function updateSchematicInCloud(id: string, data: unknown): Promise<CloudSchematic> {
  const res = await fetch(`${API_URL}/schematics/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to update schematic");
  }
  return res.json();
}

export async function listCloudSchematics(): Promise<CloudSchematic[]> {
  const res = await fetch(`${API_URL}/schematics`, { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to list schematics");
  }
  return res.json();
}

export async function loadCloudSchematic(id: string): Promise<unknown> {
  const res = await fetch(`${API_URL}/schematics/${id}`, { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to load schematic");
  }
  return res.json();
}

export async function deleteCloudSchematic(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/schematics/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to delete schematic");
  }
}

export async function toggleSchematicSharing(id: string, shared: boolean): Promise<CloudSchematic> {
  const res = await fetch(`${API_URL}/schematics/${id}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ shared }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to toggle sharing");
  }
  return res.json();
}

export async function loadSharedSchematic(token: string): Promise<unknown> {
  const res = await fetch(`${API_URL}/shared/${token}`, { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Shared schematic not found");
  }
  return res.json();
}

export async function renameCloudSchematic(id: string, name: string): Promise<CloudSchematic> {
  const res = await fetch(`${API_URL}/schematics/${id}/rename`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to rename schematic");
  }
  return res.json();
}

export async function setSchematicAsTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/schematics/${id}/set-template`, {
    method: "PUT",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to set template");
  }
}

export async function clearSchematicTemplate(): Promise<void> {
  const res = await fetch(`${API_URL}/schematics/template`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to clear template");
  }
}

export async function loadSchematicTemplate(): Promise<unknown | null> {
  const res = await fetch(`${API_URL}/schematics/template`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error || "Failed to load template");
  }
  return res.json();
}

// ==================== TEMPLATES ====================

/** Submit a single device template to the community review queue. */
export async function createSubmission(
  action: "create" | "update",
  data: Omit<DeviceTemplate, "id" | "version">,
  templateId?: string,
  submitterNote?: string,
  source?: "manual" | "bulk-json" | "bulk-csv",
): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action,
      data,
      templateId,
      ...(submitterNote && { submitterNote }),
      ...(source && { source }),
    }),
  });
  if (res.status === 401) throw new Error("Sign in to submit to the community library");
  if (res.status === 403) throw new Error("Account suspended");
  if (res.status === 429) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Too many submissions — try again later");
  }
  if (res.status === 409) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Duplicate submission");
  }
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error || `Submission failed: ${res.status}`);
  }
  return res.json();
}

const TEMPLATE_FETCH_TIMEOUT_MS = 12_000;
const TEMPLATE_FETCH_RETRIES = 2;

async function fetchTemplatesOnce(): Promise<DeviceTemplate[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPLATE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/templates`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as DeviceTemplate[];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the community library, resiliently. On a fresh, non-degraded cache hit
 * this is a no-op. Otherwise it retries the network a few times (with a timeout),
 * then falls back to the last-good IndexedDB cache, and only throws if there's
 * nothing cached — at which point the caller keeps the bundled subset and warns
 * the user. The `degraded` flag tracks whether the result is fresh. (#181)
 */
export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  void loadCommunityTypes(); // the types the library's ports use; once per page load
  if (cached && !degraded) return effectiveTemplates();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= TEMPLATE_FETCH_RETRIES; attempt++) {
    try {
      const data = await fetchTemplatesOnce();
      cached = data;
      degraded = false;
      void saveCachedTemplates(data); // persist last-good full library for next time
      return effectiveTemplates();
    } catch (err) {
      lastErr = err;
      if (attempt < TEMPLATE_FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  // Network failed every attempt — use the last-good cached library if present.
  const cachedLib = await loadCachedTemplates();
  if (cachedLib?.length) {
    cached = cachedLib;
    degraded = true;
    return effectiveTemplates();
  }

  // Nothing cached either — caller keeps the bundled subset and surfaces a notice.
  degraded = true;
  throw lastErr instanceof Error ? lastErr : new Error("Failed to load device library");
}

// ==================== COMMUNITY TYPES ====================

/** Community signals, connectors and device types baked in by `npm run generate-fallback`:
 *  what an offline-first or self-hosted build knows before (or without) `GET /types`. */
export function getBundledCommunityTypes(): CustomTypeRecord[] {
  return communityTypesFallback as CustomTypeRecord[];
}

let registeredTypesJson: string | null = null;

function registerCommunityTypes(records: readonly CustomTypeRecord[]): void {
  const json = JSON.stringify(records);
  if (json === registeredTypesJson) return; // unchanged: don't re-render every picker
  registeredTypesJson = json;
  registerTypes("community", typeDefsFromRecords(records));
}

/** Register the last-good community types, or the bundled ones. Synchronous, so the app
 *  calls it before its first render and an open schematic never flashes grey. */
export function initCommunityTypes(): void {
  registerCommunityTypes(loadCachedCommunityTypes() ?? getBundledCommunityTypes());
}

let communityTypesPromise: Promise<void> | null = null;

/**
 * Fetch `GET /types` once per page load and register the answer as the registry's
 * community layer. It rides the library's ETag (`no-cache` + `ETag` from `library_meta`),
 * so the browser revalidates and an unchanged list costs one row read. A 304 or a
 * failure keeps the last-good copy (cache, else bundled); a failure retries on the next
 * call. Never throws.
 */
export function loadCommunityTypes(): Promise<void> {
  communityTypesPromise ??= fetchCommunityTypesOnce().catch(() => {
    communityTypesPromise = null;
    initCommunityTypes();
  });
  return communityTypesPromise;
}

async function fetchCommunityTypesOnce(): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPLATE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/types`, { signal: ctrl.signal });
    if (res.status === 304) {
      initCommunityTypes();
      return;
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error("Malformed /types response");
    const records = (body as unknown[]).filter(
      (r): r is CustomTypeRecord =>
        !!r && typeof r === "object" && isCustomTypeKind((r as CustomTypeRecord).kind) &&
        typeof (r as CustomTypeRecord).id === "string",
    );
    registerCommunityTypes(records);
    saveCachedCommunityTypes(records);
  } finally {
    clearTimeout(timer);
  }
}
