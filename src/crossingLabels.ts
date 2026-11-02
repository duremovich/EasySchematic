// The continuation pills' names, and the editor overlay's crossing scan (#183, #361).
//
// Two surfaces draw a pill where a connection leaves a sheet: the editor overlay
// (computeCrossingLabels below) and the PDF export (computePdfCrossingLabels in
// pdfExport.ts). Both feed their pills into the one shared layoutContinuationPills,
// which spreads the pills sharing a page edge as a GROUP — so a pill one surface
// emits and the other doesn't moves the pills they DO share. They therefore have to
// agree on which crossings exist at all, not merely on how each pill is drawn.
//
// buildCrossingLabelInfo is that agreement: the nodeId → pill-name lookup both
// surfaces run their crossings through. The PDF had the stub-label proxy and the
// overlay didn't, so a stub leg crossing a page boundary printed a pill the editor
// never showed — and shifted the shared pills up to an inch away from where the
// preview put them (#361).

import { hopHiddenAdapters } from "./adapterVisibility";
import type { PageRect } from "./printPageGrid";
import type { RoutedEdge } from "./edgeRouter";
import type { PillLimit } from "./continuationPill";
import type {
  ConnectionEdge,
  DeviceData,
  SchematicNode,
  SignalType,
  StubLabelData,
} from "./types";
import { signalColor } from "./typeRegistry";

/** What a pill says: the device on the far side of the boundary, and its room. */
export interface CrossingLabelInfo {
  label: string;
  room?: string;
}

/**
 * nodeId → the name its continuation pills carry.
 *
 * Devices name themselves, with their room in parentheses. A stub-label node names
 * the FAR device of its logical connection — the device at the other end of the
 * partner leg, reached past any hidden inline adapter (#348) — so a pill on a stub
 * leg points the reader at the destination the stub tag beside it already names,
 * not at the tag.
 *
 * `transform` applies the display-case preference (#294). Pill placement is
 * width-driven since #357, so a surface that skipped the transform would not merely
 * read differently, it would put its pills somewhere else.
 */
export function buildCrossingLabelInfo(
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
  transform: (label: string | null | undefined) => string,
  hiddenAdapterIds?: ReadonlySet<string>,
): Map<string, CrossingLabelInfo> {
  const info = new Map<string, CrossingLabelInfo>();

  for (const n of nodes) {
    if (n.type !== "device") continue;
    const data = n.data as DeviceData;
    let room: string | undefined;
    if (n.parentId) {
      const parent = nodes.find((p) => p.id === n.parentId);
      const parentLabel = parent ? (parent.data as { label?: string }).label : undefined;
      if (parentLabel) room = transform(parentLabel);
    }
    info.set(n.id, { label: transform(data.label), room });
  }

  for (const n of nodes) {
    if (n.type !== "stub-label") continue;
    const stubData = n.data as StubLabelData;
    if (!stubData.linkedConnectionId) continue;
    // The stub's own leg, then the OTHER leg sharing its linkedConnectionId.
    const ownEdge = edges.find((e) =>
      e.data?.linkedConnectionId === stubData.linkedConnectionId &&
      (stubData.side === "source" ? e.target === n.id : e.source === n.id),
    );
    if (!ownEdge) continue;
    const partnerEdge = edges.find((e) =>
      e.data?.linkedConnectionId === stubData.linkedConnectionId && e.id !== ownEdge.id,
    );
    if (!partnerEdge) continue;
    // Past a hidden inline adapter to the device the run really reaches, so the
    // pill and the stub tag on the same leg name the same device (#348).
    const { nodeId: farDeviceId } = hopHiddenAdapters(
      {
        nodeId: stubData.side === "source" ? partnerEdge.target : partnerEdge.source,
        handleId: null,
      },
      partnerEdge.id,
      nodes,
      edges,
      hiddenAdapterIds,
    );
    const farInfo = info.get(farDeviceId);
    if (farInfo) info.set(n.id, farInfo);
  }

  return info;
}

/** The pill's name text — "Device (Room)" when the device sits in a room. */
export function crossingLabelText(info: CrossingLabelInfo): string {
  if (info.room) return `${info.label} (${info.room})`;
  return info.label;
}

