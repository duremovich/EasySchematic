import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
} from "./types";
import { computeCableSchedule, type CableScheduleDistanceContext } from "./cableSchedule";
import { resolvePort, resolvePortLabel, getRoomLabel, escapeCsv, csvRow } from "./packList";
import { PATCH_PANEL_SCHEDULE_COLUMNS } from "./patchPanelColumns";
import { effectiveSignalType, resolvePortGender } from "./connectorTypes";
import { getPanelOccupancy, segmentsForEdge } from "./patchCircuits";
import { getCableType } from "./cableTypes";
import type { SignalType } from "./types";
import { transformLabelNow } from "./labelCaseUtils";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";
import { connectorLabel, signalLabel } from "./typeRegistry";

export interface PatchPanelScheduleRow {
  /** Device node id, for stable secondary sort only. */
  panelId: string;
  /** Synthesized row id: `${panelId}:${portId}`. */
  rowId: string;
  /** Matching edge id if the port is connected. Passthrough rows may have two edges;
   *  this holds the rear edge id (or front if only front is connected). */
  edgeId: string;
  panel: string;
  panelRoom: string;
  /** "Rear" for input, "Front" for output, "Both" for bidirectional, "Passthrough" for passthrough circuits. */
  face: string;
  /** Numeric sort key: face priority (Rear=0, Front=1, Passthrough=2) * 10000 + position index. */
  _sortKey: number;
  /** Port label (e.g. "Port 12"). */
  position: string;
  connector: string;
  /** "M" / "F" / "—". */
  gender: string;
  remoteDevice: string;
  remotePort: string;
  remoteRoom: string;
  cableId: string;
  cableType: string;
  signalType: string;
  cableLength: string;
  /** Estimated cable length derived from room-to-room distance + slack (#146). */
  computedLength: string;
  multicableLabel: string;

  // ── Passthrough-only fields (populated when face === "Passthrough") ──────────
  /** Rear-face connector label. */
  rearConnector?: string;
  /** Rear-face gender. */
  rearGender?: string;
  rearRemoteDevice?: string;
  rearRemotePort?: string;
  rearRemoteRoom?: string;
  rearCableId?: string;
  rearCableType?: string;
  rearCableLength?: string;
  rearComputedLength?: string;
  /** Front-face connector label. */
  frontConnector?: string;
  /** Front-face gender. */
  frontGender?: string;
  frontRemoteDevice?: string;
  frontRemotePort?: string;
  frontRemoteRoom?: string;
  frontCableId?: string;
  frontCableType?: string;
  frontCableLength?: string;
  frontComputedLength?: string;
  /** Normalling type. Always "None" in v1 — field reserved for future use. */
  normalling?: string;
}

const EMPTY = "—";

/** Column ids for the single-face fields (Connector, M/F, Remote Device, Remote Port,
 *  Remote Room, and the bare cable columns Cable ID / Cable Type / Length / Est. Length /
 *  Snake). These are always empty on passthrough rows (see below) and only populate via
 *  the legacy paired input/output back-compat path — passthrough rows report through the
 *  rear-/front-face columns instead — so a report made entirely of passthrough panels can
 *  never fill them (#311). */
export const PATCH_PANEL_LEGACY_COLUMN_IDS = [
  "connector", "gender", "remoteDevice", "remotePort", "remoteRoom",
  "cableId", "cableType", "cableLength", "computedLength", "multicableLabel",
] as const;

export type PatchPanelLegacyColumnId = (typeof PATCH_PANEL_LEGACY_COLUMN_IDS)[number];

/** True when at least one row is a legacy paired-port row (face !== "Passthrough"), i.e.
 *  when the single-face columns above can actually hold data. */
function hasLegacyPatchPanelRow(rows: Pick<PatchPanelScheduleRow, "face">[]): boolean {
  return rows.some((r) => r.face !== "Passthrough");
}

/** Which Patch Panel Schedule columns the table should hide, given the rows currently in
 *  view and the document's stored per-table preference. `stored` is undefined when the
 *  user has never touched the column picker, in which case the single-face columns hide
 *  themselves unless a legacy row is in view. Any stored array — including an empty one,
 *  meaning "show everything" — is an explicit choice and wins (#311). */
export function resolvePatchPanelHiddenColumns(
  rows: Pick<PatchPanelScheduleRow, "face">[],
  stored: string[] | undefined,
): Set<string> {
  if (stored) return new Set(stored);
  return hasLegacyPatchPanelRow(rows) ? new Set<string>() : new Set<string>(PATCH_PANEL_LEGACY_COLUMN_IDS);
}

