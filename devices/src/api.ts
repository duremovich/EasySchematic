import type { DeviceTemplate, SignalType } from "../../src/types";

const API_URL = import.meta.env.VITE_API_URL || "https://api.easyschematic.live";

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
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
  return res.json();
}

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  const res = await fetch(`${API_URL}/templates`);
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
  return res.json();
}

export async function fetchTemplate(id: string): Promise<DeviceTemplate> {
  // Include credentials so logged-in mods/admins can view flagged-for-deletion
  // templates via the standard endpoint (non-mods still get 404 for flagged rows).
  const res = await fetch(`${API_URL}/templates/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`);
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

export async function approveSubmission(id: string, data?: Omit<DeviceTemplate, "id" | "version">): Promise<void> {
  const res = await fetch(`${API_URL}/submissions/${id}/approve`, {
    method: "POST",
    headers: data ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: data ? JSON.stringify({ data }) : undefined,
  });
  if (!res.ok) throw new Error(`Failed to approve: ${res.status}`);
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
  moderator_email: string;
  moderator_name: string | null;
  // Action taxonomy (string, not narrowed union — taxonomy grows over time):
  //   approve, reject, defer, edit, send_back,
  //   flag-delete, unflag-delete, confirm-delete,
  //   note_added, note_edited, note_deleted
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
  email: string;
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
