import type { DatabaseSync } from "node:sqlite";
import type { DeviceTemplate } from "../../src/types.js";
import type {
  ExtractedQuoteDevice,
  QuoteImportCandidateMatch,
  QuoteImportExtractionResponse,
  QuoteImportResultItem,
} from "../../src/quoteImportTypes.js";
import { listCurrentTemplates } from "./deviceStore.js";
import { createOpenAiResponse, extractOutputText, getOpenAiWorkflowConfig } from "./openaiResponses.js";

interface OpenAiExtractionPayload {
  devices?: Array<{
    manufacturer?: unknown;
    model?: unknown;
    description?: unknown;
    quantity?: unknown;
    sourceLineText?: unknown;
  }>;
}

interface MatchContext {
  templates: DeviceTemplate[];
  byLookupKey: Map<string, DeviceTemplate[]>;
  byModel: Map<string, DeviceTemplate[]>;
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizedLookupKey(manufacturer?: string | null, model?: string | null): string {
  const maker = normalizeToken(manufacturer);
  const modelToken = normalizeToken(model);
  if (maker && modelToken) return `${maker}::${modelToken}`;
  return maker || modelToken;
}

function normalizeDescription(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function sanitizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizeQuantity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return null;
}

function mergeDevices(devices: ExtractedQuoteDevice[]): ExtractedQuoteDevice[] {
  const merged = new Map<string, ExtractedQuoteDevice>();

  for (const device of devices) {
    const fallbackKey = normalizeToken(device.sourceLineText || device.description || device.model) || `device-${merged.size + 1}`;
    const key = device.normalizedLookupKey || fallbackKey;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...device });
      continue;
    }

    merged.set(key, {
      manufacturer: existing.manufacturer ?? device.manufacturer,
      model: existing.model.length >= device.model.length ? existing.model : device.model,
      description:
        normalizeDescription(existing.description).length >= normalizeDescription(device.description).length
          ? existing.description
          : device.description,
      quantity:
        existing.quantity == null && device.quantity == null
          ? null
          : (existing.quantity ?? 0) + (device.quantity ?? 0),
      sourceLineText:
        normalizeDescription(existing.sourceLineText).length >= normalizeDescription(device.sourceLineText).length
          ? existing.sourceLineText
          : device.sourceLineText,
      normalizedLookupKey: existing.normalizedLookupKey || device.normalizedLookupKey,
    });
  }

  return [...merged.values()].sort((a, b) => {
    const makerCompare = (a.manufacturer ?? "").localeCompare(b.manufacturer ?? "");
    if (makerCompare !== 0) return makerCompare;
    return a.model.localeCompare(b.model);
  });
}

function buildMatchContext(templates: DeviceTemplate[]): MatchContext {
  const byLookupKey = new Map<string, DeviceTemplate[]>();
  const byModel = new Map<string, DeviceTemplate[]>();

  for (const template of templates) {
    const lookupKey = normalizedLookupKey(template.manufacturer, template.modelNumber || template.label);
    if (lookupKey) {
      const existing = byLookupKey.get(lookupKey) ?? [];
      existing.push(template);
      byLookupKey.set(lookupKey, existing);
    }

    const modelKey = normalizeToken(template.modelNumber || template.label);
    if (modelKey) {
      const existing = byModel.get(modelKey) ?? [];
      existing.push(template);
      byModel.set(modelKey, existing);
    }
  }

  return { templates, byLookupKey, byModel };
}

function toCandidate(template: DeviceTemplate, matchReason: string): QuoteImportCandidateMatch {
  return {
    id: template.id ?? `${template.deviceType}:${template.label}`,
    label: template.label,
    manufacturer: template.manufacturer ?? null,
    modelNumber: template.modelNumber ?? null,
    normalizedLookupKey: normalizedLookupKey(template.manufacturer, template.modelNumber || template.label),
    matchReason,
  };
}

function addCandidate(candidates: Map<string, QuoteImportCandidateMatch>, template: DeviceTemplate, matchReason: string): void {
  const key = template.id ?? `${template.deviceType}:${template.label}`;
  if (candidates.has(key)) return;
  candidates.set(key, toCandidate(template, matchReason));
}

function findPossibleMatches(device: ExtractedQuoteDevice, context: MatchContext): QuoteImportCandidateMatch[] {
  const candidates = new Map<string, QuoteImportCandidateMatch>();
  const modelKey = normalizeToken(device.model);
  const manufacturerKey = normalizeToken(device.manufacturer);

  for (const template of context.byModel.get(modelKey) ?? []) {
    addCandidate(candidates, template, "Same model text as a library device");
  }

  for (const template of context.templates) {
    const templateMaker = normalizeToken(template.manufacturer);
    const templateModel = normalizeToken(template.modelNumber || template.label);
    const templateLabel = normalizeToken(template.label);

    if (manufacturerKey && templateMaker && manufacturerKey !== templateMaker) continue;

    if (modelKey && templateModel && (templateModel.includes(modelKey) || modelKey.includes(templateModel))) {
      addCandidate(candidates, template, "Manufacturer matches and model text is very similar");
      continue;
    }

    if (modelKey && templateLabel.includes(modelKey)) {
      addCandidate(candidates, template, "Model text appears inside a TateSide library label");
    }
  }

  return [...candidates.values()].sort((a, b) => {
    const makerCompare = (a.manufacturer ?? "").localeCompare(b.manufacturer ?? "");
    if (makerCompare !== 0) return makerCompare;
    return (a.modelNumber ?? a.label).localeCompare(b.modelNumber ?? b.label);
  });
}

