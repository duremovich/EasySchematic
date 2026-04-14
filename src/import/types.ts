import type { DeviceTemplate } from "../types";
import type { TemplateValidationResult } from "./validate";

export interface ParsedTemplate {
  /** The reconstructed template, with IDs filled in. */
  template: DeviceTemplate;
  /** Validation result. */
  validation: TemplateValidationResult;
  /** Optional source descriptor (e.g. "row 12-19" for CSV) shown in the preview. */
  source?: string;
}

export interface ParseResult {
  templates: ParsedTemplate[];
  /** Errors that prevented some templates from being constructed at all
   * (malformed JSON, CSV with no model_number column, etc.). */
  fatalErrors: string[];
}

/** Generate a stable-ish ID for an imported template (matches CardCreatorDialog convention). */
export function generateTemplateId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generatePortId(index: number): string {
  return `p${Date.now()}${index}-${Math.random().toString(36).slice(2, 5)}`;
}
