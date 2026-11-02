import { type ReactFlowInstance } from "@xyflow/react";
import { jsPDF } from "jspdf";
import { toBlob } from "html-to-image";
import { freezeSvgColors } from "./freezeSvgColors";
import { capExportPixelRatio } from "./exportUtils";
import { describeExportError, scrubXmlIllegalDom } from "./exportCapturePrep";
import {
  type PaperSize,
  type Orientation,
  PAGE_MARGIN_IN,
  printTitleBlockHeightIn,
} from "./printConfig";
import { computePageGrid, type PageRect } from "./printPageGrid";
import type { TitleBlock, TitleBlockLayout, SchematicNode, ConnectionEdge } from "./types";
import type { RoutedEdge } from "./edgeRouter";
import { computeCellRects, normalizeSizes, getFieldValue } from "./titleBlockLayout";
import { useSchematicStore } from "./store";
import { buildCrossingLabelInfo, crossingLabelText } from "./crossingLabels";
import { transformLabelNow } from "./labelCaseUtils";
import { collectColorKeyEntries, layoutColorKey, type ColorKeyEntry } from "./colorKeyLayout";
import {
  continuationPillText,
  layoutContinuationPills,
  pillIsRotated,
  titleBlockBandInches,
  PILL_FONT_SIZE_PT,
  PILL_GAP_PT,
  PILL_PAD_PT,
  type TitleBlockBand,
} from "./continuationPill";
import { signalColor } from "./typeRegistry";

const DPI = 96;
// 5 × 96 = 480 DPI — well above the 300 DPI print standard, sharp even at high
// zoom in PDF viewers. Bumped from 1.5 to fix soft/pixelated printed output.
// The "FAST" deflate compression on addImage below keeps PDF sizes in check
// independently of pixelRatio — see commit 38ce285.
const TARGET_PIXEL_RATIO = 5;
// PDF pages get a larger raster budget than image export: the 64MP cap made
// big custom sheets visibly fuzzy (~104 DPI on a 100×60in sheet) and the
// 2026-09-05 test pass rejected that — "trade back memory". 16000px stays
// under Chrome's 16384px hard canvas limit; 160MP is a ~640MB RGBA transient
// per page — heavy but bounded, and it only engages beyond standard paper
// (Letter/Arch keep the full 480 DPI target). The ratio may still fall below 1
// at the 200in/side extreme — Chrome physically cannot raster larger, so the
// old Math.max(1, …) floor there only bought broken output for more memory.
const PDF_PAGE_RASTER_BUDGET = {
  maxDimensionPx: 16000,
  maxAreaPx: 160_000_000,
};

// ─── Inter font embedding for jsPDF ───

let interRegularB64: string | null = null;
let interBoldB64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function loadInterFont(doc: jsPDF) {
  if (!interRegularB64) {
    const [regularRes, boldRes] = await Promise.all([
      fetch("/fonts/Inter-Regular.ttf"),
      fetch("/fonts/Inter-Bold.ttf"),
    ]);
    if (!regularRes.ok || !boldRes.ok) {
      throw new Error(`Font fetch failed: regular=${regularRes.status} bold=${boldRes.status}`);
    }
    const [regular, bold] = await Promise.all([
      regularRes.arrayBuffer(),
      boldRes.arrayBuffer(),
    ]);
    interRegularB64 = arrayBufferToBase64(regular);
    interBoldB64 = arrayBufferToBase64(bold);
  }
  doc.addFileToVFS("Inter-Regular.ttf", interRegularB64);
  doc.addFileToVFS("Inter-Bold.ttf", interBoldB64!);
  doc.addFont("Inter-Regular.ttf", "Inter", "normal");
  doc.addFont("Inter-Bold.ttf", "Inter", "bold");
}

/** Build @font-face CSS with base64-embedded Inter for html-to-image.
 *  Bypasses html-to-image's flaky auto font-embedding so glyphs like → survive. */
function getInterFontEmbedCSS(): string {
  if (!interRegularB64 || !interBoldB64) return "";
  return [
    `@font-face { font-family: 'Inter'; font-weight: 400; font-style: normal; src: url(data:font/truetype;base64,${interRegularB64}) format('truetype'); }`,
    `@font-face { font-family: 'Inter'; font-weight: 700; font-style: normal; src: url(data:font/truetype;base64,${interBoldB64}) format('truetype'); }`,
  ].join("\n");
}

