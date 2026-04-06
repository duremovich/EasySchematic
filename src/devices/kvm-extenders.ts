import { port } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // KVM Extenders
  {
    id: "c0a80101-002b-4000-8000-000000000043",
    deviceType: "kvm-extender",
    label: "Adder XDIP",
    manufacturer: "Adder",
    modelNumber: "XDIP",
    referenceUrl: "https://www.adder.com/en/kvm-solutions/adderlink-xdip",
    heightMm: 31,
    widthMm: 169,
    depthMm: 120,
    weightKg: 0.6,
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-B (Computer)", "usb", "bidirectional", "usb-b"),
      port("USB-A 1", "usb", "bidirectional", "usb-a"),
      port("USB-A 2", "usb", "bidirectional", "usb-a"),
      port("USB-A 3", "usb", "bidirectional", "usb-a"),
      port("Audio In", "analog-audio", "input"),
      port("Audio Out", "analog-audio", "output"),
      port("Network", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
    searchTerms: ["Adder", "AdderLink", "XDIP", "KVM", "extender", "IP", "matrix"],
    powerDrawW: 15, // typical
  },
  // HDBaseT Extenders
  // Extron DTP T HD2 4K 230 — HDBaseT Transmitter
  {
    id: "c0a80101-002c-4000-8000-000000000044",
    deviceType: "hdbaset-extender",
    label: "Extron DTP T HD2 4K",
    manufacturer: "Extron",
    modelNumber: "DTP T HD2 4K 230",
    referenceUrl: "https://www.extron.com/product/dtpthd24k230",
    searchTerms: ["extron", "dtp", "hdbaset", "transmitter", "extender"],
    powerDrawW: 12, // typical
    heightMm: 25,
    widthMm: 109,
    depthMm: 152,
    weightKg: 0.2,
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Loop", "hdmi", "output"),
      port("HDBaseT Out", "hdbaset", "output"),
      port("RS-232", "serial", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // Extron DTP R HD2 4K 230 — HDBaseT Receiver
  {
    id: "c0a80101-002d-4000-8000-000000000045",
    deviceType: "hdbaset-extender",
    label: "Extron DTP R HD2 4K",
    manufacturer: "Extron",
    modelNumber: "DTP R HD2 4K 230",
    referenceUrl: "https://www.extron.com/product/dtphdmi230rx",
    searchTerms: ["extron", "dtp", "hdbaset", "receiver", "extender"],
    powerDrawW: 12, // typical
    heightMm: 25,
    widthMm: 109,
    depthMm: 152,
    weightKg: 0.5,
    ports: [
      port("HDBaseT In", "hdbaset", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("RS-232", "serial", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
];
