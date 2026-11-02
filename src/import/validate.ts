import type { DeviceTemplate, Port, SlotDefinition } from "../types";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "../types";
import { DEVICE_TYPE_TO_CATEGORY, DEVICE_TYPE_ALIASES } from "../deviceTypeCategories";

const VALID_SIGNAL_TYPES = new Set(Object.keys(SIGNAL_LABELS));
const VALID_CONNECTOR_TYPES = new Set(Object.keys(CONNECTOR_LABELS));
const VALID_DEVICE_TYPES = new Set(Object.keys(DEVICE_TYPE_TO_CATEGORY));
const VALID_DIRECTIONS = new Set(["input", "output", "bidirectional", "passthrough"]);
const VALID_GENDERS = new Set(["male", "female"]);

const MAX_STRING = 200;
/** Mirrors MAX_PORTS in api/src/validate.ts. */
export const MAX_PORTS = 500;

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

function isNonNegative(v: unknown): boolean {
  return typeof v === "number" && v >= 0 && isFinite(v);
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
    const canonical = DEVICE_TYPE_ALIASES[t.deviceType];
    errors.push(
      canonical
        ? `Unknown deviceType "${t.deviceType}" — use "${canonical}"`
        : `Unknown deviceType "${t.deviceType}"`,
    );
  }

  const isGeneric = isStr(t.manufacturer) && t.manufacturer.trim().toLowerCase() === "generic";

  if (!isStr(t.manufacturer)) errors.push("manufacturer is required");

  if (!isGeneric) {
    if (!isStr(t.modelNumber)) errors.push("modelNumber is required (unless manufacturer is \"Generic\")");
    if (!isStr(t.referenceUrl)) {
      errors.push("referenceUrl is required (unless manufacturer is \"Generic\")");
    } else if (!/^https?:\/\//i.test(t.referenceUrl)) {
      errors.push("referenceUrl must start with http:// or https://");
    }
  }

  if (t.color != null && (typeof t.color !== "string" || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(t.color))) {
    errors.push("color must be a valid hex (e.g. #3b82f6)");
  }

  if (t.headerColor != null && (typeof t.headerColor !== "string" || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(t.headerColor))) {
    errors.push("headerColor must be a valid hex (e.g. #3b82f6)");
  }

  // Numeric fields
  for (const field of ["powerDrawW", "powerCapacityW", "thermalBtuh", "poeDrawW", "heightMm", "widthMm", "depthMm", "weightKg"] as const) {
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
        errors.push(`${prefix}.direction must be input, output, bidirectional, or passthrough`);
      }
      for (const field of ["connectorType", "rearConnectorType", "frontConnectorType"] as const) {
        if (port[field] != null && !VALID_CONNECTOR_TYPES.has(port[field] as string)) {
          errors.push(`${prefix} unknown ${field} "${port[field]}"`);
        }
      }
      for (const field of ["gender", "rearGender", "frontGender"] as const) {
        if (port[field] != null && !VALID_GENDERS.has(port[field] as string)) {
          errors.push(`${prefix}.${field} must be male or female`);
        }
      }
      for (const field of ["channelCount", "poeDrawW", "usbcPowerSourceW", "usbcPowerDrawW"] as const) {
        if (port[field] != null && !isNonNegative(port[field])) {
          errors.push(`${prefix}.${field} must be a non-negative number`);
        }
      }
      const vlan = port.networkConfig?.vlan;
      if (vlan != null && (!Number.isInteger(vlan) || vlan < 0 || vlan > 4094)) {
        errors.push(`${prefix}.networkConfig.vlan must be an integer 0–4094`);
      }
      for (const field of ["maxFrameRate", "maxBitDepth"] as const) {
        const v = port.capabilities?.[field];
        if (v != null && !isNonNegative(v)) {
          errors.push(`${prefix}.capabilities.${field} must be a non-negative number`);
        }
      }
    });
  }

  // Modular chassis. A blank slotFamily only warns: the editor's own "Add Slot" starts a slot
  // with one, and nothing breaks — no card can be installed there until it is set.
  const checkFamily = (v: unknown, field: string) => {
    if (typeof v !== "string") errors.push(`${field} must be a string`);
    else if (!v.trim()) warnings.push(`${field} is blank — no card can be matched to it until it is set`);
  };

  if (t.slotFamily != null) checkFamily(t.slotFamily, "slotFamily");

  if (t.slots != null) {
    if (!Array.isArray(t.slots)) {
      errors.push("slots must be an array");
    } else {
      t.slots.forEach((slot: Partial<SlotDefinition>, i: number) => {
        const prefix = `slots[${i}]`;
        if (!slot || typeof slot !== "object") {
          errors.push(`${prefix} must be an object`);
          return;
        }
        for (const field of ["id", "label"] as const) {
          if (!isStr(slot[field])) errors.push(`${prefix}.${field} is required`);
        }
        checkFamily(slot.slotFamily, `${prefix}.slotFamily`);
        if (slot.defaultCardId != null && typeof slot.defaultCardId !== "string") {
          errors.push(`${prefix}.defaultCardId must be a string`);
        }
      });

      // An installed slot is edited and removed by its id, so two slots sharing one would
      // change together.
      const ids = t.slots.map((slot) => slot?.id).filter((id): id is string => typeof id === "string");
      const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      if (duplicates.length) errors.push(`Duplicate slot ids: ${duplicates.join(", ")}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
