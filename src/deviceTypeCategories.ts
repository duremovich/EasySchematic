/** Canonical device type → category mapping. Shared by main app and devices app. */
export const DEVICE_TYPE_TO_CATEGORY: Record<string, string> = {
  "camera": "Sources",
  "ptz-camera": "Sources",
  "camera-ccu": "Sources",
  "graphics": "Sources",
  "computer": "Sources",
  "media-player": "Sources",
  "pattern-generator": "Sources",
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
  "synthesizer": "Audio",
  "stage-box": "Audio I/O",
  "audio-splitter": "Audio I/O",
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
  "usb-extender": "KVM / Extenders",
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
  "gateway": "Control",
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
  "fiber-transmitter": "KVM / Extenders",
  "company-switch": "Infrastructure",
  "frame": "Infrastructure",
  "power-distribution": "Infrastructure",
  "patch-panel": "Infrastructure",
  "wall-plate": "Infrastructure",
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
  "storage-media": "Storage Media",
  "lighting-processor": "Lighting",
  "lighting-relay": "Lighting",
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
  "interpreter-desk": "Intercom",
  "table-box": "Cable Accessories",
  "antenna": "Wireless",
  "antenna-distribution": "Wireless",
  "conference-system": "Audio",
  "di-box": "Audio",
  "display": "Displays",
  "charging-station": "Microphones",
  "audio-bar": "Audio",
  "mtr-pc": "Codecs",
  "touch-controller": "Control",
  "occupancy-sensor": "Control",
  // ── Residential / security (#315) ────────────────────────────────────
  // Categories follow the live D1 rows of the same type, which are the
  // convention source — not this catalogue. Four deliberate deviations,
  // each because D1's value collides with an established different meaning:
  // "ups" (D1 "Distribution", which here means signal DAs/splitters),
  // "hard-drive" (D1 "Recording"), "dry-contact" (D1 "Lighting", while its
  // sibling Control4 bus module sits in "Control"), and "keypad" (D1 is split
  // Control 2 / Lighting 1 — the odd row out is listed in the #315 SQL draft).
  "siren": "Monitoring",
  "door-strike": "Monitoring",
  "magnetic-sensor": "Monitoring",
  "v-lock": "Monitoring",
  "turret-camera": "Monitoring",
  "pir-sensor": "Control",
  "keypad": "Control",
  "dry-contact": "Control",
  "bus-power-supply": "Control",
  "24vdc-power-supply": "Control",
  "dali-power-supply-and-line-break": "Lighting",
  "ups": "Infrastructure",
  "hard-drive": "Storage",
  "rf-to-ethernet-integrator": "Networking",
  "subwoofer": "Speakers",
  // ── AV types that were only ever free-typed into D1 (#315) ───────────
  "hdmi-extender": "KVM / Extenders",
  "audio-over-cat-extender": "Audio",
  "audio-matrix": "Audio",
  "streaming-decoder": "Networking",
  "streaming-transceiver": "Networking",
  "video-transceiver": "Networking",
  "avoip-encoder": "Networking",
  "avoip-decoder": "Networking",
  "conferencing-bridge": "Networking",
  "digital-signage-player": "Media Servers",
  // ── New types from the #343 orphan-type sweep ─────────────────────────
  // "power-supply" covers plain AC/DC bricks and power packs (Infrastructure,
  // alongside battery/ups/power-distribution) — distinct from the
  // Control4/security-bus-specific 24vdc-power-supply/bus-power-supply and
  // the DALI-specific dali-power-supply-and-line-break. "fog-machine" is the
  // first atmospheric-effects slug; Lighting matches the other DMX-controlled
  // stage gear (moving-light, led-fixture, dmx-node/-splitter). "camera-tracker"
  // covers virtual-production tracking hardware (VIVE Mars CamTrack family);
  // Sources follows the camera-ccu precedent for camera-chain support gear
  // that carries no video itself.
  "power-supply": "Infrastructure",
  "fog-machine": "Lighting",
  "camera-tracker": "Sources",
  // Standalone wireless DMX transceivers (LumenRadio CRMX, W-DMX). Fixtures
  // with a built-in receiver stay led-fixture/moving-light; the wireless link
  // itself is a "dmx" port on a "wireless" connector.
  "wireless-dmx": "Lighting",
};

/**
 * Device types whose spec sheet states an output wattage, so the editors offer
 * a "Power Capacity (W)" field and the power report gives them a distribution
 * loading row (#345).
 *
 * Membership is exact, never a substring test: `bus-power-supply`,
 * `24vdc-power-supply` and `dali-power-supply-and-line-break` are deliberately
 * separate types (see the #343 note above) that state no distributable output
 * wattage, and `deviceType.includes("power-supply")` swept all three in.
 */
export const POWER_CAPACITY_DEVICE_TYPES: ReadonlySet<string> = new Set([
  "power-distribution",
  "company-switch",
  "power-supply",
]);

/** Whether this device type carries a Power Capacity (W) figure. */
export function carriesPowerCapacity(deviceType: string | undefined): boolean {
  return POWER_CAPACITY_DEVICE_TYPES.has((deviceType ?? "").trim());
}

/**
 * Non-canonical device types that D1 rows still carry, mapped to the slug that
 * won. Kept so importers and the normalisation pass agree on one spelling per
 * concept instead of cementing the split (#315). Not merged into
 * DEVICE_TYPE_TO_CATEGORY — these must not be offerable in the picker.
 */
export const DEVICE_TYPE_ALIASES: Record<string, string> = {
  "pir-motion-sensor": "pir-sensor",
  "passive-subwoofer": "subwoofer",
  "AVoIP Encoder": "avoip-encoder",
};

/** Kebab-case device type slug → Title Case with known acronyms ("wireless-dmx-node" → "Wireless DMX Node"). */
export function formatDeviceTypeLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => {
      const upper = word.toUpperCase();
      // Preserve known acronyms
      if (["ptz", "ccu", "da", "tv", "ndi", "dsp", "kvm", "led", "nas", "usb", "hdmi", "ups", "pir", "rf", "dali"].includes(word)) return upper;
      if (word === "av") return "AV";
      if (word === "avoip") return "AVoIP";
      if (word === "24vdc") return "24VDC";
      if (word === "ip") return "IP";
      if (word === "wifi") return "Wi-Fi";
      if (word === "hdbaset") return "HDBaseT";
      if (word === "iem") return "IEM";
      if (word === "dmx") return "DMX";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Human-readable labels for device types (kebab-case → Title Case with known acronyms) */
export const DEVICE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(DEVICE_TYPE_TO_CATEGORY).map((key) => [key, formatDeviceTypeLabel(key)]),
);

/** All unique categories derived from the device type map, sorted */
export const ALL_CATEGORIES: string[] = [...new Set(Object.values(DEVICE_TYPE_TO_CATEGORY))].sort();

/** Device types grouped by category (for grouped pickers) */
export const DEVICE_TYPES_BY_CATEGORY: Record<string, string[]> = {};
for (const [type, cat] of Object.entries(DEVICE_TYPE_TO_CATEGORY)) {
  (DEVICE_TYPES_BY_CATEGORY[cat] ??= []).push(type);
}
