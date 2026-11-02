/**
 * Guardrail 2: a custom signal's colour must read on both canvas themes and must
 * not land on DXF ACI 8 (the grey layer colour `rgbToAci` falls back to).
 * A failing colour gets the nearest passing one as a suggestion, not just a no.
 *
 * Pure TS, shared by the API (on every write) and the Types page (live feedback).
 */
import { rgbToAci } from "../dxfExport/units";

/**
 * The canvas backgrounds connections are drawn on: `--color-bg` in src/theme.css
 * (light `:root` and `.dark`). Keep in sync if the theme changes.
 */
export const CANVAS_SURFACES = { light: "#ffffff", dark: "#0f172a" } as const;

/**
 * WCAG 2.1 non-text contrast (1.4.11): 3:1 for graphical objects, which a 2px
 * connection line is. Against white and slate-900 at once this leaves a
 * mid-luminance band (relative luminance ≈ 0.13–0.30); 41 of the 74 built-in
 * colours clear it today.
 */
export const MIN_CANVAS_CONTRAST = 3;

/** The ACI index a colour must not map to (dark grey: unreadable as a layer hue). */
export const ACI_GREY = 8;

const HEX6_RE = /^#[0-9a-f]{6}$/;
const HEX3_RE = /^#[0-9a-f]{3}$/;

/** `#abc` / `#AABBCC` → `#aabbcc`; null when it isn't a literal hex colour. */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (HEX6_RE.test(s)) return s;
  if (HEX3_RE.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return null;
}

// sRGB channel (0–255) → linear light, precomputed.
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

function contrast(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const L_LIGHT = luminance(...rgbOf(CANVAS_SURFACES.light));
const L_DARK = luminance(...rgbOf(CANVAS_SURFACES.dark));

function passes(r: number, g: number, b: number): boolean {
  const l = luminance(r, g, b);
  return contrast(l, L_LIGHT) >= MIN_CANVAS_CONTRAST
    && contrast(l, L_DARK) >= MIN_CANVAS_CONTRAST
    && rgbToAci(r, g, b) !== ACI_GREY;
}

// OKLab, for "nearest" as a person would judge it rather than raw RGB distance.
function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = LINEAR[r], lg = LINEAR[g], lb = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/**
 * The passing colour closest to `hex` in OKLab. A coarse sweep of the RGB cube
 * (step 8, ~36k colours) finds the right region, then a ±8 sweep at step 1
 * around the best hit refines it; a few milliseconds, fine for live feedback.
 * Returns `hex` itself (normalised) when it already passes.
 */
export function nearestPassingColor(hex: string): string {
  const norm = normalizeHexColor(hex);
  if (!norm) throw new Error(`Not a hex colour: ${hex}`);
  const [r0, g0, b0] = rgbOf(norm);
  if (passes(r0, g0, b0)) return norm;
  const [L0, A0, B0] = oklab(r0, g0, b0);
  let best: [number, number, number] = [0, 0, 0];
  let bestD = Infinity;
  const consider = (r: number, g: number, b: number) => {
    if (!passes(r, g, b)) return;
    const [L, A, B] = oklab(r, g, b);
    const d = (L - L0) ** 2 + (A - A0) ** 2 + (B - B0) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [r, g, b];
    }
  };
  const coarse = [...Array.from({ length: 32 }, (_, i) => i * 8), 255];
  for (const r of coarse) for (const g of coarse) for (const b of coarse) consider(r, g, b);
  const [cr, cg, cb] = best;
  const span = (c: number) => {
    const out: number[] = [];
    for (let v = Math.max(0, c - 8); v <= Math.min(255, c + 8); v++) out.push(v);
    return out;
  };
  for (const r of span(cr)) for (const g of span(cg)) for (const b of span(cb)) consider(r, g, b);
  return toHex(...best);
}

export interface SignalColorCheck {
  ok: boolean;
  /** Normalised `#rrggbb`, or null when the input isn't hex. */
  hex: string | null;
  contrastLight: number;
  contrastDark: number;
  aci: number;
  /** Human-readable reasons it fails; empty when ok. */
  problems: string[];
  /** Nearest passing colour, when `hex` is valid but fails. */
  suggestion?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Full guardrail-2 verdict for a proposed signal colour. */
export function checkSignalColor(input: unknown): SignalColorCheck {
  const hex = normalizeHexColor(input);
  if (!hex) {
    return { ok: false, hex: null, contrastLight: 0, contrastDark: 0, aci: 0, problems: ["Colour must be a hex value like #3b82f6"] };
  }
  const [r, g, b] = rgbOf(hex);
  const l = luminance(r, g, b);
  const contrastLight = round2(contrast(l, L_LIGHT));
  const contrastDark = round2(contrast(l, L_DARK));
  const aci = rgbToAci(r, g, b);
  const problems: string[] = [];
  const min = `${MIN_CANVAS_CONTRAST}:1`;
  if (contrast(l, L_LIGHT) < MIN_CANVAS_CONTRAST) problems.push(`too light for the light canvas (${contrastLight}:1, needs ${min})`);
  if (contrast(l, L_DARK) < MIN_CANVAS_CONTRAST) problems.push(`too dark for the dark canvas (${contrastDark}:1, needs ${min})`);
  if (aci === ACI_GREY) problems.push("mapped to grey in DXF exports (ACI 8)");
  if (!problems.length) return { ok: true, hex, contrastLight, contrastDark, aci, problems };
  return { ok: false, hex, contrastLight, contrastDark, aci, problems, suggestion: nearestPassingColor(hex) };
}
