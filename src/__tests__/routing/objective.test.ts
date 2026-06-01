import { describe, it, expect } from "vitest";
import { routingScore, scoreBreakdown, DEFAULT_WEIGHTS } from "../../routing/objective";

const clean = { weavingPairs: 0, crossingPairs: 0, sharedParallelSegments: 0, turnsTotal: 0, detourRatioMean: 1 };

describe("routingScore", () => {
  it("is deterministic and pure", () => {
    const m = { weavingPairs: 3, crossingPairs: 10, turnsTotal: 20, detourRatioMean: 1.2 };
    expect(routingScore(m)).toBe(routingScore({ ...m }));
  });

  it("scoreBreakdown sums to routingScore", () => {
    const m = { deviceOverlapCount: 1, weavingPairs: 4, crossingPairs: 7, nonHorizontalArrivals: 2, turnsTotal: 30, detourRatioMean: 1.3, detourRatioMax: 2.1, fallbackCount: 1, backwardSegments: 3, sharedParallelSegments: 5, crossTypeSepViolations: 2 };
    const b = scoreBreakdown(m);
    const sum = Object.values(b).reduce((s, v) => s + v, 0);
    expect(routingScore(m)).toBeCloseTo(sum, 6);
  });

  it("a clean routing scores far lower than a weavy one", () => {
    const weavy = { ...clean, weavingPairs: 10, crossingPairs: 40 };
    expect(routingScore(clean)).toBeLessThan(routingScore(weavy));
  });

  it("hard-zero violations dominate: any device overlap loses to a clean route, regardless of cosmetics", () => {
    // Candidate A: one device overlap but otherwise perfect.
    const withOverlap = { deviceOverlapCount: 1 };
    // Candidate B: NO hard-zero violation but a cosmetically awful route (tons of weaves/crossings).
    const uglyButValid = { weavingPairs: 500, crossingPairs: 1000, turnsTotal: 5000, sharedParallelSegments: 500 };
    expect(routingScore(withOverlap)).toBeGreaterThan(routingScore(uglyButValid));
  });

  it("all three hard-zero metrics are penalized", () => {
    for (const k of ["deviceOverlapCount", "nonOrthogonalSegments", "unroutedEdges"]) {
      expect(routingScore({ [k]: 1 })).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.hardZero);
    }
  });

  it("weaving is weighted heavier than a plain orthogonal crossing", () => {
    expect(routingScore({ weavingPairs: 1 })).toBeGreaterThan(routingScore({ crossingPairs: 1 }));
  });

  it("respects custom weights", () => {
    const m = { crossingPairs: 10 };
    const heavy = { ...DEFAULT_WEIGHTS, crossingPairs: 100 };
    expect(routingScore(m, heavy)).toBe(1000);
  });

  it("treats absent metrics as zero", () => {
    expect(routingScore({})).toBe(0);
  });
});
