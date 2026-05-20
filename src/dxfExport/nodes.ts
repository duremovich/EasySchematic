import type { ReactFlowInstance } from "@xyflow/react";
import type {
  AnnotationData,
  ConnectionEdge,
  DeviceData,
  RoomData,
  SchematicNode,
  SignalType,
} from "../types";
import type { DxfWriter, EntityStyle } from "./writer";
import { cssFontPxToDxfHeight, pxToIn, tintToWhite, hexToRgb, rgbToTrueColor, truncateToWidth } from "./units";
import { CANONICAL_LAYERS, hexToTrueColor, lineStyleToLtype, resolveSignalColor } from "./layers";
import {
  auxBlockHeight,
  auxRowHeight,
  headerBandHeight,
  HEADER_LABEL_ZONE_PX,
  HEADER_LABEL_ZONE_2_PX,
  resolveAuxiliaryLine,
  rowsInSlot,
} from "../auxiliaryData";
import { transformLabelNow } from "../labelCaseUtils";
import { resolveDeviceLabel, type SchematicDisplayDefaults } from "../displayName";
import {
  EXTERNAL_ENDPOINT_HEIGHT,
  estimateExternalEndpointWidth,
  isExternalEndpointData,
} from "../externalEndpoint";

/** Matches Tailwind `rounded-lg` on the canvas DeviceNode (8px = 0.083"). */
const DEVICE_CORNER_RADIUS_IN = 8 / 96;

interface HandlePos {
  id: string;
  absX: number;
  absY: number;
}

function getHandlePositions(
  node: SchematicNode,
  rfInstance: ReactFlowInstance,
): HandlePos[] {
  const internal = rfInstance.getInternalNode(node.id);
  if (!internal) return [];
  const absX = internal.internals.positionAbsolute.x;
  const absY = internal.internals.positionAbsolute.y;
  const bounds = internal.internals.handleBounds;
  const result: HandlePos[] = [];
  for (const handle of bounds?.source ?? []) {
    if (handle.id) {
      result.push({
        id: handle.id,
        absX: absX + handle.x + handle.width / 2,
        absY: absY + handle.y + handle.height / 2,
      });
    }
  }
  for (const handle of bounds?.target ?? []) {
    if (handle.id) {
      result.push({
        id: handle.id,
        absX: absX + handle.x + handle.width / 2,
        absY: absY + handle.y + handle.height / 2,
      });
    }
  }
  return result;
}

/** Convert screen-px rect to DXF-inch rect (Y flipped, bottom-left origin). */
function toDxfRect(ax: number, ay: number, w: number, h: number) {
  return {
    x: pxToIn(ax),
    y: -pxToIn(ay + h),
    w: pxToIn(w),
    h: pxToIn(h),
  };
}

/** Emit a room: tinted fill + dashed border + label. */
export function emitRoom(
  writer: DxfWriter,
  node: SchematicNode,
  rfInstance: ReactFlowInstance,
) {
  if (node.type !== "room") return;
  const internal = rfInstance.getInternalNode(node.id);
  if (!internal) return;
  const data = node.data as RoomData;
  const ax = internal.internals.positionAbsolute.x;
  const ay = internal.internals.positionAbsolute.y;
  const w = node.measured?.width ?? 400;
  const h = node.measured?.height ?? 300;
  const rect = toDxfRect(ax, ay, w, h);

  // Fill (tinted)
  if (data.color) {
    const tinted = tintToWhite(data.color, 0.85);
    const tc = hexToTrueColor(tinted);
    writer.addSolidHatchRect(CANONICAL_LAYERS.ROOMS_FILL, rect.x, rect.y, rect.w, rect.h, {
      trueColor: tc,
    });
  }

  // Border
  const borderLt =
    data.borderStyle === "solid" ? "CONTINUOUS" :
    data.borderStyle === "dotted" ? "ES_DOTTED" :
    "ES_DASHED";
  const borderStyle: EntityStyle = { linetype: borderLt };
  if (data.borderColor) {
    borderStyle.trueColor = hexToTrueColor(data.borderColor);
  } else if (data.color) {
    borderStyle.trueColor = hexToTrueColor(data.color);
  }
  writer.addRect(CANONICAL_LAYERS.ROOMS, rect.x, rect.y, rect.w, rect.h, borderStyle);

  // Label — just inside the top-left corner
  if (data.label) {
    const labelSize = data.labelSize ?? 14;
    const heightIn = cssFontPxToDxfHeight(labelSize);
    writer.addText(
      CANONICAL_LAYERS.LABELS,
      rect.x + pxToIn(8),
      rect.y + rect.h - pxToIn(labelSize + 4),
      data.label.toUpperCase(),
      {
        height: heightIn,
        align: "left",
        style: borderStyle.trueColor !== undefined
          ? { trueColor: borderStyle.trueColor }
          : undefined,
      },
    );
  }
}

