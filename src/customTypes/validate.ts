/**
 * Validation for community types (guardrails 1, 3 and 4 of the custom-types
 * spec). Used by the API on every write and by the devices site's Types page
 * for live feedback, so both give the same answer.
 */
import { ALL_CATEGORIES, DEVICE_TYPE_ALIASES, DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import {
  CUSTOM_TYPE_STATUSES,
  isCustomTypeKind,
  type CustomTypeKind,
  type CustomTypeRecord,
  type CustomTypeStatus,
} from "./model";

/** Guardrail 3: ids are permanent, so the format is strict. 2–31 chars. */
export const CUSTOM_TYPE_ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

export const MAX_TYPE_LABEL = 60;
export const MAX_TYPE_DESCRIPTION = 500;
export const MAX_TYPE_REASON = 500;

/** Turn free text ("Wireless DMX Node", "RS-232 box") into a candidate id. */
export function slugifyTypeId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31)
    .replace(/-+$/, "");
}

/** Format check only. Returns an error message, or null when well-formed. */
export function checkTypeIdFormat(id: unknown): string | null {
  if (typeof id !== "string" || id === "") return "Id is required";
  if (!CUSTOM_TYPE_ID_RE.test(id)) {
    return "Id must be 2–31 characters of lowercase letters, digits and hyphens, starting with a letter or digit (e.g. wireless-dmx-node)";
  }
  return null;
}

/**
 * Built-in ids a community type of this kind may never take: the code-defined
 * types plus every alias spelling (and the slug form of each alias, since
 * "AVoIP Encoder" would otherwise come back as "avoip-encoder"). Lower-cased.
 * Signal and connector built-ins join here in P3.
 */
export function reservedTypeIds(kind: CustomTypeKind): ReadonlyMap<string, string> {
  const reserved = new Map<string, string>();
  if (kind === "device") {
    for (const id of Object.keys(DEVICE_TYPE_TO_CATEGORY)) reserved.set(id.toLowerCase(), `built-in device type "${id}"`);
    for (const [alias, target] of Object.entries(DEVICE_TYPE_ALIASES)) {
      const why = `an alias of the built-in device type "${target}"`;
      reserved.set(alias.toLowerCase(), why);
      reserved.set(slugifyTypeId(alias), reserved.get(slugifyTypeId(alias)) ?? why);
    }
  }
  return reserved;
}

/**
 * Format + uniqueness (guardrail 3). `existing` is every community type already
 * stored, any kind and any status — a retired id stays taken.
 */
export function checkTypeIdAvailable(
  kind: CustomTypeKind,
  id: unknown,
  existing: readonly Pick<CustomTypeRecord, "kind" | "id" | "status">[],
): string | null {
  const fmt = checkTypeIdFormat(id);
  if (fmt) return fmt;
  const key = (id as string).toLowerCase();
  const builtin = reservedTypeIds(kind).get(key);
  if (builtin) return `"${id}" is already taken: it is ${builtin}.`;
  const clash = existing.find((r) => r.kind === kind && r.id.toLowerCase() === key);
  if (clash) {
    return clash.status === "retired"
      ? `"${id}" is already a community ${kind} type (retired). Unretire it instead of creating it again.`
      : `"${id}" is already a community ${kind} type.`;
  }
  return null;
}

function checkText(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value == null || value === "") return required ? `${field} is required` : null;
  if (typeof value !== "string") return `${field} must be a string`;
  if (required && value.trim() === "") return `${field} is required`;
  if (value.length > max) return `${field} must be ${max} characters or fewer`;
  return null;
}

/** Kind-specific `data` validation. Returns the cleaned data or an error. */
function validateKindData(
  kind: CustomTypeKind,
  raw: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  switch (kind) {
    case "device": {
      const category = obj.category;
      if (typeof category !== "string" || !category.trim()) return { ok: false, error: "Category is required" };
      if (!ALL_CATEGORIES.includes(category)) {
        return { ok: false, error: `Category "${category}" is not an existing category. Pick one of: ${ALL_CATEGORIES.join(", ")}` };
      }
      const descErr = checkText(obj.description, "Description", MAX_TYPE_DESCRIPTION, false);
      if (descErr) return { ok: false, error: descErr };
      const description = typeof obj.description === "string" ? obj.description.trim() : "";
      return { ok: true, data: description ? { category, description } : { category } };
    }
    case "signal":
    case "connector":
      // P3 adds these kinds (colour, group, mating lists…). Refuse until then
      // so nothing half-defined lands in D1.
      return { ok: false, error: `Community ${kind} types are not supported yet` };
  }
}

