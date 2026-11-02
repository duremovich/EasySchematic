/**
 * Validation for community types (guardrails 2, 3 and 4 of the custom-types
 * spec; 1 is didYouMean.ts). Used by the API on every write and by the devices
 * site's Types page for live feedback, so both give the same answer.
 */
import { ALL_CATEGORIES, DEVICE_TYPE_ALIASES, DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import {
  CONNECTOR_GROUP_NAMES,
  SIGNAL_GROUP_NAMES,
  builtinConnectors,
  builtinSignals,
  cablePrefix,
  isBuiltinConnector,
  signalAliases,
} from "../typeRegistry";
import { checkSignalColor } from "./color";
import {
  CONNECTOR_GENDER_OPTIONS,
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
export const MAX_MATING_LIST = 30;

/** Cable-ID prefix of a community signal: 2–4 capitals (built-ins hold the 1-letter ones). */
export const CABLE_PREFIX_RE = /^[A-Z]{2,4}$/;

/**
 * What validation needs to know about the stored community types: ids and
 * status for uniqueness, plus `data` for the signal / connector cross-checks
 * (cable-prefix uniqueness, connector references). Any kind, any status.
 */
export type ExistingCustomType = Pick<CustomTypeRecord, "kind" | "id" | "status"> & { data?: Record<string, unknown> };

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
 * types plus every alias spelling (and the slug form of each, since
 * "AVoIP Encoder" would otherwise come back as "avoip-encoder"). Lower-cased.
 * Connectors have no alias table; their built-in ids are reserved alone.
 */
export function reservedTypeIds(kind: CustomTypeKind): ReadonlyMap<string, string> {
  const reserved = new Map<string, string>();
  const add = (key: string, why: string) => {
    if (!reserved.has(key.toLowerCase())) reserved.set(key.toLowerCase(), why);
    const slug = slugifyTypeId(key);
    if (slug && !reserved.has(slug)) reserved.set(slug, why);
  };
  const addAll = (builtins: readonly string[], aliases: Record<string, string>) => {
    for (const id of builtins) add(id, `the built-in ${kind} type "${id}"`);
    for (const [alias, target] of Object.entries(aliases)) add(alias, `an alias of the built-in ${kind} type "${target}"`);
  };
  if (kind === "device") addAll(Object.keys(DEVICE_TYPE_TO_CATEGORY), DEVICE_TYPE_ALIASES);
  else if (kind === "signal") addAll(builtinSignals(), signalAliases());
  else addAll(builtinConnectors(), {});
  return reserved;
}

/**
 * Format + uniqueness (guardrail 3). `existing` is every community type already
 * stored, any kind and any status — a retired id stays taken.
 */
export function checkTypeIdAvailable(
  kind: CustomTypeKind,
  id: unknown,
  existing: readonly ExistingCustomType[],
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

/** A connector id a custom type may point at: built in, or a stored community connector. */
export function isKnownConnectorRef(id: string, existing: readonly ExistingCustomType[]): boolean {
  return isBuiltinConnector(id) || existing.some((r) => r.kind === "connector" && r.id === id);
}

/**
 * Cable-ID prefix check: format, then unique against every built-in prefix and
 * every other community signal's (`selfId` is the signal being edited, if any).
 */
export function checkCablePrefix(prefix: unknown, existing: readonly ExistingCustomType[], selfId?: string): string | null {
  if (typeof prefix !== "string" || !prefix) return "Cable-ID prefix is required";
  if (!CABLE_PREFIX_RE.test(prefix)) return "Cable-ID prefix must be 2–4 capital letters (e.g. WC)";
  const builtin = builtinSignals().find((id) => cablePrefix(id) === prefix);
  if (builtin) return `Cable-ID prefix "${prefix}" is already used by the built-in signal "${builtin}"`;
  const clash = existing.find((r) => r.kind === "signal" && r.id !== selfId && r.data?.cablePrefix === prefix);
  if (clash) return `Cable-ID prefix "${prefix}" is already used by the community signal "${clash.id}"`;
  return null;
}

export interface KindDataContext {
  /** The type's own id (new or being edited). */
  selfId: string;
  existing: readonly ExistingCustomType[];
  /** Stored data when editing. A colour or prefix left unchanged isn't re-judged, so a
   *  later rule change (a new theme, a new built-in prefix) never locks a row. */
  previous?: Record<string, unknown>;
}

export type KindDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; suggestedColor?: string };

function checkGroup(group: unknown, names: readonly string[]): string | null {
  if (typeof group !== "string" || !group) return "Group is required";
  if (!names.includes(group)) return `Group "${group}" is not an existing group. Pick one of: ${names.join(", ")}`;
  return null;
}

function checkMatingList(
  raw: unknown,
  field: string,
  ctx: KindDataContext,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, ids: [] };
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) return { ok: false, error: `${field} must be a list of connector ids` };
  const ids = [...new Set(raw as string[])];
  if (ids.length > MAX_MATING_LIST) return { ok: false, error: `${field} can name at most ${MAX_MATING_LIST} connectors` };
  for (const id of ids) {
    if (id === ctx.selfId) return { ok: false, error: `${field} can't name the connector itself; a connector always mates with its own kind` };
    if (!isKnownConnectorRef(id, ctx.existing)) return { ok: false, error: `${field}: "${id}" is not a known connector` };
  }
  return { ok: true, ids };
}

