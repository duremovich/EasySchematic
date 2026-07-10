/**
 * Regression test for issue #174: "Save As" must switch the editing session to
 * the new file.
 *
 * Save, Save As and Open all funnel through `adoptLocalFile(handle)`, which is the
 * single place that makes a local file the current document. This asserts that the
 * store state which drives the retained file handle, the "current file name" and
 * (via the schematicName selector) the browser-tab title all follow the new file,
 * and that any prior cloud association is dropped so the next Ctrl+S targets the
 * file rather than the previously-linked cloud copy.
 *
 * The store reads editor preferences from localStorage at import time, so we install
 * a minimal in-memory localStorage and import the store dynamically afterwards.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

// Minimal stand-in for a FileSystemFileHandle — adoptLocalFile only reads `.name`.
function fakeHandle(name: string): FileSystemFileHandle {
  return { name } as unknown as FileSystemFileHandle;
}

let useSchematicStore: typeof import("../store")["useSchematicStore"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
});

beforeEach(() => {
  useSchematicStore.setState({
    schematicName: "Original Project",
    fileHandle: null,
    cloudSchematicId: null,
    cloudSavedAt: null,
  });
});

describe("adoptLocalFile (#174 Save As switches the editing session)", () => {
  it("retains the new file handle so subsequent saves target it", () => {
    const handle = fakeHandle("New Design.json");
    useSchematicStore.getState().adoptLocalFile(handle);
    expect(useSchematicStore.getState().fileHandle).toBe(handle);
  });

  it("renames the schematic to the new file (drives the window/tab title)", () => {
    useSchematicStore.getState().adoptLocalFile(fakeHandle("New Design.json"));
    expect(useSchematicStore.getState().schematicName).toBe("New Design");
  });

  it("strips only a trailing .json extension (case-insensitive)", () => {
    useSchematicStore.getState().adoptLocalFile(fakeHandle("Rack Layout v2.JSON"));
    expect(useSchematicStore.getState().schematicName).toBe("Rack Layout v2");
  });

  it("keeps the current name when the filename would yield an empty name", () => {
    useSchematicStore.getState().adoptLocalFile(fakeHandle(".json"));
    expect(useSchematicStore.getState().schematicName).toBe("Original Project");
  });

  it("detaches any cloud association so the next save goes to the file", () => {
    useSchematicStore.setState({ cloudSchematicId: "cloud-123", cloudSavedAt: "2026-01-01T00:00:00" });
    useSchematicStore.getState().adoptLocalFile(fakeHandle("Local Copy.json"));
    expect(useSchematicStore.getState().cloudSchematicId).toBeNull();
    expect(useSchematicStore.getState().cloudSavedAt).toBeNull();
  });
});
