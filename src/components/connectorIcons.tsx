/**
 * SVG connector icon library for rack face-plate rendering.
 *
 * Each icon is a function that returns an SVG <g> element centered at (0, 0).
 * Icons are designed to be recognizable at 10-16px and scale cleanly.
 *
 * Shape accuracy is the primary goal — each connector's outline should match
 * its real-world silhouette as closely as possible at small sizes.
 *
 * Detail levels:
 *   0 = colored dot (very zoomed out)
 *   1 = accurate silhouette outline (default)
 *   2 = internal features — pins, contacts, screws
 */

import type React from "react";
import type { ConnectorType } from "../types";

interface IconProps {
  /** Icon size (width = height for most; width for rectangular ones) */
  size: number;
  /** Fill color (typically signal type color) */
  color: string;
  /** Detail level: 0 = dot, 1 = silhouette, 2 = detailed with pins */
  detail?: number;
}

type IconFn = (props: IconProps) => React.JSX.Element;

// ── Circular connectors ───────────────────────────────────────────

/** XLR-3: Circle with raised key notch at top, 3 pins in triangle */
function IconXLR3({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.12} />
      {/* Key notch at top */}
      <rect x={-s * 0.1} y={-r - s * 0.02} width={s * 0.2} height={s * 0.12} fill={color} />
      {detail >= 2 && (
        <>
          <circle cx={0} cy={-r * 0.35} r={s * 0.06} fill={color} />
          <circle cx={-r * 0.3} cy={r * 0.2} r={s * 0.06} fill={color} />
          <circle cx={r * 0.3} cy={r * 0.2} r={s * 0.06} fill={color} />
        </>
      )}
    </g>
  );
}

/** XLR-4: Same housing as XLR-3, 4 pins in square at detail=2 */
function IconXLR4({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.12} />
      <rect x={-s * 0.1} y={-r - s * 0.02} width={s * 0.2} height={s * 0.12} fill={color} />
      {detail >= 2 && (
        <>
          <circle cx={-r * 0.25} cy={-r * 0.25} r={s * 0.055} fill={color} />
          <circle cx={r * 0.25} cy={-r * 0.25} r={s * 0.055} fill={color} />
          <circle cx={-r * 0.25} cy={r * 0.25} r={s * 0.055} fill={color} />
          <circle cx={r * 0.25} cy={r * 0.25} r={s * 0.055} fill={color} />
        </>
      )}
    </g>
  );
}

/** XLR-5: Same housing as XLR-3, 5 pins in pentagon at detail=2 */
function IconXLR5({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.12} />
      <rect x={-s * 0.1} y={-r - s * 0.02} width={s * 0.2} height={s * 0.12} fill={color} />
      {detail >= 2 && (
        <>
          {/* Pentagon arrangement */}
          <circle cx={0} cy={-r * 0.35} r={s * 0.05} fill={color} />
          <circle cx={-r * 0.33} cy={-r * 0.1} r={s * 0.05} fill={color} />
          <circle cx={r * 0.33} cy={-r * 0.1} r={s * 0.05} fill={color} />
          <circle cx={-r * 0.2} cy={r * 0.3} r={s * 0.05} fill={color} />
          <circle cx={r * 0.2} cy={r * 0.3} r={s * 0.05} fill={color} />
        </>
      )}
    </g>
  );
}

/** BNC: Circle with two bayonet lock tabs */
function IconBNC({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r * 0.75} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Bayonet tabs */}
      <rect x={-s * 0.08} y={-r} width={s * 0.16} height={s * 0.15} fill={color} rx={s * 0.03} />
      <rect x={-s * 0.08} y={r - s * 0.15} width={s * 0.16} height={s * 0.15} fill={color} rx={s * 0.03} />
      {detail >= 2 && <circle r={s * 0.08} fill={color} />}
    </g>
  );
}

/** powerCON: Circle with twist-lock arc indicator */
function IconPowerCON({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.12} />
      {/* Twist-lock arc */}
      <path
        d={`M ${-r * 0.4} ${-r * 0.4} A ${r * 0.55} ${r * 0.55} 0 0 1 ${r * 0.4} ${-r * 0.4}`}
        fill="none" stroke={color} strokeWidth={s * 0.08} strokeLinecap="round"
      />
      {detail >= 2 && (
        <>
          <circle cx={0} cy={r * 0.25} r={s * 0.07} fill={color} />
          <circle cx={-r * 0.3} cy={-r * 0.15} r={s * 0.07} fill={color} />
          <circle cx={r * 0.3} cy={-r * 0.15} r={s * 0.07} fill={color} />
        </>
      )}
    </g>
  );
}

