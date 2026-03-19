import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
  RoomData,
  SignalType,
} from "./types";
import { SIGNAL_LABELS } from "./types";
import { getCableType } from "./cableTypes";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";

export interface PackListDevice {
  model: string;
  deviceType: string;
  room: string;
  count: number;
  manufacturer: string;
  modelNumber: string;
}

export interface PackListCable {
  cableType: string;
  signalType: string;
  cableLength: string;
  sourceDevice: string;
  sourcePort: string;
  sourceRoom: string;
  targetDevice: string;
  targetPort: string;
  targetRoom: string;
}

export interface PackListSummaryRow {
  cableType: string;
  signalType: string;
  cableLength: string;
  route: string;
  count: number;
}

export interface PackListAccessory {
  model: string;
  accessoryType: string;
  room: string;
  count: number;
  integratedWithCable: boolean;
}

export interface PackListData {
  devices: PackListDevice[];
  cables: PackListCable[];
  summary: PackListSummaryRow[];
  accessories: PackListAccessory[];
}

/** Merge summary rows by (cableType, signalType, cableLength), dropping route (for non-room-grouped views) */
export function mergeCablesByType(summary: PackListSummaryRow[]): PackListSummaryRow[] {
  const map = new Map<string, PackListSummaryRow>();
  for (const s of summary) {
    const key = `${s.cableType}|${s.signalType}|${s.cableLength}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += s.count;
    } else {
      map.set(key, { ...s, route: "" });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.cableType.localeCompare(b.cableType),
  );
}

/** Merge per-room device rows into global totals (for non-room-grouped views) */
export function mergeDevicesByModel(devices: PackListDevice[]): PackListDevice[] {
  const map = new Map<string, PackListDevice>();
  for (const d of devices) {
    const key = `${d.manufacturer}|${d.modelNumber}|${d.model}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += d.count;
    } else {
      map.set(key, { ...d, room: "" });
    }
  }
  return [...map.values()].sort(
    (a, b) => a.model.localeCompare(b.model),
  );
}

export function getRoomLabel(
  nodes: SchematicNode[],
  parentId: string | undefined,
): string {
  if (!parentId) return "Unassigned";
  const room = nodes.find((n) => n.id === parentId);
  if (!room || room.type !== "room") return "Unassigned";
  return (room.data as RoomData).label || "Unassigned";
}

export function resolvePortLabel(
  node: SchematicNode,
  handleId: string | null | undefined,
): string {
  if (!handleId || node.type !== "device") return "";
  const data = node.data as DeviceData;
  // Strip -in/-out suffix from bidirectional handles
  const portId = handleId.replace(/-(in|out)$/, "");
  const port = data.ports.find((p) => p.id === portId);
  return port?.label ?? handleId;
}

export function resolvePort(
  node: SchematicNode | undefined,
  handleId: string | null | undefined,
) {
  if (!handleId || !node || node.type !== "device") return undefined;
  const data = node.data as DeviceData;
  const portId = handleId.replace(/-(in|out)$/, "");
  return data.ports.find((p) => p.id === portId);
}

