import { memo } from "react";
import { useViewport, useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { computePageGrid, type PageRect } from "../printPageGrid";
import { PAPER_SIZES } from "../printConfig";
import type { TitleBlock, TitleBlockLayout } from "../types";
import { computeCellRects, normalizeSizes, getFieldValue, getFieldLabel } from "../titleBlockLayout";

function PageBoundaryOverlay() {
  const { x: vx, y: vy, zoom } = useViewport();
  const rfInstance = useReactFlow();

  const printPaperId = useSchematicStore((s) => s.printPaperId);
  const printOrientation = useSchematicStore((s) => s.printOrientation);
  const printScale = useSchematicStore((s) => s.printScale);
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const titleBlockLayout = useSchematicStore((s) => s.titleBlockLayout);
  // Subscribe to node positions so the overlay re-renders when nodes move
  useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );

  const paperSize = PAPER_SIZES.find((p) => p.id === printPaperId) ?? PAPER_SIZES[2]; // tabloid default
  const nodes = rfInstance.getNodes();

  const pages = computePageGrid(paperSize, printOrientation, printScale, nodes, titleBlockLayout.heightIn);

  if (pages.length === 0) return null;

  const totalPages = pages.length;

  return (
    <div
      className="page-boundary-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 999,
        overflow: "hidden",
      }}
    >
      <svg
        style={{
          position: "absolute",
          overflow: "visible",
          width: 1,
          height: 1,
          transform: `translate(${vx}px, ${vy}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {pages.map((p) => (
          <PageOverlay key={p.index} page={p} zoom={zoom} titleBlock={titleBlock} layout={titleBlockLayout} totalPages={totalPages} />
        ))}
      </svg>
    </div>
  );
}

const FONT_FAMILY_MAP: Record<string, string> = {
  "sans-serif": "system-ui, sans-serif",
  "serif": "Georgia, serif",
  "monospace": "'Courier New', monospace",
};

function PageOverlay({
  page: p,
  zoom,
  titleBlock: tb,
  layout,
  totalPages,
}: {
  page: PageRect;
  zoom: number;
  titleBlock: TitleBlock;
  layout: TitleBlockLayout;
  totalPages: number;
}) {
  const fontSize = 14 / zoom;
  const labelFontSize = 10 / zoom;

  // Title block geometry
  const marginPx = p.contentX - p.x;
  const tbTop = p.contentY + p.contentH;
  const tbHeight = (p.y + p.heightPx) - tbTop - marginPx;
  const hasTitleBlock = tbHeight > 0;

  // Title block width from layout (fixed inches → canvas pixels)
  const pxPerIn = marginPx / 0.4; // PAGE_MARGIN_IN = 0.4
  const tbBoxW = Math.min(layout.widthIn * pxPerIn, p.contentW);
  const tbBoxX = p.contentX + p.contentW - tbBoxW;
  const pxPerPt = pxPerIn / 72; // convert font points to page pixels
  const stroke = 0.5 * pxPerPt; // scale with page, not screen

  const cellRects = computeCellRects(layout);
  const pad = 3 * pxPerPt;

  // Build a set of grid lines that should NOT be drawn (inside merged cells)
  const skipHLines = new Set<string>(); // "row,colStart,colEnd"
  const skipVLines = new Set<string>(); // "col,rowStart,rowEnd"
  for (const cell of layout.cells) {
    // Skip horizontal lines inside merged cells
    for (let r = cell.row + 1; r < cell.row + cell.rowSpan; r++) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
        skipHLines.add(`${r},${c}`);
      }
    }
    // Skip vertical lines inside merged cells
    for (let c = cell.col + 1; c < cell.col + cell.colSpan; c++) {
      for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
        skipVLines.add(`${c},${r}`);
      }
    }
  }

  // Cumulative column/row positions (normalized to 0..1)
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

  return (
    <g>
      {/* Page boundary — solid border */}
      <rect
        x={p.x}
        y={p.y}
        width={p.widthPx}
        height={p.heightPx}
        fill="none"
        stroke="#6b7280"
        strokeWidth={1.5 / zoom}
      />

      {/* Drawing border at print margin */}
      <rect
        x={p.contentX}
        y={p.contentY}
        width={p.contentW}
        height={(p.y + p.heightPx) - p.contentY - marginPx}
        fill="none"
        stroke="#000000"
        strokeWidth={1 / zoom}
      />

      {/* Title block */}
      {hasTitleBlock && (
        <g>
          {/* Outer border */}
          <rect
            x={tbBoxX}
            y={tbTop}
            width={tbBoxW}
            height={tbHeight}
            fill="none"
            stroke="#000000"
            strokeWidth={stroke}
          />

          {/* Horizontal grid lines (between rows) */}
          {rowStarts.slice(1, -1).map((frac, i) => {
            const rowIdx = i + 1;
            // Find segments where line should be drawn (skip merged)
            const segments: [number, number][] = [];
            let segStart: number | null = null;
            for (let c = 0; c < layout.columns.length; c++) {
              if (skipHLines.has(`${rowIdx},${c}`)) {
                if (segStart !== null) {
                  segments.push([segStart, c]);
                  segStart = null;
                }
              } else {
                if (segStart === null) segStart = c;
              }
            }
            if (segStart !== null) segments.push([segStart, layout.columns.length]);

            return segments.map(([sc, ec]) => (
              <line
                key={`h-${rowIdx}-${sc}-${ec}`}
                x1={tbBoxX + colStarts[sc] * tbBoxW}
                y1={tbTop + frac * tbHeight}
                x2={tbBoxX + colStarts[ec] * tbBoxW}
                y2={tbTop + frac * tbHeight}
                stroke="#000000"
                strokeWidth={stroke}
              />
            ));
          })}

          {/* Vertical grid lines (between columns) */}
          {colStarts.slice(1, -1).map((frac, i) => {
            const colIdx = i + 1;
            const segments: [number, number][] = [];
            let segStart: number | null = null;
            for (let r = 0; r < layout.rows.length; r++) {
              if (skipVLines.has(`${colIdx},${r}`)) {
                if (segStart !== null) {
                  segments.push([segStart, r]);
                  segStart = null;
                }
              } else {
                if (segStart === null) segStart = r;
              }
            }
            if (segStart !== null) segments.push([segStart, layout.rows.length]);

            return segments.map(([sr, er]) => (
              <line
                key={`v-${colIdx}-${sr}-${er}`}
                x1={tbBoxX + frac * tbBoxW}
                y1={tbTop + rowStarts[sr] * tbHeight}
                x2={tbBoxX + frac * tbBoxW}
                y2={tbTop + rowStarts[er] * tbHeight}
                stroke="#000000"
                strokeWidth={stroke}
              />
            ));
          })}

          {/* Cell content */}
          {layout.cells.map((cell) => {
            const rect = cellRects.get(cell.id);
            if (!rect) return null;

            const cellX = tbBoxX + rect.x * tbBoxW;
            const cellY = tbTop + rect.y * tbHeight;
            const cellW = rect.w * tbBoxW;
            const cellH = rect.h * tbHeight;
            const cellFontSize = cell.fontSize * pxPerPt;
            const fontFamily = FONT_FAMILY_MAP[cell.fontFamily] ?? "system-ui, sans-serif";

            let textContent: string;
            let fillColor = cell.color;
            let isPlaceholder = false;

            switch (cell.content.type) {
              case "field": {
                const value = getFieldValue(tb, cell.content.field);
                if (value) {
                  textContent = value;
                } else {
                  textContent = getFieldLabel(tb, cell.content.field);
                  fillColor = "#9ca3af";
                  isPlaceholder = true;
                }
                break;
              }
              case "static":
                textContent = cell.content.text;
                break;
              case "pageNumber":
                textContent = `Page ${p.index + 1} / ${totalPages}`;
                break;
              case "logo":
                return tb.logo ? (
                  <image
                    key={cell.id}
                    href={tb.logo}
                    x={cellX + pad}
                    y={cellY + pad}
                    width={cellW - pad * 2}
                    height={cellH - pad * 2}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : null;
            }

            // Compute text position based on alignment
            let textX: number;
            let anchor: "start" | "middle" | "end";
            if (cell.align === "center") {
              textX = cellX + cellW / 2;
              anchor = "middle";
            } else if (cell.align === "right") {
              textX = cellX + cellW - pad;
              anchor = "end";
            } else {
              textX = cellX + pad;
              anchor = "start";
            }

            const textY = cellY + cellH / 2 + cellFontSize * 0.35;

            return (
              <text
                key={cell.id}
                x={textX}
                y={textY}
                textAnchor={anchor}
                fill={fillColor}
                fontSize={cellFontSize}
                fontFamily={fontFamily}
                fontWeight={cell.fontWeight === "bold" ? "600" : "normal"}
                fontStyle={isPlaceholder ? "italic" : undefined}
              >
                {textContent}
              </text>
            );
          })}
        </g>
      )}

      {/* Page number at top */}
      <text
        x={p.x + p.widthPx / 2}
        y={p.y + fontSize * 1.5}
        textAnchor="middle"
        fill="#6b7280"
        fontSize={fontSize}
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        Page {p.index + 1}
      </text>

      {/* Dimensions label */}
      <text
        x={p.x + p.widthPx / 2}
        y={p.y + fontSize * 1.5 + labelFontSize * 1.5}
        textAnchor="middle"
        fill="#9ca3af"
        fontSize={labelFontSize}
        fontFamily="system-ui, sans-serif"
      >
        {p.col + 1},{p.row + 1}
      </text>
    </g>
  );
}

export default memo(PageBoundaryOverlay);
