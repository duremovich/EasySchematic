import type { DeviceTemplate } from "../../src/types";

const API_URL = import.meta.env.VITE_API_URL || "https://api.easyschematic.live";

// ==================== TEMPLATES (public) ====================

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  const res = await fetch(`${API_URL}/templates`);
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
  return res.json();
}

export async function fetchTemplate(id: string): Promise<DeviceTemplate> {
  const res = await fetch(`${API_URL}/templates/${id}`);
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

// ==================== TEMPLATES (admin token) ====================

export async function createTemplate(template: Omit<DeviceTemplate, "id" | "version">, token: string): Promise<DeviceTemplate> {
  const res = await fetch(`${API_URL}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(template),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed to create template: ${res.status}`);
  return res.json();
}

export async function updateTemplate(id: string, template: Omit<DeviceTemplate, "id" | "version">, token: string): Promise<DeviceTemplate> {
  const res = await fetch(`${API_URL}/templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(template),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed to update template: ${res.status}`);
  return res.json();
}

export async function deleteTemplate(id: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}/templates/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
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

export async function requestMagicLink(email: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
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
  status: "pending" | "approved" | "rejected";
  reviewerId: string | null;
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  submitterEmail?: string;
  submitterName?: string;
}

export async function createSubmission(
  action: "create" | "update",
  data: Omit<DeviceTemplate, "id" | "version">,
  templateId?: string,
): Promise<Submission> {
  const res = await fetch(`${API_URL}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, data, templateId }),
  });
  if (res.status === 401) throw new Error("Not authenticated");
  if (res.status === 403) throw new Error("Account suspended");
  if (res.status === 429) throw new Error("Too many submissions. Try again later.");
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