/**
 * Kind-specific `data` validation. Returns the cleaned data or an error (with
 * the nearest passing colour when the colour is what failed). Exported for the
 * Types page's live feedback.
 */
export function validateCustomTypeData(kind: CustomTypeKind, raw: unknown, ctx: KindDataContext): KindDataResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const descErr = checkText(obj.description, "Description", MAX_TYPE_DESCRIPTION, false);
  if (descErr) return { ok: false, error: descErr };
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  const withDescription = (data: Record<string, unknown>) => (description ? { ...data, description } : data);
  switch (kind) {
    case "device": {
      const category = obj.category;
      if (typeof category !== "string" || !category.trim()) return { ok: false, error: "Category is required" };
      if (!ALL_CATEGORIES.includes(category)) {
        return { ok: false, error: `Category "${category}" is not an existing category. Pick one of: ${ALL_CATEGORIES.join(", ")}` };
      }
      return { ok: true, data: withDescription({ category }) };
    }
    case "signal": {
      const unchanged = (f: string) => ctx.previous !== undefined && ctx.previous[f] === obj[f];
      const color = checkSignalColor(obj.color);
      if (!color.hex) return { ok: false, error: color.problems[0] };
      if (!color.ok && !(ctx.previous && ctx.previous.color === color.hex)) {
        return {
          ok: false,
          error: `Colour ${color.hex} is ${color.problems.join(" and ")}. The nearest colour that passes is ${color.suggestion}.`,
          suggestedColor: color.suggestion,
        };
      }
      const groupErr = checkGroup(obj.group, SIGNAL_GROUP_NAMES);
      if (groupErr) return { ok: false, error: groupErr };
      const dc = obj.defaultConnector;
      if (typeof dc !== "string" || !dc) return { ok: false, error: "Default connector is required" };
      if (!isKnownConnectorRef(dc, ctx.existing)) return { ok: false, error: `Default connector "${dc}" is not a known connector` };
      const cableErr = checkText(obj.cable, "Cable name", MAX_TYPE_LABEL, true);
      if (cableErr) return { ok: false, error: cableErr };
      const prefixErr = unchanged("cablePrefix") && typeof obj.cablePrefix === "string" && CABLE_PREFIX_RE.test(obj.cablePrefix)
        ? null
        : checkCablePrefix(obj.cablePrefix, ctx.existing, ctx.selfId);
      if (prefixErr) return { ok: false, error: prefixErr };
      return {
        ok: true,
        data: withDescription({
          color: color.hex,
          group: obj.group as string,
          defaultConnector: dc,
          cable: (obj.cable as string).trim(),
          cablePrefix: obj.cablePrefix as string,
        }),
      };
    }
    case "connector": {
      const groupErr = checkGroup(obj.group, CONNECTOR_GROUP_NAMES);
      if (groupErr) return { ok: false, error: groupErr };
      const cableErr = checkText(obj.cable, "Cable name", MAX_TYPE_LABEL, true);
      if (cableErr) return { ok: false, error: cableErr };
      const gender = obj.gender ?? "none";
      if (!(CONNECTOR_GENDER_OPTIONS as readonly unknown[]).includes(gender)) {
        return { ok: false, error: "Gender must be male, female or none" };
      }
      const mates = checkMatingList(obj.matesWith, "Mates with", ctx);
      if (!mates.ok) return mates;
      const adapts = checkMatingList(obj.adaptsTo, "Adapts to", ctx);
      if (!adapts.ok) return adapts;
      const both = mates.ids.find((id) => adapts.ids.includes(id));
      if (both) return { ok: false, error: `"${both}" is in both Mates with and Adapts to; a connector mates with it directly or through an adapter, not both` };
      return {
        ok: true,
        data: withDescription({ group: obj.group as string, cable: (obj.cable as string).trim(), gender, matesWith: mates.ids, adaptsTo: adapts.ids }),
      };
    }
  }
}

export interface NewCustomType {
  kind: CustomTypeKind;
  id: string;
  label: string;
  data: Record<string, unknown>;
  reasonOrUrl: string;
}

export type TypeValidation<T> = { ok: true; value: T } | { ok: false; error: string; suggestedColor?: string };

/** Validate a `POST /types` body against the stored community types. */
export function validateNewCustomType(
  body: unknown,
  existing: readonly ExistingCustomType[],
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
  const data = validateCustomTypeData(kind, obj.data, { selfId: obj.id as string, existing });
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
 * is an error rather than a silent no-op. `existing` (the stored signal and
 * connector types) backs the cross-checks of those two kinds.
 */
export function validateCustomTypeUpdate(
  current: Pick<CustomTypeRecord, "kind" | "id" | "label" | "data" | "status" | "reasonOrUrl">,
  body: unknown,
  existing: readonly ExistingCustomType[] = [],
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
  const data = validateCustomTypeData(current.kind, mergedData, { selfId: current.id, existing, previous: current.data });
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
