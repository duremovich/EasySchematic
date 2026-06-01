/**
 * The single scalar objective for auto-routing quality — LOWER IS BETTER.
 *
 * This is the scoring oracle for the portfolio search: every routing candidate is reduced to one
 * number via `routingScore`, and the search keeps the minimum. It's deliberately a pure function of
 * the metric record that `computeRuleReport` (routingHarness/metrics.ts) already produces, so the
 * harness and (later) the in-worker scorer share one definition of "clean."
 *
 * Weighting rationale (from the routing research + project aesthetics notes):
 *   - HARD-ZERO violations (route through a device, non-orthogonal segment, unrouted edge) must
 *     never be traded for cosmetics — they get an enormous weight so any candidate with one always
 *     loses to a candidate without. They are correctness, not aesthetics.
 *   - WEAVING (a pair of edges crossing each other ≥2× — back-and-forth) is the headline ugliness
 *     and the user's stated complaint; weighted hardest among soft metrics.
 *   - SHARED-PARALLEL (overlapping/co-running segments — "shared verticals worst") and CROSS-TYPE
 *     under-separation rank just below weaving.
 *   - A single clean ORTHOGONAL CROSSING reads fine (graph-drawing literature) — weighted light, so
 *     the search doesn't contort a layout to shave one right-angle crossing at the cost of a weave.
 *   - NON-HORIZONTAL ARRIVALS, BACKWARD SEGMENTS, BENDS (turns), DETOUR (wire length), and FALLBACK
 *     routes get moderate weights.
 *
 * Diagnostic-only metrics (channelDensity, distinctTrackXs, doglegCount) are NOT scored.
 */

export interface ObjectiveWeights {
  /** Multiplier applied to every hard-zero violation (device overlap, non-orthogonal, unrouted). */
  hardZero: number;
  weavingPairs: number;
  sharedParallelSegments: number;
  crossTypeSepViolations: number;
  crossingPairs: number;
  nonHorizontalArrivals: number;
  backwardSegments: number;
  fallbackCount: number;
  turnsTotal: number;
  detourRatioMean: number;
  detourRatioMax: number;
}

/**
 * Default weights. `hardZero` is huge so correctness dominates all cosmetics; among soft metrics
 * weave ≫ shared/cross-type ≫ plain crossing, matching the research. Tunable — Phase 0 calibrates
 * these against rendered PNGs.
 */
export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  hardZero: 1_000_000,
  weavingPairs: 5,
  sharedParallelSegments: 3,
  crossTypeSepViolations: 3,
  crossingPairs: 1,
  nonHorizontalArrivals: 3,
  backwardSegments: 2,
  fallbackCount: 50,
  turnsTotal: 0.1,
  detourRatioMean: 10,
  detourRatioMax: 2,
};

/** Metrics that must be exactly 0 for a correct route; any nonzero is multiplied by `hardZero`. */
const HARD_ZERO_KEYS = ["deviceOverlapCount", "nonOrthogonalSegments", "unroutedEdges"] as const;

type Metrics = Record<string, number>;
const num = (m: Metrics, k: string) => m[k] ?? 0;

/**
 * Per-term contribution to the score (for debugging / display). Sums to `routingScore`.
 * Keys are the weight names plus `hardZero` (the combined hard-zero contribution).
 */
export function scoreBreakdown(metrics: Metrics, weights: ObjectiveWeights = DEFAULT_WEIGHTS): Record<string, number> {
  const hardZeroCount = HARD_ZERO_KEYS.reduce((s, k) => s + num(metrics, k), 0);
  return {
    hardZero: hardZeroCount * weights.hardZero,
    weavingPairs: num(metrics, "weavingPairs") * weights.weavingPairs,
    sharedParallelSegments: num(metrics, "sharedParallelSegments") * weights.sharedParallelSegments,
    crossTypeSepViolations: num(metrics, "crossTypeSepViolations") * weights.crossTypeSepViolations,
    crossingPairs: num(metrics, "crossingPairs") * weights.crossingPairs,
    nonHorizontalArrivals: num(metrics, "nonHorizontalArrivals") * weights.nonHorizontalArrivals,
    backwardSegments: num(metrics, "backwardSegments") * weights.backwardSegments,
    fallbackCount: num(metrics, "fallbackCount") * weights.fallbackCount,
    turnsTotal: num(metrics, "turnsTotal") * weights.turnsTotal,
    detourRatioMean: num(metrics, "detourRatioMean") * weights.detourRatioMean,
    detourRatioMax: num(metrics, "detourRatioMax") * weights.detourRatioMax,
  };
}

/**
 * Reduce a metric record to a single scalar to MINIMIZE. A lower score is a cleaner routing.
 * Deterministic and pure — identical metrics always yield an identical score.
 */
export function routingScore(metrics: Metrics, weights: ObjectiveWeights = DEFAULT_WEIGHTS): number {
  const b = scoreBreakdown(metrics, weights);
  let total = 0;
  for (const k in b) total += b[k];
  return total;
}
