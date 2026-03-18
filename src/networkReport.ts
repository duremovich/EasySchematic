import type { SchematicNode, DeviceData, RoomData, ConnectionEdge } from "./types";
import { SIGNAL_LABELS } from "./types";
import { NETWORK_SIGNAL_TYPES } from "./connectorTypes";
import { findReachableDhcpServers } from "./networkValidation";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";

export interface NetworkReportRow {
  nodeId: string;
  portId: string;
  deviceLabel: string;
  portLabel: string;
  room: string;
  signalType: string;
  ip: string;
  subnetMask: string;
  gateway: string;
  vlan: string;
  dhcp: boolean;
  dhcpServerLabel: string;
  dhcpCovered: boolean;
}

function getRoomLabel(
  nodes: SchematicNode[],
  parentId: string | undefined,
): string {
  if (!parentId) return "Unassigned";
  const room = nodes.find((n) => n.id === parentId);
  if (!room || room.type !== "room") return "Unassigned";
  return (room.data as RoomData).label || "Unassigned";
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
        deviceLabel: data.label,
        portLabel: port.label,
        room,
        signalType: SIGNAL_LABELS[port.signalType] ?? port.signalType,
        ip: nc?.ip ?? "",
        subnetMask: nc?.subnetMask ?? "",
        gateway: nc?.gateway ?? "",
        vlan: nc?.vlan != null ? String(nc.vlan) : "",
        dhcp: nc?.dhcp ?? false,
        dhcpServerLabel: "",
        dhcpCovered: false,
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
      deviceLabel: data.label,
      rangeStart: data.dhcpServer.rangeStart ?? "",
      rangeEnd: data.dhcpServer.rangeEnd ?? "",
      subnetMask: data.dhcpServer.subnetMask ?? "",
      gateway: data.dhcpServer.gateway ?? "",
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
    ip:             r.ip,
    subnetMask:     r.subnetMask,
    gateway:        r.gateway,
    vlan:           r.vlan,
    dhcp:           r.dhcp ? "Yes" : "",
    dhcpServer:     r.dhcpServerLabel || "",
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
      const key = row.room || "Unassigned";
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
