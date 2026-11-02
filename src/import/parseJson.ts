import type { AuxRow, DeviceTemplate, Port, PortCapabilities, PortNetworkConfig, SlotDefinition } from "../types";
import { DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import { validateTemplate } from "./validate";
import { generatePortId, generateTemplateId, type ParseResult, type ParsedTemplate } from "./types";

/** Parse a JSON string into one or more device templates.
 * Accepts either a single object or an array. Unknown fields are stripped. */
export function parseJsonImport(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return {
      templates: [],
      fatalErrors: [`Not valid JSON: ${(e as Error).message}`],
    };
  }

  const items: unknown[] = Array.isArray(json) ? json : [json];
  const templates: ParsedTemplate[] = [];
  const fatalErrors: string[] = [];

  items.forEach((item, idx) => {
    if (!item || typeof item !== "object") {
      fatalErrors.push(`Item ${idx}: not an object`);
      return;
    }
    const normalized = normalizeTemplate(item as Record<string, unknown>);
    const validation = validateTemplate(normalized);
    templates.push({
      template: normalized as DeviceTemplate,
      validation,
      source: items.length > 1 ? `entry ${idx + 1}` : undefined,
    });
  });

  return { templates, fatalErrors };
}

// Optional port fields carried beyond id/label/signalType/direction, grouped by how they are
// coerced. `templatePortId` and `activeConfig` are deliberately absent: they are instance-side
// state (template-sync link, live operating config), not something a template author sets.
const PORT_STRING_FIELDS = ["section", "notes", "linkSpeed"] as const;
// Kept as written when they are strings, so the validator can report an unknown value.
const PORT_ENUM_FIELDS = ["connectorType", "gender", "rearConnectorType", "frontConnectorType", "rearGender", "frontGender"] as const;
const PORT_NUMBER_FIELDS = ["channelCount", "poeDrawW", "usbcPowerSourceW", "usbcPowerDrawW"] as const;
const PORT_BOOLEAN_FIELDS = ["inheritsSignal", "addressable", "isMulticable", "multiConnect", "directAttach", "flipped"] as const;

function normalizeTemplate(raw: Record<string, unknown>): Partial<DeviceTemplate> {
  const ports = Array.isArray(raw.ports)
    ? raw.ports
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p, i) => normalizePort(p, i))
    : [];

  // Derive category from deviceType if not provided (or if user gave a freeform value)
  const deviceType = typeof raw.deviceType === "string" ? raw.deviceType : "";
  const derivedCategory = DEVICE_TYPE_TO_CATEGORY[deviceType];
  const category = typeof raw.category === "string" && raw.category.trim()
    ? raw.category
    : derivedCategory ?? "Uncategorized";

  return {
    id: typeof raw.id === "string" ? raw.id : generateTemplateId(),
    label: str(raw.label),
    shortName: str(raw.shortName),
    hostname: str(raw.hostname),
    deviceType,
    category,
    manufacturer: str(raw.manufacturer),
    modelNumber: str(raw.modelNumber),
    referenceUrl: str(raw.referenceUrl),
    color: str(raw.color),
    // Passed through as written so the validator can report a bad hex the way it does for
    // `color`; placement normalizes whatever survives (#354).
    headerColor: str(raw.headerColor),
    imageUrl: str(raw.imageUrl),
    searchTerms: Array.isArray(raw.searchTerms)
      ? raw.searchTerms.filter((s): s is string => typeof s === "string")
      : undefined,
    powerDrawW: num(raw.powerDrawW),
    powerCapacityW: num(raw.powerCapacityW),
    voltage: str(raw.voltage),
    thermalBtuh: num(raw.thermalBtuh),
    poeBudgetW: num(raw.poeBudgetW),
    poeDrawW: num(raw.poeDrawW),
    unitCost: num(raw.unitCost),
    heightMm: num(raw.heightMm),
    widthMm: num(raw.widthMm),
    depthMm: num(raw.depthMm),
    weightKg: num(raw.weightKg),
    isVenueProvided: typeof raw.isVenueProvided === "boolean" ? raw.isVenueProvided : undefined,
    rackForm: raw.rackForm === "full" || raw.rackForm === "half" || raw.rackForm === "shelf-only"
      ? raw.rackForm
      : undefined,
    auxiliaryData: normalizeAuxData(raw.auxiliaryData),
    // Modular chassis (slots) and expansion card (slotFamily). A non-string slotFamily is passed
    // through as written so the validator can report it rather than the importer dropping it.
    slotFamily: raw.slotFamily != null ? (raw.slotFamily as string) : undefined,
    slots: normalizeSlots(raw.slots),
    ports: ports as Port[],
  };
}

