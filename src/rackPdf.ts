import { jsPDF, GState } from "jspdf";
import type {
  DeviceData,
  RackAccessory,
  RackData,
  RackDevicePlacement,
  RackElevationPage,
  SchematicNode,
  SchematicPage,
  TitleBlock,
} from "./types";
import { RACK_ACCESSORY_LABELS } from "./types";
import { getPaperSize, type PaperSize } from "./printConfig";
import {
  inferRackHeightU,
  getRackDepthConflicts,
  shelfDepthMm,
  shelfInnerWidthMm,
  PX_PER_MM as RACK_PX_PER_MM,
} from "./rackUtils";
import { computeRackStats, formatStatsLine } from "./rackStats";
import { contrastingTextColor, CONTRAST_BLACK } from "./colorContrast";
import { wrapLabel } from "./components/rackFaceConstants";
import { resolveDeviceLabel, type SchematicDisplayDefaults } from "./displayName";

// SVG-px constants — must mirror RackFaceSVG.tsx exactly so the PDF and the
// sheet view share the same coordinate system (within `s` mm-per-svg-px scale).
const SVG_PX_PER_U = 24;
const SVG_RACK_WIDTH = 260;
const SVG_RAIL_WIDTH = 8;
const SVG_FULL_WIDTH = 244; // RACK_WIDTH - 2 * RAIL_WIDTH
const SVG_HALF_WIDTH = 121; // (RACK_WIDTH - 2 * DEVICE_INSET) / 2 - 1
const SVG_DEVICE_INSET = 8;

// Convert an SVG font size (in SVG-px) to jsPDF font size (pt).
// At scale s mm-per-svg-px, an SVG-px font occupies s mm visual height.
// 1pt = 1/72 inch = 0.3528 mm, so pt = mm / 0.3528.
const PT_PER_MM = 1 / 0.3528;

// ─── Inter font embedding (self-contained copy of reportPdf logic) ───

let interRegularB64: string | null = null;
let interBoldB64: string | null = null;
let interItalicB64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function loadInterFont(doc: jsPDF) {
  if (!interRegularB64) {
    const [r, b, it] = await Promise.all([
      fetch("/fonts/Inter-Regular.ttf"),
      fetch("/fonts/Inter-Bold.ttf"),
      fetch("/fonts/Inter-Italic.ttf"),
    ]);
    if (!r.ok || !b.ok) throw new Error(`Font fetch failed: ${r.status}/${b.status}`);
    const [rb, bb] = await Promise.all([r.arrayBuffer(), b.arrayBuffer()]);
    interRegularB64 = arrayBufferToBase64(rb);
    interBoldB64 = arrayBufferToBase64(bb);
    // Italic is optional — bundle if available, fall back to "normal" style at call sites if not.
    if (it.ok) {
      const ib = await it.arrayBuffer();
      interItalicB64 = arrayBufferToBase64(ib);
    }
  }
  doc.addFileToVFS("Inter-Regular.ttf", interRegularB64);
  doc.addFileToVFS("Inter-Bold.ttf", interBoldB64!);
  doc.addFont("Inter-Regular.ttf", "Inter", "normal");
  doc.addFont("Inter-Bold.ttf", "Inter", "bold");
  if (interItalicB64) {
    doc.addFileToVFS("Inter-Italic.ttf", interItalicB64);
    doc.addFont("Inter-Italic.ttf", "Inter", "italic");
  }
}

/** True once Inter italic is loaded into the doc — call sites can opt in for italic styling. */
export function hasInterItalic(): boolean {
  return interItalicB64 !== null;
}

// ─── Color helpers ───

