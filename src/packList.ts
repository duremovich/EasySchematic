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

export type CableCategory = "Video" | "Audio" | "Control" | "Data" | "Power" | "Custom";

const SIGNAL_CATEGORY: Record<string, CableCategory> = {
  SDI: "Video",
  HDMI: "Video",
  NDI: "Video",
  DisplayPort: "Video",
  HDBaseT: "Video",
  SRT: "Video",
  Composite: "Video",
  VGA: "Video",
  Analog: "Audio",
  AES: "Audio",
  Dante: "Audio",
  MADI: "Audio",
  MIDI: "Audio",
  "S/PDIF": "Audio",
  ADAT: "Audio",
  Ultranet: "Audio",
  AES50: "Audio",
  StageConnect: "Audio",
  DMX: "Control",
  Genlock: "Control",
  GPIO: "Control",
  "RS-422": "Control",
  Serial: "Control",
  Tally: "Control",
  USB: "Data",
  Fiber: "Data",
  Thunderbolt: "Data",
  Ethernet: "Data",
  Power: "Power",
  "L1 (Phase A)": "Power",
  "L2 (Phase B)": "Power",
  "L3 (Phase C)": "Power",
  Neutral: "Power",
  Ground: "Power",
  Custom: "Custom",
};

const CATEGORY_ORDER: CableCategory[] = ["Video", "Audio", "Control", "Data", "Power", "Custom"];

export function getCableCategory(signalLabel: string): CableCategory {
  return SIGNAL_CATEGORY[signalLabel] ?? "Custom";
}

export function groupCablesByCategory(rows: PackListSummaryRow[]): { category: CableCategory; rows: PackListSummaryRow[]; total: number }[] {
  const groups = new Map<CableCategory, PackListSummaryRow[]>();
  for (const row of rows) {
    const cat = getCableCategory(row.signalType);
    const arr = groups.get(cat);
    if (arr) arr.push(row);
    else groups.set(cat, [row]);
  }
  return CATEGORY_ORDER
    .filter((cat) => groups.has(cat))
    .map((cat) => {
      const catRows = groups.get(cat)!;
      return { category: cat, rows: catRows, total: catRows.reduce((sum, r) => sum + r.count, 0) };
    });
}

export interface PackListDeviceCard {
  cardLabel: string;
  manufacturer: string;
  modelNumber: string;
  count: number;
  cardUnitCost: number;
}

export interface PackListDevice {
  model: string;
  deviceType: string;
  room: string;
  count: number;
  manufacturer: string;
  modelNumber: string;
  cards: PackListDeviceCard[];
  powerDrawW: number;
  unitCost: number;
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

export interface PackListAdapter {
  model: string;
  room: string;
  count: number;
  manufacturer: string;
  modelNumber: string;
}

export interface PackListData {
  devices: PackListDevice[];
  cables: PackListCable[];
  summary: PackListSummaryRow[];
  accessories: PackListAccessory[];
  adapters: PackListAdapter[];
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
      // Merge cards
      for (const card of d.cards) {
        const ec = existing.cards.find(
          (c) => c.cardLabel === card.cardLabel && c.manufacturer === card.manufacturer && c.modelNumber === card.modelNumber,
        );
        if (ec) ec.count += card.count;
        else existing.cards.push({ ...card });
      }
    } else {
      map.set(key, { ...d, room: "", cards: d.cards.map((c) => ({ ...c })), powerDrawW: d.powerDrawW });
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
  // Devices — grouped by (model, room) with counts (excluding cable accessories and passive adapters)
  const deviceMap = new Map<string, PackListDevice>();
  const accessoryMap = new Map<string, PackListAccessory>();
  const adapterMap = new Map<string, PackListAdapter>();
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const data = n.data as DeviceData;
    if (data.isVenueProvided) continue;
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

    // Passive adapters go to their own section (shown in cables tab)
    if (data.deviceType === "adapter") {
      const key = `${model}|${room}`;
      const existing = adapterMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        adapterMap.set(key, {
          model,
          room,
          count: 1,
          manufacturer: data.manufacturer ?? "",
          modelNumber: data.modelNumber ?? "",
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
        cards: [],
        powerDrawW: data.powerDrawW ?? 0,
        unitCost: data.unitCost ?? 0,
      });
    }

    // Collect installed expansion cards as sub-items of their parent device
    if (data.slots) {
      const device = deviceMap.get(key)!;
      for (const slot of data.slots) {
        if (!slot.cardTemplateId || !slot.cardLabel) continue;
        const cardKey = `${slot.cardLabel}|${slot.cardManufacturer ?? ""}|${slot.cardModelNumber ?? ""}`;
        const existingCard = device.cards.find(
          (c) => `${c.cardLabel}|${c.manufacturer}|${c.modelNumber}` === cardKey,
        );
        if (existingCard) {
          existingCard.count++;
        } else {
          device.cards.push({
            cardLabel: slot.cardLabel,
            manufacturer: slot.cardManufacturer ?? "",
            modelNumber: slot.cardModelNumber ?? "",
            count: 1,
            cardUnitCost: slot.cardUnitCost ?? 0,
          });
        }
      }
    }
  }
  const devices = [...deviceMap.values()].sort(
    (a, b) => a.room.localeCompare(b.room) || a.model.localeCompare(b.model),
  );

