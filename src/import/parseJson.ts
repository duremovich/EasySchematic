import type { DeviceTemplate, Port } from "../types";
import { DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import { validateTemplate } from "./validate";
import { generatePortId, generateTemplateId, type ParseResult, type ParsedTemplate } from "./types";

/** Parse a JSON string into one or more device templates.
 * Accepts either a single object or an array. */
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

/** Normalize a template JSON object without inventing defaults for missing fields.
 * Useful when merging imported JSON into an existing draft form. */
export function normalizeTemplateJson(raw: Record<string, unknown>): Partial<DeviceTemplate> {
  const template: Partial<DeviceTemplate> = {};

  if (hasOwn(raw, "label")) template.label = str(raw.label);
  if (hasOwn(raw, "shortName")) template.shortName = str(raw.shortName);
  if (hasOwn(raw, "hostname")) template.hostname = str(raw.hostname);
  if (hasOwn(raw, "deviceType")) template.deviceType = str(raw.deviceType);
  if (hasOwn(raw, "category")) template.category = str(raw.category);
  if (hasOwn(raw, "manufacturer")) template.manufacturer = str(raw.manufacturer);
  if (hasOwn(raw, "modelNumber")) template.modelNumber = str(raw.modelNumber);
  if (hasOwn(raw, "imageUrl")) template.imageUrl = str(raw.imageUrl);
  if (hasOwn(raw, "referenceUrl")) template.referenceUrl = str(raw.referenceUrl);
  if (hasOwn(raw, "color")) template.color = str(raw.color);
  if (hasOwn(raw, "slotFamily")) template.slotFamily = str(raw.slotFamily);

  if (hasOwn(raw, "searchTerms") && Array.isArray(raw.searchTerms)) {
    template.searchTerms = raw.searchTerms.filter((term): term is string => typeof term === "string");
  }

  for (const field of [
    "powerDrawW",
    "powerCapacityW",
    "voltage",
    "thermalBtuh",
    "poeBudgetW",
    "poeDrawW",
    "unitCost",
    "heightMm",
    "widthMm",
    "depthMm",
    "weightKg",
    "rackForm",
    "isVenueProvided",
    "auxiliaryData",
    "facePlateLayout",
    "aiMetadata",
    "slots",
  ] as const) {
    if (!hasOwn(raw, field)) continue;
    const value = raw[field];
    if (field === "slots") {
      if (Array.isArray(value)) template.slots = value as NonNullable<DeviceTemplate["slots"]>;
      continue;
    }
    if (field === "auxiliaryData") {
      if (Array.isArray(value)) template.auxiliaryData = value as NonNullable<DeviceTemplate["auxiliaryData"]>;
      continue;
    }
    if (field === "isVenueProvided") {
      if (typeof value === "boolean") template.isVenueProvided = value;
      continue;
    }
    if (field === "rackForm") {
      if (typeof value === "string" && value.trim()) template.rackForm = value as DeviceTemplate["rackForm"];
      continue;
    }
    if (field === "voltage") {
      template.voltage = str(value);
      continue;
    }
    if (field === "facePlateLayout") {
      if (value && typeof value === "object") template.facePlateLayout = value as DeviceTemplate["facePlateLayout"];
      continue;
    }
    if (field === "aiMetadata") {
      if (value && typeof value === "object") template.aiMetadata = value as DeviceTemplate["aiMetadata"];
      continue;
    }
    const parsed = num(value);
    if (parsed != null) {
      (template as Record<string, unknown>)[field] = parsed;
    }
  }

  if (hasOwn(raw, "ports") && Array.isArray(raw.ports)) {
    template.ports = raw.ports.map((p, i) => normalizePort(p as Record<string, unknown>, i)) as Port[];
  }

  return template;
}

function normalizeTemplate(raw: Record<string, unknown>): Partial<DeviceTemplate> {
  const template = normalizeTemplateJson(raw);
  const ports = Array.isArray(template.ports)
    ? template.ports
    : [];

  // Derive category from deviceType if not provided (or if user gave a freeform value)
  const deviceType = typeof template.deviceType === "string" ? template.deviceType : "";
  const derivedCategory = DEVICE_TYPE_TO_CATEGORY[deviceType];
  const category = typeof template.category === "string" && template.category.trim()
    ? template.category
    : derivedCategory ?? "Uncategorized";

  return {
    id: typeof raw.id === "string" ? raw.id : generateTemplateId(),
    label: str(raw.label),
    deviceType,
    category,
    manufacturer: str(raw.manufacturer),
    modelNumber: str(raw.modelNumber),
    referenceUrl: str(raw.referenceUrl),
    color: str(raw.color),
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
    rackForm: typeof raw.rackForm === "string" ? raw.rackForm as DeviceTemplate["rackForm"] : undefined,
    isVenueProvided: typeof raw.isVenueProvided === "boolean" ? raw.isVenueProvided : undefined,
    slots: Array.isArray(raw.slots) ? raw.slots as NonNullable<DeviceTemplate["slots"]> : undefined,
    slotFamily: str(raw.slotFamily),
    auxiliaryData: Array.isArray(raw.auxiliaryData) ? raw.auxiliaryData as NonNullable<DeviceTemplate["auxiliaryData"]> : undefined,
    facePlateLayout: raw.facePlateLayout && typeof raw.facePlateLayout === "object" ? raw.facePlateLayout as DeviceTemplate["facePlateLayout"] : undefined,
    aiMetadata: raw.aiMetadata && typeof raw.aiMetadata === "object" ? raw.aiMetadata as DeviceTemplate["aiMetadata"] : undefined,
    ports: ports as Port[],
  };
}

function normalizePort(raw: Record<string, unknown>, index: number): Partial<Port> {
  return {
    id: typeof raw.id === "string" ? raw.id : generatePortId(index),
    label: str(raw.label) ?? "",
    signalType: (typeof raw.signalType === "string" ? raw.signalType : "") as Port["signalType"],
    direction: (typeof raw.direction === "string" ? raw.direction : "input") as Port["direction"],
    connectorType: typeof raw.connectorType === "string" ? raw.connectorType as Port["connectorType"] : undefined,
    section: str(raw.section),
  };
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

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
