// Pure geometry + defaults for text-only port stubs (#196). Extracted from
// TextStubNode.tsx so the placement and leader-line math are unit-testable without a
// DOM or the React Flow runtime.
//
// A text stub is a free-text note anchored to a SINGLE device port. It is NOT backed by
// any real connection (no edge, no linkedConnectionId), so it never shows up in reports
// and never marks a port "connected". The node renders its own short leader line from the
// box to the anchor port.

import { STUB_GAP, STUB_H_EST } from "./stubPlacement";

/** Shown in place of empty text so the box (and its double-click target) stays visible. */
export const TEXT_STUB_PLACEHOLDER = "…"; // "…"

export interface Pt {
  x: number;
  y: number;
}

/**
 * Which box edge faces the device, given the anchored port's rendered side.
 * A left-side port puts the box to the LEFT of the device, so the box's RIGHT edge ("r")
 * faces it; a right-side port puts the box to the right, so its LEFT edge ("l") faces it.
 */
export function textStubSideForPort(portSide: "left" | "right"): "l" | "r" {
  return portSide === "right" ? "l" : "r";
}

/**
 * Absolute top-left of the text-stub box so its device-facing edge sits `STUB_GAP` from
 * the port and its vertical centre aligns with the port row. `side` is the box edge that
 * faces the device ("l" = device is to the left → box sits to the right; "r" = box sits
 * to the left). Mirrors defaultStubPlacement, but takes the real (measured) box width so
 * a left-facing box is anchored by its far edge.
 */
export function textStubBoxPosition(
  portAbs: Pt,
  side: "l" | "r",
  boxWidth: number,
  boxHeight: number = STUB_H_EST,
): Pt {
  const y = portAbs.y - boxHeight / 2;
  const x = side === "l" ? portAbs.x + STUB_GAP : portAbs.x - STUB_GAP - boxWidth;
  return { x, y };
}

/**
 * Orthogonal leader-line points in the box's LOCAL coordinate space (box top-left = 0,0),
 * running from the box's device-facing edge to the anchor port. When the box is aligned
 * with the port row this collapses to a single horizontal segment; after a vertical drag
 * it becomes an L (horizontal to the port's X, then vertical to the port). `portLocal` is
 * the port position relative to the box's top-left.
 */
export function textStubLeaderPoints(
  box: { width: number; height: number },
  portLocal: Pt,
  side: "l" | "r",
): Pt[] {
  const connectY = box.height / 2;
  const start: Pt = { x: side === "l" ? 0 : box.width, y: connectY };
  const elbow: Pt = { x: portLocal.x, y: connectY };
  const end: Pt = { x: portLocal.x, y: portLocal.y };
  const pts = [start, elbow, end];
  // Drop consecutive duplicates (aligned port → straight line, no zero-length elbow).
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/** Serialize points to an SVG polyline/polygon `points` attribute. */
export function pointsToSvg(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}
