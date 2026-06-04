import type { DeviceTemplate } from "./types";
import type {
  ExtractedQuoteDevice,
  JetbuiltClientSearchResult,
  JetbuiltIndexStatus,
  JetbuiltProjectSearchResult,
  QuoteImportResearchJobResponse,
  QuoteImportExtractionResponse,
  QuoteImportResearchResponse,
} from "./quoteImportTypes";

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

export interface TatesideBulkEditResultItem {
  id: string;
  beforeLabel: string;
  afterLabel: string;
  beforeManufacturer: string | null;
  afterManufacturer: string | null;
  status: "updated" | "unchanged" | "conflict" | "invalid";
  reason?: string;
  conflictWithId?: string;
  conflictWithLabel?: string;
}

export interface TatesideBulkEditResult {
  templates: DeviceTemplate[];
  results: TatesideBulkEditResultItem[];
}

export interface TatesideBulkDeleteResultItem {
  id: string;
  label: string;
  manufacturer: string | null;
  status: "deleted";
}

export interface TatesideBulkDeleteResult {
  results: TatesideBulkDeleteResultItem[];
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTatesideDeviceTemplates(): Promise<DeviceTemplate[]> {
  return requestJson<DeviceTemplate[]>("/devices/templates");
}

export async function saveTatesideDeviceTemplates(
  templates: Omit<DeviceTemplate, "id" | "version">[],
  options: { note?: string; source?: string } = {},
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

export async function bulkEditTatesideDeviceTemplates(
  input: {
    templateIds: string[];
    setManufacturer?: string;
    removeLabelPrefix?: string;
    findLabelText?: string;
    replaceLabelText?: string;
    note?: string;
    source?: string;
    preview?: boolean;
  },
): Promise<TatesideBulkEditResult> {
  return requestJson<TatesideBulkEditResult>("/devices/templates/bulk-edit", {
    method: "POST",
    body: {
      templateIds: input.templateIds,
      ...(input.setManufacturer !== undefined ? { setManufacturer: input.setManufacturer } : {}),
      ...(input.removeLabelPrefix ? { removeLabelPrefix: input.removeLabelPrefix } : {}),
      ...(input.findLabelText ? { findLabelText: input.findLabelText, replaceLabelText: input.replaceLabelText ?? "" } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.preview ? { preview: true } : {}),
    },
  });
}

export async function bulkDeleteTatesideDeviceTemplates(
  input: {
    templateIds: string[];
    note?: string;
    source?: string;
  },
): Promise<TatesideBulkDeleteResult> {
  return requestJson<TatesideBulkDeleteResult>("/devices/templates/bulk-delete", {
    method: "POST",
    body: {
      templateIds: input.templateIds,
      ...(input.note ? { note: input.note } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
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

export async function importDevicesFromQuote(file: File): Promise<QuoteImportExtractionResponse> {
  const res = await fetch(`${TATESIDE_API_URL}/quote-import/extract`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/pdf",
      "X-Tateside-Upload-Filename": encodeURIComponent(file.name),
    },
    credentials: "include",
    body: file,
  });

  if (!res.ok) {
    const fallback =
      res.status === 404
        ? "TateSide quote import endpoint is not available yet"
        : `TateSide API request failed (${res.status})`;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new TatesideApiError(data?.error || fallback, res.status);
  }

  return res.json() as Promise<QuoteImportExtractionResponse>;
}

export async function searchJetbuiltProjects(query: string): Promise<JetbuiltProjectSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const response = await requestJson<{ projects: JetbuiltProjectSearchResult[] }>(`/jetbuilt/projects?query=${encodeURIComponent(trimmed)}`);
  return response.projects;
}

export async function searchJetbuiltClients(query: string): Promise<JetbuiltClientSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const response = await requestJson<{ clients: JetbuiltClientSearchResult[] }>(`/jetbuilt/clients?query=${encodeURIComponent(trimmed)}`);
  return response.clients;
}

export async function listJetbuiltProjectsForClient(clientId: string): Promise<JetbuiltProjectSearchResult[]> {
  const response = await requestJson<{ projects: JetbuiltProjectSearchResult[] }>(`/jetbuilt/clients/${encodeURIComponent(clientId)}/projects`);
  return response.projects;
}

export async function fetchJetbuiltIndexStatus(): Promise<JetbuiltIndexStatus> {
  return requestJson<JetbuiltIndexStatus>("/jetbuilt/status");
}

export async function importDevicesFromJetbuiltProject(projectId: string): Promise<QuoteImportExtractionResponse> {
  return requestJson<QuoteImportExtractionResponse>("/jetbuilt/import", {
    method: "POST",
    body: { projectId },
  });
}

export async function researchQuoteDevices(
  fileName: string,
  devices: ExtractedQuoteDevice[],
  options: { forceEscalation?: boolean } = {},
): Promise<QuoteImportResearchResponse> {
  const startResponse = await requestJson<QuoteImportResearchJobResponse>("/quote-import/research", {
    method: "POST",
    body: {
      fileName,
      devices,
      ...(options.forceEscalation ? { forceEscalation: true } : {}),
    },
  });

  if (startResponse.status === "complete" && startResponse.result) {
    return startResponse.result;
  }

  let jobResponse = startResponse;
  const startedAt = Date.now();
  const maxWaitMs = 30 * 60 * 1000;

  while (jobResponse.status === "queued" || jobResponse.status === "running") {
    if (Date.now() - startedAt > maxWaitMs) {
      throw new TatesideApiError("Quote research is still running. Please try again in a moment.", 504);
    }

    await sleep(2000);
    jobResponse = await requestJson<QuoteImportResearchJobResponse>(`/quote-import/research/${encodeURIComponent(jobResponse.jobId)}`);
  }

  if (jobResponse.status === "complete" && jobResponse.result) {
    return jobResponse.result;
  }

  throw new TatesideApiError(jobResponse.error || "Missing-device research failed", 500);
}
