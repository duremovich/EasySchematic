import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
} from "./types";
import { SIGNAL_GROUPS } from "./types";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";
import { csvRow, groupBy, getRoomLabel } from "./packList";
import { transformLabelNow } from "./labelCaseUtils";
import { effectiveThermalBtuh } from "./thermal";

// ─── Types ───

export interface PowerReportDevice {
  nodeId: string;
  model: string;
  deviceType: string;
  room: string;
  powerDrawW: number;
  thermalBtuh: number;
  thermalDerived: boolean;
  voltage: string;
  count: number;
}

export interface PowerReportDistro {
  nodeId: string;
  label: string;
  room: string;
  capacityW: number;
  loadW: number;
  loadPercent: number;
  status: "OK" | "Warning" | "Overloaded";
}

export interface PowerReportData {
  devices: PowerReportDevice[];
  distros: PowerReportDistro[];
  totalPowerW: number;
  totalThermalBtuh: number;
  unconnectedPowerW: number;
  unconnectedThermalBtuh: number;
}

// ─── Helpers ───



// Every power signal type — single-phase "power" plus the per-conductor 3-phase
// legs (L1/L2/L3/neutral/ground). A 3-phase feed is drawn as several parallel
// cam-lok edges between the same two devices; the walk must recognize them all
// (else a 3-phase distro like a company switch reads as feeding nothing) without
// counting the same downstream load once per conductor.
const POWER_SIGNALS = new Set<string>(SIGNAL_GROUPS.Power);

function getDistroStatus(loadPercent: number): "OK" | "Warning" | "Overloaded" {
  if (loadPercent > 100) return "Overloaded";
  if (loadPercent > 80) return "Warning";
  return "OK";
}

// ─── Compute ───