/** speakON: D-shaped connector — circle with flat key edge on left */
function IconSpeakON({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  // D-shape: circle arc on the right, flat edge on the left
  const R = r * 0.85;
  const fx = -r * 0.4; // x of the flat edge
  const fy = Math.sqrt(R * R - fx * fx);
  const d = `M ${fx} ${-fy} A ${R} ${R} 0 1 1 ${fx} ${fy} Z`;
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={s * 0.1} strokeLinejoin="round" />
      {detail >= 2 && (
        <>
          {/* Two contact pairs */}
          <circle cx={r * 0.1} cy={-r * 0.2} r={s * 0.06} fill={color} />
          <circle cx={r * 0.1} cy={r * 0.2} r={s * 0.06} fill={color} />
        </>
      )}
    </g>
  );
}

/** TRS 1/4": Circle jack (barrel connector) */
function IconTRS({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r * 0.85} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {detail >= 2 && <circle r={s * 0.1} fill={color} />}
    </g>
  );
}

/** RCA: Circle with center pin and ground ring */
function IconRCA({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r * 0.8} fill="none" stroke={color} strokeWidth={s * 0.12} />
      <circle r={s * 0.12} fill={color} />
    </g>
  );
}

/** DIN-5: Circle with wide horseshoe key notch at bottom */
function IconDIN5({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  const R = r * 0.9;
  return (
    <g>
      <circle r={R} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Wide key notch at bottom — a thick arc-shaped bump */}
      <rect x={-s * 0.25} y={R - s * 0.03} width={s * 0.5} height={s * 0.12} fill={color} rx={s * 0.03} />
      {detail >= 2 && (
        <>
          {/* 5 pins in semicircle arrangement (top half) */}
          {[0, 1, 2, 3, 4].map(i => {
            const angle = Math.PI + (Math.PI / 4) * (i - 2); // spread across top
            const pr = R * 0.5;
            return <circle key={i} cx={pr * Math.cos(angle)} cy={pr * Math.sin(angle)} r={s * 0.05} fill={color} />;
          })}
        </>
      )}
    </g>
  );
}

/** Mini-DIN (PS/2): Circle with flat rectangular key at bottom */
function IconMiniDIN({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  const R = r * 0.85;
  return (
    <g>
      <circle r={R} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Rectangular key — flat bar at bottom */}
      <rect x={-s * 0.18} y={R - s * 0.06} width={s * 0.36} height={s * 0.12} fill={color} rx={s * 0.02} />
      {detail >= 2 && (
        <>
          {/* Pin arrangement in two rows */}
          <circle cx={-r * 0.25} cy={-r * 0.15} r={s * 0.045} fill={color} />
          <circle cx={0} cy={-r * 0.15} r={s * 0.045} fill={color} />
          <circle cx={r * 0.25} cy={-r * 0.15} r={s * 0.045} fill={color} />
          <circle cx={-r * 0.12} cy={r * 0.15} r={s * 0.045} fill={color} />
          <circle cx={r * 0.12} cy={r * 0.15} r={s * 0.045} fill={color} />
        </>
      )}
    </g>
  );
}

/** DC Barrel: Concentric circles — outer barrel ring and inner center pin */
function IconBarrel({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.5} fill={color} />;
  return (
    <g>
      <circle r={r * 0.75} fill="none" stroke={color} strokeWidth={s * 0.08} />
      <circle r={r * 0.25} fill="none" stroke={color} strokeWidth={s * 0.08} />
    </g>
  );
}

/** Banana / Binding Post: Single round post with collar */
function IconBanana({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.5} fill={color} />;
  return (
    <g>
      {/* Outer collar */}
      <circle r={r * 0.7} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {/* Center contact hole */}
      <circle r={s * 0.1} fill={color} />
      {detail >= 2 && (
        /* Knurled edge indicator — small ticks around the collar */
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            const inner = r * 0.65;
            const outer = r * 0.8;
            return <line key={i} x1={inner * Math.cos(a)} y1={inner * Math.sin(a)} x2={outer * Math.cos(a)} y2={outer * Math.sin(a)} stroke={color} strokeWidth={s * 0.04} />;
          })}
        </>
      )}
    </g>
  );
}

