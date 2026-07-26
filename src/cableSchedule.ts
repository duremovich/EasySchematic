import type {
  SchematicNode,
  ConnectionEdge,
  SignalType,
  DistanceSettings,
  BundleMeta,
} from "./types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { getCableType } from "./cableTypes";
import { resolvePort, resolvePortLabel, getRoomLabel, escapeCsv, csvRow, groupBy } from "./packList";
import { transformLabelNow } from "./labelCaseUtils";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";
import type { DeviceData } from "./types";
import { getPatchSegments, resolvableHops, type PatchPointInfo } from "./patchCircuits";
// Room-distance estimation moved behind this shared helper (#100) — it backs both the
// schedule's computedLength column and the on-canvas cable-length badge.
import { computeEdgeLengthEstimate } from "./cableLengthLabel";

export interface CableScheduleDistanceContext {
  roomDistances?: Record<string, number>;
  distanceSettings?: DistanceSettings;
}

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
  /** Estimated cable length derived from room-to-room distance + slack (#146). */
  computedLength?: string;
  sourceRoom: string;
  targetRoom: string;
  multicableLabel: string;
  /** Bundle display name (custom label, else "Bundle N") — blank if not bundled. Each
   *  bundled member stays its own row; bundling never collapses physical cable counts. */
  bundle: string;
  /** Conductor gauge in AWG, free text (#P2-015). */
  gaugeAwg: string;
  /** Alternate / contractor cable name (#P2-023). */
  cableAlias: string;
  /** "✓" when the cable is marked tested/certified, with optional date appended (#P2-031). */
  tested: string;
  /** Raw cable use: "patch" | "field" | "" (#P2-019). */
  cableUse: string;
  /** Segment index for patched connections (0-based). Undefined for normal cables. */
  segIndex?: number;
  /** The parent connection's base cable ID (E001) when this row is a patch segment.
   *  recomputeCableIds persists THIS (not the suffixed id) onto edge.data.cableId. */
  baseCableId?: string;
}

/** Prefix letter for each signal type when using type-prefix cable naming */
const SIGNAL_PREFIX: Record<SignalType, string> = {
  sdi: "S",
  hdmi: "H",
  ndi: "N",
  dante: "D",
  avb: "AV",
  "analog-audio": "A",
  "speaker-level": "SPK",
  bluetooth: "BT",
  digilink: "DGL",
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
  "contact-closure": "CC",
  rs422: "RS",
  rs485: "RS5",
  serial: "SL",
  thunderbolt: "TB",
  composite: "CO",
  "component-video": "CV",
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
  dsnake: "DS",
  dxlink: "DL",
  gps: "GPS",
  dars: "DA",
  rtmp: "RM",
  rtsp: "RP",
  "mpeg-ts": "MT",
  ebus: "EB",
  "control-voltage": "VC",
  "extron-exp": "EX",
  pots: "PT",
  "blu-link": "BL",
  cresnet: "CN",
  nlight: "NL",
  sensor: "SNS",
  custom: "X",
};