/** Emit a device: box + header fill + labels + ports + section separators. */
export function emitDevice(
  writer: DxfWriter,
  node: SchematicNode,
  rfInstance: ReactFlowInstance,
  edges: ConnectionEdge[],
  signalColors: Partial<Record<SignalType, string>> | undefined,
  currency = "USD",
  schematicDefaults: SchematicDisplayDefaults = {},
) {
  if (node.type !== "device") return;
  const internal = rfInstance.getInternalNode(node.id);
  if (!internal) return;
  const data = node.data as DeviceData;
  if (isExternalEndpointData(data) && data.ports.length === 1) {
    emitExternalEndpoint(writer, node, internal.internals.positionAbsolute.x, internal.internals.positionAbsolute.y);
    return;
  }
  const ax = internal.internals.positionAbsolute.x;
  const ay = internal.internals.positionAbsolute.y;
  const w = node.measured?.width ?? 180;
  const h = node.measured?.height ?? 80;
  const rect = toDxfRect(ax, ay, w, h);

  const handles = getHandlePositions(node, rfInstance);

  // Header band — merged name strip + header aux rows. Height is 20-multiple (min 40),
  // matching DeviceNode's headerBandHeight() so the DXF export tracks the canvas layout.
  const headerRows = rowsInSlot(data.auxiliaryData, "header");
  const resolvedLabel = resolveDeviceLabel(data, schematicDefaults);
  const labelZone = resolvedLabel.wrap ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  const bandH = headerBandHeight(data.auxiliaryData, labelZone);
  const headerContent = labelZone + headerRows.reduce((s, r) => s + auxRowHeight(r), 0);
  const headerPad = bandH - headerContent;
  const headerPadTop = Math.floor(headerPad / 2);
  const headerRect = toDxfRect(ax, ay, w, bandH);
  if (data.headerColor) {
    writer.addSolidHatchRect(
      CANONICAL_LAYERS.DEVICES_HEADER,
      headerRect.x, headerRect.y, headerRect.w, headerRect.h,
      { trueColor: hexToTrueColor(data.headerColor) },
    );
  }

  // Device outer box (rounded to match canvas `rounded-lg`)
  writer.addRoundedRect(
    CANONICAL_LAYERS.DEVICES,
    rect.x, rect.y, rect.w, rect.h,
    DEVICE_CORNER_RADIUS_IN,
  );

  // Header separator (bottom edge of the band)
  writer.addLine(
    CANONICAL_LAYERS.DEVICES,
    rect.x, rect.y + rect.h - pxToIn(bandH),
    rect.x + rect.w, rect.y + rect.h - pxToIn(bandH),
  );

  // Canvas uses `px-3` (12px each side). Match exactly or text will spill past the box.
  const HEADER_PAD_PX = 12;
  const labelAvailIn = rect.w - pxToIn(HEADER_PAD_PX * 2);
  const auxTextHeight = cssFontPxToDxfHeight(9);

  // Device label — sits in the label zone at the top of the band (below pt pad).
  // Baseline near the bottom of the zone keeps the text visually inside the zone.
  // DXF doesn't support multi-line wrap; even with wrap=on we emit a single (possibly truncated) line.
  if (resolvedLabel.text) {
    const labelHeight = cssFontPxToDxfHeight(12);
    const labelBaselineY = ay + headerPadTop + labelZone - 4;
    writer.addText(
      CANONICAL_LAYERS.LABELS,
      pxToIn(ax + w / 2),
      -pxToIn(labelBaselineY),
      truncateToWidth(transformLabelNow(resolvedLabel.text), labelAvailIn, labelHeight),
      { height: labelHeight, align: "center" },
    );
  }

  // Header aux rows — flow directly below the label zone, inside the same band.
  {
    let cursor = ay + headerPadTop + labelZone;
    for (const row of headerRows) {
      const rowH = auxRowHeight(row);
      if (row.text.trim()) {
        const resolved = transformLabelNow(resolveAuxiliaryLine(row.text, data, { currency }));
        if (resolved) {
          writer.addText(
            CANONICAL_LAYERS.LABELS,
            pxToIn(ax + w / 2),
            -pxToIn(cursor + rowH - 2),
            truncateToWidth(resolved, labelAvailIn, auxTextHeight),
            {
              height: auxTextHeight,
              align: "center",
              style: { trueColor: rgbToTrueColor(120, 120, 120) },
            },
          );
        }
      }
      cursor += rowH;
    }
  }

  // Footer aux block — still its own grid-aligned block at the device bottom.
  const renderFooterAux = () => {
    const rows = rowsInSlot(data.auxiliaryData, "footer");
    if (rows.length === 0) return;
    const blockH = auxBlockHeight(data.auxiliaryData);
    const rawH = 1 + rows.reduce((sum, r) => sum + auxRowHeight(r), 0);
    const extraPad = blockH - rawH;
    const padTop = Math.floor(extraPad / 2);
    const blockTopY = ay + h - blockH;
    writer.addLine(
      CANONICAL_LAYERS.DEVICES,
      rect.x, -pxToIn(blockTopY),
      rect.x + rect.w, -pxToIn(blockTopY),
    );
    let cursor = blockTopY + 1 + padTop;
    for (const row of rows) {
      const rowH = auxRowHeight(row);
      if (row.text.trim()) {
        const resolved = transformLabelNow(resolveAuxiliaryLine(row.text, data, { currency }));
        if (resolved) {
          writer.addText(
            CANONICAL_LAYERS.LABELS,
            pxToIn(ax + w / 2),
            -pxToIn(cursor + rowH - 2),
            truncateToWidth(resolved, labelAvailIn, auxTextHeight),
            {
              height: auxTextHeight,
              align: "center",
              style: { trueColor: rgbToTrueColor(120, 120, 120) },
            },
          );
        }
      }
      cursor += rowH;
    }
  };
  renderFooterAux();

  // Port labels
  const portMap = new Map(data.ports.map((p) => [p.id, p]));
  const connectedHandles = new Set<string>();
  for (const e of edges) {
    if (e.source === node.id && e.sourceHandle) connectedHandles.add(e.sourceHandle);
    if (e.target === node.id && e.targetHandle) connectedHandles.add(e.targetHandle);
  }
  const bidirLabeled = new Set<string>();
  const portTextHeight = cssFontPxToDxfHeight(10); // matches canvas text-[10px]

  for (const hp of handles) {
    let portId = hp.id;
    if (portId.endsWith("-in") || portId.endsWith("-out")) portId = portId.replace(/-(in|out)$/, "");
    else if (portId.endsWith("-rear") || portId.endsWith("-front")) portId = portId.replace(/-(rear|front)$/, "");
    const port = portMap.get(portId);
    if (!port) continue;

    const hex = resolveSignalColor(port.signalType, signalColors);
    const [r, g, b] = hexToRgb(hex);
    const style: EntityStyle = { trueColor: rgbToTrueColor(r, g, b) };

    const labelY = hp.absY;

    if (port.direction === "bidirectional") {
      if (bidirLabeled.has(portId)) continue;
      const inH = `${portId}-in`, outH = `${portId}-out`;
      const connectedOut = connectedHandles.has(outH);
      const connectedIn = connectedHandles.has(inH);
      const onRight = connectedOut && !connectedIn;
      emitPortLabel(writer, transformLabelNow(port.label), ax, w, labelY, onRight, portTextHeight, style);
      bidirLabeled.add(portId);
    } else {
      const isLeft = port.direction === "input" ? !port.flipped : !!port.flipped;
      emitPortLabel(writer, transformLabelNow(port.label), ax, w, labelY, !isLeft, portTextHeight, style);
    }
  }

  // Section separators
  const portsWithHandles: { portId: string; section: string | undefined; direction: string; handleY: number }[] = [];
  for (const port of data.ports) {
    const hid = port.direction === "bidirectional" ? `${port.id}-in` : port.id;
    const hp = handles.find((h) => h.id === hid);
    if (hp) portsWithHandles.push({ portId: port.id, section: port.section, direction: port.direction, handleY: hp.absY });
  }
  for (const dir of ["input", "output", "bidirectional"] as const) {
    const list = portsWithHandles.filter((p) => p.direction === dir);
    let lastSec: string | undefined;
    for (const { section, handleY } of list) {
      if (section && section !== lastSec && lastSec !== undefined) {
        const sepY = -pxToIn(handleY - 6);
        const sepStyle: EntityStyle = { linetype: "ES_DASHED" };
        if (dir === "input") {
          writer.addLine(CANONICAL_LAYERS.DEVICES, rect.x, sepY, rect.x + rect.w / 2, sepY, sepStyle);
          writer.addText(CANONICAL_LAYERS.LABELS, rect.x + pxToIn(4), sepY + pxToIn(1), section, { height: cssFontPxToDxfHeight(8) });
        } else if (dir === "output") {
          writer.addLine(CANONICAL_LAYERS.DEVICES, rect.x + rect.w / 2, sepY, rect.x + rect.w, sepY, sepStyle);
          writer.addText(CANONICAL_LAYERS.LABELS, rect.x + rect.w - pxToIn(4), sepY + pxToIn(1), section, { height: cssFontPxToDxfHeight(8), align: "right" });
        } else {
          writer.addLine(CANONICAL_LAYERS.DEVICES, rect.x, sepY, rect.x + rect.w, sepY, sepStyle);
          writer.addText(CANONICAL_LAYERS.LABELS, rect.x + rect.w / 2, sepY + pxToIn(1), section, { height: cssFontPxToDxfHeight(8), align: "center" });
        }
      }
      lastSec = section;
    }
  }
}

