import { SIGNAL_LABELS } from "./types";
import type { DeviceTemplate } from "./types";

const WORD_BOUNDARY = /[\s(/_.-]/;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function queryWords(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

function fieldWords(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function includesAtWordBoundary(value: string, word: string): boolean {
  const idx = value.indexOf(word);
  return idx >= 0 && (idx === 0 || WORD_BOUNDARY.test(value[idx - 1]));
}

function scoreTextField(value: string, word: string, scores: { exact: number; prefix: number; contains?: number }): number {
  if (!value) return 0;

  const normalized = normalizeText(value);
  const words = fieldWords(normalized);

  if (words.includes(word)) return scores.exact;
  if (word.length >= 2 && words.some((candidate) => candidate.startsWith(word))) return scores.prefix;

  // Avoid turning short queries into "every word containing this letter" searches.
  if (word.length >= 3 && scores.contains && includesAtWordBoundary(normalized, word)) {
    return scores.contains;
  }

  return 0;
}

/** Score how well a template matches a search query. 0 = no match. Higher = better. */
export function scoreTemplate(template: DeviceTemplate, query: string): number {
  const words = queryWords(query);
  if (words.length === 0) return 0;

  const phrase = words.join(" ");
  const label = normalizeText(template.label);
  const shortName = normalizeText(template.shortName ?? "");
  const deviceType = normalizeText(template.deviceType);
  const manufacturer = normalizeText(template.manufacturer ?? "");
  const modelNumber = normalizeText(template.modelNumber ?? "");
  const searchTerms = template.searchTerms?.map(normalizeText) ?? [];
  const signalLabels = [...new Set(template.ports.map((p) => normalizeText(SIGNAL_LABELS[p.signalType] ?? p.signalType)))];
  const signalTypes = [...new Set(template.ports.map((p) => normalizeText(p.signalType)))];
  const portLabels = template.ports.map((p) => normalizeText(p.label));

  // Exact phrase hits should outrank token-by-token coincidences.
  if (phrase.length >= 2) {
    if (label === phrase || shortName === phrase) return 260;
    if (includesAtWordBoundary(label, phrase) || (shortName && includesAtWordBoundary(shortName, phrase))) return 220;
    if (searchTerms.some((t) => t === phrase || includesAtWordBoundary(t, phrase))) return 180;
    if (modelNumber === phrase || includesAtWordBoundary(modelNumber, phrase)) return 150;
  }

  // Score each word, then combine
  let totalScore = 0;
  let wordsMatched = 0;

  for (const word of words) {
    let bestWordScore = 0;

    // Label match (highest value — this is the device's name)
    bestWordScore = Math.max(bestWordScore, scoreTextField(label, word, { exact: 110, prefix: 100, contains: 80 }));

    // Short name match — same scoring as full label so curated short names are findable
    bestWordScore = Math.max(bestWordScore, scoreTextField(shortName, word, { exact: 110, prefix: 100, contains: 80 }));

    // Device type match (e.g. "switch", "camera")
    bestWordScore = Math.max(bestWordScore, scoreTextField(deviceType, word, { exact: 75, prefix: 70 }));

    // Search terms (curated aliases)
    if (searchTerms.some((t) => scoreTextField(t, word, { exact: 70, prefix: 65, contains: 55 }) > 0)) {
      bestWordScore = Math.max(bestWordScore, 65);
    }

    // Manufacturer / model number
    bestWordScore = Math.max(bestWordScore, scoreTextField(manufacturer, word, { exact: 45, prefix: 40, contains: 30 }));
    bestWordScore = Math.max(bestWordScore, scoreTextField(modelNumber, word, { exact: 50, prefix: 45, contains: 35 }));

    // Signal type labels ("Ethernet", "SDI", "Dante")
    if (signalLabels.some((s) => scoreTextField(s, word, { exact: 25, prefix: 20 }) > 0)) bestWordScore = Math.max(bestWordScore, 20);
    if (signalTypes.some((s) => scoreTextField(s, word, { exact: 25, prefix: 20 }) > 0)) bestWordScore = Math.max(bestWordScore, 20);

    // Port labels ("SDI IN 1", etc.)
    if (portLabels.some((p) => scoreTextField(p, word, { exact: 15, prefix: 10 }) > 0)) bestWordScore = Math.max(bestWordScore, 10);

    if (bestWordScore > 0) wordsMatched++;
    totalScore += bestWordScore;
  }

  // All words must match something for the result to show at all
  if (wordsMatched < words.length) return 0;

  // Bonus for matching all words (multi-word queries should strongly prefer full matches)
  if (words.length > 1 && wordsMatched === words.length) {
    totalScore += 50;
  }

  return totalScore;
}
