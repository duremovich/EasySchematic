/**
 * Millimeter-accurate SVG connector icon library for rack face-plate rendering.
 *
 * Each connector defines real-world mm dimensions and draws in mm coordinate
 * space centered at (0, 0). The `scale` parameter (px/mm) converts to screen
 * pixels. At rack scale (~0.54 px/mm), connectors render at their true
 * proportional size relative to rack devices.
 *
 * Detail levels:
 *   0 = colored dot (very zoomed out)
 *   1 = accurate silhouette outline (default)
 *   2 = internal features (pins, contacts, concentric rings)
 */

import type React from "react";
import type { ConnectorType } from "../types";

// Re-export ConnectorSpec for external use
export type { ConnectorType };

interface RenderProps {
  color: string;
  detail: number;
  strokeWidth: number;
}

export interface ConnectorSpec {
  widthMm: number;
  heightMm: number;
  render: (props: RenderProps) => React.JSX.Element;
}

// ── Dot helper ────────────────────────────────────────────────────

function dot(maxDim: number, color: string): React.JSX.Element {
  return <circle r={maxDim * 0.3} fill={color} />;
}

// ══════════════════════════════════════════════════════════════════
// SHAPE HELPERS
// ══════════════════════════════════════════════════════════════════

// ── D-shape (circle with flat chord at top) — XLR, Speakon ──────

function dShapePath(diameter: number, flatOffset: number): string {
  const r = diameter / 2;
  const flatY = -r + flatOffset;
  const halfChord = Math.sqrt(r * r - flatY * flatY);
  return `M ${-halfChord} ${flatY} A ${r} ${r} 0 1 0 ${halfChord} ${flatY} Z`;
}

// ── Neutrik D-shape (circle with flat on BOTTOM) — EtherCon, opticalCON ──

function neutrikDPath(diameter: number, flatOffset: number): string {
  const r = diameter / 2;
  const flatY = r - flatOffset;
  const halfChord = Math.sqrt(r * r - flatY * flatY);
  return `M ${-halfChord} ${flatY} A ${r} ${r} 0 1 1 ${halfChord} ${flatY} Z`;
}

// ── D-sub shape (VGA, DB9, DB15, DB25) ──────────────────────────

function dSubPath(width: number, height: number): string {
  const hw = width / 2;
  const hh = height / 2;
  const topR = 1.5;
  const botR = 3.2;
  const inset = width * 0.05;
  return [
    `M ${-hw + topR} ${-hh}`,
    `L ${hw - topR} ${-hh}`,
    `A ${topR} ${topR} 0 0 1 ${hw} ${-hh + topR}`,
    `L ${hw - inset} ${hh - botR}`,
    `A ${botR} ${botR} 0 0 1 ${hw - inset - botR} ${hh}`,
    `L ${-hw + inset + botR} ${hh}`,
    `A ${botR} ${botR} 0 0 1 ${-hw + inset} ${hh - botR}`,
    `L ${-hw} ${-hh + topR}`,
    `A ${topR} ${topR} 0 0 1 ${-hw + topR} ${-hh}`,
    "Z",
  ].join(" ");
}

// ── HDMI shape — rectangle with two chamfered bottom corners ────

function hdmiPath(width: number, height: number, chamfer: number): string {
  const hw = width / 2;
  const hh = height / 2;
  // Flat top, vertical sides, small 45° cuts at bottom corners, flat bottom
  return [
    `M ${-hw} ${-hh}`,
    `L ${hw} ${-hh}`,
    `L ${hw} ${hh - chamfer}`,
    `L ${hw - chamfer} ${hh}`,
    `L ${-hw + chamfer} ${hh}`,
    `L ${-hw} ${hh - chamfer}`,
    "Z",
  ].join(" ");
}

// ── Rectangle with one clipped corner — DisplayPort ─────────────

function clipCornerPath(width: number, height: number, chamfer: number): string {
  const hw = width / 2;
  const hh = height / 2;
  const r = 0.3;
  return [
    `M ${-hw + r} ${-hh}`,
    `L ${hw - r} ${-hh}`,
    `A ${r} ${r} 0 0 1 ${hw} ${-hh + r}`,
    `L ${hw} ${hh - chamfer}`,
    `L ${hw - chamfer} ${hh}`,
    `L ${-hw + r} ${hh}`,
    `A ${r} ${r} 0 0 1 ${-hw} ${hh - r}`,
    `L ${-hw} ${-hh + r}`,
    `A ${r} ${r} 0 0 1 ${-hw + r} ${-hh}`,
    "Z",
  ].join(" ");
}

// ══════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS (reusable, parameterized by dimensions)
// ══════════════════════════════════════════════════════════════════

function renderCircle(diameter: number, { color, detail, strokeWidth }: RenderProps) {
  const r = diameter / 2;
  if (detail === 0) return dot(diameter, color);
  return <circle r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />;
}

function renderDShape(diameter: number, heightMm: number, flatOffset: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(diameter, heightMm), color);
  return <path d={dShapePath(diameter, flatOffset)} fill="none" stroke={color} strokeWidth={strokeWidth} />;
}

