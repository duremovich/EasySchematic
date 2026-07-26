/**
 * Unit tests for the minimap visibility preference (#210).
 *
 * The minimap can be dismissed with its ✕ button and toggled from the View menu; the
 * choice is an editor preference persisted to localStorage under `easyschematic-show-minimap`
 * ("1" = visible, "0" = hidden), defaulting to visible when unset. Both the ✕ button and the
 * View-menu item drive the same `showMinimap` store flag via `setShowMinimap`.
 *
 * The store reads editor preferences from localStorage at import time, so we install a
 * minimal in-memory localStorage and import the store dynamically afterwards.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const MINIMAP_PREF_KEY = "easyschematic-show-minimap";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

type Store = typeof import("../store")["useSchematicStore"];

/** Install a fresh in-memory localStorage (optionally pre-seeded) and load a fresh store. */
async function freshStore(seed?: Record<string, string>): Promise<Store> {
  const storage = new MemStorage();
  for (const [k, v] of Object.entries(seed ?? {})) storage.setItem(k, v);
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  vi.resetModules();
  return (await import("../store")).useSchematicStore;
}

describe("minimap visibility preference (#210)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Each case reloads the store (which reads the ~1.3MB device library on import),
  // so allow a generous ceiling for the transform/import under full-suite load.
  const RELOAD_TIMEOUT = 30000;

  it("defaults to visible when no preference is stored", async () => {
    const useStore = await freshStore();
    expect(useStore.getState().showMinimap).toBe(true);
  }, RELOAD_TIMEOUT);

  it("loads as hidden when the stored preference is \"0\"", async () => {
    const useStore = await freshStore({ [MINIMAP_PREF_KEY]: "0" });
    expect(useStore.getState().showMinimap).toBe(false);
  }, RELOAD_TIMEOUT);

  it("loads as visible when the stored preference is \"1\"", async () => {
    const useStore = await freshStore({ [MINIMAP_PREF_KEY]: "1" });
    expect(useStore.getState().showMinimap).toBe(true);
  }, RELOAD_TIMEOUT);

  it("setShowMinimap updates the flag and persists it across sessions", async () => {
    const useStore = await freshStore();

    useStore.getState().setShowMinimap(false);
    expect(useStore.getState().showMinimap).toBe(false);
    expect(localStorage.getItem(MINIMAP_PREF_KEY)).toBe("0");

    // A subsequent reload (fresh store, same storage) sees the hidden choice.
    const persisted = localStorage.getItem(MINIMAP_PREF_KEY);
    const reloaded = await freshStore(persisted === null ? undefined : { [MINIMAP_PREF_KEY]: persisted });
    expect(reloaded.getState().showMinimap).toBe(false);

    reloaded.getState().setShowMinimap(true);
    expect(reloaded.getState().showMinimap).toBe(true);
    expect(localStorage.getItem(MINIMAP_PREF_KEY)).toBe("1");
  }, RELOAD_TIMEOUT);
});
