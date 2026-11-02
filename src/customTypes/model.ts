/**
 * Community ("custom") types — the shape shared by the API, the devices site and
 * the app. See .claude/plans/custom-types.md.
 *
 * One D1 table (`custom_types`) holds all three kinds. P1 ships the `device`
 * kind; `signal` and `connector` reuse the same row shape, validation entry
 * points and did-you-mean matcher in P3, each with its own `data` fields.
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

export function isCustomTypeKind(v: unknown): v is CustomTypeKind {
  return typeof v === "string" && (CUSTOM_TYPE_KINDS as readonly string[]).includes(v);
}

/** Narrow a mixed list to the device kind, with `data` typed. */
export function deviceTypesOf(records: readonly CustomTypeRecord[]): CustomDeviceTypeRecord[] {
  return records.filter((r) => r.kind === "device") as unknown as CustomDeviceTypeRecord[];
}
