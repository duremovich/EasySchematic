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