export function matchQuoteDevicesAgainstLibrary(
  devices: ExtractedQuoteDevice[],
  templates: DeviceTemplate[],
): QuoteImportResultItem[] {
  const context = buildMatchContext(templates);

  return devices.map((device) => {
    const exactMatches = device.normalizedLookupKey
      ? context.byLookupKey.get(device.normalizedLookupKey) ?? []
      : [];

    if (exactMatches.length > 0) {
      return {
        ...device,
        status: "already_in_library",
        exactMatch: toCandidate(exactMatches[0], "Exact manufacturer/model match in TateSide library"),
        possibleMatches: [],
      };
    }

    const possibleMatches = findPossibleMatches(device, context);
    return {
      ...device,
      status: possibleMatches.length > 0 ? "possible_match" : "missing",
      exactMatch: null,
      possibleMatches,
    };
  });
}

export function inspectQuoteDevicesAgainstLibrary(db: DatabaseSync, devices: ExtractedQuoteDevice[]): QuoteImportResultItem[] {
  return matchQuoteDevicesAgainstLibrary(devices, listCurrentTemplates(db));
}

function extractionSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      devices: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            manufacturer: { type: ["string", "null"] },
            model: { type: "string" },
            description: { type: ["string", "null"] },
            quantity: { type: ["number", "null"] },
            sourceLineText: { type: ["string", "null"] },
          },
          required: ["manufacturer", "model", "description", "quantity", "sourceLineText"],
        },
      },
    },
    required: ["devices"],
  };
}

function extractionPrompt(): string {
  return [
    "Extract a deduplicated AV equipment list from this quote PDF.",
    "Extract physical AV, control, conferencing, DSP, network, projection, display, source, routing, amplifier, microphone, speaker, and intercom devices only.",
    "Ignore cables, loose connectors, rack shelves, blanking panels, consumables, sundries, labor, programming, freight, services, subscriptions, and generic installation materials.",
    "Deduplicate repeated quote lines for the same device and combine quantities when appropriate.",
    "Preserve quote wording in sourceLineText where possible.",
    "Do not invent manufacturer names or model numbers when the quote does not provide them.",
    "If manufacturer is unclear, return null instead of guessing.",
  ].join(" ");
}

async function extractDevicesFromPdf(fileName: string, fileBuffer: Buffer): Promise<ExtractedQuoteDevice[]> {
  const config = getOpenAiWorkflowConfig();
  const responseJson = await createOpenAiResponse({
    model: config.quoteExtractionModel,
    reasoning: {
      effort: config.quoteExtractionReasoningEffort,
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: fileName,
            file_data: fileBuffer.toString("base64"),
          },
          {
            type: "input_text",
            text: extractionPrompt(),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "quote_device_extraction",
        strict: true,
        schema: extractionSchema(),
      },
    },
  });

  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    throw new Error("OpenAI did not return any extraction result");
  }

  let parsed: OpenAiExtractionPayload;
  try {
    parsed = JSON.parse(outputText) as OpenAiExtractionPayload;
  } catch {
    throw new Error("OpenAI returned an unreadable extraction result");
  }

  const extracted = (parsed.devices ?? [])
    .map((device) => {
      const manufacturer = sanitizeString(device.manufacturer);
      const model = sanitizeString(device.model);
      if (!model) return null;
      const normalized: ExtractedQuoteDevice = {
        manufacturer,
        model,
        description: sanitizeString(device.description),
        quantity: sanitizeQuantity(device.quantity),
        sourceLineText: sanitizeString(device.sourceLineText),
        normalizedLookupKey: normalizedLookupKey(manufacturer, model),
      };
      return normalized;
    })
    .filter((device): device is ExtractedQuoteDevice => device !== null);

  return mergeDevices(extracted);
}

export async function importQuoteDevicesFromPdf(
  db: DatabaseSync,
  fileName: string,
  fileBuffer: Buffer,
  fileType = "application/pdf",
): Promise<QuoteImportExtractionResponse> {
  const config = getOpenAiWorkflowConfig();
  const extractedDevices = await extractDevicesFromPdf(fileName, fileBuffer);
  const results = inspectQuoteDevicesAgainstLibrary(db, extractedDevices);

  return {
    fileName,
    fileType,
    extractedCount: results.length,
    extractionModel: config.quoteExtractionModel,
    extractionReasoningEffort: config.quoteExtractionReasoningEffort,
    results,
    warnings: [
      "Quote extraction is complete. Review possible matches before researching missing devices.",
      "CSV/XLSX quote parsing is still follow-on work. Phase A currently supports PDF only.",
    ],
  };
}
