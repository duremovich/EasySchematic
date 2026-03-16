import { type ReactFlowInstance } from "@xyflow/react";
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import {
  type PaperSize,
  type Orientation,
  PAGE_MARGIN_IN,
} from "./printConfig";
import { computePageGrid } from "./printPageGrid";
import type { TitleBlock, TitleBlockLayout } from "./types";
import { computeCellRects, normalizeSizes, getFieldValue } from "./titleBlockLayout";

const DPI = 96;
const PIXEL_RATIO = 2;

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
    font-family: system-ui, sans-serif;
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
  "sans-serif": "helvetica",
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

function drawTitleBlock(
  doc: jsPDF,
  pageWIn: number,
  pageHIn: number,
  tb: TitleBlock,
  layout: TitleBlockLayout,
  pageNum: number,
  totalPages: number,
) {
  const margin = PAGE_MARGIN_IN;
  const tbHeight = layout.heightIn;
  const tbTop = pageHIn - margin - tbHeight;
  const fullTbWidth = pageWIn - 2 * margin;
  const tbWidth = Math.min(layout.widthIn, fullTbWidth);
  const tbLeft = margin + fullTbWidth - tbWidth;

  const cellRects = computeCellRects(layout);
  const pad = 0.05;

  // Border
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.005);
  doc.rect(tbLeft, tbTop, tbWidth, tbHeight);

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

    const fontName = PDF_FONT_MAP[cell.fontFamily] ?? "helvetica";
    const fontStyle = cell.fontWeight === "bold" ? "bold" : "normal";

    if (cell.content.type === "logo") {
      if (tb.logo) {
        try {
          const logoPad = 0.03;
          doc.addImage(
            tb.logo,
            "PNG",
            cellX + logoPad,
            cellY + logoPad,
            cellW - logoPad * 2,
            cellH - logoPad * 2,
          );
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

export async function exportPdf(
  rfInstance: ReactFlowInstance,
  paperSize: PaperSize,
  orientation: Orientation,
  scale: number,
  titleBlock: TitleBlock,
  layout: TitleBlockLayout,
): Promise<void> {
  const nodes = rfInstance.getNodes();
  if (nodes.length === 0) return;

  const pages = computePageGrid(paperSize, orientation, scale, nodes, layout.heightIn);

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
  document.documentElement.setAttribute("data-pdf-capturing", "");

  // Content area dimensions in real pixels for capture
  const contentWPx = (pageWIn - 2 * PAGE_MARGIN_IN) * DPI;
  const contentHPx = (pageHIn - 2 * PAGE_MARGIN_IN - layout.heightIn) * DPI;

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

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: "#ffffff",
        width: contentWPx,
        height: contentHPx,
        pixelRatio: PIXEL_RATIO,
        style: {
          width: `${contentWPx}px`,
          height: `${contentHPx}px`,
          transform: `translate(${-page.contentX * scale}px, ${-page.contentY * scale}px) scale(${scale})`,
        },
      });

      // Add image to PDF page
      const imgWidthIn = pageWIn - 2 * PAGE_MARGIN_IN;
      const imgHeightIn = pageHIn - 2 * PAGE_MARGIN_IN - layout.heightIn;
      doc.addImage(dataUrl, "PNG", PAGE_MARGIN_IN, PAGE_MARGIN_IN, imgWidthIn, imgHeightIn);

      // Draw title block with vector text
      drawTitleBlock(doc, pageWIn, pageHIn, titleBlock, layout, i + 1, pages.length);
    }

    // Save the PDF
    updateProgress("Saving PDF...");
    doc.save(`${fileName}.pdf`);
  } finally {
    // Restore everything
    document.documentElement.removeAttribute("data-pdf-capturing");
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
