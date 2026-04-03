import type {
  SchematicNode,
  ConnectionEdge,
  SignalType,
} from "./types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { getCableType } from "./cableTypes";
import { resolvePort, resolvePortLabel, getRoomLabel, escapeCsv, csvRow, groupBy } from "./packList";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";
import type { DeviceData } from "./types";

export interface CableScheduleRow {
  edgeId: string;
  cableId: string;
  sourceDevice: string;
  sourcePort: string;
  sourceConnector: string;
  targetDevice: string;
  targetPort: string;
  targetConnector: string;
  cableType: string;
  signalType: string;
  cableLength: string;
  sourceRoom: string;
  targetRoom: string;
  multicableLabel: string;
}

/** Prefix letter for each signal type when using type-prefix cable naming */
const SIGNAL_PREFIX: Record<SignalType, string> = {
  sdi: "S",
  hdmi: "H",
  ndi: "N",
  dante: "D",
  "analog-audio": "A",
  aes: "AE",
  dmx: "DX",
  madi: "MA",
  usb: "U",
  ethernet: "E",
  fiber: "F",
  displayport: "DP",
  hdbaset: "HB",
  srt: "SR",
  genlock: "G",
  gpio: "GP",
  rs422: "RS",
  serial: "SL",
  thunderbolt: "TB",
  composite: "CO",
  "s-video": "SV",
  vga: "V",
  dvi: "D",
  power: "P",
  "power-l1": "PL1",
  "power-l2": "PL2",
  "power-l3": "PL3",
  "power-neutral": "PN",
  "power-ground": "PG",
  midi: "MI",
  tally: "TL",
  spdif: "SP",
  adat: "AD",
  ultranet: "UN",
  aes50: "A5",
  stageconnect: "SC",
  wordclock: "WC",
  aes67: "A7",
  ydif: "YD",
  rf: "RF",
  st2110: "21",
  artnet: "AN",
  sacn: "SC",
  ir: "IR",
  timecode: "TC",
  gigaace: "GA",
  dx5: "DX",
  slink: "SL",
  soundgrid: "SG",
  fibreace: "FA",
  dxlink: "DL",
  custom: "X",
};

export function computeCableSchedule(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  namingScheme: "sequential" | "type-prefix" = "sequential",
): CableScheduleRow[] {
  const connections = edges
    .filter((e) => e.data?.signalType && !e.data?.directAttach)
    .map((e) => {
      const srcNode = nodes.find((n) => n.id === e.source);
      const tgtNode = nodes.find((n) => n.id === e.target);
      const signalType = e.data!.signalType as SignalType;
      const srcPort = resolvePort(srcNode, e.sourceHandle);
      const tgtPort = resolvePort(tgtNode, e.targetHandle);

      const sourceDevice = srcNode?.type === "device"
        ? (srcNode.data as DeviceData).label
        : "Unknown";
      const sourcePort = srcNode ? resolvePortLabel(srcNode, e.sourceHandle) : "";
      const sourceConnector = srcPort?.connectorType
        ? (CONNECTOR_LABELS[srcPort.connectorType] ?? "—")
        : "—";
      const targetDevice = tgtNode?.type === "device"
        ? (tgtNode.data as DeviceData).label
        : "Unknown";
      const targetPort = tgtNode ? resolvePortLabel(tgtNode, e.targetHandle) : "";
      const targetConnector = tgtPort?.connectorType
        ? (CONNECTOR_LABELS[tgtPort.connectorType] ?? "—")
        : "—";
      const sourceRoom = srcNode ? getRoomLabel(nodes, srcNode.parentId) : "Unknown";
      const targetRoom = tgtNode ? getRoomLabel(nodes, tgtNode.parentId) : "Unknown";

      return {
        edgeId: e.id,
        rawSignalType: signalType,
        storedCableId: e.data?.cableId as string | undefined,
        storedCableLength: (e.data?.cableLength as string | undefined) ?? "",
        multicableLabel: (e.data?.multicableLabel as string) ?? "",
        sourceDevice,
        sourcePort,
        sourceConnector,
        targetDevice,
        targetPort,
        targetConnector,
        cableType: getCableType(srcPort, tgtPort, signalType),
        signalType: SIGNAL_LABELS[signalType],
        sourceRoom,
        targetRoom,
      };
    });

  // Preserve edge array order (creation order) for stable cable numbering

  if (namingScheme === "type-prefix") {
    // Per-type counters for type-prefix naming (e.g. S001, S002, E001)
    const counters = new Map<string, number>();
    return connections.map((c) => {
      const prefix = SIGNAL_PREFIX[c.rawSignalType] ?? "X";
      const count = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, count);
      return {
        edgeId: c.edgeId,
        cableId: c.storedCableId || `${prefix}${String(count).padStart(3, "0")}`,
        sourceDevice: c.sourceDevice,
        sourcePort: c.sourcePort,
        sourceConnector: c.sourceConnector,
        targetDevice: c.targetDevice,
        targetPort: c.targetPort,
        targetConnector: c.targetConnector,
        cableType: c.cableType,
        signalType: c.signalType,
        cableLength: c.storedCableLength,
        sourceRoom: c.sourceRoom,
        targetRoom: c.targetRoom,
        multicableLabel: c.multicableLabel,
      };
    });
  }

  return connections.map((c, i) => ({
    edgeId: c.edgeId,
    cableId: c.storedCableId || `C${String(i + 1).padStart(3, "0")}`,
    sourceDevice: c.sourceDevice,
    sourcePort: c.sourcePort,
    sourceConnector: c.sourceConnector,
    targetDevice: c.targetDevice,
    targetPort: c.targetPort,
    targetConnector: c.targetConnector,
    cableType: c.cableType,
    signalType: c.signalType,
    cableLength: c.storedCableLength,
    sourceRoom: c.sourceRoom,
    targetRoom: c.targetRoom,
    multicableLabel: c.multicableLabel,
  }));
}

