import type {
  AiDeviceGenerationMetadata,
  AiDeviceGenerationModelCall,
  AiDeviceGenerationSourceReference,
  DeviceTemplate,
  Port,
  SignalType,
  ConnectorType,
} from "../../src/types.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type {
  ExtractedQuoteDevice,
  QuoteImportDraftReview,
  QuoteImportDraftValidation,
  QuoteImportResearchResponse,
} from "../../src/quoteImportTypes.js";
import { SIGNAL_LABELS, CONNECTOR_LABELS } from "../../src/types.js";
import { DEVICE_TYPE_TO_CATEGORY } from "../../src/deviceTypeCategories.js";
import { createOpenAiResponse, extractOutputText, extractWebSearchSources, getOpenAiWorkflowConfig, type ReasoningEffort } from "./openaiResponses.js";
import { validateDeviceTemplate } from "./validation.js";

interface ResearchRouteOptions {
  fileName: string;
  devices: ExtractedQuoteDevice[];
  forceEscalation?: boolean;
  cachePath?: string;
}

const MAX_CONCURRENT_RESEARCH_CALLS = 3;

interface DraftPortShape {
  label: string;
  signalType: SignalType;
  direction: "input" | "output" | "bidirectional";
  connectorType?: ConnectorType | null;
  section?: string | null;
}

interface OpenAiDraftPayload {
  template?: {
    label?: unknown;
    shortName?: unknown;
    manufacturer?: unknown;
    modelNumber?: unknown;
    deviceType?: unknown;
    referenceUrl?: unknown;
    ports?: unknown;
  } | null;
  confidence?: unknown;
  officialSourceFound?: unknown;
  sourceReferences?: unknown;
  warnings?: unknown;
}

const VALID_DEVICE_TYPES = Object.keys(DEVICE_TYPE_TO_CATEGORY).sort();
const VALID_SIGNAL_TYPES = Object.keys(SIGNAL_LABELS).sort() as SignalType[];
const VALID_CONNECTOR_TYPES = Object.keys(CONNECTOR_LABELS).sort() as ConnectorType[];
const HIGH_RISK_DEVICE_TYPES = new Set([
  "audio-dsp",
  "amplifier",
  "network-switch",
  "av-over-ip",
  "switcher",
  "router",
  "control-processor",
  "codec",
  "video-bar",
  "usb-extender",
  "kvm-extender",
  "hdbaset-extender",
  "ndi-encoder",
  "ndi-decoder",
  "audio-interface",
]);
const PORT_WARNING_KEYWORDS = [
  "port",
  "connector",
  "interface",
  "input",
  "output",
  "hdmi",
  "usb",
  "ethernet",
  "rj45",
  "sdi",
  "network",
  "audio",
  "video",
  "control",
  "serial",
  "dante",
  "hdbaset",
  "relay",
  "gpio",
];

type ResearchSourceResolverId = "jetbuilt" | "supplier_catalogue" | "manufacturer" | "web_search";

interface ResearchSourceResolver {
  id: ResearchSourceResolverId;
  buildTools(): unknown[];
  extractFallbackSources(responseJson: unknown): { title: string; url: string }[];
}

interface CachedResearchReview {
  review: QuoteImportDraftReview;
  cachedAt: string;
}

const WEB_SEARCH_RESOLVER: ResearchSourceResolver = {
  id: "web_search",
  buildTools() {
    return [{ type: "web_search_preview", search_context_size: "low" }];
  },
  extractFallbackSources(responseJson: unknown) {
    return extractWebSearchSources(responseJson);
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSourceType(value: unknown): AiDeviceGenerationSourceReference["sourceType"] {
  switch (value) {
    case "manufacturer_product_page":
    case "manufacturer_datasheet":
    case "manufacturer_manual":
    case "manufacturer_support":
    case "distributor_archive":
      return value;
    default:
      return "other";
  }
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function researchSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      template: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              shortName: { type: ["string", "null"] },
              manufacturer: { type: ["string", "null"] },
              modelNumber: { type: "string" },
              deviceType: { type: "string" },
              referenceUrl: { type: ["string", "null"] },
              ports: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string" },
                    signalType: { type: "string" },
                    direction: { type: "string" },
                    connectorType: { type: ["string", "null"] },
                    section: { type: ["string", "null"] },
                  },
                  required: ["label", "signalType", "direction", "connectorType", "section"],
                },
              },
            },
            required: ["label", "shortName", "manufacturer", "modelNumber", "deviceType", "referenceUrl", "ports"],
          },
        ],
      },
      confidence: { type: "string" },
      officialSourceFound: { type: "boolean" },
      sourceReferences: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            sourceType: { type: "string" },
          },
          required: ["title", "url", "sourceType"],
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["template", "confidence", "officialSourceFound", "sourceReferences", "warnings"],
  };
}

