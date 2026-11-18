import type { ReactFlowInstance } from "@xyflow/react";
import type {
  AnnotationData,
  ConnectionEdge,
  DeviceData,
  Port,
  RoomData,
  SchematicNode,
  SignalType,
  StubLabelData,
  StubLabelPageMode,
} from "../types";
import { strippedHandleId } from "../portHandles";
import type { DxfWriter, EntityStyle } from "./writer";
import { ACI_NEAR_BLACK, ACI_WHITE, cssFontPxToDxfHeight, ELLIPSIS, pxToIn, tintToWhite, hexToRgb, rgbToTrueColor, truncateToWidth } from "./units";
import { CANONICAL_LAYERS, hexToTrueColor, resolveSignalColor } from "./layers";
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
import { estimateDeviceWidth } from "../deviceWidth";
import {
  DEVICE_LABEL_LINE_PX,
  resolveDeviceLabel,
  wrapDeviceLabelLines,
  type SchematicDisplayDefaults,
} from "../displayName";
import { buildStubLabelText, UNRESOLVED_STUB_LABEL_TEXT } from "../stubLabelText";
import { resolveStubLabelPartsForMode, type StubLabelContext } from "../stubLabelResolve";
import { STUB_H_EST, STUB_W_EST } from "../stubPlacement";

/** Matches Tailwind `rounded-lg` on the canvas DeviceNode (8px = 0.083"). */
const DEVICE_CORNER_RADIUS_IN = 8 / 96;

/**
 * Ink for structural linework and for names that carry no colour of their own —
 * device boxes, device names, room borders, section rules.
 *
 * These used to be emitted with no colour at all, i.e. BYLAYER, which put them
 * at the mercy of the layer colour. That was ACI 7, the adaptive white/black
 * pseudo-colour, so anything reading it literally painted them white and they
 * disappeared against a white page. Naming the colour outright — slate-900,
 * matching the canvas, with a non-adaptive ACI fallback — takes the layer out
 * of the decision entirely.
 */
const INK = { trueColor: 0x1e293b, aci: ACI_NEAR_BLACK } as const;

/** Baseline drop inside one 14-px header line box: the 12-px cap sits on it with the
 *  leading split above, which is where the canvas puts it too. A single line in the
 *  16-px zone lands on the same baseline as before (1 px block pad + 11). */
const LABEL_BASELINE_IN_LINE_PX = 11;

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

/**
 * Resolve the port a React Flow handle belongs to.
 *
 * A bidirectional port owns two handles named `<id>-in` and `<id>-out`, and a
 * passthrough port owns `<id>-rear` and `<id>-front`, so a handle id has to be
 * stripped back to its port id. But plenty of ports are NAMED that way —
 * `spk-xlr-in`, `combo-ts-out`, `laptop-hdmi-out` — and stripping those
 * unconditionally asked the map for a port that does not exist, so the label was
 * dropped and the port vanished from the drawing (14 of them in the seeded
 * fixture alone). Match the handle id exactly first and only strip when that
 * fails, the same precedence the port-edit revalidation settled on in #306.
 *
 * Same rule as portHandles.findPortByHandle, over a prebuilt map rather than a
 * device's port array — the strip itself comes from that shared module.
 */
