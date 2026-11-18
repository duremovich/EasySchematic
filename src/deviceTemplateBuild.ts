/**
 * The objects the device editor's template-family save actions write: a `DeviceTemplate` for
 * Save as User Template / Update User Template / Update as Custom, and a `TemplatePreset` for
 * Save as Preset.
 *
 * Kept out of the component and pure so the shape of what gets saved — in particular which
 * header color rides along (#354) — is unit-testable. The editor holds the form state and
 * hands it over; everything below is a plain function of that state.
 */

import type {
  AuxRow,
  ConnectorType,
  DeviceData,
  DeviceTemplate,
  Gender,
  Port,
  PortCapabilities,
  PortDirection,
  PortNetworkConfig,
  SignalType,
  TemplatePreset,
} from "./types";
import { trimTrailingEmpty } from "./auxiliaryData";
import { carriesPowerCapacity } from "./deviceTypeCategories";
import { capturedHeaderColorField, type HeaderColorCapture } from "./deviceHeaderColor";
import { installedSlotsToDefinitions, slotOwnedPortIds } from "./slotDefinitions";

/** One row of the device editor's port table, before it is normalized into a `Port`. */
export interface PortDraft {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  section?: string;
  connectorType?: ConnectorType;
  gender?: Gender;
  networkConfig?: PortNetworkConfig;
  addressable?: boolean;
  capabilities?: PortCapabilities;
  isMulticable?: boolean;
  channelCount?: number;
  multiConnect?: boolean;
  directAttach?: boolean;
  notes?: string;
  poeDrawW?: number;
  usbcPowerSourceW?: number;
  usbcPowerDrawW?: number;
  linkSpeed?: string;
  flipped?: boolean;
  exclusiveGroup?: string;
  // Passthrough-only fields
  rearConnectorType?: ConnectorType;
  rearGender?: Gender;
  frontConnectorType?: ConnectorType;
  frontGender?: Gender;
  inheritsSignal?: boolean;
}

/** Drop unlabeled rows and renumber the rest onto stable ids. */
function finalizePorts(ports: PortDraft[], idPrefix: string): Port[] {
  return ports
    .filter((p) => p.label.trim())
    .map((p, i) => ({ ...p, id: `${idPrefix}-${i}`, label: p.label.trim() }));
}

/** Everything the template builder reads out of the device editor's form. */
export interface TemplateFormValues {
  ports: PortDraft[];
  label: string;
  shortName: string;
  deviceType: string;
  color: string | undefined;
  /** How the saved header color is decided — see `capturedHeaderColorField`. */
  headerColor: HeaderColorCapture;
  category: string;
  manufacturer: string;
  modelNumber: string;
  referenceUrl: string;
  hostname: string;
  powerDrawW: number | undefined;
  powerCapacityW: number | undefined;
  voltage: string | undefined;
  thermalBtuh: number | undefined;
  poeBudgetW: number | undefined;
  poeDrawW: number | undefined;
  unitCost: number | undefined;
  heightMm: number | undefined;
  widthMm: number | undefined;
  depthMm: number | undefined;
  weightKg: number | undefined;
  rackForm: DeviceData["rackForm"];
  isVenueProvided: boolean;
  auxiliaryData: AuxRow[];
  searchTermsRaw: string;
  /** The device being saved, for the fields a template inherits from the placed instance. */
  existing: DeviceData | undefined;
}