export function computePowerReport(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
): PowerReportData {
  // 1. Gather all device power draws
  const deviceMap = new Map<string, PowerReportDevice>();
  const nodeDataMap = new Map<string, { data: DeviceData; parentId?: string }>();

  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.isCableAccessory) continue;
    nodeDataMap.set(node.id, { data, parentId: node.parentId });

    const powerDraw = data.powerDrawW ?? 0;
    const thermal = effectiveThermalBtuh(data);
    const model = transformLabelNow(data.model ?? data.baseLabel ?? data.label);
    const room = getRoomLabel(nodes, node.parentId);
    const key = `${model}|${room}`;

    const existing = deviceMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      deviceMap.set(key, {
        nodeId: node.id,
        model,
        deviceType: data.deviceType,
        room,
        powerDrawW: powerDraw,
        thermalBtuh: thermal?.value ?? 0,
        thermalDerived: thermal?.isDerived ?? false,
        voltage: data.voltage ?? "",
        count: 1,
      });
    }
  }

  const devices = [...deviceMap.values()].sort(
    (a, b) => a.room.localeCompare(b.room) || (b.powerDrawW * b.count) - (a.powerDrawW * a.count),
  );

  const totalPowerW = devices.reduce((sum, d) => sum + d.powerDrawW * d.count, 0);
  const totalThermalBtuh = devices.reduce((sum, d) => sum + d.thermalBtuh * d.count, 0);

  // 2. Identify distros and compute loading via graph walk
  const distros: PowerReportDistro[] = [];
  const connectedToDistro = new Set<string>();

  // Build adjacency: for power edges, from output side to input side.
  // Stubbed connections split the original A→B edge into two legs joined by a
  // shared linkedConnectionId, each terminating at a stub-label node (A→stubA,
  // stubB→B). The stub node isn't a device, so a naive walk dead-ends there and
  // the load goes uncounted (#172). Collapse the legs back to logical A→B edges.
  const stubNodeIds = new Set(
    nodes.filter((n) => n.type === "stub-label").map((n) => n.id),
  );
  const powerEdges: { source: string; target: string }[] = [];
  const stubLegsByLink = new Map<string, { source?: string; target?: string }>();
  for (const e of edges) {
    if (!e.data || !POWER_SIGNALS.has(e.data.signalType)) continue;
    const link = e.data.linkedConnectionId;
    if (!link) {
      powerEdges.push({ source: e.source, target: e.target });
      continue;
    }
    // Reassemble the two stub legs: the source-side leg keeps the real source
    // (its target is the stub node); the target-side leg keeps the real target.
    const entry = stubLegsByLink.get(link) ?? {};
    if (stubNodeIds.has(e.target)) entry.source = e.source;
    if (stubNodeIds.has(e.source)) entry.target = e.target;
    stubLegsByLink.set(link, entry);
  }
  for (const { source, target } of stubLegsByLink.values()) {
    if (source != null && target != null) powerEdges.push({ source, target });
  }

  // Power can flow THROUGH intermediate nodes that aren't distros — in-line
  // adapters (e.g. an L5-20→Edison adapter), passive power strips, daisy-chained
  // distros. The walk must pass through them to reach the real load behind them;
  // otherwise everything downstream of a passthrough reads as 0W. Build a draw
  // lookup over ALL device nodes, including cable accessories (which draw 0 but
  // still conduct power), so traversal never dead-ends at a passthrough.
  const drawById = new Map<string, number>();
  for (const node of nodes) {
    if (node.type !== "device") continue;
    drawById.set(node.id, (node.data as DeviceData).powerDrawW ?? 0);
  }

  // Sum every device's draw downstream of a node by following power output edges,
  // recursing through passthroughs and daisy-chained distros alike. Each node is
  // counted at most once (gated by `visited`): parallel conductors of one feed
  // (3-phase L1/L2/L3/N/G), and any diamond/cycle, contribute their load a single
  // time. Seed `visited` with the root distro so a back-edge to it is ignored.
  function getDownstreamLoad(fromId: string, visited: Set<string>): number {
    let load = 0;
    for (const edge of powerEdges) {
      if (edge.source !== fromId) continue; // follow power output → target
      const target = edge.target;
      if (!drawById.has(target)) continue; // target isn't a device node
      if (visited.has(target)) continue; // already counted (parallel conductor / diamond)
      visited.add(target);
      connectedToDistro.add(target);
      load += drawById.get(target) ?? 0; // the node's own draw (0 for adapters/distros)
      load += getDownstreamLoad(target, visited); // everything behind it
    }
    return load;
  }

  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.powerCapacityW == null || data.powerCapacityW <= 0) continue;

    const capacityW = data.powerCapacityW;
    const loadW = getDownstreamLoad(node.id, new Set([node.id]));
    const loadPercent = capacityW > 0 ? Math.round((loadW / capacityW) * 100) : 0;

    distros.push({
      nodeId: node.id,
      label: transformLabelNow(data.label),
      room: getRoomLabel(nodes, node.parentId),
      capacityW,
      loadW,
      loadPercent,
      status: getDistroStatus(loadPercent),
    });
  }

  // 3. Calculate unconnected power
  let unconnectedPowerW = 0;
  let unconnectedThermalBtuh = 0;
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.isCableAccessory) continue;
    if (data.powerCapacityW != null && data.powerCapacityW > 0) continue; // skip distros
    const powerDraw = data.powerDrawW ?? 0;
    if (powerDraw > 0 && !connectedToDistro.has(node.id)) {
      unconnectedPowerW += powerDraw;
      const thermal = effectiveThermalBtuh(data);
      unconnectedThermalBtuh += thermal?.value ?? 0;
    }
  }

  return {
    devices,
    distros,
    totalPowerW,
    totalThermalBtuh,
    unconnectedPowerW,
    unconnectedThermalBtuh,
  };
}

// ─── CSV Export ───

/** Build the power-report CSV file contents (including the UTF-8 BOM). */
export function buildPowerReportCsv(
  data: PowerReportData,
  schematicName: string,
  generatedDate: string = new Date().toLocaleDateString(),
): string {
  const lines: string[] = [];

  lines.push(`Power Report — ${schematicName}`);
  lines.push(`Generated ${generatedDate}`);
  lines.push("");

  lines.push("DEVICE POWER DRAW");
  lines.push(csvRow(["Qty", "Device", "Type", "Room", "Power (W)", "Thermal (BTU/h)", "Total Thermal (BTU/h)", "Voltage"]));
  for (const d of data.devices) {
    const thermalCell = d.thermalBtuh > 0
      ? `${d.thermalDerived ? "~" : ""}${d.thermalBtuh}`
      : "";
    const totalThermalCell = d.thermalBtuh > 0
      ? `${d.thermalDerived ? "~" : ""}${d.thermalBtuh * d.count}`
      : "";
    lines.push(csvRow([
      `${d.count}`,
      d.model,
      d.deviceType,
      d.room,
      `${d.powerDrawW}`,
      thermalCell,
      totalThermalCell,
      d.voltage,
    ]));
  }
  lines.push("");
  lines.push(csvRow(["Total System Power", `${data.totalPowerW}W`, `${(data.totalPowerW / 120).toFixed(1)}A @120V`, `${(data.totalPowerW / 208).toFixed(1)}A @208V`]));
  lines.push(csvRow(["Total System Thermal", `${data.totalThermalBtuh} BTU/h`, `≈ ${(data.totalThermalBtuh / 12000).toFixed(1)} ton AC`]));
  if (data.unconnectedPowerW > 0) {
    lines.push(csvRow(["Unconnected Power", `${data.unconnectedPowerW}W`, `${data.unconnectedThermalBtuh} BTU/h`]));
  }
  lines.push("");

  if (data.distros.length > 0) {
    lines.push("DISTRIBUTION LOADING");
    lines.push(csvRow(["Distro", "Room", "Capacity (W)", "Load (W)", "Load %", "Status"]));
    for (const d of data.distros) {
      lines.push(csvRow([
        d.label,
        d.room,
        `${d.capacityW}`,
        `${d.loadW}`,
        `${d.loadPercent}%`,
        d.status,
      ]));
    }
  }

  // UTF-8 BOM so Excel decodes "≈" / "⚠" correctly (same mojibake fix as the
  // cable-schedule CSV from the v0.42 playtest)
  return "﻿" + lines.join("\n");
}

