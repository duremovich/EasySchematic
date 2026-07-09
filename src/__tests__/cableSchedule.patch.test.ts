import { describe, it, expect } from "vitest";
import { computeCableSchedule } from "../cableSchedule";
import { computePatchPanelSchedule } from "../patchPanelSchedule";
import type { SchematicNode, ConnectionEdge } from "../types";

function deviceNode(id: string, label: string, ports: object[]): SchematicNode {
  return {
    id, type: "device", position: { x: 0, y: 0 },
    data: { label, deviceType: "generic", ports },
  } as unknown as SchematicNode;
}

function panelNode(id: string, label: string, portCount: number): SchematicNode {
  const ports = Array.from({ length: portCount }, (_, i) => ({
    id: `pp-port-${i + 1}`, label: `Port ${i + 1}`, signalType: "custom",
    direction: "passthrough", inheritsSignal: true,
    rearConnectorType: "rj45", frontConnectorType: "rj45",
  }));
  return {
    id, type: "device", position: { x: 0, y: 0 },
    data: { label, deviceType: "patch-panel", ports, offCanvas: true },
  } as unknown as SchematicNode;
}

function edge(id: string, source: string, target: string, data: object = {}): ConnectionEdge {
  return {
    id, source, target, sourceHandle: "out1-out", targetHandle: "in1-in",
    data: { signalType: "ethernet", ...data },
  } as unknown as ConnectionEdge;
}

const nodes: SchematicNode[] = [
  deviceNode("dev-a", "Console", [
    { id: "out1", label: "NET 1", signalType: "ethernet", direction: "output", connectorType: "rj45" },
  ]),
  deviceNode("dev-b", "Stage Box", [
    { id: "in1", label: "ETH A", signalType: "ethernet", direction: "input", connectorType: "rj45" },
  ]),
  panelNode("pp-1", "PP-01", 12),
  panelNode("pp-2", "PP-02", 12),
];

describe("computeCableSchedule with patchHops", () => {
  it("expands a 1-hop connection into 2 segment rows with suffix ids", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      cableId: "E001",
      patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-3" }],
    });
    const rows = computeCableSchedule(nodes, [e], "type-prefix");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cableId)).toEqual(["E001-A", "E001-B"]);
    expect(rows.every((r) => r.baseCableId === "E001")).toBe(true);
    expect(rows.map((r) => r.segIndex)).toEqual([0, 1]);
    expect(rows[0].sourceDevice).toBe("Console");
    expect(rows[0].targetDevice).toBe("PP-01");
    expect(rows[0].targetPort).toBe("Port 3");
    expect(rows[1].sourceDevice).toBe("PP-01");
    expect(rows[1].targetDevice).toBe("Stage Box");
  });

  it("leaves unpatched rows untouched (no segIndex)", () => {
    const rows = computeCableSchedule(nodes, [edge("e1", "dev-a", "dev-b", { cableId: "E001" })], "type-prefix");
    expect(rows).toHaveLength(1);
    expect(rows[0].segIndex).toBeUndefined();
    expect(rows[0].cableId).toBe("E001");
  });

  it("segment label override wins; other segments keep auto suffix", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      cableId: "E001",
      patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-3" }],
      patchSegments: [{ label: "TIE-07" }],
    });
    const rows = computeCableSchedule(nodes, [e], "type-prefix");
    expect(rows[0].cableId).toBe("TIE-07");
    expect(rows[1].cableId).toBe("E001-B");
  });

  it("2 hops → 3 physical cable rows", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      cableId: "E005",
      patchHops: [
        { panelNodeId: "pp-2", portId: "pp-port-11" },
        { panelNodeId: "pp-1", portId: "pp-port-6" },
      ],
    });
    const rows = computeCableSchedule(nodes, [e], "type-prefix");
    expect(rows).toHaveLength(3);
    expect(rows[1].sourceDevice).toBe("PP-02");
    expect(rows[1].targetDevice).toBe("PP-01");
  });

  it("generated ids (no stored cableId) also expand with suffixes", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-1" }],
    });
    const rows = computeCableSchedule(nodes, [e], "type-prefix");
    expect(rows.map((r) => r.cableId)).toEqual(["E001-A", "E001-B"]);
    expect(rows[0].baseCableId).toBe("E001");
  });

  it("sequential naming scheme expands too", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      cableId: "C001",
      patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-1" }],
    });
    const rows = computeCableSchedule(nodes, [e], "sequential");
    expect(rows.map((r) => r.cableId)).toEqual(["C001-A", "C001-B"]);
  });
});

describe("computePatchPanelSchedule with hops", () => {
  it("fills rear/front columns of a hop-occupied passthrough port", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      cableId: "E001",
      patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-3" }],
    });
    const rows = computePatchPanelSchedule(nodes, [e], "type-prefix");
    const row = rows.find((r) => r.rowId === "pp-1:pp-port-3")!;
    expect(row).toBeDefined();
    expect(row.rearRemoteDevice).toBe("Console");
    expect(row.rearCableId).toBe("E001-A");
    expect(row.frontRemoteDevice).toBe("Stage Box");
    expect(row.frontCableId).toBe("E001-B");
    expect(row.signalType).toBe("Ethernet");
  });

  it("mid-chain panel sees the adjacent panels as remotes", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      cableId: "E005",
      patchHops: [
        { panelNodeId: "pp-2", portId: "pp-port-11" },
        { panelNodeId: "pp-1", portId: "pp-port-6" },
      ],
    });
    const rows = computePatchPanelSchedule(nodes, [e], "type-prefix");
    const midRow = rows.find((r) => r.rowId === "pp-2:pp-port-11")!;
    expect(midRow.rearRemoteDevice).toBe("Console");
    expect(midRow.frontRemoteDevice).toBe("PP-01");
    expect(midRow.frontCableId).toBe("E005-B");
  });

  it("unoccupied ports stay empty", () => {
    const rows = computePatchPanelSchedule(nodes, [edge("e1", "dev-a", "dev-b", { cableId: "E001" })], "type-prefix");
    const row = rows.find((r) => r.rowId === "pp-1:pp-port-1")!;
    expect(row.rearRemoteDevice).toBe("—");
    expect(row.rearCableId).toBe("");
  });
});
