import type { DeviceTemplate, Port } from "../../src/types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const MAX_STRING = 500;
const MAX_SEARCH_TERMS = 100;
const MAX_PORTS = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkString(errors: string[], obj: Record<string, unknown>, key: string, required = false): void {
  const value = obj[key];
  if (value == null) {
    if (required) errors.push(`${key} is required`);
    return;
  }
  if (typeof value !== "string") errors.push(`${key} must be a string`);
  else if (value.length > MAX_STRING) errors.push(`${key} exceeds ${MAX_STRING} characters`);
}

function checkNumber(errors: string[], obj: Record<string, unknown>, key: string): void {
  const value = obj[key];
  if (value == null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${key} must be a non-negative number`);
  }
}

function validatePort(port: unknown, index: number, errors: string[]): void {
  if (!isObject(port)) {
    errors.push(`ports[${index}] must be an object`);
    return;
  }
  checkString(errors, port, "id");
  checkString(errors, port, "label", true);
  checkString(errors, port, "signalType", true);
  checkString(errors, port, "direction", true);
  checkString(errors, port, "connectorType");
  checkString(errors, port, "section");
}

export function validateDeviceTemplate(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["template must be an object"] };

  checkString(errors, input, "label", true);
  checkString(errors, input, "deviceType", true);
  checkString(errors, input, "manufacturer");
  checkString(errors, input, "modelNumber");
  checkString(errors, input, "category");
  checkString(errors, input, "shortName");
  checkString(errors, input, "referenceUrl");
  checkString(errors, input, "color");
  checkString(errors, input, "slotFamily");

  for (const key of [
    "powerDrawW",
    "powerCapacityW",
    "thermalBtuh",
    "poeBudgetW",
    "poeDrawW",
    "unitCost",
    "heightMm",
    "widthMm",
    "depthMm",
    "weightKg",
  ]) {
    checkNumber(errors, input, key);
  }

  if (!Array.isArray(input.ports)) {
    errors.push("ports is required and must be an array");
  } else {
    if (input.ports.length > MAX_PORTS) errors.push(`ports exceeds ${MAX_PORTS} entries`);
    input.ports.forEach((port, index) => validatePort(port, index, errors));
  }

  if (input.searchTerms != null) {
    if (!Array.isArray(input.searchTerms)) {
      errors.push("searchTerms must be an array");
    } else if (input.searchTerms.length > MAX_SEARCH_TERMS) {
      errors.push(`searchTerms exceeds ${MAX_SEARCH_TERMS} entries`);
    } else if (!input.searchTerms.every((term) => typeof term === "string")) {
      errors.push("searchTerms must contain only strings");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeDeviceTemplate(input: unknown): Omit<DeviceTemplate, "id" | "version"> {
  if (!isObject(input) || !isString(input.label) || !isString(input.deviceType) || !Array.isArray(input.ports)) {
    throw new Error("Cannot normalize invalid template");
  }

  const template = { ...input } as Omit<DeviceTemplate, "id" | "version">;
  template.label = input.label.trim();
  template.deviceType = input.deviceType.trim();
  template.manufacturer = typeof input.manufacturer === "string" ? input.manufacturer.trim() : undefined;
  template.modelNumber = typeof input.modelNumber === "string" ? input.modelNumber.trim() : undefined;
  template.category = typeof input.category === "string" ? input.category.trim() : undefined;
  template.ports = (input.ports as Port[]).map((port, index) => ({
    ...port,
    id: port.id || `port-${index + 1}`,
    label: port.label.trim(),
  }));
  return template;
}