  // Accessories — only non-integrated ones (integrated are grouped with trunk cable)
  const accessories = [...accessoryMap.values()]
    .filter((a) => !a.integratedWithCable)
    .sort((a, b) => a.room.localeCompare(b.room) || a.model.localeCompare(b.model));

  // Adapters — passive adapters shown in cables section
  const adapters = [...adapterMap.values()].sort(
    (a, b) => a.room.localeCompare(b.room) || a.model.localeCompare(b.model),
  );

  // Cables — exclude edges where one side is a direct-attach adapter port
  const cables: PackListCable[] = edges
    .filter((e) => {
      if (!e.data?.signalType) return false;
      const srcNode = nodes.find((n) => n.id === e.source);
      const tgtNode = nodes.find((n) => n.id === e.target);
      const srcPort = resolvePort(srcNode, e.sourceHandle);
      const tgtPort = resolvePort(tgtNode, e.targetHandle);
      if (srcNode?.type === "device" && (srcNode.data as DeviceData).deviceType === "adapter" && srcPort?.directAttach) return false;
      if (tgtNode?.type === "device" && (tgtNode.data as DeviceData).deviceType === "adapter" && tgtPort?.directAttach) return false;
      if (srcPort?.connectorType === "wireless" || tgtPort?.connectorType === "wireless") return false;
      return true;
    })
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

  return { devices, cables, summary, accessories, adapters };
}

