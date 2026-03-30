import {
  type PaperSize,
  type Orientation,
  PAGE_MARGIN_IN,
  TITLE_BLOCK_HEIGHT_IN,
} from "./printConfig";


const DPI = 96;

export interface PageRect {
  index: number;
  col: number;
  row: number;
  /** Top-left X in canvas coords */
  x: number;
  /** Top-left Y in canvas coords */
  y: number;
  /** Full page width in canvas px */
  widthPx: number;
  /** Full page height in canvas px */
  heightPx: number;
  /** Printable area inset X */
  contentX: number;
  /** Printable area inset Y */
  contentY: number;
  /** Printable area width */
  contentW: number;
  /** Printable area height */
  contentH: number;
}

export interface NodeInfo {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  parentId?: string;
}

/** Resolve a node's absolute position (accounts for room parenting). */
function getAbsolutePosition(node: NodeInfo, allNodes: NodeInfo[]): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  if (node.parentId) {
    const parent = allNodes.find((p) => p.id === node.parentId);
    if (parent) {
      x += parent.position.x;
      y += parent.position.y;
    }
  }
  return { x, y };
}

/** Check if any node intersects a page's content area. */
function cellHasContent(
  contentX: number,
  contentY: number,
  contentW: number,
  contentH: number,
  nodes: NodeInfo[],
): boolean {
  for (const n of nodes) {
    const nw = n.measured?.width ?? 180;
    const nh = n.measured?.height ?? 60;
    // AABB intersection
    if (
      n.position.x + nw > contentX &&
      n.position.x < contentX + contentW &&
      n.position.y + nh > contentY &&
      n.position.y < contentY + contentH
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Compute pages that cover all node content, skipping empty cells.
 * Pages tile in a grid over the content bounding box. Only cells
 * that intersect at least one node are included. Pages are numbered
 * sequentially in row-major order (top-to-bottom, left-to-right).
 */
export function computePageGrid(
  paperSize: PaperSize,
  orientation: Orientation,
  scale: number,
  nodes: NodeInfo[],
  titleBlockHeightIn: number = TITLE_BLOCK_HEIGHT_IN,
  originOffsetX: number = 0,
  originOffsetY: number = 0,
): PageRect[] {
  if (nodes.length === 0) return [];

  // Resolve absolute positions for all nodes
  const absNodes = nodes.map((n) => ({
    ...n,
    position: getAbsolutePosition(n, nodes),
  }));

  // Compute content bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of absNodes) {
    const nw = n.measured?.width ?? 180;
    const nh = n.measured?.height ?? 60;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + nw);
    maxY = Math.max(maxY, n.position.y + nh);
  }

  // Resolve paper dimensions based on orientation
  const pageWIn =
    orientation === "landscape"
      ? Math.max(paperSize.widthIn, paperSize.heightIn)
      : Math.min(paperSize.widthIn, paperSize.heightIn);
  const pageHIn =
    orientation === "landscape"
      ? Math.min(paperSize.widthIn, paperSize.heightIn)
      : Math.max(paperSize.widthIn, paperSize.heightIn);

  // Full page in canvas pixels (at current scale)
  const pageWidthPx = (pageWIn * DPI) / scale;
  const pageHeightPx = (pageHIn * DPI) / scale;

  // Margins and title block in canvas pixels
  const marginPx = (PAGE_MARGIN_IN * DPI) / scale;
  const titleBlockPx = (titleBlockHeightIn * DPI) / scale;

  // Printable content area per page
  const contentW = pageWidthPx - 2 * marginPx;
  const contentH = pageHeightPx - 2 * marginPx - titleBlockPx;

  // Add padding beyond content extent
  const pad = 40 / scale;

  // Origin from offset — pages tile in all directions to cover content
  const originX = originOffsetX;
  const originY = originOffsetY;

  // Compute column/row range relative to origin (can be negative)
  const colStart = Math.floor((minX - pad - originX) / pageWidthPx);
  const colEnd = Math.max(colStart + 1, Math.ceil((maxX + pad - originX) / pageWidthPx));
  const rowStart = Math.floor((minY - pad - originY) / pageHeightPx);
  const rowEnd = Math.max(rowStart + 1, Math.ceil((maxY + pad - originY) / pageHeightPx));

  // Build pages, skipping empty cells
  const pages: PageRect[] = [];
  let index = 0;
  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = colStart; col < colEnd; col++) {
      const pageX = originX + col * pageWidthPx;
      const pageY = originY + row * pageHeightPx;
      const contentX = pageX + marginPx;
      const contentY = pageY + marginPx;

      if (!cellHasContent(contentX, contentY, contentW, contentH, absNodes)) {
        continue;
      }

      pages.push({
        index: index++,
        col,
        row,
        x: pageX,
        y: pageY,
        widthPx: pageWidthPx,
        heightPx: pageHeightPx,
        contentX,
        contentY,
        contentW,
        contentH,
      });
    }
  }

  return pages;
}