interface SideInfo {
  edgeId: string;
  remoteDevice: string;
  remotePort: string;
  remoteRoom: string;
  cableId: string;
  cableType: string;
  cableLength: string;
  computedLength: string;
}

/** Resolve remote-device info for one side of a passthrough port (rear or front). */
function resolveSide(
  nodeId: string,
  portId: string,
  side: "rear" | "front",
  edges: ConnectionEdge[],
  nodes: SchematicNode[],
  cableByEdge: Map<string, { cableId: string; cableType: string; cableLength: string; computedLength?: string }>,
): SideInfo {
  const handleSuffix = `${portId}-${side}`;
  const edge = edges.find(
    (e) =>
      (e.source === nodeId && e.sourceHandle === handleSuffix) ||
      (e.target === nodeId && e.targetHandle === handleSuffix),
  );
  if (!edge) {
    return { edgeId: "", remoteDevice: EMPTY, remotePort: EMPTY, remoteRoom: EMPTY, cableId: "", cableType: "", cableLength: "", computedLength: "" };
  }
  const isSource = edge.source === nodeId;
  const remoteNodeId = isSource ? edge.target : edge.source;
  const remoteHandle = isSource ? edge.targetHandle : edge.sourceHandle;
  const remoteNode = nodes.find((n) => n.id === remoteNodeId);
  const remoteDevice = remoteNode?.type === "device"
    ? transformLabelNow((remoteNode.data as DeviceData).label || "Unnamed")
    : "Unknown";
  const remotePort = remoteNode ? resolvePortLabel(remoteNode, remoteHandle) : "";
  const remoteRoom = remoteNode ? getRoomLabel(nodes, remoteNode.parentId) : "Unknown";
  const cableRow = cableByEdge.get(edge.id);
  return {
    edgeId: edge.id,
    remoteDevice,
    remotePort,
    remoteRoom,
    cableId: cableRow?.cableId ?? "",
    cableType: cableRow?.cableType ?? "",
    cableLength: cableRow?.cableLength ?? (edge.data?.cableLength as string | undefined) ?? "",
    computedLength: cableRow?.computedLength ?? "",
  };
}

