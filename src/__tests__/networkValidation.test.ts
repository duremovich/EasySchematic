import { describe, it, expect } from "vitest";
import {
  findReachableDhcpServers,
  computeDhcpWarnings,
  computeSubnetConflicts,
} from "../networkValidation";
import type { SchematicNode, ConnectionEdge, Port } from "../types";

const device = (
  id: string,
  ports: Partial<Port>[],
  extra: Record<string, unknown> = {},
): SchematicNode =>
  ({
    id,
    type: "device",
    position: { x: 0, y: 0 },
    data: {
      label: id,
      deviceType: "custom",
      ports: ports.map((p, i) => ({
        id: `${id}-p${i}`,
        label: `Port ${i}`,
        signalType: "ethernet",
        direction: "bidirectional",
        connectorType: "rj45",
        ...p,
      })),
      ...extra,
    },
  } as unknown as SchematicNode);

const dhcpServer = (id: string): SchematicNode =>
  device(id, [{}], {
    dhcpServer: {
      enabled: true,
      rangeStart: "10.10.10.100",
      rangeEnd: "10.10.10.200",
      subnetMask: "255.255.255.0",
      gateway: "10.10.10.1",
    },
  });

const stubNode = (id: string, link: string, side: "source" | "target"): SchematicNode =>
  ({
    id,
    type: "stub-label",
    position: { x: 0, y: 0 },
    data: { signalType: "ethernet", linkedConnectionId: link, side },
  } as unknown as SchematicNode);

const netEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): ConnectionEdge =>
  ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    data: { signalType: "ethernet" },
  } as unknown as ConnectionEdge);

/** Two legs of a stubbed ethernet connection src → tgt, joined by linkedConnectionId. */
const stubbedNetLegs = (
  baseId: string,
  src: string,
  tgt: string,
  link: string,
  srcHandle?: string,
  tgtHandle?: string,
): ConnectionEdge[] => [
  {
    id: `${baseId}-src`,
    source: src,
    target: `stub-${baseId}-src`,
    sourceHandle: srcHandle,
    targetHandle: "l",
    data: { signalType: "ethernet", linkedConnectionId: link },
  } as unknown as ConnectionEdge,
  {
    id: `${baseId}-tgt`,
    source: `stub-${baseId}-tgt`,
    target: tgt,
    sourceHandle: "r",
    targetHandle: tgtHandle,
    data: { signalType: "ethernet", linkedConnectionId: link },
  } as unknown as ConnectionEdge,
];

const stubPair = (baseId: string, link: string): SchematicNode[] => [
  stubNode(`stub-${baseId}-src`, link, "source"),
  stubNode(`stub-${baseId}-tgt`, link, "target"),
];

