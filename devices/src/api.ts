import type { DeviceTemplate, SignalType } from "../../src/types";
import type { CustomTypeKind, CustomTypeRecord } from "../../src/customTypes";
import { typeDefsFromRecords } from "../../src/customTypes/model";
import { registerTypes } from "../../src/typeRegistry";
import {
  saveSummaries,
  loadSummaries,
  saveFullLibrary,
  loadFullLibrary,
  saveTemplate,
  loadTemplate,
  deleteCachedTemplate,
  getFullLibraryMeta,
} from "./templateCache";

const API_URL = import.meta.env.VITE_API_URL || "https://api.easyschematic.live";

/**
 * Error carrying an HTTP status, so callers can tell a real server response
 * (404/500 — should surface as an error) apart from a network failure (fetch
 * rejecting with a TypeError — should fall back to the offline cache).
 */
export class ApiError extends Error {
  // Plain field rather than a constructor parameter property: the root app
  // tsconfig sets erasableSyntaxOnly, and src/__tests__ imports this module.
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? `API ${status}`);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * True when the failure is network-shaped rather than an HTTP response: fetch
 * rejecting (no ApiError) or the browser reporting itself offline. Only these
 * warrant serving stale cache — an HTTP error means the server answered.
 */
function isNetworkFailure(err: unknown): boolean {
  return !(err instanceof ApiError) || !navigator.onLine;
}

// ==================== TEMPLATES (public) ====================

export interface TemplateSummary {
  id: string;
  label: string;
  deviceType: string;
  category: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  searchTerms?: string[];
  portCount: number;
  signalTypes: SignalType[];
  slotCount: number;
}

export async function fetchTemplateSummaries(): Promise<TemplateSummary[]> {
  const res = await fetch(`${API_URL}/templates/summary`);
  if (!res.ok) throw new ApiError(res.status, `Failed to fetch templates: ${res.status}`);
  return res.json();
}

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  const res = await fetch(`${API_URL}/templates`);
  if (!res.ok) throw new ApiError(res.status, `Failed to fetch templates: ${res.status}`);
  return res.json();
}