function buildResearchPrompt(
  device: ExtractedQuoteDevice,
  quoteFileName: string,
  purpose: "routine_generation" | "escalated_verification",
): string {
  return [
    `Research this TateSide device and generate a conservative EasySchematic device template draft focused only on schematic connectivity.`,
    `Quote file: ${quoteFileName}.`,
    `Extracted manufacturer: ${device.manufacturer ?? "unknown"}.`,
    `Extracted model: ${device.model}.`,
    `Extracted description: ${device.description ?? "none"}.`,
    `Source quote line: ${device.sourceLineText ?? "none"}.`,
    `Search source priority: 1) official manufacturer product page, 2) official manufacturer datasheet, 3) official manufacturer manual, 4) official manufacturer support/download page, 5) reputable AV distributor/archive only if official documentation is unavailable.`,
    `Research only the device type, relevant port list, and the minimum source links needed to justify those ports.`,
    `Do not return power, weight, dimensions, accessories, mounting details, package contents, or generic technical warnings.`,
    `Do not invent ports. Only include ports or interfaces directly supported by sources.`,
    `Exclude service-only, maintenance, optional-card, and accessory connectivity unless the main product ships with it and it is part of the schematic-facing device.`,
    `If evidence is weak or ambiguous, return only port-related warnings and keep the draft conservative.`,
    `Use no more than two high-quality sources in the response.`,
    `Use only these deviceType values: ${VALID_DEVICE_TYPES.join(", ")}.`,
    `Use only these signalType values: ${VALID_SIGNAL_TYPES.join(", ")}.`,
    `Use only these connectorType values: ${VALID_CONNECTOR_TYPES.join(", ")}.`,
    `Purpose for this call: ${purpose}.`,
  ].join(" ");
}

function sanitizePorts(raw: unknown): Port[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((port): port is DraftPortShape => isObject(port) && typeof port.label === "string" && typeof port.signalType === "string" && typeof port.direction === "string")
    .map((port, index) => ({
      id: `port-${index + 1}`,
      label: port.label.trim(),
      signalType: port.signalType,
      direction: port.direction,
      connectorType: port.connectorType ?? undefined,
      section: port.section ?? undefined,
    }))
    .filter((port) => port.label);
}

function sanitizeTemplate(raw: OpenAiDraftPayload["template"], extracted: ExtractedQuoteDevice): Omit<DeviceTemplate, "id" | "version"> | null {
  if (!raw || !isObject(raw)) return null;
  const deviceType = cleanString(raw.deviceType);
  if (!deviceType) return null;
  const manufacturer = cleanString(raw.manufacturer) ?? extracted.manufacturer ?? undefined;
  const modelNumber = cleanString(raw.modelNumber) ?? extracted.model;
  const ports = sanitizePorts(raw.ports);

  return {
    label: cleanString(raw.label) ?? [manufacturer, modelNumber].filter(Boolean).join(" "),
    shortName: cleanString(raw.shortName),
    manufacturer,
    modelNumber,
    deviceType,
    category: DEVICE_TYPE_TO_CATEGORY[deviceType] ?? "Other",
    referenceUrl: cleanString(raw.referenceUrl),
    ports,
  };
}