/** Cam-Lok: Large single-conductor round connector with big center pin */
function IconCamLok({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r * 0.9} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Large center contact */}
      <circle r={r * 0.4} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {detail >= 2 && <circle r={r * 0.15} fill={color} />}
    </g>
  );
}

/** Socapex: Large multi-pin circular with key notch */
function IconSocapex({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Key notch at top */}
      <rect x={-s * 0.12} y={-r - s * 0.02} width={s * 0.24} height={s * 0.12} fill={color} rx={s * 0.03} />
      {detail >= 2 && (
        /* Ring of pins */
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i * 2 * Math.PI) / 7 - Math.PI / 2;
            return <circle key={i} cx={r * 0.55 * Math.cos(a)} cy={r * 0.55 * Math.sin(a)} r={s * 0.04} fill={color} />;
          })}
        </>
      )}
    </g>
  );
}

/** OpticalCON: Circular Neutrik housing with dual LC fiber port inside */
function IconOpticalcon({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Dual fiber ports — two small rectangles side by side */}
      <rect x={-s * 0.22} y={-s * 0.12} width={s * 0.17} height={s * 0.24} rx={s * 0.02} fill="none" stroke={color} strokeWidth={s * 0.06} />
      <rect x={s * 0.05} y={-s * 0.12} width={s * 0.17} height={s * 0.24} rx={s * 0.02} fill="none" stroke={color} strokeWidth={s * 0.06} />
    </g>
  );
}

/** Generic multi-pin: Circle with key notch and dot grid inside */
function IconMultipin({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r * 0.9} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Key notch */}
      <rect x={-s * 0.08} y={-r * 0.9 - s * 0.02} width={s * 0.16} height={s * 0.1} fill={color} />
      {detail >= 2 && (
        <>
          {/* 3x3 pin grid */}
          {[-1, 0, 1].map(row =>
            [-1, 0, 1].map(col => (
              <circle key={`${row}-${col}`} cx={col * r * 0.3} cy={row * r * 0.3} r={s * 0.04} fill={color} />
            ))
          )}
        </>
      )}
    </g>
  );
}

/** NEMA twist-lock (L5-20, L6-20, etc.): Circle with curved blade slots */
function IconTwistLock({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r * 0.9} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Curved blade slots — the defining feature of twist-lock */}
      <path
        d={`M ${-r * 0.15} ${-r * 0.45} A ${r * 0.35} ${r * 0.35} 0 0 1 ${r * 0.25} ${-r * 0.25}`}
        fill="none" stroke={color} strokeWidth={s * 0.07} strokeLinecap="round"
      />
      <path
        d={`M ${r * 0.15} ${r * 0.45} A ${r * 0.35} ${r * 0.35} 0 0 1 ${-r * 0.25} ${r * 0.25}`}
        fill="none" stroke={color} strokeWidth={s * 0.07} strokeLinecap="round"
      />
      {detail >= 2 && (
        /* Ground slot */
        <circle cx={0} cy={0} r={s * 0.06} fill={color} />
      )}
    </g>
  );
}

// ── Rectangular / D-shaped connectors ─────────────────────────────

/** RJ45: Rectangle with clip tab at bottom */
function IconRJ45({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.8, h = s * 0.65;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.05} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Clip tab */}
      <rect x={-w * 0.2} y={h / 2 - s * 0.04} width={w * 0.4} height={s * 0.12} rx={s * 0.02} fill={color} />
      {detail >= 2 && (
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const cx = -w / 2 + w * 0.12 + (w * 0.76 / 7) * i;
            return <line key={i} x1={cx} y1={-h * 0.15} x2={cx} y2={h * 0.15} stroke={color} strokeWidth={s * 0.04} />;
          })}
        </>
      )}
    </g>
  );
}

/** HDMI: Trapezoid — wider at top, narrower at bottom */
function IconHDMI({ size: s, color, detail = 1 }: IconProps) {
  const tw = s * 0.9, bw = s * 0.6, h = s * 0.5;
  if (detail === 0) return <rect x={-tw / 2} y={-h / 2} width={tw} height={h} rx={1} fill={color} />;
  const points = `${-tw / 2},${-h / 2} ${tw / 2},${-h / 2} ${bw / 2},${h / 2} ${-bw / 2},${h / 2}`;
  return <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.1} strokeLinejoin="round" />;
}

