import type { SchematicNode, DeviceData, ConnectionEdge } from "./types";
import { SIGNAL_GROUPS } from "./types";
import { NETWORK_SIGNAL_TYPES } from "./connectorTypes";
import { collapseStubEdges, findReachableDhcpServers } from "./networkValidation";
import { getRoomLabel, escapeCsv } from "./packList";
import { findPortByHandle } from "./portHandles";
import { transformLabelNow } from "./labelCaseUtils";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";
import { signalLabel } from "./typeRegistry";

export interface NetworkReportRow {
  nodeId: string;
  portId: string;
  deviceLabel: string;
  portLabel: string;
  room: string;
  signalType: string;
  hostname: string;
  ip: string;
  subnetMask: string;
  gateway: string;
  vlan: string;
  dhcp: boolean;
  dhcpServerLabel: string;
  dhcpCovered: boolean;
  notes: string;
  linkSpeed: string;
  poeDrawW: string;
}



/**
 * Build a flat list of all addressable ports with their network config.
 * Includes any port that has `addressable: true` OR has any network config set.
 */
export function computeNetworkReport(nodes: SchematicNode[], edges: ConnectionEdge[] = []): NetworkReportRow[] {
  const rows: NetworkReportRow[] = [];

  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.isCableAccessory) continue;
    const room = getRoomLabel(nodes, node.parentId);

    for (const port of data.ports) {
      const nc = port.networkConfig;
      const hasConfig = nc && (nc.ip || nc.subnetMask || nc.gateway || nc.vlan || nc.dhcp);
      // addressable defaults to undefined (= yes) for network signal types, false = explicitly unchecked
      const isAddressable = NETWORK_SIGNAL_TYPES.has(port.signalType) && port.addressable !== false;
      if (!isAddressable && !hasConfig) continue;

      rows.push({
        nodeId: node.id,
        portId: port.id,
        deviceLabel: transformLabelNow(data.label),
        portLabel: transformLabelNow(port.label),
        room,
        signalType: signalLabel(port.signalType),
        hostname: data.hostname ?? "",
        ip: nc?.ip ?? "",
        subnetMask: nc?.subnetMask ?? "",
        gateway: nc?.gateway ?? "",
        vlan: nc?.vlan != null ? String(nc.vlan) : "",
        dhcp: nc?.dhcp ?? false,
        dhcpServerLabel: "",
        dhcpCovered: false,
        notes: port.notes ?? "",
        linkSpeed: port.linkSpeed ?? "",
        poeDrawW: port.poeDrawW != null ? String(port.poeDrawW) : "",
      });
    }
  }

  // Coverage pass: find reachable DHCP servers for each unique nodeId
  if (edges.length > 0) {
    const serverCache = new Map<string, ReturnType<typeof findReachableDhcpServers>>();
    for (const row of rows) {
      if (!serverCache.has(row.nodeId)) {
        serverCache.set(row.nodeId, findReachableDhcpServers(row.nodeId, nodes, edges));
      }
      const servers = serverCache.get(row.nodeId)!;
      if (servers.length > 0) {
        row.dhcpServerLabel = servers[0].deviceLabel;
        row.dhcpCovered = true;
      }
    }
  }

  return rows;
}

