import type { SignalType, LineStyle, ConnectionEdge } from "./types";
import { LINE_STYLE_DASHARRAY } from "./types";
import { signalColor, signalLabel } from "./typeRegistry";

export interface ColorKeyEntry {
  signalType: SignalType;
  label: string;
  color: string;
  lineStyle: LineStyle;
  dashArray: string | undefined;
}

/**
 * Collect signal types that should appear in the color key, based on
 * actual connections in the schematic plus any user overrides.
 */
export function collectColorKeyEntries(
  edges: ConnectionEdge[],
  signalColors: Partial<Record<SignalType, string>> | undefined,
  signalLineStyles: Partial<Record<SignalType, LineStyle>> | undefined,
  overrides: Partial<Record<SignalType, boolean>> | undefined,
): ColorKeyEntry[] {
  // Collect signal types from actual connections (including stubbed)
  const used = new Set<SignalType>();
  for (const edge of edges) {
    if (edge.data?.signalType) {
      used.add(edge.data.signalType);
    }
  }

  // Apply overrides: false = force-hide, true = force-show
  if (overrides) {
    for (const [type, show] of Object.entries(overrides) as [SignalType, boolean][]) {
      if (show === false) used.delete(type);
      else if (show === true) used.add(type);
    }
  }

  // Build entries sorted by label
  const entries: ColorKeyEntry[] = [];
  for (const type of used) {
    const color = signalColors?.[type] ?? signalColor(type);
    const lineStyle = signalLineStyles?.[type] ?? "solid";
    entries.push({
      signalType: type,
      label: signalLabel(type),
      color,
      lineStyle,
      dashArray: LINE_STYLE_DASHARRAY[lineStyle],
    });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
}

export interface PositionedEntry {
  entry: ColorKeyEntry;
  x: number;
  y: number;
}

export interface ColorKeyGeometry {
  width: number;
  height: number;
  entries: PositionedEntry[];
}

/**
 * Lay out color key entries in a grid with the given column count.
 * All dimensions are in the caller's coordinate system (canvas px or inches).
 */
export function layoutColorKey(
  entries: ColorKeyEntry[],
  columns: number,
  cellW: number,
  cellH: number,
  padding: number,
  headerH: number,
): ColorKeyGeometry {
  if (entries.length === 0) return { width: 0, height: 0, entries: [] };

  const cols = Math.max(1, Math.min(columns, entries.length));
  const rows = Math.ceil(entries.length / cols);

  const positioned: PositionedEntry[] = entries.map((entry, i) => ({
    entry,
    x: padding + (i % cols) * cellW,
    y: padding + headerH + Math.floor(i / cols) * cellH,
  }));

  return {
    width: padding * 2 + cols * cellW,
    height: padding * 2 + headerH + rows * cellH,
    entries: positioned,
  };
}
