import { type ReactFlowInstance, getViewportForBounds } from "@xyflow/react";
import {
  type PaperSize,
  type Orientation,
  PAGE_MARGIN_IN,
  TITLE_BLOCK_HEIGHT_IN,
} from "./printConfig";

const DPI = 96;
const STYLE_ID = "print-page-style";

export function executePrint(
  reactFlowInstance: ReactFlowInstance,
  paperSize: PaperSize,
  orientation: Orientation,
  scale: number,
) {
  // Resolve paper dimensions based on orientation
  const pageW =
    orientation === "landscape"
      ? Math.max(paperSize.widthIn, paperSize.heightIn)
      : Math.min(paperSize.widthIn, paperSize.heightIn);
  const pageH =
    orientation === "landscape"
      ? Math.min(paperSize.widthIn, paperSize.heightIn)
      : Math.max(paperSize.widthIn, paperSize.heightIn);

  // Printable area in pixels
  const printableW = (pageW - 2 * PAGE_MARGIN_IN) * DPI;
  const printableH =
    (pageH - 2 * PAGE_MARGIN_IN - TITLE_BLOCK_HEIGHT_IN) * DPI;

  // Inject @page rule
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) existingStyle.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `@page { size: ${pageW}in ${pageH}in; margin: 0; } #root { padding: ${PAGE_MARGIN_IN}in; }`;
  document.head.appendChild(style);

  // Find the React Flow container
  const container = document.querySelector(".react-flow") as HTMLElement;
  if (!container) return;

  // Save current state
  const savedViewport = reactFlowInstance.getViewport();
  const savedWidth = container.style.width;
  const savedHeight = container.style.height;

  // Deselect everything for a clean print
  const nodes = reactFlowInstance.getNodes();
  const edges = reactFlowInstance.getEdges();
  const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);
  reactFlowInstance.setNodes(nodes.map((n) => ({ ...n, selected: false })));
  reactFlowInstance.setEdges(edges.map((e) => ({ ...e, selected: false })));

  // Get node bounds
  if (nodes.length === 0) {
    style.remove();
    return;
  }

  const bounds = reactFlowInstance.getNodesBounds(nodes);

  // Resize container to printable area
  container.style.width = `${printableW}px`;
  container.style.height = `${printableH}px`;

  // Compute viewport to fit diagram
  const viewport = getViewportForBounds(
    bounds,
    printableW,
    printableH,
    0.1,
    scale,
    0.05,
  );
  reactFlowInstance.setViewport(viewport, { duration: 0 });

  // Idempotent restore
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    container.style.width = savedWidth;
    container.style.height = savedHeight;
    reactFlowInstance.setViewport(savedViewport, { duration: 0 });
    // Restore selection
    reactFlowInstance.setNodes((nds) =>
      nds.map((n) => ({ ...n, selected: selectedNodeIds.includes(n.id) })),
    );
    reactFlowInstance.setEdges((eds) =>
      eds.map((e) => ({ ...e, selected: selectedEdgeIds.includes(e.id) })),
    );
    const s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  };

  window.addEventListener("afterprint", restore, { once: true });

  // Double rAF to let the DOM settle, then print
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      // Fallback restore in case afterprint doesn't fire (some browsers)
      setTimeout(restore, 500);
    });
  });
}

/** Compute printable dimensions for the info panel */
export function getPrintableArea(
  paperSize: PaperSize,
  orientation: Orientation,
) {
  const pageW =
    orientation === "landscape"
      ? Math.max(paperSize.widthIn, paperSize.heightIn)
      : Math.min(paperSize.widthIn, paperSize.heightIn);
  const pageH =
    orientation === "landscape"
      ? Math.min(paperSize.widthIn, paperSize.heightIn)
      : Math.max(paperSize.widthIn, paperSize.heightIn);

  const printableW = pageW - 2 * PAGE_MARGIN_IN;
  const printableH = pageH - 2 * PAGE_MARGIN_IN - TITLE_BLOCK_HEIGHT_IN;
  return { pageW, pageH, printableW, printableH };
}