export function setFillHex(doc: jsPDF, hex: string | undefined, fallback: [number, number, number]) {
  const m = (hex ?? "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) doc.setFillColor(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
  else doc.setFillColor(...fallback);
}

/** Black or white, as setTextColor RGB, legible over the fill setFillHex would
 *  produce for the same inputs — same hex parsing, same fallback (#301). */
export function contrastingTextRgb(
  hex: string | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  const m = (hex ?? "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const bg = m ? (hex as string) : `rgb(${fallback[0]}, ${fallback[1]}, ${fallback[2]})`;
  return contrastingTextColor(bg) === CONTRAST_BLACK ? [0, 0, 0] : [255, 255, 255];
}

// ─── Title bar ───

const PAGE_MARGIN_MM = 12;
const MM_PER_IN = 25.4;
const TITLE_BAR_H_MM = 14;

function drawTitleBar(
  doc: jsPDF,
  pageWidthMm: number,
  titleBlock: TitleBlock | undefined,
  rack: RackData,
  schematicName: string,
  pageNum: number,
  totalPages: number,
) {
  const x = PAGE_MARGIN_MM;
  const y = PAGE_MARGIN_MM;
  const w = pageWidthMm - 2 * PAGE_MARGIN_MM;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, TITLE_BAR_H_MM);

  doc.setFont("Inter", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`${schematicName} — ${rack.label}`, x + 2, y + 5);

  doc.setFont("Inter", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const meta = [
    `${rack.heightU}U`,
    `${rack.depthMm}mm depth`,
    titleBlock?.designer ? `Designer: ${titleBlock.designer}` : null,
    titleBlock?.date ? `Date: ${titleBlock.date}` : null,
  ].filter(Boolean).join("  ·  ");
  doc.text(meta, x + 2, y + 10);

  doc.text(`Page ${pageNum} of ${totalPages}`, x + w - 2, y + 5, { align: "right" });
  if (titleBlock?.revision) doc.text(`Rev ${titleBlock.revision}`, x + w - 2, y + 10, { align: "right" });
  doc.setTextColor(0);
}

// ─── Aspect-preserving fit: matches RackFaceSVG's preserveAspectRatio="xMidYMid meet" ───

interface FitResult {
  scale: number;     // mm per SVG-px
  offsetX: number;   // mm-space top-left of the fitted content box
  offsetY: number;
}

/** Fit (vbW × vbH) viewBox inside (rectW × rectH) rect preserving aspect, centered. */
function fitMeet(rectXMm: number, rectYMm: number, rectWMm: number, rectHMm: number, vbW: number, vbH: number): FitResult {
  const scale = Math.min(rectWMm / vbW, rectHMm / vbH);
  return {
    scale,
    offsetX: rectXMm + (rectWMm - vbW * scale) / 2,
    offsetY: rectYMm + (rectHMm - vbH * scale) / 2,
  };
}

// ─── Front / rear elevation ───
//
// Coordinate system mirrors RackFaceSVG.tsx exactly:
//   viewBox = (-32, -20, 296, heightU*24+24)
//   rack frame in SVG-space = (0, 0) to (260, heightU*24)
//   RAIL_WIDTH = 8 SVG-px on each side
// We multiply each SVG-px by `scale` to get mm.

export function drawElevation(
  doc: jsPDF,
  rack: RackData,
  placements: RackDevicePlacement[],
  accessories: RackAccessory[],
  deviceDataMap: Map<string, DeviceData>,
  face: "front" | "rear",
  rectXMm: number,
  rectYMm: number,
  rectWMm: number,
  rectHMm: number,
  drawFaceLabel: boolean = true,
  schematicDefaults: SchematicDisplayDefaults = {},
) {
  const is2Post = rack.rackType === "open-2post";
  const empty = face === "rear" && is2Post;
  const showRails = !empty;

  // viewBox: x=-32 .. 264 (296 wide), y=-20 .. heightU*24+4 (heightU*24+24 tall)
  const VB_W = 296;
  const VB_H = rack.heightU * SVG_PX_PER_U + 24;
  const fit = fitMeet(rectXMm, rectYMm, rectWMm, rectHMm, VB_W, VB_H);
  const s = fit.scale;
  const ptPerSvg = s * PT_PER_MM; // jsPDF pt per SVG-px

  // Rack frame top-left in mm (SVG (0,0) → mm).
  const x = fit.offsetX + 32 * s;
  const y = fit.offsetY + 20 * s;
  const RACK_WIDTH_MM = SVG_RACK_WIDTH * s;
  const drawHeightMm = rack.heightU * SVG_PX_PER_U * s;
  const uHeightMm = SVG_PX_PER_U * s;
  const railWMm = SVG_RAIL_WIDTH * s;

  // Rack label — SVG: <text x={RACK_WIDTH/2} y={-8} fontSize={12} fontWeight={600} fill="#333">
  // Always drawn (matches sheet view; legacy exportRackPdf also gets it for consistency).
  doc.setFont("Inter", "bold");
  doc.setFontSize(12 * ptPerSvg);
  doc.setTextColor(51, 51, 51);
  doc.text(rack.label, x + RACK_WIDTH_MM / 2, y - 8 * s, { align: "center" });

  // Optional face label "Front"/"Rear" (drawn above rack label position when caller asks).
  if (drawFaceLabel) {
    const labelTitle = face === "front" ? "Front" : "Rear";
    doc.setFont("Inter", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(labelTitle, x + RACK_WIDTH_MM / 2, y - 2, { align: "center" });
  }

  // Frame fill
  setFillHex(doc, undefined, [245, 245, 245]);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.4);
  doc.rect(x, y, RACK_WIDTH_MM, drawHeightMm, "FD");

  if (empty) {
    doc.setFont("Inter", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text("(no rear face on 2-post)", x + RACK_WIDTH_MM / 2, y + drawHeightMm / 2, { align: "center" });
    return;
  }

  // Main side rails (SVG: rect at x=0,w=8 and x=RACK_WIDTH-8,w=8)
  setFillHex(doc, undefined, [212, 212, 212]);
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.125);
  doc.rect(x, y, railWMm, drawHeightMm, "FD");
  doc.rect(x + RACK_WIDTH_MM - railWMm, y, railWMm, drawHeightMm, "FD");

  // Inner pseudo-rails (SVG: rect at x=RAIL_WIDTH+1, w=3 and x=RACK_WIDTH-RAIL_WIDTH-4, w=3)
  if (showRails) {
    setFillHex(doc, undefined, [224, 224, 224]);
    doc.setDrawColor(204, 204, 204);
    doc.setLineWidth(0.063);
    doc.rect(x + (SVG_RAIL_WIDTH + 1) * s, y, 3 * s, drawHeightMm, "FD");
    doc.rect(x + (SVG_RACK_WIDTH - SVG_RAIL_WIDTH - 4) * s, y, 3 * s, drawHeightMm, "FD");
  }

  // U gridlines + numbers + mounting holes
  doc.setFont("Inter", "normal");
  const uFontPt = Math.max(2.5, 8 * ptPerSvg);
  for (let i = 0; i < rack.heightU; i++) {
    const ly = y + i * uHeightMm;
    if (i > 0) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.1);
      doc.line(x, ly, x + RACK_WIDTH_MM, ly);
    }
    // U number
    doc.setFontSize(uFontPt);
    doc.setTextColor(150, 150, 150);
    const uNum = rack.heightU - i;
    doc.text(`${uNum}`, x - 16 * s, ly + uHeightMm / 2, { align: "center", baseline: "middle" });
    // Mounting holes (3 per U on each rail) — only when rails are shown.
    if (showRails) {
      doc.setFillColor(153, 153, 153);
      for (const frac of [1 / 6, 3 / 6, 5 / 6]) {
        const cy = ly + uHeightMm * frac;
        doc.circle(x + (SVG_RAIL_WIDTH + 2.5) * s, cy, 1.2 * s, "F");
        doc.circle(x + (SVG_RACK_WIDTH - SVG_RAIL_WIDTH - 2.5) * s, cy, 1.2 * s, "F");
      }
    }
  }

  // Opposite-face occupancy ghosts — diagonal stripe pattern + dashed border,
  // mirroring the SVG <pattern id="occupancy-stripes"> behavior.
  // SVG: 6×6 cell, vertical line at x=0, patternTransform=rotate(45) → 45° stripes
  //      with 6 SVG-px perpendicular spacing, stroke=rgba(0,0,0,0.08), strokeWidth=2
  // PDF: clip to rect, draw 45° lines at the same spacing using GState alpha.
  const oppositeFace: "front" | "rear" = face === "front" ? "rear" : "front";
  for (const p of placements) {
    if (p.rackId !== rack.id || p.face !== oppositeFace || p.mountedOnShelfId) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd) continue;
    const heightU = inferRackHeightU(dd);
    const isHalf = !!p.halfRackSide;
    const gw_svg = isHalf ? SVG_HALF_WIDTH : SVG_FULL_WIDTH;
    const gx_svg = SVG_DEVICE_INSET + (isHalf && p.halfRackSide === "right" ? SVG_HALF_WIDTH + 2 : 0);
    const gy = y + (rack.heightU - (p.uPosition + heightU - 1)) * uHeightMm;
    const gh = heightU * uHeightMm - s;
    const gx = x + gx_svg * s;
    const gw = gw_svg * s;

    // Stripes — slope -1 lines (forward-slash /, matching SVG rotate(45) on a vertical line).
    // Perpendicular spacing 6 SVG-px → c-spacing along x = 6√2 SVG-px.
    // We compute exact line endpoints clipped to the rect (avoids jsPDF clip quirks
    // where doc.rect() may auto-stroke and consume the path before clip() takes it).
    doc.saveGraphicsState();
    doc.setGState(new GState({ "stroke-opacity": 0.08 }));
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(2 * s); // 2 SVG-px stroke
    const cSpacing = 6 * Math.SQRT2 * s;
    for (let c = 0; c <= gw + gh; c += cSpacing) {
      // Line equation in rect-local coords: x + y = c, with x ∈ [0, gw], y ∈ [0, gh].
      // Find the two intersection points with the rect edges.
      const pts: Array<[number, number]> = [];
      if (c >= 0 && c <= gw) pts.push([c, 0]);                 // top edge
      if (c - gh >= 0 && c - gh <= gw) pts.push([c - gh, gh]); // bottom edge
      if (c >= 0 && c <= gh && pts.length < 2) pts.push([0, c]); // left edge (skip if already covered)
      if (c - gw >= 0 && c - gw <= gh && pts.length < 2) pts.push([gw, c - gw]); // right edge
      if (pts.length < 2) continue;
      doc.line(gx + pts[0][0], gy + pts[0][1], gx + pts[1][0], gy + pts[1][1]);
    }
    doc.restoreGraphicsState();

    // Dashed border on top
    doc.setDrawColor(187, 187, 187);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([0.75, 0.5], 0);
    doc.rect(gx, gy, gw, gh, "S");
    doc.setLineDashPattern([], 0);
  }

  // Accessories on this face (SVG: rect from DEVICE_INSET=8 to DEVICE_INSET+FULL_WIDTH=252, width=244)
  for (const a of accessories) {
    if (a.rackId !== rack.id || a.face !== face) continue;
    const ay = y + (rack.heightU - (a.uPosition + a.heightU - 1)) * uHeightMm;
    const ah_svg = a.heightU * SVG_PX_PER_U - 1;
    const ah = ah_svg * s;
    const fill: Record<string, [number, number, number]> = {
      "blank-panel": [136, 136, 136], "vent-panel": [170, 170, 170], "shelf": [160, 133, 91],
      "drawer": [138, 122, 90], "cable-manager": [102, 102, 102], "fan-unit": [85, 107, 122],
    };
    doc.setFillColor(...(fill[a.type] ?? [136, 136, 136]));
    doc.setDrawColor(85, 85, 85);
    doc.setLineWidth(0.125);
    doc.rect(x + SVG_DEVICE_INSET * s, ay, SVG_FULL_WIDTH * s, ah, "FD");

    // Vent panel hatching — horizontal stripes inside the panel.
    if (a.type === "vent-panel") {
      doc.setDrawColor(238, 238, 238); // approximates rgba(255,255,255,0.3) over a grey panel
      doc.setLineWidth(0.15);
      const stripes = Math.max(1, Math.floor(ah_svg / 6));
      for (let si = 0; si < stripes; si++) {
        const ly = ay + (3 + si * 6) * s;
        doc.line(x + (SVG_DEVICE_INSET + 8) * s, ly, x + (SVG_DEVICE_INSET + SVG_FULL_WIDTH - 8) * s, ly);
      }
    }

    if (a.type !== "shelf") {
      doc.setFont("Inter", "normal");
      doc.setFontSize(8 * ptPerSvg);
      doc.setTextColor(255, 255, 255);
      doc.text(a.label ?? RACK_ACCESSORY_LABELS[a.type], x + RACK_WIDTH_MM / 2, ay + ah / 2, { align: "center", baseline: "middle" });
    }
  }

  // Devices on this face (skip shelf-mounted — drawn separately on the shelf surface)
  for (const p of placements) {
    if (p.rackId !== rack.id || p.face !== face || p.mountedOnShelfId) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd) continue;
    const heightU = inferRackHeightU(dd);
    const isHalf = !!p.halfRackSide;
    const w_svg = isHalf ? SVG_HALF_WIDTH : SVG_FULL_WIDTH;
    const x_svg = SVG_DEVICE_INSET + (isHalf && p.halfRackSide === "right" ? SVG_HALF_WIDTH + 2 : 0);
    const h_svg = heightU * SVG_PX_PER_U - 1;
    const dx = x + x_svg * s;
    const dy = y + (rack.heightU - (p.uPosition + heightU - 1)) * uHeightMm;
    const dw = w_svg * s;
    const dh = h_svg * s;
    setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.rect(dx, dy, dw, dh, "FD");

    // Multi-line label — wrapLabel matches RackFaceSVG exactly.
    const resolved = resolveDeviceLabel(dd, schematicDefaults);
    const fs_svg = h_svg > 20 ? 8 : 7;
    const fs_pt = fs_svg * ptPerSvg;
    const maxChars = Math.min(isHalf ? 14 : 36, Math.floor(w_svg / (fs_svg * 0.58)));
    const maxLines = resolved.wrap ? Math.max(1, Math.floor(h_svg / (fs_svg * 1.5))) : 1;
    const lines = wrapLabel(resolved.text, maxChars, maxLines);
    const lineH_svg = fs_svg * 1.35;
    const baseY_svg = h_svg / 2 - ((lines.length - 1) * lineH_svg) / 2;
    const labelRgb = contrastingTextRgb(dd.headerColor ?? dd.color, [74, 144, 217]);
    doc.setFont("Inter", "bold");
    doc.setFontSize(fs_pt);
    doc.setTextColor(...labelRgb);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], dx + dw / 2, dy + (baseY_svg + i * lineH_svg) * s, { align: "center", baseline: "middle" });
    }

    // hU badge in top-right corner (>1U devices) — SVG renders at fontSize=7, alpha 0.7.
    if (heightU > 1) {
      doc.setFontSize(7 * ptPerSvg);
      // Approximates the SVG's 0.7-alpha label composited over the device color.
      if (labelRgb[0] === 0) doc.setTextColor(77, 77, 77);
      else doc.setTextColor(220, 220, 220);
      doc.text(`${heightU}U`, dx + dw - 4 * s, dy + 8 * s, { align: "right" });
    }
  }

  // Shelf occupants on this face — mirror RackFaceSVG.tsx exactly:
  // position by shelfOffsetMm (real-mm), size by device widthMm/heightMm, support rotated.
  for (const a of accessories) {
    if (a.rackId !== rack.id || a.face !== face || a.type !== "shelf") continue;
    const occupants = placements.filter((p) => p.mountedOnShelfId === a.id && p.face === face);
    if (occupants.length === 0) continue;
    const ay = y + (rack.heightU - (a.uPosition + a.heightU - 1)) * uHeightMm;
    const ah = a.heightU * uHeightMm - s; // mirror SVG (-1 SVG-px)
    const surfaceY = ay + ah - 0.5 * s;
    const innerW = shelfInnerWidthMm();
    const realToPdf = RACK_PX_PER_MM * s; // real-mm → SVG-px → PDF-mm
    for (const occ of occupants) {
      const dd = deviceDataMap.get(occ.deviceNodeId);
      if (!dd) continue;
      const wRealMm = occ.rotated ? (dd.heightMm ?? 44.45) : (dd.widthMm ?? innerW);
      const hRealMm = occ.rotated ? (dd.widthMm ?? innerW) : (dd.heightMm ?? 44.45);
      const wPdf = wRealMm * realToPdf;
      const hPdf = hRealMm * realToPdf;
      const offset = occ.shelfOffsetMm ?? { x: 0, y: 0 };
      const xPdf = x + railWMm + offset.x * realToPdf;
      const topY = surfaceY - hPdf - offset.y * realToPdf;
      setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
      doc.setDrawColor(40, 40, 40);
      doc.setLineWidth(0.2);
      doc.rect(xPdf, topY, wPdf, hPdf, "FD");

      // Label — mirror SVG: fontSize=Math.min(7, hPx*0.4) where hPx = hRealMm * PX_PER_MM (SVG-px).
      const hSvgPx = hRealMm * RACK_PX_PER_MM;
      const wSvgPx = wRealMm * RACK_PX_PER_MM;
      const fs_svg = Math.min(7, hSvgPx * 0.4);
      const fs_pt = Math.max(2.5, fs_svg * ptPerSvg);
      doc.setFont("Inter", "normal");
      doc.setFontSize(fs_pt);
      doc.setTextColor(...contrastingTextRgb(dd.headerColor ?? dd.color, [74, 144, 217]));
      const effectiveSvgPx = occ.rotated ? hSvgPx : wSvgPx;
      const resolvedOcc = resolveDeviceLabel(dd, schematicDefaults);
      const labelTrim = Math.max(4, Math.floor(effectiveSvgPx / 5));
      const lbl = resolvedOcc.text.length > labelTrim ? resolvedOcc.text.slice(0, Math.max(1, labelTrim - 1)) + "…" : resolvedOcc.text;
      const cx = xPdf + wPdf / 2;
      const cy = topY + hPdf / 2;
      if (occ.rotated) {
        // jsPDF angle is counterclockwise degrees; 90 reads bottom-up like SVG rotate(-90).
        doc.text(lbl, cx, cy, { align: "center", baseline: "middle", angle: 90 });
      } else {
        doc.text(lbl, cx, cy, { align: "center", baseline: "middle" });
      }
    }
  }
}

