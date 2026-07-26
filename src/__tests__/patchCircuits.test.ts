import { describe, it, expect } from "vitest";
import {
  getPatchSegments,
  getPanelOccupancy,
  isPortAvailable,
  devicePoint,
  resolvableHops,
  checkHopConnectors,
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

  it("ignores per-segment overrides when a stale hop was filtered (indices shifted)", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      patchHops: [
        { panelNodeId: "pp-gone", portId: "x" },
        { panelNodeId: "pp-1", portId: "pp-port-1" },
      ],
      // Stored against the ORIGINAL 3-segment layout — positionally invalid after filtering.
      patchSegments: [{ label: "TIE-01" }, { label: "TIE-02" }],
    });
    const segs = getPatchSegments(e, nodes, "E001", src, tgt);
    expect(segs.map((s) => s.label)).toEqual(["E001-A", "E001-B"]);
    expect(segs.every((s) => !s.overridden)).toBe(true);
  });

  it("occupancy hopIndex aligns with filtered segments when a stale hop is dropped", () => {
    const e = edge("e1", "dev-a", "dev-b", {
      patchHops: [
        { panelNodeId: "pp-gone", portId: "x" },        // dropped at read time
        { panelNodeId: "pp-1", portId: "pp-port-5" },   // raw index 1, filtered index 0
      ],
    });
    const occ = getPanelOccupancy(nodes, [e]);
    const occupant = occ.get("pp-1")?.get("pp-port-5");
    expect(occupant).toMatchObject({ kind: "hop", hopIndex: 0 });
    const segs = getPatchSegments(e, nodes, "E001", src, tgt);
    // segs[hopIndex] / segs[hopIndex+1] must be the faces around pp-1
    expect(segs[0].to.label).toBe("PP-01");
    expect(segs[1].from.label).toBe("PP-01");
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

describe("checkHopConnectors", () => {
  // An SDI run (BNC on both ends) and a BNC-fitted panel to patch it through.
  const sdiNodes: SchematicNode[] = [
    deviceNode("cam", "Camera", [
      { id: "sdi-out", label: "SDI OUT", signalType: "sdi", direction: "output", connectorType: "bnc" },
    ]),
    deviceNode("swi", "Switcher", [
      { id: "sdi-in", label: "SDI IN", signalType: "sdi", direction: "input", connectorType: "bnc" },
    ]),
    ...nodes.filter((n) => n.id.startsWith("pp-")),
    {
      id: "pp-bnc", type: "device", position: { x: 0, y: 0 },
      data: {
        label: "PP-BNC", deviceType: "patch-panel", offCanvas: true,
        ports: [{
          id: "b1", label: "1", signalType: "sdi", direction: "passthrough",
          rearConnectorType: "bnc", frontConnectorType: "bnc",
        }],
      },
    } as unknown as SchematicNode,
  ];
  const sdiEdge = {
    id: "e-sdi", source: "cam", target: "swi",
    sourceHandle: "sdi-out-out", targetHandle: "sdi-in-in",
    data: { signalType: "sdi" },
  } as unknown as ConnectionEdge;
  const sdiSrc = devicePoint(sdiNodes, "cam", "sdi-out-out");
  const sdiTgt = devicePoint(sdiNodes, "swi", "sdi-in-in");

  it("rejects an SDI run patched through an RJ45 panel", () => {
    const m = checkHopConnectors(sdiEdge, sdiNodes, { panelNodeId: "pp-1", portId: "pp-port-1" }, sdiSrc, sdiTgt);
    expect(m).not.toBeNull();
    expect(m!.face).toBe("rear");
    expect(m!.panelConnector).toBe("rj45");
    expect(m!.otherConnector).toBe("bnc");
    expect(m!.otherLabel).toBe("Camera SDI OUT");
  });

  it("accepts an SDI run patched through a BNC panel", () => {
    expect(
      checkHopConnectors(sdiEdge, sdiNodes, { panelNodeId: "pp-bnc", portId: "b1" }, sdiSrc, sdiTgt),
    ).toBeNull();
  });

  it("accepts an ethernet run through an RJ45 panel", () => {
    const src = devicePoint(nodes, "dev-a", "out1-out");
    const tgt = devicePoint(nodes, "dev-b", "in1-in");
    expect(
      checkHopConnectors(edge("e1", "dev-a", "dev-b"), nodes, { panelNodeId: "pp-1", portId: "pp-port-1" }, src, tgt),
    ).toBeNull();
  });

  it("checks the new hop's rear against the PREVIOUS hop's front, not the source device", () => {
    // First hop lands on an RJ45 panel, so a second BNC hop clashes on its rear face.
    const patched = { ...sdiEdge, data: { ...sdiEdge.data, patchHops: [{ panelNodeId: "pp-bnc", portId: "b1" }] } } as ConnectionEdge;
    const m = checkHopConnectors(patched, sdiNodes, { panelNodeId: "pp-1", portId: "pp-port-1" }, sdiSrc, sdiTgt);
    expect(m).not.toBeNull();
    expect(m!.face).toBe("rear");
    expect(m!.otherLabel).toBe("PP-BNC 1");
  });

  it("passes when connector info is missing on either side", () => {
    const noConn = [
      deviceNode("plain", "Plain", [{ id: "p1", label: "P1", signalType: "custom", direction: "output" }]),
      ...sdiNodes.filter((n) => n.id !== "plain"),
    ];
    const e = { ...sdiEdge, source: "plain", sourceHandle: "p1-out" } as ConnectionEdge;
    expect(
      checkHopConnectors(e, noConn, { panelNodeId: "pp-1", portId: "pp-port-1" }, devicePoint(noConn, "plain", "p1-out"), sdiTgt),
    ).not.toBeNull(); // front face still clashes with the BNC target
  });
});