export function computeCableSchedule(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  namingScheme: "sequential" | "type-prefix" = "sequential",
  distanceContext?: CableScheduleDistanceContext,
  bundles?: Record<string, BundleMeta>,
): CableScheduleRow[] {
  // Bundle display names: a bundle is real only with >=2 members. Custom label wins,
  // else a stable "Bundle N" numbered by first appearance in edge order. Members each
  // keep their own row (the count is never collapsed) — this is just a grouping label.
  const bundleMemberCounts = new Map<string, number>();
  for (const e of edges) {
    const bid = e.data?.bundleId;
    if (bid) bundleMemberCounts.set(bid, (bundleMemberCounts.get(bid) ?? 0) + 1);
  }
  const bundleDisplay = new Map<string, string>();
  let bundleSeq = 0;
  for (const e of edges) {
    const bid = e.data?.bundleId;
    if (!bid || bundleDisplay.has(bid) || (bundleMemberCounts.get(bid) ?? 0) < 2) continue;
    bundleSeq += 1;
    bundleDisplay.set(bid, bundles?.[bid]?.label?.trim() || `Bundle ${bundleSeq}`);
  }
  const bundleOf = (e: ConnectionEdge): string => bundleDisplay.get(e.data?.bundleId ?? "") ?? "";
  // For stubbed connections (split into 2 stub-leg edges sharing a linkedConnectionId),
  // emit ONE row per logical cable using the source-side leg as canonical and following
  // through to the target-side leg to find the real target device. The target-side leg
  // is skipped — its cable ID gets attached via recomputeCableIds in store.ts.
  const linkedPartner = new Map<string, ConnectionEdge>();
  for (const e of edges) {
    const link = e.data?.linkedConnectionId;
    if (!link) continue;
    const partner = edges.find((p) => p.id !== e.id && p.data?.linkedConnectionId === link);
    if (partner) linkedPartner.set(e.id, partner);
  }
  const isSourceLeg = (e: ConnectionEdge): boolean => {
    const src = nodes.find((n) => n.id === e.source);
    return src?.type !== "stub-label";
  };

  const connections = edges
    .filter((e) => e.data?.signalType && !e.data?.directAttach)
    // For linked pairs, only process the source-side leg (the one whose source is a real device).
    .filter((e) => !e.data?.linkedConnectionId || isSourceLeg(e))
    .map((e) => {
      // For a source-side leg of a linked pair, follow the partner to find the real target device.
      const partner = linkedPartner.get(e.id);
      const effectiveTargetEdge = partner ?? e;
      const srcNode = nodes.find((n) => n.id === e.source);
      const tgtNode = nodes.find((n) => n.id === effectiveTargetEdge.target);
      const signalType = e.data!.signalType as SignalType;
      const srcPort = resolvePort(srcNode, e.sourceHandle);
      const tgtPort = resolvePort(tgtNode, effectiveTargetEdge.targetHandle);
      const computedLength = computeRowEstimatedLength(
        srcNode?.parentId,
        tgtNode?.parentId,
        nodes,
        distanceContext,
      );

      const sourceDevice = srcNode?.type === "device"
        ? transformLabelNow((srcNode.data as DeviceData).label)
        : "Unknown";
      const sourcePort = srcNode ? resolvePortLabel(srcNode, e.sourceHandle) : "";
      const sourceConnector = srcPort?.connectorType
        ? (CONNECTOR_LABELS[srcPort.connectorType] ?? "—")
        : "—";
      const targetDevice = tgtNode?.type === "device"
        ? transformLabelNow((tgtNode.data as DeviceData).label)
        : "Unknown";
      const targetPort = tgtNode ? resolvePortLabel(tgtNode, effectiveTargetEdge.targetHandle) : "";
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
        gaugeAwg: (e.data?.gaugeAwg as string | undefined) ?? "",
        cableAlias: (e.data?.cableAlias as string | undefined) ?? "",
        cableUse: (e.data?.cableUse as string | undefined) ?? "",
        tested: e.data?.tested
          ? (e.data?.testedDate ? `✓ ${e.data.testedDate as string}` : "✓")
          : "",
        multicableLabel: (e.data?.multicableLabel as string) ?? "",
        bundle: bundleOf(e),
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
        computedLength,
      };
    });

  // Preserve edge array order (creation order) for stable cable numbering.
  //
  // Stored cable IDs are PERMANENT (users print labels / reference them in paperwork —
  // see recomputeCableIds in store.ts, which persists generated IDs onto edge data).
  // Generated numbers must therefore never collide with a stored ID, and must not
  // recycle a deleted cable's number into a gap: each prefix continues from the highest
  // number in use (max+1), whether that number came from generation or a user edit.
  const usedNumbers = new Map<string, number>();
  const noteUsed = (prefix: string, n: number) => {
    if (n > (usedNumbers.get(prefix) ?? 0)) usedNumbers.set(prefix, n);
  };
  for (const c of connections) {
    const m = c.storedCableId?.match(/^([A-Z]+)(\d+)$/);
    if (m) noteUsed(m[1], Number(m[2]));
  }
  const nextId = (prefix: string): string => {
    const n = (usedNumbers.get(prefix) ?? 0) + 1;
    noteUsed(prefix, n);
    return `${prefix}${String(n).padStart(3, "0")}`;
  };

  let rows: CableScheduleRow[];
  if (namingScheme === "type-prefix") {
    // Per-type counters for type-prefix naming (e.g. S001, S002, E001)
    rows = connections.map((c) => {
      const prefix = SIGNAL_PREFIX[c.rawSignalType] ?? "X";
      return {
        edgeId: c.edgeId,
        cableId: c.storedCableId || nextId(prefix),
        sourceDevice: c.sourceDevice,
        sourcePort: c.sourcePort,
        sourceConnector: c.sourceConnector,
        targetDevice: c.targetDevice,
        targetPort: c.targetPort,
        targetConnector: c.targetConnector,
        cableType: c.cableType,
        signalType: c.signalType,
        cableLength: c.storedCableLength,
        computedLength: c.computedLength,
        sourceRoom: c.sourceRoom,
        targetRoom: c.targetRoom,
        multicableLabel: c.multicableLabel,
        bundle: c.bundle,
        gaugeAwg: c.gaugeAwg,
        cableAlias: c.cableAlias,
        tested: c.tested,
        cableUse: c.cableUse,
      };
    });
    return expandPatchedRows(rows, nodes, edges, linkedPartner);
  }

  rows = connections.map((c) => ({
    edgeId: c.edgeId,
    cableId: c.storedCableId || nextId("C"),
    sourceDevice: c.sourceDevice,
    sourcePort: c.sourcePort,
    sourceConnector: c.sourceConnector,
    targetDevice: c.targetDevice,
    targetPort: c.targetPort,
    targetConnector: c.targetConnector,
    cableType: c.cableType,
    signalType: c.signalType,
    cableLength: c.storedCableLength,
    computedLength: c.computedLength,
    sourceRoom: c.sourceRoom,
    targetRoom: c.targetRoom,
    multicableLabel: c.multicableLabel,
    bundle: c.bundle,
    gaugeAwg: c.gaugeAwg,
    cableAlias: c.cableAlias,
    tested: c.tested,
    cableUse: c.cableUse,
  }));
  return expandPatchedRows(rows, nodes, edges, linkedPartner);
}