function emitExternalEndpoint(
  writer: DxfWriter,
  node: SchematicNode,
  ax: number,
  ay: number,
) {
  if (node.type !== "device") return;
  const data = node.data as DeviceData;
  const port = data.ports[0];
  const signalHex = resolveSignalColor(port?.signalType ?? "custom", undefined);
  const [r, g, b] = hexToRgb(signalHex);
  const rect = toDxfRect(
    ax,
    ay,
    node.measured?.width ?? (node.width as number) ?? (node.style?.width as number) ?? estimateExternalEndpointWidth(data.label, port?.direction),
    node.measured?.height ?? (node.height as number) ?? (node.style?.height as number) ?? EXTERNAL_ENDPOINT_HEIGHT,
  );
  const directionPrefix =
    port?.direction === "input" ? "← "
    : port?.direction === "output" ? "→ "
    : port?.direction === "passthrough" ? "⇔ "
    : "↔ ";

  writer.addRoundedRect(
    CANONICAL_LAYERS.DEVICES,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    Math.min(DEVICE_CORNER_RADIUS_IN, rect.h / 2),
    { trueColor: rgbToTrueColor(r, g, b) },
  );

  writer.addText(
    CANONICAL_LAYERS.LABELS,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2 - pxToIn(1),
    truncateToWidth(`${directionPrefix}${data.label}`, rect.w - pxToIn(8), cssFontPxToDxfHeight(9)),
    {
      height: cssFontPxToDxfHeight(9),
      align: "center",
      vAlign: "middle",
    },
  );
}

