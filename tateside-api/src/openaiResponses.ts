const OPENAI_API_URL = "https://api.openai.com/v1/responses";

export type ReasoningEffort = "low" | "medium" | "high";

export interface OpenAiWorkflowConfig {
  quoteExtractionModel: string;
  deviceResearchModel: string;
  deviceEscalationModel: string;
  quoteExtractionReasoningEffort: ReasoningEffort;
  deviceResearchReasoningEffort: ReasoningEffort;
  deviceEscalationReasoningEffort: ReasoningEffort;
}

export function getOpenAiWorkflowConfig(): OpenAiWorkflowConfig {
  return {
    quoteExtractionModel: process.env.OPENAI_QUOTE_EXTRACTION_MODEL || "gpt-5.4-nano",
    deviceResearchModel: process.env.OPENAI_DEVICE_RESEARCH_MODEL || "gpt-5.4-mini",
    deviceEscalationModel: process.env.OPENAI_DEVICE_ESCALATION_MODEL || "gpt-5.4",
    quoteExtractionReasoningEffort: normalizeEffort(process.env.OPENAI_QUOTE_EXTRACTION_REASONING_EFFORT, "low"),
    deviceResearchReasoningEffort: normalizeEffort(process.env.OPENAI_DEVICE_RESEARCH_REASONING_EFFORT, "medium"),
    deviceEscalationReasoningEffort: normalizeEffort(process.env.OPENAI_DEVICE_ESCALATION_REASONING_EFFORT, "medium"),
  };
}

function normalizeEffort(value: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
  if (value === "low" || value === "medium" || value === "high") return value;
  return fallback;
}

export async function createOpenAiResponse(payload: unknown): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AI quote import is not available because OPENAI_API_KEY is not configured on the TateSide API server");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const responseJson = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = responseJson && typeof responseJson === "object"
      ? ((responseJson as { error?: { message?: string } }).error?.message ?? `OpenAI request failed (${response.status})`)
      : `OpenAI request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return responseJson;
}

export function extractOutputText(responseJson: unknown): string {
  if (!responseJson || typeof responseJson !== "object") return "";
  const obj = responseJson as Record<string, unknown>;
  if (typeof obj.output_text === "string" && obj.output_text.trim()) {
    return obj.output_text;
  }

  const output = Array.isArray(obj.output) ? obj.output : [];
  const textParts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content?: unknown[] }).content ?? [] : [];
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const text = (entry as { text?: unknown }).text;
      if (typeof text === "string") textParts.push(text);
    }
  }
  return textParts.join("\n").trim();
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export function extractWebSearchSources(responseJson: unknown): WebSearchSource[] {
  if (!responseJson || typeof responseJson !== "object") return [];
  const output = Array.isArray((responseJson as { output?: unknown[] }).output) ? (responseJson as { output?: unknown[] }).output ?? [] : [];
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: unknown }).type !== "web_search_call") continue;
    const actionSources = Array.isArray((item as { action?: { sources?: unknown[] } }).action?.sources)
      ? (item as { action?: { sources?: unknown[] } }).action?.sources ?? []
      : [];
    for (const source of actionSources) {
      if (!source || typeof source !== "object") continue;
      const title = typeof (source as { title?: unknown }).title === "string" ? (source as { title?: string }).title ?? "" : "";
      const url = typeof (source as { url?: unknown }).url === "string" ? (source as { url?: string }).url ?? "" : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: title || url, url });
    }
  }

  return sources;
}
