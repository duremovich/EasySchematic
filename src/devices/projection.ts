import { port } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Panasonic PT-DZ13K — Large Venue Projector
  {
    id: "c0a80101-0022-4000-8000-000000000034",
    deviceType: "projector",
    label: "Panasonic DZ13K",
    manufacturer: "Panasonic",
    modelNumber: "PT-DZ13K",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/projectors/large-venue/pt-dz13ku-3-chip-dlptm-large-venue-projector",
    ports: [
      port("RGBHV In (BNC)", "vga", "input"),
      port("RGB In (VGA)", "vga", "input"),
      port("DVI-D In", "hdmi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2 (3G)", "sdi", "input"),
      port("Composite In", "composite", "input"),
      port("RS-232 In", "serial", "input"),
      port("LAN", "ethernet", "bidirectional"),
      port("RS-232 Out", "serial", "output"),
      port("AC Power", "power", "input"),
    ],
  },
  // Panasonic PT-RZ21K — Large Venue Laser Projector
  {
    id: "c0a80101-0023-4000-8000-000000000035",
    deviceType: "projector",
    label: "Panasonic RZ21K",
    manufacturer: "Panasonic",
    modelNumber: "PT-RZ21K",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/projectors/large-venue/pt-rz21ku-3-chip-dlptm-solid-shine-laser-projector",
    searchTerms: ["panasonic", "laser", "dlp", "21k", "projector"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("DVI-D In", "hdmi", "input"),
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("HDBaseT In", "hdbaset", "input"),
      port("VGA In", "vga", "input"),
      port("RGB BNC In", "vga", "input"),
      port("RS-232 In", "serial", "input"),
      port("LAN", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // ── Projectors ───────────────────────────────────────────────────
  {
    id: "c0a80101-00ce-4000-8000-000000000206",
    deviceType: "projector",
    label: "Panasonic RZ12K",
    manufacturer: "Panasonic",
    modelNumber: "PT-RZ12K",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/projectors/large-venue/pt-rz12ku",
    searchTerms: ["panasonic", "laser", "12k lumens", "projector"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("DVI-D In", "hdmi", "input"),
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("HDBaseT In", "hdbaset", "input"),
      port("VGA In", "vga", "input"),
      port("RS-232", "serial", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
];
