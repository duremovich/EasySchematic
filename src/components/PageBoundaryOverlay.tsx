import { memo, useMemo, useCallback, useRef } from "react";
import { useViewport, useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { computePageGrid, type PageRect } from "../printPageGrid";
import { PAGE_MARGIN_IN, getPaperSize } from "../printConfig";
import type { TitleBlock, TitleBlockLayout, DeviceData, SignalType } from "../types";
import type { RoutedEdge } from "../edgeRouter";
import { computeCellRects, normalizeSizes, getFieldValue, getFieldLabel } from "../titleBlockLayout";
import { DEFAULT_SIGNAL_COLORS } from "../signalColors";
import { collectColorKeyEntries, layoutColorKey, type ColorKeyEntry } from "../colorKeyLayout";

// ─── Page crossing labels ─────────────────────────────────────────

interface CrossingLabel {
  /** Position of the label in canvas coords */
  x: number;
  y: number;
  /** Text to display */
  text: string;
  /** Page number the signal continues on */
  pageNum: number;
  /** Anchor side: which direction the label text should flow from the crossing */
  anchor: "left" | "right" | "up" | "down";
  /** Signal wire color (hex) */
  color: string;
}

/** Find which page (1-indexed) contains a given point, or 0 if none. */
function pageAtPoint(x: number, y: number, pages: PageRect[]): number {
  for (const p of pages) {
    if (x >= p.x && x < p.x + p.widthPx && y >= p.y && y < p.y + p.heightPx) {
      return p.index + 1;
    }
  }
  return 0;
}

/**
 * Find all points where routed edge segments cross page boundary lines,
 * and generate labels showing the device (and room) on the other side.
 */
function computeCrossingLabels(
  pages: PageRect[],
  routedEdges: Record<string, RoutedEdge>,
  edges: { id: string; source: string; target: string; data?: { signalType?: SignalType; stubbed?: boolean } }[],
  nodes: { id: string; type?: string; data: Record<string, unknown>; parentId?: string }[],
  _pxPerPt: number,
  signalColorOverrides?: Partial<Record<SignalType, string>>,
): CrossingLabel[] {
  if (pages.length <= 1) return [];

  // Collect unique page boundary lines (internal edges only)
  const minCol = Math.min(...pages.map((p) => p.col));
  const minRow = Math.min(...pages.map((p) => p.row));
  const vLines = new Set<number>(); // vertical boundaries (x values)
  const hLines = new Set<number>(); // horizontal boundaries (y values)
  for (const p of pages) {
    if (p.col > minCol) vLines.add(p.x);
    if (p.row > minRow) hLines.add(p.y);
    vLines.add(p.x + p.widthPx);
    hLines.add(p.y + p.heightPx);
  }

  // Build lookup: nodeId → label and room name
  const nodeInfo = new Map<string, { label: string; room?: string }>();
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const data = n.data as DeviceData;
    let room: string | undefined;
    if (n.parentId) {
      const parent = nodes.find((p) => p.id === n.parentId);
      if (parent) room = (parent.data as { label?: string }).label;
    }
    nodeInfo.set(n.id, { label: data.label, room });
  }

  // Build edge lookup
  const edgeMap = new Map(edges.map((e) => [e.id, e]));

  const labels: CrossingLabel[] = [];
  // Margin width in canvas px (distance from page edge to content border)
  const marginPx = pages.length > 0 ? pages[0].contentX - pages[0].x : 0;
  // Inset from content border — 15% of margin keeps pills visually separated
  const inset = marginPx * 0.15;

  // Resolve signal colors
  const resolveColor = (edge: { data?: { signalType?: SignalType } }): string => {
    const st = edge.data?.signalType;
    if (!st) return DEFAULT_SIGNAL_COLORS.custom;
    return signalColorOverrides?.[st] ?? DEFAULT_SIGNAL_COLORS[st];
  };

  for (const [edgeId, route] of Object.entries(routedEdges)) {
    const edge = edgeMap.get(edgeId);
    if (!edge) continue;
    // Stubbed edges only render short stubs — their invisible middle section shouldn't generate crossing labels
    if (edge.data?.stubbed) continue;
    const sourceInfo = nodeInfo.get(edge.source);
    const targetInfo = nodeInfo.get(edge.target);
    if (!sourceInfo || !targetInfo) continue;

    for (const seg of route.segments) {
      if (seg.axis === "h") {
        const y = seg.y1;
        const minX = Math.min(seg.x1, seg.x2);
        const maxX = Math.max(seg.x1, seg.x2);
        const goingRight = seg.x2 > seg.x1;
        for (const bx of vLines) {
          if (bx > minX && bx < maxX) {
            const rightwardTarget = goingRight ? targetInfo : sourceInfo;
            const leftwardTarget = goingRight ? sourceInfo : targetInfo;

            const rightPageNum = pageAtPoint(bx + 1, y, pages);
            const leftPageNum = pageAtPoint(bx - 1, y, pages);

            // Position inside the content border (margin + inset from boundary)
            const edgeColor = resolveColor(edge);
            labels.push({ x: bx - marginPx - inset, y, text: formatLabel(rightwardTarget), pageNum: rightPageNum, anchor: "left", color: edgeColor });
            labels.push({ x: bx + marginPx + inset, y, text: formatLabel(leftwardTarget), pageNum: leftPageNum, anchor: "right", color: edgeColor });
          }
        }
      } else {
        const x = seg.x1;
        const minY = Math.min(seg.y1, seg.y2);
        const maxY = Math.max(seg.y1, seg.y2);
        const goingDown = seg.y2 > seg.y1;
        for (const by of hLines) {
          if (by > minY && by < maxY) {
            const downwardTarget = goingDown ? targetInfo : sourceInfo;
            const upwardTarget = goingDown ? sourceInfo : targetInfo;

            const downPageNum = pageAtPoint(x, by + 1, pages);
            const upPageNum = pageAtPoint(x, by - 1, pages);

            const edgeColor = resolveColor(edge);
            labels.push({ x, y: by - marginPx - inset, text: formatLabel(downwardTarget), pageNum: downPageNum, anchor: "up", color: edgeColor });
            labels.push({ x, y: by + marginPx + inset, text: formatLabel(upwardTarget), pageNum: upPageNum, anchor: "down", color: edgeColor });
          }
        }
      }
    }
  }

  return labels;
}

