/**
 * Template-update propagation (#127).
 *
 * When a user updates a device template — or forks a built-in device into a "(Custom)"
 * user template — the change must track through to every other instance of that device
 * already placed on the schematic. Propagation reuses `syncDeviceWithTemplate` (the same
 * reconcile the drift/"Update from template" flow uses), so this suite covers both:
 *
 *   1. the reconcile primitive directly — ports added / renamed / removed and, above all,
 *      connection preservation across the change; and
 *   2. the `propagateTemplateToInstances` store action that drives it across many placed
 *      instances, re-points forked built-ins, and leaves excluded / unrelated nodes alone.
 *
 * The store reads editor prefs from localStorage at import time, so (as elsewhere in this
 * suite) we install a minimal in-memory localStorage and import the store dynamically.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { syncDeviceWithTemplate } from "../templateSync";
import type {
  ConnectionEdge,
  DeviceData,
  DeviceNode,
  DeviceTemplate,
  Port,
} from "../types";

function port(
  id: string,
  label: string,
  signalType: string,
  direction: "input" | "output" | "bidirectional" | "passthrough" = "input",
  extras: Partial<Port> = {},
): Port {
  return { id, label, signalType: signalType as Port["signalType"], direction, ...extras };
}

function templatePort(id: string, label: string, signalType: string, direction: Port["direction"] = "input"): Port {
  return port(id, label, signalType, direction);
}

function deviceData(label: string, ports: Port[], templateId?: string, extra: Partial<DeviceData> = {}): DeviceData {
  return { label, deviceType: "test", ports, ...(templateId ? { templateId } : {}), ...extra };
}

function template(id: string, label: string, ports: Port[], version = 1): DeviceTemplate {
  return { id, version, deviceType: "test", label, ports };
}

function edgeTo(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): ConnectionEdge {
  return { id, source, target, sourceHandle, targetHandle, data: { signalType: "sdi" } } as ConnectionEdge;
}

// ─────────────────────────────────────────────────────────────────────────────
// syncDeviceWithTemplate — the reconcile primitive propagation is built on
// ─────────────────────────────────────────────────────────────────────────────

describe("syncDeviceWithTemplate reconcile", () => {
  it("preserves a connection when its port is renamed in the template (matched by templatePortId)", () => {
    const device = deviceData("Switch", [
      port("dev-a", "Port A", "sdi", "input", { templatePortId: "t-a" }),
    ]);
    const edges = [edgeTo("e1", "src", "src-out", "node-1", "dev-a")];
    // Template renames the port label and changes its signal type, keeping the same id.
    const tpl = template("tpl", "Switch", [templatePort("t-a", "Port A (renamed)", "hdmi")]);

    const { updatedData, preview } = syncDeviceWithTemplate(device, tpl, "node-1", edges);

    // Same device-side port id ⇒ the edge stays attached.
    const p = updatedData.ports.find((x) => x.templatePortId === "t-a")!;
    expect(p.id).toBe("dev-a");
    expect(p.signalType).toBe("hdmi"); // structural change propagates
    expect(preview.portsOrphanedWithEdges).toHaveLength(0);
    expect(preview.portsRemovedSafe).toHaveLength(0);
    // The live edge is unchanged and still references the same handle.
    expect(edges[0].targetHandle).toBe("dev-a");
  });

  it("adds a newly-introduced template port", () => {
    const device = deviceData("Switch", [
      port("dev-a", "A", "sdi", "input", { templatePortId: "t-a" }),
    ]);
    const tpl = template("tpl", "Switch", [
      templatePort("t-a", "A", "sdi"),
      templatePort("t-b", "B", "sdi", "output"),
    ]);

    const { updatedData, preview } = syncDeviceWithTemplate(device, tpl, "node-1", []);

    expect(preview.portsAdded).toHaveLength(1);
    expect(updatedData.ports.some((p) => p.templatePortId === "t-b")).toBe(true);
    expect(updatedData.ports).toHaveLength(2);
  });

  it("drops an unconnected removed port but keeps a connected one as an orphan", () => {
    const device = deviceData("Switch", [
      port("dev-a", "A", "sdi", "input", { templatePortId: "t-a" }),
      port("dev-b", "B", "sdi", "input", { templatePortId: "t-b" }), // will be removed, unconnected
      port("dev-c", "C", "sdi", "input", { templatePortId: "t-c" }), // will be removed, connected
    ]);
    const edges = [edgeTo("e1", "src", "src-out", "node-1", "dev-c")];
    const tpl = template("tpl", "Switch", [templatePort("t-a", "A", "sdi")]);

    const { updatedData, preview } = syncDeviceWithTemplate(device, tpl, "node-1", edges);

    expect(preview.portsRemovedSafe.map((p) => p.id)).toEqual(["dev-b"]);
    expect(preview.portsOrphanedWithEdges.map((p) => p.id)).toEqual(["dev-c"]);
    // Orphan kept so its connection survives; safe removal gone.
    expect(updatedData.ports.some((p) => p.id === "dev-b")).toBe(false);
    expect(updatedData.ports.some((p) => p.id === "dev-c")).toBe(true);
  });

  it("preserves per-instance overrides while overwriting factual fields", () => {
    const device = deviceData(
      "Switch",
      [port("dev-a", "A", "sdi", "input", { templatePortId: "t-a", notes: "hand-labelled" })],
      undefined,
      { serialNumber: "SN-123", powerDrawW: 10 },
    );
    const tpl: DeviceTemplate = { ...template("tpl", "Switch", [templatePort("t-a", "A", "sdi")]), powerDrawW: 42 };

    const { updatedData } = syncDeviceWithTemplate(device, tpl, "node-1", []);

    expect(updatedData.serialNumber).toBe("SN-123"); // instance field preserved
    expect(updatedData.powerDrawW).toBe(42); // factual field overwritten from template
    expect(updatedData.ports[0].notes).toBe("hand-labelled"); // per-port override preserved
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// propagateTemplateToInstances — the store action
// ─────────────────────────────────────────────────────────────────────────────

let useSchematicStore: typeof import("../store")["useSchematicStore"];

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

function deviceNode(id: string, data: DeviceData): DeviceNode {
  return { id, type: "device", position: { x: 0, y: 0 }, data } as DeviceNode;
}

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
});

beforeEach(() => {
  useSchematicStore.setState({ nodes: [], edges: [], customTemplates: [] });
});

describe("propagateTemplateToInstances", () => {
  it("adds a new port to every other instance and keeps existing connections, bumping the version", () => {
    const instA = deviceNode("A", deviceData("Sw", [port("a-p1", "P1", "sdi", "input", { templatePortId: "t-1" })], "tpl", { templateVersion: 1 }));
    const instB = deviceNode("B", deviceData("Sw", [port("b-p1", "P1", "sdi", "input", { templatePortId: "t-1" })], "tpl", { templateVersion: 1 }));
    const instC = deviceNode("C", deviceData("Sw", [port("c-p1", "P1", "sdi", "input", { templatePortId: "t-1" })], "tpl", { templateVersion: 1 }));
    const unrelated = deviceNode("Z", deviceData("Other", [port("z-p1", "P1", "sdi")], "other-tpl", { templateVersion: 1 }));
    const edges = [
      edgeTo("e-b", "src", "src-out", "B", "b-p1"),
      edgeTo("e-c", "src", "src-out", "C", "c-p1"),
    ];
    useSchematicStore.setState({ nodes: [instA, instB, instC, unrelated], edges });

    // New template: keeps t-1, adds t-2. Version bumped to 2.
    const newTpl = template("tpl", "Sw", [templatePort("t-1", "P1", "sdi"), templatePort("t-2", "P2", "sdi", "output")], 2);

    // Editing node is A — the editor saves it itself, so it is excluded.
    const result = useSchematicStore.getState().propagateTemplateToInstances("tpl", newTpl, "A");
    expect(result.updated).toBe(2);

    const nodes = useSchematicStore.getState().nodes as DeviceNode[];
    const b = nodes.find((n) => n.id === "B")!;
    const c = nodes.find((n) => n.id === "C")!;
    const a = nodes.find((n) => n.id === "A")!;
    const z = nodes.find((n) => n.id === "Z")!;

    // Other instances gained the new port and were re-versioned...
    expect(b.data.ports.some((p) => p.templatePortId === "t-2")).toBe(true);
    expect(c.data.ports.some((p) => p.templatePortId === "t-2")).toBe(true);
    expect(b.data.templateVersion).toBe(2);
    // ...while keeping their existing port id, so the connection is intact.
    expect(b.data.ports.find((p) => p.templatePortId === "t-1")!.id).toBe("b-p1");
    const finalEdges = useSchematicStore.getState().edges;
    expect(finalEdges.find((e) => e.id === "e-b")!.targetHandle).toBe("b-p1");
    expect(finalEdges).toHaveLength(2);

    // Excluded and unrelated nodes untouched.
    expect(a.data.ports).toHaveLength(1);
    expect(a.data.templateVersion).toBe(1);
    expect(z.data.ports).toHaveLength(1);
    expect(z.data.templateVersion).toBe(1);
  });

  it("drops a connection whose port the template removed, on other instances", () => {
    const instA = deviceNode("A", deviceData("Sw", [port("a-p1", "P1", "sdi", "input", { templatePortId: "t-1" }), port("a-p2", "P2", "sdi", "input", { templatePortId: "t-2" })], "tpl", { templateVersion: 1 }));
    const instB = deviceNode("B", deviceData("Sw", [port("b-p1", "P1", "sdi", "input", { templatePortId: "t-1" }), port("b-p2", "P2", "sdi", "input", { templatePortId: "t-2" })], "tpl", { templateVersion: 1 }));
    useSchematicStore.setState({ nodes: [instA, instB], edges: [] });

    // Template removes t-2.
    const newTpl = template("tpl", "Sw", [templatePort("t-1", "P1", "sdi")], 2);
    useSchematicStore.getState().propagateTemplateToInstances("tpl", newTpl, "A");

    const b = (useSchematicStore.getState().nodes as DeviceNode[]).find((n) => n.id === "B")!;
    // Unconnected removed port is dropped.
    expect(b.data.ports.some((p) => p.templatePortId === "t-2")).toBe(false);
    expect(b.data.ports).toHaveLength(1);
  });

  it("forks a built-in: re-points every instance to the new custom template id", () => {
    const instA = deviceNode("A", deviceData("BiAmp", [port("a-p1", "P1", "sdi", "input", { templatePortId: "t-1" })], "builtin-x", { templateVersion: 1 }));
    const instB = deviceNode("B", deviceData("BiAmp", [port("b-p1", "P1", "sdi", "input", { templatePortId: "t-1" })], "builtin-x", { templateVersion: 1 }));
    useSchematicStore.setState({ nodes: [instA, instB], edges: [] });

    // Forked user template has a brand-new id.
    const custom = template("custom-123", "BiAmp (Custom)", [templatePort("t-1", "P1", "sdi"), templatePort("t-2", "P2", "sdi", "output")], 1);
    const result = useSchematicStore.getState().propagateTemplateToInstances("builtin-x", custom, "A");
    expect(result.updated).toBe(1); // only B (A excluded — editor re-points it)

    const b = (useSchematicStore.getState().nodes as DeviceNode[]).find((n) => n.id === "B")!;
    expect(b.data.templateId).toBe("custom-123"); // re-pointed at the fork
    expect(b.data.ports.some((p) => p.templatePortId === "t-2")).toBe(true);
  });

  it("no-ops when there are no other instances", () => {
    const only = deviceNode("A", deviceData("Sw", [port("a-p1", "P1", "sdi", "input", { templatePortId: "t-1" })], "tpl", { templateVersion: 1 }));
    useSchematicStore.setState({ nodes: [only], edges: [] });
    const newTpl = template("tpl", "Sw", [templatePort("t-1", "P1", "sdi")], 2);
    const result = useSchematicStore.getState().propagateTemplateToInstances("tpl", newTpl, "A");
    expect(result.updated).toBe(0);
    // Node left exactly as-is.
    expect((useSchematicStore.getState().nodes as DeviceNode[])[0].data.templateVersion).toBe(1);
  });
});