export function computePackList(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
): PackListData {
  // Devices — grouped by (model, room) with counts (excluding cable accessories)
  const deviceMap = new Map<string, PackListDevice>();
  const accessoryMap = new Map<string, PackListAccessory>();
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const data = n.data as DeviceData;
    const model = data.model ?? data.baseLabel ?? data.label;
    const room = getRoomLabel(nodes, n.parentId);

    if (data.isCableAccessory) {
      const key = `${model}|${room}`;
      const existing = accessoryMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        accessoryMap.set(key, {
          model,
          accessoryType: data.deviceType,
          room,
          count: 1,
          integratedWithCable: data.integratedWithCable ?? false,
        });
      }
      continue;
    }

    const key = `${model}|${room}`;
    const existing = deviceMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      deviceMap.set(key, {
        model,
        deviceType: data.deviceType,
        room,
        count: 1,
        manufacturer: data.manufacturer ?? "",
        modelNumber: data.modelNumber ?? "",
      });
    }
  }
  const devices = [...deviceMap.values()].sort(
    (a, b) => a.room.localeCompare(b.room) || a.model.localeCompare(b.model),
  );

  // Accessories — only non-integrated ones (integrated are grouped with trunk cable)
  const accessories = [...accessoryMap.values()]
    .filter((a) => !a.integratedWithCable)
    .sort((a, b) => a.room.localeCompare(b.room) || a.model.localeCompare(b.model));

  // Cables
  const cables: PackListCable[] = edges
    .filter((e) => e.data?.signalType)
    .map((e) => {
      const srcNode = nodes.find((n) => n.id === e.source);
      const tgtNode = nodes.find((n) => n.id === e.target);
      const signalType = e.data!.signalType as SignalType;
      const srcPort = resolvePort(srcNode, e.sourceHandle);
      const tgtPort = resolvePort(tgtNode, e.targetHandle);
      const srcRoom = srcNode
        ? getRoomLabel(nodes, srcNode.parentId)
        : "Unknown";
      const tgtRoom = tgtNode
        ? getRoomLabel(nodes, tgtNode.parentId)
        : "Unknown";
      return {
        cableType: getCableType(srcPort, tgtPort, signalType),
        signalType: SIGNAL_LABELS[signalType],
        cableLength: (e.data?.cableLength as string) ?? "",
        sourceDevice: srcNode?.type === "device"
          ? (srcNode.data as DeviceData).label
          : "Unknown",
        sourcePort: srcNode ? resolvePortLabel(srcNode, e.sourceHandle) : "",
        sourceRoom: srcRoom,
        targetDevice: tgtNode?.type === "device"
          ? (tgtNode.data as DeviceData).label
          : "Unknown",
        targetPort: tgtNode ? resolvePortLabel(tgtNode, e.targetHandle) : "",
        targetRoom: tgtRoom,
      };
    })
    .sort(
      (a, b) =>
        a.cableType.localeCompare(b.cableType) ||
        a.signalType.localeCompare(b.signalType),
    );

  // Summary — group by (cableType, signalType, cableLength, route)
  const summaryMap = new Map<string, PackListSummaryRow>();
  for (const c of cables) {
    const route =
      c.sourceRoom === c.targetRoom
        ? `Within ${c.sourceRoom}`
        : `${c.sourceRoom} > ${c.targetRoom}`;
    const key = `${c.cableType}|${c.signalType}|${c.cableLength}|${route}`;
    const existing = summaryMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      summaryMap.set(key, {
        cableType: c.cableType,
        signalType: c.signalType,
        cableLength: c.cableLength,
        route,
        count: 1,
      });
    }
  }
  const summary = [...summaryMap.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.cableType.localeCompare(b.cableType),
  );

  return { devices, cables, summary, accessories };
}

// --------------- CSV Export ---------------

export function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function csvRow(cells: string[]): string {
  return cells.map(escapeCsv).join(",");
}