/** Replace each patched connection's single row with one row per physical segment
 *  (device → panel, panel → panel, panel → device). Endpoint labels reuse the base
 *  row's already-reconciled values, so stub-split edges (whose real target was resolved
 *  through the linked partner leg upstream) stay correct without re-deriving here. */
function expandPatchedRows(
  rows: CableScheduleRow[],
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  linkedPartner: Map<string, ConnectionEdge>,
): CableScheduleRow[] {
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const out: CableScheduleRow[] = [];
  for (const row of rows) {
    const edge = edgeById.get(row.edgeId);
    if (!edge || resolvableHops(edge, nodes).length === 0) { out.push(row); continue; }

    const effectiveTargetEdge = linkedPartner.get(edge.id) ?? edge;
    const srcPoint: PatchPointInfo = {
      kind: "device", nodeId: edge.source, label: row.sourceDevice,
      portLabel: row.sourcePort, room: row.sourceRoom,
      port: resolvePort(nodes.find((n) => n.id === edge.source), edge.sourceHandle),
    };
    const tgtPoint: PatchPointInfo = {
      kind: "device", nodeId: effectiveTargetEdge.target, label: row.targetDevice,
      portLabel: row.targetPort, room: row.targetRoom,
      port: resolvePort(nodes.find((n) => n.id === effectiveTargetEdge.target), effectiveTargetEdge.targetHandle),
    };

    const signalType = (edge.data?.signalType ?? "custom") as SignalType;
    const segs = getPatchSegments(edge, nodes, row.cableId, srcPoint, tgtPoint);
    for (const seg of segs) {
      out.push({
        ...row,
        segIndex: seg.index,
        baseCableId: row.cableId,
        cableId: seg.label,
        sourceDevice: seg.from.label,
        sourcePort: seg.from.portLabel,
        sourceConnector: seg.from.port?.connectorType
          ? (CONNECTOR_LABELS[seg.from.port.connectorType] ?? "—") : "—",
        targetDevice: seg.to.label,
        targetPort: seg.to.portLabel,
        targetConnector: seg.to.port?.connectorType
          ? (CONNECTOR_LABELS[seg.to.port.connectorType] ?? "—") : "—",
        cableType: getCableType(seg.from.port, seg.to.port, signalType),
        // The connection's whole-run length can't be attributed to any single physical
        // segment — lengths are per-segment overrides here. The edge-level value is
        // preserved on the connection and reappears if it's unpatched.
        cableLength: seg.cableLength,
        // Room-distance estimates are whole-run, endpoint-room based; panel-adjacent
        // segments can't reuse them — leave blank rather than mislead.
        computedLength: "",
        sourceRoom: seg.from.room,
        targetRoom: seg.to.room,
      });
    }
  }
  return out;
}

