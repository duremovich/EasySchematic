import { jsPDF } from "jspdf";
import type {
  DeviceData,
  PrintSheetPage,
  RackElevationPage,
  SchematicNode,
  SchematicPage,
  TitleBlock,
} from "./types";
import { getPaperSize, PAGE_MARGIN_IN } from "./printConfig";
import { loadInterFont, drawElevation, drawSideView, hasInterItalic } from "./rackPdf";
import { computeRackStats, formatStatsLine } from "./rackStats";
import { computeCellRects, normalizeSizes, getFieldValue } from "./titleBlockLayout";
import { useSchematicStore } from "./store";

const IN_TO_MM = 25.4;
const PAGE_MARGIN_MM = PAGE_MARGIN_IN * IN_TO_MM; // 10.16mm

// PrintSheetRenderer chrome uses CSS px (96 PPI). Convert to PDF mm and pt for parity.
const PX_TO_MM = 25.4 / 96;
const PX_TO_PT = 72 / 96; // = 0.75

export interface PrintSheetPdfOptions {
  pages: SchematicPage[];
  nodes: SchematicNode[];
  schematicName: string;
  titleBlock?: TitleBlock;
  schematicDefaults?: import("./displayName").SchematicDisplayDefaults;
}

/** Draw the full title block grid (mirrors pdfExport.ts drawTitleBlock, but in mm units). */
async function drawTitleBlockMm(
  doc: jsPDF,
  pageWMm: number,
  pageHMm: number,
  tb: TitleBlock,
  pageNum: number,
  totalPages: number,
) {
  const layout = useSchematicStore.getState().titleBlockLayout;
  const tbHeightMm = layout.heightIn * IN_TO_MM;
  const fullTbWidthMm = pageWMm - 2 * PAGE_MARGIN_MM;
  const tbWidthMm = Math.min(layout.widthIn * IN_TO_MM, fullTbWidthMm);
  const tbLeft = PAGE_MARGIN_MM + fullTbWidthMm - tbWidthMm;
  const tbTop = pageHMm - PAGE_MARGIN_MM - tbHeightMm;

  const cellRects = computeCellRects(layout);
  const normCols = normalizeSizes(layout.columns);
  const normRows = normalizeSizes(layout.rows);

  const colStarts: number[] = [0];
  for (const v of normCols) colStarts.push(colStarts[colStarts.length - 1] + v);
  const rowStarts: number[] = [0];
  for (const v of normRows) rowStarts.push(rowStarts[rowStarts.length - 1] + v);

  const skipHLines = new Set<string>();
  const skipVLines = new Set<string>();
  for (const cell of layout.cells) {
    for (let r = cell.row + 1; r < cell.row + cell.rowSpan; r++)
      for (let c = cell.col; c < cell.col + cell.colSpan; c++)
        skipHLines.add(`${r},${c}`);
    for (let c = cell.col + 1; c < cell.col + cell.colSpan; c++)
      for (let r = cell.row; r < cell.row + cell.rowSpan; r++)
        skipVLines.add(`${c},${r}`);
  }

  // Filled white to match PrintSheetRenderer's on-screen block, which is opaque
  // over anything a viewport overlaps into the band (#359).
  doc.setDrawColor(100, 100, 100);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.12); // ~0.005in in mm
  doc.rect(tbLeft, tbTop, tbWidthMm, tbHeightMm, "FD");

  // Horizontal grid lines
  for (let ri = 1; ri < layout.rows.length; ri++) {
    const y = tbTop + rowStarts[ri] * tbHeightMm;
    let seg: number | null = null;
    for (let c = 0; c <= layout.columns.length; c++) {
      const done = c === layout.columns.length || skipHLines.has(`${ri},${c}`);
      if (done) {
        if (seg !== null) {
          doc.line(tbLeft + colStarts[seg] * tbWidthMm, y, tbLeft + (colStarts[c] ?? 1) * tbWidthMm, y);
          seg = null;
        }
      } else if (seg === null) { seg = c; }
    }
  }

  // Vertical grid lines
  for (let ci = 1; ci < layout.columns.length; ci++) {
    const x = tbLeft + colStarts[ci] * tbWidthMm;
    let seg: number | null = null;
    for (let r = 0; r <= layout.rows.length; r++) {
      const done = r === layout.rows.length || skipVLines.has(`${ci},${r}`);
      if (done) {
        if (seg !== null) {
          doc.line(x, tbTop + rowStarts[seg] * tbHeightMm, x, tbTop + (rowStarts[r] ?? 1) * tbHeightMm);
          seg = null;
        }
      } else if (seg === null) { seg = r; }
    }
  }

  // Cell content
  const padMm = 0.05 * IN_TO_MM; // matches pdfExport.ts pad = 0.05in
  for (const cell of layout.cells) {
    const rect = cellRects.get(cell.id);
    if (!rect) continue;

    const cellX = tbLeft + rect.x * tbWidthMm;
    const cellY = tbTop + rect.y * tbHeightMm;
    const cellW = rect.w * tbWidthMm;
    const cellH = rect.h * tbHeightMm;

    if (cell.content.type === "logo") {
      if (tb.logo) {
        try {
          const img = new Image();
          img.src = tb.logo;
          await new Promise<void>((resolve) => {
            if (img.naturalWidth > 0) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          });
          const natW = img.naturalWidth || cellW;
          const natH = img.naturalHeight || cellH;
          const aspect = natW / natH;
          let drawW = cellW - 2;
          let drawH = drawW / aspect;
          if (drawH > cellH - 2) { drawH = cellH - 2; drawW = drawH * aspect; }
          const drawX = cellX + (cellW - drawW) / 2;
          const drawY = cellY + (cellH - drawH) / 2;
          doc.addImage(tb.logo, "PNG", drawX, drawY, drawW, drawH);
        } catch { /* skip */ }
      }
      continue;
    }

    let text: string;
    if (cell.content.type === "field") {
      text = getFieldValue(tb, cell.content.field);
      if (!text) continue;
    } else if (cell.content.type === "static") {
      text = cell.content.text;
    } else {
      text = `Page ${pageNum} / ${totalPages}`;
    }

    const fontName = cell.fontFamily === "serif" ? "times" : cell.fontFamily === "monospace" ? "courier" : "Inter";
    doc.setFont(fontName, cell.fontWeight === "bold" ? "bold" : "normal");
    doc.setFontSize(cell.fontSize);

    const hex = cell.color.replace("#", "");
    doc.setTextColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));

    let textX: number;
    let align: "left" | "center" | "right";
    if (cell.align === "center") { textX = cellX + cellW / 2; align = "center"; }
    else if (cell.align === "right") { textX = cellX + cellW - padMm; align = "right"; }
    else { textX = cellX + padMm; align = "left"; }

    const textY = cellY + cellH / 2 + (cell.fontSize / 72) * IN_TO_MM * 0.35;
    doc.text(text, textX, textY, { align });
  }
}

