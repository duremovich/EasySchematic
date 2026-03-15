import { memo } from "react";
import { useViewport, useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { computePageGrid, type PageRect } from "../printPageGrid";
import { PAPER_SIZES } from "../printConfig";
import type { TitleBlock } from "../types";

function PageBoundaryOverlay() {
  const { x: vx, y: vy, zoom } = useViewport();
  const rfInstance = useReactFlow();

  const printPaperId = useSchematicStore((s) => s.printPaperId);
  const printOrientation = useSchematicStore((s) => s.printOrientation);
  const printScale = useSchematicStore((s) => s.printScale);
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  // Subscribe to node positions so the overlay re-renders when nodes move
  useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );

  const paperSize = PAPER_SIZES.find((p) => p.id === printPaperId) ?? PAPER_SIZES[2]; // tabloid default
  const nodes = rfInstance.getNodes();

  const pages = computePageGrid(paperSize, printOrientation, printScale, nodes);

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
          <PageOverlay key={p.index} page={p} zoom={zoom} titleBlock={titleBlock} totalPages={totalPages} />
        ))}
      </svg>
    </div>
  );
}

function PageOverlay({
  page: p,
  zoom,
  titleBlock: tb,
  totalPages,
}: {
  page: PageRect;
  zoom: number;
  titleBlock: TitleBlock;
  totalPages: number;
}) {
  const fontSize = 14 / zoom;
  const labelFontSize = 10 / zoom;

  // Title block geometry
  const marginPx = p.contentX - p.x;
  const tbTop = p.contentY + p.contentH;
  const tbHeight = (p.y + p.heightPx) - tbTop - marginPx;
  const hasTitleBlock = tbHeight > 0;

  // Title block sizing — 6 rows, 30% of content width, anchored bottom-right
  const rowH = tbHeight / 6;
  const tbBoxW = p.contentW * 0.3;
  const tbBoxX = p.contentX + p.contentW - tbBoxW;
  const stroke = 0.5 / zoom;

  // Font sizes scaled to zoom
  const tbShowSize = 9 / zoom;
  const tbVenueSize = 7.5 / zoom;
  const tbTextSize = 7 / zoom;
  const tbPageSize = 7 / zoom;

  // Column positions for rows 3-5 (label | value)
  const col1X = tbBoxX;
  const col2X = tbBoxX + tbBoxW * 0.35;

  // Row 6 split: drawing title (left) | page number (right)
  const pageColX = tbBoxX + tbBoxW * 0.75;

  const pad = 4 / zoom; // text inset padding

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

      {/* Title block — bottom-right box */}
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

          {/* Row dividers (between all 6 rows) */}
          {[1, 2, 3, 4, 5].map((i) => (
            <line
              key={i}
              x1={tbBoxX}
              y1={tbTop + rowH * i}
              x2={tbBoxX + tbBoxW}
              y2={tbTop + rowH * i}
              stroke="#000000"
              strokeWidth={stroke}
            />
          ))}

          {/* Column divider for rows 3-5 (label | value) */}
          <line
            x1={col2X}
            y1={tbTop + rowH * 2}
            x2={col2X}
            y2={tbTop + rowH * 5}
            stroke="#000000"
            strokeWidth={stroke}
          />

          {/* Column divider for row 6 (drawing title | page number) */}
          <line
            x1={pageColX}
            y1={tbTop + rowH * 5}
            x2={pageColX}
            y2={tbTop + tbHeight}
            stroke="#000000"
            strokeWidth={stroke}
          />

          {/* Row 1: Show Name (full width, centered, bold) */}
          <text
            x={tbBoxX + tbBoxW / 2}
            y={tbTop + rowH * 0.5 + tbShowSize * 0.35}
            textAnchor="middle"
            fill={tb.showName ? "#1e293b" : "#9ca3af"}
            fontSize={tbShowSize}
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
          >
            {tb.showName || "Show Name"}
          </text>

          {/* Row 2: Venue (full width, centered) */}
          <text
            x={tbBoxX + tbBoxW / 2}
            y={tbTop + rowH * 1.5 + tbVenueSize * 0.35}
            textAnchor="middle"
            fill={tb.venue ? "#475569" : "#9ca3af"}
            fontSize={tbVenueSize}
            fontFamily="system-ui, sans-serif"
          >
            {tb.venue || "Venue"}
          </text>

          {/* Row 3: Designer */}
          <text
            x={col1X + pad}
            y={tbTop + rowH * 2.5 + tbTextSize * 0.35}
            fill="#000000"
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
          >
            Designer:
          </text>
          <text
            x={col2X + pad}
            y={tbTop + rowH * 2.5 + tbTextSize * 0.35}
            fill={tb.designer ? "#1e293b" : "#9ca3af"}
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
          >
            {tb.designer || "\u2014"}
          </text>

          {/* Row 4: Engineer */}
          <text
            x={col1X + pad}
            y={tbTop + rowH * 3.5 + tbTextSize * 0.35}
            fill="#000000"
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
          >
            Engineer:
          </text>
          <text
            x={col2X + pad}
            y={tbTop + rowH * 3.5 + tbTextSize * 0.35}
            fill={tb.engineer ? "#1e293b" : "#9ca3af"}
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
          >
            {tb.engineer || "\u2014"}
          </text>

          {/* Row 5: Date */}
          <text
            x={col1X + pad}
            y={tbTop + rowH * 4.5 + tbTextSize * 0.35}
            fill="#000000"
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
          >
            Date:
          </text>
          <text
            x={col2X + pad}
            y={tbTop + rowH * 4.5 + tbTextSize * 0.35}
            fill={tb.date ? "#1e293b" : "#9ca3af"}
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
          >
            {tb.date || "\u2014"}
          </text>

          {/* Row 6: Drawing Title (left) + Page Number (right) */}
          <text
            x={col1X + pad}
            y={tbTop + rowH * 5.5 + tbTextSize * 0.35}
            fill={tb.drawingTitle ? "#1e293b" : "#9ca3af"}
            fontSize={tbTextSize}
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
          >
            {tb.drawingTitle || "Drawing Title"}
          </text>
          <text
            x={pageColX + (tbBoxX + tbBoxW - pageColX) / 2}
            y={tbTop + rowH * 5.5 + tbPageSize * 0.35}
            textAnchor="middle"
            fill="#475569"
            fontSize={tbPageSize}
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
          >
            {`Page ${p.index + 1} / ${totalPages}`}
          </text>
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
