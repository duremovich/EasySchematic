interface SlotInput {
  id: string;
  label: string;
  slotFamily: string;
  defaultCardId?: string;
}

interface TemplateInput {
  label: string;
  deviceType: string;
  category: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  referenceUrl?: string;
  searchTerms?: string[];
  ports: PortInput[];
  slots?: SlotInput[];
  slotFamily?: string;
  sortOrder?: number;
}

interface PortInput {
  id: string;
  label: string;
  signalType: string;
  direction: string;
  [key: string]: unknown;
}

type ValidationResult =
  | { ok: true; data: TemplateInput }
  | { ok: false; error: string };

const MAX_STRING = 200;
const MAX_PORTS = 200;
const MAX_SEARCH_TERMS = 20;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function checkString(value: unknown, field: string, maxLen = MAX_STRING): string | null {
  if (typeof value !== "string") return `${field} must be a string`;
  if (value.trim() === "") return `${field} must be non-empty`;
  if (value.length > maxLen) return `${field} must be ${maxLen} characters or fewer`;
  return null;
}

export function validateTemplate(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const obj = body as Record<string, unknown>;

  const labelErr = checkString(obj.label, "label");
  if (labelErr) return { ok: false, error: labelErr };

  const typeErr = checkString(obj.deviceType, "deviceType", 100);
  if (typeErr) return { ok: false, error: typeErr };

  const catErr = checkString(obj.category, "category", 100);
  if (catErr) return { ok: false, error: catErr };

  // Manufacturer — required
  const mfrErr = checkString(obj.manufacturer, "manufacturer");
  if (mfrErr) return { ok: false, error: mfrErr };

  const isGeneric = (obj.manufacturer as string).trim().toLowerCase() === "generic";

  // Model number — required unless manufacturer is "Generic"
  if (!isGeneric) {
    const mnErr = checkString(obj.modelNumber, "modelNumber");
    if (mnErr) return { ok: false, error: mnErr };
  } else if (obj.modelNumber != null) {
    const mnErr = checkString(obj.modelNumber, "modelNumber");
    if (mnErr) return { ok: false, error: mnErr };
  }

  // Reference URL — required unless manufacturer is "Generic", must be HTTPS
  if (!isGeneric) {
    const ruErr = checkString(obj.referenceUrl, "referenceUrl", 2000);
    if (ruErr) return { ok: false, error: ruErr };
    if (!(obj.referenceUrl as string).startsWith("https://")) {
      return { ok: false, error: "referenceUrl must start with https://" };
    }
  } else if (obj.referenceUrl != null && typeof obj.referenceUrl === "string" && obj.referenceUrl.trim() !== "") {
    if (obj.referenceUrl.length > 2000) return { ok: false, error: "referenceUrl must be 2000 characters or fewer" };
    if (!obj.referenceUrl.startsWith("https://")) {
      return { ok: false, error: "referenceUrl must start with https://" };
    }
  }

  // Optional string fields — validate length if present
  for (const [key, max] of [["imageUrl", 500]] as const) {
    if (obj[key] != null) {
      const err = checkString(obj[key], key, max);
      if (err) return { ok: false, error: err };
    }
  }

  // Color — must be valid hex if provided
  if (obj.color != null) {
    if (typeof obj.color !== "string" || !HEX_COLOR_RE.test(obj.color)) {
      return { ok: false, error: "color must be a valid hex color (e.g. #3b82f6)" };
    }
  }

  // Search terms — array of strings, limited count and length
  if (obj.searchTerms != null) {
    if (!Array.isArray(obj.searchTerms)) {
      return { ok: false, error: "searchTerms must be an array of strings" };
    }
    if (obj.searchTerms.length > MAX_SEARCH_TERMS) {
      return { ok: false, error: `searchTerms must have ${MAX_SEARCH_TERMS} or fewer entries` };
    }
    for (let i = 0; i < obj.searchTerms.length; i++) {
      if (typeof obj.searchTerms[i] !== "string" || obj.searchTerms[i].length > 100) {
        return { ok: false, error: `searchTerms[${i}] must be a string of 100 characters or fewer` };
      }
    }
  }

  // Ports
  if (!Array.isArray(obj.ports)) {
    return { ok: false, error: "ports is required and must be an array" };
  }
  if (obj.ports.length > MAX_PORTS) {
    return { ok: false, error: `ports must have ${MAX_PORTS} or fewer entries` };
  }

  for (let i = 0; i < obj.ports.length; i++) {
    const port = obj.ports[i] as Record<string, unknown> | null;
    if (!port || typeof port !== "object") {
      return { ok: false, error: `ports[${i}] must be an object` };
    }
    for (const field of ["id", "label", "signalType", "direction"] as const) {
      const err = checkString(port[field], `ports[${i}].${field}`, 100);
      if (err) return { ok: false, error: err };
    }
    // Optional port string fields
    for (const field of ["connectorType", "section"] as const) {
      if (port[field] != null) {
        const err = checkString(port[field], `ports[${i}].${field}`, 100);
        if (err) return { ok: false, error: err };
      }
    }
  }

  // Slot family — optional string for expansion card templates
  if (obj.slotFamily != null) {
    const sfErr = checkString(obj.slotFamily, "slotFamily", 100);
    if (sfErr) return { ok: false, error: sfErr };
  }

  // Slots — optional array of slot definitions
  if (obj.slots != null) {
    if (!Array.isArray(obj.slots)) {
      return { ok: false, error: "slots must be an array" };
    }
    if (obj.slots.length > 20) {
      return { ok: false, error: "slots must have 20 or fewer entries" };
    }
    for (let i = 0; i < obj.slots.length; i++) {
      const slot = obj.slots[i] as Record<string, unknown> | null;
      if (!slot || typeof slot !== "object") {
        return { ok: false, error: `slots[${i}] must be an object` };
      }
      for (const field of ["id", "label"] as const) {
        const err = checkString(slot[field], `slots[${i}].${field}`, 100);
        if (err) return { ok: false, error: err };
      }
      const familyErr = checkString(slot.slotFamily, `slots[${i}].slotFamily`, 100);
      if (familyErr) return { ok: false, error: familyErr };
      if (slot.defaultCardId != null && typeof slot.defaultCardId !== "string") {
        return { ok: false, error: `slots[${i}].defaultCardId must be a string` };
      }
    }
  }

  return {
    ok: true,
    data: {
      label: obj.label as string,
      deviceType: obj.deviceType as string,
      category: obj.category as string,
      ...(obj.manufacturer != null && { manufacturer: obj.manufacturer as string }),
      ...(obj.modelNumber != null && { modelNumber: obj.modelNumber as string }),
      ...(obj.color != null && { color: obj.color as string }),
      ...(obj.imageUrl != null && { imageUrl: obj.imageUrl as string }),
      ...(obj.referenceUrl != null && { referenceUrl: obj.referenceUrl as string }),
      ...(obj.searchTerms != null && { searchTerms: obj.searchTerms as string[] }),
      ports: obj.ports as PortInput[],
      ...(obj.slots != null && { slots: obj.slots as SlotInput[] }),
      ...(obj.slotFamily != null && { slotFamily: obj.slotFamily as string }),
      ...(obj.sortOrder != null && { sortOrder: obj.sortOrder as number }),
    },
  };
}

export type { TemplateInput };
