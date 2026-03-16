import type { DeviceTemplate } from "../../src/types";

const API_URL = import.meta.env.VITE_API_URL || "https://api.easyschematic.live";

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
