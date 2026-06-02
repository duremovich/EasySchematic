/**
 * Region detection for the routing portfolio's region-scoped re-allocation engine.
 *
 * After a global route, the objective (objective.ts) reduces the layout to a scalar, and
 * `computeRoutingMetrics` (scoreRoutes.ts) enumerates the OFFENDERS behind that scalar — which
 * edges weave, which dip into a device body, which run shared verticals. This module clusters those
 * offenders into spatial REGIONS so the re-allocation engine can spend extra search budget on one
 * trouble spot at a time (rip up just that region's corridors, freeze the rest as obstacles, re-pack
 * the neighborhood, accept only if the GLOBAL score improves).
 *
 * This is the foundation step: PURE geometry, no routing change. Given a routed result + the offender
 * lists, it returns regions sorted worst-first. The engine (later) consumes `edgeIds` (what to rip
 * up) and `bbox` (where to focus); `severity` orders which region to attack first.
 *
 * No DOM, no fs. Coordinates are absolute px (the same space `computeRoutingMetrics` works in).
 */

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Region {
  /** Union of the member offending edges' bounding boxes. */
  bbox: BBox;
  /** Offending edges in this region — the rip-up set for a focused re-route. */
  edgeIds: string[];
  /** Weighted offense count; higher = uglier = attack first. Hard-zero offenses dominate. */
  severity: number;
  /** Per-offense-type counts attributed to this region (diagnostics / engine heuristics). */
  offenses: Record<string, number>;
}

/**
 * Severity weight per offender-list key (the keys `computeRoutingMetrics` emits). Mirrors the
 * objective's priority order — hard-zero correctness violations (a route through a device body, or
 * behind its own endpoint) dwarf any cosmetic, then weave ≫ shared/cross-type ≫ everything else — so
 * a region with a body crossing always sorts above a merely-weavy one. Keys absent here contribute 0.
 */
export const SEVERITY_WEIGHTS: Record<string, number> = {
  endpointBodyCrossing: 1000,
  deviceOverlap: 1000,
  fallback: 50,
  nonHorizontalArrival: 3,
  weaving: 5,
  sharedParallel: 3,
  crossTypeSep: 3,
};

/** Default proximity (px) for merging two offending edges into one region by bbox overlap. */
export const DEFAULT_MERGE_MARGIN = 160;

interface ParsedOffense {
  type: string;
  edges: string[]; // 1 (single-edge offense) or 2 (pairwise offense like weaving "a|b")
}

/**
 * Parse the offender record (`{ type: ["edgeId" | "a|b", …] }`) into a flat offense list. Skips the
 * trimming sentinel (`… +N more`) that `computeRoutingMetrics` appends to long lists; an offense is
 * dropped only if NONE of its tokens are present in `routes` (so it can't be located spatially).
 */
function parseOffenses(
  offenders: Record<string, string[]>,
  hasRoute: (edgeId: string) => boolean,
): ParsedOffense[] {
  const out: ParsedOffense[] = [];
  for (const type of Object.keys(offenders)) {
    for (const entry of offenders[type]) {
      if (entry.includes("…") || entry.includes("more")) continue; // trim sentinel
      const edges = entry.split("|").filter((id) => hasRoute(id));
      if (edges.length === 0) continue;
      out.push({ type, edges });
    }
  }
  return out;
}

/** Bounding box of a route's waypoints (null if fewer than 2 points). */
function edgeBBox(waypoints: { x: number; y: number }[]): BBox | null {
  if (!waypoints || waypoints.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of waypoints) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Do two boxes overlap when each is expanded by `margin` on every side? */
function boxesNear(a: BBox, b: BBox, margin: number): boolean {
  return (
    a.minX - margin <= b.maxX &&
    a.maxX + margin >= b.minX &&
    a.minY - margin <= b.maxY &&
    a.maxY + margin >= b.minY
  );
}

function unionBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Cluster routing offenders into spatial regions, worst-first.
 *
 * Two offending edges land in the same region if (a) they co-occur in a pairwise offense (a weave /
 * shared-vertical / cross-type pair is inherently the same trouble spot) or (b) their bounding boxes
 * are within `mergeMargin` of each other. Connected components of that relation are the regions.
 * Single-edge offenses (e.g. an endpoint-body crossing) seed a region on their own and absorb nearby
 * offenders. Each offense is attributed to the region of its edges and its weight added to severity.
 *
 * PURE and deterministic: identical inputs yield identical regions (stable edge-id ordering, stable
 * component numbering). Returns `[]` when there are no locatable offenders.
 */
export function detectRegions(
  routes: Record<string, { waypoints: { x: number; y: number }[] }>,
  offenders: Record<string, string[]>,
  mergeMargin: number = DEFAULT_MERGE_MARGIN,
): Region[] {
  const hasRoute = (id: string) => !!routes[id] && (routes[id].waypoints?.length ?? 0) >= 2;
  const offenses = parseOffenses(offenders, hasRoute);
  if (offenses.length === 0) return [];

  // Unique offending edges with a locatable bbox, in stable (sorted) order.
  const bboxOf = new Map<string, BBox>();
  for (const o of offenses) {
    for (const id of o.edges) {
      if (!bboxOf.has(id)) {
        const bb = edgeBBox(routes[id].waypoints);
        if (bb) bboxOf.set(id, bb);
      }
    }
  }
  const ids = [...bboxOf.keys()].sort();
  if (ids.length === 0) return [];
  const indexOf = new Map(ids.map((id, i) => [id, i] as const));

  // Union-Find over offending edges.
  const parent = ids.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // (a) co-occurrence in a pairwise offense.
  for (const o of offenses) {
    for (let k = 1; k < o.edges.length; k++) {
      const i = indexOf.get(o.edges[0]);
      const j = indexOf.get(o.edges[k]);
      if (i !== undefined && j !== undefined) union(i, j);
    }
  }
  // (b) spatial proximity (bbox overlap within margin). O(n^2) over offenders only — sparse.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (boxesNear(bboxOf.get(ids[i])!, bboxOf.get(ids[j])!, mergeMargin)) union(i, j);
    }
  }

  // Build regions keyed by component root.
  const byRoot = new Map<number, Region>();
  for (let i = 0; i < ids.length; i++) {
    const root = find(i);
    const bb = bboxOf.get(ids[i])!;
    const r = byRoot.get(root);
    if (!r) {
      byRoot.set(root, { bbox: { ...bb }, edgeIds: [ids[i]], severity: 0, offenses: {} });
    } else {
      r.bbox = unionBox(r.bbox, bb);
      r.edgeIds.push(ids[i]);
    }
  }

  // Attribute each offense to the component of its (located) edges and accumulate severity.
  for (const o of offenses) {
    const seed = o.edges.find((id) => indexOf.has(id));
    if (seed === undefined) continue;
    const region = byRoot.get(find(indexOf.get(seed)!))!;
    region.offenses[o.type] = (region.offenses[o.type] ?? 0) + 1;
    region.severity += SEVERITY_WEIGHTS[o.type] ?? 0;
  }

  const regions = [...byRoot.values()];
  for (const r of regions) r.edgeIds.sort();
  // Worst-first; ties broken by edge count then top-left bbox corner for determinism.
  regions.sort(
    (a, b) =>
      b.severity - a.severity ||
      b.edgeIds.length - a.edgeIds.length ||
      a.bbox.minX - b.bbox.minX ||
      a.bbox.minY - b.bbox.minY,
  );
  return regions;
}