describe("findReachableDhcpServers", () => {
  it("finds a directly connected DHCP server", () => {
    const nodes = [dhcpServer("server"), device("client", [{ networkConfig: { dhcp: true } }])];
    const edges = [netEdge("e1", "server", "client", "server-p0-out", "client-p0-in")];
    const servers = findReachableDhcpServers("client", nodes, edges);
    expect(servers).toHaveLength(1);
    expect(servers[0].nodeId).toBe("server");
  });

  it("finds a DHCP server across a STUBBED connection (#220)", () => {
    const nodes = [
      dhcpServer("server"),
      device("client", [{ networkConfig: { dhcp: true } }]),
      ...stubPair("e1", "link1"),
    ];
    const edges = stubbedNetLegs("e1", "server", "client", "link1", "server-p0-out", "client-p0-in");
    const servers = findReachableDhcpServers("client", nodes, edges);
    expect(servers).toHaveLength(1);
    expect(servers[0].nodeId).toBe("server");
  });

  it("finds a DHCP server through a switch behind a stubbed connection", () => {
    const nodes = [
      dhcpServer("server"),
      device("switch", [{}, {}]),
      device("client", [{ networkConfig: { dhcp: true } }]),
      ...stubPair("e2", "link2"),
    ];
    const edges = [
      netEdge("e1", "server", "switch", "server-p0-out", "switch-p0-in"),
      ...stubbedNetLegs("e2", "switch", "client", "link2", "switch-p1-out", "client-p0-in"),
    ];
    const servers = findReachableDhcpServers("client", nodes, edges);
    expect(servers).toHaveLength(1);
    expect(servers[0].nodeId).toBe("server");
  });

  it("does not traverse a stubbed connection with mismatched VLANs", () => {
    const nodes = [
      device("server", [{ networkConfig: { vlan: 10 } }], {
        dhcpServer: { enabled: true, rangeStart: "10.0.0.10", rangeEnd: "10.0.0.20" },
      }),
      device("client", [{ networkConfig: { dhcp: true, vlan: 20 } }]),
      ...stubPair("e1", "link1"),
    ];
    const edges = stubbedNetLegs("e1", "server", "client", "link1", "server-p0-out", "client-p0-in");
    expect(findReachableDhcpServers("client", nodes, edges)).toHaveLength(0);
  });

  it("ignores an orphaned stub leg (partner leg missing)", () => {
    const nodes = [
      dhcpServer("server"),
      device("client", [{ networkConfig: { dhcp: true } }]),
      ...stubPair("e1", "link1"),
    ];
    // Only the server-side leg exists — no path to the client
    const edges = [
      stubbedNetLegs("e1", "server", "client", "link1", "server-p0-out", "client-p0-in")[0],
    ];
    expect(findReachableDhcpServers("client", nodes, edges)).toHaveLength(0);
  });
});

describe("computeDhcpWarnings", () => {
  it("does not warn 'no-server' when the server is behind a stub (#220)", () => {
    const nodes = [
      dhcpServer("server"),
      device("client", [{ networkConfig: { dhcp: true } }]),
      ...stubPair("e1", "link1"),
    ];
    const edges = stubbedNetLegs("e1", "server", "client", "link1", "server-p0-out", "client-p0-in");
    const rows = [{ nodeId: "client", portId: "client-p0", ip: "", dhcp: true }];
    expect(computeDhcpWarnings(rows, nodes, edges)).toHaveLength(0);
  });

  it("warns 'ip-in-range' when a static IP falls in a stub-reachable DHCP pool", () => {
    const nodes = [
      dhcpServer("server"),
      device("client", [{ networkConfig: { ip: "10.10.10.150" } }]),
      ...stubPair("e1", "link1"),
    ];
    const edges = stubbedNetLegs("e1", "server", "client", "link1", "server-p0-out", "client-p0-in");
    const rows = [{ nodeId: "client", portId: "client-p0", ip: "10.10.10.150", dhcp: false }];
    const warnings = computeDhcpWarnings(rows, nodes, edges);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("ip-in-range");
  });
});

describe("computeSubnetConflicts", () => {
  const netCfg = (ip: string) => ({ networkConfig: { ip, subnetMask: "255.255.255.0" } });

  it("flags a subnet mismatch across a direct connection", () => {
    const nodes = [device("a", [netCfg("10.0.0.1")]), device("b", [netCfg("10.0.1.1")])];
    const edges = [netEdge("e1", "a", "b", "a-p0-out", "b-p0-in")];
    expect(computeSubnetConflicts(nodes, edges)).toHaveLength(2);
  });

  it("flags a subnet mismatch across a STUBBED connection (#220)", () => {
    const nodes = [
      device("a", [netCfg("10.0.0.1")]),
      device("b", [netCfg("10.0.1.1")]),
      ...stubPair("e1", "link1"),
    ];
    const edges = stubbedNetLegs("e1", "a", "b", "link1", "a-p0-out", "b-p0-in");
    expect(computeSubnetConflicts(nodes, edges)).toHaveLength(2);
  });

  it("stays quiet when both ends of a stubbed connection share a subnet", () => {
    const nodes = [
      device("a", [netCfg("10.0.0.1")]),
      device("b", [netCfg("10.0.0.2")]),
      ...stubPair("e1", "link1"),
    ];
    const edges = stubbedNetLegs("e1", "a", "b", "link1", "a-p0-out", "b-p0-in");
    expect(computeSubnetConflicts(nodes, edges)).toHaveLength(0);
  });
});
