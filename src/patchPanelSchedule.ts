import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
} from "./types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { computeCableSchedule } from "./cableSchedule";
import { resolvePort, resolvePortLabel, getRoomLabel, escapeCsv, csvRow, groupBy } from "./packList";
import { resolvePortGender } from "./connectorTypes";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";

export interface PatchPanelScheduleRow {
  /** Device node id, for stable secondary sort only. */
  panelId: string;
  /** Synthesized row id: `${panelId}:${portId}`. */
  rowId: string;
  /** Matching edge id if the port is connected. */
  edgeId: string;
  panel: string;
  panelRoom: string;
  /** "Rear" for input, "Front" for output, "Both" for bidirectional (rare). */
  face: string;
  /** Numeric sort key: face priority (Rear=0, Front=1) * 10000 + position index. */
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
  multicableLabel: string;
}

const EMPTY = "—";

/** Build a per-port row for every patch panel in the schematic. */
export function computePatchPanelSchedule(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  namingScheme: "sequential" | "type-prefix" = "sequential",
): PatchPanelScheduleRow[] {
  // Lookup cable IDs + gender-aware cable labels from the cable schedule so the same edge
  // shows the same cable ID and type in both reports.
  const cableRows = computeCableSchedule(nodes, edges, namingScheme);
  const cableByEdge = new Map(cableRows.map((r) => [r.edgeId, r]));

  // Index edges by (nodeId, portId). Strip -in/-out suffixes so bidirectional handles
  // match the underlying port. Each port id maps to at most one edge in practice
  // (the canvas can create only one connection per handle), but we store an array in
  // case of future-proofing.
  const edgeByPort = new Map<string, ConnectionEdge[]>();
  const key = (nodeId: string, handleId: string | null | undefined) => {
    if (!handleId) return undefined;
    const portId = handleId.replace(/-(in|out)$/, "");
    return `${nodeId}:${portId}`;
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
    if (data.deviceType !== "patch-panel") continue;

    const panelLabel = data.label || "Unnamed Panel";
    const panelRoom = getRoomLabel(nodes, node.parentId);
    const hiddenPorts = new Set(data.hiddenPorts ?? []);

    // Walk ports in their stored order so Rear (input) ports come before Front (output)
    // ports naturally when the template was built with the `patchPanelPorts` helper.
    data.ports.forEach((port, portIdx) => {
      if (hiddenPorts.has(port.id)) return;

      const face =
        port.direction === "input" ? "Rear"
        : port.direction === "output" ? "Front"
        : "Both";
      const facePri = face === "Rear" ? 0 : face === "Front" ? 1 : 2;

      const connector = port.connectorType
        ? (CONNECTOR_LABELS[port.connectorType] ?? port.connectorType)
        : EMPTY;
      const g = resolvePortGender(port);
      const gender = g === "male" ? "M" : g === "female" ? "F" : EMPTY;

      const edgeCandidates = edgeByPort.get(`${node.id}:${port.id}`) ?? [];
      // Prefer an edge whose signal type matches this port, in case a port somehow has
      // multiple edges after a migration.
      const edge = edgeCandidates[0];

      let edgeId = "";
      let remoteDevice = EMPTY;
      let remotePort = EMPTY;
      let remoteRoom = EMPTY;
      let cableId = "";
      let cableType = "";
      let signalType = "";
      let cableLength = "";
      let multicableLabel = "";

      if (edge) {
        edgeId = edge.id;
        const isSource = edge.source === node.id;
        const remoteNodeId = isSource ? edge.target : edge.source;
        const remoteHandle = isSource ? edge.targetHandle : edge.sourceHandle;
        const remoteNode = nodes.find((n) => n.id === remoteNodeId);
        remoteDevice = remoteNode?.type === "device"
          ? ((remoteNode.data as DeviceData).label || "Unnamed")
          : "Unknown";
        remotePort = remoteNode ? resolvePortLabel(remoteNode, remoteHandle) : "";
        remoteRoom = remoteNode ? getRoomLabel(nodes, remoteNode.parentId) : "Unknown";

        const cableRow = cableByEdge.get(edge.id);
        if (cableRow) {
          cableId = cableRow.cableId;
          cableType = cableRow.cableType;
          signalType = cableRow.signalType;
          cableLength = cableRow.cableLength;
          multicableLabel = cableRow.multicableLabel;
        } else {
          // Fallback — edge exists but cable schedule excluded it (e.g. missing signal type).
          signalType = edge.data?.signalType
            ? (SIGNAL_LABELS[edge.data.signalType as keyof typeof SIGNAL_LABELS] ?? (edge.data.signalType as string))
            : "";
          cableLength = (edge.data?.cableLength as string | undefined) ?? "";
        }

        // Resolve remote port gender-aware cable label already included via cable schedule.
        void resolvePort; // (kept to avoid unused import if gender computation moves)
      } else if (port.signalType) {
        // Unconnected: leave most remote-side fields blank but carry the port's own
        // signal type for display/filtering.
        signalType = SIGNAL_LABELS[port.signalType] ?? port.signalType;
      }

      rows.push({
        panelId: node.id,
        rowId: `${node.id}:${port.id}`,
        edgeId,
        panel: panelLabel,
        panelRoom,
        face,
        _sortKey: facePri * 10000 + portIdx,
        position: port.label || `Port ${portIdx + 1}`,
        connector,
        gender,
        remoteDevice,
        remotePort,
        remoteRoom,
        cableId,
        cableType,
        signalType,
        cableLength,
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

export function exportPatchPanelScheduleCsv(
  rows: PatchPanelScheduleRow[],
  schematicName: string,
): void {
  const lines: string[] = [];

  lines.push(`Patch Panel Schedule — ${escapeCsv(schematicName)}`);
  lines.push(`Generated ${new Date().toLocaleDateString()}`);
  lines.push("");

  lines.push(csvRow([
    "Panel", "Panel Room", "Face", "Position", "Connector", "Gender",
    "Remote Device", "Remote Port", "Remote Room",
    "Cable ID", "Cable Type", "Signal", "Length", "Snake",
  ]));
  for (const r of rows) {
    lines.push(csvRow([
      r.panel, r.panelRoom, r.face, r.position, r.connector, r.gender,
      r.remoteDevice === EMPTY ? "" : r.remoteDevice,
      r.remotePort === EMPTY ? "" : r.remotePort,
      r.remoteRoom === EMPTY ? "" : r.remoteRoom,
      r.cableId, r.cableType, r.signalType, r.cableLength, r.multicableLabel,
    ]));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Patch Panel Schedule.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getPatchPanelScheduleTableData(
  rows: PatchPanelScheduleRow[],
  layout: ReportLayout,
): ReportTableData[] {
  const tableDef = layout.tables.find((t) => t.id === "patchPanelSchedule");

  const tableRows = rows.map((r) => ({
    panel: r.panel,
    panelRoom: r.panelRoom,
    face: r.face,
    position: r.position,
    connector: r.connector,
    gender: r.gender,
    remoteDevice: r.remoteDevice,
    remotePort: r.remotePort,
    remoteRoom: r.remoteRoom,
    cableId: r.cableId,
    cableType: r.cableType,
    signalType: r.signalType,
    cableLength: r.cableLength,
    multicableLabel: r.multicableLabel,
  }));

  const sortBy = tableDef?.sortBy;
  const sortDir = tableDef?.sortDir;
  let sorted = tableRows;
  if (sortBy && sortBy !== "position") {
    const dir = sortDir === "desc" ? -1 : 1;
    sorted = [...tableRows].sort((a, b) => {
      const va = a[sortBy as keyof typeof a] ?? "";
      const vb = b[sortBy as keyof typeof b] ?? "";
      return va.localeCompare(vb) * dir;
    });
  }
  // "position" sort uses the natural rear-then-front-by-index order from compute().

  const groupByKey = tableDef?.groupBy;
  let groupedRows: Map<string, Record<string, string>[]> | undefined;
  if (groupByKey === "panel") {
    groupedRows = groupBy(sorted, (r) => r.panel);
  } else if (groupByKey === "panelRoom") {
    groupedRows = groupBy(sorted, (r) => r.panelRoom);
  } else if (groupByKey === "signalType") {
    groupedRows = groupBy(sorted, (r) => r.signalType || "Unconnected");
  } else if (groupByKey === "face") {
    groupedRows = groupBy(sorted, (r) => r.face);
  }

  return [
    {
      id: "patchPanelSchedule",
      rows: sorted,
      groupedRows,
    },
  ];
}