/** Build a per-port row for every patch panel in the schematic. */
export function computePatchPanelSchedule(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  namingScheme: "sequential" | "type-prefix" = "sequential",
  distanceContext?: CableScheduleDistanceContext,
): PatchPanelScheduleRow[] {
  // Lookup cable IDs + gender-aware cable labels from the cable schedule so the same edge
  // shows the same cable ID and type in both reports.
  const cableRows = computeCableSchedule(nodes, edges, namingScheme, distanceContext);
  // First row per edge wins: patched edges emit one row per physical segment, and the
  // wired-edge lookups below want the edge's canonical (first/base) row.
  const cableByEdge = new Map<string, (typeof cableRows)[number]>();
  for (const r of cableRows) if (!cableByEdge.has(r.edgeId)) cableByEdge.set(r.edgeId, r);

  // Metadata patch-hop occupancy (panels routed via edge.data.patchHops, incl. off-canvas panels).
  const hopOccupancy = getPanelOccupancy(nodes, edges);

  // Index edges by (nodeId, portId). The legacy paired input/output branch below reads
  // this index with the port's own id, so the key has to be the id of the port the handle
  // really names — resolve it rather than blind-stripping the -in/-out/-rear/-front
  // suffix, which missed every port whose real id ends in one of those tokens (#355).
  // Each port id maps to at most one edge in practice (the canvas can create only one
  // connection per handle), but we store an array in case of future-proofing.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeByPort = new Map<string, ConnectionEdge[]>();
  const key = (nodeId: string, handleId: string | null | undefined) => {
    if (!handleId) return undefined;
    const port = resolvePort(nodeById.get(nodeId), handleId);
    return `${nodeId}:${port?.id ?? handleId}`;
  };
  for (const e of edges) {
    if (e.data?.directAttach) continue;
    const sk = key(e.source, e.sourceHandle);
    const tk = key(e.target, e.targetHandle);
    if (sk) {
      const arr = edgeByPort.get(sk);
      if (arr) arr.push(e); else edgeByPort.set(sk, [e]);
    }
    if (tk) {
      const arr = edgeByPort.get(tk);
      if (arr) arr.push(e); else edgeByPort.set(tk, [e]);
    }
  }

  const rows: PatchPanelScheduleRow[] = [];

  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.deviceType !== "patch-panel" && !data.ports.some((p) => p.direction === "passthrough")) continue;

    const panelLabel = transformLabelNow(data.label || "Unnamed Panel");
    const panelRoom = getRoomLabel(nodes, node.parentId);
    const hiddenPorts = new Set(data.hiddenPorts ?? []);

    // Walk ports in their stored order so Rear (input) ports come before Front (output)
    // ports naturally when the template was built with the `patchPanelPorts` helper.
    data.ports.forEach((port, portIdx) => {
      if (hiddenPorts.has(port.id)) return;

      // ── Passthrough circuit: one row with split rear/front columns ──────────
      if (port.direction === "passthrough") {
        let rear = resolveSide(node.id, port.id, "rear", edges, nodes, cableByEdge);
        let front = resolveSide(node.id, port.id, "front", edges, nodes, cableByEdge);

        // Hop-routed (metadata) occupancy fills faces that aren't physically wired —
        // this is how off-canvas panels and "route via panel" assignments surface here.
        const occ = hopOccupancy.get(node.id)?.get(port.id);
        let hopSignal: SignalType | undefined;
        if (occ?.kind === "hop" && (!rear.edgeId || !front.edgeId)) {
          const hopEdge = edges.find((e) => e.id === occ.edgeId);
          if (hopEdge) {
            hopSignal = hopEdge.data?.signalType as SignalType | undefined;
            const baseRow = cableByEdge.get(hopEdge.id);
            const baseId = baseRow?.baseCableId ?? baseRow?.cableId
              ?? (hopEdge.data?.cableId as string | undefined) ?? "";
            const segs = segmentsForEdge(hopEdge, nodes, edges, baseId);
            const sigRaw = (hopEdge.data?.signalType ?? "custom") as SignalType;
            const inn = segs[occ.hopIndex];
            const outSeg = segs[occ.hopIndex + 1];
            if (!rear.edgeId && inn) {
              rear = {
                edgeId: hopEdge.id,
                remoteDevice: inn.from.label, remotePort: inn.from.portLabel, remoteRoom: inn.from.room,
                cableId: inn.label,
                cableType: getCableType(inn.from.port, inn.to.port, sigRaw),
                cableLength: inn.cableLength, computedLength: "",
              };
            }
            if (!front.edgeId && outSeg) {
              front = {
                edgeId: hopEdge.id,
                remoteDevice: outSeg.to.label, remotePort: outSeg.to.portLabel, remoteRoom: outSeg.to.room,
                cableId: outSeg.label,
                cableType: getCableType(outSeg.from.port, outSeg.to.port, sigRaw),
                cableLength: outSeg.cableLength, computedLength: "",
              };
            }
          }
        }

        const rearConnectorType = port.rearConnectorType ?? port.connectorType;
        const frontConnectorType = port.frontConnectorType ?? port.connectorType;
        const rearConnector = rearConnectorType ? connectorLabel(rearConnectorType) : EMPTY;
        const frontConnector = frontConnectorType ? connectorLabel(frontConnectorType) : EMPTY;

        // Gender: passthrough ports have per-face overrides
        const rearG = port.rearGender ?? resolvePortGender({ ...port, connectorType: rearConnectorType, direction: "input" });
        const frontG = port.frontGender ?? resolvePortGender({ ...port, connectorType: frontConnectorType, direction: "output" });
        const rearGender = rearG === "male" ? "M" : rearG === "female" ? "F" : EMPTY;
        const frontGender = frontG === "male" ? "M" : frontG === "female" ? "F" : EMPTY;

        // effectiveSignalType resolves from WIRED edges only; a hop-only port inherits
        // its signal from the hop edge instead.
        const resolvedSignal = hopSignal ?? effectiveSignalType(port, node.id, edges);
        const signalType = signalLabel(resolvedSignal);

        const edgeId = rear.edgeId || front.edgeId;

        rows.push({
          panelId: node.id,
          rowId: `${node.id}:${port.id}`,
          edgeId,
          panel: panelLabel,
          panelRoom,
          face: "Passthrough",
          _sortKey: 2 * 10000 + portIdx,
          position: transformLabelNow(port.label || `Port ${portIdx + 1}`),
          // Legacy single-face fields — set to EMPTY for passthrough rows; use rear/front fields instead.
          connector: EMPTY,
          gender: EMPTY,
          remoteDevice: EMPTY,
          remotePort: EMPTY,
          remoteRoom: EMPTY,
          cableId: "",
          cableType: "",
          signalType,
          cableLength: "",
          computedLength: "",
          multicableLabel: "",
          // Passthrough split fields
          rearConnector,
          rearGender,
          rearRemoteDevice: rear.remoteDevice,
          rearRemotePort: rear.remotePort,
          rearRemoteRoom: rear.remoteRoom,
          rearCableId: rear.cableId,
          rearCableType: rear.cableType,
          rearCableLength: rear.cableLength,
          rearComputedLength: rear.computedLength,
          frontConnector,
          frontGender,
          frontRemoteDevice: front.remoteDevice,
          frontRemotePort: front.remotePort,
          frontRemoteRoom: front.remoteRoom,
          frontCableId: front.cableId,
          frontCableType: front.cableType,
          frontCableLength: front.cableLength,
          frontComputedLength: front.computedLength,
          normalling: "None",
        });
        return;
      }

      // ── Legacy paired input/output ports (back-compat) ──────────────────────
      const face =
        port.direction === "input" ? "Rear"
        : port.direction === "output" ? "Front"
        : "Both";
      const facePri = face === "Rear" ? 0 : face === "Front" ? 1 : 2;

      const connector = port.connectorType
        ? connectorLabel(port.connectorType)
        : EMPTY;
      const g = resolvePortGender(port);
      const gender = g === "male" ? "M" : g === "female" ? "F" : EMPTY;

      const edgeCandidates = edgeByPort.get(`${node.id}:${port.id}`) ?? [];
      const edge = edgeCandidates[0];

      let edgeId = "";
      let remoteDevice = EMPTY;
      let remotePort = EMPTY;
      let remoteRoom = EMPTY;
      let cableId = "";
      let cableType = "";
      let signalType = "";
      let cableLength = "";
      let computedLength = "";
      let multicableLabel = "";

      if (edge) {
        edgeId = edge.id;
        const isSource = edge.source === node.id;
        const remoteNodeId = isSource ? edge.target : edge.source;
        const remoteHandle = isSource ? edge.targetHandle : edge.sourceHandle;
        const remoteNode = nodes.find((n) => n.id === remoteNodeId);
        remoteDevice = remoteNode?.type === "device"
          ? transformLabelNow((remoteNode.data as DeviceData).label || "Unnamed")
          : "Unknown";
        remotePort = remoteNode ? resolvePortLabel(remoteNode, remoteHandle) : "";
        remoteRoom = remoteNode ? getRoomLabel(nodes, remoteNode.parentId) : "Unknown";

        const cableRow = cableByEdge.get(edge.id);
        if (cableRow) {
          cableId = cableRow.cableId;
          cableType = cableRow.cableType;
          signalType = cableRow.signalType;
          cableLength = cableRow.cableLength;
          computedLength = cableRow.computedLength ?? "";
          multicableLabel = cableRow.multicableLabel;
        } else {
          signalType = edge.data?.signalType
            ? signalLabel(edge.data.signalType)
            : "";
          cableLength = (edge.data?.cableLength as string | undefined) ?? "";
        }

        void resolvePort; // (kept to avoid unused import if gender computation moves)
      } else if (port.signalType) {
        signalType = signalLabel(port.signalType);
      }

      rows.push({
        panelId: node.id,
        rowId: `${node.id}:${port.id}`,
        edgeId,
        panel: panelLabel,
        panelRoom,
        face,
        _sortKey: facePri * 10000 + portIdx,
        position: transformLabelNow(port.label || `Port ${portIdx + 1}`),
        connector,
        gender,
        remoteDevice,
        remotePort,
        remoteRoom,
        cableId,
        cableType,
        signalType,
        cableLength,
        computedLength,
        multicableLabel,
      });
    });
  }

  // Default order: by panel label, then by face (Rear before Front), then by port order.
  rows.sort((a, b) => {
    const byPanel = a.panel.localeCompare(b.panel);
    if (byPanel !== 0) return byPanel;
    const byPanelId = a.panelId.localeCompare(b.panelId);
    if (byPanelId !== 0) return byPanelId;
    return a._sortKey - b._sortKey;
  });

  return rows;
}

