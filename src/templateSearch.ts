import { SIGNAL_LABELS } from "./types";
import type { DeviceTemplate } from "./types";

/** Score how well a template matches a search query. 0 = no match. Higher = better. */
export function scoreTemplate(template: DeviceTemplate, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const label = template.label.toLowerCase();
  const deviceType = template.deviceType.toLowerCase().replace(/-/g, " ");
  const manufacturer = template.manufacturer?.toLowerCase() ?? "";
  const modelNumber = template.modelNumber?.toLowerCase() ?? "";
  const searchTerms = template.searchTerms?.map((t) => t.toLowerCase()) ?? [];
  const signalLabels = [...new Set(template.ports.map((p) => SIGNAL_LABELS[p.signalType].toLowerCase()))];
  const signalTypes = [...new Set(template.ports.map((p) => p.signalType.toLowerCase().replace(/-/g, " ")))];
  const portLabels = template.ports.map((p) => p.label.toLowerCase());

  // Score each word, then combine
  let totalScore = 0;
  let wordsMatched = 0;

  for (const word of words) {
    let bestWordScore = 0;

    // Label match (highest value — this is the device's name)
    if (label.includes(word)) {
      // Bonus for word-boundary match (start of label or after space/punctuation)
      const idx = label.indexOf(word);
      const atBoundary = idx === 0 || /[\s(/-]/.test(label[idx - 1]);
      bestWordScore = Math.max(bestWordScore, atBoundary ? 100 : 80);
    }

    // Device type match (e.g. "switch", "camera")
    if (deviceType.includes(word)) {
      bestWordScore = Math.max(bestWordScore, 70);
    }

    // Search terms (curated aliases)
    if (searchTerms.some((t) => t.includes(word))) {
      bestWordScore = Math.max(bestWordScore, 60);
    }

    // Manufacturer / model number
    if (manufacturer.includes(word)) bestWordScore = Math.max(bestWordScore, 40);
    if (modelNumber.includes(word)) bestWordScore = Math.max(bestWordScore, 40);

    // Signal type labels ("Ethernet", "SDI", "Dante")
    if (signalLabels.some((s) => s.includes(word))) bestWordScore = Math.max(bestWordScore, 20);
    if (signalTypes.some((s) => s.includes(word))) bestWordScore = Math.max(bestWordScore, 20);

    // Port labels ("SDI IN 1", etc.)
    if (portLabels.some((p) => p.includes(word))) bestWordScore = Math.max(bestWordScore, 10);

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