function parseSearchTerms(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

/**
 * Build the template written by Save as User Template, Update User Template and Update as
 * Custom. `overrides` carries the id (always) and, for updates and forks, the version and a
 * renamed label.
 */
export function buildDeviceTemplate(
  form: TemplateFormValues,
  overrides: Partial<DeviceTemplate> & Pick<DeviceTemplate, "id">,
): DeviceTemplate {
  const existing = form.existing;
  // Ports an installed card brought with it belong to the card, not the chassis: the card is
  // saved as the slot's default and re-installs them on placement. Keeping them here too put
  // every card port on a placed copy twice (#422). Same split templateSync uses.
  const cardPortIds = slotOwnedPortIds(existing?.slots);
  const finalPorts = finalizePorts(form.ports.filter((p) => !cardPortIds.has(p.id)), "tpl");
  const trimmedAux = trimTrailingEmpty(form.auxiliaryData);
  const slots = installedSlotsToDefinitions(existing?.slots, { includeNested: true });
  const searchTerms = parseSearchTerms(form.searchTermsRaw);
  return {
    deviceType: form.deviceType.trim() || "custom",
    label: form.label.trim() || "Custom Device",
    ...(form.shortName.trim() ? { shortName: form.shortName.trim() } : {}),
    ports: finalPorts,
    ...(form.color ? { color: form.color } : {}),
    // Save the device's header color with the template, so every device placed from it comes
    // out that color regardless of the two default settings (#354).
    ...capturedHeaderColorField(form.headerColor),
    ...(form.category.trim() ? { category: form.category.trim() } : {}),
    ...(form.manufacturer.trim() ? { manufacturer: form.manufacturer.trim() } : {}),
    ...(form.modelNumber.trim() ? { modelNumber: form.modelNumber.trim() } : {}),
    ...(form.referenceUrl.trim() ? { referenceUrl: form.referenceUrl.trim() } : {}),
    ...(form.hostname.trim() ? { hostname: form.hostname.trim() } : {}),
    ...(form.powerDrawW != null ? { powerDrawW: form.powerDrawW } : {}),
    ...(form.powerCapacityW != null && carriesPowerCapacity(form.deviceType) ? { powerCapacityW: form.powerCapacityW } : {}),
    ...(form.voltage ? { voltage: form.voltage } : {}),
    ...(form.thermalBtuh != null ? { thermalBtuh: form.thermalBtuh } : {}),
    ...(form.poeBudgetW != null ? { poeBudgetW: form.poeBudgetW } : {}),
    ...(form.poeDrawW != null ? { poeDrawW: form.poeDrawW } : {}),
    ...(form.unitCost != null ? { unitCost: form.unitCost } : {}),
    ...(form.heightMm != null ? { heightMm: form.heightMm } : {}),
    ...(form.widthMm != null ? { widthMm: form.widthMm } : {}),
    ...(form.depthMm != null ? { depthMm: form.depthMm } : {}),
    ...(form.weightKg != null ? { weightKg: form.weightKg } : {}),
    ...(form.rackForm ? { rackForm: form.rackForm } : {}),
    ...(form.isVenueProvided ? { isVenueProvided: true } : {}),
    // Convert InstalledSlot[] back to the blueprint SlotDefinition[] that DeviceTemplate
    // expects: the chassis' own slots with their installed cards as defaults, plus a
    // `parent/child` override per nested slot recording the card it held. Placement applies
    // those overrides where the parent card re-creates the sub-slot, so each slot is placed
    // once with the card it was saved with (#422) — see slotDefinitions.ts.
    ...(slots.length > 0 ? { slots } : {}),
    ...(existing?.slotFamily ? { slotFamily: existing.slotFamily as string } : {}),
    ...(trimmedAux.some((r) => r.text.trim()) ? { auxiliaryData: trimmedAux } : {}),
    ...(searchTerms.length > 0 ? { searchTerms } : {}),
    ...overrides,
  };
}

/** Everything the preset builder reads out of the device editor's form. */
export interface PresetFormValues {
  ports: PortDraft[];
  hiddenPorts: string[];
  color: string | undefined;
  /** How the saved header color is decided — see `capturedHeaderColorField`. */
  headerColor: HeaderColorCapture;
}

/** Build the project preset written by Save as Preset. */
export function buildTemplatePreset(form: PresetFormValues): TemplatePreset {
  // Normalize ports to stable preset IDs
  const presetPorts = finalizePorts(form.ports, "preset");

  // Remap hiddenPorts through old→new mapping
  const idMap = new Map<string, string>();
  form.ports.filter((p) => p.label.trim()).forEach((p, i) => { idMap.set(p.id, `preset-${i}`); });
  const presetHidden = form.hiddenPorts
    .map((id) => idMap.get(id) ?? id)
    .filter((id) => presetPorts.some((p) => p.id === id));

  return {
    ports: presetPorts,
    ...(presetHidden.length > 0 ? { hiddenPorts: presetHidden } : {}),
    ...(form.color ? { color: form.color } : {}),
    // The header color rides along with the preset, so every later device placed from this
    // template comes out that color ahead of the project and app defaults (#354).
    ...capturedHeaderColorField(form.headerColor),
  };
}
