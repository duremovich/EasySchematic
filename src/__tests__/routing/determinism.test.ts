import { describe, it, expect } from "vitest";
import { syntheticFixtures } from "../../routingHarness/syntheticFixtures";
import { routeFixture } from "../../routingHarness/route";

/** Serialize a routing result to a comparable string (edge id → svg path). */
function digest(routes: Record<string, { svgPath?: string }>): string {
  return Object.keys(routes)
    .sort()
    .map((id) => `${id}:${routes[id]?.svgPath ?? ""}`)
    .join("|");
}

describe("routing determinism (op-count budget, no wall-clock)", () => {
  // A few representative synthetic fixtures (fan, crossings, mixed signal).
  const picks = ["fan-out-dense", "crossing-grid", "mixed-signal-corridor", "bundle-6-same-pair"];
  const fixtures = syntheticFixtures().filter((f) => picks.includes(f.name));

  it("covers the picked fixtures", () => {
    expect(fixtures.length).toBe(picks.length);
  });

  for (const fx of fixtures) {
    it(`${fx.name} routes byte-identically across repeated runs`, () => {
      const a = routeFixture(fx.nodes, fx.edges, { bundles: fx.bundles });
      const b = routeFixture(fx.nodes, fx.edges, { bundles: fx.bundles });
      const c = routeFixture(fx.nodes, fx.edges, { bundles: fx.bundles });
      expect(digest(b.routes)).toBe(digest(a.routes));
      expect(digest(c.routes)).toBe(digest(a.routes));
    });
  }
});
