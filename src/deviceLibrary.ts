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
      port("USB-A 1", "usb", "output"),
      port("USB-A 2", "usb", "output"),
      port("USB-C Front 1", "usb", "output"),
      port("USB-C Front 2", "usb", "output"),
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
      port("USB-C", "usb", "output"),
      port("Ethernet", "ethernet", "bidirectional"),
    ],
  },
  // Mouse
  {
    deviceType: "mouse",
    label: "Mouse",
    searchTerms: ["mouse", "pointer", "trackpad"],
    ports: [
      port("USB-A", "usb", "output"),
    ],
  },
  // Keyboard
  {
    deviceType: "keyboard",
    label: "Keyboard",
    searchTerms: ["keyboard", "keypad"],
    ports: [
      port("USB-A", "usb", "output"),
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
      port("USB-C Out", "usb", "output"),
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
      port("USB-B (Computer)", "usb", "input"),
      port("USB-A 1", "usb", "output"),
      port("USB-A 2", "usb", "output"),
      port("USB-A 3", "usb", "output"),
      port("Audio In", "analog-audio", "input"),
      port("Audio Out", "analog-audio", "output"),
      port("Network", "ethernet", "bidirectional"),
    ],
    searchTerms: ["Adder", "AdderLink", "XDIP", "KVM", "extender", "IP", "matrix"],
  },
];