export function exportPackListCsv(
  data: PackListData,
  schematicName: string,
): void {
  const lines: string[] = [];

  lines.push(`Pack List — ${schematicName}`);
  lines.push(`Generated ${new Date().toLocaleDateString()}`);
  lines.push("");

  // Device List
  lines.push("DEVICE LIST");
  lines.push(csvRow(["Qty", "Device", "Manufacturer", "Model #", "Type", "Room"]));
  for (const d of data.devices) {
    lines.push(csvRow([`${d.count}`, d.model, d.manufacturer, d.modelNumber, d.deviceType, d.room]));
  }
  lines.push("");

  // Cable Accessories
  if (data.accessories.length > 0) {
    lines.push("CABLE ACCESSORIES");
    lines.push(csvRow(["Qty", "Accessory", "Type", "Room"]));
    for (const a of data.accessories) {
      lines.push(csvRow([`${a.count}`, a.model, a.accessoryType, a.room]));
    }
    lines.push("");
  }

  // Cable List
  lines.push("CABLE LIST");
  lines.push(csvRow(["Qty", "Cable Type", "Signal", "Length", "Route"]));
  for (const s of data.summary) {
    lines.push(
      csvRow([`${s.count}`, s.cableType, s.signalType, s.cableLength, s.route]),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Pack List.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --------------- Report Table Data Transform ---------------

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** Transform PackListData into the generic ReportTableData[] format for ReportPreviewDialog */
export function getPackListTableData(
  data: PackListData,
  layout: ReportLayout,
): ReportTableData[] {
  const devicesTableDef = layout.tables.find((t) => t.id === "devices");
  const cablesTableDef = layout.tables.find((t) => t.id === "cables");

  // Devices table: only merge when room column is hidden AND not grouping by room
  const roomColVisible = devicesTableDef?.columns.find((c) => c.key === "room")?.visible ?? false;
  const devGroupBy = devicesTableDef?.groupBy;
  const useRawDevices = devGroupBy === "room" || roomColVisible;
  const deviceRows = (useRawDevices ? data.devices : mergeDevicesByModel(data.devices)).map(
    (d) => ({
      count: `${d.count}x`,
      model: d.model,
      manufacturer: d.manufacturer,
      modelNumber: d.modelNumber,
      deviceType: d.deviceType,
      room: d.room,
    }),
  );

  let deviceGroupedRows: Map<string, Record<string, string>[]> | undefined;
  if (devGroupBy === "room") {
    deviceGroupedRows = groupBy(deviceRows, (r) => r.room);
  }

  // Cables table: only merge when route column is hidden AND not grouping by path
  const routeColVisible = cablesTableDef?.columns.find((c) => c.key === "route")?.visible ?? false;
  const cabGroupBy = cablesTableDef?.groupBy;
  const useRawCables = cabGroupBy === "path" || routeColVisible;
  const summarySource = useRawCables ? data.summary : mergeCablesByType(data.summary);
  const cableRows = summarySource.map((s) => ({
    count: `${s.count}x`,
    cableType: s.cableType,
    signalType: s.signalType,
    cableLength: s.cableLength,
    route: s.route,
  }));

  let cableGroupedRows: Map<string, Record<string, string>[]> | undefined;
  if (cabGroupBy === "path") {
    cableGroupedRows = groupBy(cableRows, (r) => {
      const match = r.route.match(/^Within (.+)$|^(.+?) >/);
      return match?.[1] ?? match?.[2] ?? "Unassigned";
    });
  }

  // Apply sorting
  const sortRows = (rows: Record<string, string>[], sortBy: string | null | undefined, sortDir: "asc" | "desc" | undefined) => {
    if (!sortBy) return rows;
    const dir = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = a[sortBy] ?? "";
      const vb = b[sortBy] ?? "";
      // Try numeric comparison for Qty column
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return va.localeCompare(vb) * dir;
    });
  };

  const sortedDeviceRows = sortRows(deviceRows, devicesTableDef?.sortBy, devicesTableDef?.sortDir);
  const sortedCableRows = sortRows(cableRows, cablesTableDef?.sortBy, cablesTableDef?.sortDir);

  // Re-group after sorting if needed
  let sortedDeviceGrouped = deviceGroupedRows;
  if (devGroupBy === "room" && devicesTableDef?.sortBy) {
    sortedDeviceGrouped = groupBy(sortedDeviceRows, (r) => r.room);
  }

  let sortedCableGrouped = cableGroupedRows;
  if (cabGroupBy === "path" && cablesTableDef?.sortBy) {
    sortedCableGrouped = groupBy(sortedCableRows, (r) => {
      const match = r.route.match(/^Within (.+)$|^(.+?) >/);
      return match?.[1] ?? match?.[2] ?? "Unassigned";
    });
  }

  // Accessories table
  const accessoriesTableDef = layout.tables.find((t) => t.id === "accessories");
  const accessoryRows = data.accessories.map((a) => ({
    count: `${a.count}x`,
    model: a.model,
    accessoryType: a.accessoryType,
    room: a.room,
  }));

  const sortedAccessoryRows = sortRows(accessoryRows, accessoriesTableDef?.sortBy, accessoriesTableDef?.sortDir);

  let accessoryGroupedRows: Map<string, Record<string, string>[]> | undefined;
  if (accessoriesTableDef?.groupBy === "room") {
    accessoryGroupedRows = groupBy(sortedAccessoryRows, (r) => r.room);
  }

  return [
    {
      id: "devices",
      rows: sortedDeviceRows,
      groupedRows: sortedDeviceGrouped,
    },
    {
      id: "cables",
      rows: sortedCableRows,
      groupedRows: sortedCableGrouped,
    },
    {
      id: "accessories",
      rows: sortedAccessoryRows,
      groupedRows: accessoryGroupedRows,
    },
  ];
}