export function exportCableScheduleCsv(
  rows: CableScheduleRow[],
  schematicName: string,
): void {
  const lines: string[] = [];

  lines.push(`Cable Schedule — ${escapeCsv(schematicName)}`);
  lines.push(`Generated ${new Date().toLocaleDateString()}`);
  lines.push("");

  lines.push(csvRow([
    "Cable ID", "Source", "Src Port", "Src Conn",
    "Target", "Tgt Port", "Tgt Conn",
    "Cable Type", "Signal", "Length",
    "Src Room", "Tgt Room", "Snake",
  ]));
  for (const r of rows) {
    lines.push(csvRow([
      r.cableId, r.sourceDevice, r.sourcePort, r.sourceConnector,
      r.targetDevice, r.targetPort, r.targetConnector,
      r.cableType, r.signalType, r.cableLength,
      r.sourceRoom, r.targetRoom, r.multicableLabel,
    ]));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Cable Schedule.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getCableScheduleTableData(
  rows: CableScheduleRow[],
  layout: ReportLayout,
): ReportTableData[] {
  const tableDef = layout.tables.find((t) => t.id === "cableSchedule");

  const tableRows = rows.map((r) => ({
    cableId: r.cableId,
    sourceDevice: r.sourceDevice,
    sourcePort: r.sourcePort,
    sourceConnector: r.sourceConnector,
    targetDevice: r.targetDevice,
    targetPort: r.targetPort,
    targetConnector: r.targetConnector,
    cableType: r.cableType,
    signalType: r.signalType,
    cableLength: r.cableLength,
    sourceRoom: r.sourceRoom,
    targetRoom: r.targetRoom,
    multicableLabel: r.multicableLabel,
  }));

  // Sorting
  const sortBy = tableDef?.sortBy;
  const sortDir = tableDef?.sortDir;
  let sorted = tableRows;
  if (sortBy) {
    const dir = sortDir === "desc" ? -1 : 1;
    sorted = [...tableRows].sort((a, b) => {
      const va = a[sortBy as keyof typeof a] ?? "";
      const vb = b[sortBy as keyof typeof b] ?? "";
      return va.localeCompare(vb) * dir;
    });
  }

  // Grouping
  const groupByKey = tableDef?.groupBy;
  let groupedRows: Map<string, Record<string, string>[]> | undefined;
  if (groupByKey === "sourceRoom") {
    groupedRows = groupBy(sorted, (r) => r.sourceRoom);
  } else if (groupByKey === "signalType") {
    groupedRows = groupBy(sorted, (r) => r.signalType);
  } else if (groupByKey === "cableType") {
    groupedRows = groupBy(sorted, (r) => r.cableType);
  } else if (groupByKey === "multicableLabel") {
    groupedRows = groupBy(sorted, (r) => r.multicableLabel || "Ungrouped");
  }

  return [
    {
      id: "cableSchedule",
      rows: sorted,
      groupedRows,
    },
  ];
}
