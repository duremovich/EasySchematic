import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
} from "./types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { computeCableSchedule, type CableScheduleDistanceContext } from "./cableSchedule";
import { resolvePort, resolvePortLabel, getRoomLabel, escapeCsv, csvRow, groupBy } from "./packList";
import { effectiveSignalType, resolvePortGender } from "./connectorTypes";
import { getPanelOccupancy, segmentsForEdge } from "./patchCircuits";
import { getCableType } from "./cableTypes";
import type { SignalType } from "./types";
import { transformLabelNow } from "./labelCaseUtils";
import type { ReportLayout } from "./reportLayout";
import type { ReportTableData } from "./reportPdf";

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

  // Index edges by (nodeId, portId). Strip -in/-out suffixes so bidirectional handles
  // match the underlying port. Each port id maps to at most one edge in practice
  // (the canvas can create only one connection per handle), but we store an array in
  // case of future-proofing.
  const edgeByPort = new Map<string, ConnectionEdge[]>();
  const key = (nodeId: string, handleId: string | null | undefined) => {
    if (!handleId) return undefined;
    const portId = handleId.replace(/-(in|out|rear|front)$/, "");
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
        const rearConnector = rearConnectorType ? (CONNECTOR_LABELS[rearConnectorType] ?? rearConnectorType) : EMPTY;
        const frontConnector = frontConnectorType ? (CONNECTOR_LABELS[frontConnectorType] ?? frontConnectorType) : EMPTY;

        // Gender: passthrough ports have per-face overrides
        const rearG = port.rearGender ?? resolvePortGender({ ...port, connectorType: rearConnectorType, direction: "input" });
        const frontG = port.frontGender ?? resolvePortGender({ ...port, connectorType: frontConnectorType, direction: "output" });
        const rearGender = rearG === "male" ? "M" : rearG === "female" ? "F" : EMPTY;
        const frontGender = frontG === "male" ? "M" : frontG === "female" ? "F" : EMPTY;

        // effectiveSignalType resolves from WIRED edges only; a hop-only port inherits
        // its signal from the hop edge instead.
        const resolvedSignal = hopSignal ?? effectiveSignalType(port, node.id, edges);
        const signalType = SIGNAL_LABELS[resolvedSignal] ?? resolvedSignal;

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
        ? (CONNECTOR_LABELS[port.connectorType] ?? port.connectorType)
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
            ? (SIGNAL_LABELS[edge.data.signalType as keyof typeof SIGNAL_LABELS] ?? (edge.data.signalType as string))
            : "";
          cableLength = (edge.data?.cableLength as string | undefined) ?? "";
        }

        void resolvePort; // (kept to avoid unused import if gender computation moves)
      } else if (port.signalType) {
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

/** Build the patch-panel-schedule CSV file contents (including the UTF-8 BOM). */
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
    computedLength: r.computedLength,
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