/**
 * Build the patch-panel-schedule CSV file contents (including the UTF-8 BOM).
 *
 * The CSV is deliberately the MAXIMAL export: every one of the 34 columns, every row, in a
 * fixed order, whatever the Patch Panels tab is filtered or sorted to and whichever columns
 * it has hidden. It is the machine-readable copy — a spreadsheet can hide and sort columns
 * itself, and a stable header row keeps downstream importers working. The PDF is the
 * WYSIWYG copy and mirrors the on-screen table instead (#362).
 */
export function buildPatchPanelScheduleCsv(
  rows: PatchPanelScheduleRow[],
  schematicName: string,
  generatedDate: string = new Date().toLocaleDateString(),
): string {
  const lines: string[] = [];

  lines.push(`Patch Panel Schedule — ${escapeCsv(schematicName)}`);
  lines.push(`Generated ${generatedDate}`);
  lines.push("");

  // Legacy columns (1-15) are unchanged from prior versions for back-compat.
  // Passthrough columns (16-34) are appended; legacy rows leave them empty.
  lines.push(csvRow([
    "Panel", "Panel Room", "Face", "Position", "Signal",
    "Connector", "M/F", "Remote Device", "Remote Port", "Remote Room", "Cable ID", "Cable Type", "Length", "Est. Length", "Snake",
    "Rear Connector", "Rear M/F", "Rear Remote Device", "Rear Remote Port", "Rear Remote Room", "Rear Cable ID", "Rear Cable Type", "Rear Length", "Rear Est. Length",
    "Front Connector", "Front M/F", "Front Remote Device", "Front Remote Port", "Front Remote Room", "Front Cable ID", "Front Cable Type", "Front Length", "Front Est. Length",
    "Normalling",
  ]));

  for (const r of rows) {
    if (r.face === "Passthrough") {
      lines.push(csvRow([
        r.panel, r.panelRoom, r.face, r.position, r.signalType,
        // Legacy columns empty for passthrough rows
        "", "", "", "", "", "", "", "", "", "",
        r.rearConnector ?? "", r.rearGender ?? "", r.rearRemoteDevice ?? "", r.rearRemotePort ?? "", r.rearRemoteRoom ?? "", r.rearCableId ?? "", r.rearCableType ?? "", r.rearCableLength ?? "", r.rearComputedLength ?? "",
        r.frontConnector ?? "", r.frontGender ?? "", r.frontRemoteDevice ?? "", r.frontRemotePort ?? "", r.frontRemoteRoom ?? "", r.frontCableId ?? "", r.frontCableType ?? "", r.frontCableLength ?? "", r.frontComputedLength ?? "",
        r.normalling ?? "None",
      ]));
    } else {
      lines.push(csvRow([
        r.panel, r.panelRoom, r.face, r.position, r.signalType,
        r.connector, r.gender,
        r.remoteDevice === EMPTY ? "" : r.remoteDevice,
        r.remotePort === EMPTY ? "" : r.remotePort,
        r.remoteRoom === EMPTY ? "" : r.remoteRoom,
        r.cableId, r.cableType, r.cableLength, r.computedLength, r.multicableLabel,
        // Passthrough columns empty for legacy rows
        "", "", "", "", "", "", "", "", "",
        "", "", "", "", "", "", "", "", "",
        "",
      ]));
    }
  }

  // UTF-8 BOM so Excel decodes the em-dash title / "✓" cells correctly (same
  // mojibake fix as the cable-schedule CSV from the v0.42 playtest)
  return "﻿" + lines.join("\n");
}