export interface NewCustomType {
  kind: CustomTypeKind;
  id: string;
  label: string;
  data: Record<string, unknown>;
  reasonOrUrl: string;
}

export type TypeValidation<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate a `POST /types` body against the stored community types. */
export function validateNewCustomType(
  body: unknown,
  existing: readonly Pick<CustomTypeRecord, "kind" | "id" | "status">[],
): TypeValidation<NewCustomType> {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body must be a JSON object" };
  const obj = body as Record<string, unknown>;
  if (!isCustomTypeKind(obj.kind)) return { ok: false, error: `kind must be one of: device, signal, connector` };
  const kind = obj.kind;
  const idErr = checkTypeIdAvailable(kind, obj.id, existing);
  if (idErr) return { ok: false, error: idErr };
  const labelErr = checkText(obj.label, "Label", MAX_TYPE_LABEL, true);
  if (labelErr) return { ok: false, error: labelErr };
  const reasonErr = checkText(obj.reasonOrUrl, "Reason or reference URL", MAX_TYPE_REASON, true);
  if (reasonErr) return { ok: false, error: reasonErr };
  const data = validateKindData(kind, obj.data);
  if (!data.ok) return data;
  return {
    ok: true,
    value: {
      kind,
      id: obj.id as string,
      label: (obj.label as string).trim(),
      data: data.data,
      reasonOrUrl: (obj.reasonOrUrl as string).trim(),
    },
  };
}

export interface CustomTypeUpdate {
  label: string;
  data: Record<string, unknown>;
  status: CustomTypeStatus;
  reasonOrUrl: string | null;
}

/**
 * Validate a `PUT /types/:kind/:id` body. Fields left out keep their current
 * value; `id` and `kind` are immutable (guardrail 3) — sending a different one
 * is an error rather than a silent no-op.
 */
export function validateCustomTypeUpdate(
  current: Pick<CustomTypeRecord, "kind" | "id" | "label" | "data" | "status" | "reasonOrUrl">,
  body: unknown,
): TypeValidation<CustomTypeUpdate> {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body must be a JSON object" };
  const obj = body as Record<string, unknown>;
  if (obj.id !== undefined && obj.id !== current.id) {
    return { ok: false, error: "A type's id cannot be changed once created. Retire it and create a new one instead." };
  }
  if (obj.kind !== undefined && obj.kind !== current.kind) return { ok: false, error: "A type's kind cannot be changed" };

  const label = obj.label !== undefined ? obj.label : current.label;
  const labelErr = checkText(label, "Label", MAX_TYPE_LABEL, true);
  if (labelErr) return { ok: false, error: labelErr };

  let status: CustomTypeStatus = current.status;
  if (obj.status !== undefined) {
    if (!(CUSTOM_TYPE_STATUSES as readonly unknown[]).includes(obj.status)) {
      return { ok: false, error: "status must be active or retired" };
    }
    status = obj.status as CustomTypeStatus;
  }

  const reason = obj.reasonOrUrl !== undefined ? obj.reasonOrUrl : current.reasonOrUrl;
  const reasonErr = checkText(reason, "Reason or reference URL", MAX_TYPE_REASON, false);
  if (reasonErr) return { ok: false, error: reasonErr };

  const mergedData = obj.data !== undefined && obj.data !== null && typeof obj.data === "object"
    ? { ...current.data, ...(obj.data as Record<string, unknown>) }
    : current.data;
  const data = validateKindData(current.kind, mergedData);
  if (!data.ok) return data;

  return {
    ok: true,
    value: {
      label: (label as string).trim(),
      data: data.data,
      status,
      reasonOrUrl: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    },
  };
}
