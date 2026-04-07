import type { Port, SignalType } from "./types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { CONNECTOR_TO_CABLE, CONNECTOR_ACCEPTS, needsAdapter } from "./connectorTypes";

/** Maps each signal type to a physical cable type label for pack lists (legacy fallback) */
export const SIGNAL_TO_CABLE: Record<SignalType, string> = {
  sdi: "SDI",
  genlock: "SDI",
  composite: "Composite",
  "component-video": "Component Video",
  "s-video": "S-Video",
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
  dvi: "DVI",
  power: "Power",
  "power-l1": "Cam-Lok",
  "power-l2": "Cam-Lok",
  "power-l3": "Cam-Lok",
  "power-neutral": "Cam-Lok",
  "power-ground": "Cam-Lok",
  gpio: "GPIO",
  dmx: "DMX",
  madi: "MADI",
  midi: "MIDI",
  tally: "Tally",
  spdif: "S/PDIF",
  adat: "ADAT",
  ultranet: "Ultranet",
  aes50: "AES50",
  stageconnect: "StageConnect",
  wordclock: "Word Clock",
  aes67: "Ethernet",
  ydif: "Ethernet",
  rf: "BNC",
  st2110: "Ethernet",
  artnet: "Ethernet",
  sacn: "Ethernet",
  ir: "IR Emitter Cable",
  timecode: "BNC",
  gigaace: "Ethercon",
  dx5: "Ethercon",
  slink: "Ethercon",
  soundgrid: "Ethercon",
  fibreace: "Fiber - opticalCON",
  dxlink: "Ethercon",
  gps: "BNC",
  dars: "BNC",
  rtmp: "Ethernet",
  rtsp: "Ethernet",
  "mpeg-ts": "Ethernet",
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
  // Multicable trunk: derive from channel count + signal type
  const multicablePort = sourcePort?.isMulticable ? sourcePort : targetPort?.isMulticable ? targetPort : undefined;
  if (multicablePort) {
    const count = multicablePort.channelCount ?? 0;
    const connector = multicablePort.connectorType;
    if (connector === "socapex") {
      return `Socapex (${count}-Ch ${SIGNAL_LABELS[signalType]})`;
    }
    return `${count}-Ch ${SIGNAL_LABELS[signalType]}`;
  }

  const src = sourcePort?.connectorType;
  const tgt = targetPort?.connectorType;

  if (src && tgt && src !== tgt) {
    // Adapter-needed connection: label as adapter cable
    if (needsAdapter(src, tgt)) {
      const srcLabel = CONNECTOR_LABELS[src];
      const tgtLabel = CONNECTOR_LABELS[tgt];
      return `${srcLabel} to ${tgtLabel} Adapter`;
    }
    // Native combo: prefer the more specific (accepted) connector for cable label
    if (CONNECTOR_ACCEPTS[src]?.native?.includes(tgt)) {
      return CONNECTOR_TO_CABLE[tgt] || SIGNAL_TO_CABLE[signalType];
    }
    if (CONNECTOR_ACCEPTS[tgt]?.native?.includes(src)) {
      return CONNECTOR_TO_CABLE[src] || SIGNAL_TO_CABLE[signalType];
    }
  }

  // Default: use source connector
  const connector = src ?? tgt;
  if (connector) {
    const cable = CONNECTOR_TO_CABLE[connector];
    if (cable) return cable;
  }
  return SIGNAL_TO_CABLE[signalType];
}
