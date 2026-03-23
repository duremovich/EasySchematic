import { port, ports } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Distribution Amp
  {
    id: "c0a80101-001d-4000-8000-000000000029",
    deviceType: "da",
    label: "Distribution Amp",
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("SDI Out 3", "sdi", "output"),
      port("SDI Out 4", "sdi", "output"),
    ],
  },
  // Datapath FX4 SDI — Video Wall Controller (SDI variant)
  {
    id: "c0a80101-0020-4000-8000-000000000032",
    deviceType: "video-wall-controller",
    label: "Datapath FX4 SDI",
    manufacturer: "Datapath",
    modelNumber: "FX4 SDI",
    referenceUrl: "https://www.datapath.co.uk/datapath-products/video-wall-controllers/datapath-fx4-sdi/",
    searchTerms: ["datapath", "video wall"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("DP In", "displayport", "input"),
      port("HDMI In", "hdmi", "input"),
      port("Genlock In", "genlock", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("SDI Out 3", "sdi", "output"),
      port("SDI Out 4", "sdi", "output"),
      port("DP Loop", "displayport", "output"),
      port("AC Power", "power", "input"),
    
      port("Ethernet 1", "ethernet", "bidirectional"),
    
      port("Ethernet 2", "ethernet", "bidirectional"),
    
      port("USB-B", "usb", "bidirectional", "usb-b"),
    ],
  },
  // Datapath FX4 HDMI — Video Wall Controller
  {
    id: "c0a80101-0021-4000-8000-000000000033",
    deviceType: "video-wall-controller",
    label: "Datapath FX4 HDMI",
    manufacturer: "Datapath",
    modelNumber: "FX4 HDMI",
    referenceUrl: "https://www.datapath.co.uk/datapath-products/video-wall-controllers/datapath-fx4/",
    ports: [
      port("DP In", "displayport", "input"),
      port("HDMI In 1", "hdmi", "input"),
      port("HDMI In 2", "hdmi", "input"),
      port("Genlock In", "genlock", "input"),
      port("HDMI Out 1", "hdmi", "output"),
      port("HDMI Out 2", "hdmi", "output"),
      port("HDMI Out 3", "hdmi", "output"),
      port("HDMI Out 4", "hdmi", "output"),
      port("DP Loop", "displayport", "output"),
      port("AC Power", "power", "input"),
    
      port("Ethernet 1", "ethernet", "bidirectional"),
    
      port("Ethernet 2", "ethernet", "bidirectional"),
    
      port("USB-B", "usb", "bidirectional", "usb-b"),
    ],
  },
  {
    id: "c0a80101-0055-4000-8000-000000000085",
    deviceType: "da",
    label: "BMD SDI DA 1x8",
    manufacturer: "Blackmagic Design",
    modelNumber: "Mini Converter SDI Distribution",
    referenceUrl: "https://www.blackmagicdesign.com/products/miniconverters",
    searchTerms: ["blackmagic", "mini converter", "distribution", "da", "1x8"],
    ports: [
      port("SDI In", "sdi", "input"),
      ...ports("SDI Out", "sdi", "output", 8),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0056-4000-8000-000000000086",
    deviceType: "da",
    label: "BMD SDI DA 4K 1x8",
    manufacturer: "Blackmagic Design",
    modelNumber: "Mini Converter SDI Distribution 4K",
    referenceUrl: "https://www.blackmagicdesign.com/products/miniconverters",
    searchTerms: ["blackmagic", "mini converter", "distribution", "4k", "6g", "da"],
    ports: [
      port("SDI In", "sdi", "input"),
      ...ports("SDI Out", "sdi", "output", 8),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00fd-4000-8000-000000000329",
    deviceType: "da",
    category: "distribution",
    label: "BMD Teranex SDI Distribution 12G",
    manufacturer: "Blackmagic Design",
    modelNumber: "Teranex Mini SDI Distribution 12G",
    referenceUrl: "https://www.blackmagicdesign.com/products/teranexmini",
    searchTerms: ["blackmagic", "teranex", "distribution", "da", "12g"],
    ports: [
      port("SDI In", "sdi", "input"),
      ...ports("SDI Out", "sdi", "output", 8),
      port("AC Power", "power", "input"),
    ],
  },
  // Other new devices
  {
    id: "c0a80101-0113-4000-8000-000000000351",
    deviceType: "video-wall-controller",
    category: "video-processing",
    label: "Datapath Hx4",
    manufacturer: "Datapath",
    modelNumber: "Hx4",
    referenceUrl: "https://www.datapath.co.uk/products/video-wall-controllers/hx4/",
    searchTerms: ["datapath", "hx4", "video wall", "4k"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("DP In", "displayport", "input"),
      port("HDMI Out 1", "hdmi", "output"),
      port("HDMI Out 2", "hdmi", "output"),
      port("HDMI Out 3", "hdmi", "output"),
      port("HDMI Out 4", "hdmi", "output"),
      port("DP Loop", "displayport", "output"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("USB-B", "usb", "bidirectional", "usb-b"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0196-4000-8000-000000000406",
    deviceType: "da",
    category: "distribution",
    label: "AJA 12GDA",
    manufacturer: "AJA",
    modelNumber: "12GDA",
    referenceUrl: "https://www.aja.com/products/12gda",
    searchTerms: ["aja", "12gda", "distribution amplifier", "da", "12g", "sdi"],
    ports: [
      port("12G-SDI In", "sdi", "input"),
      ...ports("12G-SDI Out", "sdi", "output", 6),
    ],
  },
];
