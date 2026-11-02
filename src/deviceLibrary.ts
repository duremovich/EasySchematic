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
import { templates as storageMedia } from "./devices/storage-media";

import { DEVICE_TYPE_TO_CATEGORY } from "./deviceTypeCategories";
import { deviceTypeCategory } from "./typeRegistry";
export { DEVICE_TYPE_TO_CATEGORY };

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

export const CARD_TEMPLATES: DeviceTemplate[] = [...expansionCards, ...storageMedia];

for (const t of [...DEVICE_TEMPLATES, ...CARD_TEMPLATES]) {
  (t as { category?: string }).category = deviceTypeCategory(t.deviceType);
}
