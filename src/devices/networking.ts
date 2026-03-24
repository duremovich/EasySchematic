import { port, ports } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // NDI Encoder
  {
    id: "c0a80101-0012-4000-8000-000000000018",
    deviceType: "ndi-encoder",
    label: "NDI Encoder",
    powerDrawW: 15, // typical
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("NDI Out", "ndi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // NDI Decoder
  {
    id: "c0a80101-0013-4000-8000-000000000019",
    deviceType: "ndi-decoder",
    label: "NDI Decoder",
    powerDrawW: 15, // typical
    ports: [
      port("NDI In", "ndi", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // Ethernet Switch (4-port)
  {
    id: "c0a80101-0025-4000-8000-000000000037",
    deviceType: "network-switch",
    label: "Ethernet Switch (4-port)",
    searchTerms: ["switch", "network", "poe"],
    powerDrawW: 15, // typical
    ports: [
      port("Port 1", "ethernet", "bidirectional", undefined, false),
      port("Port 2", "ethernet", "bidirectional", undefined, false),
      port("Port 3", "ethernet", "bidirectional", undefined, false),
      port("Port 4", "ethernet", "bidirectional", undefined, false),
      port("AC Power", "power", "input"),
    ],
  },
  // Ethernet Switch (8-port)
  {
    id: "c0a80101-0026-4000-8000-000000000038",
    deviceType: "network-switch",
    label: "Ethernet Switch (8-port)",
    searchTerms: ["switch", "network", "poe"],
    powerDrawW: 25, // typical
    ports: [
      port("Port 1", "ethernet", "bidirectional", undefined, false),
      port("Port 2", "ethernet", "bidirectional", undefined, false),
      port("Port 3", "ethernet", "bidirectional", undefined, false),
      port("Port 4", "ethernet", "bidirectional", undefined, false),
      port("Port 5", "ethernet", "bidirectional", undefined, false),
      port("Port 6", "ethernet", "bidirectional", undefined, false),
      port("Port 7", "ethernet", "bidirectional", undefined, false),
      port("Port 8", "ethernet", "bidirectional", undefined, false),
      port("AC Power", "power", "input"),
    ],
  },
  // Streaming Encoder
  // Teradek Prism Flex — Streaming Encoder/Decoder
  {
    id: "c0a80101-0033-4000-8000-000000000051",
    deviceType: "streaming-encoder",
    label: "Teradek Prism Flex",
    manufacturer: "Teradek",
    modelNumber: "Prism Flex",
    referenceUrl: "https://teradek.com/pages/prism-flex",
    searchTerms: ["teradek", "prism", "streaming", "encoder", "rtmp", "srt", "hevc"],
    powerDrawW: 30, // typical
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("USB 1", "usb", "bidirectional"),
      port("USB 2", "usb", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("SDI Out", "sdi", "output"),
    
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // AV-over-IP
  // Crestron DM-NVX-351 — AV-over-IP Encoder/Decoder
  {
    id: "c0a80101-003a-4000-8000-000000000058",
    deviceType: "av-over-ip",
    label: "Crestron DM-NVX-351",
    manufacturer: "Crestron",
    modelNumber: "DM-NVX-351",
    referenceUrl: "https://www.crestron.com/Products/Catalog/AV-Over-IP/DM-NVX-AV-Over-IP/Video-Endpoint/DM-NVX-351",
    searchTerms: ["crestron", "nvx", "av-over-ip", "networked av", "encoder", "decoder"],
    powerDrawW: 30, // typical
    ports: [
      port("HDMI In 1", "hdmi", "input"),
      port("HDMI In 2", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("Analog Audio", "analog-audio", "bidirectional"),
      port("USB Host", "usb", "bidirectional"),
      port("USB Device", "usb", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
    slots: [
      { id: "nvx351-sfp-1", label: "SFP", slotFamily: "sfp", defaultCardId: "sfp-10g-sr" },
    ],
  },
  {
    id: "c0a80101-0073-4000-8000-000000000115",
    deviceType: "ndi-encoder",
    label: "Magewell HDMI→NDI",
    manufacturer: "Magewell",
    modelNumber: "Pro Convert HDMI Plus",
    referenceUrl: "https://www.magewell.com/products/pro-convert-hdmi-plus",
    searchTerms: ["magewell", "pro convert", "ndi", "encoder", "hdmi"],
    powerDrawW: 13,
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Loop", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-0074-4000-8000-000000000116",
    deviceType: "ndi-encoder",
    label: "Magewell HDMI 4K→NDI",
    manufacturer: "Magewell",
    modelNumber: "Pro Convert HDMI 4K Plus",
    referenceUrl: "https://www.magewell.com/products/pro-convert-hdmi-4k-plus",
    searchTerms: ["magewell", "pro convert", "ndi", "encoder", "4k"],
    powerDrawW: 13,
    ports: [
      port("HDMI 2.0 In", "hdmi", "input"),
      port("HDMI Loop", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-0075-4000-8000-000000000117",
    deviceType: "ndi-decoder",
    label: "Magewell NDI→HDMI",
    manufacturer: "Magewell",
    modelNumber: "Pro Convert NDI to HDMI",
    referenceUrl: "https://www.magewell.com/products/pro-convert-for-ndi-to-hdmi",
    searchTerms: ["magewell", "pro convert", "ndi", "decoder"],
    powerDrawW: 13,
    ports: [
      port("Ethernet", "ethernet", "bidirectional"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // ── Streaming & Wireless ─────────────────────────────────────────
  {
    id: "c0a80101-0076-4000-8000-000000000118",
    deviceType: "streaming-encoder",
    label: "BMD Streaming Encoder HD",
    manufacturer: "Blackmagic Design",
    modelNumber: "Web Presenter HD",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicwebpresenter",
    searchTerms: ["blackmagic", "web presenter", "streaming", "webcam"],
    powerDrawW: 18,
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("USB-C Out", "usb", "output", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0077-4000-8000-000000000119",
    deviceType: "streaming-encoder",
    label: "BMD Streaming Encoder 4K",
    manufacturer: "Blackmagic Design",
    modelNumber: "Web Presenter 4K",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicwebpresenter",
    searchTerms: ["blackmagic", "web presenter", "4k", "streaming"],
    powerDrawW: 18,
    ports: [
      port("12G-SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("USB-C Out", "usb", "output", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("SDI Loop", "sdi", "output"),
    ],
  },
  {
    id: "c0a80101-0078-4000-8000-000000000120",
    deviceType: "streaming-encoder",
    label: "Teradek Cube 755",
    manufacturer: "Teradek",
    modelNumber: "Cube 755",
    referenceUrl: "https://teradek.com/products/cube-755",
    searchTerms: ["teradek", "cube", "encoder", "hevc", "h265"],
    powerDrawW: 12, // typical
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0079-4000-8000-000000000121",
    deviceType: "ndi-decoder",
    label: "Teradek Cube 775",
    manufacturer: "Teradek",
    modelNumber: "Cube 775",
    referenceUrl: "https://teradek.com/products/cube-775",
    searchTerms: ["teradek", "cube", "decoder", "hevc"],
    powerDrawW: 12, // typical
    ports: [
      port("Ethernet", "ethernet", "bidirectional"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // Cisco Collaboration Endpoints
  {
    id: "c0a80101-00f1-4000-8000-000000000317",
    deviceType: "av-over-ip",
    label: "Cisco Room Kit",
    manufacturer: "Cisco",
    modelNumber: "CS-KIT-K9",
    referenceUrl: "https://www.cisco.com/c/en/us/products/collateral/collaboration-endpoints/spark-room-kit-series/datasheet-c78-738729.html",
    searchTerms: ["cisco", "room kit", "video conferencing", "webex", "collaboration"],
    powerDrawW: 100, // typical
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out 1", "hdmi", "output"),
      port("HDMI Out 2", "hdmi", "output"),
      port("USB-A", "usb", "bidirectional", "usb-a"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00f2-4000-8000-000000000318",
    deviceType: "av-over-ip",
    label: "Cisco Codec Pro",
    manufacturer: "Cisco",
    modelNumber: "CS-CODEC-PRO-K9",
    referenceUrl: "https://help.webex.com/article/n86suwx/Get-started-with-your-Cisco-Codec-Pro",
    searchTerms: ["cisco", "codec pro", "video conferencing", "webex", "collaboration", "sdi"],
    powerDrawW: 200, // typical
    ports: [
      port("HDMI Cam In 1", "hdmi", "input"),
      port("HDMI Cam In 2", "hdmi", "input"),
      port("HDMI In 3", "hdmi", "input"),
      port("HDMI In 4", "hdmi", "input"),
      port("HDMI In 5", "hdmi", "input"),
      port("SDI Cam In", "sdi", "input"),
      port("HDMI Out 1", "hdmi", "output"),
      port("HDMI Out 2", "hdmi", "output"),
      port("HDMI Out 3", "hdmi", "output"),
      port("USB-A 1", "usb", "bidirectional", "usb-a"),
      port("USB-A 2", "usb", "bidirectional", "usb-a"),
      port("USB-B", "usb", "bidirectional", "usb-b"),
      port("Network", "ethernet", "bidirectional"),
      port("Cam Ctrl 1", "ethernet", "output"),
      port("Cam Ctrl 2", "ethernet", "output"),
      port("PoE", "ethernet", "output"),
      ...ports("Mic/Line In", "analog-audio", "input", 8, "phoenix"),
      ...ports("Line Out", "analog-audio", "output", 6, "phoenix"),
      port("AC Power", "power", "input"),
    
      port("GPIO", "gpio", "bidirectional", "phoenix"),
    ],
  },
  // Extron NAV AV-over-IP
  {
    id: "c0a80101-00f3-4000-8000-000000000319",
    deviceType: "av-over-ip",
    label: "Extron NAV E 101",
    manufacturer: "Extron",
    modelNumber: "NAV E 101",
    referenceUrl: "https://www.extron.com/product/nave101",
    searchTerms: ["extron", "nav", "encoder", "av over ip", "streaming", "pure3"],
    powerDrawW: 12, // typical
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Loop", "hdmi", "output"),
      port("Network", "ethernet", "bidirectional"),
      port("Audio In L", "analog-audio", "input", "phoenix"),
      port("Audio In R", "analog-audio", "input", "phoenix"),
      port("RS-232", "serial", "bidirectional", "phoenix"),
      port("DC Power", "power", "input", "barrel"),
    ],
  },
  {
    id: "c0a80101-00f4-4000-8000-000000000320",
    deviceType: "av-over-ip",
    label: "Extron NAV SD 101",
    manufacturer: "Extron",
    modelNumber: "NAV SD 101",
    referenceUrl: "https://www.extron.com/product/navsd101",
    searchTerms: ["extron", "nav", "decoder", "av over ip", "scaling", "pure3"],
    powerDrawW: 12, // typical
    ports: [
      port("HDMI Out", "hdmi", "output"),
      port("Network", "ethernet", "bidirectional"),
      port("Audio Out L", "analog-audio", "output", "phoenix"),
      port("Audio Out R", "analog-audio", "output", "phoenix"),
      port("RS-232", "serial", "bidirectional", "phoenix"),
      port("DC Power", "power", "input", "barrel"),
    ],
  },
  {
    id: "c0a80101-00fb-4000-8000-000000000327",
    deviceType: "streaming-encoder",
    category: "streaming",
    label: "BMD Streaming Decoder 4K",
    manufacturer: "Blackmagic Design",
    modelNumber: "Streaming Decoder 4K",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicwebpresenter",
    searchTerms: ["blackmagic", "streaming", "decoder", "srt", "rtmp"],
    powerDrawW: 18, // typical
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("AC Power", "power", "input"),
    ],
  },
  // Video new devices
  {
    id: "c0a80101-00ff-4000-8000-000000000331",
    deviceType: "ndi-encoder",
    category: "ndi",
    label: "BirdDog Mini HDMI",
    manufacturer: "BirdDog",
    modelNumber: "Mini HDMI",
    referenceUrl: "https://birddog.tv/mini-overview/",
    searchTerms: ["birddog", "mini", "ndi", "encoder", "hdmi", "poe"],
    powerDrawW: 7, // PoE powered
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-0100-4000-8000-000000000332",
    deviceType: "ndi-encoder",
    category: "ndi",
    label: "Kiloview E2",
    manufacturer: "Kiloview",
    modelNumber: "E2",
    referenceUrl: "https://www.kiloview.com/en/ndi/ndi-wired/",
    searchTerms: ["kiloview", "e2", "ndi", "encoder", "hdmi"],
    powerDrawW: 12, // typical
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  {
    id: "c0a80101-0105-4000-8000-000000000337",
    deviceType: "ndi-encoder",
    category: "ndi",
    label: "Magewell USB Capture HDMI Plus",
    manufacturer: "Magewell",
    modelNumber: "USB Capture HDMI Plus",
    referenceUrl: "https://www.magewell.com/products/usb-capture-hdmi-plus",
    searchTerms: ["magewell", "usb capture", "hdmi", "capture card"],
    powerDrawW: 0, // USB bus-powered
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Loop", "hdmi", "output"),
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
      port("3.5mm Audio Out", "analog-audio", "output", "trs-eighth"),
      port("USB-B 3.0", "usb", "output", "usb-b"),
    ],
  },
  {
    id: "c0a80101-0106-4000-8000-000000000338",
    deviceType: "ndi-encoder",
    category: "ndi",
    label: "Magewell SDI→NDI",
    manufacturer: "Magewell",
    modelNumber: "Pro Convert SDI Plus",
    referenceUrl: "https://www.magewell.com/products/pro-convert-sdi-plus",
    searchTerms: ["magewell", "pro convert", "ndi", "encoder", "sdi"],
    powerDrawW: 13,
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
];