// ─── The editor overlay's crossing scan ───────────────────────────

export interface CrossingLabel {
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
  /** Page the pill itself is drawn on (1-indexed, 0 when it lands off every page) */
  sheet: number;
  /** The sheet's drawing border along the axis the pill can slide on (#357) */
  limit: PillLimit | null;
}

/** Find which page (1-indexed) contains a given point, or 0 if none. */
export function pageAtPoint(x: number, y: number, pages: PageRect[]): number {
  for (const p of pages) {
    if (x >= p.x && x < p.x + p.widthPx && y >= p.y && y < p.y + p.heightPx) {
      return p.index + 1;
    }
  }
  return 0;
}

/**
 * Find all points where routed connection segments cross page boundary lines,
 * and generate labels showing the device (and room) on the other side.
 */
export function computeCrossingLabels(
  pages: PageRect[],
  routedEdges: Record<string, RoutedEdge>,
  edges: readonly ConnectionEdge[],
  nodes: readonly SchematicNode[],
  signalColorOverrides: Partial<Record<SignalType, string>> | undefined,
  transform: (label: string | null | undefined) => string,
  hiddenAdapterIds?: ReadonlySet<string>,
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

  // Devices, plus the stub tags proxied to their far device — the same lookup the
  // PDF builds, so neither surface can emit a pill the other skips (#361).
  const nodeInfo = buildCrossingLabelInfo(nodes, edges, transform, hiddenAdapterIds);

  // Build edge lookup
  const edgeMap = new Map(edges.map((e) => [e.id, e]));

  const labels: CrossingLabel[] = [];
  // Margin width in canvas px (distance from page edge to content border)
  const marginPx = pages.length > 0 ? pages[0].contentX - pages[0].x : 0;
  // Inset from content border — 15% of margin keeps pills visually separated
  const inset = marginPx * 0.15;

  // How far a pill may slide along the sheet it sits on before it leaves the drawing
  // border. The vertical span runs to the bottom margin, not to contentH, which stops
  // a title-block height short of it.
  const pageByNumber = new Map(pages.map((p) => [p.index + 1, p]));
  const slideX = (pageNum: number): PillLimit | null => {
    const p = pageByNumber.get(pageNum);
    return p ? { min: p.contentX, max: p.contentX + p.contentW } : null;
  };
  const slideY = (pageNum: number): PillLimit | null => {
    const p = pageByNumber.get(pageNum);
    return p ? { min: p.contentY, max: p.y + p.heightPx - marginPx } : null;
  };

  // Resolve signal colors
  const resolveColor = (edge: ConnectionEdge): string => {
    const st = edge.data?.signalType;
    if (!st) return signalColor("custom");
    return signalColorOverrides?.[st] ?? signalColor(st);
  };

  for (const [edgeId, route] of Object.entries(routedEdges)) {
    const edge = edgeMap.get(edgeId);
    if (!edge) continue;
    // Pre-v31 stubbed edges rendered short stubs off one full route — their invisible
    // middle section shouldn't generate crossing labels. Stub LEGS are ordinary
    // routed connections and do get pills, through the proxy above.
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
            labels.push({ x: bx - marginPx - inset, y, text: crossingLabelText(rightwardTarget), pageNum: rightPageNum, anchor: "left", color: edgeColor, sheet: leftPageNum, limit: slideY(leftPageNum) });
            labels.push({ x: bx + marginPx + inset, y, text: crossingLabelText(leftwardTarget), pageNum: leftPageNum, anchor: "right", color: edgeColor, sheet: rightPageNum, limit: slideY(rightPageNum) });
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
            labels.push({ x, y: by - marginPx - inset, text: crossingLabelText(downwardTarget), pageNum: downPageNum, anchor: "up", color: edgeColor, sheet: upPageNum, limit: slideX(upPageNum) });
            labels.push({ x, y: by + marginPx + inset, text: crossingLabelText(upwardTarget), pageNum: upPageNum, anchor: "down", color: edgeColor, sheet: downPageNum, limit: slideX(downPageNum) });
          }
        }
      }
    }
  }

  return labels;
}