/** USB-C: Pill / rounded rectangle */
function IconUSBC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.75, h = s * 0.35;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={color} />;
  return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="none" stroke={color} strokeWidth={s * 0.1} />;
}

/** USB-A: Flat rectangle, wider than tall */
function IconUSBA({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.85, h = s * 0.45;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {detail >= 2 && (
        /* Internal tongue/contact plate */
        <rect x={-w / 2 + s * 0.08} y={-h * 0.25} width={w * 0.5} height={h * 0.5} fill={color} rx={s * 0.02} />
      )}
    </g>
  );
}

/** USB-B: Nearly square with two chamfered top corners */
function IconUSBB({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.6, h = s * 0.7, ch = s * 0.12;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  // Square body with two beveled top corners
  const points = `${-w / 2},${h / 2} ${-w / 2},${-h / 2 + ch} ${-w / 2 + ch},${-h / 2} ${w / 2 - ch},${-h / 2} ${w / 2},${-h / 2 + ch} ${w / 2},${h / 2}`;
  return (
    <g>
      <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.09} strokeLinejoin="round" />
      {detail >= 2 && (
        /* Internal square void */
        <rect x={-w * 0.25} y={-h * 0.15} width={w * 0.5} height={h * 0.35} fill="none" stroke={color} strokeWidth={s * 0.05} rx={s * 0.02} />
      )}
    </g>
  );
}

/** USB-Mini: Narrow trapezoid — wider at bottom, narrower at top */
function IconUSBMini({ size: s, color, detail = 1 }: IconProps) {
  const tw = s * 0.5, bw = s * 0.7, h = s * 0.32;
  if (detail === 0) return <rect x={-bw / 2} y={-h / 2} width={bw} height={h} rx={1} fill={color} />;
  const points = `${-tw / 2},${-h / 2} ${tw / 2},${-h / 2} ${bw / 2},${h / 2} ${-bw / 2},${h / 2}`;
  return <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.09} strokeLinejoin="round" />;
}

/** DisplayPort: Rectangle with one chamfered corner (bottom-right) */
function IconDisplayPort({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.75, h = s * 0.5, c = s * 0.12;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  const points = `${-w / 2},${-h / 2} ${w / 2},${-h / 2} ${w / 2},${h / 2 - c} ${w / 2 - c},${h / 2} ${-w / 2},${h / 2}`;
  return <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.1} strokeLinejoin="round" />;
}

/** SFP: Rectangle with bail/latch handle at top */
function IconSFP({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.7, h = s * 0.5;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Bail handle */}
      <path d={`M ${-w * 0.15} ${-h / 2 - s * 0.08} L ${w * 0.15} ${-h / 2 - s * 0.08}`} stroke={color} strokeWidth={s * 0.07} strokeLinecap="round" />
    </g>
  );
}

/** DB9: D-shaped outline with pin rows */
function IconDB9({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.9, h = s * 0.55, sl = s * 0.08;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={color} />;
  const points = `${-w / 2 + sl},${-h / 2} ${w / 2 - sl},${-h / 2} ${w / 2},${0} ${w / 2 - sl},${h / 2} ${-w / 2 + sl},${h / 2} ${-w / 2},${0}`;
  return (
    <g>
      <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.08} strokeLinejoin="round" />
      {detail >= 2 && (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <circle key={`t${i}`} cx={-w * 0.3 + (w * 0.6 / 4) * i} cy={-h * 0.15} r={s * 0.04} fill={color} />
          ))}
          {Array.from({ length: 4 }, (_, i) => (
            <circle key={`b${i}`} cx={-w * 0.22 + (w * 0.44 / 3) * i} cy={h * 0.15} r={s * 0.04} fill={color} />
          ))}
        </>
      )}
    </g>
  );
}

/** DVI: D-shaped outline with cross key pin on the left */
function IconDVI({ size: s, color, detail = 1 }: IconProps) {
  const w = s, h = s * 0.5, sl = s * 0.07;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  // D-shaped outline (same as DB connectors — wider in the middle, tapered at ends)
  const points = `${-w / 2 + sl},${-h / 2} ${w / 2 - sl},${-h / 2} ${w / 2},${0} ${w / 2 - sl},${h / 2} ${-w / 2 + sl},${h / 2} ${-w / 2},${0}`;
  return (
    <g>
      <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.08} strokeLinejoin="round" />
      {/* Cross key pin on left side */}
      <line x1={-w / 2 + s * 0.1} y1={-h * 0.15} x2={-w / 2 + s * 0.1} y2={h * 0.15} stroke={color} strokeWidth={s * 0.06} />
      <line x1={-w / 2 + s * 0.06} y1={0} x2={-w / 2 + s * 0.14} y2={0} stroke={color} strokeWidth={s * 0.06} />
      {detail >= 2 && (
        /* Three rows of pin pairs */
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={`t${i}`} cx={-w * 0.15 + (w * 0.55 / 7) * i} cy={-h * 0.2} r={s * 0.025} fill={color} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={`b${i}`} cx={-w * 0.15 + (w * 0.55 / 7) * i} cy={h * 0.2} r={s * 0.025} fill={color} />
          ))}
        </>
      )}
    </g>
  );
}

