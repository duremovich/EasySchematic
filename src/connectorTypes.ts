import type { ConnectorType, SignalType } from "./types";

/** Default connector type inferred from signal type — used for migration and new ports */
export const DEFAULT_CONNECTOR: Record<SignalType, ConnectorType> = {
  sdi: "bnc",
  hdmi: "hdmi",
  ndi: "rj45",
  dante: "rj45",
  "analog-audio": "xlr-3",
  aes: "xlr-3",
  usb: "usb-a",
  ethernet: "rj45",
  fiber: "lc",
  displayport: "displayport",
  hdbaset: "rj45",
  srt: "rj45",
  genlock: "bnc",
  gpio: "phoenix",
  rs422: "db9",
  serial: "db9",
  thunderbolt: "usb-c",
  composite: "bnc",
  vga: "vga",
  power: "edison",
  custom: "other",
};

/** Groups of physically compatible connectors (can mate with adapter or are interchangeable) */
export const CONNECTOR_COMPAT_GROUPS: ConnectorType[][] = [
  ["rj45", "ethercon"],
  ["usb-a", "usb-b", "usb-c"],
];

/** Check if two connector types are compatible (same type or in a compat group) */
export function areConnectorsCompatible(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b) return true; // missing connector info = no mismatch
  if (a === b) return true;
  for (const group of CONNECTOR_COMPAT_GROUPS) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

/** Maps connector type to cable label for pack lists */
export const CONNECTOR_TO_CABLE: Record<ConnectorType, string> = {
  bnc: "BNC",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  vga: "VGA",
  "xlr-3": "XLR",
  "xlr-5": "XLR-5",
  "trs-quarter": '1/4" TRS',
  "trs-eighth": "3.5mm TRS",
  rj45: "Cat6",
  ethercon: "Cat6 (EtherCon)",
  sfp: "SFP Fiber",
  lc: "LC Fiber",
  "usb-a": "USB",
  "usb-b": "USB",
  "usb-c": "USB-C",
  db9: "DB9",
  phoenix: "Phoenix",
  powercon: "powerCON",
  edison: "Edison",
  iec: "IEC",
  speakon: "speakON",
  none: "",
  other: "Other",
};

/** Signal types that can have network configuration */
export const NETWORK_SIGNAL_TYPES: Set<SignalType> = new Set([
  "ethernet", "ndi", "dante", "srt", "hdbaset",
]);

/** Signal types that can have video capabilities */
export const VIDEO_SIGNAL_TYPES: Set<SignalType> = new Set([
  "sdi", "hdmi", "ndi", "displayport", "hdbaset", "fiber", "thunderbolt", "composite", "vga", "srt",
]);
