import type { DeviceTemplate, Port } from "../types";
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

function normalizeTemplate(raw: Record<string, unknown>): Partial<DeviceTemplate> {
  const ports = Array.isArray(raw.ports)
    ? (raw.ports as Array<Record<string, unknown>>).map((p, i) => normalizePort(p, i))
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
    poeBudgetW: num(raw.poeBudgetW),
    unitCost: num(raw.unitCost),
    heightMm: num(raw.heightMm),
    widthMm: num(raw.widthMm),
    depthMm: num(raw.depthMm),
    weightKg: num(raw.weightKg),
    isVenueProvided: typeof raw.isVenueProvided === "boolean" ? raw.isVenueProvided : undefined,
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