export function exportPowerReportCsv(
  data: PowerReportData,
  schematicName: string,
): void {
  const blob = new Blob([buildPowerReportCsv(data, schematicName)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Power Report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Report Table Data Transform ───

export function getPowerReportTableData(
  data: PowerReportData,
  layout: ReportLayout,
): ReportTableData[] {
  const devicesTableDef = layout.tables.find((t) => t.id === "powerDevices");
  const distrosTableDef = layout.tables.find((t) => t.id === "powerDistros");

  // Devices table
  const deviceRows: Record<string, string>[] = data.devices.map((d) => {
    const prefix = d.thermalDerived ? "~" : "";
    return {
      count: `${d.count}x`,
      model: d.model,
      deviceType: d.deviceType,
      room: d.room,
      powerDrawW: d.powerDrawW > 0 ? `${d.powerDrawW}` : "—",
      totalPowerW: d.powerDrawW > 0 ? `${d.powerDrawW * d.count}` : "—",
      thermalBtuh: d.thermalBtuh > 0 ? `${prefix}${d.thermalBtuh}` : "—",
      totalThermalBtuh: d.thermalBtuh > 0 ? `${prefix}${d.thermalBtuh * d.count}` : "—",
      voltage: d.voltage || "—",
    };
  });

  // Add total row
  deviceRows.push({
    count: "",
    model: "TOTAL",
    deviceType: "",
    room: "",
    powerDrawW: "",
    totalPowerW: `${data.totalPowerW}`,
    thermalBtuh: "",
    totalThermalBtuh: `${data.totalThermalBtuh}`,
    voltage: `${(data.totalPowerW / 120).toFixed(1)}A @120V / ${(data.totalPowerW / 208).toFixed(1)}A @208V`,
    _isFooter: "true",
  });

  const sortBy = devicesTableDef?.sortBy ?? null;
  const sortDir = devicesTableDef?.sortDir ?? "asc";
  const sortedDeviceRows = sortBy
    ? [...deviceRows.filter((r) => !r._isFooter)].sort((a, b) => {
        const va = a[sortBy] ?? "";
        const vb = b[sortBy] ?? "";
        const na = parseFloat(va);
        const nb = parseFloat(vb);
        const dir = sortDir === "desc" ? -1 : 1;
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
        return va.localeCompare(vb) * dir;
      }).concat(deviceRows.filter((r) => r._isFooter))
    : deviceRows;

  let deviceGroupedRows: Map<string, Record<string, string>[]> | undefined;
  if (devicesTableDef?.groupBy === "room") {
    deviceGroupedRows = groupBy(
      sortedDeviceRows.filter((r) => !r._isFooter),
      (r) => r.room,
    );
  }

  // Distros table
  const distroRows: Record<string, string>[] = data.distros.map((d) => ({
    label: d.label,
    room: d.room,
    capacityW: `${d.capacityW}`,
    loadW: `${d.loadW}`,
    loadPercent: `${d.loadPercent}%`,
    status: d.status,
  }));

  const distroSortBy = distrosTableDef?.sortBy ?? null;
  const distroSortDir = distrosTableDef?.sortDir ?? "asc";
  const sortedDistroRows = distroSortBy
    ? [...distroRows].sort((a, b) => {
        const va = a[distroSortBy] ?? "";
        const vb = b[distroSortBy] ?? "";
        const na = parseFloat(va);
        const nb = parseFloat(vb);
        const dir = distroSortDir === "desc" ? -1 : 1;
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
        return va.localeCompare(vb) * dir;
      })
    : distroRows;

  return [
    {
      id: "powerDevices",
      rows: sortedDeviceRows,
      groupedRows: deviceGroupedRows,
    },
    {
      id: "powerDistros",
      rows: sortedDistroRows,
    },
  ];
}
