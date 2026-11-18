import type { ReactFlowInstance } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { ConnectionEdge, SignalType } from "../types";
import type { RoutedEdge } from "../edgeRouter";
import { buildPrintPageLookup } from "../stubLabelResolve";
import { DxfWriter, type EntityStyle } from "./writer";
import { pxToIn } from "./units";
import { effectiveLineWidth, lineWidthToDxfLineweight } from "../lineWidth";
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
import { emitAnnotation, emitDevice, emitRoom, emitStubLabel } from "./nodes";
import { emitTitleBlock } from "./titleBlock";
import { emitLegend } from "./legend";

const PADDING_IN = 0.25;

/**
 * Build the DXF (R2004 / AC1018) text for the current schematic, or null when
 * there is nothing to draw. Split out from the download so the emitted document
 * — entity order in particular — can be inspected without a DOM.
 */
export function buildDxf(rfInstance: ReactFlowInstance): string | null {
  const state = useSchematicStore.getState();
  const { nodes, edges, routedEdges } = state;
  if (nodes.length === 0) return null;

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

  const drawnEdges: { edge: ConnectionEdge; routed: RoutedEdge; trueColor: number }[] = [];

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
      // Per-connection line width (#415) → nearest standard DXF lineweight; the default
      // 2px stays 0.25mm. Direct attach keeps 0.25mm as before (it has no width override).
      lineWeight: edge.data?.directAttach ? 25 : lineWidthToDxfLineweight(effectiveLineWidth(edge.data)),
    };

    emitEdgeGeometry(writer, routed, layer, entityStyle, allArcCrossings);
    drawnEdges.push({ edge, routed, trueColor });
  }

  // ─── Connection labels, in a pass of their own ──────────────────────
  // Every viewer that matters (AutoCAD, TrueView, LibreCAD) paints model-space
  // entities in database order, and layers carry no precedence of their own. So
  // a label written right after its own line still ends up UNDER the lines of
  // every edge emitted after it, and that line runs through the text (#298).
  // Draining the labels once all geometry is down puts them all on top; each
  // label also carries its own opaque chip, which is what masks the label's OWN
  // line — ordering can't help there, since the label sits on it by design.
  for (const { edge, routed, trueColor } of drawnEdges) {
    // A stub leg has exactly one endpoint on a stub-label node. That end's cable
    // ID is suppressed (the stub box names the connection there) and the custom
    // middle label is anchored to it, both matching the canvas (#201, #319).
    const stubEnd: "source" | "target" | null =
      stubNodeIds.has(edge.source) ? "source"
      : stubNodeIds.has(edge.target) ? "target"
      : null;
    emitCableIdLabels(
      writer, edge, routed,
      state.cableIdLabelMode, state.cableIdGap, state.cableIdMidOffset,
      trueColor, stubEnd,
    );
    emitCustomLabel(writer, edge, routed, trueColor, stubEnd);
  }

  // ─── Stub labels ────────────────────────────────────────────────────
  // After the legs for the same reason, and after the cable IDs because the box
  // is opaque on the canvas. The DXF used to skip these nodes entirely, leaving
  // the leg's cable ID as the only text at a stub end (#319).
  const pageAt = buildPrintPageLookup(state);
  for (const node of nodes) {
    if (node.type !== "stub-label") continue;
    emitStubLabel(writer, node, rfInstance, {
      nodes, edges, pageAt,
      // A hidden adapter reaches the DXF as its 1x1 placeholder — too small to carry so
      // much as its own name — so a tag naming it would be a dead end on paper too. The
      // tag names the device beyond it, exactly as the canvas does (#348).
      hiddenAdapterIds: state.hiddenAdapterNodeIds,
      // A cable-ID tag (#270) has to carry the same ID the leg is labelled with.
      cableIdMap: state.cableIdMap,
    }, {
      showArrow: state.stubLabelShowArrow,
      showPort: state.stubLabelShowPort,
      showRoom: state.stubLabelShowRoom,
      pageMode: state.stubLabelPageMode,
      signalColors: state.signalColors,
    });
  }

  // ─── Title block (if configured) ───────────────────────────────────
  // The Print View "Title Block" toggle (#388) hides it here too, like the page numbers.
  if (state.printTitleBlockEnabled !== false && state.titleBlock && state.titleBlockLayout) {
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

  return writer.toString();
}

/**
 * Export the current schematic as a DXF file and trigger a browser download.
 */
export function exportDxf(rfInstance: ReactFlowInstance) {
  const dxf = buildDxf(rfInstance);
  if (dxf === null) return;

  const blob = new Blob([dxf], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${useSchematicStore.getState().schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.dxf`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

