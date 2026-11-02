/**
 * Community ("custom") types — the shape shared by the API, the devices site and
 * the app. See .claude/plans/custom-types.md.
 *
 * One D1 table (`custom_types`) holds all three kinds: the same row shape,
 * validation entry points and did-you-mean matcher, each kind with its own
 * `data` fields. The `*TypeDef` shapes below are also what `src/typeRegistry.ts`
 * merges — one definition shape from D1 row to canvas.
 *
 * Pure TS: no DOM, no Node, no Workers APIs — the API worker imports this.
 */

export const CUSTOM_TYPE_KINDS = ["device", "signal", "connector"] as const;
export type CustomTypeKind = (typeof CUSTOM_TYPE_KINDS)[number];

export const CUSTOM_TYPE_STATUSES = ["active", "retired"] as const;
export type CustomTypeStatus = (typeof CUSTOM_TYPE_STATUSES)[number];

/** Kind-specific payload for a community device type. */
export interface CustomDeviceTypeData {
  category: string;
  description?: string;
}

export const CONNECTOR_GENDER_OPTIONS = ["male", "female", "none"] as const;
/** Device-side gender of a custom connector. "none" = genderless (no M/F distinction). */
export type CustomConnectorGender = (typeof CONNECTOR_GENDER_OPTIONS)[number];

/** Kind-specific payload for a community signal type. */
export interface CustomSignalTypeData {
  /** Literal `#rrggbb` (there is no `--color-<id>` CSS variable behind it). */
  color: string;
  /** An existing `SIGNAL_GROUPS` key. */
  group: string;
  /** Built-in or community connector a new port of this signal starts with. */
  defaultConnector: string;
  /** Cable name for runs with no connector info (e.g. "Ethernet"). */
  cable: string;
  /** Cable-ID prefix under type-prefix naming, 2–4 capitals, unique. */
  cablePrefix: string;
  description?: string;
}

/** Kind-specific payload for a community connector type. */
export interface CustomConnectorTypeData {
  /** An existing `CONNECTOR_GROUPS` key. */
  group: string;
  /** Cable name for pack lists. */
  cable: string;
  gender: CustomConnectorGender;
  /** Connectors it mates with directly (like EtherCON taking RJ45). */
  matesWith: string[];
  /** Connectors it reaches through an adapter cable (like HD-BNC to BNC). */
  adaptsTo: string[];
  description?: string;
}

/** A non-built-in signal as the type registry holds it. */
export interface SignalTypeDef extends CustomSignalTypeData {
  id: string;
  label: string;
  /** Retired: still renders, hidden from pickers. */
  retired?: boolean;
}

/** A non-built-in connector as the type registry holds it. Mating checks read both ends,
 *  so naming a built-in in `matesWith` / `adaptsTo` is enough. */
export interface ConnectorTypeDef extends CustomConnectorTypeData {
  id: string;
  label: string;
  retired?: boolean;
}

/** A non-built-in device type as the type registry holds it. */
export interface DeviceTypeDef extends CustomDeviceTypeData {
  id: string;
  label: string;
  retired?: boolean;
}

