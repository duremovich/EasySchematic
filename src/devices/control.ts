import { port, ports, trunkPort } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Control Processors
  // Crestron CP4N — Control Processor
  {
    id: "c0a80101-0038-4000-8000-000000000056",
    deviceType: "control-processor",
    label: "Crestron CP4N",
    manufacturer: "Crestron",
    modelNumber: "CP4N",
    referenceUrl: "https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/Rack-Mount/CP4N",
    searchTerms: ["crestron", "control", "processor", "automation", "cp4"],
    powerDrawW: 50, // typical
    heightMm: 44,
    widthMm: 483,
    depthMm: 167,
    weightKg: 1.4,
    ports: [
      port("LAN", "ethernet", "bidirectional"),
      port("Control Subnet", "ethernet", "bidirectional"),
      port("COM (RS-232)", "serial", "bidirectional"),
      port("IR/Serial", "serial", "output"),
      port("Relay", "gpio", "output"),
      port("Versiport I/O", "gpio", "bidirectional"),
      port("Cresnet", "serial", "bidirectional"),
      port("USB", "usb", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // Tally Systems
  // BMD GPI and Tally Interface
  {
    id: "c0a80101-0039-4000-8000-000000000057",
    deviceType: "tally-system",
    label: "BMD GPI & Tally",
    manufacturer: "Blackmagic Design",
    modelNumber: "GPI and Tally Interface",
    referenceUrl: "https://www.blackmagicdesign.com/products/atemconstellation/techspecs/W-ATC-03",
    searchTerms: ["blackmagic", "tally", "gpi", "gpio", "indicator"],
    powerDrawW: 5, // typical
    heightMm: 65,
    widthMm: 145,
    depthMm: 139,
    weightKg: 0.4,
    ports: [
      port("Ethernet In", "ethernet", "bidirectional"),
      port("Ethernet Loop", "ethernet", "bidirectional"),
      trunkPort("GPI In", "gpio", "input", 8, "db25"),
      trunkPort("GPI Out", "gpio", "output", 8, "db25"),
      port("AC Power", "power", "input"),
    ],
  },
  // ── Misc ─────────────────────────────────────────────────────────
  {
    id: "c0a80101-00cf-4000-8000-000000000207",
    deviceType: "control-processor",
    label: "D'San Perfect Cue",
    manufacturer: "D'San",
    modelNumber: "Perfect Cue",
    referenceUrl: "https://dsanproducts.com/",
    searchTerms: ["dsan", "perfect cue", "speaker timer", "presentation"],
    powerDrawW: 10, // typical
    heightMm: 83,
    widthMm: 178,
    depthMm: 102,
    weightKg: 4.5,
    ports: [
      port("Ethernet", "ethernet", "bidirectional"),
      port("RS-232", "serial", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00d0-4000-8000-000000000208",
    deviceType: "timecode-generator",
    label: "Brainstorm SR-112",
    manufacturer: "Brainstorm Electronics",
    modelNumber: "SR-112",
    referenceUrl: "https://www.brainstormtime.com/products/sr-112/",
    searchTerms: ["brainstorm", "sr-112", "timecode", "smpte", "ltc", "generator"],
    powerDrawW: 15, // typical
    heightMm: 44,
    widthMm: 483,
    depthMm: 206,
    ports: [
      port("LTC Out 1", "analog-audio", "output"),
      port("LTC Out 2", "analog-audio", "output"),
      port("Ref In", "genlock", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("MIDI Out", "midi", "output", "din-5"),
      port("USB", "usb", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00d1-4000-8000-000000000209",
    deviceType: "midi-device",
    label: "MIDI Merge 4x2",
    searchTerms: ["midi", "merge", "combiner"],
    powerDrawW: 5, // typical
    ports: [
      ...ports("MIDI In", "midi", "input", 4, "din-5"),
      port("MIDI Out 1", "midi", "output", "din-5"),
      port("MIDI Out 2", "midi", "output", "din-5"),
    ],
  },
  {
    id: "c0a80101-00d2-4000-8000-000000000210",
    deviceType: "midi-device",
    label: "MIDI Thru 1x4",
    searchTerms: ["midi", "thru", "splitter"],
    powerDrawW: 5, // typical
    ports: [
      port("MIDI In", "midi", "input", "din-5"),
      ...ports("MIDI Thru", "midi", "output", 4, "din-5"),
    ],
  },
];
