import { jsPDF } from "jspdf";
import type { TitleBlock } from "./types";
import type { ReportLayout, ReportTableDef } from "./reportLayout";
import {
  getVisibleColumns,
  getPageDimensions,
  REPORT_MARGIN_MM,
} from "./reportLayout";
import { normalizeSizes, getFieldValue, getFieldLabel } from "./titleBlockLayout";

// ─── Constants ───

const COL_GAP = 4;
const ROW_HEIGHT = 6;
const HEADER_HEIGHT = 7;
const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 9;

// ─── Inter font embedding ───

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

// ─── Table data types ───

export interface ReportTableData {
  id: string;
  rows: Record<string, string>[];
  groupedRows?: Map<string, Record<string, string>[]>;
}

// ─── Grid Block Renderer (shared by header + footer) ───

function drawGridBlock(
  doc: jsPDF,
  layout: ReportLayout,
  titleBlock: TitleBlock,
  block: "header" | "footer",
  pageWidthMm: number,
  pageNum: number,
  totalPages: number,
) {
  const bl = block === "header" ? layout.headerLayout : layout.footerLayout;
  const blockH = block === "header" ? layout.headerHeightMm : layout.footerHeightMm;
  const contentW = pageWidthMm - 2 * REPORT_MARGIN_MM;
  const pageHeight = doc.internal.pageSize.getHeight();
  const blockY = block === "header" ? REPORT_MARGIN_MM : pageHeight - REPORT_MARGIN_MM - blockH;

  const cols = normalizeSizes(bl.columns);
  const rows = normalizeSizes(bl.rows);

  const colStarts: number[] = [0];
  for (let i = 0; i < cols.length; i++) colStarts.push(colStarts[i] + cols[i]);
  const rowStarts: number[] = [0];
  for (let i = 0; i < rows.length; i++) rowStarts.push(rowStarts[i] + rows[i]);

  const FONT_MAP: Record<string, string> = {
    "sans-serif": "Inter",
    serif: "times",
    monospace: "courier",
  };

  for (const cell of bl.cells) {
    const x = REPORT_MARGIN_MM + colStarts[cell.col] * contentW;
    const y = blockY + rowStarts[cell.row] * blockH;
    let w = 0;
    for (let c = cell.col; c < cell.col + cell.colSpan && c < cols.length; c++) w += cols[c];
    w *= contentW;
    let h = 0;
    for (let r = cell.row; r < cell.row + cell.rowSpan && r < rows.length; r++) h += rows[r];
    h *= blockH;

    const fontName = FONT_MAP[cell.fontFamily] ?? "Inter";
    doc.setFont(fontName, cell.fontWeight === "bold" ? "bold" : "normal");
    doc.setFontSize(cell.fontSize);

    const colorMatch = cell.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (colorMatch) {
      doc.setTextColor(parseInt(colorMatch[1], 16), parseInt(colorMatch[2], 16), parseInt(colorMatch[3], 16));
    } else {
      doc.setTextColor(0);
    }

    let text = "";
    switch (cell.content.type) {
      case "field": {
        const val = getFieldValue(titleBlock, cell.content.field);
        if (val) {
          const label = getFieldLabel(titleBlock, cell.content.field);
          text = `${label}: ${val}`;
        }
        break;
      }
      case "static":
        text = cell.content.text;
        break;
      case "pageNumber":
        text = `Page ${pageNum} of ${totalPages}`;
        break;
      case "logo":
        if (titleBlock.logo) {
          try {
            // Get actual image dimensions from jsPDF
            const imgProps = doc.getImageProperties(titleBlock.logo);
            const imgAspect = imgProps.width / imgProps.height;
            const pad = 1;
            const maxW = w - 2 * pad;
            const maxH = h - 2 * pad;
            let lw = maxH * imgAspect;
            let lh = maxH;
            if (lw > maxW) { lw = maxW; lh = lw / imgAspect; }
            const lx = cell.align === "right" ? x + w - lw - pad : cell.align === "center" ? x + (w - lw) / 2 : x + pad;
            const ly = y + (h - lh) / 2;
            doc.addImage(titleBlock.logo, lx, ly, lw, lh);
          } catch { /* skip logo */ }
        }
        break;
    }

    if (text && cell.content.type !== "logo") {
      const textY = y + h / 2 + cell.fontSize * 0.15;
      if (cell.align === "center") {
        doc.text(text, x + w / 2, textY, { align: "center", maxWidth: w - 2 });
      } else if (cell.align === "right") {
        doc.text(text, x + w - 1, textY, { align: "right", maxWidth: w - 2 });
      } else {
        doc.text(text, x + 1, textY, { maxWidth: w - 2 });
      }
    }
  }

  doc.setTextColor(0);
}

// ─── Table Renderer ───