/** Wait for rendering to settle (edge routing debounce, etc.) */
function waitForRender(ms = 200): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, ms);
      });
    });
  });
}

function showLoadingOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = "pdf-export-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', system-ui, sans-serif;
  `;
  overlay.innerHTML = `
    <div style="background:white; padding:24px 40px; border-radius:8px; text-align:center; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
      <div style="font-size:16px; font-weight:600; color:#1f2937; margin-bottom:8px;">Generating PDF...</div>
      <div id="pdf-export-progress" style="font-size:13px; color:#6b7280;">Preparing pages</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function updateProgress(text: string) {
  const el = document.getElementById("pdf-export-progress");
  if (el) el.textContent = text;
}

function removeLoadingOverlay() {
  document.getElementById("pdf-export-overlay")?.remove();
}

const PDF_FONT_MAP: Record<string, string> = {
  "sans-serif": "Inter",
  "serif": "times",
  "monospace": "courier",
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

async function drawTitleBlock(
  doc: jsPDF,
  pageWIn: number,
  pageHIn: number,
  tb: TitleBlock,
  layout: TitleBlockLayout,
  pageNum: number,
  totalPages: number,
) {
  // The same band the continuation pills are clamped against
  const band = titleBlockBandInches(pageWIn, pageHIn, layout.widthIn, layout.heightIn);
  if (!band) return;
  const { x: tbLeft, y: tbTop, width: tbWidth, height: tbHeight } = band;

  const cellRects = computeCellRects(layout);
  const pad = 0.05;

  // Border. The block is drawn over the captured drawing raster, so a stroke-only
  // rect lets cables routed under the band show through it — fill it white (#359).
  doc.setDrawColor(100, 100, 100);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.005);
  doc.rect(tbLeft, tbTop, tbWidth, tbHeight, "FD");

  // Cumulative positions (normalized to 0..1)
  const normCols = normalizeSizes(layout.columns);
  const normRows = normalizeSizes(layout.rows);
  const colStarts: number[] = [0];
  for (let i = 0; i < normCols.length; i++) {
    colStarts.push(colStarts[i] + normCols[i]);
  }
  const rowStarts: number[] = [0];
  for (let i = 0; i < normRows.length; i++) {
    rowStarts.push(rowStarts[i] + normRows[i]);
  }

  // Build skip sets for merged cells
  const skipHLines = new Set<string>();
  const skipVLines = new Set<string>();
  for (const cell of layout.cells) {
    for (let r = cell.row + 1; r < cell.row + cell.rowSpan; r++) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
        skipHLines.add(`${r},${c}`);
      }
    }
    for (let c = cell.col + 1; c < cell.col + cell.colSpan; c++) {
      for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
        skipVLines.add(`${c},${r}`);
      }
    }
  }

  // Horizontal grid lines
  for (let ri = 1; ri < layout.rows.length; ri++) {
    const y = tbTop + rowStarts[ri] * tbHeight;
    let segStart: number | null = null;
    for (let c = 0; c < layout.columns.length; c++) {
      if (skipHLines.has(`${ri},${c}`)) {
        if (segStart !== null) {
          doc.line(tbLeft + colStarts[segStart] * tbWidth, y, tbLeft + colStarts[c] * tbWidth, y);
          segStart = null;
        }
      } else {
        if (segStart === null) segStart = c;
      }
    }
    if (segStart !== null) {
      doc.line(tbLeft + colStarts[segStart] * tbWidth, y, tbLeft + tbWidth, y);
    }
  }

  // Vertical grid lines
  for (let ci = 1; ci < layout.columns.length; ci++) {
    const x = tbLeft + colStarts[ci] * tbWidth;
    let segStart: number | null = null;
    for (let r = 0; r < layout.rows.length; r++) {
      if (skipVLines.has(`${ci},${r}`)) {
        if (segStart !== null) {
          doc.line(x, tbTop + rowStarts[segStart] * tbHeight, x, tbTop + rowStarts[r] * tbHeight);
          segStart = null;
        }
      } else {
        if (segStart === null) segStart = r;
      }
    }
    if (segStart !== null) {
      doc.line(x, tbTop + rowStarts[segStart] * tbHeight, x, tbTop + tbHeight);
    }
  }

  // Cell content
  for (const cell of layout.cells) {
    const rect = cellRects.get(cell.id);
    if (!rect) continue;

    const cellX = tbLeft + rect.x * tbWidth;
    const cellY = tbTop + rect.y * tbHeight;
    const cellW = rect.w * tbWidth;
    const cellH = rect.h * tbHeight;

    const fontName = PDF_FONT_MAP[cell.fontFamily] ?? "Inter";
    const fontStyle = cell.fontWeight === "bold" ? "bold" : "normal";

    if (cell.content.type === "logo") {
      if (tb.logo) {
        try {
          const logoPad = 0.03;
          const availW = cellW - logoPad * 2;
          const availH = cellH - logoPad * 2;
          // Load image and await decode to get natural dimensions
          const img = new Image();
          img.src = tb.logo;
          await new Promise<void>((resolve) => {
            if (img.naturalWidth > 0) { resolve(); return; }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
          const natW = img.naturalWidth || availW;
          const natH = img.naturalHeight || availH;
          const aspect = natW / natH;
          let drawW = availW;
          let drawH = availW / aspect;
          if (drawH > availH) {
            drawH = availH;
            drawW = availH * aspect;
          }
          const drawX = cellX + logoPad + (availW - drawW) / 2;
          const drawY = cellY + logoPad + (availH - drawH) / 2;
          doc.addImage(tb.logo, "PNG", drawX, drawY, drawW, drawH);
        } catch {
          // Logo rendering failed — skip silently
        }
      }
      continue;
    }

    let text: string;
    let color = cell.color;
    switch (cell.content.type) {
      case "field": {
        const value = getFieldValue(tb, cell.content.field);
        text = value || "";
        if (!value) continue; // Don't render empty fields in PDF
        break;
      }
      case "static":
        text = cell.content.text;
        color = cell.color;
        break;
      case "pageNumber":
        text = `Page ${pageNum} / ${totalPages}`;
        break;
    }

    doc.setFont(fontName, fontStyle);
    doc.setFontSize(cell.fontSize);
    const [r, g, b] = hexToRgb(color);
    doc.setTextColor(r, g, b);

    let textX: number;
    let align: "left" | "center" | "right";
    if (cell.align === "center") {
      textX = cellX + cellW / 2;
      align = "center";
    } else if (cell.align === "right") {
      textX = cellX + cellW - pad;
      align = "right";
    } else {
      textX = cellX + pad;
      align = "left";
    }

    const textY = cellY + cellH / 2 + (cell.fontSize / 72) * 0.35;
    doc.text(text, textX, textY, { align });
  }
}

function drawContentBorder(
  doc: jsPDF,
  pageWIn: number,
  pageHIn: number,
) {
  const margin = PAGE_MARGIN_IN;
  const contentW = pageWIn - 2 * margin;
  const contentH = pageHIn - 2 * margin;
  doc.saveGraphicsState();
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.005);
  doc.rect(margin, margin, contentW, contentH);
  doc.restoreGraphicsState();
}

