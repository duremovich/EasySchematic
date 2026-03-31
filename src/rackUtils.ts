import type { DeviceData, Port, ConnectorType } from "./types";

/**
 * Infer a reasonable rack height in U for a device that doesn't have one explicitly set.
 * Based on port count and device type heuristics common in AV equipment.
 */
export function inferRackHeightU(data: DeviceData): number {
  if (data.rackHeightU) return data.rackHeightU;

  const portCount = data.ports?.length ?? 0;
  const dt = data.deviceType?.toLowerCase() ?? "";

  // Known multi-U device types
  if (dt.includes("matrix") || dt.includes("router")) return portCount > 32 ? 4 : portCount > 16 ? 3 : 2;
  if (dt.includes("mixing-console") || dt.includes("mixer")) return 3;
  if (dt.includes("amplifier") || dt.includes("amp")) return 2;
  if (dt.includes("power-distribution") || dt.includes("pdu")) return 1;
  if (dt.includes("media-server") || dt.includes("server")) return 2;
  if (dt.includes("network-switch")) return portCount > 24 ? 2 : 1;
  if (dt.includes("patch-panel")) return 1;

  // General heuristic: 1U for small devices, 2U for medium, up to 4U
  if (portCount <= 8) return 1;
  if (portCount <= 20) return 2;
  if (portCount <= 40) return 3;
  return 4;
}

/** Pixels per rack unit at zoom=1 */
export const PX_PER_U = 24;

/** Standard rack width in pixels */
export const RACK_WIDTH_PX = 260;

/** Rail width — device inset from rack edges */
export const RAIL_WIDTH_PX = 8;

/** Pixels per millimeter at rack scale (1U = 44.45mm) */
export const PX_PER_MM = PX_PER_U / 44.45;

/** Full-width device width in rack view */
export const DEVICE_WIDTH_PX = RACK_WIDTH_PX - 2 * RAIL_WIDTH_PX;

// ── Auto-layout for connector face-plates ──────────────────────────

export interface LayoutPort {
  id: string;
  label: string;
  connectorType?: ConnectorType;
  signalType: string;
  direction: string;
  section?: string;
  /** Percentage position (0-100) on the face-plate */
  x: number;
  y: number;
}

/**
 * Generate a default face-plate layout for a device's ports.
 *
 * Groups ports by section, arranges them in rows left-to-right.
 * Inputs tend toward the left, outputs toward the right.
 * Power connectors go to the far right.
 */
export function autoLayoutPorts(ports: Port[], _faceWidth: number, _faceHeight: number): LayoutPort[] {
  if (ports.length === 0) return [];

  // Separate power ports — they go to the right edge
  const isPower = (p: Port) => p.signalType.startsWith("power");
  const signalPorts = ports.filter((p) => !isPower(p));
  const powerPorts = ports.filter(isPower);

  // Group signal ports by section
  const sections = new Map<string, Port[]>();
  for (const p of signalPorts) {
    const key = p.section ?? "_default";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(p);
  }

  const result: LayoutPort[] = [];

  // Calculate available width (leave right margin for power if needed)
  const powerMargin = powerPorts.length > 0 ? 15 : 0; // percentage
  const usableWidth = 100 - powerMargin;

  // Lay out each section as a row
  const sectionKeys = [...sections.keys()];
  const totalSections = sectionKeys.length;
  const rowHeight = 100 / (totalSections + 1); // +1 for top/bottom padding

  sectionKeys.forEach((sectionKey, sectionIdx) => {
    const sectionPorts = sections.get(sectionKey)!;
    const cy = rowHeight * (sectionIdx + 1); // center Y of this row
    const portCount = sectionPorts.length;
    const spacing = usableWidth / (portCount + 1);

    sectionPorts.forEach((p, portIdx) => {
      result.push({
        id: p.id,
        label: p.label,
        connectorType: p.connectorType,
        signalType: p.signalType,
        direction: p.direction,
        section: p.section,
        x: spacing * (portIdx + 1),
        y: cy,
      });
    });
  });

  // Lay out power ports in a column on the right
  if (powerPorts.length > 0) {
    const powerSpacing = 100 / (powerPorts.length + 1);
    powerPorts.forEach((p, i) => {
      result.push({
        id: p.id,
        label: p.label,
        connectorType: p.connectorType,
        signalType: p.signalType,
        direction: p.direction,
        section: p.section,
        x: 100 - powerMargin / 2,
        y: powerSpacing * (i + 1),
      });
    });
  }

  return result;
}