function validateResearchDraftTemplate(template: Omit<DeviceTemplate, "id" | "version"> | null): QuoteImportDraftValidation {
  if (!template) {
    return {
      ok: false,
      errors: ["No template draft was generated"],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const backendValidation = validateDeviceTemplate(template);
  errors.push(...backendValidation.errors);

  if (!VALID_DEVICE_TYPES.includes(template.deviceType)) {
    errors.push(`Unknown deviceType "${template.deviceType}"`);
  }
  if (!template.manufacturer) {
    errors.push("manufacturer is required");
  }
  if (!template.modelNumber) {
    errors.push("modelNumber is required");
  }
  if (!template.referenceUrl) {
    errors.push("referenceUrl is required");
  }
  if (!Array.isArray(template.ports) || template.ports.length === 0) {
    warnings.push("Template has no ports");
  }

  for (const [index, port] of template.ports.entries()) {
    if (!VALID_SIGNAL_TYPES.includes(port.signalType)) {
      errors.push(`ports[${index}] uses unsupported signalType "${port.signalType}"`);
    }
    if (port.connectorType && !VALID_CONNECTOR_TYPES.includes(port.connectorType)) {
      errors.push(`ports[${index}] uses unsupported connectorType "${port.connectorType}"`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function buildMetadata(
  extractedDevice: ExtractedQuoteDevice,
  quoteFilename: string,
  finalModelCall: AiDeviceGenerationModelCall,
  modelCallRecords: AiDeviceGenerationModelCall[],
  confidence: "high" | "medium" | "low",
  officialSourceFound: boolean,
  sourceReferences: AiDeviceGenerationSourceReference[],
  warnings: string[],
  escalationReason: string | null,
): AiDeviceGenerationMetadata {
  return {
    origin: "ai_quote_import",
    quoteFilename,
    extractedManufacturer: extractedDevice.manufacturer,
    extractedModel: extractedDevice.model,
    modelUsed: finalModelCall.modelUsed,
    reasoningEffort: finalModelCall.reasoningEffort,
    researchedAt: new Date().toISOString(),
    confidence,
    officialSourceFound,
    sourceReferences,
    warnings,
    escalationRequired: escalationReason !== null,
    escalationReason,
    escalationOccurred: modelCallRecords.length > 1,
    modelCallRecords,
  };
}

export function getEscalationReason(
  template: Omit<DeviceTemplate, "id" | "version"> | null,
  confidence: "high" | "medium" | "low",
  officialSourceFound: boolean,
  warnings: string[],
  validation: QuoteImportDraftValidation,
): string | null {
  if (!officialSourceFound) return "No official manufacturer source was found";
  if (confidence === "low") return "Confidence is low";
  if (!validation.ok) return "Template validation failed";
  if (warnings.length > 0) return "Warnings indicate ambiguous or uncertain connectivity";
  if (template && template.ports.length === 0) return "No supported schematic ports were confirmed";
  if (template && HIGH_RISK_DEVICE_TYPES.has(template.deviceType) && confidence !== "high") {
    return `High-risk device type "${template.deviceType}" needs stronger verification when evidence is not high-confidence`;
  }
  return null;
}

function normalizeReferences(raw: unknown, fallbackSources: { title: string; url: string }[]): AiDeviceGenerationSourceReference[] {
  const references: AiDeviceGenerationSourceReference[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isObject(entry)) continue;
      const title = cleanString(entry.title);
      const url = cleanString(entry.url);
      if (!url) continue;
      references.push({
        title: title ?? url,
        url,
        sourceType: normalizeSourceType(entry.sourceType),
      });
    }
  }

  if (references.length > 0) return references.slice(0, 2);

  return fallbackSources.slice(0, 2).map((source) => ({
    title: source.title,
    url: source.url,
    sourceType: "other",
  }));
}

function normalizeWarningList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
    .map((warning) => warning.trim())
    .filter(isPortRelatedWarning)
    .slice(0, 4);
}

function isPortRelatedWarning(warning: string): boolean {
  const normalized = warning.toLowerCase();
  return PORT_WARNING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function cacheKeyForDevice(device: ExtractedQuoteDevice): string {
  return (device.normalizedLookupKey || `${device.manufacturer ?? ""}::${device.model}`)
    .trim()
    .toLowerCase();
}

function readResearchCache(cachePath: string | undefined): Map<string, CachedResearchReview> {
  if (!cachePath || !existsSync(cachePath)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, CachedResearchReview>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

function writeResearchCache(cachePath: string | undefined, cache: Map<string, CachedResearchReview>): void {
  if (!cachePath) return;
  writeFileSync(cachePath, JSON.stringify(Object.fromEntries(cache), null, 2), "utf8");
}

async function runResearchPass(
  device: ExtractedQuoteDevice,
  quoteFileName: string,
  model: string,
  reasoningEffort: ReasoningEffort,
  purpose: "routine_generation" | "escalated_verification",
  resolver: ResearchSourceResolver,
): Promise<{
  template: Omit<DeviceTemplate, "id" | "version"> | null;
  confidence: "high" | "medium" | "low";
  officialSourceFound: boolean;
  sourceReferences: AiDeviceGenerationSourceReference[];
  warnings: string[];
  validation: QuoteImportDraftValidation;
  modelCall: AiDeviceGenerationModelCall;
}> {
  const responseJson = await createOpenAiResponse({
    model,
    reasoning: { effort: reasoningEffort },
    tools: resolver.buildTools(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildResearchPrompt(device, quoteFileName, purpose),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "device_template_research",
        strict: true,
        schema: researchSchema(),
      },
    },
  });

  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    throw new Error("OpenAI did not return any research result");
  }

  let parsed: OpenAiDraftPayload;
  try {
    parsed = JSON.parse(outputText) as OpenAiDraftPayload;
  } catch {
    throw new Error("OpenAI returned an unreadable research result");
  }

  const fallbackSources = resolver.extractFallbackSources(responseJson);
  const warnings = normalizeWarningList(parsed.warnings);
  const template = sanitizeTemplate(parsed.template, device);
  const validation = validateResearchDraftTemplate(template);

  return {
    template,
    confidence: normalizeConfidence(parsed.confidence),
    officialSourceFound: Boolean(parsed.officialSourceFound),
    sourceReferences: normalizeReferences(parsed.sourceReferences, fallbackSources),
    warnings,
    validation,
    modelCall: {
      modelUsed: model,
      reasoningEffort,
      purpose,
    },
  };
}

function portSummaryFromTemplate(template: Omit<DeviceTemplate, "id" | "version"> | null): string[] {
  if (!template || template.ports.length === 0) return [];
  return template.ports.slice(0, 8).map((port) => {
    const connector = port.connectorType ? CONNECTOR_LABELS[port.connectorType] : "Unknown connector";
    const signal = SIGNAL_LABELS[port.signalType] ?? port.signalType;
    return `${port.label} - ${signal} ${port.direction} via ${connector}`;
  });
}

export async function researchQuoteDevices(options: ResearchRouteOptions): Promise<QuoteImportResearchResponse> {
  const config = getOpenAiWorkflowConfig();
  const resolver = WEB_SEARCH_RESOLVER;
  const cache = readResearchCache(options.cachePath);
  const warnings: string[] = [];
  const results = await runLimitedConcurrency(options.devices, MAX_CONCURRENT_RESEARCH_CALLS, async (device) => {
    const modelCallRecords: AiDeviceGenerationModelCall[] = [];
    const cacheKey = cacheKeyForDevice(device);
    const cached = !options.forceEscalation ? cache.get(cacheKey) : undefined;
    if (cached?.review?.metadata?.sourceReferences?.length) {
      return cached.review;
    }

    try {
      const firstPass = await runResearchPass(
        device,
        options.fileName,
        options.forceEscalation ? config.deviceEscalationModel : config.deviceResearchModel,
        options.forceEscalation ? config.deviceEscalationReasoningEffort : config.deviceResearchReasoningEffort,
        options.forceEscalation ? "escalated_verification" : "routine_generation",
        resolver,
      );
      modelCallRecords.push(firstPass.modelCall);

      let finalPass = firstPass;
      const escalationReason = options.forceEscalation
        ? "Manual stronger-model retry requested"
        : getEscalationReason(firstPass.template, firstPass.confidence, firstPass.officialSourceFound, firstPass.warnings, firstPass.validation);

      if (!options.forceEscalation && escalationReason) {
        const escalatedPass = await runResearchPass(
          device,
          options.fileName,
          config.deviceEscalationModel,
          config.deviceEscalationReasoningEffort,
          "escalated_verification",
          resolver,
        );
        modelCallRecords.push(escalatedPass.modelCall);
        finalPass = escalatedPass;
      }

      const finalEscalationReason = modelCallRecords.length > 1
        ? (options.forceEscalation ? "Manual stronger-model retry requested" : escalationReason)
        : null;
      const metadata = buildMetadata(
        device,
        options.fileName,
        finalPass.modelCall,
        modelCallRecords,
        finalPass.confidence,
        finalPass.officialSourceFound,
        finalPass.sourceReferences,
        finalPass.warnings,
        finalEscalationReason,
      );
      const template = finalPass.template
        ? {
          ...finalPass.template,
          aiMetadata: metadata,
        }
        : null;
      const reviewStatus =
        finalPass.validation.ok && finalPass.confidence !== "low"
          ? "draft_ready"
          : "manual_review_required";

      const review = {
        extractedDevice: device,
        template,
        metadata,
        draftSource: "ai_research",
        validation: finalPass.validation,
        reviewStatus,
        error: null,
        portSummary: portSummaryFromTemplate(template),
      } satisfies QuoteImportDraftReview;
      if (!options.forceEscalation && metadata.sourceReferences.length > 0 && review.error == null) {
        cache.set(cacheKey, {
          review,
          cachedAt: new Date().toISOString(),
        });
      }
      return review;
    } catch (err) {
      warnings.push(`Research failed for ${device.model}`);
      return {
        extractedDevice: device,
        template: null,
        metadata: null,
        draftSource: "ai_research",
        validation: {
          ok: false,
          errors: [],
          warnings: [],
        },
        reviewStatus: "manual_review_required",
        error: err instanceof Error ? err.message : "Research failed",
        portSummary: [],
      } satisfies QuoteImportDraftReview;
    }
  });

  writeResearchCache(options.cachePath, cache);

  return {
    fileName: options.fileName,
    results,
    warnings,
  };
}

async function runLimitedConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
}

export function getHighRiskDeviceTypes(): string[] {
  return [...HIGH_RISK_DEVICE_TYPES].sort();
}
