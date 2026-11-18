/**
 * EU/UK power adapters resolve through the real auto-insert path (#408).
 *
 * #390 added the CEE 7 / BS 1363 connector types and the mating rules that flag
 * Schuko -> UK as adapter-needed, but the bundled library had no adapter, so the
 * test fixture's "EU/UK power bench" hit the zero-match dialog. Adapter auto-insert reads
 * the bundled templates, so these must exist in code. A drop that lands on exactly one
 * forward match auto-inserts, so each pairing must resolve to exactly one template.
 *
 * The store reads editor preferences from localStorage at import time, so a minimal
 * in-memory localStorage is installed before the store is imported.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { findAdaptersForConnectorBridge } from "../connectorTypes";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import type { ConnectorType, DeviceData, Port, SchematicNode } from "../types";

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
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as { crypto?: unknown }).crypto = {
      randomUUID: () => "test-" + Math.random().toString(36).slice(2),
    };
  }
  ({ useSchematicStore } = await import("../store"));
});

// Realistic fixture-style ids (the seeded test schematic ends port ids in -in/-out).
const STRIP_SCHUKO_OUT: Port = { id: "eustrip-schuko-out-1", label: "Schuko Out 1", signalType: "power", direction: "output", connectorType: "schuko" };
const PLAYER_UK_IN: Port = { id: "ukplayer-uk-in", label: "UK AC In", signalType: "power", direction: "input", connectorType: "uk-power" };
const PSU_EUROPLUG_IN: Port = { id: "eupsu-europlug-in", label: "Europlug AC In", signalType: "power", direction: "input", connectorType: "europlug" };

function deviceNode(id: string, label: string, ports: Port[], x: number): SchematicNode {
  return { id, type: "device", position: { x, y: 0 }, data: { label, deviceType: "generic", ports } } as SchematicNode;
}

const bridge = (a: ConnectorType, b: ConnectorType) =>
  findAdaptersForConnectorBridge(a, b, "power", DEVICE_TEMPLATES).map((t) => t.label);

describe("EU/UK power adapter templates (#408)", () => {
  it.each<[ConnectorType, ConnectorType, string]>([
    ["schuko", "uk-power", "Schuko (M) → UK BS 1363 (F) Adapter"],
    ["uk-power", "schuko", "UK BS 1363 (M) → Schuko (F) Adapter"],
    ["europlug", "uk-power", "Europlug (M) → UK BS 1363 (F) Adapter"],
    ["schuko", "iec", "Schuko (M) → IEC C13 (F) Adapter"],
    ["uk-power", "iec", "UK BS 1363 (M) → IEC C13 (F) Adapter"],
    ["edison", "schuko", "Edison (M) → Schuko (F) Plug Adapter (no voltage conversion)"],
    ["edison", "uk-power", "Edison (M) → UK BS 1363 (F) Plug Adapter (no voltage conversion)"],
    // US gear on EU/UK mains: the (M) plug goes into the upstream EU/UK socket (#408).
    ["schuko", "edison", "Schuko (M) → Edison (F) Plug Adapter (no voltage conversion)"],
    ["uk-power", "edison", "UK BS 1363 (M) → Edison (F) Plug Adapter (no voltage conversion)"],
    // Rack PDU leads: C14 plug into an IEC outlet, Schuko/UK socket out.
    ["iec", "schuko", "IEC C14 (M) → Schuko (F) Adapter"],
    ["iec", "uk-power", "IEC C14 (M) → UK BS 1363 (F) Adapter"],
  ])("%s -> %s resolves to exactly one adapter, so it auto-inserts", (a, b, label) => {
    expect(bridge(a, b)).toEqual([label]);
  });

  it("serves the reverse drag with the same part (Europlug <- UK)", () => {
    expect(bridge("uk-power", "europlug")).toEqual(["Europlug (M) → UK BS 1363 (F) Adapter"]);
  });

  it("labels the voltage-non-converting adapters clearly, and orients both ways", () => {
    const edison = DEVICE_TEMPLATES.filter((t) => t.deviceType === "adapter" && t.ports.some((p) => p.connectorType === "edison") && t.ports.some((p) => p.connectorType === "schuko" || p.connectorType === "uk-power"));
    expect(edison).toHaveLength(4);
    for (const t of edison) expect(t.label).toMatch(/no voltage conversion/);
    // The input is the male plug into the upstream socket: US gear on EU/UK mains has the
    // EU/UK connector on the input side and Edison on the output.
    for (const c of ["schuko", "uk-power"] as const) {
      const t = DEVICE_TEMPLATES.find((x) => x.deviceType === "adapter" && x.ports[0].connectorType === c && x.ports[1].connectorType === "edison")!;
      expect(t.ports[0].direction).toBe("input");
      expect(t.ports[0].directAttach).toBe(true);
    }
  });

  it("the new pairings are forward matches, not reversed fits of a backwards part", () => {
    for (const [a, b] of [["schuko", "edison"], ["uk-power", "edison"], ["iec", "schuko"], ["iec", "uk-power"]] as const) {
      const t = findAdaptersForConnectorBridge(a, b, "power", DEVICE_TEMPLATES)[0];
      expect(t.ports.find((p) => p.direction === "input")!.connectorType, `${a}->${b}`).toBe(a);
    }
  });

  it("existing pairings are unchanged: IEC <-> Edison, Edison <-> IEC still one adapter each", () => {
    expect(bridge("iec", "edison")).toHaveLength(1);
    expect(bridge("edison", "iec")).toHaveLength(1);
  });

  it("fixture bench: dragging Schuko Out onto the UK input inserts the adapter, no dialog", () => {
    useSchematicStore.setState({
      nodes: [
        deviceNode("n1", "Euro Power Strip (Schuko)", [STRIP_SCHUKO_OUT], 0),
        deviceNode("n2", "UK Media Player (BS 1363)", [PLAYER_UK_IN], 600),
      ],
      edges: [],
      pendingIncompatibleConnection: null,
    });
    useSchematicStore.getState().onConnect({
      source: "n1", sourceHandle: "eustrip-schuko-out-1", target: "n2", targetHandle: "ukplayer-uk-in",
    });
    const { nodes, edges, pendingIncompatibleConnection } = useSchematicStore.getState();
    const adapter = nodes.find((n) => (n.data as DeviceData).label === "Schuko (M) → UK BS 1363 (F) Adapter");
    expect(adapter).toBeDefined();
    expect(edges).toHaveLength(2);
    expect(pendingIncompatibleConnection).toBeNull();
  });

  describe("native Europlug -> Schuko still connects directly (no adapter)", () => {
    beforeEach(() => {
      useSchematicStore.setState({
        nodes: [
          deviceNode("n1", "Euro Power Strip (Schuko)", [STRIP_SCHUKO_OUT], 0),
          deviceNode("n3", "EU PSU (Europlug)", [PSU_EUROPLUG_IN], 600),
        ],
        edges: [],
        pendingIncompatibleConnection: null,
      });
    });
    it("makes one edge and no adapter", () => {
      useSchematicStore.getState().onConnect({
        source: "n1", sourceHandle: "eustrip-schuko-out-1", target: "n3", targetHandle: "eupsu-europlug-in",
      });
      const { nodes, edges } = useSchematicStore.getState();
      expect(edges).toHaveLength(1);
      expect(nodes).toHaveLength(2);
    });
  });
});
