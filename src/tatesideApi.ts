import type { DeviceTemplate } from "./types";

const DEFAULT_TATESIDE_API_URL = "/api/tateside";

const TATESIDE_API_URL = (
  import.meta.env?.VITE_TATESIDE_API_URL ?? DEFAULT_TATESIDE_API_URL
).replace(/\/$/, "");

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface SharePointItem {
  id: string;
  name: string;
  type: "folder" | "file";
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
}

export interface SharePointListing {
  folderId: string | null;
  folderName: string;
  parentId: string | null;
  breadcrumbs: { id: string | null; name: string }[];
  items: SharePointItem[];
}

export interface SharePointSavedFile {
  id: string;
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
}

export class TatesideApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TatesideApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  options: { method?: HttpMethod; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${TATESIDE_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const fallback =
      res.status === 404
        ? "TateSide API endpoint is not available yet"
        : `TateSide API request failed (${res.status})`;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new TatesideApiError(data?.error || fallback, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function fetchTatesideDeviceTemplates(): Promise<DeviceTemplate[]> {
  return requestJson<DeviceTemplate[]>("/devices/templates");
}

export async function saveTatesideDeviceTemplates(
  templates: Omit<DeviceTemplate, "id" | "version">[],
  options: { note?: string; source?: "bulk-json" | "bulk-csv" } = {},
): Promise<{ templates: DeviceTemplate[] }> {
  return requestJson("/devices/templates", {
    method: "POST",
    body: {
      templates,
      ...(options.note ? { note: options.note } : {}),
      ...(options.source ? { source: options.source } : {}),
    },
  });
}

export async function updateTatesideDeviceTemplate(
  templateId: string,
  template: Omit<DeviceTemplate, "id" | "version">,
  options: { note?: string; source?: string } = {},
): Promise<{ template: DeviceTemplate }> {
  return requestJson(`/devices/templates/${encodeURIComponent(templateId)}`, {
    method: "PUT",
    body: {
      template,
      ...(options.note ? { note: options.note } : {}),
      ...(options.source ? { source: options.source } : {}),
    },
  });
}

export async function deleteTatesideDeviceTemplate(
  templateId: string,
  options: { note?: string } = {},
): Promise<void> {
  await requestJson(`/devices/templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    body: options.note ? { note: options.note } : {},
  });
}

export async function listSharePointFolder(folderId?: string | null): Promise<SharePointListing> {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  return requestJson<SharePointListing>(`/sharepoint/children${query}`);
}

export async function saveSchematicToSharePoint(
  folderId: string | null,
  fileName: string,
  data: unknown,
): Promise<SharePointSavedFile> {
  return requestJson<SharePointSavedFile>("/sharepoint/schematics", {
    method: "PUT",
    body: { folderId, fileName, data },
  });
}

export async function loadSchematicFromSharePoint(fileId: string): Promise<unknown> {
  return requestJson<unknown>(`/sharepoint/schematics/${encodeURIComponent(fileId)}`);
}