// ─── Side view ───
//
// SVG viewBox = (-8, -20, sideW(depth)+16, heightU*24+24) where sideW = max(80, depth*PX_PER_MM).

export function drawSideView(
  doc: jsPDF,
  rack: RackData,
  placements: RackDevicePlacement[],
  accessories: RackAccessory[],
  deviceDataMap: Map<string, DeviceData>,
  rectXMm: number,
  rectYMm: number,
  rectWMm: number,
  rectHMm: number,
  drawFaceLabel: boolean = true,
  schematicDefaults: SchematicDisplayDefaults = {},
) {
  const is2Post = rack.rackType === "open-2post";

  const SIDE_W_PX = Math.max(80, rack.depthMm * RACK_PX_PER_MM);
  const VB_W = SIDE_W_PX + 16;
  const VB_H = rack.heightU * SVG_PX_PER_U + 24;
  const fit = fitMeet(rectXMm, rectYMm, rectWMm, rectHMm, VB_W, VB_H);
  const s = fit.scale;
  const ptPerSvg = s * PT_PER_MM;

  // Rack frame in mm (SVG (0,0) to (SIDE_W_PX, heightU*24)).
  const x = fit.offsetX + 8 * s;          // SVG x=0 with vbX=-8
  const y = fit.offsetY + 20 * s;         // SVG y=0 with vbY=-20
  const sideWMm = SIDE_W_PX * s;
  const drawHeightMm = rack.heightU * SVG_PX_PER_U * s;
  const uHeightMm = SVG_PX_PER_U * s;
  const depthScale = sideWMm / rack.depthMm;
  const railOffsetMm = 4 * s;             // rails are 4 SVG-px in from each frame edge

  // Rack label — SVG: <text x={SW/2} y={-8} fontSize={12} fontWeight={600} fill="#333">
  doc.setFont("Inter", "bold");
  doc.setFontSize(12 * ptPerSvg);
  doc.setTextColor(51, 51, 51);
  doc.text(rack.label, x + sideWMm / 2, y - 8 * s, { align: "center" });

  if (drawFaceLabel) {
    doc.setFont("Inter", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text("Side", x + sideWMm / 2, y - 2, { align: "center" });
  }

  setFillHex(doc, undefined, [250, 250, 250]);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.rect(x, y, sideWMm, drawHeightMm, "FD");

  // Faint U gridlines (matches SVG side-view <line stroke="#eee" strokeWidth={0.5}>).
  doc.setDrawColor(238, 238, 238);
  doc.setLineWidth(0.1);
  for (let i = 1; i < rack.heightU; i++) {
    const ly = y + i * uHeightMm;
    doc.line(x, ly, x + sideWMm, ly);
  }

  // Rails
  doc.setDrawColor(170, 170, 170);
  doc.setLineDashPattern([0.6, 0.4], 0);
  doc.line(x + railOffsetMm, y, x + railOffsetMm, y + drawHeightMm);
  if (!is2Post) doc.line(x + sideWMm - railOffsetMm, y, x + sideWMm - railOffsetMm, y + drawHeightMm);
  doc.setLineDashPattern([], 0);

  doc.setFont("Inter", "normal");
  doc.setFontSize(Math.max(3, Math.min(7, 7 * s)));
  doc.setTextColor(140, 140, 140);
  doc.text("F", x + railOffsetMm, y - 1, { align: "center" });
  if (!is2Post) doc.text("R", x + sideWMm - railOffsetMm, y - 1, { align: "center" });

  // Shelves first
  for (const a of accessories) {
    if (a.rackId !== rack.id || a.type !== "shelf") continue;
    const ay = y + (rack.heightU - (a.uPosition + a.heightU - 1)) * uHeightMm;
    const ah = a.heightU * uHeightMm;
    const sd = shelfDepthMm(a, rack) * depthScale;
    const sx = (is2Post || a.face === "front") ? x + railOffsetMm : x + sideWMm - railOffsetMm - sd;
    setFillHex(doc, undefined, [160, 133, 91]);
    doc.rect(sx, ay + ah - 0.5, sd, 0.5, "F");
  }

  // Devices
  for (const p of placements) {
    if (p.rackId !== rack.id) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd) continue;
    if (p.mountedOnShelfId) {
      const shelf = accessories.find((a) => a.id === p.mountedOnShelfId);
      if (!shelf) continue;
      // Mirror RackFaceSVG side-view: device sized by real heightMm, positioned by shelfOffsetMm.y.
      const ay = y + (rack.heightU - (shelf.uPosition + shelf.heightU - 1)) * uHeightMm;
      const ah = shelf.heightU * uHeightMm - s; // -1 SVG-px in PDF-mm
      const realToPdf = RACK_PX_PER_MM * s;
      const dDepth = (dd.depthMm ?? shelfDepthMm(shelf, rack)) * depthScale;
      const hRealMm = p.rotated ? (dd.widthMm ?? 44.45) : (dd.heightMm ?? 44.45);
      const dh = hRealMm * realToPdf;
      const surfaceY = ay + ah - 0.5 * s;
      const offset = p.shelfOffsetMm ?? { x: 0, y: 0 };
      const dy = surfaceY - dh - offset.y * realToPdf;
      const dx = (is2Post || shelf.face === "front") ? x + railOffsetMm : x + sideWMm - railOffsetMm - dDepth;
      setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
      doc.setDrawColor(40, 40, 40);
      doc.setLineWidth(0.2);
      doc.rect(dx, dy, dDepth, dh, "FD");

      // Label — mirror RackFaceSVG side view: trimmed to the device's depth span,
      // fontSize = min(7, max(4, dh*0.5)) in SVG-px (#416).
      const dDepthSvg = (dd.depthMm ?? shelfDepthMm(shelf, rack)) * RACK_PX_PER_MM;
      const dhSvg = hRealMm * RACK_PX_PER_MM;
      const resolvedShelf = resolveDeviceLabel(dd, schematicDefaults);
      const labelTrim = Math.max(3, Math.floor(dDepthSvg / 5));
      const lbl = resolvedShelf.text.length > labelTrim ? resolvedShelf.text.slice(0, Math.max(1, labelTrim - 1)) + "…" : resolvedShelf.text;
      doc.setFont("Inter", "normal");
      // No pt floor: labelTrim is budgeted for this SVG-px size, a floor overflows the bar.
      doc.setFontSize(Math.min(7, Math.max(4, dhSvg * 0.5)) * ptPerSvg);
      doc.setTextColor(...contrastingTextRgb(dd.headerColor ?? dd.color, [74, 144, 217]));
      doc.text(lbl, dx + dDepth / 2, dy + dh / 2, { align: "center", baseline: "middle" });
      continue;
    }
    const heightU = inferRackHeightU(dd);
    const dy = y + (rack.heightU - (p.uPosition + heightU - 1)) * uHeightMm;
    const dh = heightU * uHeightMm - 0.1;
    const deviceDepthMm = dd.depthMm ?? rack.depthMm * 0.6;
    const dDepth = deviceDepthMm * depthScale;
    const dx = (is2Post || p.face === "front") ? x + railOffsetMm : x + sideWMm - railOffsetMm - dDepth;
    setFillHex(doc, dd.headerColor ?? dd.color, [74, 144, 217]);
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.rect(dx, dy, dDepth, dh, "FD");

    // Multi-line label — same fit rules as the on-screen side view (RackFaceSVG /
    // RackRenderer SideViewRack): chars bounded by the device's depth span, at
    // most 3 lines when wrapping is on (#416).
    const h_svg = heightU * SVG_PX_PER_U - 1;
    const depth_svg = deviceDepthMm * RACK_PX_PER_MM;
    const resolved = resolveDeviceLabel(dd, schematicDefaults);
    const fs_svg = h_svg > 20 ? 8 : 7;
    const maxChars = Math.max(2, Math.floor(depth_svg / (fs_svg * 0.58)));
    const maxLines = resolved.wrap ? Math.max(1, Math.floor(h_svg / (fs_svg * 1.5))) : 1;
    const lines = wrapLabel(resolved.text, maxChars, Math.min(maxLines, 3));
    const lineH_svg = fs_svg * 1.35;
    const baseY_svg = h_svg / 2 - ((lines.length - 1) * lineH_svg) / 2;
    doc.setFont("Inter", "normal");
    doc.setFontSize(fs_svg * ptPerSvg);
    doc.setTextColor(...contrastingTextRgb(dd.headerColor ?? dd.color, [74, 144, 217]));
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], dx + dDepth / 2, dy + (baseY_svg + i * lineH_svg) * s, { align: "center", baseline: "middle" });
    }
  }

  // Depth conflicts overlay
  const conflicts = getRackDepthConflicts(rack, placements, deviceDataMap);
  for (const c of conflicts) {
    const a = placements.find((p) => p.id === c.aId);
    const b = placements.find((p) => p.id === c.bId);
    if (!a || !b) continue;
    const ad = deviceDataMap.get(a.deviceNodeId);
    const bd = deviceDataMap.get(b.deviceNodeId);
    if (!ad?.depthMm || !bd?.depthMm) continue;
    const yTop = y + (rack.heightU - c.uOverlapEnd) * uHeightMm;
    const yBot = y + (rack.heightU - c.uOverlapStart + 1) * uHeightMm;
    const frontEnd = x + railOffsetMm + ad.depthMm * depthScale;
    const rearStart = x + sideWMm - railOffsetMm - bd.depthMm * depthScale;
    const ox = Math.min(frontEnd, rearStart);
    const ow = Math.max(0, Math.max(frontEnd, rearStart) - ox);
    doc.setFillColor(239, 68, 68);
    // jsPDF doesn't support alpha on fillColor directly without GState; use a stippled border instead
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([0.6, 0.4], 0);
    doc.rect(ox, yTop, ow, yBot - yTop);
    doc.setLineDashPattern([], 0);
    doc.setFont("Inter", "bold");
    doc.setFontSize(Math.max(3, Math.min(6, 6 * s)));
    doc.setTextColor(127, 29, 29);
    doc.text(`+${Math.round(c.depthOverhangMm)}mm`, ox + ow / 2, (yTop + yBot) / 2, { align: "center", baseline: "middle" });
  }

  doc.setTextColor(0);
}

