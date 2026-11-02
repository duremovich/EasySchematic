import { useEffect, useMemo, useState } from "react";
import { loadCommunityDeviceTypes } from "../api";
import { buildDeviceTypeCatalog, BUILTIN_DEVICE_TYPE_CATALOG } from "../../../src/customTypes";
import type { CustomTypeRecord, DeviceTypeCatalog } from "../../../src/customTypes";

/**
 * Built-in + community device types for pickers. Starts as built-ins only and
 * merges community types when `GET /types` answers; stays built-ins-only if it
 * fails, so the form never blocks on the API.
 */
export function useDeviceTypeCatalog(): { catalog: DeviceTypeCatalog; records: CustomTypeRecord[]; loaded: boolean } {
  const [records, setRecords] = useState<CustomTypeRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadCommunityDeviceTypes().then((r) => { if (alive) setRecords(r); });
    return () => { alive = false; };
  }, []);
  const catalog = useMemo(
    () => (records && records.length ? buildDeviceTypeCatalog(records) : BUILTIN_DEVICE_TYPE_CATALOG),
    [records],
  );
  return { catalog, records: records ?? [], loaded: records !== null };
}
