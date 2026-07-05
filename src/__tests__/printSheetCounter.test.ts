import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SchematicFile } from "../types";

// The store reads `localStorage` at module-creation time and the vitest env is
// `node`, so we stub an in-memory localStorage BEFORE the dynamic import, and
// reset modules each test so the module-level ID counters start fresh (#3 review).
describe("print-sheet id counter sync (duplicate page id, review #3)", () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() { return mem.size; },
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advances printSheetIdCounter for a print sheet with no viewports", async () => {
    const { useSchematicStore } = await import("../store");
    const { CURRENT_SCHEMA_VERSION } = await import("../migrations");

    // A plain print sheet (printsheet-3) with an empty viewports array — exactly
    // what `addPrintSheetPage` creates before any rack viewport is added.
    const file: SchematicFile = {
      version: CURRENT_SCHEMA_VERSION,
      name: "test",
      nodes: [],
      edges: [],
      pages: [
        {
          id: "printsheet-3",
          label: "Sheet 3",
          type: "print-sheet",
          paperId: "letter",
          orientation: "landscape",
          viewports: [],
          showTitleBlock: true,
        },
      ],
    };

    useSchematicStore.getState().importFromJSON(file);

    // The next new print sheet must NOT reuse an existing id. Before the fix the
    // counter never advanced (the bump was nested in the empty viewport loop), so
    // this returned "printsheet-1"; now it correctly continues past the loaded 3.
    const newId = useSchematicStore.getState().addPrintSheetPage();
    expect(newId).toBe("printsheet-4");
  });
});