/** Generate a lookup key for cable costs: "cableType|signalType|cableLength" */
export function cableCostKey(cableType: string, signalType: string, cableLength: string): string {
  return `${cableType}|${signalType}|${cableLength}`;
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
  cableCosts?: Record<string, number>,
): void {
  const lines: string[] = [];

  lines.push(`Pack List — ${schematicName}`);
  lines.push(`Generated ${new Date().toLocaleDateString()}`);
  lines.push("");

  // Device List
  lines.push("DEVICE LIST");
  lines.push(csvRow(["Qty", "Device", "Manufacturer", "Model #", "Type", "Room", "Unit Cost", "Extended Cost"]));
  let deviceTotal = 0;
  for (const d of data.devices) {
    const extCost = d.unitCost > 0 ? d.unitCost * d.count : 0;
    deviceTotal += extCost;
    lines.push(csvRow([
      `${d.count}`, d.model, d.manufacturer, d.modelNumber, d.deviceType, d.room,
      d.unitCost > 0 ? d.unitCost.toFixed(2) : "",
      extCost > 0 ? extCost.toFixed(2) : "",
    ]));
    for (const c of d.cards) {
      const cardExt = c.cardUnitCost > 0 ? c.cardUnitCost * c.count : 0;
      deviceTotal += cardExt;
      lines.push(csvRow([
        `  ${c.count}`, `  ${c.cardLabel}`, c.manufacturer, c.modelNumber, "", "",
        c.cardUnitCost > 0 ? c.cardUnitCost.toFixed(2) : "",
        cardExt > 0 ? cardExt.toFixed(2) : "",
      ]));
    }
  }
  if (deviceTotal > 0) {
    lines.push(csvRow(["", "", "", "", "", "", "TOTAL", deviceTotal.toFixed(2)]));
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

  // Adapters
  if (data.adapters.length > 0) {
    lines.push("ADAPTERS");
    lines.push(csvRow(["Qty", "Adapter", "Manufacturer", "Model #", "Room"]));
    for (const a of data.adapters) {
      lines.push(csvRow([`${a.count}`, a.model, a.manufacturer, a.modelNumber, a.room]));
    }
    lines.push("");
  }

  // Cable List
  lines.push("CABLE LIST");
  lines.push(csvRow(["Qty", "Cable Type", "Signal", "Length", "Route", "Unit Cost", "Extended Cost"]));
  let cableTotal = 0;
  for (const s of data.summary) {
    const key = cableCostKey(s.cableType, s.signalType, s.cableLength);
    const uc = cableCosts?.[key] ?? 0;
    const ext = uc > 0 ? uc * s.count : 0;
    cableTotal += ext;
    lines.push(csvRow([
      `${s.count}`, s.cableType, s.signalType, s.cableLength, s.route,
      uc > 0 ? uc.toFixed(2) : "",
      ext > 0 ? ext.toFixed(2) : "",
    ]));
  }
  if (cableTotal > 0) {
    lines.push(csvRow(["", "", "", "", "", "TOTAL", cableTotal.toFixed(2)]));
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
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
  cableCosts?: Record<string, number>,
): ReportTableData[] {
  const devicesTableDef = layout.tables.find((t) => t.id === "devices");
  const cablesTableDef = layout.tables.find((t) => t.id === "cables");

  // Devices table: only merge when room column is hidden AND not grouping by room
  const roomColVisible = devicesTableDef?.columns.find((c) => c.key === "room")?.visible ?? false;
  const devGroupBy = devicesTableDef?.groupBy;
  const useRawDevices = devGroupBy === "room" || devGroupBy === "deviceType" || roomColVisible;
  const deviceSource = useRawDevices ? data.devices : mergeDevicesByModel(data.devices);
  const deviceRows: Record<string, string>[] = [];
  for (const d of deviceSource) {
    deviceRows.push({
      count: `${d.count}x`,
      model: d.model,
      manufacturer: d.manufacturer,
      modelNumber: d.modelNumber,
      deviceType: d.deviceType,
      room: d.room,
      powerDrawW: d.powerDrawW > 0 ? `${d.powerDrawW}` : "",
      unitCost: d.unitCost > 0 ? `$${d.unitCost.toFixed(2)}` : "",
      extCost: d.unitCost > 0 ? `$${(d.unitCost * d.count).toFixed(2)}` : "",
    });
    for (const c of d.cards) {
      deviceRows.push({
        count: `${c.count}x`,
        model: c.cardLabel,
        manufacturer: c.manufacturer,
        modelNumber: c.modelNumber,
        deviceType: "",
        room: "",
        _isSubItem: "true",
        unitCost: c.cardUnitCost > 0 ? `$${c.cardUnitCost.toFixed(2)}` : "",
        extCost: c.cardUnitCost > 0 ? `$${(c.cardUnitCost * c.count).toFixed(2)}` : "",
      });
    }
  }

  let deviceGroupedRows: Map<string, Record<string, string>[]> | undefined;
  if (devGroupBy === "room") {
    deviceGroupedRows = groupBy(deviceRows, (r) => r.room);
  } else if (devGroupBy === "deviceType") {
    deviceGroupedRows = groupBy(deviceRows, (r) => r.deviceType || "Other");
  }

  // Cables table: only merge when route column is hidden AND not grouping by path
  const routeColVisible = cablesTableDef?.columns.find((c) => c.key === "route")?.visible ?? false;
  const cabGroupBy = cablesTableDef?.groupBy;
  const useRawCables = cabGroupBy === "path" || routeColVisible;
  const summarySource = useRawCables ? data.summary : mergeCablesByType(data.summary);
  const adapterCableRows = data.adapters.map((a) => ({
    count: `${a.count}x`,
    cableType: a.model,
    signalType: "",
    cableLength: "",
    route: "",
    unitCost: "",
    extCost: "",
  }));
  const cableRows = [
    ...summarySource.map((s) => {
      const key = cableCostKey(s.cableType, s.signalType, s.cableLength);
      const uc = cableCosts?.[key] ?? 0;
      return {
        count: `${s.count}x`,
        cableType: s.cableType,
        signalType: s.signalType,
        cableLength: s.cableLength,
        route: s.route,
        unitCost: uc > 0 ? `$${uc.toFixed(2)}` : "",
        extCost: uc > 0 ? `$${(uc * s.count).toFixed(2)}` : "",
      };
    }),
    ...adapterCableRows,
  ];

  let cableGroupedRows: Map<string, Record<string, string>[]> | undefined;
  if (cabGroupBy === "path") {
    cableGroupedRows = groupBy(cableRows.filter((r) => r.signalType !== ""), (r) => {
      const match = r.route.match(/^Within (.+)$|^(.+?) >/);
      return match?.[1] ?? match?.[2] ?? "Unassigned";
    });
    if (adapterCableRows.length > 0) cableGroupedRows.set("Adapters", adapterCableRows);
  } else if (cabGroupBy === "category") {
    // Group by cable category in the defined order (Video, Audio, Control, Data, Power, Custom)
    const ordered = groupCablesByCategory(summarySource);
    cableGroupedRows = new Map(
      ordered.map((g): [string, Record<string, string>[]] => [
        g.category,
        g.rows.map((s) => ({
          count: `${s.count}x`,
          cableType: s.cableType,
          signalType: s.signalType,
          cableLength: s.cableLength,
          route: s.route,
        })),
      ]),
    );
    if (adapterCableRows.length > 0) cableGroupedRows.set("Adapters", adapterCableRows);
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
  } else if (devGroupBy === "deviceType" && devicesTableDef?.sortBy) {
    sortedDeviceGrouped = groupBy(sortedDeviceRows, (r) => r.deviceType || "Other");
  }

  let sortedCableGrouped = cableGroupedRows;
  if (cabGroupBy === "path" && cablesTableDef?.sortBy) {
    sortedCableGrouped = groupBy(sortedCableRows.filter((r) => r.signalType !== ""), (r) => {
      const match = r.route.match(/^Within (.+)$|^(.+?) >/);
      return match?.[1] ?? match?.[2] ?? "Unassigned";
    });
    if (adapterCableRows.length > 0) sortedCableGrouped.set("Adapters", adapterCableRows);
  } else if (cabGroupBy === "category" && cablesTableDef?.sortBy) {
    // Re-group sorted rows by category, preserving category order
    sortedCableGrouped = new Map(
      groupCablesByCategory(summarySource).map((g): [string, Record<string, string>[]] => {
        const catSignals = new Set(g.rows.map((r) => r.signalType));
        return [g.category, sortedCableRows.filter((r) => catSignals.has(r.signalType))];
      }).filter(([, rows]) => rows.length > 0),
    );
    if (adapterCableRows.length > 0) sortedCableGrouped.set("Adapters", adapterCableRows);
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
