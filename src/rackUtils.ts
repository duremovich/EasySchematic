import type { DeviceData } from "./types";

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
