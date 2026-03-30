/**
 * SVG connector icon library for rack face-plate rendering.
 *
 * Each icon is a function that returns an SVG <g> element centered at (0, 0).
 * Icons are designed to be recognizable at 10-16px and scale cleanly.
 *
 * Connectors are drawn as silhouettes — the outline shape is the defining feature,
 * not internal pin detail (which only matters at high zoom).
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

// ── Icon implementations ───────────────────────────────────────────

/** XLR-3: Circle with key notch at top, 3 pins in triangle */
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
          {/* 3 pins in triangle arrangement */}
          <circle cx={0} cy={-r * 0.35} r={s * 0.06} fill={color} />
          <circle cx={-r * 0.3} cy={r * 0.2} r={s * 0.06} fill={color} />
          <circle cx={r * 0.3} cy={r * 0.2} r={s * 0.06} fill={color} />
        </>
      )}
    </g>
  );
}

/** RJ45: Small rectangle with clip tab at bottom */
function IconRJ45({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.8, h = s * 0.65;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.05} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Clip tab */}
      <rect x={-w * 0.2} y={h/2 - s * 0.04} width={w * 0.4} height={s * 0.12} rx={s * 0.02} fill={color} />
      {detail >= 2 && (
        /* 8 contact lines */
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const cx = -w/2 + w * 0.12 + (w * 0.76 / 7) * i;
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
  if (detail === 0) return <rect x={-tw/2} y={-h/2} width={tw} height={h} rx={1} fill={color} />;
  const points = `${-tw/2},${-h/2} ${tw/2},${-h/2} ${bw/2},${h/2} ${-bw/2},${h/2}`;
  return <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.1} strokeLinejoin="round" />;
}

/** USB-C: Pill / rounded rectangle */
function IconUSBC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.75, h = s * 0.35;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={h/2} fill={color} />;
  return <rect x={-w/2} y={-h/2} width={w} height={h} rx={h/2} fill="none" stroke={color} strokeWidth={s * 0.1} />;
}

/** BNC: Circle with two bayonet tabs */
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

/** powerCON: Circle with twist-lock indicator */
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

/** IEC C13: Rectangle with three slots (two horizontal + one ground) */
function IconIEC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.8, h = s * 0.6;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.06} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {detail >= 2 && (
        <>
          {/* Two horizontal line slots on top */}
          <line x1={-w * 0.25} y1={-h * 0.15} x2={w * 0.25} y2={-h * 0.15} stroke={color} strokeWidth={s * 0.06} strokeLinecap="round" />
          {/* Ground slot at bottom center */}
          <circle cx={0} cy={h * 0.2} r={s * 0.06} fill={color} />
        </>
      )}
    </g>
  );
}

/** DisplayPort: Rectangle with one chamfered corner (bottom-right) */
function IconDisplayPort({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.75, h = s * 0.5, c = s * 0.12;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  const points = `${-w/2},${-h/2} ${w/2},${-h/2} ${w/2},${h/2-c} ${w/2-c},${h/2} ${-w/2},${h/2}`;
  return <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.1} strokeLinejoin="round" />;
}

/** SFP: Rectangle with bail/latch handle at top */
function IconSFP({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.7, h = s * 0.5;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {/* Bail handle */}
      <path d={`M ${-w * 0.15} ${-h/2 - s * 0.08} L ${w * 0.15} ${-h/2 - s * 0.08}`} stroke={color} strokeWidth={s * 0.07} strokeLinecap="round" />
    </g>
  );
}

