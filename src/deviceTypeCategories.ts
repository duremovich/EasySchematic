/** Canonical device type → category mapping. Shared by main app and devices app. */
export const DEVICE_TYPE_TO_CATEGORY: Record<string, string> = {
  "camera": "Sources",
  "ptz-camera": "Sources",
  "camera-ccu": "Sources",
  "graphics": "Sources",
  "computer": "Sources",
  "media-player": "Sources",
  "mouse": "Peripherals",
  "keyboard": "Peripherals",
  "video-bar": "Codecs",
  "touch-screen": "Control",
  "screen": "Projection",
  "switcher": "Switching",
  "router": "Switching",
  "converter": "Processing",
  "scaler": "Processing",
  "adapter": "Processing",
  "frame-sync": "Processing",
  "multiviewer": "Processing",
  "capture-card": "Processing",
  "chromakey": "Processing",
  "da": "Distribution",
  "video-wall-controller": "Distribution",
  "monitor": "Displays",
  "tv": "Displays",
  "projector": "Projection",
  "recorder": "Recording",
  "audio-mixer": "Mixing Consoles",
  "audio-embedder": "Audio I/O",
  "audio-interface": "Audio I/O",
  "audio-dsp": "Audio",
  "equalizer": "Audio",
  "stage-box": "Audio I/O",
  "wireless-mic-receiver": "Microphones",
  "speaker": "Speakers",
  "amplifier": "Amplifiers",
  "headphone-amplifier": "Audio",
  "monitor-controller": "Audio",
  "personal-monitor": "Audio",
  "ndi-encoder": "Networking",
  "ndi-decoder": "Networking",
  "network-switch": "Networking",
  "streaming-encoder": "Networking",
  "av-over-ip": "Networking",
  "kvm-extender": "KVM / Extenders",
  "hdbaset-extender": "KVM / Extenders",
  "wireless-video": "Wireless",
  "intercom": "Intercom",
  "led-processor": "LED Video",
  "led-cabinet": "LED Video",
  "media-server": "Media Servers",
  "lighting-console": "Lighting",
  "moving-light": "Lighting",
  "led-fixture": "Lighting",
  "dmx-splitter": "Lighting",
  "dmx-node": "Lighting",
  "control-processor": "Control",
  "tally-system": "Control",
  "ptz-controller": "Control",
  "sync-generator": "Control",
  "timecode-generator": "Control",
  "midi-device": "Control",
  "control-expansion": "Control",
  "cable-accessory": "Cable Accessories",
  "wired-mic": "Microphones",
  "iem-transmitter": "Microphones",
  "change-over": "Expansion Cards",
  "expansion-card": "Expansion Cards",
  "fiber-transmitter": "Expansion Cards",
  "company-switch": "Infrastructure",
  "frame": "Infrastructure",
  "power-distribution": "Infrastructure",
  "patch-panel": "Infrastructure",
  "presentation-system": "Switching",
  "wireless-presentation": "Switching",
  "cloud-service": "Cloud Services",
  "codec": "Codecs",
  "expansion-chassis": "Audio Expansion",
  "power-mixer": "Powered Mixers",
  "hdmi-splitter": "Distribution",
  "network-router": "Networking",
  "nas": "Storage",
  "external-storage": "Storage",
  "lighting-processor": "Lighting",
  "network-wifi": "Networking",
  "access-point": "Networking",
  "intercom-transceiver": "Intercom",
  "controller": "Control",
  "button-panel": "Control",
  "dock": "Peripherals",
  "studio-monitor": "Speakers",
  "video-scope": "Monitoring",
  "audio-meter": "Monitoring",
  "assistive-listening": "Audio",
  "battery": "Infrastructure",
  "commentary-box": "Intercom",
  "phone-hybrid": "Intercom",
  "table-box": "Cable Accessories",
  "antenna": "Wireless",
};

/** Human-readable labels for device types (kebab-case → Title Case with known acronyms) */
export const DEVICE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(DEVICE_TYPE_TO_CATEGORY).map((key) => [
    key,
    key
      .split("-")
      .map((word) => {
        const upper = word.toUpperCase();
        // Preserve known acronyms
        if (["ptz", "ccu", "da", "tv", "ndi", "dsp", "kvm", "led", "nas", "usb", "hdmi"].includes(word)) return upper;
        if (word === "av") return "AV";
        if (word === "ip") return "IP";
        if (word === "wifi") return "Wi-Fi";
        if (word === "hdbaset") return "HDBaseT";
        if (word === "iem") return "IEM";
        if (word === "dmx") return "DMX";
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" "),
  ]),
);

/** All unique categories derived from the device type map, sorted */
export const ALL_CATEGORIES: string[] = [...new Set(Object.values(DEVICE_TYPE_TO_CATEGORY))].sort();

/** Device types grouped by category (for grouped pickers) */
export const DEVICE_TYPES_BY_CATEGORY: Record<string, string[]> = {};
for (const [type, cat] of Object.entries(DEVICE_TYPE_TO_CATEGORY)) {
  (DEVICE_TYPES_BY_CATEGORY[cat] ??= []).push(type);
}
