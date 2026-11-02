import { useEffect, useMemo, useSyncExternalStore } from "react";
import { loadCommunityTypes } from "../api";
import { connectorGroups, signalGroups, subscribeTypeRegistry, typeRegistryVersion } from "../../../src/typeRegistry";
import type { ConnectorType, SignalType } from "../../../src/types";

/**
 * Re-render when community types land in the type registry, and make sure they
 * are being fetched (once per page load; `loadCommunityTypes` caches). Returns
 * the registry version, so callers can key memoised lists on it.
 * Until `/types` answers — or if it fails — the registry holds built-ins only.
 */
export function useCommunityTypes(): number {
  useEffect(() => {
    void loadCommunityTypes();
  }, []);
  return useSyncExternalStore(subscribeTypeRegistry, typeRegistryVersion);
}

/** Grouped signal / connector picker options: built-ins plus active community types. */
export function usePortPickerGroups(): { signals: Record<string, SignalType[]>; connectors: Record<string, ConnectorType[]> } {
  const version = useCommunityTypes();
  return useMemo(() => {
    void version; // the registry is module state; the version is what changed
    return { signals: signalGroups(), connectors: connectorGroups() };
  }, [version]);
}
