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
import { templates as codecs } from "./devices/codecs";
import { templates as expansionCards } from "./devices/expansion-cards";

const DEVICE_TYPE_TO_CATEGORY: Record<string, string> = {
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
  "audio-embedder": "Audio",
  "audio-interface": "Audio",
  "audio-dsp": "Audio",
  "equalizer": "Audio",
  "stage-box": "Audio",
  "wireless-mic-receiver": "Audio",
  "speaker": "Speakers",
  "amplifier": "Amplifiers",
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
  "wired-mic": "Audio",
  "iem-transmitter": "Audio",
  "expansion-card": "Expansion Cards",
  "company-switch": "Infrastructure",
  "power-distribution": "Infrastructure",
  "patch-panel": "Infrastructure",
  "presentation-system": "Switching",
  "wireless-presentation": "Switching",
  "cloud-service": "Cloud Services",
  "codec": "Codecs",
  "expansion-chassis": "Infrastructure",
  "power-mixer": "Powered Mixers",
  "hdmi-splitter": "Distribution",
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
  ...codecs,
];

export const CARD_TEMPLATES: DeviceTemplate[] = [...expansionCards];

for (const t of [...DEVICE_TEMPLATES, ...CARD_TEMPLATES]) {
  (t as { category?: string }).category = DEVICE_TYPE_TO_CATEGORY[t.deviceType] ?? "Other";
}