/** VGA: Wide D-shape (DB15HD) */
function IconVGA({ size: s, color, detail = 1 }: IconProps) {
  const w = s, h = s * 0.5, sl = s * 0.08;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={color} />;
  const points = `${-w / 2 + sl},${-h / 2} ${w / 2 - sl},${-h / 2} ${w / 2},${0} ${w / 2 - sl},${h / 2} ${-w / 2 + sl},${h / 2} ${-w / 2},${0}`;
  return (
    <g>
      <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.08} strokeLinejoin="round" />
      {detail >= 2 && (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <circle key={`r1-${i}`} cx={-w * 0.3 + (w * 0.6 / 4) * i} cy={-h * 0.18} r={s * 0.03} fill={color} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <circle key={`r2-${i}`} cx={-w * 0.3 + (w * 0.6 / 4) * i} cy={0} r={s * 0.03} fill={color} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <circle key={`r3-${i}`} cx={-w * 0.3 + (w * 0.6 / 4) * i} cy={h * 0.18} r={s * 0.03} fill={color} />
          ))}
        </>
      )}
    </g>
  );
}

// ── IEC power inlet variants ──────────────────────────────────────

/** IEC C13/C14: Rectangle with chamfered corner (prevents upside-down insertion) */
function IconIEC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.8, h = s * 0.6, ch = s * 0.08;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  // Rectangle with one chamfered corner (bottom-left) for orientation
  const points = `${-w / 2},${-h / 2} ${w / 2},${-h / 2} ${w / 2},${h / 2} ${-w / 2 + ch},${h / 2} ${-w / 2},${h / 2 - ch}`;
  return (
    <g>
      <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.1} strokeLinejoin="round" />
      {detail >= 2 && (
        <>
          {/* Two horizontal line slots + ground */}
          <line x1={-w * 0.2} y1={-h * 0.12} x2={-w * 0.02} y2={-h * 0.12} stroke={color} strokeWidth={s * 0.05} strokeLinecap="round" />
          <line x1={w * 0.02} y1={-h * 0.12} x2={w * 0.2} y2={-h * 0.12} stroke={color} strokeWidth={s * 0.05} strokeLinecap="round" />
          <circle cx={0} cy={h * 0.18} r={s * 0.05} fill={color} />
        </>
      )}
    </g>
  );
}

/** IEC C5 (Cloverleaf / Mickey Mouse): Three-lobed trefoil shape */
function IconIECC5({ size: s, color, detail = 1 }: IconProps) {
  if (detail === 0) return <circle r={s * 0.3} fill={color} />;
  // Three circular lobes form the cloverleaf outline.
  // Lobe centers: top-left (-0.15, -0.07), top-right (0.15, -0.07), bottom (0, 0.17)
  // Lobe radius: 0.17 * s
  // Intersection points between adjacent lobes:
  //   P1 = (0, -0.15) — notch between two top lobes
  //   P2 = (0.155, 0.10) — notch between right-top and bottom
  //   P3 = (-0.155, 0.10) — notch between bottom and left-top
  // Each arc traces the OUTER portion (~240°) of one lobe circle.
  const lr = s * 0.17;
  const d = [
    `M ${0} ${-0.15 * s}`,
    `A ${lr} ${lr} 0 1 1 ${0.155 * s} ${0.10 * s}`,   // right-top lobe
    `A ${lr} ${lr} 0 1 1 ${-0.155 * s} ${0.10 * s}`,   // bottom lobe
    `A ${lr} ${lr} 0 1 1 ${0} ${-0.15 * s}`,            // left-top lobe
    "Z",
  ].join(" ");
  return <path d={d} fill="none" stroke={color} strokeWidth={s * 0.08} strokeLinejoin="round" />;
}