function emitPortLabel(
  writer: DxfWriter,
  text: string,
  nodeAx: number,
  nodeW: number,
  labelY: number,
  onRight: boolean,
  heightIn: number,
  style: EntityStyle,
) {
  // Each port label lives in one half of the device (its own column). Cap
  // the width so long labels get "…" instead of spilling into the middle
  // of the box or past the opposite edge.
  const halfWidthIn = pxToIn(nodeW / 2) - pxToIn(10);
  const clipped = truncateToWidth(text, halfWidthIn, heightIn);
  if (onRight) {
    writer.addText(
      CANONICAL_LAYERS.PORTS,
      pxToIn(nodeAx + nodeW - 8),
      -pxToIn(labelY + 2),
      clipped,
      { height: heightIn, align: "right", style },
    );
  } else {
    writer.addText(
      CANONICAL_LAYERS.PORTS,
      pxToIn(nodeAx + 8),
      -pxToIn(labelY + 2),
      clipped,
      { height: heightIn, align: "left", style },
    );
  }
}

/** Parse a CSS fill color (hex or rgba) to a DXF true-color integer, ignoring alpha. */
function annotationFillToTrueColor(color: string): number {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color.trim());
  if (m) return rgbToTrueColor(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
  return hexToTrueColor(color);
}