/** Build the network-report CSV contents (no BOM — the download wrapper adds it). */
export function buildNetworkReportCsv(rows: NetworkReportRow[]): string {
  const header = ["Device", "Port", "Room", "Signal", "Hostname", "IP", "Subnet Mask", "Gateway", "VLAN", "Speed", "PoE (W)", "DHCP", "DHCP Server", "Notes"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsv(r.deviceLabel),
        escapeCsv(r.portLabel),
        escapeCsv(r.room),
        escapeCsv(r.signalType),
        escapeCsv(r.hostname),
        r.ip,
        r.subnetMask,
        r.gateway,
        r.vlan,
        r.linkSpeed,
        r.poeDrawW,
        r.dhcp ? "Yes" : "No",
        escapeCsv(r.dhcpServerLabel),
        escapeCsv(r.notes),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export interface DhcpServerSummaryRow {
  nodeId: string;
  deviceLabel: string;
  rangeStart: string;
  rangeEnd: string;
  subnetMask: string;
  gateway: string;
}

/** Scans all device nodes for dhcpServer.enabled === true and returns a summary. */
export function computeDhcpServerSummary(nodes: SchematicNode[]): DhcpServerSummaryRow[] {
  const rows: DhcpServerSummaryRow[] = [];
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (!data.dhcpServer?.enabled) continue;
    rows.push({
      nodeId: node.id,
      deviceLabel: transformLabelNow(data.label),
      rangeStart: data.dhcpServer.rangeStart ?? "",
      rangeEnd: data.dhcpServer.rangeEnd ?? "",
      subnetMask: data.dhcpServer.subnetMask ?? "",
      gateway: data.dhcpServer.gateway ?? "",
    });
  }
  return rows;
}

export interface PoeBudgetRow {
  nodeId: string;
  deviceLabel: string;
  room: string;
  budgetW: number;
  loadW: number;
  remainingW: number;
  overBudget: boolean;
}

const POWER_SIGNALS = new Set<string>(SIGNAL_GROUPS.Power);

/**
 * Compute the PoE budget summary for every PoE source (a device with poeBudgetW set).
 *
 * LOAD counts each powered device once, in one place (#252; the no-double-count rule of #404):
 * - A per-port "PoE (W)" figure wins. Every powered port that connects to the source adds
 *   its own draw, and the device-level figure is then ignored.
 * - The device-level "Powered by PoE" figure is the fallback for a device none of whose
 *   ports carry a figure. It is charged to exactly one PoE source. A source that is itself
 *   mains-powered (no PoE draw of its own) is preferred, so a PoE-powered switch bills its
 *   upstream switch, not its downstream one; connection order breaks remaining ties.
 * - The fallback is skipped when the device has a connected power input (e.g. a camera
 *   whose DC barrel is wired to a PSU) — it isn't drawing from PoE.
 *
 * Stubbed connections are collapsed back to their real device endpoints first, so a
 * stubbed PoE run still lands on its switch.
 */
export function computePoeBudget(nodes: SchematicNode[], edges: ConnectionEdge[]): PoeBudgetRow[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const deviceData = (id: string): DeviceData | undefined => {
    const n = nodeMap.get(id);
    return n?.type === "device" ? (n.data as DeviceData) : undefined;
  };
  const isPoeSource = (id: string) => !!deviceData(id)?.poeBudgetW;
  const logical = collapseStubEdges(nodes, edges);

  // Devices with a power input that is actually wired to something.
  const mainsPowered = new Set<string>();
  for (const edge of logical) {
    for (const [id, handle] of [[edge.source, edge.sourceHandle], [edge.target, edge.targetHandle]] as const) {
      const data = deviceData(id);
      if (!data || !handle) continue;
      const port = findPortByHandle(data, handle);
      if (port && POWER_SIGNALS.has(port.signalType) && port.direction !== "output") mainsPowered.add(id);
    }
  }

  const loadBySource = new Map<string, number>();
  const addLoad = (sourceId: string, w: number) =>
    loadBySource.set(sourceId, (loadBySource.get(sourceId) ?? 0) + w);
  // Candidate PoE sources (in connection order) for each device-level-powered device.
  const deviceDrawCandidates = new Map<string, string[]>();

  for (const edge of logical) {
    if (!NETWORK_SIGNAL_TYPES.has(edge.signalType)) continue;
    // Each end is a candidate powered device when the other end is a PoE source.
    const ends: [string, string | null | undefined, string][] = [
      [edge.target, edge.targetHandle, edge.source],
      [edge.source, edge.sourceHandle, edge.target],
    ];
    for (const [poweredId, poweredHandle, sourceId] of ends) {
      if (!isPoeSource(sourceId)) continue;
      const powered = deviceData(poweredId);
      if (!powered || !poweredHandle) continue;

      if (powered.ports.some((p) => p.poeDrawW)) {
        const port = findPortByHandle(powered, poweredHandle);
        if (port?.poeDrawW) addLoad(sourceId, port.poeDrawW);
      } else if (powered.poeDrawW && !mainsPowered.has(poweredId)) {
        const list = deviceDrawCandidates.get(poweredId) ?? [];
        if (!list.includes(sourceId)) list.push(sourceId);
        deviceDrawCandidates.set(poweredId, list);
      }
    }
  }

  for (const [poweredId, candidates] of deviceDrawCandidates) {
    const chosen = candidates.find((id) => !deviceData(id)?.poeDrawW || mainsPowered.has(id)) ?? candidates[0];
    addLoad(chosen, deviceData(poweredId)!.poeDrawW!);
  }

  const rows: PoeBudgetRow[] = [];
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (!data.poeBudgetW) continue;
    const loadW = loadBySource.get(node.id) ?? 0;
    rows.push({
      nodeId: node.id,
      deviceLabel: transformLabelNow(data.label),
      room: getRoomLabel(nodes, node.parentId),
      budgetW: data.poeBudgetW,
      loadW,
      remainingW: data.poeBudgetW - loadW,
      overBudget: loadW > data.poeBudgetW,
    });
  }

  return rows;
}

export function getNetworkReportTableData(
  rows: NetworkReportRow[],
  layout: ReportLayout,
): ReportTableData[] {
  const tableDef = layout.tables.find((t) => t.id === "network");

  const flatRows = rows.map((r) => ({
    deviceLabel:    r.deviceLabel,
    portLabel:      r.portLabel,
    room:           r.room,
    signalType:     r.signalType,
    hostname:       r.hostname,
    ip:             r.ip,
    subnetMask:     r.subnetMask,
    gateway:        r.gateway,
    vlan:           r.vlan,
    dhcp:           r.dhcp ? "Yes" : "",
    dhcpServer:     r.dhcpServerLabel || "",
    notes:          r.notes,
    linkSpeed:      r.linkSpeed,
    poeDrawW:       r.poeDrawW,
  }));

  const sortBy  = tableDef?.sortBy ?? null;
  const sortDir = tableDef?.sortDir ?? "asc";
  const sorted  = sortBy
    ? [...flatRows].sort((a, b) => {
        const va = a[sortBy as keyof typeof a] ?? "";
        const vb = b[sortBy as keyof typeof b] ?? "";
        return (va.localeCompare(vb)) * (sortDir === "desc" ? -1 : 1);
      })
    : flatRows;

  const groupBy = tableDef?.groupBy ?? null;
  let groupedRows: Map<string, Record<string, string>[]> | undefined;
  if (groupBy === "room") {
    groupedRows = new Map();
    for (const row of sorted) {
      // Blank, matching getRoomLabel — a bucket labelled "Unassigned" would contradict
      // the blank Room shown on the rows inside it.
      const key = row.room;
      const arr = groupedRows.get(key) ?? [];
      arr.push(row);
      groupedRows.set(key, arr);
    }
  } else if (groupBy === "signalType") {
    groupedRows = new Map();
    for (const row of sorted) {
      const key = row.signalType || "Unknown";
      const arr = groupedRows.get(key) ?? [];
      arr.push(row);
      groupedRows.set(key, arr);
    }
  }

  return [{ id: "network", rows: sorted, groupedRows }];
}
