import { type ReactFlowInstance } from "@xyflow/react";
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import {
  type PaperSize,
  type Orientation,
  PAGE_MARGIN_IN,
  TITLE_BLOCK_HEIGHT_IN,
} from "./printConfig";
import { computePageGrid } from "./printPageGrid";

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

function drawTitleBlock(
  doc: jsPDF,
  pageWIn: number,
  pageHIn: number,
  schematicName: string,
  pageNum: number,
  totalPages: number,
) {
  const margin = PAGE_MARGIN_IN;
  const tbHeight = TITLE_BLOCK_HEIGHT_IN;
  const tbTop = pageHIn - margin - tbHeight;
  const tbLeft = margin;
  const tbWidth = pageWIn - 2 * margin;

  // Border
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.01);
  doc.rect(tbLeft, tbTop, tbWidth, tbHeight);

  // Divider line at 60% from left
  const divX = tbLeft + tbWidth * 0.6;
  doc.line(divX, tbTop, divX, tbTop + tbHeight);

  // Left section: schematic name + subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(31, 41, 55);
  doc.text(schematicName, tbLeft + 0.1, tbTop + 0.2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text("AV Signal Flow Diagram", tbLeft + 0.1, tbTop + 0.35);

  // Right section: date, page number, credit
  const rightX = divX + 0.1;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text(today, rightX, tbTop + 0.15);
  doc.text(`Page ${pageNum} of ${totalPages}`, rightX, tbTop + 0.28);
  doc.text("EasySchematic", rightX, tbTop + 0.41);
}

export async function exportPdf(
  rfInstance: ReactFlowInstance,
  paperSize: PaperSize,
  orientation: Orientation,
  scale: number,
  schematicName: string,
): Promise<void> {
  const nodes = rfInstance.getNodes();
  if (nodes.length === 0) return;

  const pages = computePageGrid(paperSize, orientation, scale, nodes);

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
  const contentHPx = (pageHIn - 2 * PAGE_MARGIN_IN - TITLE_BLOCK_HEIGHT_IN) * DPI;

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
      const imgHeightIn = pageHIn - 2 * PAGE_MARGIN_IN - TITLE_BLOCK_HEIGHT_IN;
      doc.addImage(dataUrl, "PNG", PAGE_MARGIN_IN, PAGE_MARGIN_IN, imgWidthIn, imgHeightIn);

      // Draw title block with vector text
      drawTitleBlock(doc, pageWIn, pageHIn, schematicName, i + 1, pages.length);
    }

    // Save the PDF
    updateProgress("Saving PDF...");
    const safeName = schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "") || "Schematic";
    doc.save(`${safeName}.pdf`);
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
