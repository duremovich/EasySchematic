import type { DeviceTemplate } from "./types";
import fallbackData from "./deviceLibrary.fallback.json";

const API_URL =
  import.meta.env.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

let cached: DeviceTemplate[] | null = null;

export function getBundledTemplates(): DeviceTemplate[] {
  return fallbackData as DeviceTemplate[];
}

/** Look up a card template by ID from cached API data or bundled fallback. */
export function getTemplateById(id: string): DeviceTemplate | undefined {
  const source = cached ?? fallbackData as DeviceTemplate[];
  return source.find((t) => t.id === id);
}

/** Return all card templates that belong to a given slot family. */
export function getCardsByFamily(family: string): DeviceTemplate[] {
  const source = cached ?? (fallbackData as DeviceTemplate[]);
  return source.filter((t) => t.slotFamily === family);
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

// ==================== TEMPLATES ====================

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  if (cached) return cached;

  const res = await fetch(`${API_URL}/templates`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as DeviceTemplate[];
  cached = data;
  return data;
}
