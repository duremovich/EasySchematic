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
  "s-video": "mini-din-4",
  vga: "vga",
  power: "iec",
  "power-l1": "cam-lok",
  "power-l2": "cam-lok",
  "power-l3": "cam-lok",
  "power-neutral": "cam-lok",
  "power-ground": "cam-lok",
  midi: "din-5",
  tally: "db9",
  spdif: "rca",
  adat: "toslink",
  ultranet: "rj45",
  aes50: "ethercon",
  stageconnect: "xlr-3",
  wordclock: "bnc",
  aes67: "rj45",
  ydif: "rj45",
  rf: "bnc",
  st2110: "rj45",
  custom: "other",
};

/** Directional acceptance: which other connector types a connector can physically accept */
export interface ConnectorAcceptance {
  native?: ConnectorType[];   // direct physical acceptance, no adapter needed
  adapter?: ConnectorType[];  // physically compatible but needs an adapter cable
}

export const CONNECTOR_ACCEPTS: Partial<Record<ConnectorType, ConnectorAcceptance>> = {
  "combo-xlr-trs": { native: ["xlr-3", "trs-quarter"] },
  "ethercon":      { native: ["rj45"] },
  "opticalcon":    { native: ["lc"] },
  "binding-post-banana": { native: ["binding-post", "banana"] },
  "usb-c":         { adapter: ["usb-a", "usb-b"] },
  "mini-xlr":      { adapter: ["xlr-3"] },
  "dvi":           { adapter: ["hdmi"] },
  "mini-hdmi":     { adapter: ["hdmi"] },
  "mini-displayport": { adapter: ["displayport"] },
  "iec":           { adapter: ["edison", "powercon"] },
  "powercon":      { adapter: ["edison"] },
  "l5-20":         { adapter: ["edison", "powercon"] },
  "l6-20":         { adapter: ["edison", "powercon"] },
  "l6-30":         { adapter: ["edison", "powercon"] },
  "l21-30":        { adapter: ["edison", "powercon"] },
  "xlr-3":         { adapter: ["xlr-4", "trs-quarter", "rca"] },
  "xlr-4":         { adapter: ["xlr-3"] },
  "trs-quarter":   { adapter: ["xlr-3", "trs-eighth"] },
  "trs-eighth":    { adapter: ["trs-quarter"] },
  "rca":           { adapter: ["xlr-3"] },
  "edison":        { adapter: ["iec", "powercon", "l5-20", "l6-20", "l6-30", "l21-30"] },
};

/** Check if two connector types are compatible (same type or one accepts the other) */
export function areConnectorsCompatible(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b) return true; // missing connector info = no mismatch
  if (a === b) return true;
  const aAccepts = CONNECTOR_ACCEPTS[a];
  if (aAccepts?.native?.includes(b) || aAccepts?.adapter?.includes(b)) return true;
  const bAccepts = CONNECTOR_ACCEPTS[b];
  if (bAccepts?.native?.includes(a) || bAccepts?.adapter?.includes(a)) return true;
  return false;
}

/** Check if a connection between two connector types requires an adapter cable */
export function needsAdapter(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b || a === b) return false;
  if (CONNECTOR_ACCEPTS[a]?.adapter?.includes(b)) return true;
  if (CONNECTOR_ACCEPTS[b]?.adapter?.includes(a)) return true;
  return false;
}

/** Maps connector type to cable label for pack lists */
export const CONNECTOR_TO_CABLE: Record<ConnectorType, string> = {
  bnc: "BNC",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  vga: "VGA",
  "xlr-3": "XLR",
  "xlr-4": "XLR-4",
  "xlr-5": "XLR-5",
  "trs-quarter": '1/4" TRS',
  "trs-eighth": "3.5mm TRS",
  "combo-xlr-trs": "XLR",
  rj45: "Cat6",
  ethercon: "Cat6 (EtherCon)",
  sfp: "SFP Fiber",
  lc: "LC Fiber",
  sc: "SC Fiber",
  "usb-a": "USB",
  "usb-b": "USB",
  "usb-c": "USB-C",
  "usb-mini": "Mini USB",
  db7w2: "D-Sub 7W2",
  db9: "DB9",
  db15: "DB15",
  db25: "DB25",
  "din-5": "DIN-5",
  "mini-din-4": "Mini-DIN 4-pin",
  "mini-din-7": "Mini-DIN 7-pin",
  phoenix: "Phoenix",
  "terminal-block": "Terminal Block",
  powercon: "powerCON",
  edison: "Edison",
  iec: "IEC",
  speakon: "speakON",
  socapex: "Socapex",
  multipin: "Multi-pin",
  rca: "RCA",
  rj11: "RJ11",
  toslink: "TOSLINK",
  barrel: "DC Barrel",
  banana: "Speaker Wire",
  "binding-post": "Speaker Wire",
  "binding-post-banana": "Speaker Wire",
  dvi: "DVI",
  "mini-hdmi": "Mini HDMI",
  "mini-displayport": "Mini DisplayPort",
  "mini-xlr": "Mini XLR",
  opticalcon: "opticalCON Fiber",
  "l5-20": "L5-20",
  "l6-20": "L6-20",
  "l6-30": "L6-30",
  "l21-30": "L21-30",
  "cam-lok": "Cam-Lok",
  qsfp: "QSFP Fiber",
  mpo: "MPO Fiber",
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
    if (t.deviceType !== "adapter") return false;
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

/** Find adapter templates that bridge two different connector types within the same signal type */
export function findAdaptersForConnectorBridge(
  sourceConnector: ConnectorType,
  targetConnector: ConnectorType,
  signalType: SignalType,
  templates: DeviceTemplate[],
): DeviceTemplate[] {
  const results = templates.filter((t) => {
    if (t.deviceType !== "adapter") return false;
    const hasMatchingInput = t.ports.some(
      (p) =>
        (p.direction === "input" || p.direction === "bidirectional") &&
        p.signalType === signalType &&
        p.connectorType === sourceConnector,
    );
    const hasMatchingOutput = t.ports.some(
      (p) =>
        (p.direction === "output" || p.direction === "bidirectional") &&
        p.signalType === signalType &&
        p.connectorType === targetConnector,
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
  "ethernet", "ndi", "dante", "srt", "hdbaset", "aes67", "st2110",
]);

/** Signal types that can have video capabilities */
export const VIDEO_SIGNAL_TYPES: Set<SignalType> = new Set([
  "sdi", "hdmi", "ndi", "displayport", "hdbaset", "fiber", "thunderbolt", "composite", "vga", "srt", "st2110",
]);
