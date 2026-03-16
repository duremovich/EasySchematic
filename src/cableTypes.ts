import type { Port, SignalType } from "./types";
import { CONNECTOR_TO_CABLE } from "./connectorTypes";

/** Maps each signal type to a physical cable type label for pack lists (legacy fallback) */
export const SIGNAL_TO_CABLE: Record<SignalType, string> = {
  sdi: "SDI",
  genlock: "SDI",
  composite: "Composite",
  ndi: "Ethernet",
  dante: "Ethernet",
  ethernet: "Ethernet",
  srt: "Ethernet",
  hdbaset: "Ethernet",
  "analog-audio": "Analog Audio",
  aes: "AES",
  rs422: "DB9",
  serial: "DB9",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  usb: "USB",
  fiber: "Fiber",
  thunderbolt: "Thunderbolt",
  vga: "VGA",
  power: "Power",
  gpio: "GPIO",
  custom: "Other",
};

/**
 * Derive cable type from ports and signal type.
 * Prefers connector-based lookup; falls back to signal-based for legacy data.
 */
export function getCableType(
  sourcePort: Port | undefined,
  targetPort: Port | undefined,
  signalType: SignalType,
): string {
  // Use source port connector if available
  const connector = sourcePort?.connectorType ?? targetPort?.connectorType;
  if (connector) {
    const cable = CONNECTOR_TO_CABLE[connector];
    if (cable) return cable;
  }
  return SIGNAL_TO_CABLE[signalType];
}
