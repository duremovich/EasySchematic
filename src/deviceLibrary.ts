import type { DeviceTemplate } from "./types";
import { templates as expansionCards } from "./devices/expansion-cards";
import { templates as storageMedia } from "./devices/storage-media";

import { DEVICE_TYPE_TO_CATEGORY } from "./deviceTypeCategories";
export { DEVICE_TYPE_TO_CATEGORY };

// TateSide's visible library is owned by the VPS-backed API, not the old
// EasySchematic bundled catalogue.
export const DEVICE_TEMPLATES: DeviceTemplate[] = [];

// Built-in cards remain local because they support modular slot editing rather
// than the visible device browser.
export const CARD_TEMPLATES: DeviceTemplate[] = [...expansionCards, ...storageMedia];

for (const t of CARD_TEMPLATES) {
  (t as { category?: string }).category = DEVICE_TYPE_TO_CATEGORY[t.deviceType] ?? "Other";
}