export interface PdfCrossingLabel {
  /** X position in inches */
  x: number;
  /** Y position in inches */
  y: number;
  text: string;
  anchor: "left" | "right" | "up" | "down";
  /** Signal wire color (hex) */
  color: string;
  /** Sheet the connection carries on to (1-indexed, 0 when it lands off every page) */
  pageNum: number;
}

/** Which sheet (1-indexed) a canvas point falls on, or 0 for none. */
function pdfPageAtPoint(x: number, y: number, pages: PageRect[]): number {
  for (const p of pages) {
    if (x >= p.x && x < p.x + p.widthPx && y >= p.y && y < p.y + p.heightPx) {
      return p.index + 1;
    }
  }
  return 0;
}

export function computePdfCrossingLabels(
  page: PageRect,
  pages: PageRect[],
  routedEdges: Record<string, RoutedEdge>,
  edges: ConnectionEdge[],
  nodes: SchematicNode[],
  scale: number,
): PdfCrossingLabel[] {
  if (pages.length <= 1) return [];

  // Collect page boundary lines in canvas px (internal edges only)
  const minCol = Math.min(...pages.map((p) => p.col));
  const minRow = Math.min(...pages.map((p) => p.row));
  const vLines = new Set<number>();
  const hLines = new Set<number>();
  for (const p of pages) {
    if (p.col > minCol) vLines.add(p.x);
    if (p.row > minRow) hLines.add(p.y);
    vLines.add(p.x + p.widthPx);
    hLines.add(p.y + p.heightPx);
  }

  const marginPx = page.contentX - page.x;

  // Band of canvas the page actually shows. The capture below spans the whole
  // sheet inside the print margins — `page.contentH` additionally subtracts the
  // title-block strip, which the raster still covers (the block is drawn over it
  // afterwards, and crossing labels are drawn over that). Bounding against
  // contentH dropped every label for a wire leaving the BOTTOM of a page, since
  // that label sits a title-block height below it (#317).
  const drawnLeft = page.x + marginPx;
  const drawnRight = page.x + page.widthPx - marginPx;
  const drawnTop = page.y + marginPx;
  const drawnBottom = page.y + page.heightPx - marginPx;

  // Devices name themselves; stub-label nodes proxy to the FAR device of their
  // logical connection, past any hidden inline adapter. The editor overlay builds
  // the very same lookup from the very same function, so neither surface can emit a
  // pill the other skips — and since the spread moves each edge's pills as a group,
  // an extra pill on one surface displaces the ones they share (#361).
  const nodeInfo = buildCrossingLabelInfo(
    nodes,
    edges,
    // The room rides along as "Device (Room)", so it takes the display-case
    // preference just like the device label beneath it (#294).
    transformLabelNow,
    useSchematicStore.getState().hiddenAdapterNodeIds,
  );

  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  const labels: PdfCrossingLabel[] = [];

  // Resolve signal color for an edge
  const storeColors = useSchematicStore.getState().signalColors;
  const resolveColor = (edge: ConnectionEdge): string => {
    const st = edge.data?.signalType;
    if (!st) return signalColor("custom");
    return storeColors?.[st] ?? signalColor(st);
  };

  // Convert canvas px to inches relative to this page's content area
  const toPageX = (cx: number) => PAGE_MARGIN_IN + (cx - page.contentX) * scale / DPI;
  const toPageY = (cy: number) => PAGE_MARGIN_IN + (cy - page.contentY) * scale / DPI;

  for (const [edgeId, route] of Object.entries(routedEdges)) {
    const edge = edgeMap.get(edgeId);
    if (!edge) continue;
    const sourceInfo = nodeInfo.get(edge.source);
    const targetInfo = nodeInfo.get(edge.target);
    if (!sourceInfo || !targetInfo) continue;

    const edgeColor = resolveColor(edge);

    for (const seg of route.segments) {
      if (seg.axis === "h") {
        const y = seg.y1;
        // A vertical boundary is shared by every page in its column, so the crossing
        // may well run across a different sheet than this one. The page rects tile the
        // grid, so testing the crossing against this sheet's own rect hands it to
        // exactly one sheet — the same one the editor overlay draws it on (#357).
        // Bounding against the print margins instead would drop crossings in the
        // margin strip, which no sheet's band claims and the editor still shows.
        if (y < page.y || y >= page.y + page.heightPx) continue;
        const minX = Math.min(seg.x1, seg.x2);
        const maxX = Math.max(seg.x1, seg.x2);
        const goingRight = seg.x2 > seg.x1;
        for (const bx of vLines) {
          if (bx > minX && bx < maxX) {
            const rightwardTarget = goingRight ? targetInfo : sourceInfo;
            const leftwardTarget = goingRight ? sourceInfo : targetInfo;

            const insetPx = marginPx * 0.15;
            const leftPx = bx - marginPx - insetPx;
            const rightPx = bx + marginPx + insetPx;
            const rightPageNum = pdfPageAtPoint(bx + 1, y, pages);
            const leftPageNum = pdfPageAtPoint(bx - 1, y, pages);

            if (leftPx >= drawnLeft && leftPx <= drawnRight) {
              const text = crossingLabelText(rightwardTarget);
              labels.push({ x: toPageX(leftPx), y: toPageY(y), text, anchor: "left", color: edgeColor, pageNum: rightPageNum });
            }
            if (rightPx >= drawnLeft && rightPx <= drawnRight) {
              const text = crossingLabelText(leftwardTarget);
              labels.push({ x: toPageX(rightPx), y: toPageY(y), text, anchor: "right", color: edgeColor, pageNum: leftPageNum });
            }
          }
        }
      } else {
        const x = seg.x1;
        // Likewise a horizontal boundary is shared by every page in its row.
        if (x < page.x || x >= page.x + page.widthPx) continue;
        const minY = Math.min(seg.y1, seg.y2);
        const maxY = Math.max(seg.y1, seg.y2);
        const goingDown = seg.y2 > seg.y1;
        for (const by of hLines) {
          if (by > minY && by < maxY) {
            const downwardTarget = goingDown ? targetInfo : sourceInfo;
            const upwardTarget = goingDown ? sourceInfo : targetInfo;

            const insetPx = marginPx * 0.15;
            const upPx = by - marginPx - insetPx;
            const downPx = by + marginPx + insetPx;
            const downPageNum = pdfPageAtPoint(x, by + 1, pages);
            const upPageNum = pdfPageAtPoint(x, by - 1, pages);

            if (upPx >= drawnTop && upPx <= drawnBottom) {
              const text = crossingLabelText(downwardTarget);
              labels.push({ x: toPageX(x), y: toPageY(upPx), text, anchor: "up", color: edgeColor, pageNum: downPageNum });
            }
            if (downPx >= drawnTop && downPx <= drawnBottom) {
              const text = crossingLabelText(upwardTarget);
              labels.push({ x: toPageX(x), y: toPageY(downPx), text, anchor: "down", color: edgeColor, pageNum: upPageNum });
            }
          }
        }
      }
    }
  }

  return labels;
}

