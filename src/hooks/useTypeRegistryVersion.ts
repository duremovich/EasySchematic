import { useSyncExternalStore } from "react";
import { subscribeTypeRegistry, typeRegistryVersion } from "../typeRegistry";

/**
 * Re-render when community or user types are registered. Returns the registry
 * version, so callers can key memoised lists on it. Signal / connector pickers and
 * anything else that lists types call this; plain getters need nothing.
 */
export function useTypeRegistryVersion(): number {
  return useSyncExternalStore(subscribeTypeRegistry, typeRegistryVersion);
}
