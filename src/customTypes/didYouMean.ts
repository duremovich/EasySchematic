/**
 * Guardrail 1: "did you mean" before create. A fuzzy match over the ids,
 * labels and aliases of every built-in and community type of a kind, so a
 * moderator about to mint "rs232-box" sees what already covers it.
 *
 * Deliberately simple and dependency-free: exact compact match, typo-range
 * edit distance, and token overlap scored from both sides; best per field,
 * best field per candidate. Shown inline as suggestions — never a blocker.
 */
import { DEVICE_TYPE_ALIASES, DEVICE_TYPE_LABELS, DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import type { CustomTypeKind, CustomTypeRecord } from "./model";

export type TypeSource = "built-in" | "community";

export interface TypeCandidate {
  kind: CustomTypeKind;
  id: string;
  label: string;
  source: TypeSource;
  /** Other spellings that should find this type. */
  aliases?: string[];
  retired?: boolean;
  /** Device types: the category, for display. */
  category?: string;
}

export interface TypeSuggestion extends TypeCandidate {
  /** 0–1; 1 is an exact match after normalisation. */
  score: number;
  /** The id, label or alias that matched best. */
  matched: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokensOf(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function tokenMatches(q: string, targetTokens: string[], targetCompact: string): boolean {
  for (const t of targetTokens) {
    if (t === q) return true;
    if (q.length >= 4 && t.length >= 4 && levenshtein(q, t) <= 1) return true;
    if (q.length >= 3 && t.length >= 3 && (t.startsWith(q) || q.startsWith(t))) return true;
  }
  // "rs232" against "RS-232 Converter" (tokens rs / 232): look in the compact form.
  return q.length >= 3 && targetCompact.includes(q);
}

/** Similarity of a query to one target string, 0–1. Exported for tests. */
export function typeSimilarity(query: string, target: string): number {
  const qTokens = tokensOf(query);
  const tTokens = tokensOf(target);
  const qc = qTokens.join("");
  const tc = tTokens.join("");
  if (!qc || !tc) return 0;
  if (qc === tc) return 1;

  // Edit distance only counts at typo range: a long shared prefix
  // ("wireless-video" vs "wireless-dmx-node") is not similarity.
  const editRatio = 1 - levenshtein(qc, tc) / Math.max(qc.length, tc.length);
  const typoScore = editRatio >= 0.75 ? editRatio : 0;

  // Token overlap from both sides, weighted by token length so "rs232"
  // outweighs "box": how much of the query the target covers (counted double)
  // and how much of the target the query covers.
  const coverage = (from: string[], to: string[], toCompact: string) => {
    const total = from.reduce((n, t) => n + t.length, 0);
    let hit = 0;
    for (const t of from) if (tokenMatches(t, to, toCompact)) hit += t.length;
    return total ? hit / total : 0;
  };
  const covQ = coverage(qTokens, tTokens, tc);
  const covT = coverage(tTokens, qTokens, qc);
  const tokenScore = (0.9 * (2 * covQ + covT)) / 3;

  return Math.max(typoScore, tokenScore);
}

export interface SuggestOptions {
  /** Drop suggestions below this score. Default 0.4. */
  minScore?: number;
  /** Maximum suggestions returned. Default 5. */
  limit?: number;
  /** Include retired community types (flagged). Default true — reviving beats duplicating. */
  includeRetired?: boolean;
}

/** Ranked "did you mean" suggestions for a proposed label and/or id. */
export function suggestSimilarTypes(
  query: string | string[],
  candidates: readonly TypeCandidate[],
  opts: SuggestOptions = {},
): TypeSuggestion[] {
  const { minScore = 0.4, limit = 5, includeRetired = true } = opts;
  const queries = (Array.isArray(query) ? query : [query]).filter((q) => normalize(q));
  if (!queries.length) return [];
  const out: TypeSuggestion[] = [];
  for (const c of candidates) {
    if (c.retired && !includeRetired) continue;
    let best = 0;
    let matched = c.id;
    for (const field of [c.id, c.label, ...(c.aliases ?? [])]) {
      for (const q of queries) {
        const s = typeSimilarity(q, field);
        if (s > best) {
          best = s;
          matched = field;
        }
      }
    }
    if (best >= minScore) out.push({ ...c, score: Math.round(best * 1000) / 1000, matched });
  }
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return out.slice(0, limit);
}

/** Every device type a moderator could mean: built-ins (with their alias spellings) + community. */
export function deviceTypeCandidates(community: readonly CustomTypeRecord[]): TypeCandidate[] {
  const aliasesByTarget = new Map<string, string[]>();
  for (const [alias, target] of Object.entries(DEVICE_TYPE_ALIASES)) {
    aliasesByTarget.set(target, [...(aliasesByTarget.get(target) ?? []), alias]);
  }
  const out: TypeCandidate[] = Object.entries(DEVICE_TYPE_TO_CATEGORY).map(([id, category]) => ({
    kind: "device" as const,
    id,
    label: DEVICE_TYPE_LABELS[id] ?? id,
    source: "built-in" as const,
    category,
    aliases: aliasesByTarget.get(id),
  }));
  for (const r of community) {
    if (r.kind !== "device") continue;
    const category = typeof r.data?.category === "string" ? r.data.category : undefined;
    out.push({ kind: "device", id: r.id, label: r.label, source: "community", category, retired: r.status === "retired" });
  }
  return out;
}