function drawCrossingLabels(
  doc: jsPDF,
  labels: PdfCrossingLabel[],
  titleBlockBand: TitleBlockBand | null,
  pageWIn: number,
  pageHIn: number,
) {
  if (labels.length === 0) return;
  doc.saveGraphicsState();

  // Type size, padding, gap and the pill text itself are shared with the editor
  // overlay: placement is driven by the pill's measured box, so the preview has to
  // measure the same box the sheet prints or it stops showing what prints (#357).
  const fontSize = PILL_FONT_SIZE_PT; // points
  const pad = PILL_PAD_PT / 72; // inches — uniform on all sides
  const radius = 0.02;
  const pillGap = PILL_GAP_PT / 72;

  doc.setFont("Inter", "normal");
  doc.setFontSize(fontSize);

  const bands = titleBlockBand ? [titleBlockBand] : [];
  // Every label here belongs to the one sheet being drawn, so anchor alone names the
  // page edge a pill may slide along.
  const acrossSheet = { min: PAGE_MARGIN_IN, max: pageWIn - PAGE_MARGIN_IN };
  const downSheet = { min: PAGE_MARGIN_IN, max: pageHIn - PAGE_MARGIN_IN };

  const texts = labels.map((l) => continuationPillText(l.text, l.pageNum));
  const boxH = fontSize / 72 + pad * 2;

  // Grows inward from the boundary along its own wire — top/bottom-edge pills come
  // back rotated 90° onto the vertical wire they belong to, as an axis-aligned
  // narrow-and-tall box. Near-coincident crossings still slide apart along the edge
  // (#357), and a pill that landed on the title block rides up off it — the pill is
  // opaque and would white the block out (#337).
  const boxes = layoutContinuationPills(
    labels.map((l, i) => ({
      anchor: l.anchor,
      x: l.x,
      y: l.y,
      // getTextWidth is pure font metrics in the document unit — rotation happens at
      // draw time and does not change how long the text run is.
      width: doc.getTextWidth(texts[i]) + pad * 2,
      height: boxH,
      limit: pillIsRotated(l.anchor) ? acrossSheet : downSheet,
    })),
    bands,
    pillGap,
  );

  labels.forEach((l, i) => {
    const displayText = texts[i];
    const box = boxes[i];

    // White pill background with signal-colored border. The 90° rotation keeps the
    // box axis-aligned, so roundedRect draws both orientations as-is.
    const [cr, cg, cb] = hexToRgb(l.color);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.004);
    doc.roundedRect(box.x, box.y, box.width, box.height, radius, radius, "FD");

    // Arrow + text as single string
    doc.setFont("Inter", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(55, 65, 81);
    if (pillIsRotated(l.anchor)) {
      // Along the vertical wire, reading bottom-to-top (the drawing convention).
      // jsPDF's angle is counterclockwise; the baseline offset that centres flat
      // text in its box turns into a horizontal offset once the text is upright.
      doc.text(
        displayText,
        box.x + box.width / 2 + (fontSize / 72) * 0.35,
        box.y + box.height - pad,
        { angle: 90 },
      );
    } else {
      doc.text(displayText, box.x + pad, box.y + box.height / 2 + (fontSize / 72) * 0.35);
    }
  });
  doc.restoreGraphicsState();
}

