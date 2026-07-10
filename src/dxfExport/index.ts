import type { ReactFlowInstance } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { SignalType } from "../types";
import { DxfWriter, type EntityStyle } from "./writer";
import { pxToIn } from "./units";
import {
  buildLayerDefs,
  CANONICAL_LAYERS,
  hexToTrueColor,
  LTYPE_DEFS,
  lineStyleToLtype,
  resolveSignalColor,
  signalLayerName,
} from "./layers";
import {
  collectAllArcCrossings,
  emitCableIdLabels,
  emitCustomLabel,
  emitEdgeGeometry,
  resolveLineStyle,
} from "./geometry";
import { emitAnnotation, emitDevice, emitRoom } from "./nodes";
import { emitTitleBlock } from "./titleBlock";
import { emitLegend } from "./legend";

const PADDING_IN = 0.25;

/**
 * Export the current schematic as a DXF (R2000 / AC1015) file and trigger a
 * browser download.
 */
export function exportDxf(rfInstance: ReactFlowInstance) {
  const state = useSchematicStore.getState();
  const { nodes, edges, routedEdges } = state;
  if (nodes.length === 0) return;

  const writer = new DxfWriter();

  // ─── Compute extents in inch-space ─────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const internal = rfInstance.getInternalNode(node.id);
    if (!internal) continue;
    const ax = internal.internals.positionAbsolute.x;
    const ay = internal.internals.positionAbsolute.y;
    const w = node.measured?.width ?? 144;
    const h = node.measured?.height ?? 64;
    const x1 = pxToIn(ax), x2 = pxToIn(ax + w);
    const y1 = -pxToIn(ay), y2 = -pxToIn(ay + h);
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 10; maxY = 10;
  }
  const extMin = { x: minX - PADDING_IN, y: minY - PADDING_IN };
  const extMax = { x: maxX + PADDING_IN, y: maxY + PADDING_IN };
  writer.setExtents(extMin, extMax);

  // ─── Collect signal types actually in use ──────────────────────────
  const usedSignalTypes = new Set<SignalType>();
  for (const edge of edges) {
    if (edge.data?.signalType) usedSignalTypes.add(edge.data.signalType);
  }

  const layerDefs = buildLayerDefs(usedSignalTypes, state.signalColors);

  // ─── Emit header sections ──────────────────────────────────────────
  writer.writeHeader();
  writer.writeClasses();
  writer.writeTables(layerDefs, LTYPE_DEFS);
  writer.writeBlocks();
  writer.startEntities();

  // ─── Rooms (fill + outline + label) ─────────────────────────────────
  for (const node of nodes) {
    if (node.type === "room") emitRoom(writer, node, rfInstance);
  }

  // ─── Devices ────────────────────────────────────────────────────────
  for (const node of nodes) {
    if (node.type === "device") emitDevice(writer, node, rfInstance, edges, state.signalColors, state.currency, { useShortNames: state.useShortNames, wrapDeviceLabels: state.wrapDeviceLabels });
  }

  // ─── Annotations ────────────────────────────────────────────────────
  for (const node of nodes) {
    if (node.type === "annotation") emitAnnotation(writer, node, rfInstance);
  }

  // ─── Connection lines (with hops + per-edge line style) ─────────────
  const allArcCrossings = collectAllArcCrossings(routedEdges);
  const stubNodeIds = new Set(nodes.filter((n) => n.type === "stub-label").map((n) => n.id));

  for (const edge of edges) {
    const routed = routedEdges[edge.id];
    if (!routed) continue;
    const sig = edge.data?.signalType;
    const layer = sig ? signalLayerName(sig) : CANONICAL_LAYERS.DEFAULT;
    const hex = sig ? resolveSignalColor(sig, state.signalColors) : "#000000";
    const trueColor = hexToTrueColor(hex);
    const lineStyle = resolveLineStyle(edge, state.signalLineStyles);
    let linetype = lineStyleToLtype(lineStyle);
    if (edge.data?.connectorMismatch && !edge.data?.allowIncompatible) {
      linetype = "ES_MISMATCH";
    }

    const entityStyle: EntityStyle = {
      trueColor,
      linetype,
      lineWeight: 25,
    };

    emitEdgeGeometry(writer, routed, layer, entityStyle, allArcCrossings);

    // Labels (cable ID + custom)
    emitCableIdLabels(
      writer, edge, routed,
      state.cableIdLabelMode, state.cableIdGap, state.cableIdMidOffset,
      trueColor,
    );
    // A stub leg has exactly one endpoint on a stub-label node; anchor the
    // custom middle label to that end so it matches the canvas (#201).
    const stubEnd: "source" | "target" | null =
      stubNodeIds.has(edge.source) ? "source"
      : stubNodeIds.has(edge.target) ? "target"
      : null;
    emitCustomLabel(writer, edge, routed, trueColor, stubEnd);
  }

  // ─── Title block (if configured) ───────────────────────────────────
  if (state.titleBlock && state.titleBlockLayout) {
    const hasContent = Object.values(state.titleBlock).some(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    if (hasContent) {
      emitTitleBlock(writer, state.titleBlock, state.titleBlockLayout, extMin, extMax);
    }
  }

  // ─── Legend (if enabled) ───────────────────────────────────────────
  if (state.colorKeyEnabled) {
    emitLegend(
      writer,
      edges,
      state.signalColors,
      state.signalLineStyles,
      state.colorKeyOverrides,
      extMin,
      extMax,
      state.colorKeyColumns ?? 2,
    );
  }

  // ─── Close out ──────────────────────────────────────────────────────
  writer.endEntities();
  writer.writeObjects();
  writer.writeEof();

  // ─── Download ───────────────────────────────────────────────────────
  const blob = new Blob([writer.toString()], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${state.schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.dxf`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

