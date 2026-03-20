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

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  if (cached) return cached;

  const res = await fetch(`${API_URL}/templates`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as DeviceTemplate[];
  cached = data;
  return data;
}
