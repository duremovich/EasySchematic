import { CONNECTOR_LABELS } from "./types";
import type { ConnectorType, ConnectionEdge, DeviceTemplate, Gender, Port, SignalType } from "./types";

const CUSTOM_CONNECTOR_TYPES_KEY = "easyschematic-custom-connector-types";

function humanizeConnectorType(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["rj45", "usb", "sdi", "hdmi", "dvi", "vga", "led", "dsp", "ip"].includes(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function loadCustomConnectorTypes(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CONNECTOR_TYPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function saveCustomConnectorTypes(types: string[]) {
  try {
    if (types.length > 0) localStorage.setItem(CUSTOM_CONNECTOR_TYPES_KEY, JSON.stringify(types));
    else localStorage.removeItem(CUSTOM_CONNECTOR_TYPES_KEY);
  } catch {
    // silently ignore localStorage errors
  }
}

function applyCustomConnectorType(connectorType: string) {
  const trimmed = connectorType.trim();
  if (!trimmed) return false;
  if (CONNECTOR_LABELS[trimmed as ConnectorType]) return false;
  (CONNECTOR_LABELS as Record<string, string>)[trimmed] = humanizeConnectorType(trimmed);
  return true;
}

const _initialCustomConnectorTypes = loadCustomConnectorTypes();
for (const connectorType of _initialCustomConnectorTypes) {
  applyCustomConnectorType(connectorType);
}

export function getCustomConnectorTypes(): string[] {
  return [..._initialCustomConnectorTypes];
}

export function registerCustomConnectorType(connectorType: string): string | null {
  const trimmed = connectorType.trim();
  if (!trimmed) return null;
  if ((CONNECTOR_LABELS as Record<string, string>)[trimmed]) return trimmed;
  if (applyCustomConnectorType(trimmed)) {
    const next = [..._initialCustomConnectorTypes, trimmed].filter((value, index, arr) => arr.indexOf(value) === index).sort((a, b) => a.localeCompare(b));
    _initialCustomConnectorTypes.splice(0, _initialCustomConnectorTypes.length, ...next);
    saveCustomConnectorTypes(next);
  }
  return trimmed;
}

export function registerCustomConnectorTypes(connectorTypes: string[]): string[] {
  const added: string[] = [];
  for (const connectorType of connectorTypes) {
    const result = registerCustomConnectorType(connectorType);
    if (result) added.push(result);
  }
  return added;
}

/** Default connector type inferred from signal type — used for migration and new ports */
export const DEFAULT_CONNECTOR: Record<SignalType, ConnectorType> = {
  sdi: "bnc",
  hdmi: "hdmi",
  ndi: "rj45",
  dante: "rj45",
  avb: "rj45",
  "analog-audio": "xlr-3",
  "speaker-level": "speakon",
  bluetooth: "wireless",
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
  "contact-closure": "phoenix",
  rs422: "db9",
  serial: "db9",
  thunderbolt: "usb-c",
  composite: "bnc",
  "s-video": "mini-din-4",
  vga: "vga",
  dvi: "dvi",
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
  artnet: "rj45",
  sacn: "rj45",
  ir: "terminal-block",
  timecode: "bnc",
  gigaace: "ethercon",
  dx5: "ethercon",
  slink: "ethercon",
  soundgrid: "ethercon",
  fibreace: "opticalcon",
  dsnake: "ethercon",
  dxlink: "ethercon",
  gps: "db9",
  dars: "bnc",
  rtmp: "rj45",
  rtsp: "rj45",
  "mpeg-ts": "rj45",
  "component-video": "bnc",
  digilink: "digilink",
  ebus: "phoenix",
  "control-voltage": "phoenix",
  "extron-exp": "rj45",
  pots: "rj11",
  "blu-link": "rj45",
  cresnet: "terminal-block",
  sensor: "phoenix",
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
  "iec":           { adapter: ["edison", "powercon", "iec-c5", "iec-c7", "iec-c15", "iec-c20"] },
  "iec-c5":        { adapter: ["iec", "iec-c7", "iec-c15", "iec-c20", "edison", "powercon"] },
  "iec-c7":        { adapter: ["iec", "iec-c5", "iec-c15", "iec-c20", "edison", "powercon"] },
  "iec-c15":       { adapter: ["iec", "iec-c5", "iec-c7", "iec-c20", "edison", "powercon"] },
  "iec-c20":       { adapter: ["iec", "iec-c5", "iec-c7", "iec-c15", "edison", "powercon"] },
  "powercon":      { adapter: ["edison", "iec-c5", "iec-c7", "iec-c15", "iec-c20"] },
  "l5-20":         { adapter: ["edison", "powercon"] },
  "l6-20":         { adapter: ["edison", "powercon"] },
  "l6-30":         { adapter: ["edison", "powercon"] },
  "l21-30":        { adapter: ["edison", "powercon"] },
  "xlr-3":         { adapter: ["xlr-4", "trs-quarter", "rca"] },
  "xlr-4":         { adapter: ["xlr-3"] },
  "trs-quarter":   { adapter: ["xlr-3", "trs-eighth"] },
  "trs-eighth":    { adapter: ["trs-quarter"] },
  "rca":           { adapter: ["xlr-3"] },
  "edison":        { adapter: ["iec", "iec-c5", "iec-c7", "iec-c15", "iec-c20", "powercon", "l5-20", "l6-20", "l6-30", "l21-30"] },
};

/** Bare-wire connectors (no physical connector — cable goes straight in) are compatible with anything */
export const BARE_WIRE_CONNECTORS: Set<ConnectorType> = new Set([
  "phoenix", "terminal-block",
  "solder-cup", "punch-down-110", "punch-down-66", "krone-idc",
]);

/** Signal pairs that physically share a connector and are interchangeable when both ports use it.
 *  Thunderbolt ports are USB-C and carry USB; a plain USB-C cable works between them. */
export const SIGNAL_COMPAT_VIA_CONNECTOR: ReadonlyArray<readonly [SignalType, SignalType, ConnectorType]> = [
  ["thunderbolt", "usb", "usb-c"],
];

export function areSignalsCompatibleViaConnector(
  aSignal: SignalType,
  aConn: ConnectorType | undefined,
  bSignal: SignalType,
  bConn: ConnectorType | undefined,
): boolean {
  if (!aConn || !bConn || aConn !== bConn) return false;
  return SIGNAL_COMPAT_VIA_CONNECTOR.some(
    ([s1, s2, c]) =>
      aConn === c &&
      ((s1 === aSignal && s2 === bSignal) || (s1 === bSignal && s2 === aSignal)),
  );
}

/** Check if two connector types are compatible (same type or one accepts the other) */
export function areConnectorsCompatible(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b) return true; // missing connector info = no mismatch
  if (a === b) return true;
  if (BARE_WIRE_CONNECTORS.has(a) || BARE_WIRE_CONNECTORS.has(b)) return true;
  const aAccepts = CONNECTOR_ACCEPTS[a];
  if (aAccepts?.native?.includes(b) || aAccepts?.adapter?.includes(b)) return true;
  const bAccepts = CONNECTOR_ACCEPTS[b];
  if (bAccepts?.native?.includes(a) || bAccepts?.adapter?.includes(a)) return true;
  return false;
}

/** Check if a connection between two connector types requires an adapter cable */
export function needsAdapter(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b || a === b) return false;
  if (BARE_WIRE_CONNECTORS.has(a) || BARE_WIRE_CONNECTORS.has(b)) return false;
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
  "trs-2.5mm": "2.5mm TRS",
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
  "iec-c5": "IEC C5",
  "iec-c7": "IEC C7",
  "iec-c15": "IEC C15",
  "iec-c20": "IEC C20",
  speakon: "speakON",
  socapex: "Socapex",
  multipin: "Multi-pin",
  rca: "RCA",
  rj11: "RJ11",
  rj12: "RJ12",
  toslink: "TOSLINK",
  barrel: "DC Barrel",
  "d-tap": "D-Tap",
  "v-mount": "V-Mount",
  "f-connector": "F-Conn",
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
  "powercon-true1": "powerCON TRUE1",
  qsfp: "QSFP Fiber",
  qsfp28: "QSFP28 Fiber",
  mpo: "MPO Fiber",
  wireless: "Wireless",
  "usb-micro": "Micro USB",
  "reverse-tnc": "Reverse TNC",
  sma: "SMA",
  db37: "DB37",
  digilink: "DigiLink",
  "pcie-6pin": "PCIe 6-pin Aux",
  "lemo-2pin": "LEMO 2-pin",
  "lemo-4pin": "LEMO 4-pin",
  "lemo-5pin": "LEMO 5-pin",
  "solder-cup": "Bare Wire",
  "punch-down-110": "Bulk Cable",
  "punch-down-66": "Bulk Cable",
  "krone-idc": "Bulk Cable",
  "d-hole-insert": "",
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

/**
 * Connector gender convention table.
 * - Fixed entry: gender is the same regardless of port direction (e.g., RJ45 jacks are always female on a device).
 * - Direction map: gender depends on whether the port is an input or output (e.g., XLR input = female, output = male).
 * - Omitted entries: connector is genderless or doesn't have a meaningful M/F distinction (fiber, terminal blocks, etc.).
 */
export const CONNECTOR_GENDER: Partial<Record<ConnectorType, Gender | { input: Gender; output: Gender }>> = {
  // Fixed gender — device side is always this regardless of direction
  hdmi: "female",
  "mini-hdmi": "female",
  displayport: "female",
  "mini-displayport": "female",
  vga: "female",
  dvi: "female",
  rj45: "female",
  ethercon: "female",
  rj11: "female",
  rj12: "female",
  "usb-a": "female",
  "usb-b": "female",
  "usb-c": "female",
  "usb-mini": "female",
  "usb-micro": "female",
  rca: "female",
  toslink: "female",
  "din-5": "female",
  "mini-din-4": "female",
  "mini-din-7": "female",
  digilink: "female",
  db7w2: "female",
  db9: "female",
  db15: "female",
  db25: "female",
  db37: "female",
  "trs-quarter": "female",
  "trs-eighth": "female",
  "trs-2.5mm": "female",
  "combo-xlr-trs": "female",
  "f-connector": "female",
  "reverse-tnc": "female",
  sma: "female",
  barrel: "female",
  "pcie-6pin": "male",
  "d-tap": "female",
  "v-mount": "female",
  "lemo-2pin": "female",
  "lemo-4pin": "female",
  "lemo-5pin": "female",

  // Direction-conditional — gender flips based on signal flow
  "xlr-3":            { input: "female", output: "male" },
  "xlr-4":            { input: "female", output: "male" },
  "xlr-5":            { input: "female", output: "male" },
  "mini-xlr":         { input: "female", output: "male" },
  bnc:                { input: "female", output: "female" }, // device side is female; cable BNCs are male
  speakon:            { input: "female", output: "female" }, // chassis-mount is typically female on both
  "powercon":         { input: "male",   output: "female" }, // input/inlet = male (NAC3MPA), output = female (NAC3FPB)
  "powercon-true1":   { input: "male",   output: "female" },
  iec:                { input: "male",   output: "female" }, // C14 inlet = male, C13 outlet = female
  "iec-c5":           { input: "male",   output: "female" },
  "iec-c7":           { input: "male",   output: "female" },
  "iec-c15":          { input: "male",   output: "female" },
  "iec-c20":          { input: "male",   output: "female" },
  edison:             { input: "male",   output: "female" },
  "l5-20":            { input: "male",   output: "female" },
  "l6-20":            { input: "male",   output: "female" },
  "l6-30":            { input: "male",   output: "female" },
  "l21-30":           { input: "male",   output: "female" },
  "cam-lok":          { input: "female", output: "male"   },
  socapex:            { input: "female", output: "female" },
  multipin:           { input: "female", output: "female" },
  banana:             { input: "female", output: "female" }, // binding posts on both sides
  "binding-post":     { input: "female", output: "female" },
  "binding-post-banana": { input: "female", output: "female" },
};

/**
 * Connectors where gender genuinely varies in real gear (and thus where the editor should expose
 * a manual override). Connectors not listed here use whatever CONNECTOR_GENDER says without prompting.
 */
export const CONNECTORS_WITH_GENDER_VARIATION: Set<ConnectorType> = new Set([
  "xlr-3", "xlr-4", "xlr-5", "mini-xlr",
  "powercon", "powercon-true1",
  "iec", "iec-c5", "iec-c7", "iec-c15", "iec-c20",
  "edison", "l5-20", "l6-20", "l6-30", "l21-30",
  "cam-lok", "socapex", "multipin",
  "speakon", "banana", "binding-post", "binding-post-banana",
  "bnc",
  "trs-quarter", "trs-eighth", "trs-2.5mm",
]);

/** Resolve a port's gender: explicit override → convention from connector + direction → undefined. */
export function resolvePortGender(port: Port | undefined): Gender | undefined {
  if (!port) return undefined;
  if (port.gender) return port.gender;
  if (!port.connectorType) return undefined;
  const entry = CONNECTOR_GENDER[port.connectorType];
  if (!entry) return undefined;
  if (typeof entry === "string") return entry;
  // Bidirectional ports fall back to the input convention.
  return port.direction === "output" ? entry.output : entry.input;
}

/**
 * Returns the effective signal type for a port.
 *
 * For ports with `inheritsSignal: true`, the signal type is derived from connected edges
 * rather than the stored `signalType` placeholder ("custom"). The `side` parameter controls
 * which face of a passthrough port to look at:
 *   - "rear"      → only edges whose handle ends in "-rear"
 *   - "front"     → only edges whose handle ends in "-front"
 *   - undefined   → rear first, then front, then any match (deterministic preference)
 *
 * For all other ports, `port.signalType` is returned directly.
 */
export function effectiveSignalType(
  port: Port,
  nodeId: string,
  edges: ConnectionEdge[],
  side?: "rear" | "front",
): SignalType {
  if (!port.inheritsSignal) return port.signalType;

  const portHandle = port.id;

  const matchesHandle = (handle: string | null | undefined, suffix: string): boolean =>
    handle === `${portHandle}-${suffix}`;

  const edgeForSuffix = (suffix: string): ConnectionEdge | undefined =>
    edges.find(
      (e) =>
        (e.source === nodeId && matchesHandle(e.sourceHandle, suffix)) ||
        (e.target === nodeId && matchesHandle(e.targetHandle, suffix)),
    );

  if (side !== undefined) {
    return edgeForSuffix(side)?.data?.signalType ?? port.signalType;
  }

  // Deterministic preference: rear → front → any handle match → stored placeholder
  return (
    edgeForSuffix("rear")?.data?.signalType ??
    edgeForSuffix("front")?.data?.signalType ??
    edges.find(
      (e) =>
        (e.source === nodeId && (e.sourceHandle === portHandle || e.sourceHandle?.startsWith(`${portHandle}-`))) ||
        (e.target === nodeId && (e.targetHandle === portHandle || e.targetHandle?.startsWith(`${portHandle}-`))),
    )?.data?.signalType ??
    port.signalType
  );
}

/** Signal types that can have network configuration */
export const NETWORK_SIGNAL_TYPES: Set<SignalType> = new Set([
  "ethernet", "ndi", "dante", "avb", "srt", "hdbaset", "aes67", "st2110",
]);

/** Signal types that can have video capabilities */
export const VIDEO_SIGNAL_TYPES: Set<SignalType> = new Set([
  "sdi", "hdmi", "ndi", "displayport", "hdbaset", "fiber", "thunderbolt", "composite", "vga", "dvi", "srt", "st2110",
]);

/** Signal types whose new ports default to multi-connect — logical/streaming signals where fan-in is the norm. */
export const MULTI_CONNECT_DEFAULT_SIGNALS: Set<SignalType> = new Set([
  "srt", "custom",
]);

/** Connector types whose new ports default to multi-connect — wireless/RF carriers where many TX → one RX. */
export const MULTI_CONNECT_DEFAULT_CONNECTORS: Set<ConnectorType> = new Set([
  "wireless",
]);

export function shouldDefaultMultiConnect(
  signalType: SignalType,
  connectorType?: ConnectorType,
): boolean {
  return (
    MULTI_CONNECT_DEFAULT_SIGNALS.has(signalType) ||
    (connectorType != null && MULTI_CONNECT_DEFAULT_CONNECTORS.has(connectorType))
  );
}