export async function exportPrintSheetPdf(opts: PrintSheetPdfOptions): Promise<void> {
  const sheetPages = opts.pages.filter((p): p is PrintSheetPage => p.type === "print-sheet");
  if (sheetPages.length === 0) return;

  const elevationPages = opts.pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");
  const deviceDataMap = new Map<string, DeviceData>();
  for (const n of opts.nodes) if (n.type === "device") deviceDataMap.set(n.id, n.data as DeviceData);

  const firstSheet = sheetPages[0];
  const firstPaper = getPaperSize(firstSheet.paperId, firstSheet.customWidthIn, firstSheet.customHeightIn);
  const firstW = firstSheet.orientation === "landscape" ? firstPaper.heightIn * IN_TO_MM : firstPaper.widthIn * IN_TO_MM;
  const firstH = firstSheet.orientation === "landscape" ? firstPaper.widthIn * IN_TO_MM : firstPaper.heightIn * IN_TO_MM;
  const doc = new jsPDF({ orientation: firstSheet.orientation, unit: "mm", format: [firstW, firstH] });
  await loadInterFont(doc);

  for (let si = 0; si < sheetPages.length; si++) {
    const sheet = sheetPages[si];
    const paper = getPaperSize(sheet.paperId, sheet.customWidthIn, sheet.customHeightIn);
    const pageW = sheet.orientation === "landscape" ? paper.heightIn * IN_TO_MM : paper.widthIn * IN_TO_MM;
    const pageH = sheet.orientation === "landscape" ? paper.widthIn * IN_TO_MM : paper.heightIn * IN_TO_MM;

    if (si > 0) doc.addPage([pageW, pageH], sheet.orientation);

    // Content border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.12);
    const cw = pageW - 2 * PAGE_MARGIN_MM;
    const ch = pageH - 2 * PAGE_MARGIN_MM;
    doc.rect(PAGE_MARGIN_MM, PAGE_MARGIN_MM, cw, ch);

    // Viewports
    for (const vp of sheet.viewports) {
      const { positionMm: pos, sizeMm: size } = vp;
      const srcPage = elevationPages.find((p) => p.id === vp.rackRefPageId);
      const rack = srcPage?.racks.find((r) => r.id === vp.rackRefId);
      if (!srcPage || !rack) continue;

      const centerX = pos.x + size.w / 2;

      // Rack face — face label is drawn below the viewport (not above the frame).
      // Pass the full viewport rect so drawElevation/drawSideView can fit-with-aspect.
      if (vp.kind === "rack-front") {
        drawElevation(doc, rack, srcPage.placements, srcPage.accessories, deviceDataMap, "front", pos.x, pos.y, size.w, size.h, false, opts.schematicDefaults);
      } else if (vp.kind === "rack-rear") {
        drawElevation(doc, rack, srcPage.placements, srcPage.accessories, deviceDataMap, "rear", pos.x, pos.y, size.w, size.h, false, opts.schematicDefaults);
      } else if (vp.kind === "rack-side") {
        drawSideView(doc, rack, srcPage.placements, srcPage.accessories, deviceDataMap, pos.x, pos.y, size.w, size.h, false, opts.schematicDefaults);
      }

      // Chrome below viewport — mirrors PrintSheetRenderer.tsx typography exactly.
      // UI uses CSS px (9px / 7px font, top offsets 2/14/26 px below viewport).
      // PDF: convert px → pt for fonts, px → mm for positions, baseline:"top" so
      // y is the cap-height top (matches HTML div top edge).
      if (vp.showLabel !== false) {
        const kindLabel = vp.kind === "rack-front" ? "Front" : vp.kind === "rack-rear" ? "Rear" : "Side";
        doc.setFont("Inter", hasInterItalic() ? "italic" : "normal");
        doc.setFontSize(9 * PX_TO_PT); // = 6.75pt to match UI 9px
        doc.setTextColor(153, 153, 153); // #999
        doc.text(kindLabel, centerX, pos.y + size.h + 2 * PX_TO_MM, { align: "center", baseline: "top", maxWidth: size.w });
      }

      if (vp.showStats !== false) {
        // Inline stats + caveat — match UI div positioning + sizing.
        const rackPl = srcPage.placements.filter((p) => p.rackId === rack.id);
        const rackAcc = srcPage.accessories.filter((a) => a.rackId === rack.id);
        const stats = computeRackStats(rack, rackPl, rackAcc, deviceDataMap);
        const statsLine = formatStatsLine(stats);

        doc.setFont("Inter", "normal");
        doc.setFontSize(9 * PX_TO_PT);
        doc.setTextColor(68, 68, 68); // #444
        doc.text(statsLine, centerX, pos.y + size.h + 14 * PX_TO_MM, { align: "center", baseline: "top", maxWidth: size.w });

        if (stats.unknownDepthCount > 0 || stats.unknownWeightCount > 0 || stats.unknownPowerCount > 0) {
          const caveat = [
            stats.unknownDepthCount > 0 ? `${stats.unknownDepthCount} unknown depth` : null,
            stats.unknownWeightCount > 0 ? `${stats.unknownWeightCount} unknown weight` : null,
            stats.unknownPowerCount > 0 ? `${stats.unknownPowerCount} unknown power` : null,
          ].filter(Boolean).join(" · ");
          doc.setFontSize(7 * PX_TO_PT); // = 5.25pt to match UI 7px
          doc.setTextColor(153, 153, 153);
          doc.text(caveat, centerX, pos.y + size.h + 26 * PX_TO_MM, { align: "center", baseline: "top", maxWidth: size.w });
        }
      }
    }

    if (sheet.showTitleBlock && opts.titleBlock) {
      await drawTitleBlockMm(doc, pageW, pageH, opts.titleBlock, si + 1, sheetPages.length);
    }
  }

  const safeName = opts.schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "Untitled";
  doc.save(`${safeName} - Sheets.pdf`);
}
