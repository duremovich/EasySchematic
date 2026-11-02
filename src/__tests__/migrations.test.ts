import { describe, it, expect } from "vitest";
import { migrateSchematic, CURRENT_SCHEMA_VERSION, STUB_LABEL_Z_INDEX } from "../migrations";

describe("stub-label z-index normalization (#178)", () => {
  it("stamps a z-index on a stub-label node that lacks one (current-version file)", () => {
    const out = migrateSchematic({
      version: CURRENT_SCHEMA_VERSION,
      nodes: [
        { id: "s1", type: "stub-label", position: { x: 0, y: 0 }, data: {} },
        { id: "d1", type: "device", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });
    const stub = out.nodes.find((n: { id: string }) => n.id === "s1");
    const device = out.nodes.find((n: { id: string }) => n.id === "d1");
    expect(stub.zIndex).toBe(STUB_LABEL_Z_INDEX);
    expect(device.zIndex).toBeUndefined(); // only stub-labels are touched
  });

  it("leaves an already-correct z-index untouched (no needless rewrite)", () => {
    const nodes = [{ id: "s1", type: "stub-label", position: { x: 0, y: 0 }, zIndex: STUB_LABEL_Z_INDEX, data: {} }];
    const out = migrateSchematic({ version: CURRENT_SCHEMA_VERSION, nodes, edges: [] });
    expect(out.nodes).toBe(nodes); // same reference — nothing changed
  });
});

describe("v39→v40 bundles migration", () => {
  it("adds an empty bundles map and bumps version", () => {
    const out = migrateSchematic({ version: 39, nodes: [], edges: [] });
    expect(out.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.bundles).toEqual({});
  });

  it("drops a dangling bundleId and dissolves <2-member bundles", () => {
    const out = migrateSchematic({
      version: 39,
      nodes: [],
      edges: [
        { id: "e1", data: { signalType: "sdi", bundleId: "ghost" } }, // no such bundle
        { id: "e2", data: { signalType: "sdi", bundleId: "b1" } }, // bundle with only 1 member
      ],
      bundles: { b1: { id: "b1" } },
    });
    expect(out.edges[0].data.bundleId).toBeUndefined();
    expect(out.edges[1].data.bundleId).toBeUndefined();
    expect(out.bundles).toEqual({});
  });

  it("keeps a valid ≥2-member bundle", () => {
    const out = migrateSchematic({
      version: 39,
      nodes: [],
      edges: [
        { id: "e1", data: { signalType: "sdi", bundleId: "b1" } },
        { id: "e2", data: { signalType: "hdmi", bundleId: "b1" } },
      ],
      bundles: { b1: { id: "b1", label: "Snake A" } },
    });
    expect(out.edges[0].data.bundleId).toBe("b1");
    expect(out.edges[1].data.bundleId).toBe("b1");
    expect(out.bundles.b1.label).toBe("Snake A");
  });
});

describe("v43→v44 custom types migration", () => {
  it("is a no-op that bumps the version and keeps customTypes", () => {
    const customTypes = {
      signals: [{ id: "x-show-comms-k3f9", label: "Show Comms", color: "#008848", group: "Control", defaultConnector: "xlr-3", cable: "Comms", cablePrefix: "SC" }],
    };
    const nodes = [{ id: "d1", type: "device", position: { x: 0, y: 0 }, data: { ports: [{ id: "p1", signalType: "x-show-comms-k3f9" }] } }];
    const out = migrateSchematic({ version: 43, nodes, edges: [], customTypes });
    expect(CURRENT_SCHEMA_VERSION).toBe(44);
    expect(out.version).toBe(44);
    expect(out.customTypes).toEqual(customTypes);
    expect(out.nodes).toBe(nodes);
  });

  it("leaves a v43 file without customTypes without one", () => {
    const out = migrateSchematic({ version: 43, nodes: [], edges: [] });
    expect(out.version).toBe(44);
    expect("customTypes" in out).toBe(false);
  });
});