function formatLabel(info: { label: string; room?: string }): string {
  if (info.room) return `${info.label} (${info.room})`;
  return info.label;
}

/** Measure text width using a canvas 2D context for pixel-accurate sizing. */
let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, font: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
  }
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function CrossingLabels({ labels, pxPerPt }: { labels: CrossingLabel[]; pxPerPt: number }) {
  if (labels.length === 0) return null;
  const fontSize = 6.5 * pxPerPt;
  const pad = 1.5 * pxPerPt;
  const radius = 1.5 * pxPerPt;
  const font = `500 ${fontSize}px Inter, system-ui, sans-serif`;

  return (
    <g>
      {labels.map((l, i) => {
        const arrow = l.anchor === "left" ? "\u2192" : l.anchor === "right" ? "\u2190" : l.anchor === "up" ? "\u2193" : "\u2191";
        const pgRef = l.pageNum > 0 ? ` Pg ${l.pageNum}` : "";
        const displayText = `${arrow} ${l.text}${pgRef}`;

        const textW = measureTextWidth(displayText, font);
        const boxW = textW + pad * 2;
        const boxH = fontSize + pad * 2;

        // Box outer edge sits at l.x/l.y, growing INWARD (away from the page boundary)
        let boxX: number;
        let boxY: number;
        let textX: number;
        let textY: number;

        switch (l.anchor) {
          case "left":
            boxX = l.x - boxW;
            boxY = l.y - boxH / 2;
            textX = boxX + pad;
            textY = l.y;
            break;
          case "right":
            boxX = l.x;
            boxY = l.y - boxH / 2;
            textX = boxX + pad;
            textY = l.y;
            break;
          case "up":
            boxX = l.x - boxW / 2;
            boxY = l.y - boxH;
            textX = boxX + pad;
            textY = l.y - boxH / 2;
            break;
          case "down":
            boxX = l.x - boxW / 2;
            boxY = l.y;
            textX = boxX + pad;
            textY = l.y + boxH / 2;
            break;
        }

        return (
          <g key={i}>
            <rect
              x={boxX}
              y={boxY}
              width={boxW}
              height={boxH}
              rx={radius}
              ry={radius}
              fill="white"
              stroke={l.color}
              strokeWidth={0.5 * pxPerPt}
            />
            <text
              x={textX}
              y={textY}
              dominantBaseline="central"
              fill="#374151"
              fontSize={fontSize}
              fontFamily="'Inter', system-ui, sans-serif"
              fontWeight="500"
            >
              {displayText}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Origin drag handle ──────────────────────────────────────────

const GRID_SNAP = 20;

function OriginDragHandle({
  originX,
  originY,
  zoom,
  onDrag,
}: {
  originX: number;
  originY: number;
  zoom: number;
  onDrag: (x: number, y: number) => void;
}) {
  const dragging = useRef(false);
  const startRef = useRef({ mouseX: 0, mouseY: 0, ox: 0, oy: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragging.current = true;
      startRef.current = { mouseX: e.clientX, mouseY: e.clientY, ox: originX, oy: originY };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [originX, originY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = (e.clientX - startRef.current.mouseX) / zoom;
      const dy = (e.clientY - startRef.current.mouseY) / zoom;
      const newX = Math.round((startRef.current.ox + dx) / GRID_SNAP) * GRID_SNAP;
      const newY = Math.round((startRef.current.oy + dy) / GRID_SNAP) * GRID_SNAP;
      onDrag(newX, newY);
    },
    [zoom, onDrag],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Constant screen-size for the handle
  const armLen = 24 / zoom;
  const strokeW = 2 / zoom;
  const hitSize = 16 / zoom;

  return (
    <g
      style={{ pointerEvents: "all", cursor: "move" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Hit area */}
      <rect
        x={originX - hitSize / 2}
        y={originY - hitSize / 2}
        width={hitSize}
        height={hitSize}
        fill="transparent"
      />
      {/* L-bracket: right arm */}
      <line
        x1={originX}
        y1={originY}
        x2={originX + armLen}
        y2={originY}
        stroke="#2563eb"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      {/* L-bracket: down arm */}
      <line
        x1={originX}
        y1={originY}
        x2={originX}
        y2={originY + armLen}
        stroke="#2563eb"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      {/* Corner dot */}
      <circle
        cx={originX}
        cy={originY}
        r={3 / zoom}
        fill="#2563eb"
      />
    </g>
  );
}

// ─── Color key legend ────────────────────────────────────────────

function ColorKeyLegend({
  entries,
  pages,
  corner,
  columns,
  pageFilter,
  pxPerPt,
}: {
  entries: ColorKeyEntry[];
  pages: PageRect[];
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  columns: number;
  pageFilter: "first" | "last" | "all";
  pxPerPt: number;
}) {
  if (entries.length === 0 || pages.length === 0) return null;

  const fontSize = 6.5 * pxPerPt;
  const headerFontSize = 7.5 * pxPerPt;
  const swatchLen = 18 * pxPerPt;
  const swatchGap = 4 * pxPerPt;
  const cellW = (swatchLen + swatchGap + 55 * pxPerPt);
  const cellH = fontSize * 1.8;
  const padding = 5 * pxPerPt;
  const headerH = headerFontSize * 1.8;
  const strokeW = 1.5 * pxPerPt;
  const borderW = 0.5 * pxPerPt; // match title block stroke weight

  const geo = layoutColorKey(entries, columns, cellW, cellH, padding, headerH);

  // Determine which pages show the legend
  const qualifying = pages.filter((_, i) =>
    pageFilter === "all" ? true : pageFilter === "first" ? i === 0 : i === pages.length - 1,
  );

  return (
    <g>
      {qualifying.map((p) => {
        // Flush with drawing border — locked into the corner like the title block
        const isRight = corner.includes("right");
        const isBottom = corner.includes("bottom");
        const marginPx = p.contentX - p.x;
        const drawingBottom = p.y + p.heightPx - marginPx;
        const ox = isRight ? p.contentX + p.contentW - geo.width : p.contentX;
        const oy = isBottom ? drawingBottom - geo.height : p.contentY;

        return (
          <g key={`ck-${p.index}`} transform={`translate(${ox},${oy})`}>
            {/* White fill + black border — matches title block style */}
            <rect
              x={0}
              y={0}
              width={geo.width}
              height={geo.height}
              fill="white"
              stroke="#000000"
              strokeWidth={borderW}
            />
            {/* Header divider line */}
            <line
              x1={0}
              y1={padding + headerH}
              x2={geo.width}
              y2={padding + headerH}
              stroke="#000000"
              strokeWidth={borderW}
            />
            {/* Header */}
            <text
              x={padding}
              y={padding + headerFontSize * 0.85}
              fontSize={headerFontSize}
              fontFamily="'Inter', system-ui, sans-serif"
              fontWeight="600"
              fill="#000000"
            >
              SIGNAL KEY
            </text>
            {/* Entries */}
            {geo.entries.map(({ entry, x, y }) => {
              const lineY = y + cellH / 2;
              const dashArray = entry.dashArray;
              return (
                <g key={entry.signalType}>
                  <line
                    x1={x}
                    y1={lineY}
                    x2={x + swatchLen}
                    y2={lineY}
                    stroke={entry.color}
                    strokeWidth={strokeW}
                    strokeDasharray={dashArray}
                    strokeLinecap="round"
                  />
                  <text
                    x={x + swatchLen + swatchGap}
                    y={lineY + fontSize * 0.35}
                    fontSize={fontSize}
                    fontFamily="'Inter', system-ui, sans-serif"
                    fill="#000000"
                  >
                    {entry.label}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────

function PageBoundaryOverlay() {
  const { x: vx, y: vy, zoom } = useViewport();
  const rfInstance = useReactFlow();

  const printPaperId = useSchematicStore((s) => s.printPaperId);
  const printOrientation = useSchematicStore((s) => s.printOrientation);
  const printScale = useSchematicStore((s) => s.printScale);
  const printCustomWidthIn = useSchematicStore((s) => s.printCustomWidthIn);
  const printCustomHeightIn = useSchematicStore((s) => s.printCustomHeightIn);
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const titleBlockLayout = useSchematicStore((s) => s.titleBlockLayout);
  const routedEdges = useSchematicStore((s) => s.routedEdges);
  const storeNodes = useSchematicStore((s) => s.nodes);
  const storeEdges = useSchematicStore((s) => s.edges);
  const signalColors = useSchematicStore((s) => s.signalColors);
  const signalLineStyles = useSchematicStore((s) => s.signalLineStyles);
  const colorKeyEnabled = useSchematicStore((s) => s.colorKeyEnabled);
  const colorKeyCorner = useSchematicStore((s) => s.colorKeyCorner);
  const colorKeyColumns = useSchematicStore((s) => s.colorKeyColumns);
  const colorKeyPage = useSchematicStore((s) => s.colorKeyPage);
  const colorKeyOverrides = useSchematicStore((s) => s.colorKeyOverrides);
  const printOriginOffsetX = useSchematicStore((s) => s.printOriginOffsetX);
  const printOriginOffsetY = useSchematicStore((s) => s.printOriginOffsetY);
  const setPrintOriginOffset = useSchematicStore((s) => s.setPrintOriginOffset);
  // Subscribe to node positions so the overlay re-renders when nodes move
  useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );

  const paperSize = getPaperSize(printPaperId, printCustomWidthIn, printCustomHeightIn);
  const nodes = rfInstance.getNodes();

  const pages = computePageGrid(paperSize, printOrientation, printScale, nodes, titleBlockLayout.heightIn, printOriginOffsetX, printOriginOffsetY);

  // Compute page-relative sizing: pxPerPt scales with page dimensions, not zoom
  const marginPx = pages.length > 0 ? pages[0].contentX - pages[0].x : 0;
  const pxPerIn = PAGE_MARGIN_IN > 0 ? marginPx / PAGE_MARGIN_IN : 96 / printScale;
  const pxPerPt = pxPerIn / 72;

  const crossingLabels = useMemo(
    () => computeCrossingLabels(pages, routedEdges, storeEdges, storeNodes, pxPerPt, signalColors),
    [pages, routedEdges, storeEdges, storeNodes, pxPerPt, signalColors],
  );

  const colorKeyEntries = useMemo(
    () => colorKeyEnabled ? collectColorKeyEntries(storeEdges, signalColors, signalLineStyles, colorKeyOverrides) : [],
    [colorKeyEnabled, storeEdges, signalColors, signalLineStyles, colorKeyOverrides],
  );

  if (pages.length === 0) return null;

  const totalPages = pages.length;
  const minCol = Math.min(...pages.map((p) => p.col));
  const minRow = Math.min(...pages.map((p) => p.row));

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
          <PageOverlay key={p.index} page={p} zoom={zoom} titleBlock={titleBlock} layout={titleBlockLayout} totalPages={totalPages} minCol={minCol} minRow={minRow} />
        ))}
        <CrossingLabels labels={crossingLabels} pxPerPt={pxPerPt} />
        {colorKeyEnabled && <ColorKeyLegend entries={colorKeyEntries} pages={pages} corner={colorKeyCorner} columns={colorKeyColumns} pageFilter={colorKeyPage} pxPerPt={pxPerPt} />}
        <OriginDragHandle originX={printOriginOffsetX} originY={printOriginOffsetY} zoom={zoom} onDrag={setPrintOriginOffset} />
      </svg>
    </div>
  );
}

const FONT_FAMILY_MAP: Record<string, string> = {
  "sans-serif": "'Inter', system-ui, sans-serif",
  "serif": "Georgia, serif",
  "monospace": "'Courier New', monospace",
};

function PageOverlay({
  page: p,
  zoom,
  titleBlock: tb,
  layout,
  totalPages,
  minCol,
  minRow,
}: {
  page: PageRect;
  zoom: number;
  titleBlock: TitleBlock;
  layout: TitleBlockLayout;
  totalPages: number;
  minCol: number;
  minRow: number;
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
        strokeWidth={stroke}
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
        fontFamily="'Inter', system-ui, sans-serif"
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
        fontFamily="'Inter', system-ui, sans-serif"
      >
        {p.col - minCol + 1},{p.row - minRow + 1}
      </text>
    </g>
  );
}

export default memo(PageBoundaryOverlay);