/** IEC C7 (Figure-8): Pill / capsule shape, two prong openings */
function IconIECC7({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.65, h = s * 0.35;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={color} />;
  return (
    <g>
      {/* Capsule outline — fully rounded ends */}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {detail >= 2 && (
        <>
          <circle cx={-w * 0.22} cy={0} r={s * 0.05} fill={color} />
          <circle cx={w * 0.22} cy={0} r={s * 0.05} fill={color} />
        </>
      )}
    </g>
  );
}

// ── Fiber / optical connectors ────────────────────────────────────

/** TOSLINK: Rounded square — flat top, rounded bottom */
function IconTOSLINK({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.55, h = s * 0.55;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      {/* House shape: flat top, rounded bottom corners */}
      <path
        d={`M ${-w / 2} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2} ${h / 2 - w * 0.35} Q ${w / 2} ${h / 2} ${w / 2 - w * 0.35} ${h / 2} L ${-w / 2 + w * 0.35} ${h / 2} Q ${-w / 2} ${h / 2} ${-w / 2} ${h / 2 - w * 0.35} Z`}
        fill="none" stroke={color} strokeWidth={s * 0.08}
      />
    </g>
  );
}

/** LC Fiber: Small rectangle with push-pull tab */
function IconLC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.45, h = s * 0.7;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {/* Pull tab */}
      <rect x={-w * 0.25} y={-h / 2 - s * 0.1} width={w * 0.5} height={s * 0.1} fill={color} rx={s * 0.02} />
    </g>
  );
}

/** SC Fiber: Wider square with push-pull tab */
function IconSC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.6, h = s * 0.6;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.05} fill="none" stroke={color} strokeWidth={s * 0.09} />
      <rect x={-w * 0.15} y={-h / 2 - s * 0.08} width={w * 0.3} height={s * 0.08} fill={color} rx={s * 0.02} />
    </g>
  );
}

// ── Panel-mount / terminal connectors ─────────────────────────────

/** EtherCon: RJ45 inside a circular Neutrik housing */
function IconEtherCon({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Inner RJ45 shape */}
      <rect x={-s * 0.25} y={-s * 0.2} width={s * 0.5} height={s * 0.35} rx={s * 0.03} fill="none" stroke={color} strokeWidth={s * 0.06} />
    </g>
  );
}

/** Phoenix Contact / Euroblock: Rectangle with screw heads along top */
function IconPhoenix({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.85, h = s * 0.55;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {/* Screw heads — the defining visual feature */}
      <circle cx={-w * 0.25} cy={-h * 0.18} r={s * 0.06} fill={color} />
      <circle cx={w * 0.25} cy={-h * 0.18} r={s * 0.06} fill={color} />
      {detail >= 2 && (
        <>
          {/* Screw slots */}
          <line x1={-w * 0.25 - s * 0.04} y1={-h * 0.18} x2={-w * 0.25 + s * 0.04} y2={-h * 0.18} stroke="white" strokeWidth={s * 0.025} />
          <line x1={w * 0.25 - s * 0.04} y1={-h * 0.18} x2={w * 0.25 + s * 0.04} y2={-h * 0.18} stroke="white" strokeWidth={s * 0.025} />
          {/* Wire entry holes at bottom */}
          <circle cx={-w * 0.25} cy={h * 0.2} r={s * 0.05} fill="none" stroke={color} strokeWidth={s * 0.04} />
          <circle cx={w * 0.25} cy={h * 0.2} r={s * 0.05} fill="none" stroke={color} strokeWidth={s * 0.04} />
        </>
      )}
    </g>
  );
}

/** Edison (NEMA 5-15): Standard US outlet — two vertical slots + U-ground */
function IconEdison({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.7, h = s * 0.75;
  if (detail === 0) return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={color} />;
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={s * 0.06} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {/* Two vertical parallel slots (hot + neutral) */}
      <line x1={-w * 0.2} y1={-h * 0.2} x2={-w * 0.2} y2={h * 0.0} stroke={color} strokeWidth={s * 0.07} strokeLinecap="round" />
      <line x1={w * 0.2} y1={-h * 0.2} x2={w * 0.2} y2={h * 0.0} stroke={color} strokeWidth={s * 0.07} strokeLinecap="round" />
      {/* U-shaped ground */}
      <path
        d={`M ${-s * 0.07} ${h * 0.15} A ${s * 0.07} ${s * 0.07} 0 0 0 ${s * 0.07} ${h * 0.15}`}
        fill="none" stroke={color} strokeWidth={s * 0.06} strokeLinecap="round"
      />
    </g>
  );
}