function renderNeutrikD(diameter: number, flatOffset: number, w: number, h: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  return <path d={neutrikDPath(diameter, flatOffset)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

function renderRectangle(w: number, h: number, cornerRadius: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={cornerRadius} fill="none" stroke={color} strokeWidth={strokeWidth} />;
}

function renderDSub(w: number, h: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  return <path d={dSubPath(w, h)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

function renderHDMI(w: number, h: number, chamfer: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  return <path d={hdmiPath(w, h, chamfer)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

function renderClipCorner(w: number, h: number, chamfer: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  return <path d={clipCornerPath(w, h, chamfer)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

function renderRJ(w: number, h: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  const hw = w / 2, hh = h / 2;
  // Latch tab: small bump protruding from top center
  const tabW = w * 0.3;
  const tabH = h * 0.15;
  return (
    <g>
      <rect x={-hw} y={-hh} width={w} height={h} rx={0.3} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <rect x={-tabW / 2} y={-hh - tabH} width={tabW} height={tabH} rx={0.15} fill="none" stroke={color} strokeWidth={strokeWidth} />
    </g>
  );
}

function renderUSBA(w: number, h: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  const hw = w / 2, hh = h / 2;
  // Internal tongue/wafer line at mid-height
  return (
    <g>
      <rect x={-hw} y={-hh} width={w} height={h} rx={0.3} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <line x1={-hw + strokeWidth} y1={0} x2={hw - strokeWidth} y2={0} stroke={color} strokeWidth={strokeWidth * 0.6} />
    </g>
  );
}

function renderStadium(w: number, h: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="none" stroke={color} strokeWidth={strokeWidth} />;
}

function renderUSBB(w: number, h: number, chamfer: number, { color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(Math.max(w, h), color);
  const hw = w / 2, hh = h / 2;
  const d = `M ${-hw} ${hh} L ${-hw} ${-hh + chamfer} L ${-hw + chamfer} ${-hh} L ${hw - chamfer} ${-hh} L ${hw} ${-hh + chamfer} L ${hw} ${hh} Z`;
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

function renderBNC(diameter: number, { color, detail, strokeWidth }: RenderProps) {
  const r = diameter / 2;
  if (detail === 0) return dot(diameter, color);

  const tabAngle1 = (180 * Math.PI) / 180; // 9 o'clock
  const tabAngle2 = (0 * Math.PI) / 180;   // 3 o'clock
  const tabLen = 2.0;
  const tabW = 1.8;

  function tab(angle: number, key: string) {
    const cx = r * Math.cos(angle);
    const cy = -r * Math.sin(angle);
    const nx = Math.cos(angle);
    const ny = -Math.sin(angle);
    const px = -ny;
    const py = nx;
    return (
      <path
        key={key}
        d={`M ${cx - px * tabW / 2} ${cy - py * tabW / 2} L ${cx + nx * tabLen - px * tabW / 2} ${cy + ny * tabLen - py * tabW / 2} L ${cx + nx * tabLen + px * tabW / 2} ${cy + ny * tabLen + py * tabW / 2} L ${cx + px * tabW / 2} ${cy + py * tabW / 2} Z`}
        fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round"
      />
    );
  }

  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
      {tab(tabAngle1, "t1")}
      {tab(tabAngle2, "t2")}
    </g>
  );
}

function renderCircleWithNotch(
  diameter: number, notchWidth: number, notchDepth: number, side: "top" | "bottom",
  { color, detail, strokeWidth }: RenderProps,
) {
  const r = diameter / 2;
  if (detail === 0) return dot(diameter, color);
  const nHalf = notchWidth / 2;

  // Circle outline + a small rectangular key/notch extending outward
  const notchRect = side === "bottom"
    ? <rect x={-nHalf} y={r - strokeWidth * 0.5} width={notchWidth} height={notchDepth} fill="none" stroke={color} strokeWidth={strokeWidth} />
    : <rect x={-nHalf} y={-r - notchDepth + strokeWidth * 0.5} width={notchWidth} height={notchDepth} fill="none" stroke={color} strokeWidth={strokeWidth} />;

  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={strokeWidth} />
      {notchRect}
    </g>
  );
}

// ── IEC C5 cloverleaf ─────────────────────────────────────────────

function renderIECC5({ color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(16.0, color);

  // IEC C5 "cloverleaf" — three overlapping circular lobes.
  // Overall ~16mm wide × 14mm tall. Each lobe ~5mm radius.
  // Centers form a triangle: two upper, one lower.
  const lr = 5.0;
  const lx1 = -3.5, ly1 = -1.5; // left-top
  const lx2 = 3.5, ly2 = -1.5;  // right-top
  const lx3 = 0, ly3 = 4.0;     // bottom-center

  // Intersection of left-top and right-top lobes (top notch)
  const topDist = lx2 - lx1;
  const topHalfH = Math.sqrt(lr * lr - (topDist / 2) ** 2);
  const topNotchX = 0;
  const topNotchY = ly1 - topHalfH;

  // Intersection of right-top and bottom lobes
  const dx23 = lx3 - lx2, dy23 = ly3 - ly2;
  const dist23 = Math.sqrt(dx23 * dx23 + dy23 * dy23);
  const a23 = Math.atan2(dy23, dx23);
  const hPerp23 = Math.sqrt(lr * lr - (dist23 / 2) ** 2);
  const mx23 = (lx2 + lx3) / 2, my23 = (ly2 + ly3) / 2;
  const rightNotchX = mx23 + hPerp23 * Math.sin(a23);
  const rightNotchY = my23 - hPerp23 * Math.cos(a23);

  // Intersection of bottom and left-top lobes (mirror)
  const leftNotchX = -rightNotchX;
  const leftNotchY = rightNotchY;

  const d = [
    `M ${topNotchX} ${topNotchY}`,
    `A ${lr} ${lr} 0 1 1 ${rightNotchX} ${rightNotchY}`,
    `A ${lr} ${lr} 0 1 1 ${leftNotchX} ${leftNotchY}`,
    `A ${lr} ${lr} 0 1 1 ${topNotchX} ${topNotchY}`,
    "Z",
  ].join(" ");
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

// ── IEC C7 figure-8 ───────────────────────────────────────────────

function renderIECC7({ color, detail, strokeWidth }: RenderProps) {
  if (detail === 0) return dot(11.5, color);

  // Each lobe r=4.0 (height/2). Centers at ±1.75 so total width = 2*(1.75+4.0) = 11.5mm.
  const lr = 4.0;
  const cx = 1.75;
  const dist = cx * 2;
  const halfH = Math.sqrt(lr * lr - (dist / 2) ** 2);

  const d = [
    `M 0 ${-halfH}`,
    `A ${lr} ${lr} 0 1 0 0 ${halfH}`,
    `A ${lr} ${lr} 0 1 0 0 ${-halfH}`,
    "Z",
  ].join(" ");
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

// ── IEC C15 (C14 + V-notch) ──────────────────────────────────────

function renderIECC15({ color, detail, strokeWidth }: RenderProps) {
  const w = 22.0, h = 17.0, rx = 1.5;
  if (detail === 0) return dot(Math.max(w, h), color);
  const nw = 1.5, nd = 2.0;
  const hw = w / 2, hh = h / 2;
  const d = [
    `M ${-hw + rx} ${-hh}`,
    `L ${-nw} ${-hh}`,
    `L 0 ${-hh + nd}`,
    `L ${nw} ${-hh}`,
    `L ${hw - rx} ${-hh}`,
    `Q ${hw} ${-hh} ${hw} ${-hh + rx}`,
    `L ${hw} ${hh - rx}`,
    `Q ${hw} ${hh} ${hw - rx} ${hh}`,
    `L ${-hw + rx} ${hh}`,
    `Q ${-hw} ${hh} ${-hw} ${hh - rx}`,
    `L ${-hw} ${-hh + rx}`,
    `Q ${-hw} ${-hh} ${-hw + rx} ${-hh}`,
    "Z",
  ].join(" ");
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

// ── TOSLINK ───────────────────────────────────────────────────────

function renderToslink({ color, detail, strokeWidth }: RenderProps) {
  const w = 7.2, h = 9.8;
  if (detail === 0) return dot(Math.max(w, h), color);
  const hw = w / 2, hh = h / 2, ch = 1.5;
  const d = `M ${-hw + ch} ${-hh} L ${hw} ${-hh} L ${hw} ${hh} L ${-hw} ${hh} L ${-hw} ${-hh + ch} Z`;
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
}

// ══════════════════════════════════════════════════════════════════
// CONNECTOR SPEC REGISTRY
// ══════════════════════════════════════════════════════════════════

const xlrOutline = (p: RenderProps) => <path d={dShapePath(19.0, 2.2)} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;

const CONNECTOR_SPECS: Partial<Record<ConnectorType, ConnectorSpec>> = {
  // ── XLR family ──
  "xlr-3": {
    widthMm: 19.0, heightMm: 17.5,
    render: (p) => {
      if (p.detail === 0) return dot(19.0, p.color);
      const outline = xlrOutline(p);
      if (p.detail < 2) return outline;
      const pr = 0.76;
      return (
        <g>
          {outline}
          <circle cx={0} cy={3.96} r={pr} fill={p.color} />
          <circle cx={-3.43} cy={-1.98} r={pr} fill={p.color} />
          <circle cx={3.43} cy={-1.98} r={pr} fill={p.color} />
        </g>
      );
    },
  },
  "xlr-4": {
    widthMm: 19.0, heightMm: 17.5,
    render: (p) => {
      if (p.detail === 0) return dot(19.0, p.color);
      const outline = xlrOutline(p);
      if (p.detail < 2) return outline;
      const pr = 0.76;
      return (
        <g>
          {outline}
          <circle cx={2.80} cy={-2.80} r={pr} fill={p.color} />
          <circle cx={2.80} cy={2.80} r={pr} fill={p.color} />
          <circle cx={-2.80} cy={2.80} r={pr} fill={p.color} />
          <circle cx={-2.80} cy={-2.80} r={pr} fill={p.color} />
        </g>
      );
    },
  },
  "xlr-5": {
    widthMm: 19.0, heightMm: 17.5,
    render: (p) => {
      if (p.detail === 0) return dot(19.0, p.color);
      const outline = xlrOutline(p);
      if (p.detail < 2) return outline;
      const pr = 0.76;
      const R = 3.96;
      // Pentagon: pin 1 at bottom, then clockwise
      const pins = [0, 1, 2, 3, 4].map(i => {
        const angle = Math.PI / 2 + i * (2 * Math.PI / 5);
        return { cx: -R * Math.cos(angle), cy: -R * Math.sin(angle) };
      });
      return (
        <g>
          {outline}
          {pins.map((pin, i) => <circle key={i} cx={pin.cx} cy={pin.cy} r={pr} fill={p.color} />)}
        </g>
      );
    },
  },
  "mini-xlr":       { widthMm: 12.4,  heightMm: 11.5,  render: (p) => renderDShape(12.4, 11.5, 12.4 * (2.2 / 19.0), p) },
  "combo-xlr-trs": {
    widthMm: 24.2, heightMm: 22.0,
    render: (p) => {
      if (p.detail === 0) return dot(24.2, p.color);
      const outline = <path d={dShapePath(24.2, 24.2 * (2.2 / 19.0))} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      const pr = 0.76;
      // TRS hole centered coaxially, XLR pins surround it at r=3.96mm
      return (
        <g>
          {outline}
          {/* Central TRS jack hole */}
          <circle cx={0} cy={0} r={3.175} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />
          {/* XLR pins at standard positions around TRS hole */}
          <circle cx={0} cy={3.96} r={pr} fill={p.color} />
          <circle cx={-3.43} cy={-1.98} r={pr} fill={p.color} />
          <circle cx={3.43} cy={-1.98} r={pr} fill={p.color} />
        </g>
      );
    },
  },

  // ── Circular audio ──
  "bnc": {
    widthMm: 14.5, heightMm: 14.5,
    render: (p) => {
      const base = renderBNC(14.5, p);
      if (p.detail < 2) return base;
      return (
        <g>
          {base}
          <circle r={3.5} fill="none" stroke={p.color} strokeWidth={p.strokeWidth * 0.7} />
          <circle r={0.8} fill={p.color} />
        </g>
      );
    },
  },
  "rca": {
    widthMm: 13.0, heightMm: 13.0,
    render: (p) => {
      if (p.detail === 0) return dot(13.0, p.color);
      const outline = <circle r={6.5} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      return (
        <g>
          {outline}
          <circle r={4.1} fill="none" stroke={p.color} strokeWidth={p.strokeWidth * 0.7} />
          <circle r={1.6} fill={p.color} />
        </g>
      );
    },
  },
  "trs-quarter":    { widthMm: 15.9,  heightMm: 15.9,  render: (p) => renderCircle(15.9, p) },
  "trs-eighth":     { widthMm: 10.0,  heightMm: 10.0,  render: (p) => renderCircle(10.0, p) },
  "trs-2.5mm":      { widthMm: 8.0,   heightMm: 8.0,   render: (p) => renderCircle(8.0, p) },

  // ── DIN ──
  "din-5": {
    widthMm: 18.0, heightMm: 18.0,
    render: (p) => {
      const outline = renderCircleWithNotch(18.0, 4.5, 2.5, "bottom", p);
      if (p.detail < 2) return outline;
      const pr = 0.5;
      const R = 3.5;
      // 5 pins in upper arc, pulled up from centerline (notch at bottom)
      const angles = [160, 125, 90, 55, 20];
      return (
        <g>
          {outline}
          {angles.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={i} cx={R * Math.cos(rad)} cy={-R * Math.sin(rad)} r={pr} fill={p.color} />;
          })}
        </g>
      );
    },
  },
  "mini-din-4": {
    widthMm: 12.0, heightMm: 12.0,
    render: (p) => {
      const outline = renderCircleWithNotch(12.0, 3.5, 1.5, "bottom", p);
      if (p.detail < 2) return outline;
      const pr = 0.65;
      return (
        <g>
          {outline}
          <circle cx={-1.5} cy={-1.5} r={pr} fill={p.color} />
          <circle cx={1.5} cy={-1.5} r={pr} fill={p.color} />
          <circle cx={-1.5} cy={1.0} r={pr} fill={p.color} />
          <circle cx={1.5} cy={1.0} r={pr} fill={p.color} />
        </g>
      );
    },
  },
  "mini-din-7": {
    widthMm: 12.0, heightMm: 12.0,
    render: (p) => {
      const outline = renderCircleWithNotch(12.0, 3.5, 1.5, "bottom", p);
      if (p.detail < 2) return outline;
      const pr = 0.65;
      return (
        <g>
          {outline}
          {/* Upper row of 3 */}
          <circle cx={-2} cy={-1.5} r={pr} fill={p.color} />
          <circle cx={0} cy={-1.5} r={pr} fill={p.color} />
          <circle cx={2} cy={-1.5} r={pr} fill={p.color} />
          {/* Lower row of 4 */}
          <circle cx={-2.5} cy={1} r={pr} fill={p.color} />
          <circle cx={-0.8} cy={1} r={pr} fill={p.color} />
          <circle cx={0.8} cy={1} r={pr} fill={p.color} />
          <circle cx={2.5} cy={1} r={pr} fill={p.color} />
        </g>
      );
    },
  },

  // ── Power/binding ──
  "barrel": {
    widthMm: 11.0, heightMm: 11.0,
    render: (p) => {
      if (p.detail === 0) return dot(11.0, p.color);
      const outline = <circle r={5.5} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      return (
        <g>
          {outline}
          <circle r={2.75} fill="none" stroke={p.color} strokeWidth={p.strokeWidth * 0.7} />
          <circle r={1.05} fill={p.color} />
        </g>
      );
    },
  },
  "banana":              { widthMm: 11.0,  heightMm: 11.0,  render: (p) => renderCircle(11.0, p) },
  "binding-post":        { widthMm: 16.0,  heightMm: 16.0,  render: (p) => renderCircle(16.0, p) },
  "binding-post-banana": { widthMm: 16.0,  heightMm: 16.0,  render: (p) => renderCircle(16.0, p) },

  // ── Pro audio ──
  "speakon": {
    widthMm: 24.2, heightMm: 22.5,
    render: (p) => {
      if (p.detail === 0) return dot(24.2, p.color);
      const outline = <path d={dShapePath(24.2, 24.2 * (2.2 / 19.0))} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      const R = 6;
      const sw = 2, sh = 4;
      // Slots at 11, 1, 5, 7 o'clock (330°, 30°, 150°, 210° in standard math angles)
      const slotAngles = [
        (330 * Math.PI) / 180, // 11 o'clock
        (30 * Math.PI) / 180,  // 1 o'clock
        (150 * Math.PI) / 180, // 7 o'clock (mirrored — 5 o'clock visually)
        (210 * Math.PI) / 180, // 5 o'clock (mirrored — 7 o'clock visually)
      ];
      return (
        <g>
          {outline}
          {slotAngles.map((a, i) => {
            const cx = R * Math.cos(a);
            const cy = -R * Math.sin(a);
            const rotDeg = -(a * 180) / Math.PI + 90;
            return (
              <rect key={i} x={-sw / 2} y={-sh / 2} width={sw} height={sh} rx={0.3}
                transform={`translate(${cx}, ${cy}) rotate(${rotDeg})`}
                fill="none" stroke={p.color} strokeWidth={p.strokeWidth * 0.7} />
            );
          })}
          {/* Keyway slot at 6 o'clock */}
          <rect x={-2} y={9} width={4} height={3} rx={0.3} fill="none" stroke={p.color} strokeWidth={p.strokeWidth * 0.7} />
        </g>
      );
    },
  },
  "cam-lok": {
    widthMm: 34.0, heightMm: 34.0,
    render: (p) => {
      if (p.detail === 0) return dot(34.0, p.color);
      const outline = <circle r={17} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      return (
        <g>
          {outline}
          <circle r={6} fill={p.color} fillOpacity={0.3} stroke={p.color} strokeWidth={p.strokeWidth * 0.7} />
        </g>
      );
    },
  },
  "socapex": {
    widthMm: 55.0, heightMm: 55.0,
    render: (p) => {
      const outline = renderCircleWithNotch(55.0, 8.0, 4.0, "top", p);
      if (p.detail < 2) return outline;
      const pr = 0.7;
      const pins: React.JSX.Element[] = [];
      // Outer ring: 12 pins at r=14, 30° spacing
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 * Math.PI) / 180;
        pins.push(<circle key={`o${i}`} cx={14 * Math.cos(a)} cy={-14 * Math.sin(a)} r={pr} fill={p.color} />);
      }
      // Inner ring: 6 pins at r=8, 60° spacing
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 * Math.PI) / 180;
        pins.push(<circle key={`i${i}`} cx={8 * Math.cos(a)} cy={-8 * Math.sin(a)} r={pr} fill={p.color} />);
      }
      // Center pin
      pins.push(<circle key="c" cx={0} cy={0} r={pr} fill={p.color} />);
      return <g>{outline}{pins}</g>;
    },
  },
  "multipin": {
    widthMm: 38.0, heightMm: 38.0,
    render: (p) => {
      const outline = renderCircleWithNotch(38.0, 6.0, 3.0, "top", p);
      if (p.detail < 2) return outline;
      const pr = 0.4;
      const pins: React.JSX.Element[] = [];
      // Center
      pins.push(<circle key="c" cx={0} cy={0} r={pr} fill={p.color} />);
      // Ring 1: 6 at r=3.5
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 * Math.PI) / 180;
        pins.push(<circle key={`r1-${i}`} cx={3.5 * Math.cos(a)} cy={-3.5 * Math.sin(a)} r={pr} fill={p.color} />);
      }
      // Ring 2: 12 at r=7
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 * Math.PI) / 180;
        pins.push(<circle key={`r2-${i}`} cx={7 * Math.cos(a)} cy={-7 * Math.sin(a)} r={pr} fill={p.color} />);
      }
      // Ring 3: 18 at r=9.5
      for (let i = 0; i < 18; i++) {
        const a = (i * 20 * Math.PI) / 180;
        pins.push(<circle key={`r3-${i}`} cx={9.5 * Math.cos(a)} cy={-9.5 * Math.sin(a)} r={pr} fill={p.color} />);
      }
      return <g>{outline}{pins}</g>;
    },
  },

  // ── Ethernet / RJ ──
  "rj45": { widthMm: 11.7, heightMm: 6.6, render: ({ color, detail, strokeWidth }) => {
    const outline = renderRJ(11.7, 6.6, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const n = 8, x0 = -4.1, x1 = 4.1, sp = (x1 - x0) / (n - 1);
    return (<g>{outline}{Array.from({ length: n }, (_, i) => <line key={i} x1={x0 + i * sp} y1={-2.8} x2={x0 + i * sp} y2={-1.5} stroke={color} strokeWidth={strokeWidth * 0.4} />)}</g>);
  }},
  "rj11": { widthMm: 9.65, heightMm: 6.6, render: ({ color, detail, strokeWidth }) => {
    const outline = renderRJ(9.65, 6.6, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const n = 4, x0 = -1.8, x1 = 1.8, sp = (x1 - x0) / (n - 1);
    return (<g>{outline}{Array.from({ length: n }, (_, i) => <line key={i} x1={x0 + i * sp} y1={-2.8} x2={x0 + i * sp} y2={-1.5} stroke={color} strokeWidth={strokeWidth * 0.4} />)}</g>);
  }},

  // ── Video ──
  "hdmi": { widthMm: 14.0, heightMm: 4.55, render: ({ color, detail, strokeWidth }) => {
    const outline = renderHDMI(14.0, 4.55, 1.9, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<line x1={-5.5} y1={-0.8} x2={5.5} y2={-0.8} stroke={color} strokeWidth={strokeWidth * 0.5} /><line x1={-5.0} y1={0.8} x2={5.0} y2={0.8} stroke={color} strokeWidth={strokeWidth * 0.5} /></g>);
  }},
  "mini-hdmi": { widthMm: 10.42, heightMm: 2.42, render: ({ color, detail, strokeWidth }) => {
    const outline = renderHDMI(10.42, 2.42, 1.3, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<line x1={-4.0} y1={-0.4} x2={4.0} y2={-0.4} stroke={color} strokeWidth={strokeWidth * 0.5} /><line x1={-3.5} y1={0.4} x2={3.5} y2={0.4} stroke={color} strokeWidth={strokeWidth * 0.5} /></g>);
  }},
  "displayport": { widthMm: 16.1, heightMm: 4.76, render: ({ color, detail, strokeWidth }) => {
    const outline = renderClipCorner(16.1, 4.76, 1.8, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<line x1={-6.5} y1={-0.9} x2={6.5} y2={-0.9} stroke={color} strokeWidth={strokeWidth * 0.5} /><line x1={-6.5} y1={0.9} x2={6.0} y2={0.9} stroke={color} strokeWidth={strokeWidth * 0.5} /></g>);
  }},
  "mini-displayport": { widthMm: 7.5, heightMm: 4.6, render: ({ color, detail, strokeWidth }) => {
    const outline = renderClipCorner(7.5, 4.6, 1.2, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<line x1={-2.8} y1={-0.8} x2={2.8} y2={-0.8} stroke={color} strokeWidth={strokeWidth * 0.5} /><line x1={-2.8} y1={0.8} x2={2.5} y2={0.8} stroke={color} strokeWidth={strokeWidth * 0.5} /></g>);
  }},
  "dvi": { widthMm: 24.77, heightMm: 8.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderRectangle(24.77, 8.0, 1.0, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const pr = 0.25;
    const rows = [-2.5, 0, 2.5];
    const pinXs = Array.from({ length: 8 }, (_, i) => 1.5 + i * 1.357);
    return (<g>{outline}{rows.map(cy => pinXs.map(cx => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={pr} fill={color} />))}<line x1={-11} y1={0} x2={-6} y2={0} stroke={color} strokeWidth={strokeWidth * 1.5} />{[[-10,-2],[-7,-2],[-10,2],[-7,2]].map(([cx,cy]) => <circle key={`b${cx}${cy}`} cx={cx} cy={cy} r={pr} fill={color} />)}</g>);
  }},
  "vga": { widthMm: 30.82, heightMm: 12.55, render: ({ color, detail, strokeWidth }) => {
    const outline = renderDSub(30.82, 12.55, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const pr = 0.5, sp = 4.8;
    const topX = Array.from({ length: 5 }, (_, i) => -9.6 + i * sp);
    const midX = Array.from({ length: 5 }, (_, i) => -9.6 + sp * 0.5 + i * sp);
    return (<g>{outline}{topX.map(cx => <circle key={`t${cx}`} cx={cx} cy={-3.3} r={pr} fill={color} />)}{midX.map(cx => <circle key={`m${cx}`} cx={cx} cy={0} r={pr} fill={color} />)}{topX.map(cx => <circle key={`b${cx}`} cx={cx} cy={3.3} r={pr} fill={color} />)}</g>);
  }},

  // ── USB family ──
  "usb-a": { widthMm: 12.0, heightMm: 4.5, render: ({ color, detail, strokeWidth }) => {
    const outline = renderUSBA(12.0, 4.5, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-5.5} y={0} width={11.0} height={1.8} fill={color} fillOpacity={0.2} />{[-3.5,-1.2,1.2,3.5].map(cx => <rect key={cx} x={cx-0.5} y={-0.3} width={1.0} height={0.3} fill={color} />)}</g>);
  }},
  "usb-b": { widthMm: 8.45, heightMm: 7.78, render: ({ color, detail, strokeWidth }) => {
    const outline = renderUSBB(8.45, 7.78, 1.8, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-2.5} y={-3.2} width={5.0} height={1.0} fill={color} fillOpacity={0.2} /></g>);
  }},
  "usb-c": { widthMm: 8.94, heightMm: 3.26, render: ({ color, detail, strokeWidth }) => {
    const outline = renderStadium(8.94, 3.26, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<line x1={-3.5} y1={0} x2={3.5} y2={0} stroke={color} strokeWidth={strokeWidth * 0.5} /></g>);
  }},
  "usb-mini": { widthMm: 6.8, heightMm: 1.8, render: ({ color, detail, strokeWidth }) => {
    const outline = renderHDMI(6.8, 1.8, 0.65, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<line x1={-2.5} y1={0.2} x2={2.5} y2={0.2} stroke={color} strokeWidth={strokeWidth * 0.4} /></g>);
  }},

  // ── D-sub family ──
  "db9": { widthMm: 25.0, heightMm: 12.55, render: ({ color, detail, strokeWidth }) => {
    const outline = renderDSub(25.0, 12.55, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const pr = 0.4;
    const top = Array.from({ length: 5 }, (_, i) => -7.6 + i * 3.8);
    const bot = Array.from({ length: 4 }, (_, i) => -5.7 + i * 3.8);
    return (<g>{outline}{top.map(cx => <circle key={`t${cx}`} cx={cx} cy={-2.5} r={pr} fill={color} />)}{bot.map(cx => <circle key={`b${cx}`} cx={cx} cy={2.5} r={pr} fill={color} />)}</g>);
  }},
  "db15": { widthMm: 33.3, heightMm: 12.55, render: ({ color, detail, strokeWidth }) => {
    const outline = renderDSub(33.3, 12.55, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const pr = 0.4, sp = 3.4;
    const top = Array.from({ length: 8 }, (_, i) => -sp * 3.5 + i * sp);
    const bot = Array.from({ length: 7 }, (_, i) => -sp * 3.0 + i * sp);
    return (<g>{outline}{top.map(cx => <circle key={`t${cx}`} cx={cx} cy={-2.5} r={pr} fill={color} />)}{bot.map(cx => <circle key={`b${cx}`} cx={cx} cy={2.5} r={pr} fill={color} />)}</g>);
  }},
  "db25": { widthMm: 47.04, heightMm: 12.55, render: ({ color, detail, strokeWidth }) => {
    const outline = renderDSub(47.04, 12.55, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const pr = 0.4, sp = 2.8;
    const top = Array.from({ length: 13 }, (_, i) => -sp * 6 + i * sp);
    const bot = Array.from({ length: 12 }, (_, i) => -sp * 5.5 + i * sp);
    return (<g>{outline}{top.map(cx => <circle key={`t${cx}`} cx={cx} cy={-2.5} r={pr} fill={color} />)}{bot.map(cx => <circle key={`b${cx}`} cx={cx} cy={2.5} r={pr} fill={color} />)}</g>);
  }},
  "db7w2": { widthMm: 25.0, heightMm: 12.55, render: ({ color, detail, strokeWidth }) => {
    const outline = renderDSub(25.0, 12.55, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    const smallPins = Array.from({ length: 5 }, (_, i) => 1.0 + i * 2.0);
    return (<g>{outline}{smallPins.map(cx => <circle key={`s${cx}`} cx={cx} cy={0} r={0.4} fill={color} />)}<circle cx={-5} cy={-2} r={0.75} fill={color} /><circle cx={-5} cy={2} r={0.75} fill={color} /></g>);
  }},

  // ── Fiber ──
  "lc":             { widthMm: 6.3,   heightMm: 9.0,   render: (p) => renderRectangle(6.3, 9.0, 0.5, p) },
  "sc":             { widthMm: 9.0,   heightMm: 9.0,   render: (p) => renderRectangle(9.0, 9.0, 0.5, p) },
  "toslink":        { widthMm: 7.2,   heightMm: 9.8,   render: renderToslink },
  "sfp":            { widthMm: 13.4,  heightMm: 8.5,   render: (p) => renderRectangle(13.4, 8.5, 0.5, p) },
  "qsfp":           { widthMm: 18.4,  heightMm: 8.5,   render: (p) => renderRectangle(18.4, 8.5, 0.5, p) },
  "mpo":            { widthMm: 11.5,  heightMm: 9.5,   render: (p) => renderRectangle(11.5, 9.5, 1.5, p) },
  "opticalcon":     { widthMm: 27.7,  heightMm: 26.5,  render: (p) => renderNeutrikD(27.7, 2.5, 27.7, 26.5, p) },

  // ── Neutrik pro panel ──
  "ethercon":       { widthMm: 27.7,  heightMm: 26.5,  render: (p) => renderNeutrikD(27.7, 2.5, 27.7, 26.5, p) },
  "powercon": {
    widthMm: 29.0, heightMm: 29.0,
    render: (p) => {
      if (p.detail === 0) return dot(29.0, p.color);
      const outline = <circle r={14.5} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      const cr = 1.0; // contact radius (⌀2mm)
      const R = 10;
      return (
        <g>
          {outline}
          {/* Line ~2 o'clock */}
          <circle cx={R * Math.cos((60 * Math.PI) / 180)} cy={-R * Math.sin((60 * Math.PI) / 180)} r={cr} fill={p.color} />
          {/* Neutral ~10 o'clock */}
          <circle cx={R * Math.cos((120 * Math.PI) / 180)} cy={-R * Math.sin((120 * Math.PI) / 180)} r={cr} fill={p.color} />
          {/* Earth ~6 o'clock */}
          <circle cx={0} cy={R} r={cr} fill={p.color} />
        </g>
      );
    },
  },
  "powercon-true1": {
    widthMm: 29.0, heightMm: 29.0,
    render: (p) => {
      if (p.detail === 0) return dot(29.0, p.color);
      const outline = <circle r={14.5} fill="none" stroke={p.color} strokeWidth={p.strokeWidth} />;
      if (p.detail < 2) return outline;
      const cr = 1.0;
      const R = 10;
      return (
        <g>
          {outline}
          {/* Shutter ring */}
          <circle r={8} fill="none" stroke={p.color} strokeWidth={p.strokeWidth * 0.5} strokeDasharray="2 1.5" />
          {/* Line ~2 o'clock */}
          <circle cx={R * Math.cos((60 * Math.PI) / 180)} cy={-R * Math.sin((60 * Math.PI) / 180)} r={cr} fill={p.color} />
          {/* Neutral ~10 o'clock */}
          <circle cx={R * Math.cos((120 * Math.PI) / 180)} cy={-R * Math.sin((120 * Math.PI) / 180)} r={cr} fill={p.color} />
          {/* Earth ~6 o'clock */}
          <circle cx={0} cy={R} r={cr} fill={p.color} />
        </g>
      );
    },
  },

  // ── Terminal / screw ──
  "phoenix":        { widthMm: 3.5,   heightMm: 7.0,   render: (p) => renderRectangle(3.5, 7.0, 0.3, p) },
  "terminal-block": { widthMm: 9.5,   heightMm: 16.0,  render: (p) => renderRectangle(9.5, 16.0, 0.5, p) },

  // ── IEC power ──
  "iec": { widthMm: 22.0, heightMm: 17.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderRectangle(22.0, 17.0, 1.5, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-4.5} y={-4.5} width={3} height={1.2} fill={color} /><rect x={1.5} y={-4.5} width={3} height={1.2} fill={color} /><circle cx={0} cy={4} r={1.5} fill={color} /></g>);
  }},
  "iec-c5": { widthMm: 16.0, heightMm: 14.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderIECC5({ color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<circle cx={-3.5} cy={-1.5} r={1.2} fill={color} /><circle cx={3.5} cy={-1.5} r={1.2} fill={color} /><circle cx={0} cy={4} r={1.2} fill={color} /></g>);
  }},
  "iec-c7": { widthMm: 11.5, heightMm: 8.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderIECC7({ color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-2.25} y={-1.5} width={1} height={3} fill={color} /><rect x={1.25} y={-1.5} width={1} height={3} fill={color} /></g>);
  }},
  "iec-c15": { widthMm: 22.0, heightMm: 17.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderIECC15({ color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-4.5} y={-4.5} width={3} height={1.2} fill={color} /><rect x={1.5} y={-4.5} width={3} height={1.2} fill={color} /><circle cx={0} cy={4} r={1.5} fill={color} /></g>);
  }},
  "iec-c20": { widthMm: 28.5, heightMm: 17.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderRectangle(28.5, 17.0, 1.5, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-5.6} y={0.5} width={1.2} height={4} fill={color} /><rect x={4.4} y={0.5} width={1.2} height={4} fill={color} /><circle cx={0} cy={-4.5} r={1.5} fill={color} /></g>);
  }},

  // ── NEMA / Edison ──
  "edison": { widthMm: 33.3, heightMm: 26.2, render: ({ color, detail, strokeWidth }) => {
    const outline = renderRectangle(33.3, 26.2, 1.0, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<rect x={-7} y={-5} width={2.5} height={8} fill={color} rx={0.3} /><rect x={4.5} y={-5} width={1.8} height={6.5} fill={color} rx={0.3} /><path d="M -2.5 5 L -2.5 8 A 2.5 2.5 0 0 0 2.5 8 L 2.5 5" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /></g>);
  }},
  "l5-20": { widthMm: 41.3, heightMm: 41.3, render: ({ color, detail, strokeWidth }) => {
    const outline = renderCircle(41.3, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<path d="M -2 12 L -2 15 A 2 2 0 0 0 2 15 L 2 12" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /><path d="M -8.5 -7.5 A 12 12 0 0 1 -3.5 -11.5" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M 3.5 -11.5 A 12 12 0 0 1 8.5 -7.5" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /></g>);
  }},
  "l6-20": { widthMm: 41.3, heightMm: 41.3, render: ({ color, detail, strokeWidth }) => {
    const outline = renderCircle(41.3, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<path d="M -13.5 6.5 L -11 9 A 2 2 0 0 0 -9 6.5 L -11.5 4" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /><path d="M -4 -11.5 A 12 12 0 0 1 4 -11.5" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M 8.5 7.5 A 12 12 0 0 1 3.5 11.5" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /></g>);
  }},
  "l6-30": { widthMm: 50.8, heightMm: 50.8, render: ({ color, detail, strokeWidth }) => {
    const outline = renderCircle(50.8, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<path d="M -16.5 8 L -14 10.5 A 2.5 2.5 0 0 0 -11 8 L -13.5 5.5" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /><path d="M -5.5 -14 A 15 15 0 0 1 5.5 -14" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M 11 9 A 15 15 0 0 1 4.5 14" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /></g>);
  }},
  "l21-30": { widthMm: 54.0, heightMm: 54.0, render: ({ color, detail, strokeWidth }) => {
    const outline = renderCircle(54.0, { color, detail, strokeWidth });
    if (detail < 2) return outline;
    return (<g>{outline}<path d="M -5.5 -15 A 16 16 0 0 1 5.5 -15" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M 15 -5.5 A 16 16 0 0 1 15 5.5" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M 5.5 15 A 16 16 0 0 1 -5.5 15" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M -15 5.5 A 16 16 0 0 1 -15 -5.5" fill="none" stroke={color} strokeWidth={strokeWidth * 1.5} strokeLinecap="round" /><path d="M -13 11 L -11 14 A 2.5 2.5 0 0 0 -8 12 L -10 9" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /></g>);
  }},

  // ── Generic ──
  "other":          { widthMm: 10.0,  heightMm: 6.0,   render: (p) => renderRectangle(10.0, 6.0, 0.5, p) },
};

// ── Default/fallback spec ─────────────────────────────────────────

const GENERIC_SPEC: ConnectorSpec = {
  widthMm: 10.0,
  heightMm: 6.0,
  render: (p) => renderRectangle(10.0, 6.0, 0.5, p),
};

// ══════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════

/** Get the spec for a connector type */
export function getConnectorSpec(connectorType?: ConnectorType): ConnectorSpec {
  if (!connectorType || connectorType === "none") return GENERIC_SPEC;
  return CONNECTOR_SPECS[connectorType] ?? GENERIC_SPEC;
}

/** Default stroke width in mm for connector outlines */
const DEFAULT_STROKE_MM = 0.6;

/** Render a connector icon SVG element at a given position */
export function ConnectorIcon({ x, y, connectorType, scale, color, detail }: {
  x: number;
  y: number;
  connectorType?: ConnectorType;
  /** Pixels per millimeter — converts mm coordinate space to screen px */
  scale: number;
  color: string;
  detail?: number;
}) {
  const spec = getConnectorSpec(connectorType);
  const strokeWidth = DEFAULT_STROKE_MM;
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {spec.render({ color, detail: detail ?? 1, strokeWidth })}
    </g>
  );
}
