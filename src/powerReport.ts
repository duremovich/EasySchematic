import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
} from "./types";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";
import { csvRow, groupBy, getRoomLabel } from "./packList";
import { transformLabelNow } from "./labelCaseUtils";
import { effectiveThermalBtuh } from "./thermal";
import { isExternalEndpointData } from "./externalEndpoint";

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
    if (isExternalEndpointData(data)) continue;
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

  // Build adjacency: for power edges, from output side to input side
  const powerEdges = edges.filter((e) => e.data?.signalType === "power");

  // Get devices downstream from a distro node by following power output edges
  function getDownstreamLoad(distroId: string, visited: Set<string>): number {
    if (visited.has(distroId)) return 0;
    visited.add(distroId);

    let load = 0;
    for (const edge of powerEdges) {
      // Distro outputs power → target receives it
      if (edge.source === distroId) {
        const targetData = nodeDataMap.get(edge.target);
        if (!targetData) continue;

        connectedToDistro.add(edge.target);

        // If the target is also a distro, recurse (daisy chain)
        if (targetData.data.powerCapacityW != null && targetData.data.powerCapacityW > 0) {
          load += getDownstreamLoad(edge.target, visited);
        } else {
          load += targetData.data.powerDrawW ?? 0;
        }
      }
    }
    return load;
  }

  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (isExternalEndpointData(data)) continue;
    if (data.powerCapacityW == null || data.powerCapacityW <= 0) continue;

    const capacityW = data.powerCapacityW;
    const loadW = getDownstreamLoad(node.id, new Set());
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
    if (isExternalEndpointData(data)) continue;
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

export function exportPowerReportCsv(
  data: PowerReportData,
  schematicName: string,
): void {
  const lines: string[] = [];

  lines.push(`Power Report — ${schematicName}`);
  lines.push(`Generated ${new Date().toLocaleDateString()}`);
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

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
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
