import { port, ports } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Monitors
  {
    id: "c0a80101-0003-4000-8000-000000000003",
    deviceType: "monitor",
    label: "Monitor",
    powerDrawW: 60, // typical
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // TV
  {
    id: "c0a80101-0004-4000-8000-000000000004",
    deviceType: "tv",
    label: "TV",
    searchTerms: ["television", "display", "screen"],
    powerDrawW: 150, // typical
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("AC Power", "power", "input"),
    ],
  },
  // ── Monitors ─────────────────────────────────────────────────────
  {
    id: "c0a80101-0062-4000-8000-000000000098",
    deviceType: "monitor",
    label: "BMD SmartView Duo",
    manufacturer: "Blackmagic Design",
    modelNumber: "SmartView HD",
    referenceUrl: "https://www.blackmagicdesign.com/products/smartview",
    searchTerms: ["blackmagic", "smartview", "rack monitor", "17 inch"],
    powerDrawW: 55, // typical
    heightMm: 266,
    widthMm: 483,
    depthMm: 35,
    weightKg: 2.3,
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0063-4000-8000-000000000099",
    deviceType: "monitor",
    label: "BMD SmartScope Duo 4K",
    manufacturer: "Blackmagic Design",
    modelNumber: "SmartView 4K",
    referenceUrl: "https://www.blackmagicdesign.com/products/smartview",
    searchTerms: ["blackmagic", "smartview", "4k", "12g", "rack monitor"],
    powerDrawW: 60, // typical
    heightMm: 266,
    widthMm: 482,
    depthMm: 70,
    weightKg: 3.6,
    ports: [
      port("12G-SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("SDI In 2", "sdi", "input"),
    
      port("SDI Loop 2", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-0064-4000-8000-000000000100",
    deviceType: "monitor",
    label: "BMD SmartView Duo",
    manufacturer: "Blackmagic Design",
    modelNumber: "SmartView Duo",
    referenceUrl: "https://www.blackmagicdesign.com/products/smartview",
    searchTerms: ["blackmagic", "smartview", "duo", "dual", "rack monitor"],
    powerDrawW: 40, // typical
    heightMm: 133,
    widthMm: 483,
    depthMm: 35,
    weightKg: 1.4,
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI Loop 1", "sdi", "output"),
      port("SDI Loop 2", "sdi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0065-4000-8000-000000000101",
    deviceType: "monitor",
    label: "SmallHD Cine 13",
    manufacturer: "SmallHD",
    modelNumber: "Cine 13",
    referenceUrl: "https://www.smallhd.com/cine-13",
    searchTerms: ["smallhd", "cine", "13 inch", "production monitor"],
    powerDrawW: 65, // typical
    heightMm: 257,
    widthMm: 335,
    depthMm: 58,
    weightKg: 3.1,
    ports: [
      ...ports("12G-SDI In", "sdi", "input", 4),
      port("HDMI In", "hdmi", "input"),
      port("12G-SDI Out", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("12G-SDI Out 2", "sdi", "output"),
    
      port("12G-SDI Out 3", "sdi", "output"),
    
      port("12G-SDI Out 4", "sdi", "output"),
    
      port("HDMI Out", "hdmi", "output"),
    
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    ],
  },
  {
    id: "c0a80101-0066-4000-8000-000000000102",
    deviceType: "monitor",
    label: "SmallHD Cine 24",
    manufacturer: "SmallHD",
    modelNumber: "Cine 24",
    referenceUrl: "https://www.smallhd.com/cine-24",
    searchTerms: ["smallhd", "cine", "24 inch", "production monitor"],
    powerDrawW: 90, // typical
    heightMm: 445,
    widthMm: 591,
    depthMm: 51,
    weightKg: 7.5,
    ports: [
      ...ports("12G-SDI In", "sdi", "input", 4),
      port("HDMI In", "hdmi", "input"),
      port("12G-SDI Out", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("12G-SDI Out 2", "sdi", "output"),
    
      port("12G-SDI Out 3", "sdi", "output"),
    
      port("12G-SDI Out 4", "sdi", "output"),
    
      port("HDMI Out", "hdmi", "output"),
    
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-0067-4000-8000-000000000103",
    deviceType: "monitor",
    label: "Marshall ML-702",
    manufacturer: "Marshall",
    modelNumber: "ML-702",
    referenceUrl: "https://www.marshall-usa.com/cameras-monitors/rack-mount-monitors/ml-702.php",
    searchTerms: ["marshall", "dual", "7 inch", "rack monitor"],
    powerDrawW: 20, // typical
    heightMm: 130,
    widthMm: 483,
    depthMm: 44,
    weightKg: 2.4,
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("HDMI In 1", "hdmi", "input"),
      port("HDMI In 2", "hdmi", "input"),
      port("AC Power", "power", "input"),
    
      port("SDI Loop 1", "sdi", "output"),
    
      port("SDI Loop 2", "sdi", "output"),
    
      port("HDMI Loop 1", "hdmi", "output"),
    
      port("HDMI Loop 2", "hdmi", "output"),
    
      port("Composite In 1", "composite", "input"),
    
      port("Composite In 2", "composite", "input"),
    ],
  },
  {
    id: "c0a80101-00fa-4000-8000-000000000326",
    deviceType: "monitor",
    category: "monitors",
    label: "BMD Audio Monitor 12G G3",
    manufacturer: "Blackmagic Design",
    modelNumber: "Audio Monitor 12G G3",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicaudiomonitor",
    searchTerms: ["blackmagic", "audio monitor", "speakers", "12g"],
    powerDrawW: 50, // typical
    heightMm: 44,
    widthMm: 483,
    depthMm: 242,
    weightKg: 2.6,
    ports: [
      port("12G-SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("XLR In L", "analog-audio", "input"),
      port("XLR In R", "analog-audio", "input"),
      port("AES In", "aes", "input"),
      port("RCA In L", "analog-audio", "input", "rca"),
      port("RCA In R", "analog-audio", "input", "rca"),
      port("Headphone", "analog-audio", "output", "trs-quarter"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0102-4000-8000-000000000334",
    deviceType: "monitor",
    category: "monitors",
    label: "SmallHD Cine 18",
    manufacturer: "SmallHD",
    modelNumber: "Cine 18",
    referenceUrl: "https://www.smallhd.com/cine-18",
    searchTerms: ["smallhd", "cine", "18 inch", "production monitor"],
    powerDrawW: 80, // typical
    heightMm: 323,
    widthMm: 467,
    depthMm: 64,
    weightKg: 5.4,
    ports: [
      port("12G-SDI In 1", "sdi", "input"),
      port("12G-SDI In 2", "sdi", "input"),
      port("12G-SDI In 3", "sdi", "input"),
      port("12G-SDI In 4", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("12G-SDI Out 3", "sdi", "output"),
      port("12G-SDI Out 4", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0197-4000-8000-000000000407",
    deviceType: "monitor",
    category: "monitors",
    label: "Leader LV5333",
    manufacturer: "Leader",
    modelNumber: "LV5333",
    referenceUrl: "https://www.leader.co.jp/en/products/discontinuation/lv5333/",
    searchTerms: ["leader", "lv5333", "waveform", "vectorscope", "monitor", "test"],
    powerDrawW: 40, // typical
    heightMm: 128,
    widthMm: 215,
    depthMm: 63,
    weightKg: 1.5,
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
      port("Ext Sync In", "genlock", "input"),
      port("AES Out", "aes", "output"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("USB", "usb", "bidirectional", "usb-a"),
      port("DC Power", "power", "input", "other"),
    ],
  },
];