/** speakON: Circle with two internal half-moon contacts */
function IconSpeakON({ size: s, color, detail = 1 }: IconProps) {
  const r = s / 2;
  if (detail === 0) return <circle r={r * 0.6} fill={color} />;
  return (
    <g>
      <circle r={r} fill="none" stroke={color} strokeWidth={s * 0.12} />
      {detail >= 2 && (
        <>
          <path d={`M ${-r * 0.3} ${-r * 0.1} A ${r * 0.3} ${r * 0.3} 0 0 1 ${-r * 0.3} ${r * 0.1}`} fill="none" stroke={color} strokeWidth={s * 0.06} />
          <path d={`M ${r * 0.3} ${-r * 0.1} A ${r * 0.3} ${r * 0.3} 0 0 0 ${r * 0.3} ${r * 0.1}`} fill="none" stroke={color} strokeWidth={s * 0.06} />
        </>
      )}
    </g>
  );
}

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

/** USB-A: Flat rectangle, wider than tall */
function IconUSBA({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.85, h = s * 0.45;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.1} />
      {detail >= 2 && (
        /* Internal tongue */
        <rect x={-w/2 + s * 0.08} y={-h * 0.25} width={w * 0.5} height={h * 0.5} fill={color} rx={s * 0.02} />
      )}
    </g>
  );
}

/** DB9: D-shaped outline with two rows of pins */
function IconDB9({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.9, h = s * 0.55, slant = s * 0.08;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={2} fill={color} />;
  const points = `${-w/2+slant},${-h/2} ${w/2-slant},${-h/2} ${w/2},${0} ${w/2-slant},${h/2} ${-w/2+slant},${h/2} ${-w/2},${0}`;
  return (
    <g>
      <polygon points={points} fill="none" stroke={color} strokeWidth={s * 0.08} strokeLinejoin="round" />
      {detail >= 2 && (
        <>
          {/* Top row: 5 pins */}
          {Array.from({ length: 5 }, (_, i) => (
            <circle key={`t${i}`} cx={-w * 0.3 + (w * 0.6 / 4) * i} cy={-h * 0.15} r={s * 0.04} fill={color} />
          ))}
          {/* Bottom row: 4 pins */}
          {Array.from({ length: 4 }, (_, i) => (
            <circle key={`b${i}`} cx={-w * 0.22 + (w * 0.44 / 3) * i} cy={h * 0.15} r={s * 0.04} fill={color} />
          ))}
        </>
      )}
    </g>
  );
}

/** TRS 1/4": Circle (barrel jack) */
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

/** RCA: Small circle with center pin and colored ring */
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

/** TOSLINK: Small square with rounded bottom edge */
function IconTOSLINK({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.55, h = s * 0.55;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h * 0.6} fill="none" stroke={color} strokeWidth={s * 0.08} />
      <path
        d={`M ${-w/2} ${h * 0.1 - h/2} L ${-w/2} ${h/2 - w * 0.4} Q ${-w/2} ${h/2} ${-w/2 + w * 0.4} ${h/2} L ${w/2 - w * 0.4} ${h/2} Q ${w/2} ${h/2} ${w/2} ${h/2 - w * 0.4} L ${w/2} ${h * 0.1 - h/2}`}
        fill="none" stroke={color} strokeWidth={s * 0.08}
      />
    </g>
  );
}

/** LC Fiber: Small rectangle with push-pull tab */
function IconLC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.45, h = s * 0.7;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {/* Pull tab */}
      <rect x={-w * 0.25} y={-h/2 - s * 0.1} width={w * 0.5} height={s * 0.1} fill={color} rx={s * 0.02} />
    </g>
  );
}

/** SC Fiber: Wider square with push-pull mechanism */
function IconSC({ size: s, color, detail = 1 }: IconProps) {
  const w = s * 0.6, h = s * 0.6;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.05} fill="none" stroke={color} strokeWidth={s * 0.09} />
      <rect x={-w * 0.15} y={-h/2 - s * 0.08} width={w * 0.3} height={s * 0.08} fill={color} rx={s * 0.02} />
    </g>
  );
}

