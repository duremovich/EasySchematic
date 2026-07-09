import { describe, it, expect } from "vitest";
import {
  getPatchSegments,
  getPanelOccupancy,
  isPortAvailable,
  devicePoint,
  resolvableHops,
} from "../patchCircuits";
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

describe("getPatchSegments", () => {
  const src = devicePoint(nodes, "dev-a", "out1-out");
  const tgt = devicePoint(nodes, "dev-b", "in1-in");

  it("returns one unsuffixed segment for an unpatched edge", () => {
    const segs = getPatchSegments(edge("e1", "dev-a", "dev-b"), nodes, "E001", src, tgt);
    expect(segs).toHaveLength(1);
    expect(segs[0].label).toBe("E001");
    expect(segs[0].suffix).toBe("");
    expect(segs[0].from.label).toBe("Console");
    expect(segs[0].to.label).toBe("Stage Box");
  });

  it("expands one hop into two suffixed segments with panel midpoints", () => {
    const e = edge("e1", "dev-a", "dev-b", { patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-3" }] });
    const segs = getPatchSegments(e, nodes, "E001", src, tgt);
    expect(segs.map((s) => s.label)).toEqual(["E001-A", "E001-B"]);
    expect(segs[0].from.label).toBe("Console");
    expect(segs[0].to).toMatchObject({ kind: "panel", label: "PP-01", portLabel: "Port 3" });
    expect(segs[1].from).toMatchObject({ kind: "panel", label: "PP-01" });
    expect(segs[1].to.label).toBe("Stage Box");
  });

  it("expands two hops into three segments spanning both panels", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      patchHops: [
        { panelNodeId: "pp-2", portId: "pp-port-11" },
        { panelNodeId: "pp-1", portId: "pp-port-6" },
      ],
    });
    const segs = getPatchSegments(e, nodes, "E005", src, tgt);
    expect(segs.map((s) => s.label)).toEqual(["E005-A", "E005-B", "E005-C"]);
    expect(segs[1].from.label).toBe("PP-02");
    expect(segs[1].to.label).toBe("PP-01");
  });

  it("applies label + length overrides and marks overridden", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-1" }],
      patchSegments: [{ label: "TIE-07", cableLength: "50 ft" }],
    });
    const segs = getPatchSegments(e, nodes, "E001", src, tgt);
    expect(segs[0]).toMatchObject({ label: "TIE-07", overridden: true, cableLength: "50 ft" });
    expect(segs[1]).toMatchObject({ label: "E001-B", overridden: false });
  });

  it("drops stale hops referencing a missing panel or port", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      patchHops: [
        { panelNodeId: "pp-gone", portId: "x" },
        { panelNodeId: "pp-1", portId: "pp-port-1" },
      ],
    });
    expect(resolvableHops(e, nodes)).toHaveLength(1);
    const segs = getPatchSegments(e, nodes, "E001", src, tgt);
    expect(segs).toHaveLength(2);
    expect(segs[0].to.label).toBe("PP-01");
  });
});

describe("getPanelOccupancy", () => {
  it("merges hop occupancy and wired-edge occupancy; wired wins", () => {
    const hopEdge = edge("e1", "dev-a", "dev-b", { patchHops: [{ panelNodeId: "pp-1", portId: "pp-port-1" }] });
    const wiredEdge = {
      ...edge("e2", "dev-a", "pp-1"),
      targetHandle: "pp-port-2-rear",
    } as ConnectionEdge;
    const occ = getPanelOccupancy(nodes, [hopEdge, wiredEdge]);
    expect(occ.get("pp-1")?.get("pp-port-1")).toMatchObject({ kind: "hop", edgeId: "e1", hopIndex: 0 });
    expect(occ.get("pp-1")?.get("pp-port-2")).toMatchObject({ kind: "wired", rearEdgeId: "e2" });
    expect(isPortAvailable(occ, "pp-1", "pp-port-3")).toBe(true);
    expect(isPortAvailable(occ, "pp-1", "pp-port-1")).toBe(false);
    expect(isPortAvailable(occ, "pp-1", "pp-port-2")).toBe(false);
  });

  it("records both faces of a wired passthrough port on one occupant", () => {
    const rearEdge = { ...edge("e1", "dev-a", "pp-1"), targetHandle: "pp-port-4-rear" } as ConnectionEdge;
    const frontEdge = { ...edge("e2", "pp-1", "dev-b"), sourceHandle: "pp-port-4-front" } as ConnectionEdge;
    const occ = getPanelOccupancy(nodes, [rearEdge, frontEdge]);
    expect(occ.get("pp-1")?.get("pp-port-4")).toMatchObject({
      kind: "wired", rearEdgeId: "e1", frontEdgeId: "e2",
    });
  });

  it("ignores hops pointing at non-panel nodes", () => {
    const e = edge("e1", "dev-a", "dev-b", { patchHops: [{ panelNodeId: "dev-b", portId: "in1" }] });
    const occ = getPanelOccupancy(nodes, [e]);
    expect(occ.get("dev-b")).toBeUndefined();
  });
});