/** Convert SVG dash-array string (e.g. "8 4") to inch-scaled numeric array for jsPDF. */
function dashArrayToInches(dashStr: string | undefined, scale: number): number[] {
  if (!dashStr) return [];
  return dashStr.split(/\s+/).map((v) => parseFloat(v) * scale);
}

function drawColorKey(
  doc: jsPDF,
  pageWIn: number,
  pageHIn: number,
  entries: ColorKeyEntry[],
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  columns: number,
) {
  if (entries.length === 0) return;
  doc.saveGraphicsState();

  const margin = PAGE_MARGIN_IN;
  const fontSize = 6; // pt
  const headerFontSize = 7; // pt
  const swatchLen = 0.25; // inches
  const swatchGap = 0.06;
  const cellW = 0.8;
  const cellH = fontSize / 72 * 1.8;
  const padding = 0.08;
  const headerH = headerFontSize / 72 * 1.8;
  const dashScale = swatchLen / 20; // SVG units → inches

  const geo = layoutColorKey(entries, columns, cellW, cellH, padding, headerH);

  // Flush with drawing border — locked into the corner like the title block
  const contentW = pageWIn - 2 * margin;
  const drawingH = pageHIn - 2 * margin; // full drawing border height
  const isRight = corner.includes("right");
  const isBottom = corner.includes("bottom");

  const ox = isRight ? margin + contentW - geo.width : margin;
  const oy = isBottom ? margin + drawingH - geo.height : margin;

  // White fill + black border — matches title block style
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.005);
  doc.rect(ox, oy, geo.width, geo.height, "FD");

  // Header divider line
  doc.line(ox, oy + padding + headerH, ox + geo.width, oy + padding + headerH);

  // Header text
  doc.setFont("Inter", "bold");
  doc.setFontSize(headerFontSize);
  doc.setTextColor(0, 0, 0);
  doc.text("SIGNAL KEY", ox + padding, oy + padding + headerFontSize / 72 * 0.85);

  // Entries
  doc.setFont("Inter", "normal");
  doc.setFontSize(fontSize);
  doc.setLineWidth(0.012);

  for (const { entry, x, y } of geo.entries) {
    const absX = ox + x;
    const absY = oy + y;
    const lineY = absY + cellH / 2;

    // Swatch line
    const [r, g, b] = hexToRgb(entry.color);
    doc.setDrawColor(r, g, b);
    const dash = dashArrayToInches(entry.dashArray, dashScale);
    if (dash.length > 0) {
      doc.setLineDashPattern(dash, 0);
    }
    doc.line(absX, lineY, absX + swatchLen, lineY);
    if (dash.length > 0) {
      doc.setLineDashPattern([], 0);
    }

    // Label
    doc.setTextColor(0, 0, 0);
    doc.text(entry.label, absX + swatchLen + swatchGap, lineY + (fontSize / 72) * 0.35);
  }

  doc.restoreGraphicsState();
}