export async function fetchTemplate(id: string): Promise<DeviceTemplate> {
  // Include credentials so logged-in mods/admins can view flagged-for-deletion
  // templates via the standard endpoint (non-mods still get 404 for flagged rows).
  const res = await fetch(`${API_URL}/templates/${id}`, { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, `Failed to fetch template: ${res.status}`);
  return res.json();
}

export async function fetchDeviceTypes(): Promise<string[]> {
  const res = await fetch(`${API_URL}/templates/device-types`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${API_URL}/templates/categories`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSearchTerms(): Promise<string[]> {
  const res = await fetch(`${API_URL}/templates/search-terms`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchManufacturers(): Promise<string[]> {
  const res = await fetch(`${API_URL}/templates/manufacturers`);
  if (!res.ok) return [];
  return res.json();
}

// ==================== OFFLINE-AWARE LIBRARY LOADERS ====================
// These wrap the raw fetchers above with an IndexedDB fallback so the public
// browse/detail pages keep working with no network after one online visit.
// API responses ship no-cache headers, so this app-level cache is the right
// layer (HTTP/SW response caching is unreliable here).

export interface LibraryResult<T> {
  data: T;
  /** True when the network fetch failed and we served from the IndexedDB cache. */
  offline: boolean;
  /** When the served data was last saved (ms epoch), or null when fresh from network. */
  savedAt: number | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let prefetchStarted = false;

// One shared in-flight full-library download, so a background prefetch and a
// detail page's slot lookup never fetch the multi-MB list concurrently.
let inFlightFullLibrary: Promise<DeviceTemplate[]> | null = null;
function fetchFullLibraryShared(): Promise<DeviceTemplate[]> {
  if (!inFlightFullLibrary) {
    inFlightFullLibrary = fetchTemplates().finally(() => { inFlightFullLibrary = null; });
  }
  return inFlightFullLibrary;
}

/** Browse list: network-first, persist on success, fall back to cache only on network failure. */
export async function loadTemplateSummaries(): Promise<LibraryResult<TemplateSummary[]>> {
  try {
    const summaries = await fetchTemplateSummaries();
    void saveSummaries(summaries);
    // We're online and know the library size — kick off the background full-library
    // prefetch here so callers don't have to orchestrate it.
    prefetchFullLibrary(summaries.length);
    return { data: summaries, offline: false, savedAt: null };
  } catch (err) {
    if (isNetworkFailure(err)) {
      const cached = await loadSummaries();
      if (cached) return { data: cached.summaries, offline: true, savedAt: cached.savedAt };
    }
    throw err; // real HTTP error, or nothing cached — let the page show its error state
  }
}

/** Detail page: network-first for one template, warm the cache, fall back only offline. */
export async function loadDeviceTemplate(id: string): Promise<LibraryResult<DeviceTemplate>> {
  try {
    const template = await fetchTemplate(id);
    void saveTemplate(template);
    return { data: template, offline: false, savedAt: null };
  } catch (err) {
    // Gone upstream (deleted / flagged) — evict it so a stale copy can't linger.
    if (err instanceof ApiError && err.status === 404) {
      void deleteCachedTemplate(id);
      throw err;
    }
    if (isNetworkFailure(err)) {
      const cached = await loadTemplate(id);
      if (cached) return { data: cached, offline: true, savedAt: null };
    }
    throw err;
  }
}

/**
 * Full library, used by the detail page's slot section and the submit form.
 * Fresh cache (< 24h, complete) is served without any network. Otherwise it
 * downloads (sharing the in-flight prefetch), and offline it returns the cached
 * library ONLY if a complete full-library save exists — never a partial store
 * of a few deep-linked records (which would render a wrong "compatible cards"
 * list). Never throws.
 */
export async function loadAllTemplates(): Promise<DeviceTemplate[]> {
  const meta = await getFullLibraryMeta();
  const fresh = meta != null && Date.now() - meta.savedAt < ONE_DAY_MS;
  if (fresh) {
    const cached = await loadFullLibrary();
    if (cached && cached.length === meta.count) return cached;
  }
  try {
    const all = await fetchFullLibraryShared();
    void saveFullLibrary(all);
    return all;
  } catch {
    if (meta) {
      const cached = await loadFullLibrary();
      if (cached && cached.length === meta.count) return cached;
    }
    return [];
  }
}

/**
 * Background prefetch of the FULL library so EVERY detail page works offline,
 * not just previously-visited ones. Fires once per session, low-priority, and
 * skips the fetch when the cache is already fresh (< 24h old and same count as
 * the summary the user just loaded). Never blocks or throws.
 */
export function prefetchFullLibrary(summaryCount: number): void {
  if (prefetchStarted) return;
  prefetchStarted = true;
  void (async () => {
    try {
      const meta = await getFullLibraryMeta();
      const fresh = meta != null && Date.now() - meta.savedAt < ONE_DAY_MS && meta.count === summaryCount;
      if (fresh) return;
      const all = await fetchFullLibraryShared();
      await saveFullLibrary(all);
    } catch {
      // offline / transient — release the latch so a later summary load this
      // session can retry, and let detail pages fall back to whatever's cached.
      prefetchStarted = false;
    }
  })();
}

// ==================== DRAFTS ====================

export async function fetchDraft(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/drafts/${id}`, {
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Draft not found or expired");
    throw new Error(`Failed to fetch draft: ${res.status}`);
  }
  return res.json();
}

// ==================== TEMPLATES (admin token or admin/moderator session) ====================

function templateAuthInit(token: string | null): RequestInit {
  if (token) {
    return { headers: { Authorization: `Bearer ${token}` } };
  }
  return { credentials: "include" };
}

export async function createTemplate(template: Omit<DeviceTemplate, "id" | "version">, token: string | null): Promise<DeviceTemplate> {
  const init = templateAuthInit(token);
  const res = await fetch(`${API_URL}/templates`, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(template),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed to create template: ${res.status}`);
  return res.json();
}

export async function updateTemplate(id: string, template: Omit<DeviceTemplate, "id" | "version">, token: string | null): Promise<DeviceTemplate> {
  const init = templateAuthInit(token);
  const res = await fetch(`${API_URL}/templates/${id}`, {
    ...init,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(template),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed to update template: ${res.status}`);
  return res.json();
}

export async function deleteTemplate(id: string, token: string | null): Promise<void> {
  const init = templateAuthInit(token);
  const res = await fetch(`${API_URL}/templates/${id}`, {
    ...init,
    method: "DELETE",
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed to delete template: ${res.status}`);
}

const TOKEN_KEY = "easyschematic_admin_token";
export function getAdminToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setAdminToken(token: string): void { localStorage.setItem(TOKEN_KEY, token); }
export function clearAdminToken(): void { localStorage.removeItem(TOKEN_KEY); }

// ==================== AUTH (session-based) ====================

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  stats?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
}

export async function requestMagicLink(email: string, returnTo?: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, ...(returnTo ? { returnTo } : {}) }),
  });
  if (res.status === 429) {
    const data = await res.json() as { error: string };
    throw new Error(data.error);
  }
  if (!res.ok) {
    const data = await res.json() as { error: string };
    throw new Error(data.error || "Failed to send login link");
  }
}

export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch(`${API_URL}/auth/me`, {
    credentials: "include",
  });
  // A real 401/error means "logged out". A network failure rejects the fetch and
  // propagates — App treats that as offline (not a false logout) so it won't
  // redirect a signed-in user to /login and lose their return URL.
  if (res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function updateProfile(data: { name?: string }): Promise<void> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error || "Failed to update profile");
  }
}

export interface Contributor {
  id: string;
  name: string;
  approvedCount: number;
  createdCount: number;
  editedCount: number;
}

export async function fetchContributors(): Promise<Contributor[]> {
  const res = await fetch(`${API_URL}/contributors`);
  if (!res.ok) throw new Error(`Failed to fetch contributors: ${res.status}`);
  return res.json();
}

export interface ContributorTemplate {
  id: string;
  label: string;
  device_type: string;
  category: string;
  contribution: "created" | "edited" | "both";
}

export async function fetchContributorTemplates(userId: string): Promise<ContributorTemplate[]> {
  const res = await fetch(`${API_URL}/contributors/${userId}/templates`);
  if (!res.ok) throw new Error(`Failed to fetch contributor templates: ${res.status}`);
  return res.json();
}

export async function claimAuthToken(token: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error || "Failed to claim auth token");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

// ==================== SUBMISSIONS ====================

export interface Submission {
  id: string;
  userId: string;
  action: "create" | "update";
  templateId: string | null;
  data: Omit<DeviceTemplate, "id" | "version">;
  status: "pending" | "approved" | "rejected" | "deferred";
  reviewerId: string | null;
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  submitterEmail?: string;
  submitterName?: string;
  submitterNote?: string;
  source?: "manual" | "bulk-json" | "bulk-csv" | "moderator-flag";
  claimedBy: string | null;
  claimedAt: string | null;
  claimerEmail?: string;
  claimerName?: string;
}

export async function createSubmission(
  action: "create" | "update",
  data: Omit<DeviceTemplate, "id" | "version">,
  templateId?: string,
  submitterNote?: string,
  source: "manual" | "bulk-json" | "bulk-csv" = "manual",
): Promise<Submission> {
  const res = await fetch(`${API_URL}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, data, templateId, source, ...(submitterNote && { submitterNote }) }),
  });
  if (res.status === 401) throw new Error("Not authenticated");
  if (res.status === 403) throw new Error("Account suspended");
  if (res.status === 429) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || "Too many submissions. Try again later.");
  }
  if (res.status === 409) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || "Duplicate submission");
  }
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error || `Submission failed: ${res.status}`);
  }
  return res.json();
}