function computeRowEstimatedLength(
  sourceParentId: string | undefined,
  targetParentId: string | undefined,
  nodes: SchematicNode[],
  ctx: CableScheduleDistanceContext | undefined,
): string | undefined {
  return computeEdgeLengthEstimate(
    sourceParentId,
    targetParentId,
    nodes,
    ctx?.roomDistances,
    ctx?.distanceSettings,
  );
}

/** Build the cable-schedule CSV file contents (including the UTF-8 BOM). */
export function buildCableScheduleCsv(
  rows: CableScheduleRow[],
  schematicName: string,
  generatedDate: string = new Date().toLocaleDateString(),
): string {
  const lines: string[] = [];

  lines.push(`Cable Schedule — ${escapeCsv(schematicName)}`);
  lines.push(`Generated ${generatedDate}`);
  lines.push("");

  lines.push(csvRow([
    "Cable ID", "Source", "Src Port", "Src Conn",
    "Target", "Tgt Port", "Tgt Conn",
    "Cable Type", "Signal", "Length", "Est. Length",
    "Gauge (AWG)", "Alias", "Tested", "Use",
    "Src Room", "Tgt Room", "Snake", "Bundle",
  ]));
  for (const r of rows) {
    lines.push(csvRow([
      r.cableId, r.sourceDevice, r.sourcePort, r.sourceConnector,
      r.targetDevice, r.targetPort, r.targetConnector,
      r.cableType, r.signalType, r.cableLength, r.computedLength ?? "",
      r.gaugeAwg, r.cableAlias, r.tested,
      r.cableUse ? r.cableUse.charAt(0).toUpperCase() + r.cableUse.slice(1) : "",
      r.sourceRoom, r.targetRoom, r.multicableLabel, r.bundle,
    ]));
  }

  return "﻿" + lines.join("\n");
}

export function exportCableScheduleCsv(
  rows: CableScheduleRow[],
  schematicName: string,
): void {
  const blob = new Blob([buildCableScheduleCsv(rows, schematicName)], { type: "text/csv;charset=utf-8;" });
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
    computedLength: r.computedLength ?? "",
    gaugeAwg: r.gaugeAwg,
    cableAlias: r.cableAlias,
    tested: r.tested,
    cableUse: r.cableUse ? r.cableUse.charAt(0).toUpperCase() + r.cableUse.slice(1) : "",
    sourceRoom: r.sourceRoom,
    targetRoom: r.targetRoom,
    multicableLabel: r.multicableLabel,
    bundle: r.bundle,
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
  } else if (groupByKey === "bundle") {
    groupedRows = groupBy(sorted, (r) => r.bundle || "Unbundled");
  }

  return [
    {
      id: "cableSchedule",
      rows: sorted,
      groupedRows,
    },
  ];
}
