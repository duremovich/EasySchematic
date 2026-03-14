import type { DeviceTemplate, Port } from "./types";

let portIdCounter = 0;
function port(
  label: string,
  signalType: Port["signalType"],
  direction: Port["direction"],
): Port {
  return { id: `port-${++portIdCounter}`, label, signalType, direction };
}

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  // Cameras
  {
    deviceType: "camera",
    label: "Camera",
    ports: [
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Genlock In", "genlock", "input"),
      port("Return In", "sdi", "input"),
    ],
  },
  // Switchers
  {
    deviceType: "switcher",
    label: "Video Switcher",
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI In 3", "sdi", "input"),
      port("SDI In 4", "sdi", "input"),
      port("PGM Out", "sdi", "output"),
      port("PVW Out", "sdi", "output"),
      port("AUX Out", "sdi", "output"),
      port("Multiview", "sdi", "output"),
    ],
  },
  // Monitors
  {
    deviceType: "monitor",
    label: "Monitor",
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // TV
  {
    deviceType: "tv",
    label: "TV",
    searchTerms: ["television", "display", "screen"],
    ports: [
      port("HDMI In", "hdmi", "input"),
    ],
  },
  // Audio Mixer
  {
    deviceType: "audio-mixer",
    label: "Audio Mixer",
    ports: [
      port("Analog In 1", "analog-audio", "input"),
      port("Analog In 2", "analog-audio", "input"),
      port("Dante In", "dante", "input"),
      port("AES In", "aes", "input"),
      port("PGM Out", "analog-audio", "output"),
      port("AUX Out", "analog-audio", "output"),
      port("Dante Out", "dante", "output"),
      port("AES Out", "aes", "output"),
    ],
  },
  // Blackmagic Micro Converter SDI to HDMI
  {
    deviceType: "converter",
    label: "BMD SDI→HDMI",
    searchTerms: ["blackmagic", "micro converter", "microconverter"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // Blackmagic Micro Converter HDMI to SDI
  {
    deviceType: "converter",
    label: "BMD HDMI→SDI",
    searchTerms: ["blackmagic", "micro converter", "microconverter"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
    ],
  },
  // Decimator MD-LX — Bidirectional SDI/HDMI Cross Converter
  {
    deviceType: "converter",
    label: "Decimator MD-LX",
    searchTerms: ["decimator", "cross converter", "bidirectional"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Blackmagic Micro Converter BiDirectional SDI/HDMI 3G
  {
    deviceType: "converter",
    label: "BMD BiDir SDI/HDMI 3G",
    searchTerms: ["blackmagic", "micro converter", "bidirectional", "3g"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // AJA FiDO-4T — Quad SDI to Fiber Transmitter
  {
    deviceType: "converter",
    label: "AJA FiDO-4T",
    searchTerms: ["aja", "fido", "fiber", "transmitter", "quad"],
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI In 3", "sdi", "input"),
      port("SDI In 4", "sdi", "input"),
      port("Fiber Out 1", "fiber", "output"),
      port("Fiber Out 2", "fiber", "output"),
      port("Fiber Out 3", "fiber", "output"),
      port("Fiber Out 4", "fiber", "output"),
    ],
  },
  // AJA FiDO-4R — Quad Fiber to SDI Receiver
  {
    deviceType: "converter",
    label: "AJA FiDO-4R",
    searchTerms: ["aja", "fido", "fiber", "receiver", "quad"],
    ports: [
      port("Fiber In 1", "fiber", "input"),
      port("Fiber In 2", "fiber", "input"),
      port("Fiber In 3", "fiber", "input"),
      port("Fiber In 4", "fiber", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("SDI Out 3", "sdi", "output"),
      port("SDI Out 4", "sdi", "output"),
    ],
  },
  // AJA FiDO-T — Single SDI to Fiber Transmitter
  {
    deviceType: "converter",
    label: "AJA FiDO-T",
    searchTerms: ["aja", "fido", "fiber", "transmitter", "single"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("Fiber Out", "fiber", "output"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // AJA FiDO-R — Single Fiber to SDI Receiver
  {
    deviceType: "converter",
    label: "AJA FiDO-R",
    searchTerms: ["aja", "fido", "fiber", "receiver", "single"],
    ports: [
      port("Fiber In", "fiber", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
    ],
  },
  // Datavideo DAC-70 — Cross Converter
  {
    deviceType: "converter",
    label: "Datavideo DAC-70",
    searchTerms: ["datavideo", "cross converter", "dac", "vga"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("VGA In", "custom", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // Decimator MD-HX — Scaler / Cross Converter
  {
    deviceType: "scaler",
    label: "Decimator MD-HX",
    searchTerms: ["decimator", "cross converter", "scaler", "upconverter", "downconverter"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Extron DSC 301 HD — Presentation Scaler
  {
    deviceType: "scaler",
    label: "Extron DSC 301 HD",
    searchTerms: ["extron", "presentation scaler", "vga", "scan converter"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("VGA In", "custom", "input"),
      port("Composite In", "custom", "input"),
      port("Audio In 1", "analog-audio", "input"),
      port("Audio In 2", "analog-audio", "input"),
      port("Audio In 3", "analog-audio", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("RS-232", "serial", "bidirectional"),
    ],
  },
  // Converter
  {
    deviceType: "converter",
    label: "Converter",
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // NDI Encoder
  {
    deviceType: "ndi-encoder",
    label: "NDI Encoder",
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("NDI Out", "ndi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // NDI Decoder
  {
    deviceType: "ndi-decoder",
    label: "NDI Decoder",
    ports: [
      port("NDI In", "ndi", "input"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Router
  {
    deviceType: "router",
    label: "SDI Router",
    ports: [
      port("In 1", "sdi", "input"),
      port("In 2", "sdi", "input"),
      port("In 3", "sdi", "input"),
      port("In 4", "sdi", "input"),
      port("Out 1", "sdi", "output"),
      port("Out 2", "sdi", "output"),
      port("Out 3", "sdi", "output"),
      port("Out 4", "sdi", "output"),
    ],
  },
  // Blackmagic Smart Videohub 20x20
  {
    deviceType: "router",
    label: "BMD Videohub 20x20",
    searchTerms: ["blackmagic", "smart videohub", "videohub", "20x20", "matrix"],
    ports: [
      port("In 1", "sdi", "input"),
      port("In 2", "sdi", "input"),
      port("In 3", "sdi", "input"),
      port("In 4", "sdi", "input"),
      port("In 5", "sdi", "input"),
      port("In 6", "sdi", "input"),
      port("In 7", "sdi", "input"),
      port("In 8", "sdi", "input"),
      port("In 9", "sdi", "input"),
      port("In 10", "sdi", "input"),
      port("In 11", "sdi", "input"),
      port("In 12", "sdi", "input"),
      port("In 13", "sdi", "input"),
      port("In 14", "sdi", "input"),
      port("In 15", "sdi", "input"),
      port("In 16", "sdi", "input"),
      port("In 17", "sdi", "input"),
      port("In 18", "sdi", "input"),
      port("In 19", "sdi", "input"),
      port("In 20", "sdi", "input"),
      port("Out 1", "sdi", "output"),
      port("Out 2", "sdi", "output"),
      port("Out 3", "sdi", "output"),
      port("Out 4", "sdi", "output"),
      port("Out 5", "sdi", "output"),
      port("Out 6", "sdi", "output"),
      port("Out 7", "sdi", "output"),
      port("Out 8", "sdi", "output"),
      port("Out 9", "sdi", "output"),
      port("Out 10", "sdi", "output"),
      port("Out 11", "sdi", "output"),
      port("Out 12", "sdi", "output"),
      port("Out 13", "sdi", "output"),
      port("Out 14", "sdi", "output"),
      port("Out 15", "sdi", "output"),
      port("Out 16", "sdi", "output"),
      port("Out 17", "sdi", "output"),
      port("Out 18", "sdi", "output"),
      port("Out 19", "sdi", "output"),
      port("Out 20", "sdi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // Blackmagic CleanSwitch 12x12
  {
    deviceType: "router",
    label: "BMD CleanSwitch 12x12",
    searchTerms: ["blackmagic", "videohub", "cleanswitch", "clean switch", "12x12"],
    ports: [
      port("In 1", "sdi", "input"),
      port("In 2", "sdi", "input"),
      port("In 3", "sdi", "input"),
      port("In 4", "sdi", "input"),
      port("In 5", "sdi", "input"),
      port("In 6", "sdi", "input"),
      port("In 7", "sdi", "input"),
      port("In 8", "sdi", "input"),
      port("In 9", "sdi", "input"),
      port("In 10", "sdi", "input"),
      port("In 11", "sdi", "input"),
      port("In 12", "sdi", "input"),
      port("Out 1", "sdi", "output"),
      port("Out 2", "sdi", "output"),
      port("Out 3", "sdi", "output"),
      port("Out 4", "sdi", "output"),
      port("Out 5", "sdi", "output"),
      port("Out 6", "sdi", "output"),
      port("Out 7", "sdi", "output"),
      port("Out 8", "sdi", "output"),
      port("Out 9", "sdi", "output"),
      port("Out 10", "sdi", "output"),
      port("Out 11", "sdi", "output"),
      port("Out 12", "sdi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // Kramer VS-88H2 — 8x8 HDMI Matrix Switcher
  {
    deviceType: "router",
    label: "Kramer VS-88H2",
    searchTerms: ["kramer", "hdmi", "matrix", "8x8", "switcher"],
    ports: [
      port("HDMI In 1", "hdmi", "input"),
      port("HDMI In 2", "hdmi", "input"),
      port("HDMI In 3", "hdmi", "input"),
      port("HDMI In 4", "hdmi", "input"),
      port("HDMI In 5", "hdmi", "input"),
      port("HDMI In 6", "hdmi", "input"),
      port("HDMI In 7", "hdmi", "input"),
      port("HDMI In 8", "hdmi", "input"),
      port("HDMI Out 1", "hdmi", "output"),
      port("HDMI Out 2", "hdmi", "output"),
      port("HDMI Out 3", "hdmi", "output"),
      port("HDMI Out 4", "hdmi", "output"),
      port("HDMI Out 5", "hdmi", "output"),
      port("HDMI Out 6", "hdmi", "output"),
      port("HDMI Out 7", "hdmi", "output"),
      port("HDMI Out 8", "hdmi", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("RS-232", "serial", "bidirectional"),
    ],
  },
  // Multiviewer
  {
    deviceType: "multiviewer",
    label: "Multiviewer",
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("SDI In 3", "sdi", "input"),
      port("SDI In 4", "sdi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Out", "sdi", "output"),
    ],
  },
  // Frame Sync
  {
    deviceType: "frame-sync",
    label: "Frame Sync",
    ports: [
      port("SDI In", "sdi", "input"),
      port("Ref In", "genlock", "input"),
      port("SDI Out", "sdi", "output"),
    ],
  },
  // Recorder
  {
    deviceType: "recorder",
    label: "Recorder",
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
    ],
  },
  // Blackmagic HyperDeck Extreme
  {
    deviceType: "recorder",
    label: "BMD HyperDeck Extreme",
    searchTerms: ["blackmagic", "hyperdeck", "4k", "hdr", "recorder", "player"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("SDI Monitor", "sdi", "output"),
      port("RS-422", "rs422", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // Graphics
  {
    deviceType: "graphics",
    label: "Graphics Generator",
    ports: [
      port("SDI Fill", "sdi", "output"),
      port("SDI Key", "sdi", "output"),
      port("NDI Out", "ndi", "output"),
    ],
  },
  // Distribution Amp
  {
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
  // Thunderbolt to HDMI Adapter
  {
    deviceType: "adapter",
    label: "TB → HDMI Adapter",
    searchTerms: ["thunderbolt", "usb-c", "dongle"],
    ports: [
      port("TB In", "thunderbolt", "input"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },
  // Blackmagic UltraStudio 4K Mini
  {
    deviceType: "adapter",
    label: "BMD UltraStudio 4K Mini",
    searchTerms: ["blackmagic", "ultrastudio", "capture", "playback", "thunderbolt"],
    ports: [
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("Thunderbolt 3", "thunderbolt", "bidirectional"),
      port("RS-422", "rs422", "bidirectional"),
    ],
  },
  // Datapath FX4 SDI — Video Wall Controller (SDI variant)
  {
    deviceType: "video-wall-controller",
    label: "Datapath FX4 SDI",
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
    ],
  },
  // Datapath FX4 HDMI — Video Wall Controller
  {
    deviceType: "video-wall-controller",
    label: "Datapath FX4 HDMI",
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
    ],
  },
  // Panasonic PT-DZ13K — Large Venue Projector
  {
    deviceType: "projector",
    label: "Panasonic DZ13K",
    ports: [
      port("RGBHV In (BNC)", "custom", "input"),
      port("RGB In (VGA)", "custom", "input"),
      port("DVI-D In", "hdmi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2 (3G)", "sdi", "input"),
      port("Composite In", "custom", "input"),
      port("RS-232 In", "serial", "input"),
      port("LAN", "ethernet", "bidirectional"),
      port("RS-232 Out", "serial", "output"),
    ],
  },
  // Panasonic PT-RZ21K — Large Venue Laser Projector
  {
    deviceType: "projector",
    label: "Panasonic RZ21K",
    searchTerms: ["panasonic", "laser", "dlp", "21k", "projector"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("DVI-D In", "hdmi", "input"),
      port("SDI In 1", "sdi", "input"),
      port("SDI In 2", "sdi", "input"),
      port("HDBaseT In", "hdbaset", "input"),
      port("VGA In", "custom", "input"),
      port("RGB BNC In", "custom", "input"),
      port("RS-232 In", "serial", "input"),
      port("LAN", "ethernet", "bidirectional"),
    ],
  },
  // Mac Studio (M4)
  {
    deviceType: "computer",
    label: "Mac Studio (M4)",
    ports: [
      port("TB5 1", "thunderbolt", "output"),
      port("TB5 2", "thunderbolt", "output"),
      port("TB5 3", "thunderbolt", "output"),
      port("TB5 4", "thunderbolt", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-A 1", "usb", "bidirectional"),
      port("USB-A 2", "usb", "bidirectional"),
      port("USB-C Front 1", "usb", "bidirectional"),
      port("USB-C Front 2", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // Ethernet Switch (4-port)
  {
    deviceType: "network-switch",
    label: "Ethernet Switch (4-port)",
    searchTerms: ["switch", "network", "poe"],
    ports: [
      port("Port 1", "ethernet", "bidirectional"),
      port("Port 2", "ethernet", "bidirectional"),
      port("Port 3", "ethernet", "bidirectional"),
      port("Port 4", "ethernet", "bidirectional"),
    ],
  },
  // Ethernet Switch (8-port)
  {
    deviceType: "network-switch",
    label: "Ethernet Switch (8-port)",
    searchTerms: ["switch", "network", "poe"],
    ports: [
      port("Port 1", "ethernet", "bidirectional"),
      port("Port 2", "ethernet", "bidirectional"),
      port("Port 3", "ethernet", "bidirectional"),
      port("Port 4", "ethernet", "bidirectional"),
      port("Port 5", "ethernet", "bidirectional"),
      port("Port 6", "ethernet", "bidirectional"),
      port("Port 7", "ethernet", "bidirectional"),
      port("Port 8", "ethernet", "bidirectional"),
    ],
  },
  // Computer (Generic)
  {
    deviceType: "computer",
    label: "Computer",
    searchTerms: ["pc", "laptop", "desktop"],
    ports: [
      port("HDMI Out", "hdmi", "output"),
      port("USB-C", "usb", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // Mouse
  {
    deviceType: "mouse",
    label: "Mouse",
    searchTerms: ["mouse", "pointer", "trackpad"],
    ports: [
      port("USB-A", "usb", "bidirectional"),
    ],
  },
  // Keyboard
  {
    deviceType: "keyboard",
    label: "Keyboard",
    searchTerms: ["keyboard", "keypad"],
    ports: [
      port("USB-A", "usb", "bidirectional"),
    ],
  },
  // PTZOptics Move SE (30x)
  {
    deviceType: "ptz-camera",
    label: "PTZOptics Move SE",
    searchTerms: ["ptz", "ptzoptics", "pt30x", "move se"],
    ports: [
      port("3.5mm Audio In", "analog-audio", "input"),
      port("Ethernet", "ethernet", "input"),
      port("RS-232 In", "serial", "input"),
      port("SDI Out", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-C Out", "usb", "bidirectional"),
      port("RS-232 Out", "serial", "output"),
    ],
  },

  // KVM Extenders
  {
    deviceType: "kvm-extender",
    label: "Adder XDIP",
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("USB-B (Computer)", "usb", "bidirectional"),
      port("USB-A 1", "usb", "bidirectional"),
      port("USB-A 2", "usb", "bidirectional"),
      port("USB-A 3", "usb", "bidirectional"),
      port("Audio In", "analog-audio", "input"),
      port("Audio Out", "analog-audio", "output"),
      port("Network", "ethernet", "bidirectional"),
    ],
    searchTerms: ["Adder", "AdderLink", "XDIP", "KVM", "extender", "IP", "matrix"],
  },

  // HDBaseT Extenders
  // Extron DTP T HD2 4K 230 — HDBaseT Transmitter
  {
    deviceType: "hdbaset-extender",
    label: "Extron DTP T HD2 4K",
    searchTerms: ["extron", "dtp", "hdbaset", "transmitter", "extender"],
    ports: [
      port("HDMI In", "hdmi", "input"),
      port("HDMI Loop", "hdmi", "output"),
      port("HDBaseT Out", "hdbaset", "output"),
      port("RS-232", "serial", "bidirectional"),
    ],
  },
  // Extron DTP R HD2 4K 230 — HDBaseT Receiver
  {
    deviceType: "hdbaset-extender",
    label: "Extron DTP R HD2 4K",
    searchTerms: ["extron", "dtp", "hdbaset", "receiver", "extender"],
    ports: [
      port("HDBaseT In", "hdbaset", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("RS-232", "serial", "bidirectional"),
    ],
  },

  // Wireless Video
  // Teradek Bolt 4K 750 TX — Wireless Video Transmitter
  {
    deviceType: "wireless-video",
    label: "Teradek Bolt 4K TX",
    searchTerms: ["teradek", "bolt", "wireless", "transmitter", "zero delay"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Loop", "sdi", "output"),
    ],
  },
  // Teradek Bolt 4K 750 RX — Wireless Video Receiver
  {
    deviceType: "wireless-video",
    label: "Teradek Bolt 4K RX",
    searchTerms: ["teradek", "bolt", "wireless", "receiver", "zero delay"],
    ports: [
      port("SDI Out 1", "sdi", "output"),
      port("SDI Out 2", "sdi", "output"),
      port("HDMI Out", "hdmi", "output"),
    ],
  },

  // Intercom
  // ClearCom FreeSpeak II Base Station
  {
    deviceType: "intercom",
    label: "ClearCom FreeSpeak II",
    searchTerms: ["clearcom", "clear-com", "freespeak", "wireless intercom", "base station"],
    ports: [
      port("Partyline 1", "analog-audio", "bidirectional"),
      port("Partyline 2", "analog-audio", "bidirectional"),
      port("Partyline 3", "analog-audio", "bidirectional"),
      port("Partyline 4", "analog-audio", "bidirectional"),
      port("4-Wire 1", "analog-audio", "bidirectional"),
      port("4-Wire 2", "analog-audio", "bidirectional"),
      port("Program In", "analog-audio", "input"),
      port("Stage Announce", "analog-audio", "output"),
      port("GPIO", "gpio", "bidirectional"),
      port("LAN 1", "ethernet", "bidirectional"),
      port("LAN 2", "ethernet", "bidirectional"),
    ],
  },

  // Audio Embedders / De-Embedders
  // BMD Teranex Mini SDI to Audio 12G — Audio De-Embedder
  {
    deviceType: "audio-embedder",
    label: "BMD SDI→Audio 12G",
    searchTerms: ["blackmagic", "teranex", "de-embedder", "deembed", "audio extract"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("SDI Out", "sdi", "output"),
      port("Analog Out L", "analog-audio", "output"),
      port("Analog Out R", "analog-audio", "output"),
      port("AES Out 1-2", "aes", "output"),
      port("AES Out 3-4", "aes", "output"),
    ],
  },
  // BMD Teranex Mini Audio to SDI 12G — Audio Embedder
  {
    deviceType: "audio-embedder",
    label: "BMD Audio→SDI 12G",
    searchTerms: ["blackmagic", "teranex", "embedder", "audio embed"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("Analog In L", "analog-audio", "input"),
      port("Analog In R", "analog-audio", "input"),
      port("AES In 1-2", "aes", "input"),
      port("AES In 3-4", "aes", "input"),
      port("SDI Out", "sdi", "output"),
    ],
  },

  // Streaming Encoder
  // Teradek Prism Flex — Streaming Encoder/Decoder
  {
    deviceType: "streaming-encoder",
    label: "Teradek Prism Flex",
    searchTerms: ["teradek", "prism", "streaming", "encoder", "rtmp", "srt", "hevc"],
    ports: [
      port("SDI In", "sdi", "input"),
      port("HDMI In", "hdmi", "input"),
      port("SDI Loop", "sdi", "output"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("USB 1", "usb", "bidirectional"),
      port("USB 2", "usb", "bidirectional"),
    ],
  },

  // Media Players
  // BrightSign XD1035 — Digital Signage Media Player
  {
    deviceType: "media-player",
    label: "BrightSign XD1035",
    searchTerms: ["brightsign", "digital signage", "media player", "signage"],
    ports: [
      port("HDMI Out", "hdmi", "output"),
      port("Audio Out", "analog-audio", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
      port("USB-A", "usb", "bidirectional"),
      port("USB-C", "usb", "bidirectional"),
      port("RS-232", "serial", "bidirectional"),
      port("GPIO", "gpio", "bidirectional"),
    ],
  },

  // Wireless Microphone Receivers
  // Shure ULXD4Q — Quad Wireless Mic Receiver
  {
    deviceType: "wireless-mic-receiver",
    label: "Shure ULXD4Q",
    searchTerms: ["shure", "ulx-d", "wireless", "microphone", "receiver", "quad"],
    ports: [
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("Analog Out 3", "analog-audio", "output"),
      port("Analog Out 4", "analog-audio", "output"),
      port("Dante 1", "dante", "bidirectional"),
      port("Dante 2", "dante", "bidirectional"),
    ],
  },
  // Sennheiser EW-DX EM 4 Dante — Quad Wireless Mic Receiver
  {
    deviceType: "wireless-mic-receiver",
    label: "Sennheiser EW-DX EM 4",
    searchTerms: ["sennheiser", "ew-dx", "wireless", "microphone", "receiver", "dante"],
    ports: [
      port("Analog Out 1", "analog-audio", "output"),
      port("Analog Out 2", "analog-audio", "output"),
      port("Analog Out 3", "analog-audio", "output"),
      port("Analog Out 4", "analog-audio", "output"),
      port("Dante 1", "dante", "bidirectional"),
      port("Dante 2", "dante", "bidirectional"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },

  // Audio Interfaces
  // Focusrite RedNet A16R MkII — Dante Audio Interface
  {
    deviceType: "audio-interface",
    label: "Focusrite RedNet A16R",
    searchTerms: ["focusrite", "rednet", "dante", "audio interface", "a16r"],
    ports: [
      port("Analog In 1-8", "analog-audio", "input"),
      port("Analog In 9-16", "analog-audio", "input"),
      port("AES In", "aes", "input"),
      port("Analog Out 1-8", "analog-audio", "output"),
      port("Analog Out 9-16", "analog-audio", "output"),
      port("AES Out", "aes", "output"),
      port("Dante Primary", "dante", "bidirectional"),
      port("Dante Secondary", "dante", "bidirectional"),
      port("Word Clock In", "genlock", "input"),
      port("Word Clock Out", "genlock", "output"),
    ],
  },

  // Control Processors
  // Crestron CP4N — Control Processor
  {
    deviceType: "control-processor",
    label: "Crestron CP4N",
    searchTerms: ["crestron", "control", "processor", "automation", "cp4"],
    ports: [
      port("LAN", "ethernet", "bidirectional"),
      port("Control Subnet", "ethernet", "bidirectional"),
      port("COM (RS-232)", "serial", "bidirectional"),
      port("IR/Serial", "serial", "output"),
      port("Relay", "gpio", "output"),
      port("Versiport I/O", "gpio", "bidirectional"),
      port("Cresnet", "custom", "bidirectional"),
      port("USB", "usb", "bidirectional"),
    ],
  },

  // Tally Systems
  // BMD GPI and Tally Interface
  {
    deviceType: "tally-system",
    label: "BMD GPI & Tally",
    searchTerms: ["blackmagic", "tally", "gpi", "gpio", "indicator"],
    ports: [
      port("Ethernet In", "ethernet", "bidirectional"),
      port("Ethernet Loop", "ethernet", "bidirectional"),
      port("GPI In (8ch)", "gpio", "input"),
      port("GPI Out (8ch)", "gpio", "output"),
    ],
  },

  // AV-over-IP
  // Crestron DM-NVX-351 — AV-over-IP Encoder/Decoder
  {
    deviceType: "av-over-ip",
    label: "Crestron DM-NVX-351",
    searchTerms: ["crestron", "nvx", "av-over-ip", "networked av", "encoder", "decoder"],
    ports: [
      port("HDMI In 1", "hdmi", "input"),
      port("HDMI In 2", "hdmi", "input"),
      port("HDMI Out", "hdmi", "output"),
      port("Ethernet 1", "ethernet", "bidirectional"),
      port("Ethernet 2", "ethernet", "bidirectional"),
      port("SFP", "fiber", "bidirectional"),
      port("Analog Audio", "analog-audio", "bidirectional"),
      port("USB Host", "usb", "bidirectional"),
      port("USB Device", "usb", "bidirectional"),
    ],
  },
];