export async function updateSubmission(
  id: string,
  data: Omit<DeviceTemplate, "id" | "version">,
  submitterNote?: string,
): Promise<Submission> {
  const res = await fetch(`${API_URL}/submissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ data, ...(submitterNote && { submitterNote }) }),
  });
  if (res.status === 401) throw new Error("Not authenticated");
  if (res.status === 403) throw new Error("Account suspended");
  if (res.status === 404) throw new Error("Submission not found");
  if (res.status === 409) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || "Submission cannot be edited");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error || `Update failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchMySubmissions(): Promise<Submission[]> {
  const res = await fetch(`${API_URL}/submissions/mine`, {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Not authenticated");
  if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`);
  return res.json();
}

export async function fetchPendingSubmissions(): Promise<Submission[]> {
  const res = await fetch(`${API_URL}/submissions/pending`, {
    credentials: "include",
  });
  if (res.status === 403) throw new Error("Moderator access required");
  if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`);
  return res.json();
}

export async function fetchSubmission(id: string): Promise<Submission> {
  const res = await fetch(`${API_URL}/submissions/${id}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch submission: ${res.status}`);
  return res.json();
}

/** Approval result. `warnings` names port signal / connector ids no built-in or community type defines. */
export interface ApproveResult {
  ok: true;
  status: "approved";
  warnings?: string[];
  unknownTypes?: { signals: string[]; connectors: string[] };
}

export async function approveSubmission(id: string, data?: Omit<DeviceTemplate, "id" | "version">): Promise<ApproveResult> {
  const res = await fetch(`${API_URL}/submissions/${id}/approve`, {
    method: "POST",
    headers: data ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: data ? JSON.stringify({ data }) : undefined,
  });
  if (!res.ok) {
    // The unmapped-deviceType refusal (#315) tells the moderator which file to
    // edit — swallowing the body for a bare status code loses the whole point.
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Failed to approve: ${res.status}`);
  }
  return res.json();
}

export async function rejectSubmission(id: string, note?: string): Promise<void> {
  const res = await fetch(`${API_URL}/submissions/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(`Failed to reject: ${res.status}`);
}

export async function claimSubmission(id: string): Promise<void> {
  await fetch(`${API_URL}/submissions/${id}/claim`, {
    method: "POST",
    credentials: "include",
  });
  // Silently ignore errors — claim is advisory, not critical
}

export async function deferSubmission(id: string, note: string): Promise<void> {
  const res = await fetch(`${API_URL}/submissions/${id}/defer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(`Failed to defer: ${res.status}`);
}

// ==================== USER MANAGEMENT (admin) ====================

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  role: string;
  banned: number;
  created_at: string;
  last_login_at: string | null;
}

export async function fetchUsers(): Promise<UserRecord[]> {
  const res = await fetch(`${API_URL}/users`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json();
}

export async function updateUserRole(id: string, role: string): Promise<void> {
  const res = await fetch(`${API_URL}/users/${id}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to update role: ${res.status}`);
}

export async function updateUserBan(id: string, banned: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/users/${id}/ban`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ banned }),
  });
  if (!res.ok) throw new Error(`Failed to update ban status: ${res.status}`);
}

// ==================== MOD ACTIVITY (admin) ====================

export interface ModAction {
  id: number;
  moderator_id: string;
  moderator_email?: string | null; // Omitted by the server; kept optional for back-compat.
  moderator_name: string | null;
  // Action taxonomy (string, not narrowed union — taxonomy grows over time):
  //   approve, reject, defer, edit, send_back,
  //   flag-delete, unflag-delete, confirm-delete,
  //   note_added, note_edited, note_deleted,
  //   type_create, type_edit, type_retire, type_unretire, type_delete (custom-types P1)
  action: string;
  submission_id: string | null;
  template_id: string | null;
  before_data: string | null;
  after_data: string | null;
  submission_data_override: string | null;
  submission_action: "create" | "update" | null;
  submission_data: string | null;
  note: string | null;
  created_at: string;
}

export interface ModeratorSummary {
  id: string;
  name: string | null;
  role: string;
}

export async function fetchModActivity(opts?: {
  moderatorId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<ModAction[]> {
  const params = new URLSearchParams();
  if (opts?.moderatorId) params.set("moderator_id", opts.moderatorId);
  if (opts?.action) params.set("action", opts.action);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/admin/mod-activity${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch mod activity: ${res.status}`);
  return res.json();
}

export async function fetchModerators(): Promise<ModeratorSummary[]> {
  const res = await fetch(`${API_URL}/admin/moderators`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch moderators: ${res.status}`);
  return res.json();
}

// ==================== MODERATOR TEMPLATE TOOLS ====================

export interface TemplateNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateModHistoryEntry {
  action: string;
  note: string | null;
  createdAt: string;
  moderatorName: string;
}

export interface TemplateAdminView extends DeviceTemplate {
  submittedBy?: { name: string };
  lastEditedBy?: { name: string };
  approvedAt: string | null;
  approvedBy: { name: string } | null;
  approvedSchemaVersion: string | null;
  needsReview: boolean;
  needsReviewReason: string | null;
  flaggedForDeletion: boolean;
  flaggedForDeletionReason: string | null;
  flaggedForDeletionAt: string | null;
  flaggedBy: { id: string; name: string; email: string | null } | null;
  modNotes: TemplateNote[];
  modHistory: TemplateModHistoryEntry[];
}

export interface PendingDeletion {
  id: string;
  label: string;
  deviceType: string;
  category: string;
  manufacturer: string | null;
  modelNumber: string | null;
  flaggedReason: string;
  flaggedAt: string;
  flaggedBy: { id: string; name: string; email: string | null } | null;
}

export async function fetchTemplateAdmin(id: string): Promise<TemplateAdminView> {
  const res = await fetch(`${API_URL}/templates/${id}/admin`, {
    credentials: "include",
  });
  if (res.status === 403) throw new Error("Moderator access required");
  if (!res.ok) throw new Error(`Failed to fetch admin template: ${res.status}`);
  return res.json();
}

export async function fetchTemplateNotes(id: string): Promise<TemplateNote[]> {
  const res = await fetch(`${API_URL}/templates/${id}/notes`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
  return res.json();
}

export async function addTemplateNote(id: string, body: string): Promise<TemplateNote> {
  const res = await fetch(`${API_URL}/templates/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Failed to add note: ${res.status}`);
  return res.json();
}

export async function editTemplateNote(id: string, noteId: string, body: string): Promise<void> {
  const res = await fetch(`${API_URL}/templates/${id}/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Failed to edit note: ${res.status}`);
}

export async function deleteTemplateNote(id: string, noteId: string): Promise<void> {
  const res = await fetch(`${API_URL}/templates/${id}/notes/${noteId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
}

export async function sendBackTemplate(id: string, reason: string): Promise<{ submission_id: string }> {
  const res = await fetch(`${API_URL}/templates/${id}/send-back`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Failed to send back: ${res.status}`);
  }
  return res.json();
}

export async function flagForDeletion(id: string, reason: string): Promise<void> {
  const res = await fetch(`${API_URL}/templates/${id}/flag-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Failed to flag for deletion: ${res.status}`);
  }
}

export async function unflagDeletion(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/templates/${id}/unflag-delete`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Failed to restore template: ${res.status}`);
  }
}

