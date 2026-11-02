import type { LineStyle, SignalType } from "../types";
import type { LayerDef, LtypeDef } from "./writer";
import { ACI_NEAR_BLACK, hexToRgb, rgbToAci, rgbToTrueColor, sanitizeName } from "./units";
import { signalColor } from "../typeRegistry";

export const CANONICAL_LAYERS = {
  DEFAULT: "0",
  ROOMS: "EasySchematic-Rooms",
  ROOMS_FILL: "EasySchematic-Rooms-Fill",
  DEVICES: "EasySchematic-Devices",
  DEVICES_HEADER: "EasySchematic-Devices-Header",
  LABELS: "EasySchematic-Labels",
  PORTS: "EasySchematic-Ports",
  ANNOTATIONS: "EasySchematic-Annotations",
  ANNOTATIONS_FILL: "EasySchematic-Annotations-Fill",
  TITLE_BLOCK: "EasySchematic-TitleBlock",
  LEGEND: "EasySchematic-Legend",
} as const;

export type LineStyleName = "CONTINUOUS" | "ES_DASHED" | "ES_DOTTED" | "ES_DASHDOT" | "ES_MISMATCH";

export function lineStyleToLtype(style: LineStyle | undefined): LineStyleName {
  switch (style) {
    case "dashed": return "ES_DASHED";
    case "dotted": return "ES_DOTTED";
    case "dash-dot": return "ES_DASHDOT";
    default: return "CONTINUOUS";
  }
}

/** LTYPE pattern definitions, lengths in inches. */
export const LTYPE_DEFS: LtypeDef[] = [
  { name: "CONTINUOUS", description: "Solid line", pattern: [] },
  { name: "ES_DASHED", description: "Dashed", pattern: [0.5, -0.25] },
  { name: "ES_DOTTED", description: "Dotted", pattern: [0, -0.2] },
  { name: "ES_DASHDOT", description: "Dash-Dot", pattern: [0.5, -0.25, 0, -0.25] },
  { name: "ES_MISMATCH", description: "Connector mismatch", pattern: [0.375, -0.1875] },
];

/** Layer name for a specific signal-type connection. */
export function signalLayerName(sig: SignalType): string {
  const sanitized = sanitizeName(sig);
  return `EasySchematic-Connections-${sanitized}`;
}

/**
 * Build the full layer list for a schematic, given the set of signal types
 * actually used plus an optional per-signal color override map.
 */
export function buildLayerDefs(
  usedSignalTypes: Set<SignalType>,
  signalColors: Partial<Record<SignalType, string>> | undefined,
): LayerDef[] {
  // Every EasySchematic layer that used to be ACI 7 is 250 now. Layer 0 keeps 7
  // because that is the DXF convention for it and nothing is drawn there without
  // its own colour anyway.
  const layers: LayerDef[] = [
    { name: CANONICAL_LAYERS.DEFAULT, color: 7 },
    { name: CANONICAL_LAYERS.ROOMS, color: 9, linetype: "ES_DASHED" },
    { name: CANONICAL_LAYERS.ROOMS_FILL, color: 9 },
    { name: CANONICAL_LAYERS.DEVICES, color: ACI_NEAR_BLACK },
    { name: CANONICAL_LAYERS.DEVICES_HEADER, color: 8 },
    { name: CANONICAL_LAYERS.LABELS, color: ACI_NEAR_BLACK },
    { name: CANONICAL_LAYERS.PORTS, color: 8 },
    { name: CANONICAL_LAYERS.ANNOTATIONS, color: ACI_NEAR_BLACK },
    { name: CANONICAL_LAYERS.ANNOTATIONS_FILL, color: 9 },
    { name: CANONICAL_LAYERS.TITLE_BLOCK, color: ACI_NEAR_BLACK },
    { name: CANONICAL_LAYERS.LEGEND, color: ACI_NEAR_BLACK },
  ];

  for (const sig of usedSignalTypes) {
    const hex = signalColors?.[sig] ?? signalColor(sig);
    const [r, g, b] = hexToRgb(hex);
    layers.push({
      name: signalLayerName(sig),
      color: rgbToAci(r, g, b),
    });
  }

  return layers;
}

/** Resolve the effective color for a signal type (hex, e.g. "#dc2626"). */
export function resolveSignalColor(
  sig: SignalType,
  overrides: Partial<Record<SignalType, string>> | undefined,
): string {
  return overrides?.[sig] ?? signalColor(sig);
}

/** Convert a hex color to a DXF true-color integer (group 420). */
export function hexToTrueColor(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToTrueColor(r, g, b);
}
