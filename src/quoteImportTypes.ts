import type { AiDeviceGenerationMetadata, DeviceTemplate } from "./types.js";

export type LibraryMatchStatus = "already_in_library" | "possible_match" | "missing";

export type QuoteImportReasoningEffort = "low" | "medium" | "high";

export interface ExtractedQuoteDevice {
  manufacturer: string | null;
  model: string;
  description: string | null;
  quantity: number | null;
  sourceLineText: string | null;
  normalizedLookupKey: string;
}

export interface QuoteImportCandidateMatch {
  id: string;
  label: string;
  manufacturer: string | null;
  modelNumber: string | null;
  normalizedLookupKey: string;
  matchReason: string;
}

export interface QuoteImportResultItem extends ExtractedQuoteDevice {
  status: LibraryMatchStatus;
  exactMatch: QuoteImportCandidateMatch | null;
  possibleMatches: QuoteImportCandidateMatch[];
}

export interface QuoteImportExtractionResponse {
  fileName: string;
  fileType: string;
  extractedCount: number;
  extractionModel: string;
  extractionReasoningEffort: QuoteImportReasoningEffort;
  results: QuoteImportResultItem[];
  warnings: string[];
}

export interface QuoteImportDraftValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface QuoteImportDraftReview {
  extractedDevice: ExtractedQuoteDevice;
  template: DeviceTemplate | null;
  metadata: AiDeviceGenerationMetadata | null;
  validation: QuoteImportDraftValidation;
  reviewStatus: "draft_ready" | "manual_review_required";
  error: string | null;
  portSummary: string[];
}

export interface QuoteImportResearchResponse {
  fileName: string;
  results: QuoteImportDraftReview[];
  warnings: string[];
}
