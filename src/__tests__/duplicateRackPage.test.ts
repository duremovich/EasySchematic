/**
 * Regression test for duplicateRackPage's shelf-mount link.
 *
 * Duplicating a rack-elevation page rekeys rack, placement and accessory ids to fresh
 * copies. A shelf-mounted device's placement references its shelf via `mountedOnShelfId`,
 * but that link was NOT remapped — the copied placement kept the SOURCE page's shelf id,
 * which doesn't exist on the copy, so the renderers (which look the shelf up and bail when
 * it's missing) dropped the device from the duplicated rack. The copy now re-points
 * `mountedOnShelfId` at the copied shelf.
 *
 * The store reads editor preferences from localStorage at import time, so we install a
 * minimal in-memory localStorage and import the store dynamically afterwards.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { RackElevationPage } from "../types";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

let useSchematicStore: typeof import("../store")["useSchematicStore"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
});

function rackPageWithShelfMount(): RackElevationPage {
  return {
    id: "rk-1",
    label: "Head End",
    type: "rack-elevation",
    racks: [
      { id: "rack-1", label: "Rack 1", rackType: "floor-19", heightU: 42, depthMm: 600, widthClass: "19in", position: { x: 0, y: 0 } },
    ],
    accessories: [
      { id: "shelf-1", rackId: "rack-1", type: "shelf", uPosition: 2, heightU: 1, face: "front" },
    ],
    placements: [
      { id: "pl-1", rackId: "rack-1", deviceNodeId: "device-1", uPosition: 2, face: "front", mountedOnShelfId: "shelf-1" },
    ],
  };
}

function pages(): RackElevationPage[] {
  return useSchematicStore.getState().pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");
}

describe("duplicateRackPage remaps the shelf-mount link", () => {
  it("re-points a copied shelf-mounted placement at the COPIED shelf, not the source shelf id", () => {
    useSchematicStore.setState({ nodes: [], edges: [], pages: [rackPageWithShelfMount()] });
    const newPageId = useSchematicStore.getState().duplicateRackPage("rk-1");
    const copy = pages().find((p) => p.id === newPageId)!;

    expect(copy.accessories).toHaveLength(1);
    expect(copy.placements).toHaveLength(1);
    const copiedShelfId = copy.accessories[0].id;
    const copiedPlacement = copy.placements[0];

    // The copy's shelf got a fresh id...
    expect(copiedShelfId).not.toBe("shelf-1");
    // ...and the copied placement points at THAT shelf (a real accessory in the copy),
    // not the dangling source-page shelf id.
    expect(copiedPlacement.mountedOnShelfId).toBe(copiedShelfId);
    expect(copy.accessories.some((a) => a.id === copiedPlacement.mountedOnShelfId)).toBe(true);

    // The source page is untouched.
    const src = pages().find((p) => p.id === "rk-1")!;
    expect(src.placements[0].mountedOnShelfId).toBe("shelf-1");
  });

  it("leaves a non-shelf-mounted placement's (absent) mountedOnShelfId alone", () => {
    const page = rackPageWithShelfMount();
    page.placements.push({ id: "pl-2", rackId: "rack-1", deviceNodeId: "device-2", uPosition: 10, face: "front" });
    useSchematicStore.setState({ nodes: [], edges: [], pages: [page] });
    const newPageId = useSchematicStore.getState().duplicateRackPage("rk-1");
    const copy = pages().find((p) => p.id === newPageId)!;
    const directMount = copy.placements.find((p) => p.deviceNodeId === "device-2")!;
    expect(directMount.mountedOnShelfId).toBeUndefined();
  });
});