function portForHandle(handleId: string, portMap: Map<string, Port>): Port | undefined {
  const exact = portMap.get(handleId);
  if (exact) return exact;
  const stripped = strippedHandleId(handleId);
  return stripped === undefined ? undefined : portMap.get(stripped);
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
    writer.addSolidFillRect(CANONICAL_LAYERS.ROOMS_FILL, rect.x, rect.y, rect.w, rect.h, {
      trueColor: tc,
    });
  }

  // Border
  const borderLt =
    data.borderStyle === "solid" ? "CONTINUOUS" :
    data.borderStyle === "dotted" ? "ES_DOTTED" :
    "ES_DASHED";
  const borderHex = data.borderColor ?? data.color;
  const borderStyle: EntityStyle = borderHex
    ? { linetype: borderLt, trueColor: hexToTrueColor(borderHex) }
    : { linetype: borderLt, ...INK };
  writer.addRect(CANONICAL_LAYERS.ROOMS, rect.x, rect.y, rect.w, rect.h, borderStyle);

  // Label — just inside the top-left corner.
  //
  // Room names carry no decorative all-caps of their own (#294): the display-case
  // preference is the only thing that decides their casing, exactly as it is for device
  // and port labels. This used to force `.toUpperCase()` as a drafting convention, which
  // made "As-typed" a lie for rooms and left them looking unlike every other label.
  if (data.label) {
    const labelSize = data.labelSize ?? 14;
    const heightIn = cssFontPxToDxfHeight(labelSize);
    writer.addText(
      CANONICAL_LAYERS.LABELS,
      rect.x + pxToIn(8),
      rect.y + rect.h - pxToIn(labelSize + 4),
      transformLabelNow(data.label),
      {
        height: heightIn,
        align: "left",
        style: borderHex ? { trueColor: hexToTrueColor(borderHex) } : { ...INK },
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
  const ax = internal.internals.positionAbsolute.x;
  const ay = internal.internals.positionAbsolute.y;
  // Same width rule as the canvas (#418) when the device hasn't been measured.
  const w = node.measured?.width ?? estimateDeviceWidth(data, transformLabelNow);
  const h = node.measured?.height ?? 64;
  const rect = toDxfRect(ax, ay, w, h);

  const handles = getHandlePositions(node, rfInstance);

  // Header band — merged name strip + header aux rows. Height is 16-multiple (min 32),
  // matching DeviceNode's headerBandHeight() so the DXF export tracks the canvas layout.
  const headerRows = rowsInSlot(data.auxiliaryData, "header");
  const resolvedLabel = resolveDeviceLabel(data, schematicDefaults);
  const labelZone = resolvedLabel.wrapsInHeader ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
  const bandH = headerBandHeight(data.auxiliaryData, labelZone);
  const headerContent = labelZone + headerRows.reduce((s, r) => s + auxRowHeight(r), 0);
  const headerPad = bandH - headerContent;
  const headerPadTop = Math.floor(headerPad / 2);
  const headerRect = toDxfRect(ax, ay, w, bandH);
  if (data.headerColor) {
    writer.addSolidFillRect(
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
    { ...INK },
  );

  // Header separator (bottom edge of the band)
  writer.addLine(
    CANONICAL_LAYERS.DEVICES,
    rect.x, rect.y + rect.h - pxToIn(bandH),
    rect.x + rect.w, rect.y + rect.h - pxToIn(bandH),
    { ...INK },
  );

  // Canvas uses `px-3` (12px each side). Match exactly or text will spill past the box.
  const HEADER_PAD_PX = 12;
  const labelAvailIn = rect.w - pxToIn(HEADER_PAD_PX * 2);
  const auxTextHeight = cssFontPxToDxfHeight(9);

  // Device label — sits in the label zone at the top of the band (below pt pad).
  //
  // DXF TEXT has no wrapping of its own, so a name the canvas breaks over two lines is
  // emitted as two TEXT entities. The break comes from the shared header measurement
  // (`wrapDeviceLabelLines`, the same width estimate behind `wrapsInHeader`), so the
  // drawing splits where the canvas splits; the old single ellipsised line simply lost
  // the tail of every long name — "USB-A (M) → RJ45 (F) Adapter" exported truncated
  // (#299). Those lines are deliberately NOT run through truncateToWidth: they already
  // fit the header by the measurement that drew them, and the exporter's conservative
  // Arial estimate would clip them right back.
  //
  // The lines are centred as a block in the zone, which reproduces the previous single-
  // line baseline exactly — including in a two-line zone, where baselining at the bottom
  // used to leave a blank line above the name (#249 follow-up).
  if (resolvedLabel.text) {
    const labelHeight = cssFontPxToDxfHeight(12);
    const displayText = transformLabelNow(resolvedLabel.text);
    const lines = resolvedLabel.wrapsInHeader
      ? wrapDeviceLabelLines(displayText, { ellipsis: ELLIPSIS })
      : [truncateToWidth(displayText, labelAvailIn, labelHeight)];
    const blockTop = ay + headerPadTop + (labelZone - lines.length * DEVICE_LABEL_LINE_PX) / 2;
    lines.forEach((line, i) => {
      if (!line) return;
      writer.addText(
        CANONICAL_LAYERS.LABELS,
        pxToIn(ax + w / 2),
        -pxToIn(blockTop + i * DEVICE_LABEL_LINE_PX + LABEL_BASELINE_IN_LINE_PX),
        line,
        { height: labelHeight, align: "center", style: { ...INK } },
      );
    });
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
      { ...INK },
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
    const port = portForHandle(hp.id, portMap);
    if (!port) continue;
    const portId = port.id;

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
        const sepStyle: EntityStyle = { linetype: "ES_DASHED", ...INK };
        // I/O section headers follow the case preference, the same as the canvas renders
        // them (DeviceNode's `displayLabel(item.name)`) — #294.
        const sectionText = transformLabelNow(section);
        const sectionTextOpts = { height: cssFontPxToDxfHeight(8), style: { ...INK } };
        if (dir === "input") {
          writer.addLine(CANONICAL_LAYERS.DEVICES, rect.x, sepY, rect.x + rect.w / 2, sepY, sepStyle);
          writer.addText(CANONICAL_LAYERS.LABELS, rect.x + pxToIn(4), sepY + pxToIn(1), sectionText, sectionTextOpts);
        } else if (dir === "output") {
          writer.addLine(CANONICAL_LAYERS.DEVICES, rect.x + rect.w / 2, sepY, rect.x + rect.w, sepY, sepStyle);
          writer.addText(CANONICAL_LAYERS.LABELS, rect.x + rect.w - pxToIn(4), sepY + pxToIn(1), sectionText, { ...sectionTextOpts, align: "right" });
        } else {
          writer.addLine(CANONICAL_LAYERS.DEVICES, rect.x, sepY, rect.x + rect.w, sepY, sepStyle);
          writer.addText(CANONICAL_LAYERS.LABELS, rect.x + rect.w / 2, sepY + pxToIn(1), sectionText, { ...sectionTextOpts, align: "center" });
        }
      }
      lastSec = section;
    }
  }
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

  const borderStyle: EntityStyle = data.borderColor
    ? { trueColor: hexToTrueColor(data.borderColor) }
    : { ...INK };

  if (data.shape === "ellipse" || data.shape === "circle") {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const majorRadius = data.shape === "circle" ? Math.min(rect.w, rect.h) / 2 : rect.w / 2;
    const ratio = data.shape === "circle" ? 1 : Math.min(1, rect.h / rect.w);
    if (data.color) {
      writer.addSolidFillEllipse(
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
      writer.addSolidFillPolygon(CANONICAL_LAYERS.ANNOTATIONS_FILL, pts, { trueColor: annotationFillToTrueColor(data.color) });
    }
    writer.addPolyline(CANONICAL_LAYERS.ANNOTATIONS, pts, true, borderStyle);
  } else if (data.shape === "triangle") {
    const pts = [
      { x: rect.x + rect.w / 2, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
    if (data.color) {
      writer.addSolidFillPolygon(CANONICAL_LAYERS.ANNOTATIONS_FILL, pts, { trueColor: annotationFillToTrueColor(data.color) });
    }
    writer.addPolyline(CANONICAL_LAYERS.ANNOTATIONS, pts, true, borderStyle);
  } else {
    if (data.color) {
      writer.addSolidFillRect(
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
        style: data.borderColor ? { trueColor: hexToTrueColor(data.borderColor) } : { ...INK },
      },
    );
  }
}

/** Matches the 2px CSS border-radius on the canvas StubLabelNode. */
const STUB_CORNER_RADIUS_IN = 2 / 96;
/** Canvas StubLabelNode text color (#374151, Tailwind gray-700). */
const STUB_TEXT_TRUECOLOR = 0x374151;

export interface StubLabelDefaults {
  showArrow: boolean;
  showPort: boolean;
  showRoom: boolean;
  pageMode: StubLabelPageMode;
  signalColors: Partial<Record<SignalType, string>> | undefined;
}

/**
 * Emit an off-page wire-reference stub: the signal-colored pill plus the label text
 * the canvas shows — the far device, and (when enabled) the direction arrow, its port,
 * room and page.
 *
 * The DXF used to emit nothing for these nodes, so the only text surviving at a stub
 * end was the leg's cable ID (#319). The text is resolved through the same helper the
 * canvas node uses, so the two can't drift apart.
 */
export function emitStubLabel(
  writer: DxfWriter,
  node: SchematicNode,
  rfInstance: ReactFlowInstance,
  ctx: StubLabelContext,
  defaults: StubLabelDefaults,
) {
  if (node.type !== "stub-label") return;
  const internal = rfInstance.getInternalNode(node.id);
  if (!internal) return;
  const data = node.data as StubLabelData;

  const parts = resolveStubLabelPartsForMode(node.id, data, ctx);
  // A stub whose partner leg or far device can't be resolved reads "?" on the canvas.
  // Dropping the node from the drawing instead would leave the leg's cable ID as the
  // only text at that end — the same silent loss of the tag #319 is about — and hide
  // from the reader that the connection is broken. A cable-ID-only tag is the exception
  // the resolver above handles: its ID comes off its own leg, so it survives (#364).
  const text = parts
    ? buildStubLabelText(
        // Only the name-ish parts take the display-case preference — the arrow and the
        // "Pg" tag stay as assembled, exactly as on the canvas (#294).
        { ...parts, farLabel: transformLabelNow(parts.farLabel), farRoom: transformLabelNow(parts.farRoom) },
        {
          showArrow: data.showArrow ?? defaults.showArrow,
          showPort: data.showPort ?? defaults.showPort,
          showRoom: data.showRoom ?? defaults.showRoom,
          // A same-room tag names its room only when explicitly set to (#297).
          roomInSameRoom: data.showRoom === true,
          pageMode: data.pageMode ?? defaults.pageMode,
          // Per-stub; the default mode setting is stamped at stubbing time (#377).
          labelMode: data.labelMode,
        },
      )
    : UNRESOLVED_STUB_LABEL_TEXT;

  const ax = internal.internals.positionAbsolute.x;
  const ay = internal.internals.positionAbsolute.y;
  const w = node.measured?.width ?? STUB_W_EST;
  const h = node.measured?.height ?? STUB_H_EST;
  const rect = toDxfRect(ax, ay, w, h);
  const trueColor = hexToTrueColor(resolveSignalColor(data.signalType, defaults.signalColors));

  // Opaque fill, like the canvas box — the leg terminates at the pill's edge, and any
  // connection routed past it must not read through the text. Grounded the same way the
  // cable-ID chip is: a SOLID for readers that fill SOLID, plus the MTEXT's own
  // background fill below for readers that don't, both at plain white (ACI 255) rather
  // than the adaptive 7.
  writer.addSolidFillRect(
    CANONICAL_LAYERS.LABELS,
    rect.x, rect.y, rect.w, rect.h,
    { trueColor: 0xffffff, aci: ACI_WHITE },
  );
  writer.addRoundedRect(
    CANONICAL_LAYERS.LABELS,
    rect.x, rect.y, rect.w, rect.h,
    STUB_CORNER_RADIUS_IN,
    { trueColor },
  );

  // An unnamed far device with every optional field off leaves nothing to write. The
  // pill above still goes out, because the canvas and the PDF both draw the empty box —
  // skipping the whole node here would put a gap in the CAD drawing where the editor
  // shows a stub.
  if (!text.trim()) return;

  // Deliberately NOT truncated to the pill: the box was measured against browser Inter
  // and truncateToWidth's Arial estimate is conservative enough to clip nearly every
  // stub label — which is the very information #319 is about. A hair of overhang in a
  // CAD viewer beats an ellipsis eating the device name.
  const height = cssFontPxToDxfHeight(9); // matches canvas 9px stub label
  writer.addMText(
    CANONICAL_LAYERS.LABELS,
    rect.x + rect.w / 2, rect.y + rect.h / 2,
    text,
    {
      height,
      attachment: 5,
      style: { trueColor: STUB_TEXT_TRUECOLOR },
      backgroundAci: ACI_WHITE,
      backgroundScale: 1.2,
    },
  );
}
