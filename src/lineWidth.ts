/**
 * Per-connection line width (#415). A connection's drawn stroke width lives on
 * `data.strokeWidth` (optional — absent means the default 2px). Purely visual:
 * routing and nesting spacing never read it.
 */

/** Smallest and largest width a connection may be drawn at (px). */
export const MIN_LINE_WIDTH = 1;
export const MAX_LINE_WIDTH = 8;
/** Width of an ordinary connection when no override is set (px). */
export const DEFAULT_LINE_WIDTH = 2;
/** Direct-attach connections are a fixed hairline (they ignore the override, like colour). */
export const DIRECT_ATTACH_LINE_WIDTH = 1;

/** Every selectable width, thinnest first. */
export const LINE_WIDTHS: number[] = Array.from(
  { length: MAX_LINE_WIDTH - MIN_LINE_WIDTH + 1 },
  (_, i) => MIN_LINE_WIDTH + i,
);

/** Coerce a stored/hand-edited width to a whole number in range. Non-numeric or
 *  non-finite values (and numeric strings that don't parse) yield undefined. */
export function clampLineWidth(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, Math.round(n)));
}

/** The width a connection draws at when not selected. */
export function effectiveLineWidth(
  data: { strokeWidth?: unknown; directAttach?: boolean } | undefined,
): number {
  if (data?.directAttach) return DIRECT_ATTACH_LINE_WIDTH;
  return clampLineWidth(data?.strokeWidth) ?? DEFAULT_LINE_WIDTH;
}

/** The value to store on `data.strokeWidth` for a picked width — the default is
 *  stored as absent so files only carry real overrides. */
export function lineWidthPatchValue(width: number): number | undefined {
  const w = clampLineWidth(width);
  return w === undefined || w === DEFAULT_LINE_WIDTH ? undefined : w;
}

/** DXF lineweight (group 370, hundredths of a mm) for a connection width. DXF only
 *  accepts the standard enumerated weights, so each px width maps onto one of them;
 *  the default 2px stays at 0.25mm, which is what every connection exported before. */
const DXF_LINEWEIGHT_BY_PX: Record<number, number> = {
  1: 13,
  2: 25,
  3: 35,
  4: 50,
  5: 60,
  6: 70,
  7: 90,
  8: 100,
};

export function lineWidthToDxfLineweight(px: number): number {
  return DXF_LINEWEIGHT_BY_PX[clampLineWidth(px) ?? DEFAULT_LINE_WIDTH] ?? 25;
}

/** App-written values of `edge.style.strokeWidth` (2 for a cable, 1 for direct attach).
 *  Anything else there was put in the file by hand. */
const APP_STYLE_WIDTHS = new Set([DEFAULT_LINE_WIDTH, DIRECT_ATTACH_LINE_WIDTH]);

/**
 * Adopt a hand-edited legacy width into `data.strokeWidth` (#415 — the reporter set
 * `strokeWidth` on edges in the JSON before the field existed). Reads a top-level
 * `edge.strokeWidth` (never written by the app), else `edge.style.strokeWidth` when it
 * isn't one of the app-written 1/2 values. On adoption the legacy copies are reset so a
 * later "back to default" isn't re-adopted on the next load. Direct-attach connections
 * and connections that already carry `data.strokeWidth` are left alone. Returns the same
 * edge object when nothing changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely-typed migration edge
export function adoptLegacyStrokeWidth(edge: any): any {
  if (!edge || typeof edge !== "object") return edge;
  const data = edge.data;
  if (!data || typeof data !== "object") return edge;
  if (data.directAttach || data.strokeWidth !== undefined) return edge;

  const top = clampLineWidth(edge.strokeWidth);
  const styleRaw = edge.style?.strokeWidth;
  const styleNum = typeof styleRaw === "number" ? styleRaw : Number.NaN;
  const fromStyle = Number.isFinite(styleNum) && !APP_STYLE_WIDTHS.has(styleNum)
    ? clampLineWidth(styleNum)
    : undefined;
  const adopted = top ?? fromStyle;
  if (edge.strokeWidth === undefined && fromStyle === undefined) return edge;

  const { strokeWidth: _legacyTop, ...rest } = edge;
  const value = adopted !== undefined ? lineWidthPatchValue(adopted) : undefined;
  return {
    ...rest,
    data: value !== undefined ? { ...data, strokeWidth: value } : data,
    ...(edge.style ? { style: { ...edge.style, strokeWidth: DEFAULT_LINE_WIDTH } } : {}),
  };
}
