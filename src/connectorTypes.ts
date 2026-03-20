import type { ConnectorType, DeviceTemplate, SignalType } from "./types";

/** Default connector type inferred from signal type — used for migration and new ports */
export const DEFAULT_CONNECTOR: Record<SignalType, ConnectorType> = {
  sdi: "bnc",
  hdmi: "hdmi",
  ndi: "rj45",
  dante: "rj45",
  "analog-audio": "xlr-3",
  aes: "xlr-3",
  dmx: "xlr-5",
  madi: "bnc",
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
  midi: "din-5",
  tally: "db9",
  spdif: "rca",
  adat: "toslink",
  custom: "other",
};

/** Groups of physically compatible connectors (can mate with adapter or are interchangeable) */
export const CONNECTOR_COMPAT_GROUPS: ConnectorType[][] = [
  ["rj45", "ethercon"],
  ["usb-a", "usb-b", "usb-c"],
  ["dvi", "hdmi"],
  ["opticalcon", "lc"],
  ["mini-xlr", "xlr-3"],
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
  db25: "DB25",
  "din-5": "DIN-5",
  phoenix: "Phoenix",
  powercon: "powerCON",
  edison: "Edison",
  iec: "IEC",
  speakon: "speakON",
  socapex: "Socapex",
  multipin: "Multi-pin",
  rca: "RCA",
  toslink: "TOSLINK",
  barrel: "DC Barrel",
  dvi: "DVI",
  "mini-xlr": "Mini XLR",
  opticalcon: "opticalCON Fiber",
  none: "",
  other: "Other",
};

/** Find adapter/converter templates that bridge two different signal types */
export function findAdaptersForSignalBridge(
  sourceSignalType: SignalType,
  targetSignalType: SignalType,
  templates: DeviceTemplate[],
): DeviceTemplate[] {
  const results = templates.filter((t) => {
    if (t.deviceType !== "converter" && t.deviceType !== "adapter") return false;
    const hasMatchingInput = t.ports.some(
      (p) =>
        (p.direction === "input" || p.direction === "bidirectional") &&
        p.signalType === sourceSignalType,
    );
    const hasMatchingOutput = t.ports.some(
      (p) =>
        (p.direction === "output" || p.direction === "bidirectional") &&
        p.signalType === targetSignalType,
    );
    return hasMatchingInput && hasMatchingOutput;
  });

  // Sort: fewest total ports first (tightest match), then alphabetically
  results.sort((a, b) => {
    const aPorts = a.ports.filter((p) => p.signalType !== "power").length;
    const bPorts = b.ports.filter((p) => p.signalType !== "power").length;
    if (aPorts !== bPorts) return aPorts - bPorts;
    return a.label.localeCompare(b.label);
  });

  return results;
}

/** Signal types that can have network configuration */
export const NETWORK_SIGNAL_TYPES: Set<SignalType> = new Set([
  "ethernet", "ndi", "dante", "srt", "hdbaset",
]);

/** Signal types that can have video capabilities */
export const VIDEO_SIGNAL_TYPES: Set<SignalType> = new Set([
  "sdi", "hdmi", "ndi", "displayport", "hdbaset", "fiber", "thunderbolt", "composite", "vga", "srt",
]);