// ─── Stats footer ───

export function drawStatsFooter(
  doc: jsPDF,
  rack: RackData,
  placements: RackDevicePlacement[],
  accessories: RackAccessory[],
  deviceDataMap: Map<string, DeviceData>,
  centerXMm: number,
  yMm: number,
) {
  const stats = computeRackStats(rack, placements, accessories, deviceDataMap);
  const line = formatStatsLine(stats);
  doc.setFont("Inter", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(line, centerXMm, yMm, { align: "center" });

  if (stats.unknownDepthCount > 0 || stats.unknownWeightCount > 0 || stats.unknownPowerCount > 0) {
    const caveat = [
      stats.unknownDepthCount > 0 ? `${stats.unknownDepthCount} unknown depth` : null,
      stats.unknownWeightCount > 0 ? `${stats.unknownWeightCount} unknown weight` : null,
      stats.unknownPowerCount > 0 ? `${stats.unknownPowerCount} unknown power` : null,
    ].filter(Boolean).join(" · ");
    doc.setFont("Inter", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(caveat, centerXMm, yMm + 4, { align: "center" });
  }
  doc.setTextColor(0);
}

// ─── Main export ───

export interface RackPdfOptions {
  pages: SchematicPage[];
  nodes: SchematicNode[];
  schematicName: string;
  titleBlock?: TitleBlock;
  /** Paper to print on, as the print view's picker resolves it. Defaults to Letter.
   *  The sheet is always laid out landscape: front and rear elevations sit side by
   *  side over the side view (#379). */
  paper?: PaperSize;
  /** When set, restrict the export to these page IDs (otherwise all rack pages) */
  pageIds?: string[];
  /** Schematic-wide short-name + wrap defaults; per-device fields override. */
  schematicDefaults?: SchematicDisplayDefaults;
}

export async function exportRackPdf(opts: RackPdfOptions): Promise<void> {
  const paper = opts.paper ?? getPaperSize("letter");
  const widthMm = Math.max(paper.widthIn, paper.heightIn) * MM_PER_IN;
  const heightMm = Math.min(paper.widthIn, paper.heightIn) * MM_PER_IN;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [widthMm, heightMm] });
  await loadInterFont(doc);

  const deviceDataMap = new Map<string, DeviceData>();
  for (const n of opts.nodes) if (n.type === "device") deviceDataMap.set(n.id, n.data as DeviceData);

  const rackPages: { page: RackElevationPage; rack: RackData }[] = [];
  for (const page of opts.pages) {
    if (page.type !== "rack-elevation") continue;
    if (opts.pageIds && !opts.pageIds.includes(page.id)) continue;
    for (const r of page.racks) rackPages.push({ page, rack: r });
  }

  if (rackPages.length === 0) {
    doc.setFont("Inter", "normal");
    doc.setFontSize(11);
    doc.text("No racks to export.", widthMm / 2, heightMm / 2, { align: "center" });
    doc.save(`${opts.schematicName} - Racks.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, ""));
    return;
  }

  rackPages.forEach(({ page, rack }, idx) => {
    if (idx > 0) doc.addPage();
    const total = rackPages.length;
    drawTitleBar(doc, widthMm, opts.titleBlock, rack, opts.schematicName, idx + 1, total);

    const contentTopY = PAGE_MARGIN_MM + TITLE_BAR_H_MM + 6;
    const statsY = heightMm - PAGE_MARGIN_MM - 6;
    const drawableH = statsY - contentTopY - 8; // reserve for face labels & padding

    // Layout: top row = front + rear elevations; bottom row = side view
    // Heights split: top = 60%, bottom = 40%
    const topRowH = drawableH * 0.6;
    const bottomRowH = drawableH * 0.4;

    const halfW = (widthMm - 2 * PAGE_MARGIN_MM) / 2;
    const frontX = PAGE_MARGIN_MM;
    const rearX = PAGE_MARGIN_MM + halfW;

    drawElevation(doc, rack, page.placements, page.accessories, deviceDataMap, "front", frontX, contentTopY + 4, halfW, topRowH, true, opts.schematicDefaults);
    drawElevation(doc, rack, page.placements, page.accessories, deviceDataMap, "rear", rearX, contentTopY + 4, halfW, topRowH, true, opts.schematicDefaults);

    const sideTop = contentTopY + topRowH + 12;
    const sideX = PAGE_MARGIN_MM;
    const sideW = widthMm - 2 * PAGE_MARGIN_MM;
    drawSideView(doc, rack, page.placements, page.accessories, deviceDataMap, sideX, sideTop, sideW, bottomRowH - 4, true, opts.schematicDefaults);

    drawStatsFooter(doc, rack, page.placements, page.accessories, deviceDataMap, widthMm / 2, statsY);
  });

  const safeName = opts.schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "Untitled";
  doc.save(`${safeName} - Racks.pdf`);
}
