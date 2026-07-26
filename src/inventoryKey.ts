import type { DeviceData, DeviceTemplate } from "./types";

/**
 * Canonical inventory key for matching placed devices against owned-gear
 * templates. Format: `manufacturer|modelNumber|displayName`.
 *
 * Both variants must agree on what goes in the display-name slot so that a
 * template in the owned-gear list matches the devices it was spawned from.
 * Templates only have `label`; placed nodes may have been renamed and expose
 * the original via `baseLabel` — `model` wins when present, then `baseLabel`,
 * then the (possibly-edited) `label`.
 */
export function inventoryKeyFromTemplate(
  t: Pick<DeviceTemplate, "label" | "manufacturer" | "modelNumber">,
): string {
  return `${t.manufacturer ?? ""}|${t.modelNumber ?? ""}|${t.label}`;
}

export function inventoryKeyFromDeviceData(
  d: Pick<DeviceData, "label" | "manufacturer" | "modelNumber" | "model" | "baseLabel">,
): string {
  return `${d.manufacturer ?? ""}|${d.modelNumber ?? ""}|${d.model ?? d.baseLabel ?? d.label}`;
}

/**
 * Identity fields that re-tag a placed device as an instance of `template`.
 *
 * Used when saving a modified on-canvas device as a new user template: without
 * re-stamping these, the device keeps the original library device's `model`, so
 * identity-keyed reports (pack list / BOQ derive the name from
 * `model ?? baseLabel ?? label`) keep showing the old name. Re-stamping mirrors a
 * freshly-placed template instance (see `addDevice`), which is why the
 * delete-and-re-add workaround shows the correct name. (#137)
 */
export function templateIdentityPatch(
  template: Pick<DeviceTemplate, "id" | "label" | "shortName" | "version">,
): Pick<
  DeviceData,
  "label" | "baseLabel" | "model" | "templateId" | "templateVersion" | "shortName"
> {
  return {
    label: template.label,
    baseLabel: template.label,
    model: template.label,
    templateId: template.id,
    templateVersion: template.version,
    shortName: template.shortName,
  };
}
