/**
 * Built-in + community device types merged into the three lookups the pickers
 * already use (`DEVICE_TYPE_TO_CATEGORY`, `DEVICE_TYPE_LABELS`,
 * `DEVICE_TYPES_BY_CATEGORY`). Retired community types keep their label and
 * category (an existing template still renders) but leave the picker groups.
 * The app-wide registry (typeRegistry.ts) supersedes this in P2/P4.
 */
import { DEVICE_TYPE_LABELS, DEVICE_TYPE_TO_CATEGORY, DEVICE_TYPES_BY_CATEGORY } from "../deviceTypeCategories";
import type { CustomTypeRecord } from "./model";

export interface DeviceTypeCatalog {
  /** Every known type (built-in, active and retired community) → category. */
  toCategory: Record<string, string>;
  /** Every known type → display label. */
  labels: Record<string, string>;
  /** Pickable types grouped by category: built-ins + active community types. */
  byCategory: Record<string, string[]>;
  /** Community type ids, active and retired, with their status. */
  community: ReadonlyMap<string, "active" | "retired">;
}

export function buildDeviceTypeCatalog(records: readonly CustomTypeRecord[]): DeviceTypeCatalog {
  const toCategory: Record<string, string> = { ...DEVICE_TYPE_TO_CATEGORY };
  const labels: Record<string, string> = { ...DEVICE_TYPE_LABELS };
  const byCategory: Record<string, string[]> = Object.fromEntries(
    Object.entries(DEVICE_TYPES_BY_CATEGORY).map(([cat, ids]) => [cat, [...ids]]),
  );
  const community = new Map<string, "active" | "retired">();
  for (const r of records) {
    if (r.kind !== "device") continue;
    // A community row can never shadow a built-in (the API refuses it), but a
    // type graduated into code later keeps its built-in definition here.
    if (Object.prototype.hasOwnProperty.call(DEVICE_TYPE_TO_CATEGORY, r.id)) continue;
    const category = typeof r.data?.category === "string" ? r.data.category : "";
    if (!category) continue;
    community.set(r.id, r.status);
    toCategory[r.id] = category;
    labels[r.id] = r.label;
    if (r.status === "active") (byCategory[category] ??= []).push(r.id);
  }
  return { toCategory, labels, byCategory, community };
}

/** Built-ins only, for first render before `/types` answers (or when it fails). */
export const BUILTIN_DEVICE_TYPE_CATALOG: DeviceTypeCatalog = buildDeviceTypeCatalog([]);
