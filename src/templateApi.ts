import type { DeviceTemplate } from "./types";
import fallbackData from "./deviceLibrary.fallback.json";

const API_URL =
  import.meta.env?.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

let cached: DeviceTemplate[] | null = null;

export function getBundledTemplates(): DeviceTemplate[] {
  return fallbackData as DeviceTemplate[];
}

/** Look up a card template by ID from cached API data, bundled fallback, or caller-supplied extras (user's custom templates). */
export function getTemplateById(id: string, extra: DeviceTemplate[] = []): DeviceTemplate | undefined {
  const source = cached ?? fallbackData as DeviceTemplate[];
  return source.find((t) => t.id === id) ?? extra.find((t) => t.id === id);
}

/** Return all card templates that belong to a given slot family, merging bundled and caller-supplied extras. */
export function getCardsByFamily(family: string, extra: DeviceTemplate[] = []): DeviceTemplate[] {
  const source = cached ?? (fallbackData as DeviceTemplate[]);
  return [...source.filter((t) => t.slotFamily === family), ...extra.filter((t) => t.slotFamily === family)];
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

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  if (cached) return cached;

  const res = await fetch(`${API_URL}/templates`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as DeviceTemplate[];
  cached = data;
  return data;
}