export async function exportPdf(
  rfInstance: ReactFlowInstance,
  paperSize: PaperSize,
  orientation: Orientation,
  scale: number,
  titleBlock: TitleBlock,
  storedLayout: TitleBlockLayout,
): Promise<void> {
  const nodes = rfInstance.getNodes();
  if (nodes.length === 0) return;

  const { printOriginOffsetX, printOriginOffsetY, printTitleBlockEnabled } = useSchematicStore.getState();
  // A hidden title block is a zero-height one: drawTitleBlock finds no band and
  // draws nothing, pills have nothing to dodge, and the page grid gives its height
  // back to the drawing (#388).
  const layout: TitleBlockLayout = {
    ...storedLayout,
    heightIn: printTitleBlockHeightIn(storedLayout, printTitleBlockEnabled),
  };
  const pages = computePageGrid(paperSize, orientation, scale, nodes, layout.heightIn, printOriginOffsetX, printOriginOffsetY);

  if (pages.length === 0) return;

  showLoadingOverlay();

  // Resolve paper dimensions
  const pageWIn =
    orientation === "landscape"
      ? Math.max(paperSize.widthIn, paperSize.heightIn)
      : Math.min(paperSize.widthIn, paperSize.heightIn);
  const pageHIn =
    orientation === "landscape"
      ? Math.min(paperSize.widthIn, paperSize.heightIn)
      : Math.max(paperSize.widthIn, paperSize.heightIn);

  // Create jsPDF document (first page added automatically)
  const doc = new jsPDF({
    orientation: orientation === "landscape" ? "landscape" : "portrait",
    unit: "in",
    format: [pageWIn, pageHIn],
  });

  // Load Inter font into jsPDF — must succeed before drawing
  try {
    await loadInterFont(doc);
  } catch (err) {
    console.error("Failed to load Inter font for PDF:", err);
    useSchematicStore.getState().addToast("PDF export failed — couldn't load the embedded font.", "error");
    removeLoadingOverlay();
    return;
  }

  // Save current state
  const savedViewport = rfInstance.getViewport();
  const container = document.querySelector(".react-flow") as HTMLElement;
  const savedWidth = container.style.width;
  const savedHeight = container.style.height;

  // Save selection state
  const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const edges = rfInstance.getEdges();
  const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);

  // Deselect all
  rfInstance.setNodes(nodes.map((n) => ({ ...n, selected: false })));
  rfInstance.setEdges(edges.map((e) => ({ ...e, selected: false })));

  // Add capturing attribute to hide overlays
  document.documentElement.setAttribute("data-export-capturing", "");

  // Content area dimensions in real pixels for capture
  // Use full page height (minus margins only) so nodes near the title block boundary
  // don't get clipped — the title block is drawn as vector graphics on top afterward
  const contentWPx = (pageWIn - 2 * PAGE_MARGIN_IN) * DPI;
  const contentHPx = (pageHIn - 2 * PAGE_MARGIN_IN) * DPI;

  // Derive a filename from the title block
  const fileName = (titleBlock.drawingTitle || titleBlock.showName || "Schematic").replace(/[^a-zA-Z0-9-_ ]/g, "") || "Schematic";

  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      updateProgress(`Capturing page ${i + 1} of ${pages.length}...`);

      if (i > 0) {
        doc.addPage([pageWIn, pageHIn], orientation === "landscape" ? "landscape" : "portrait");
      }

      // Resize container to match content capture area
      container.style.width = `${contentWPx}px`;
      container.style.height = `${contentHPx}px`;

      // Set viewport to show this page's content area
      rfInstance.setViewport(
        {
          x: -page.contentX * scale,
          y: -page.contentY * scale,
          zoom: scale,
        },
        { duration: 0 },
      );

      // Wait for edges to route and render to settle
      await waitForRender(200);

      // Capture the viewport element
      const viewportEl = document.querySelector(".react-flow__viewport") as HTMLElement;
      if (!viewportEl) continue;

      // Firefox returns `undefined` from getPropertyValue() for unrecognized CSS
      // properties, but html-to-image calls .trim() on the result without a null
      // check. Patch it to return '' instead while html-to-image runs.
      const origGetPropertyValue = CSSStyleDeclaration.prototype.getPropertyValue;
      CSSStyleDeclaration.prototype.getPropertyValue = function (prop) {
        return origGetPropertyValue.call(this, prop) ?? '';
      };
      const pixelRatio = capExportPixelRatio(TARGET_PIXEL_RATIO, contentWPx, contentHPx, PDF_PAGE_RASTER_BUDGET);
      // Freeze var(--color-…) strokes to concrete colors so Chromium's
      // html-to-image clone keeps the connection lines (#173).
      const restoreColors = freezeSvgColors(viewportEl);
      const restoreText = scrubXmlIllegalDom(viewportEl);
      // Capture to a Blob, not a base64 data URL — the URL held each page's raster
      // twice over as a giant string on top of jsPDF's own copy (#383).
      let pageBlob: Blob | null;
      try {
        pageBlob = await toBlob(viewportEl, {
          backgroundColor: "#ffffff",
          width: contentWPx,
          height: contentHPx,
          pixelRatio,
          fontEmbedCSS: getInterFontEmbedCSS(),
          style: {
            width: `${contentWPx}px`,
            height: `${contentHPx}px`,
            transform: `translate(${-page.contentX * scale}px, ${-page.contentY * scale}px) scale(${scale})`,
          },
        });
      } finally {
        restoreText();
        restoreColors();
        CSSStyleDeclaration.prototype.getPropertyValue = origGetPropertyValue;
      }
      // canvas.toBlob resolves null when the browser can't encode the raster.
      // The page was already added to the doc, so continuing here would ship a
      // silently blank sheet in the middle of a client deliverable — abort loudly.
      if (!pageBlob) {
        throw new Error(`Couldn't render page ${i + 1} of ${pages.length} — the sheet is too large for this browser.`);
      }
      const pagePng = new Uint8Array(await pageBlob.arrayBuffer());

      // Add image to PDF page (full height minus margins — title block drawn on top)
      const imgWidthIn = pageWIn - 2 * PAGE_MARGIN_IN;
      const imgHeightIn = pageHIn - 2 * PAGE_MARGIN_IN;
      doc.addImage(pagePng, "PNG", PAGE_MARGIN_IN, PAGE_MARGIN_IN, imgWidthIn, imgHeightIn, undefined, "FAST");

      // Draw content border and title block with vector graphics
      drawContentBorder(doc, pageWIn, pageHIn);
      await drawTitleBlock(doc, pageWIn, pageHIn, titleBlock, layout, i + 1, pages.length);

      // Draw crossing labels
      const storeState = useSchematicStore.getState();
      const pdfLabels = computePdfCrossingLabels(
        page, pages, storeState.routedEdges, storeState.edges, storeState.nodes, scale,
      );
      drawCrossingLabels(
        doc,
        pdfLabels,
        titleBlockBandInches(pageWIn, pageHIn, layout.widthIn, layout.heightIn),
        pageWIn,
        pageHIn,
      );

      // Draw color key / signal legend
      if (storeState.colorKeyEnabled) {
        const ckPage = storeState.colorKeyPage;
        const showOnThis = ckPage === "all" || (ckPage === "first" && i === 0) || (ckPage === "last" && i === pages.length - 1);
        if (showOnThis) {
          const ckEntries = collectColorKeyEntries(storeState.edges, storeState.signalColors, storeState.signalLineStyles, storeState.colorKeyOverrides);
          drawColorKey(doc, pageWIn, pageHIn, ckEntries, storeState.colorKeyCorner, storeState.colorKeyColumns);
        }
      }
    }

    // Save the PDF
    updateProgress("Saving PDF...");
    doc.save(`${fileName}.pdf`);
  } catch (err) {
    // Callers fire-and-forget exportPdf, so an unsurfaced throw is an invisible
    // failure — no download and no explanation.
    console.error("PDF export failed:", err);
    useSchematicStore
      .getState()
      .addToast(`PDF export failed — ${describeExportError(err)}`, "error");
  } finally {
    // Restore everything
    document.documentElement.removeAttribute("data-export-capturing");
    container.style.width = savedWidth;
    container.style.height = savedHeight;
    rfInstance.setViewport(savedViewport, { duration: 0 });

    // Restore selection
    rfInstance.setNodes((nds) =>
      nds.map((n) => ({ ...n, selected: selectedNodeIds.includes(n.id) })),
    );
    rfInstance.setEdges((eds) =>
      eds.map((e) => ({ ...e, selected: selectedEdgeIds.includes(e.id) })),
    );

    removeLoadingOverlay();
  }
}