export async function fetchPendingDeletions(): Promise<PendingDeletion[]> {
  const res = await fetch(`${API_URL}/admin/pending-deletions`, {
    credentials: "include",
  });
  if (res.status === 403) throw new Error("Admin access required");
  if (!res.ok) throw new Error(`Failed to fetch pending deletions: ${res.status}`);
  return res.json();
}

// ==================== COMMUNITY TYPES (custom-types P1) ====================

/** Mods use their session; the legacy admin token, when set, rides along too. */
function typeWriteInit(method: string, body?: unknown): RequestInit {
  const token = getAdminToken();
  return {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

/** A refused type write. `suggestedColor` is the API's nearest passing colour (guardrail 2). */
export class TypeWriteError extends Error {
  constructor(message: string, readonly suggestedColor?: string) {
    super(message);
  }
}

async function typeError(res: Response, what: string): Promise<Error> {
  const err = (await res.json().catch(() => ({}))) as { error?: string; suggestedColor?: string };
  return new TypeWriteError(err.error || `Failed to ${what}: ${res.status}`, err.suggestedColor);
}

export async function fetchCustomTypes(kind?: CustomTypeKind): Promise<CustomTypeRecord[]> {
  const res = await fetch(`${API_URL}/types${kind ? `?kind=${kind}` : ""}`);
  if (!res.ok) throw new ApiError(res.status, `Failed to fetch types: ${res.status}`);
  return res.json();
}

let communityTypesPromise: Promise<CustomTypeRecord[]> | null = null;

/**
 * Every community type (all kinds), fetched once per page load and shared by
 * every picker. Each answer is registered into the type registry, so signal and
 * connector labels, colours and mating resolve through the same getters the app
 * uses. Resolves to [] when the API is unreachable so built-ins keep working.
 */
export function loadCommunityTypes(refresh = false): Promise<CustomTypeRecord[]> {
  if (!communityTypesPromise || refresh) {
    communityTypesPromise = fetchCustomTypes()
      .then((records) => {
        registerTypes("community", typeDefsFromRecords(records));
        return records;
      })
      .catch(() => {
        communityTypesPromise = null; // retry on next call
        return [];
      });
  }
  return communityTypesPromise;
}

/** Community device types (from the shared all-kinds fetch). */
export function loadCommunityDeviceTypes(refresh = false): Promise<CustomTypeRecord[]> {
  return loadCommunityTypes(refresh).then((records) => records.filter((r) => r.kind === "device"));
}

export async function createCustomType(input: {
  kind: CustomTypeKind;
  id: string;
  label: string;
  data: Record<string, unknown>;
  reasonOrUrl: string;
}): Promise<CustomTypeRecord> {
  const res = await fetch(`${API_URL}/types`, typeWriteInit("POST", input));
  if (!res.ok) throw await typeError(res, "create type");
  void loadCommunityTypes(true);
  return res.json();
}

export async function updateCustomType(
  kind: CustomTypeKind,
  id: string,
  patch: { label?: string; data?: Record<string, unknown>; status?: "active" | "retired"; reasonOrUrl?: string },
): Promise<CustomTypeRecord> {
  const res = await fetch(`${API_URL}/types/${kind}/${encodeURIComponent(id)}`, typeWriteInit("PUT", patch));
  if (!res.ok) throw await typeError(res, "update type");
  void loadCommunityTypes(true);
  return res.json();
}

export async function deleteCustomType(kind: CustomTypeKind, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/types/${kind}/${encodeURIComponent(id)}`, typeWriteInit("DELETE"));
  if (!res.ok) throw await typeError(res, "delete type");
  void loadCommunityTypes(true);
}
