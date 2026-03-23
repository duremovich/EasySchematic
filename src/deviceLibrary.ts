import type { DeviceTemplate } from "./types";
import { templates as sources } from "./devices/sources";
import { templates as switching } from "./devices/switching";
import { templates as monitoring } from "./devices/monitoring";
import { templates as audio } from "./devices/audio";
import { templates as processing } from "./devices/processing";
import { templates as networking } from "./devices/networking";
import { templates as recording } from "./devices/recording";
import { templates as distribution } from "./devices/distribution";
import { templates as projection } from "./devices/projection";
import { templates as peripherals } from "./devices/peripherals";
import { templates as kvmExtenders } from "./devices/kvm-extenders";
import { templates as wireless } from "./devices/wireless";
import { templates as control } from "./devices/control";
import { templates as infrastructure } from "./devices/infrastructure";
import { templates as speakersAmps } from "./devices/speakers-amps";
import { templates as ledVideo } from "./devices/led-video";
import { templates as mediaServers } from "./devices/media-servers";
import { templates as lighting } from "./devices/lighting";
import { templates as cableAccessories } from "./devices/cable-accessories";
import { templates as cloudServices } from "./devices/cloud-services";
import { templates as expansionCards } from "./devices/expansion-cards";

const DEVICE_TYPE_TO_CATEGORY: Record<string, string> = {
  "camera": "Sources",
  "ptz-camera": "Sources",
  "graphics": "Sources",
  "computer": "Sources",
  "media-player": "Sources",
  "mouse": "Peripherals",
  "keyboard": "Peripherals",
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
  "monitor": "Monitoring",
  "tv": "Monitoring",
  "projector": "Projection",
  "recorder": "Recording",
  "audio-mixer": "Mixing Consoles",
  "audio-embedder": "Audio",
  "audio-interface": "Audio",
  "audio-dsp": "Audio",
  "stage-box": "Audio",
  "wireless-mic-receiver": "Audio",
  "speaker": "Speakers & Amps",
  "amplifier": "Speakers & Amps",
  "headphone-amplifier": "Audio",
  "personal-monitor": "Audio",
  "ndi-encoder": "Networking",
  "ndi-decoder": "Networking",
  "network-switch": "Networking",
  "streaming-encoder": "Networking",
  "av-over-ip": "Networking",
  "kvm-extender": "KVM / Extenders",
  "hdbaset-extender": "KVM / Extenders",
  "wireless-video": "Wireless",
  "intercom": "Wireless",
  "led-processor": "LED Video",
  "media-server": "Media Servers",
  "lighting-console": "Lighting",
  "moving-light": "Lighting",
  "led-fixture": "Lighting",
  "dmx-splitter": "Lighting",
  "control-processor": "Control",
  "tally-system": "Control",
  "ptz-controller": "Control",
  "timecode-generator": "Control",
  "midi-device": "Control",
  "cable-accessory": "Cable Accessories",
  "expansion-card": "Expansion Cards",
  "power-distribution": "Infrastructure",
  "patch-panel": "Infrastructure",
  "cloud-service": "Cloud Services",
};

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  ...sources,
  ...switching,
  ...monitoring,
  ...audio,
  ...processing,
  ...networking,
  ...recording,
  ...distribution,
  ...projection,
  ...peripherals,
  ...kvmExtenders,
  ...wireless,
  ...control,
  ...infrastructure,
  ...speakersAmps,
  ...ledVideo,
  ...mediaServers,
  ...lighting,
  ...cableAccessories,
  ...cloudServices,
];

export const CARD_TEMPLATES: DeviceTemplate[] = [...expansionCards];

for (const t of [...DEVICE_TEMPLATES, ...CARD_TEMPLATES]) {
  (t as { category?: string }).category = DEVICE_TYPE_TO_CATEGORY[t.deviceType] ?? "Other";
}
