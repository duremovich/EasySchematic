interface TemplateInput {
  label: string;
  deviceType: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  searchTerms?: string[];
  ports: PortInput[];
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

export function validateTemplate(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.label !== "string" || obj.label.trim() === "") {
    return { ok: false, error: "label is required and must be a non-empty string" };
  }

  if (typeof obj.deviceType !== "string" || obj.deviceType.trim() === "") {
    return { ok: false, error: "deviceType is required and must be a non-empty string" };
  }

  if (!Array.isArray(obj.ports)) {
    return { ok: false, error: "ports is required and must be an array" };
  }

  for (let i = 0; i < obj.ports.length; i++) {
    const port = obj.ports[i] as Record<string, unknown> | null;
    if (!port || typeof port !== "object") {
      return { ok: false, error: `ports[${i}] must be an object` };
    }
    if (typeof port.id !== "string" || port.id.trim() === "") {
      return { ok: false, error: `ports[${i}].id is required and must be a non-empty string` };
    }
    if (typeof port.label !== "string" || port.label.trim() === "") {
      return { ok: false, error: `ports[${i}].label is required and must be a non-empty string` };
    }
    if (typeof port.signalType !== "string" || port.signalType.trim() === "") {
      return { ok: false, error: `ports[${i}].signalType is required and must be a non-empty string` };
    }
    if (typeof port.direction !== "string" || port.direction.trim() === "") {
      return { ok: false, error: `ports[${i}].direction is required and must be a non-empty string` };
    }
  }

  return {
    ok: true,
    data: {
      label: obj.label as string,
      deviceType: obj.deviceType as string,
      ...(obj.manufacturer != null && { manufacturer: obj.manufacturer as string }),
      ...(obj.modelNumber != null && { modelNumber: obj.modelNumber as string }),
      ...(obj.color != null && { color: obj.color as string }),
      ...(obj.imageUrl != null && { imageUrl: obj.imageUrl as string }),
      ...(obj.searchTerms != null && { searchTerms: obj.searchTerms as string[] }),
      ports: obj.ports as PortInput[],
      ...(obj.sortOrder != null && { sortOrder: obj.sortOrder as number }),
    },
  };
}

export type { TemplateInput };