/** Slot definitions for a modular chassis. `id` and `label` are backfilled (a hand-written file
 *  shouldn't have to invent them); everything else is kept as written, and a malformed entry is
 *  passed through rather than dropped, so the validator reports it instead of a slot silently
 *  going missing. */
function normalizeSlots(raw: unknown): SlotDefinition[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return raw as SlotDefinition[];
  if (raw.length === 0) return undefined;
  return raw.map((s: unknown, i): SlotDefinition => {
    const o = obj(s);
    if (!o) return s as SlotDefinition;
    return {
      id: str(o.id) ?? `slot-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
      label: str(o.label) ?? `Slot ${i + 1}`,
      slotFamily: (o.slotFamily ?? "") as string,
      ...(o.defaultCardId != null ? { defaultCardId: o.defaultCardId as string } : {}),
      ...(typeof o.hideWhenEmpty === "boolean" ? { hideWhenEmpty: o.hideWhenEmpty } : {}),
    };
  });
}

/** Aux rows: keeps rows that have a string `text` (blank is allowed — it renders as a
 *  separator) and a header/footer position when one is given. */
function normalizeAuxData(raw: unknown): AuxRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: AuxRow[] = [];
  for (const r of raw) {
    const o = obj(r);
    if (!o || typeof o.text !== "string") continue;
    rows.push({
      text: o.text,
      ...(o.position === "header" || o.position === "footer" ? { position: o.position } : {}),
    });
  }
  return rows.length ? rows : undefined;
}

function normalizePort(raw: Record<string, unknown>, index: number): Partial<Port> {
  const direction = typeof raw.direction === "string" ? raw.direction : "input";
  const port: Record<string, unknown> = {
    id: typeof raw.id === "string" ? raw.id : generatePortId(index),
    label: str(raw.label) ?? "",
    signalType: typeof raw.signalType === "string" ? raw.signalType : "",
    direction,
  };

  for (const f of PORT_STRING_FIELDS) {
    const v = str(raw[f]);
    if (v !== undefined) port[f] = v;
  }
  for (const f of PORT_ENUM_FIELDS) {
    if (typeof raw[f] === "string") port[f] = raw[f];
  }
  for (const f of PORT_NUMBER_FIELDS) {
    const v = num(raw[f]);
    if (v !== undefined) port[f] = v;
  }
  for (const f of PORT_BOOLEAN_FIELDS) {
    if (typeof raw[f] === "boolean") port[f] = raw[f];
  }

  const networkConfig = normalizeNetworkConfig(raw.networkConfig);
  if (networkConfig) port.networkConfig = networkConfig;
  const capabilities = normalizeCapabilities(raw.capabilities);
  if (capabilities) port.capabilities = capabilities;

  // A passthrough port carries whatever is connected to it: the app stores that as
  // signalType "custom" + inheritsSignal. A file that names no signal type for one means
  // exactly that, so write the same shape. An explicit signal type is left as written.
  if (direction === "passthrough" && str(raw.signalType) === undefined) {
    port.signalType = "custom";
    port.inheritsSignal = true;
  }

  return port as Partial<Port>;
}

// Nested objects are rebuilt leaf by leaf rather than copied, so a wrongly typed leaf can't
// reach code that reads these as fully typed (e.g. networkConfig.ip.trim()).
function normalizeNetworkConfig(raw: unknown): PortNetworkConfig | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const out: PortNetworkConfig = {};
  const ip = str(o.ip);
  if (ip !== undefined) out.ip = ip;
  const subnetMask = str(o.subnetMask);
  if (subnetMask !== undefined) out.subnetMask = subnetMask;
  const gateway = str(o.gateway);
  if (gateway !== undefined) out.gateway = gateway;
  const vlan = num(o.vlan);
  if (vlan !== undefined) out.vlan = vlan;
  if (typeof o.dhcp === "boolean") out.dhcp = o.dhcp;
  return Object.keys(out).length ? out : undefined;
}

function normalizeCapabilities(raw: unknown): PortCapabilities | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const out: PortCapabilities = {};
  const maxResolution = str(o.maxResolution);
  if (maxResolution !== undefined) out.maxResolution = maxResolution;
  const maxFrameRate = num(o.maxFrameRate);
  if (maxFrameRate !== undefined) out.maxFrameRate = maxFrameRate;
  const maxBitDepth = num(o.maxBitDepth);
  if (maxBitDepth !== undefined) out.maxBitDepth = maxBitDepth;
  if (Array.isArray(o.colorSpaces)) {
    const colorSpaces = o.colorSpaces.filter((c): c is string => typeof c === "string");
    if (colorSpaces.length) out.colorSpaces = colorSpaces;
  }
  return Object.keys(out).length ? out : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
