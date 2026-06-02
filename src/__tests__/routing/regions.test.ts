import { describe, it, expect } from "vitest";
import { detectRegions, SEVERITY_WEIGHTS } from "../../routing/regions";

/**
 * Region detection is the foundation of the region-scoped re-allocation engine: it clusters the
 * objective's offenders into spatial trouble spots so a focused re-route can rip up one neighborhood
 * at a time. These tests pin its clustering, severity ordering, bbox union, and pure determinism.
 */

/** Build a straight 2-point route between two corners (enough to give it a bbox). */
const seg = (x1: number, y1: number, x2: number, y2: number) => ({ waypoints: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });

describe("detectRegions", () => {
  it("returns no regions when there are no offenders", () => {
    expect(detectRegions({ e1: seg(0, 0, 100, 0) }, {})).toEqual([]);
  });

  it("groups two far-apart trouble spots into two regions", () => {
    const routes = {
      a1: seg(0, 0, 50, 50),
      a2: seg(10, 10, 60, 60),
      b1: seg(5000, 5000, 5050, 5050),
      b2: seg(5010, 5010, 5060, 5060),
    };
    const offenders = { weaving: ["a1|a2", "b1|b2"] };
    const regions = detectRegions(routes, offenders);
    expect(regions).toHaveLength(2);
    for (const r of regions) expect(r.edgeIds.length).toBe(2);
  });

  it("merges a pairwise offense's two edges into one region even if their bboxes are far apart", () => {
    // A weave pair is the SAME trouble spot by definition — co-occurrence unions them regardless of
    // the merge margin.
    const routes = { a: seg(0, 0, 10, 10), b: seg(9000, 9000, 9010, 9010) };
    const regions = detectRegions(routes, { weaving: ["a|b"] }, 1);
    expect(regions).toHaveLength(1);
    expect(regions[0].edgeIds).toEqual(["a", "b"]);
  });

  it("merges spatially-close offenders that share no pairwise offense", () => {
    // Two single-edge endpoint-body crossings whose boxes are within the margin → one region.
    const routes = { a: seg(0, 0, 20, 20), b: seg(30, 30, 50, 50) };
    const regions = detectRegions(routes, { endpointBodyCrossing: ["a", "b"] }, 160);
    expect(regions).toHaveLength(1);
    expect(regions[0].edgeIds).toEqual(["a", "b"]);
  });

  it("keeps far-apart single-edge offenders in separate regions", () => {
    const routes = { a: seg(0, 0, 20, 20), b: seg(5000, 5000, 5020, 5020) };
    const regions = detectRegions(routes, { endpointBodyCrossing: ["a", "b"] }, 160);
    expect(regions).toHaveLength(2);
  });

  it("orders regions worst-first by weighted severity (hard-zero dominates)", () => {
    const routes = {
      // Region H: a single endpoint-body crossing (hard-zero).
      h: seg(0, 0, 20, 20),
      // Region W: a big pile of weaves, far away.
      w1: seg(9000, 9000, 9050, 9050),
      w2: seg(9010, 9010, 9060, 9060),
      w3: seg(9020, 9020, 9070, 9070),
    };
    const offenders = {
      endpointBodyCrossing: ["h"],
      weaving: ["w1|w2", "w1|w3", "w2|w3"],
    };
    const regions = detectRegions(routes, offenders);
    expect(regions).toHaveLength(2);
    // Hard-zero region first despite the other having more offenses.
    expect(regions[0].edgeIds).toEqual(["h"]);
    expect(regions[0].severity).toBe(SEVERITY_WEIGHTS.endpointBodyCrossing);
    expect(regions[1].severity).toBe(3 * SEVERITY_WEIGHTS.weaving);
  });

  it("region bbox is the union of its member edge boxes; offense counts are attributed", () => {
    const routes = { a: seg(0, 0, 100, 40), b: seg(80, 20, 160, 90) };
    const regions = detectRegions(routes, { weaving: ["a|b"], sharedParallel: ["a|b"] });
    expect(regions).toHaveLength(1);
    expect(regions[0].bbox).toEqual({ minX: 0, minY: 0, maxX: 160, maxY: 90 });
    expect(regions[0].offenses).toEqual({ weaving: 1, sharedParallel: 1 });
  });

  it("skips the '… +N more' trim sentinel and unlocatable edges", () => {
    const routes = { a: seg(0, 0, 20, 20), b: seg(10, 10, 30, 30) };
    const regions = detectRegions(routes, {
      weaving: ["a|b", "a|ghost", "… +12 more"],
    });
    expect(regions).toHaveLength(1);
    // "ghost" has no route → that offense keeps only the locatable edge; no crash.
    expect(regions[0].edgeIds).toEqual(["a", "b"]);
  });

  it("is deterministic — identical input yields identical regions", () => {
    const routes = {
      a: seg(0, 0, 20, 20), b: seg(15, 15, 40, 40), c: seg(5000, 0, 5020, 20),
    };
    const offenders = { weaving: ["a|b"], endpointBodyCrossing: ["c"] };
    expect(detectRegions(routes, offenders)).toEqual(detectRegions(routes, offenders));
  });
});
