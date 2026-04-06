import { port } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // Cameras
  {
    id: "c0a80101-0001-4000-8000-000000000001",
    deviceType: "camera",
    label: "Camera",
    powerDrawW: 30, // typical
    ports: [
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Genlock In", "genlock", "input"),
      port("Return In", "sdi", "input"),
      port("AC Power", "power", "input"),
    ],
  },
  // Graphics
  {
    id: "c0a80101-001c-4000-8000-000000000028",
    deviceType: "graphics",
    label: "Graphics Generator",
    powerDrawW: 300, // typical
    ports: [
      port("SDI Fill", "sdi", "output"),
      port("SDI Key", "sdi", "output"),
      port("NDI Out", "ndi", "output"),
    
      port("Ethernet", "ethernet", "bidirectional"),
    
      port("AC Power", "power", "input"),
    ],
  },
  // Mac Studio (M4)
  {
    id: "c0a80101-0024-4000-8000-000000000036",
    deviceType: "computer",
    label: "Mac Studio (M4)",
    manufacturer: "Apple",
    modelNumber: "Mac Studio (M4)",
    referenceUrl: "https://www.apple.com/mac-studio/specs/",
    powerDrawW: 150, // typical
    heightMm: 95,
    widthMm: 197,
    depthMm: 197,
    weightKg: 2.7,
    ports: [
      port("TB5 1", "thunderbolt", "bidirectional"),
      port("TB5 2", "thunderbolt", "bidirectional"),
      port("TB5 3", "thunderbolt", "bidirectional"),
      port("TB5 4", "thunderbolt", "bidirectional"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-A 1", "usb", "bidirectional", "usb-a"),
      port("USB-A 2", "usb", "bidirectional", "usb-a"),
      port("USB-C Front 1", "usb", "bidirectional", "usb-c"),
      port("USB-C Front 2", "usb", "bidirectional", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("SDXC Card", "usb", "bidirectional", "other"),
    
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    ],
  },
  // Computer (Generic)
  {
    id: "c0a80101-0027-4000-8000-000000000039",
    deviceType: "computer",
    label: "Computer",
    searchTerms: ["pc", "laptop", "desktop"],
    powerDrawW: 200, // typical
    ports: [
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // PTZOptics Move SE (30x)
  {
    id: "c0a80101-002a-4000-8000-000000000042",
    deviceType: "ptz-camera",
    label: "PTZOptics Move SE",
    manufacturer: "PTZOptics",
    modelNumber: "Move SE",
    referenceUrl: "https://ptzoptics.com/move-se/",
    searchTerms: ["ptz", "ptzoptics", "pt30x", "move se"],
    powerDrawW: 25, // typical
    heightMm: 164,
    widthMm: 142,
    depthMm: 169,
    weightKg: 1.5,
    ports: [
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("RS-232 In", "serial", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C Out", "usb", "bidirectional", "usb-c"),
      port("RS-232 Out", "serial", "output"),
      port("AC Power", "power", "input"),
    
      port("3.5mm Audio Out", "analog-audio", "output", "trs-eighth"),
    
      port("RS-485", "serial", "bidirectional", "phoenix"),
    ],
  },
  // Media Players
  // BrightSign XD1035 — Digital Signage Media Player
  {
    id: "c0a80101-0034-4000-8000-000000000052",
    deviceType: "media-player",
    label: "BrightSign XD1035",
    manufacturer: "BrightSign",
    modelNumber: "XD1035",
    referenceUrl: "https://docs.brightsign.biz/hardware/xd235-xd1035",
    searchTerms: ["brightsign", "digital signage", "media player", "signage"],
    powerDrawW: 15, // typical
    heightMm: 19,
    widthMm: 206,
    depthMm: 186,
    weightKg: 0.6,
    ports: [
      port("HDMI Out", "hdmi", "output"),
      port("Audio Out", "analog-audio", "output", "trs-eighth"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("USB-A", "usb", "bidirectional", "usb-a"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("RS-232", "serial", "bidirectional", "trs-eighth"),
      port("GPIO", "gpio", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  // ── Cameras ──────────────────────────────────────────────────────
  {
    id: "c0a80101-007c-4000-8000-000000000124",
    deviceType: "camera",
    label: "BMD Studio Camera 4K Pro G2",
    manufacturer: "Blackmagic Design",
    modelNumber: "Studio Camera 4K Pro G2",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicstudiocamera",
    searchTerms: ["blackmagic", "studio camera", "4k", "g2"],
    powerDrawW: 60, // typical
    heightMm: 170,
    widthMm: 274,
    depthMm: 167,
    weightKg: 1.9,
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("SDI Return In", "sdi", "input"),
      port("Genlock In", "genlock", "input"),
      port("XLR In 1", "analog-audio", "input"),
      port("XLR In 2", "analog-audio", "input"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("3.5mm In", "analog-audio", "input", "trs-eighth"),
    
      port("Talkback", "analog-audio", "bidirectional", "xlr-5"),
    
      port("USB-C 2", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-007d-4000-8000-000000000125",
    deviceType: "camera",
    label: "BMD Studio Camera 6K Pro",
    manufacturer: "Blackmagic Design",
    modelNumber: "Studio Camera 6K Pro",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicstudiocamera",
    searchTerms: ["blackmagic", "studio camera", "6k"],
    powerDrawW: 60, // typical
    heightMm: 199,
    widthMm: 274,
    depthMm: 114,
    weightKg: 1.9,
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("SDI Return In", "sdi", "input"),
      port("Genlock In", "genlock", "input"),
      port("XLR In 1", "analog-audio", "input"),
      port("XLR In 2", "analog-audio", "input"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("3.5mm In", "analog-audio", "input", "trs-eighth"),
    
      port("Talkback", "analog-audio", "bidirectional", "xlr-5"),
    
      port("USB-C 2", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-007e-4000-8000-000000000126",
    deviceType: "camera",
    label: "BMD URSA Broadcast G2",
    manufacturer: "Blackmagic Design",
    modelNumber: "URSA Broadcast G2",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicursabroadcast",
    searchTerms: ["blackmagic", "ursa", "broadcast", "cinema camera"],
    powerDrawW: 75, // typical
    weightKg: 2.6,
    ports: [
      port("SDI Out", "sdi", "output"),
      port("SDI In", "sdi", "input"),
      port("Ref/TC In", "genlock", "input"),
      port("XLR In 1", "analog-audio", "input"),
      port("XLR In 2", "analog-audio", "input"),
      port("Headphone", "analog-audio", "output", "trs-quarter"),
      port("AC Power", "power", "input"),
    
      port("SDI Monitor", "sdi", "output"),
    
      port("USB-C", "usb", "bidirectional", "usb-c"),
    ],
  },
  {
    id: "c0a80101-007f-4000-8000-000000000127",
    deviceType: "camera",
    label: "BMD Pocket 6K Pro",
    manufacturer: "Blackmagic Design",
    modelNumber: "Pocket Cinema Camera 6K Pro",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicpocketcinemacamera",
    searchTerms: ["blackmagic", "pocket", "cinema camera", "6k"],
    powerDrawW: 30, // typical
    heightMm: 112,
    widthMm: 180,
    depthMm: 123,
    weightKg: 1.2,
    ports: [
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("Mini XLR In 1", "analog-audio", "input"),
      port("Mini XLR In 2", "analog-audio", "input"),
      port("3.5mm Mic In", "analog-audio", "input", "trs-eighth"),
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    ],
  },
  {
    id: "c0a80101-0080-4000-8000-000000000128",
    deviceType: "camera",
    label: "Sony HDC-5500",
    manufacturer: "Sony",
    modelNumber: "HDC-5500",
    referenceUrl: "https://pro.sony/en_US/products/system-cameras/hdc-5500",
    searchTerms: ["sony", "hdc", "system camera", "4k", "broadcast"],
    powerDrawW: 75, // typical
    heightMm: 109,
    widthMm: 165,
    depthMm: 221,
    weightKg: 5,
    ports: [
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("12G-SDI Out 3", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Return In", "sdi", "input"),
      port("Genlock In", "genlock", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0081-4000-8000-000000000129",
    deviceType: "camera",
    label: "Sony HDC-3500",
    manufacturer: "Sony",
    modelNumber: "HDC-3500",
    referenceUrl: "https://pro.sony/en_US/products/system-cameras/hdc-3500",
    searchTerms: ["sony", "hdc", "system camera", "hd", "broadcast"],
    powerDrawW: 65, // typical
    heightMm: 268,
    widthMm: 138,
    depthMm: 363,
    weightKg: 4.9,
    ports: [
      port("3G-SDI Out 1", "sdi", "output"),
      port("3G-SDI Out 2", "sdi", "output"),
      port("3G-SDI Out 3", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Return In", "sdi", "input"),
      port("Genlock In", "genlock", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-0082-4000-8000-000000000130",
    deviceType: "camera",
    label: "Sony PXW-FX9",
    manufacturer: "Sony",
    modelNumber: "PXW-FX9",
    referenceUrl: "https://pro.sony/en_US/products/camcorders/pxw-fx9",
    searchTerms: ["sony", "fx9", "cinema", "full frame", "camcorder"],
    powerDrawW: 35, // typical
    heightMm: 143,
    widthMm: 146,
    depthMm: 229,
    weightKg: 2,
    ports: [
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("XLR In 1", "analog-audio", "input"),
      port("XLR In 2", "analog-audio", "input"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("AC Power", "power", "input"),
    
      port("12G-SDI Out", "sdi", "output"),
    
      port("Genlock In", "genlock", "input"),
    
      port("TC In/Out", "genlock", "bidirectional"),
    
      port("Headphone", "analog-audio", "output", "trs-eighth"),
    ],
  },
  {
    id: "c0a80101-0083-4000-8000-000000000131",
    deviceType: "ptz-camera",
    label: "Panasonic AW-UE160",
    manufacturer: "Panasonic",
    modelNumber: "AW-UE160",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/ptz-cameras/aw-ue160",
    searchTerms: ["panasonic", "ptz", "ue160", "4k", "st2110", "ndi"],
    powerDrawW: 40, // typical
    heightMm: 277,
    widthMm: 213,
    depthMm: 240,
    weightKg: 4.6,
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("Genlock In", "genlock", "input"),
      port("AC Power", "power", "input"),
    
      port("3G-SDI Out 1", "sdi", "output"),
    
      port("3G-SDI Out 2", "sdi", "output"),
    

      port("XLR In 1", "analog-audio", "input"),

      port("XLR In 2", "analog-audio", "input"),

      port("RS-422", "rs422", "bidirectional", "rj45"),
    ],
    slots: [
      { id: "ue160-sfp-1", label: "SFP+", slotFamily: "sfp", defaultCardId: "sfp-10g-sr" },
    ],
  },
  {
    id: "c0a80101-0084-4000-8000-000000000132",
    deviceType: "ptz-camera",
    label: "Panasonic AW-UE150",
    manufacturer: "Panasonic",
    modelNumber: "AW-UE150",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/ptz-cameras/aw-ue150",
    searchTerms: ["panasonic", "ptz", "ue150", "4k", "ndi"],
    powerDrawW: 38, // typical
    heightMm: 267,
    widthMm: 213,
    depthMm: 219,
    weightKg: 4.3,
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("3G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB 3.0", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("Genlock In", "genlock", "input"),
      port("AC Power", "power", "input"),
    
      port("3G-SDI Out", "sdi", "output"),
    
      port("SDI Monitor", "sdi", "output"),
    

      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),

      port("RS-422", "rs422", "bidirectional", "rj45"),
    ],
    slots: [
      { id: "ue150-sfp-1", label: "SFP+", slotFamily: "sfp", defaultCardId: "sfp-10g-sr" },
    ],
  },
  {
    id: "c0a80101-0085-4000-8000-000000000133",
    deviceType: "ptz-camera",
    label: "Panasonic AW-UE100",
    manufacturer: "Panasonic",
    modelNumber: "AW-UE100",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/ptz-cameras/aw-ue100",
    searchTerms: ["panasonic", "ptz", "ue100", "4k", "ndi", "srt"],
    powerDrawW: 32, // typical
    heightMm: 205,
    widthMm: 169,
    depthMm: 171,
    weightKg: 2.2,
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("3G-SDI Out", "sdi", "output"),
    
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    
      port("RS-422", "rs422", "bidirectional", "rj45"),
    ],
  },
  {
    id: "c0a80101-0086-4000-8000-000000000134",
    deviceType: "ptz-camera",
    label: "Panasonic AW-UE80",
    manufacturer: "Panasonic",
    modelNumber: "AW-UE80",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/ptz-cameras/aw-ue80",
    searchTerms: ["panasonic", "ptz", "ue80", "4k", "ndi|hx"],
    powerDrawW: 23, // typical
    heightMm: 211,
    widthMm: 170,
    depthMm: 171,
    weightKg: 2.2,
    ports: [
      port("3G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("Genlock In", "genlock", "input"),
    
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    
      port("RS-422", "rs422", "bidirectional", "rj45"),
    ],
  },
  {
    id: "c0a80101-0087-4000-8000-000000000135",
    deviceType: "ptz-camera",
    label: "Panasonic AW-UE50",
    manufacturer: "Panasonic",
    modelNumber: "AW-UE50",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/ptz-cameras/aw-ue50",
    searchTerms: ["panasonic", "ptz", "ue50", "4k"],
    powerDrawW: 20, // typical
    heightMm: 192,
    widthMm: 160,
    depthMm: 166,
    weightKg: 1.8,
    ports: [
      port("3G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    
      port("RS-422", "rs422", "bidirectional", "rj45"),
    ],
  },
  {
    id: "c0a80101-0088-4000-8000-000000000136",
    deviceType: "ptz-camera",
    label: "Panasonic AW-HE145",
    manufacturer: "Panasonic",
    modelNumber: "AW-HE145",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/ptz-cameras/aw-he145",
    searchTerms: ["panasonic", "ptz", "he145", "hd"],
    powerDrawW: 25, // typical
    heightMm: 267,
    widthMm: 213,
    depthMm: 219,
    weightKg: 4.1,
    ports: [
      port("3G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    
      port("RS-422", "rs422", "bidirectional", "rj45"),
    ],
  },
  {
    id: "c0a80101-0089-4000-8000-000000000137",
    deviceType: "ptz-camera",
    label: "PTZOptics Move 4K",
    manufacturer: "PTZOptics",
    modelNumber: "Move 4K",
    referenceUrl: "https://ptzoptics.com/move-4k/",
    searchTerms: ["ptzoptics", "ptz", "move 4k", "ndi"],
    powerDrawW: 30, // typical
    heightMm: 228,
    widthMm: 170,
    depthMm: 181,
    weightKg: 2,
    ports: [
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional", "usb-c"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("RS-232", "serial", "bidirectional"),
      port("AC Power", "power", "input"),
    
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    
      port("3.5mm Audio Out", "analog-audio", "output", "trs-eighth"),
    ],
  },
  {
    id: "c0a80101-008a-4000-8000-000000000138",
    deviceType: "camera",
    label: "Panasonic AK-UC4000",
    manufacturer: "Panasonic",
    modelNumber: "AK-UC4000",
    referenceUrl: "https://na.panasonic.com/us/audio-video-solutions/broadcast-cinema/studio-cameras/ak-uc4000",
    searchTerms: ["panasonic", "studio camera", "4k", "broadcast"],
    powerDrawW: 70, // typical
    heightMm: 267,
    widthMm: 151,
    depthMm: 372,
    weightKg: 4.5,
    ports: [
      port("12G-SDI Out 1", "sdi", "output"),
      port("12G-SDI Out 2", "sdi", "output"),
      port("3G-SDI Out 3", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Return In 1", "sdi", "input"),
      port("SDI Return In 2", "sdi", "input"),
      port("Genlock In", "genlock", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("AC Power", "power", "input"),
    ],
  },
  {
    id: "c0a80101-00fc-4000-8000-000000000328",
    deviceType: "camera",
    category: "cameras",
    label: "BMD Micro Studio Camera 4K G2",
    manufacturer: "Blackmagic Design",
    modelNumber: "Micro Studio Camera 4K G2",
    referenceUrl: "https://www.blackmagicdesign.com/products/blackmagicmicrostudiocamera4k",
    searchTerms: ["blackmagic", "micro studio", "camera", "compact"],
    powerDrawW: 12, // typical
    heightMm: 66,
    widthMm: 84,
    depthMm: 70,
    weightKg: 0.3,
    ports: [
      port("SDI Out", "sdi", "output"),
      port("SDI In", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
    ],
  },
  {
    id: "c0a80101-0104-4000-8000-000000000336",
    deviceType: "camera",
    category: "cameras",
    label: "Sony BRC-X400",
    manufacturer: "Sony",
    modelNumber: "BRC-X400",
    referenceUrl: "https://pro.sony/en_US/products/ptz-network-cameras/brc-x400",
    searchTerms: ["sony", "brc", "ptz", "camera", "ndi"],
    powerDrawW: 30, // typical
    heightMm: 178,
    widthMm: 157,
    depthMm: 201,
    weightKg: 1.8,
    ports: [
      port("12G-SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("RS-422", "rs422", "bidirectional"),
      port("Genlock In", "genlock", "input"),
      port("3.5mm Audio In", "analog-audio", "input", "trs-eighth"),
      port("DC Power", "power", "input", "barrel"),
    ],
  },
];