export function exportPatchPanelScheduleCsv(
  rows: PatchPanelScheduleRow[],
  schematicName: string,
): void {
  const blob = new Blob([buildPatchPanelScheduleCsv(rows, schematicName)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Patch Panel Schedule.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── On-screen view helpers ───────────────────────────────────────────────────
// The Patch Panels tab and the PDF table data below both run rows through these, so the
// printed report can't drift from the table the user is looking at (#362).

/** The row-level half of the tab's view state: the filter box and the "Hide empty" box. */
export interface PatchPanelRowFilter {
  filter?: string;
  hideUnconnected?: boolean;
}

/** Text of one cell, matching the table exactly — an em dash stands in for an empty. */
export function patchPanelCellText(row: PatchPanelScheduleRow, key: string): string {
  const value = (row as unknown as Record<string, unknown>)[key];
  return (typeof value === "string" ? value : "") || EMPTY;
}

/** The fields the tab's filter box searches. Deliberately narrower than the column list:
 *  the descriptive columns, not the M/F, estimated-length or normalling ones. */
const PATCH_PANEL_FILTER_FIELDS = [
  "panel", "panelRoom", "face", "position", "signalType",
  "connector", "remoteDevice", "remotePort", "remoteRoom",
  "cableId", "cableType", "cableLength", "computedLength", "multicableLabel",
  "rearConnector", "rearRemoteDevice", "rearRemotePort", "rearRemoteRoom", "rearCableId",
  "frontConnector", "frontRemoteDevice", "frontRemotePort", "frontRemoteRoom", "frontCableId",
] as const;

/** Rows left after the tab's filter box and its "Hide empty" checkbox. */
export function filterPatchPanelScheduleRows(
  rows: PatchPanelScheduleRow[],
  { filter = "", hideUnconnected = false }: PatchPanelRowFilter,
): PatchPanelScheduleRow[] {
  const list = hideUnconnected ? rows.filter((r) => r.edgeId !== "") : rows;
  const q = filter.trim().toLowerCase();
  if (!q) return list;
  return list.filter((r) =>
    PATCH_PANEL_FILTER_FIELDS.some((f) => (r[f] ?? "").toLowerCase().includes(q)),
  );
}

/** Rows in the tab's clicked sort order. "position" (or no sort) is the natural
 *  rear-then-front-by-index order from compute(), reversed for descending. */
export function sortPatchPanelScheduleRows(
  rows: PatchPanelScheduleRow[],
  sortBy: string | null | undefined,
  ascending: boolean,
): PatchPanelScheduleRow[] {
  const copy = [...rows];
  if (!sortBy || sortBy === "position") {
    if (!ascending) copy.reverse();
    return copy;
  }
  // sortBy is a plain string (a column key), so guard the read: the row also carries a
  // numeric _sortKey, and a non-string field would otherwise blow up in localeCompare.
  const cell = (r: PatchPanelScheduleRow): string => {
    const v = (r as unknown as Record<string, unknown>)[sortBy];
    return typeof v === "string" ? v : "";
  };
  copy.sort((a, b) => {
    const cmp = cell(a).localeCompare(cell(b));
    return ascending ? cmp : -cmp;
  });
  return copy;
}

/** Rows bucketed by the tab's Group by dropdown, in first-seen order. Undefined when the
 *  table isn't grouped. */
export function groupPatchPanelScheduleRows(
  rows: PatchPanelScheduleRow[],
  groupBy: string | null | undefined,
): Map<string, PatchPanelScheduleRow[]> | undefined {
  if (!groupBy) return undefined;
  const map = new Map<string, PatchPanelScheduleRow[]>();
  for (const r of rows) {
    const label = groupBy === "signalType"
      ? (r.signalType || "Unconnected")
      : patchPanelCellText(r, groupBy);
    const arr = map.get(label);
    if (arr) arr.push(r); else map.set(label, [r]);
  }
  return map;
}

/**
 * Table data for the Patch Panel Schedule PDF.
 *
 * WYSIWYG with the on-screen table (#362): the layout carries the tab's visible columns in
 * the tab's order (hidden ones, including the #311 auto-hidden single-face set, are simply
 * absent), its group-by and its clicked sort; `view` carries the tab's filter box and
 * "Hide empty" checkbox. Empty cells print the same em dash the table shows.
 */
export function getPatchPanelScheduleTableData(
  rows: PatchPanelScheduleRow[],
  layout: ReportLayout,
  view: PatchPanelRowFilter = {},
): ReportTableData[] {
  const tableDef = layout.tables.find((t) => t.id === "patchPanelSchedule");
  const visibleKeys = tableDef
    ? tableDef.columns.filter((c) => c.visible).map((c) => c.key)
    : PATCH_PANEL_SCHEDULE_COLUMNS.map((c) => c.key);

  const inView = filterPatchPanelScheduleRows(rows, view);
  const sorted = sortPatchPanelScheduleRows(inView, tableDef?.sortBy, tableDef?.sortDir !== "desc");
  const grouped = groupPatchPanelScheduleRows(sorted, tableDef?.groupBy);

  const project = (r: PatchPanelScheduleRow): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const key of visibleKeys) out[key] = patchPanelCellText(r, key);
    return out;
  };

  return [
    {
      id: "patchPanelSchedule",
      rows: sorted.map(project),
      groupedRows: grouped
        ? new Map([...grouped].map(([label, list]) => [label, list.map(project)]))
        : undefined,
    },
  ];
}