function drawTableSection(
  doc: jsPDF,
  tableDef: ReportTableDef,
  tableData: ReportTableData,
  startY: number,
  bottomLimit: number,
  contentWidthMm: number,
): number {
  const visCols = getVisibleColumns(tableDef, contentWidthMm);
  if (visCols.length === 0) return startY;

  let y = startY;

  const drawSectionTitle = (label: string) => {
    doc.setFontSize(11);
    doc.setFont("Inter", "bold");
    doc.setTextColor(0);
    doc.text(label, REPORT_MARGIN_MM, y);
    y += HEADER_HEIGHT;
    doc.setFont("Inter", "normal");
  };

  drawSectionTitle(tableDef.label);

  const drawHeaders = () => {
    doc.setFontSize(HEADER_FONT_SIZE);
    doc.setFont("Inter", "bold");
    doc.setFillColor(240, 240, 240);
    const totalW = visCols.reduce((s, c) => s + c.widthMm + COL_GAP, -COL_GAP);
    doc.rect(REPORT_MARGIN_MM - 1, y - HEADER_HEIGHT + 2, totalW + COL_GAP, HEADER_HEIGHT, "F");
    doc.setTextColor(0);
    let x = REPORT_MARGIN_MM;
    for (const col of visCols) {
      doc.text(col.header, x, y);
      x += col.widthMm + COL_GAP;
    }
    doc.setFont("Inter", "normal");
    doc.setFontSize(FONT_SIZE);
    y += 2;
  };

  const repeatOnNewPage = () => {
    doc.addPage();
    y = REPORT_MARGIN_MM;
    drawSectionTitle(`${tableDef.label} (Cont'd)`);
    drawHeaders();
  };

  const drawRow = (row: Record<string, string>, rowIndex: number) => {
    y += ROW_HEIGHT;
    if (y > bottomLimit) {
      repeatOnNewPage();
      y += ROW_HEIGHT;
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      const totalW = visCols.reduce((s, c) => s + c.widthMm + COL_GAP, -COL_GAP);
      doc.rect(REPORT_MARGIN_MM - 1, y - ROW_HEIGHT + 2, totalW + COL_GAP, ROW_HEIGHT, "F");
    }

    const isSubItem = row._isSubItem === "true";
    doc.setTextColor(isSubItem ? 120 : 0);
    let x = REPORT_MARGIN_MM;
    for (const col of visCols) {
      const text = row[col.key] ?? "";
      const indent = isSubItem && col.key !== "count" ? 4 : 0;
      doc.text(text, x + indent, y, { maxWidth: col.widthMm - indent });
      x += col.widthMm + COL_GAP;
    }
  };

  const drawGroupHeader = (label: string) => {
    y += ROW_HEIGHT + 2;
    if (y > bottomLimit) {
      repeatOnNewPage();
      y += ROW_HEIGHT + 2;
    }
    doc.setFontSize(FONT_SIZE);
    doc.setFont("Inter", "bold");
    doc.setFillColor(230, 235, 245);
    const totalW = visCols.reduce((s, c) => s + c.widthMm + COL_GAP, -COL_GAP);
    doc.rect(REPORT_MARGIN_MM - 1, y - ROW_HEIGHT + 2, totalW + COL_GAP, ROW_HEIGHT, "F");
    doc.setTextColor(0);
    doc.text(label, REPORT_MARGIN_MM, y);
    doc.setFont("Inter", "normal");
  };

  if (tableData.groupedRows && tableDef.groupBy) {
    drawHeaders();
    for (const [groupLabel, rows] of tableData.groupedRows) {
      drawGroupHeader(groupLabel);
      rows.forEach((row, i) => drawRow(row, i));
    }
  } else {
    drawHeaders();
    tableData.rows.forEach((row, i) => drawRow(row, i));
  }

  return y + ROW_HEIGHT;
}

// ─── Main Export ───

export async function renderReportPdf(
  layout: ReportLayout,
  titleBlock: TitleBlock,
  tableData: ReportTableData[],
  filename: string,
): Promise<void> {
  const { widthMm, heightMm } = getPageDimensions(layout.paperSize, layout.orientation);
  const doc = new jsPDF({
    orientation: layout.orientation,
    unit: "mm",
    format: layout.paperSize,
  });

  // Load Inter font into jsPDF
  await loadInterFont(doc);

  // Footer reserve: content must stop before the footer
  const bottomLimit = heightMm - REPORT_MARGIN_MM - layout.footerHeightMm - 2;

  // Header
  drawGridBlock(doc, layout, titleBlock, "header", widthMm, 1, 1);

  let y = REPORT_MARGIN_MM + layout.headerHeightMm + 4;

  // Tables
  for (const td of tableData) {
    const tableDef = layout.tables.find((t) => t.id === td.id);
    if (!tableDef) continue;

    if (y > bottomLimit - 20) {
      doc.addPage();
      y = REPORT_MARGIN_MM + 6;
    }

    y = drawTableSection(doc, tableDef, td, y, bottomLimit, widthMm - 2 * REPORT_MARGIN_MM);
    y += 6;
  }

  // Draw footer on every page, and update page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawGridBlock(doc, layout, titleBlock, "footer", widthMm, p, totalPages);
  }

  doc.save(filename);
}