// ── Generic fallback ──────────────────────────────────────────────

/** Generic fallback: simple square */
function IconGeneric({ size: s, color, detail = 1 }: IconProps) {
  const r = s * 0.35;
  if (detail === 0) return <circle r={r} fill={color} />;
  return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={s * 0.06} fill="none" stroke={color} strokeWidth={s * 0.1} />;
}

// ── Icon registry ──────────────────────────────────────────────────

const CONNECTOR_ICONS: Partial<Record<ConnectorType, IconFn>> = {
  // XLR family — same housing, different pin counts at detail=2
  "xlr-3": IconXLR3,
  "xlr-4": IconXLR4,
  "xlr-5": IconXLR5,
  "mini-xlr": IconXLR3,       // same shape, physically smaller
  "combo-xlr-trs": IconXLR3,  // XLR-dominant combo jack

  // Ethernet / data
  "rj45": IconRJ45,
  "rj11": IconRJ45,           // same shape, fewer pins

  // Video
  "hdmi": IconHDMI,
  "mini-hdmi": IconHDMI,      // same trapezoid shape
  "displayport": IconDisplayPort,
  "mini-displayport": IconDisplayPort,
  "vga": IconVGA,
  "dvi": IconDVI,
  "bnc": IconBNC,

  // USB family — each has a distinct shape
  "usb-a": IconUSBA,
  "usb-b": IconUSBB,
  "usb-c": IconUSBC,
  "usb-mini": IconUSBMini,

  // Audio
  "trs-quarter": IconTRS,
  "trs-eighth": IconTRS,      // same circle shape
  "trs-2.5mm": IconTRS,       // same circle shape
  "rca": IconRCA,
  "speakon": IconSpeakON,
  "toslink": IconTOSLINK,

  // D-sub family
  "db9": IconDB9,
  "db15": IconDB9,            // same D-shape
  "db25": IconDB9,            // same D-shape, wider at high detail
  "db7w2": IconDB9,

  // DIN family
  "din-5": IconDIN5,
  "mini-din-4": IconMiniDIN,
  "mini-din-7": IconMiniDIN,

  // Fiber
  "lc": IconLC,
  "sc": IconSC,
  "mpo": IconSC,              // similar rectangular push-pull
  "opticalcon": IconOpticalcon,
  "sfp": IconSFP,
  "qsfp": IconSFP,            // same shape, wider at high detail

  // Neutrik panel-mount
  "ethercon": IconEtherCon,
  "powercon": IconPowerCON,
  "powercon-true1": IconPowerCON,

  // Terminal / screw
  "phoenix": IconPhoenix,
  "terminal-block": IconPhoenix,

  // Power — IEC family
  "iec": IconIEC,
  "iec-c5": IconIECC5,
  "iec-c7": IconIECC7,
  "iec-c15": IconIEC,         // same shape as C13 (with notch, close enough)
  "iec-c20": IconIEC,         // same shape, larger

  // Power — NEMA
  "edison": IconEdison,
  "l5-20": IconTwistLock,
  "l6-20": IconTwistLock,
  "l6-30": IconTwistLock,
  "l21-30": IconTwistLock,

  // Single-conductor / binding
  "barrel": IconBarrel,
  "banana": IconBanana,
  "binding-post": IconBanana,
  "binding-post-banana": IconBanana,
  "cam-lok": IconCamLok,

  // Multi-pin
  "socapex": IconSocapex,
  "multipin": IconMultipin,
};

/** Get the icon component for a connector type, or the generic fallback */
export function getConnectorIcon(connectorType?: ConnectorType): IconFn {
  if (!connectorType || connectorType === "none" || connectorType === "other") return IconGeneric;
  return CONNECTOR_ICONS[connectorType] ?? IconGeneric;
}

/** Render a connector icon SVG element at a given position */
export function ConnectorIcon({ x, y, connectorType, size, color, detail }: {
  x: number;
  y: number;
  connectorType?: ConnectorType;
  size: number;
  color: string;
  detail?: number;
}) {
  const Icon = getConnectorIcon(connectorType);
  return (
    <g transform={`translate(${x}, ${y})`}>
      <Icon size={size} color={color} detail={detail} />
    </g>
  );
}
