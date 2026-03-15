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
): PageRect[] {
  if (nodes.length === 0) return [];

  // Resolve absolute positions for all nodes
  const absNodes = nodes.map((n) => ({
    ...n,
    position: getAbsolutePosition(n, nodes),
  }));

  // Compute max extent of content (pages grow right and down from origin)
  let maxX = -Infinity, maxY = -Infinity;
  for (const n of absNodes) {
    const nw = n.measured?.width ?? 180;
    const nh = n.measured?.height ?? 60;
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
  const titleBlockPx = (TITLE_BLOCK_HEIGHT_IN * DPI) / scale;

  // Printable content area per page
  const contentW = pageWidthPx - 2 * marginPx;
  const contentH = pageHeightPx - 2 * marginPx - titleBlockPx;

  // Add padding beyond max content extent
  const pad = 40 / scale;
  const boundsMaxX = maxX + pad;
  const boundsMaxY = maxY + pad;

  // Fixed origin at (0,0) — pages tile right and down from canvas origin.
  // Content at the first page's margin inset gets natural breathing room.
  const originX = 0;
  const originY = 0;

  // Compute how many columns/rows needed to cover content
  const cols = Math.max(1, Math.ceil(boundsMaxX / pageWidthPx));
  const rows = Math.max(1, Math.ceil(boundsMaxY / pageHeightPx));

  // Build pages, skipping empty cells
  const pages: PageRect[] = [];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
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