/** One community type as the API returns it from `GET /types`. */
export interface CustomTypeRecord<D = Record<string, unknown>> {
  kind: CustomTypeKind;
  id: string;
  label: string;
  data: D;
  status: CustomTypeStatus;
  reasonOrUrl?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type CustomDeviceTypeRecord = CustomTypeRecord<CustomDeviceTypeData>;
export type CustomSignalTypeRecord = CustomTypeRecord<CustomSignalTypeData>;
export type CustomConnectorTypeRecord = CustomTypeRecord<CustomConnectorTypeData>;

export function isCustomTypeKind(v: unknown): v is CustomTypeKind {
  return typeof v === "string" && (CUSTOM_TYPE_KINDS as readonly string[]).includes(v);
}

/** Narrow a mixed list to the device kind, with `data` typed. */
export function deviceTypesOf(records: readonly CustomTypeRecord[]): CustomDeviceTypeRecord[] {
  return records.filter((r) => r.kind === "device") as unknown as CustomDeviceTypeRecord[];
}

export function signalTypesOf(records: readonly CustomTypeRecord[]): CustomSignalTypeRecord[] {
  return records.filter((r) => r.kind === "signal") as unknown as CustomSignalTypeRecord[];
}

export function connectorTypesOf(records: readonly CustomTypeRecord[]): CustomConnectorTypeRecord[] {
  return records.filter((r) => r.kind === "connector") as unknown as CustomConnectorTypeRecord[];
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Community records → the registry's definition shapes. Tolerant of a malformed
 * row (the API validates writes, but an old or hand-edited row must still
 * render): missing fields fall back to the registry's own unknown-id defaults.
 */
export function typeDefsFromRecords(records: readonly CustomTypeRecord[]): {
  signals: SignalTypeDef[];
  connectors: ConnectorTypeDef[];
  deviceTypes: DeviceTypeDef[];
} {
  const signals: SignalTypeDef[] = [];
  const connectors: ConnectorTypeDef[] = [];
  const deviceTypes: DeviceTypeDef[] = [];
  for (const r of records) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const base = { id: r.id, label: r.label, ...(r.status === "retired" ? { retired: true } : {}) };
    const description = typeof d.description === "string" && d.description ? { description: d.description } : {};
    if (r.kind === "signal") {
      signals.push({
        ...base,
        color: str(d.color, "#71717a"),
        group: str(d.group, "Other"),
        defaultConnector: str(d.defaultConnector, "other"),
        cable: str(d.cable, r.label),
        cablePrefix: str(d.cablePrefix, "X"),
        ...description,
      });
    } else if (r.kind === "connector") {
      const gender = d.gender === "male" || d.gender === "female" ? d.gender : "none";
      connectors.push({
        ...base,
        group: str(d.group, "Other"),
        cable: str(d.cable, r.label),
        gender,
        matesWith: strList(d.matesWith),
        adaptsTo: strList(d.adaptsTo),
        ...description,
      });
    } else if (typeof d.category === "string" && d.category) {
      deviceTypes.push({ ...base, category: d.category, ...description });
    }
  }
  return { signals, connectors, deviceTypes };
}

/** The three kinds of definitions together: a registry layer, the user's library, or
 *  `SchematicFile.customTypes`. Every list is optional on the wire. */
export interface CustomTypeDefs {
  signals?: SignalTypeDef[];
  connectors?: ConnectorTypeDef[];
  deviceTypes?: DeviceTypeDef[];
}

// Same format as validate.ts CUSTOM_TYPE_ID_RE (kept local: validate.ts imports the registry).
const DEF_ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const DEF_HEX_RE = /^#[0-9a-f]{6}$/;
const clip = (v: unknown, max: number, fallback: string): string =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

/**
 * Definitions from somewhere untrusted (a schematic file, a device archive, another tab's
 * localStorage) → the registry shapes. Drops entries without a well-formed id or a label,
 * a duplicate id, and anything that isn't an object; coerces the rest the way
 * `typeDefsFromRecords` does. A colour that isn't a literal `#rrggbb` becomes grey, so a
 * file can never put arbitrary text into a stroke.
 */
export function normalizeTypeDefs(raw: unknown): Required<CustomTypeDefs> {
  const out: Required<CustomTypeDefs> = { signals: [], connectors: [], deviceTypes: [] };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  const each = (list: unknown, fn: (d: Record<string, unknown>, base: { id: string; label: string; retired?: boolean; description?: string }) => void) => {
    if (!Array.isArray(list)) return;
    const seen = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const d = item as Record<string, unknown>;
      if (typeof d.id !== "string" || !DEF_ID_RE.test(d.id) || seen.has(d.id)) continue;
      const label = clip(d.label, 60, "");
      if (!label) continue;
      seen.add(d.id);
      const description = clip(d.description, 500, "");
      fn(d, { id: d.id, label, ...(d.retired === true ? { retired: true } : {}), ...(description ? { description } : {}) });
    }
  };
  each(obj.signals, (d, base) => {
    const color = typeof d.color === "string" ? d.color.trim().toLowerCase() : "";
    out.signals.push({
      ...base,
      color: DEF_HEX_RE.test(color) ? color : "#71717a",
      group: clip(d.group, 60, "Other"),
      defaultConnector: typeof d.defaultConnector === "string" && DEF_ID_RE.test(d.defaultConnector) ? d.defaultConnector : "other",
      cable: clip(d.cable, 60, base.label),
      cablePrefix: typeof d.cablePrefix === "string" && /^[A-Z]{1,4}$/.test(d.cablePrefix) ? d.cablePrefix : "X",
    });
  });
  each(obj.connectors, (d, base) => {
    const ids = (v: unknown) => [...new Set(strList(v).filter((id) => DEF_ID_RE.test(id) && id !== base.id))].slice(0, 30);
    const matesWith = ids(d.matesWith);
    out.connectors.push({
      ...base,
      group: clip(d.group, 60, "Other"),
      cable: clip(d.cable, 60, base.label),
      gender: d.gender === "male" || d.gender === "female" ? d.gender : "none",
      matesWith,
      adaptsTo: ids(d.adaptsTo).filter((id) => !matesWith.includes(id)),
    });
  });
  each(obj.deviceTypes, (d, base) => {
    out.deviceTypes.push({ ...base, category: clip(d.category, 60, "Other") });
  });
  return out;
}

/** True when the three lists hold nothing. */
export function isEmptyTypeDefs(defs: CustomTypeDefs | undefined): boolean {
  return !defs || (!defs.signals?.length && !defs.connectors?.length && !defs.deviceTypes?.length);
}
