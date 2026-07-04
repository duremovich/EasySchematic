import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "../migrations";
import type { SchematicFile, SchematicNode } from "../types";

/**
 * Regression tests for the autosave data-loss guard in loadFromLocalStorage.
 *
 * Bug: when a non-empty saved schematic failed to load (bad JSON / migration),
 * the catch armed `hydrated` and returned silently, so the next edit's autosave
 * overwrote the still-recoverable saved copy with the blank initial state.
 * Fix: on a pre-commit load failure leave autosave disabled (so the saved copy
 * is preserved) and surface an error; re-arm autosave on New / Open / Import.
 */

const STORAGE_KEY = "easyschematic-autosave";

function makeLocalStorage(initial: Record<string, string> = {}) {
  const backing: Record<string, string> = { ...initial };
  return {
    backing,
    getItem: vi.fn((k: string) => (k in backing ? backing[k] : null)),
    setItem: vi.fn((k: string, v: string) => { backing[k] = v; }),
    removeItem: vi.fn((k: string) => { delete backing[k]; }),
    clear: vi.fn(() => { for (const k of Object.keys(backing)) delete backing[k]; }),
  };
}

// Node 18+ exposes globalThis.crypto.randomUUID (used by addToast); shim if absent.
beforeEach(() => {
  vi.resetModules();
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", { randomUUID: () => "test-" + Math.random().toString(36).slice(2) });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFromLocalStorage — data-loss guard", () => {
  it("does not overwrite a corrupt saved schematic and surfaces an error", async () => {
    const corrupt = "{ this is not valid json";
    const ls = makeLocalStorage({ [STORAGE_KEY]: corrupt });
    vi.stubGlobal("localStorage", ls);

    const { useSchematicStore } = await import("../store");

    // Corrupt data fails to load (JSON.parse throws → the pre-commit catch).
    expect(useSchematicStore.getState().loadFromLocalStorage()).toBe(false);

    // The failure is surfaced to the user, not swallowed silently.
    expect(useSchematicStore.getState().toasts.some((t) => t.type === "error")).toBe(true);

    // A subsequent autosave must be a no-op — the saved copy stays intact.
    ls.setItem.mockClear();
    useSchematicStore.getState().saveToLocalStorage();
    expect(ls.setItem).not.toHaveBeenCalled();
    expect(ls.backing[STORAGE_KEY]).toBe(corrupt);
  });

  it("re-arms autosave via newSchematic after a failed load", async () => {
    // Non-empty broken blob → the synchronous failure path (no async demo import),
    // so a later setItem can only come from the explicit newSchematic() re-arm.
    const ls = makeLocalStorage({ [STORAGE_KEY]: "{ broken" });
    vi.stubGlobal("localStorage", ls);

    const { useSchematicStore } = await import("../store");
    expect(useSchematicStore.getState().loadFromLocalStorage()).toBe(false);

    ls.setItem.mockClear();
    useSchematicStore.getState().newSchematic();
    expect(ls.setItem).toHaveBeenCalled();
  });

  it("re-arms autosave via importFromJSON after a failed load", async () => {
    // Same synchronous failure path; then opening/importing a valid schematic
    // (the funnel for file open, share links, and cloud open) must re-arm autosave.
    const ls = makeLocalStorage({ [STORAGE_KEY]: "{ broken" });
    vi.stubGlobal("localStorage", ls);

    const { useSchematicStore } = await import("../store");
    expect(useSchematicStore.getState().loadFromLocalStorage()).toBe(false);

    ls.setItem.mockClear();
    const doc: SchematicFile = { version: CURRENT_SCHEMA_VERSION, name: "Recovered", nodes: [], edges: [] };
    useSchematicStore.getState().importFromJSON(doc);
    expect(ls.setItem).toHaveBeenCalled();
    expect(ls.backing[STORAGE_KEY]).toContain("Recovered");
  });

  it("re-arms autosave via importCsvData after a failed load", async () => {
    // The CSV cable-schedule wizard is a fourth way to put real content on the
    // canvas. It merges into the current document rather than replacing it, so
    // it is easy to overlook — but after a failed hydrate it must re-arm autosave
    // too, or the imported rows are never persisted.
    const ls = makeLocalStorage({ [STORAGE_KEY]: "{ broken" });
    vi.stubGlobal("localStorage", ls);

    const { useSchematicStore } = await import("../store");
    expect(useSchematicStore.getState().loadFromLocalStorage()).toBe(false);

    const node = {
      id: "dev-1",
      type: "device",
      position: { x: 0, y: 0 },
      data: { label: "Imported Device" },
    } as unknown as SchematicNode;

    ls.setItem.mockClear();
    useSchematicStore.getState().importCsvData([node], []);
    expect(ls.setItem).toHaveBeenCalled();
    // Assert on the persisted bytes, not just that a write happened — a regression
    // that re-armed autosave but serialized stale/blank state would still "save".
    expect(ls.backing[STORAGE_KEY]).toContain("Imported Device");
  });

  it("persists an imported schematic even when the post-import counter sync throws", async () => {
    // importFromJSON's side-effects are guarded separately: a malformed `pages`
    // shape must not throw past the autosave. Otherwise importing to recover from
    // a failed hydrate leaves nothing on disk, and a reload before the next edit
    // drops the user back onto the old unreadable blob.
    const ls = makeLocalStorage({ [STORAGE_KEY]: "{ broken" });
    vi.stubGlobal("localStorage", ls);

    const { useSchematicStore } = await import("../store");
    expect(useSchematicStore.getState().loadFromLocalStorage()).toBe(false);

    ls.setItem.mockClear();
    useSchematicStore.getState().importFromJSON({
      version: CURRENT_SCHEMA_VERSION,
      name: "Recovered With Bad Pages",
      nodes: [],
      edges: [],
      pages: [{ id: "printsheet-1", type: "print-sheet", viewports: 5 }],
    } as unknown as SchematicFile);

    expect(ls.backing[STORAGE_KEY]).toContain("Recovered With Bad Pages");
  });

  it("keeps a loaded schematic and armed autosave when the post-load side-effect throws", async () => {
    // Guards the ORDERING: `hydrated` is armed after the state commit but before
    // syncRackCounters, and that side-effect is wrapped. A non-iterable `viewports`
    // makes syncRackCounters throw (the #176 shape). The schematic must still count
    // as loaded and autosave must stay ON — otherwise a partially-bad but perfectly
    // recoverable file would be mislabelled a failed load and stop autosaving.
    const blob = JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      name: "Has Pages",
      nodes: [],
      edges: [],
      pages: [{ id: "printsheet-1", type: "print-sheet", viewports: 5 }],
    });
    const ls = makeLocalStorage({ [STORAGE_KEY]: blob });
    vi.stubGlobal("localStorage", ls);

    const { useSchematicStore } = await import("../store");

    // Loaded successfully despite the side-effect throwing.
    expect(useSchematicStore.getState().loadFromLocalStorage()).toBe(true);
    expect(useSchematicStore.getState().schematicName).toBe("Has Pages");

    // Autosave is armed, so the user's next edit persists normally.
    ls.setItem.mockClear();
    useSchematicStore.getState().saveToLocalStorage();
    expect(ls.setItem).toHaveBeenCalled();
  });
});