/** Emit an annotation (rectangle, ellipse, circle, diamond, or triangle). */
export function emitAnnotation(
  writer: DxfWriter,
  node: SchematicNode,
  rfInstance: ReactFlowInstance,
) {
  if (node.type !== "annotation") return;
  const internal = rfInstance.getInternalNode(node.id);
  if (!internal) return;
  const data = node.data as AnnotationData;
  const ax = internal.internals.positionAbsolute.x;
  const ay = internal.internals.positionAbsolute.y;
  const w = node.measured?.width ?? 100;
  const h = node.measured?.height ?? 80;
  const rect = toDxfRect(ax, ay, w, h);

  const borderStyle: EntityStyle = {};
  if (data.borderColor) borderStyle.trueColor = hexToTrueColor(data.borderColor);
  if (data.borderStyle) borderStyle.linetype = lineStyleToLtype(data.borderStyle);

  if (data.shape === "ellipse" || data.shape === "circle") {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const majorRadius = data.shape === "circle" ? Math.min(rect.w, rect.h) / 2 : rect.w / 2;
    const ratio = data.shape === "circle" ? 1 : Math.min(1, rect.h / rect.w);
    if (data.color) {
      writer.addSolidHatchEllipse(
        CANONICAL_LAYERS.ANNOTATIONS_FILL,
        cx, cy, majorRadius, 0, ratio,
        { trueColor: annotationFillToTrueColor(data.color) },
      );
    }
    writer.addEllipse(CANONICAL_LAYERS.ANNOTATIONS, cx, cy, majorRadius, 0, ratio, borderStyle);
  } else if (data.shape === "diamond") {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const pts = [
      { x: cx, y: rect.y },
      { x: rect.x + rect.w, y: cy },
      { x: cx, y: rect.y + rect.h },
      { x: rect.x, y: cy },
    ];
    if (data.color) {
      writer.addSolidHatchPolygon(CANONICAL_LAYERS.ANNOTATIONS_FILL, pts, { trueColor: annotationFillToTrueColor(data.color) });
    }
    writer.addPolyline(CANONICAL_LAYERS.ANNOTATIONS, pts, true, borderStyle);
  } else if (data.shape === "triangle") {
    const pts = [
      { x: rect.x + rect.w / 2, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
    if (data.color) {
      writer.addSolidHatchPolygon(CANONICAL_LAYERS.ANNOTATIONS_FILL, pts, { trueColor: annotationFillToTrueColor(data.color) });
    }
    writer.addPolyline(CANONICAL_LAYERS.ANNOTATIONS, pts, true, borderStyle);
  } else {
    if (data.color) {
      writer.addSolidHatchRect(
        CANONICAL_LAYERS.ANNOTATIONS_FILL,
        rect.x, rect.y, rect.w, rect.h,
        { trueColor: annotationFillToTrueColor(data.color) },
      );
    }
    writer.addRect(CANONICAL_LAYERS.ANNOTATIONS, rect.x, rect.y, rect.w, rect.h, borderStyle);
  }

  if (data.label) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    writer.addText(
      CANONICAL_LAYERS.LABELS,
      cx, cy,
      data.label,
      {
        height: cssFontPxToDxfHeight(data.fontSize ?? 12),
        align: "center",
        vAlign: "middle",
        style: data.borderColor ? { trueColor: hexToTrueColor(data.borderColor) } : undefined,
      },
    );
  }
}
