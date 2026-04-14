import type { DeviceTemplate, Port } from "../types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "../types";
import { DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";

const VALID_SIGNAL_TYPES = new Set(Object.keys(SIGNAL_LABELS));
const VALID_CONNECTOR_TYPES = new Set(Object.keys(CONNECTOR_LABELS));
const VALID_DEVICE_TYPES = new Set(Object.keys(DEVICE_TYPE_TO_CATEGORY));
const VALID_DIRECTIONS = new Set(["input", "output", "bidirectional"]);

const MAX_STRING = 200;
const MAX_PORTS = 500;

export interface TemplateValidationResult {
  /** True if the template can be saved as-is. */
  ok: boolean;
  /** Hard errors — block import if not skipped. */
  errors: string[];
  /** Soft warnings — import allowed; user should review. */
  warnings: string[];
}

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Client-side mirror of api/src/validate.ts plus enum membership checks the API doesn't have. */
export function validateTemplate(t: Partial<DeviceTemplate>): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!isStr(t.label)) errors.push("label is required");
  else if (t.label.length > MAX_STRING) errors.push(`label exceeds ${MAX_STRING} chars`);

  if (!isStr(t.deviceType)) {
    errors.push("deviceType is required");
  } else if (!VALID_DEVICE_TYPES.has(t.deviceType)) {
    errors.push(`Unknown deviceType "${t.deviceType}"`);
  }

  const isGeneric = isStr(t.manufacturer) && t.manufacturer.trim().toLowerCase() === "generic";

  if (!isStr(t.manufacturer)) errors.push("manufacturer is required");

  if (!isGeneric) {
    if (!isStr(t.modelNumber)) errors.push("modelNumber is required (unless manufacturer is \"Generic\")");
    if (!isStr(t.referenceUrl)) {
      warnings.push("referenceUrl is missing — recommended for community submissions");
    } else if (!/^https?:\/\//i.test(t.referenceUrl)) {
      errors.push("referenceUrl must start with http:// or https://");
    }
  }

  if (t.color != null && (typeof t.color !== "string" || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(t.color))) {
    errors.push("color must be a valid hex (e.g. #3b82f6)");
  }

  // Numeric fields
  for (const field of ["powerDrawW", "powerCapacityW", "heightMm", "widthMm", "depthMm", "weightKg"] as const) {
    const v = t[field];
    if (v != null && (typeof v !== "number" || v < 0 || !isFinite(v))) {
      errors.push(`${field} must be a non-negative number`);
    }
  }

  // Ports
  if (!Array.isArray(t.ports)) {
    errors.push("ports is required and must be an array");
  } else {
    if (t.ports.length === 0) warnings.push("Template has no ports");
    if (t.ports.length > MAX_PORTS) errors.push(`ports exceed ${MAX_PORTS} entries`);

    t.ports.forEach((port: Partial<Port>, i: number) => {
      const prefix = `ports[${i}]`;
      if (!port || typeof port !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (!isStr(port.label)) errors.push(`${prefix}.label is required`);
      if (!isStr(port.signalType)) {
        errors.push(`${prefix}.signalType is required`);
      } else if (!VALID_SIGNAL_TYPES.has(port.signalType)) {
        errors.push(`${prefix} unknown signalType "${port.signalType}"`);
      }
      if (!isStr(port.direction)) {
        errors.push(`${prefix}.direction is required`);
      } else if (!VALID_DIRECTIONS.has(port.direction)) {
        errors.push(`${prefix}.direction must be input, output, or bidirectional`);
      }
      if (port.connectorType != null && !VALID_CONNECTOR_TYPES.has(port.connectorType as string)) {
        errors.push(`${prefix} unknown connectorType "${port.connectorType}"`);
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}