/** VGA: Wide D-shape (DB15HD) */
function IconVGA({ size: s, color, detail = 1 }: IconProps) {
  const w = s, h = s * 0.5, slant = s * 0.08;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={2} fill={color} />;
  const points = `${-w/2+slant},${-h/2} ${w/2-slant},${-h/2} ${w/2},${0} ${w/2-slant},${h/2} ${-w/2+slant},${h/2} ${-w/2},${0}`;
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

/** DVI: Wide rectangle with cross key on one side */
function IconDVI({ size: s, color, detail = 1 }: IconProps) {
  const w = s, h = s * 0.5;
  if (detail === 0) return <rect x={-w/2} y={-h/2} width={w} height={h} rx={1} fill={color} />;
  return (
    <g>
      <rect x={-w/2} y={-h/2} width={w} height={h} rx={s * 0.04} fill="none" stroke={color} strokeWidth={s * 0.08} />
      {/* Cross key on left side */}
      <line x1={-w/2 + s * 0.1} y1={-h * 0.15} x2={-w/2 + s * 0.1} y2={h * 0.15} stroke={color} strokeWidth={s * 0.06} />
      <line x1={-w/2 + s * 0.06} y1={0} x2={-w/2 + s * 0.14} y2={0} stroke={color} strokeWidth={s * 0.06} />
    </g>
  );
}

/** Generic fallback: simple square */
function IconGeneric({ size: s, color, detail = 1 }: IconProps) {
  const r = s * 0.35;
  if (detail === 0) return <circle r={r} fill={color} />;
  return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={s * 0.06} fill="none" stroke={color} strokeWidth={s * 0.1} />;
}

// ── Icon registry ──────────────────────────────────────────────────

const CONNECTOR_ICONS: Partial<Record<ConnectorType, IconFn>> = {
  "xlr-3": IconXLR3,
  "xlr-4": IconXLR3,  // same shape, different pin count
  "xlr-5": IconXLR3,
  "mini-xlr": IconXLR3,
  "combo-xlr-trs": IconXLR3,
  "rj45": IconRJ45,
  "rj11": IconRJ45,
  "hdmi": IconHDMI,
  "mini-hdmi": IconHDMI,
  "usb-c": IconUSBC,
  "bnc": IconBNC,
  "powercon": IconPowerCON,
  "powercon-true1": IconPowerCON,
  "iec": IconIEC,
  "iec-c5": IconIEC,
  "iec-c7": IconIEC,
  "iec-c15": IconIEC,
  "iec-c20": IconIEC,
  "displayport": IconDisplayPort,
  "mini-displayport": IconDisplayPort,
  "sfp": IconSFP,
  "qsfp": IconSFP,
  "speakon": IconSpeakON,
  "ethercon": IconEtherCon,
  "usb-a": IconUSBA,
  "usb-b": IconUSBA,
  "usb-mini": IconUSBA,
  "db9": IconDB9,
  "db15": IconDB9,
  "db25": IconDB9,
  "db7w2": IconDB9,
  "trs-quarter": IconTRS,
  "trs-eighth": IconTRS,
  "trs-2.5mm": IconTRS,
  "rca": IconRCA,
  "toslink": IconTOSLINK,
  "lc": IconLC,
  "sc": IconSC,
  "opticalcon": IconEtherCon,  // similar circular housing
  "mpo": IconSC,
  "vga": IconVGA,
  "dvi": IconDVI,
  "din-5": IconTRS,  // similar circular shape
  "mini-din-4": IconTRS,
  "mini-din-7": IconTRS,
  "phoenix": IconGeneric,
  "terminal-block": IconGeneric,
  "barrel": IconTRS,
  "banana": IconRCA,
  "binding-post": IconRCA,
  "binding-post-banana": IconRCA,
  "edison": IconGeneric,
  "l5-20": IconGeneric,
  "l6-20": IconGeneric,
  "l6-30": IconGeneric,
  "l21-30": IconGeneric,
  "cam-lok": IconRCA,  // single large round
  "socapex": IconPowerCON,  // large round multipin
  "multipin": IconGeneric,
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
