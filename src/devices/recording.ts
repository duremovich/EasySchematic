import { port } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Recorder
  {
    id: "c0a80101-001a-4000-8000-000000000026",
    deviceType: "recorder",
    label: "Recorder",
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
    
      port("AC Power", "power", "input"),
    ],
  },
  // Blackmagic HyperDeck Extreme
  {
    id: "c0a80101-001b-4000-8000-000000000027",
    deviceType: "recorder",
    label: "BMD HyperDeck Extreme",
    manufacturer: "Blackmagic Design",
    modelNumber: "HyperDeck Extreme 8K HDR",
    referenceUrl: "https://www.blackmagicdesign.com/products/hyperdeckextreme/techspecs",
    searchTerms: ["blackmagic", "hyperdeck", "4k", "hdr", "recorder", "player"],
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Monitor", "sdi", "output"),
      port("RS-422", "rs422", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("SDI In 2", "sdi", "input"),
    
      port("SDI In 3", "sdi", "input"),
    
      port("SDI In 4", "sdi", "input"),
    
      port("SDI Out 2", "sdi", "output"),
    
      port("SDI Out 3", "sdi", "output"),
    
      port("SDI Out 4", "sdi", "output"),
    
      port("Ref In", "genlock", "input"),
    
      port("Timecode In", "genlock", "input", "xlr-3"),
    
      port("Timecode Out", "genlock", "output", "xlr-3"),
    
      port("XLR In 1", "analog-audio", "input"),
    
      port("XLR In 2", "analog-audio", "input"),
    
      port("XLR In 3", "analog-audio", "input"),
    
      port("XLR In 4", "analog-audio", "input"),
    ],
  },
  {
    id: "c0a80101-0068-4000-8000-000000000104",
    deviceType: "recorder",
    label: "Atomos Shogun Ultra",
    manufacturer: "Atomos",
    modelNumber: "Shogun Ultra",
    referenceUrl: "https://www.atomos.com/products/shogun-ultra",
    searchTerms: ["atomos", "shogun", "ultra", "monitor recorder", "12g"],
    ports: [
      port("12G-SDI In 1", "sdi", "input"),
      port("12G-SDI In 2", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("AC Power", "power", "input"),
    
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    
      port("Ethernet", "ethernet", "bidirectional"),
    
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-0069-4000-8000-000000000105",
    deviceType: "recorder",
    label: "Atomos Ninja V",
    manufacturer: "Atomos",
    modelNumber: "Ninja V",
    referenceUrl: "https://www.atomos.com/products/ninja-v",
    searchTerms: ["atomos", "ninja", "monitor recorder", "hdmi"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
    
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    ],
  },
  // ── Recorders ────────────────────────────────────────────────────
  {
    id: "c0a80101-006a-4000-8000-000000000106",
    deviceType: "recorder",
    label: "BMD HyperDeck HD Mini",
    manufacturer: "Blackmagic Design",
    modelNumber: "HyperDeck Studio HD Mini",
    referenceUrl: "https://www.blackmagicdesign.com/products/hyperdeckstudio",
    searchTerms: ["blackmagic", "hyperdeck", "mini", "recorder"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
      port("AC Power", "power", "input"),
    
      port("HDMI Out", "hdmi", "output"),
    
      port("RS-422", "rs422", "bidirectional", "other"),
    
      port("Ref In", "genlock", "input"),
    
      port("Ref Out", "genlock", "output"),
    
      port("Timecode In", "genlock", "input"),
    
      port("Timecode Out", "genlock", "output"),
    
      port("Ethernet", "ethernet", "bidirectional"),
    
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-006b-4000-8000-000000000107",
    deviceType: "recorder",
    label: "BMD HyperDeck HD Plus",
    manufacturer: "Blackmagic Design",
    modelNumber: "HyperDeck Studio HD Plus",
    referenceUrl: "https://www.blackmagicdesign.com/products/hyperdeckstudio",
    searchTerms: ["blackmagic", "hyperdeck", "plus", "recorder"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("RS-422", "rs422", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("SDI Out 2", "sdi", "output"),
    
      port("SDI Monitor", "sdi", "output"),
    
      port("Ref In", "genlock", "input"),
    
      port("Ref Out", "genlock", "output"),
    
      port("Timecode In", "genlock", "input"),
    
      port("Timecode Out", "genlock", "output"),
    
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-006c-4000-8000-000000000108",
    deviceType: "recorder",
    label: "BMD HyperDeck 4K Pro",
    manufacturer: "Blackmagic Design",
    modelNumber: "HyperDeck Studio 4K Pro",
    referenceUrl: "https://www.blackmagicdesign.com/products/hyperdeckstudio",
    searchTerms: ["blackmagic", "hyperdeck", "4k pro", "recorder"],
    ports: [
      port("12G-SDI In 1", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("RS-422", "rs422", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("SDI Monitor", "sdi", "output"),
    
      port("Ref In", "genlock", "input"),
    
      port("Ref Out", "genlock", "output"),
    
      port("Timecode In", "genlock", "input", "xlr-3"),
    
      port("Timecode Out", "genlock", "output", "xlr-3"),
    
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-006d-4000-8000-000000000109",
    deviceType: "recorder",
    label: "AJA Ki Pro Ultra 12G",
    manufacturer: "AJA",
    modelNumber: "Ki Pro Ultra 12G",
    referenceUrl: "https://www.aja.com/products/ki-pro-ultra-12g",
    searchTerms: ["aja", "ki pro", "ultra", "12g", "recorder", "player"],
    ports: [
      port("12G-SDI In 1", "sdi", "input"),
      port("12G-SDI In 2", "sdi", "input"),
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Analog In L", "analog-audio", "input"),
      port("Analog In R", "analog-audio", "input"),
      port("Analog Out L", "analog-audio", "output"),
      port("Analog Out R", "analog-audio", "output"),
      port("Ref In", "genlock", "input"),
      port("RS-422", "rs422", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("HDMI In", "hdmi", "input"),
    ],
  },
  {
    id: "c0a80101-006e-4000-8000-000000000110",
    deviceType: "recorder",
    label: "Sound Devices PIX 270i",
    manufacturer: "Sound Devices",
    modelNumber: "PIX 270i",
    referenceUrl: "https://www.sounddevices.com/product/pix-270i/",
    searchTerms: ["sound devices", "pix", "270i", "recorder"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("AES In", "aes", "input"),
      port("AES Out", "aes", "output"),
      port("Analog In 1", "analog-audio", "input"),
      port("Analog In 2", "analog-audio", "input"),
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("MADI", "madi", "bidirectional"),
    
      port("Dante", "dante", "bidirectional"),
    ],
  },
  // ─── New devices from audit reports ───────────────────────────────────────
  // BMD new devices
  {
    id: "c0a80101-00f8-4000-8000-000000000324",
    deviceType: "recorder",
    category: "recorders",
    label: "BMD Video Assist 12G HDR 7in",
    manufacturer: "Blackmagic Design",
    modelNumber: "Video Assist 7 inch 12G HDR",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicvideoassist",
    searchTerms: ["blackmagic", "video assist", "monitor recorder", "12g", "hdr"],
    ports: [
      port("12G-SDI In", "sdi", "input"),
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("Mini XLR In 1", "analog-audio", "input", "mini-xlr"),
      port("Mini XLR In 2", "analog-audio", "input", "mini-xlr"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-00f9-4000-8000-000000000325",
    deviceType: "recorder",
    category: "recorders",
    label: "BMD Video Assist 12G HDR 5in",
    manufacturer: "Blackmagic Design",
    modelNumber: "Video Assist 5 inch 12G HDR",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicvideoassist",
    searchTerms: ["blackmagic", "video assist", "monitor recorder", "5 inch", "12g"],
    ports: [
      port("12G-SDI In", "sdi", "input"),
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-0101-4000-8000-000000000333",
    deviceType: "recorder",
    category: "recorders",
    label: "Atomos Ninja Ultra",
    manufacturer: "Atomos",
    modelNumber: "Ninja Ultra",
    referenceUrl: "https://www.atomos.com/product/ninja-ultra/",
    searchTerms: ["atomos", "ninja", "ultra", "monitor recorder", "5 inch"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
];
