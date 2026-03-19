import { describe, it, expect } from "vitest";
import {
  orthogonalize,
  extractSegments,
  findViolations,
  buildPenaltyZones,
} from "../edgeRouter";
import {
  buildObstacles,
  simplifyWaypoints,
  waypointsToSvgPath,
  buildSparseGrid,
  astarOrthogonal,
  computeEdgePath,
} from "../pathfinding";

// ---------- orthogonalize ----------

describe("orthogonalize", () => {
  it("returns same points when already orthogonal", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }];
    expect(orthogonalize(pts)).toEqual(pts);
  });

  it("inserts bend for diagonal step", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 50 }];
    const result = orthogonalize(pts);
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it("handles single point", () => {
    expect(orthogonalize([{ x: 5, y: 5 }])).toEqual([{ x: 5, y: 5 }]);
  });
});

// ---------- extractSegments ----------

describe("extractSegments", () => {
  it("extracts horizontal and vertical segments", () => {
    const wp = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    const segs = extractSegments(wp);
    expect(segs).toHaveLength(2);
    expect(segs[0].axis).toBe("h");
    expect(segs[1].axis).toBe("v");
  });

  it("skips zero-length segments", () => {
    const wp = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const segs = extractSegments(wp);
    expect(segs).toHaveLength(1);
  });
});

// ---------- findViolations ----------

describe("findViolations", () => {
  it("detects overlapping parallel segments", () => {
    const edges = [
      {
        edgeId: "a",
        segments: [{ x1: 50, y1: 0, x2: 50, y2: 100, axis: "v" as const }],
      },
      {
        edgeId: "b",
        segments: [{ x1: 52, y1: 10, x2: 52, y2: 90, axis: "v" as const }],
      },
    ];
    const bad = findViolations(edges);
    expect(bad.has("a")).toBe(true);
    expect(bad.has("b")).toBe(true);
  });

  it("does not flag well-separated parallel segments", () => {
    const edges = [
      {
        edgeId: "a",
        segments: [{ x1: 50, y1: 0, x2: 50, y2: 100, axis: "v" as const }],
      },
      {
        edgeId: "b",
        segments: [{ x1: 70, y1: 0, x2: 70, y2: 100, axis: "v" as const }],
      },
    ];
    const bad = findViolations(edges);
    expect(bad.size).toBe(0);
  });

  it("flags weaving (same pair crossing 2+ times)", () => {
    const edges = [
      {
        edgeId: "a",
        segments: [
          { x1: 0, y1: 10, x2: 100, y2: 10, axis: "h" as const },
          { x1: 0, y1: 30, x2: 100, y2: 30, axis: "h" as const },
        ],
      },
      {
        edgeId: "b",
        segments: [{ x1: 50, y1: 0, x2: 50, y2: 50, axis: "v" as const }],
      },
    ];
    const bad = findViolations(edges);
    expect(bad.has("a")).toBe(true);
    expect(bad.has("b")).toBe(true);
  });
});

// ---------- buildPenaltyZones ----------

describe("buildPenaltyZones", () => {
  it("creates zones from edge segments", () => {
    const goodEdges = [
      {
        segments: [{ x1: 50, y1: 0, x2: 50, y2: 100, axis: "v" as const }],
        signalType: "sdi",
      },
    ];
    const zones = buildPenaltyZones(goodEdges);
    expect(zones).toHaveLength(1);
    expect(zones[0].axis).toBe("v");
    expect(zones[0].coordinate).toBe(50);
    expect(zones[0].signalType).toBe("sdi");
  });
});

// ---------- buildObstacles ----------

describe("buildObstacles", () => {
  it("creates padded rects for device nodes", () => {
    const nodes = [
      { id: "n1", position: { x: 100, y: 100 }, measured: { width: 180, height: 60 }, type: "device" },
    ];
    const getAbsPos = (n: typeof nodes[number]) => n.position;
    const { rects } = buildObstacles(nodes, [], getAbsPos);
    expect(rects).toHaveLength(1);
    expect(rects[0].left).toBe(80); // 100 - 20 PAD
    expect(rects[0].top).toBe(80);
    expect(rects[0].right).toBe(300); // 100 + 180 + 20
    expect(rects[0].bottom).toBe(180); // 100 + 60 + 20
  });

  it("skips room nodes", () => {
    const nodes = [
      { id: "r1", position: { x: 0, y: 0 }, measured: { width: 500, height: 500 }, type: "room" },
    ];
    const getAbsPos = (n: typeof nodes[number]) => n.position;
    const { rects } = buildObstacles(nodes, [], getAbsPos);
    expect(rects).toHaveLength(0);
  });

  it("excludes specified node IDs", () => {
    const nodes = [
      { id: "n1", position: { x: 100, y: 100 }, measured: { width: 180, height: 60 }, type: "device" },
      { id: "n2", position: { x: 400, y: 100 }, measured: { width: 180, height: 60 }, type: "device" },
    ];
    const getAbsPos = (n: typeof nodes[number]) => n.position;
    const { rects } = buildObstacles(nodes, ["n1"], getAbsPos);
    expect(rects).toHaveLength(1);
  });
});

// ---------- simplifyWaypoints ----------

describe("simplifyWaypoints", () => {
  it("removes collinear points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = simplifyWaypoints(pts);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it("keeps bend points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(simplifyWaypoints(pts)).toEqual(pts);
  });
});

// ---------- waypointsToSvgPath ----------

describe("waypointsToSvgPath", () => {
  it("generates M-L for two points", () => {
    const path = waypointsToSvgPath([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(path).toBe("M 0 0 L 100 0");
  });

  it("generates rounded corners for three+ points", () => {
    const path = waypointsToSvgPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(path).toContain("Q");
  });
});

// ---------- A* pathfinding ----------

describe("astarOrthogonal", () => {
  it("finds a straight horizontal path with no obstacles", () => {
    const grid = buildSparseGrid(0, 0, 200, 0, []);
    const result = astarOrthogonal(grid, 0, 0, 200, 0, []);
    expect(result).not.toBeNull();
    expect(result!.path[0]).toEqual({ x: 0, y: 0 });
    expect(result!.path[result!.path.length - 1]).toEqual({ x: 200, y: 0 });
  });

  it("routes around an obstacle", () => {
    const obstacle = { left: 80, top: -30, right: 120, bottom: 30 };
    const grid = buildSparseGrid(0, 0, 200, 0, [obstacle]);
    const result = astarOrthogonal(grid, 0, 0, 200, 0, [obstacle]);
    expect(result).not.toBeNull();
    // Path should not pass through the obstacle
    for (const pt of result!.path) {
      const inside =
        pt.x >= obstacle.left &&
        pt.x <= obstacle.right &&
        pt.y >= obstacle.top &&
        pt.y <= obstacle.bottom;
      expect(inside).toBe(false);
    }
  });
});

// ---------- computeEdgePath ----------

describe("computeEdgePath", () => {
  it("returns straight line for aligned handles", () => {
    const result = computeEdgePath(0, 50, 200, 50, [], 0);
    expect(result).not.toBeNull();
    expect(result!.turns).toBe("straight");
    expect(result!.waypoints).toHaveLength(2);
  });

  it("routes around obstacle between handles", () => {
    const obs = [{ left: 80, top: 20, right: 120, bottom: 80 }];
    const result = computeEdgePath(0, 50, 200, 50, obs, 0);
    expect(result).not.toBeNull();
    // Should have more than 2 waypoints (not a straight line through obstacle)
    expect(result!.waypoints.length).toBeGreaterThan(2);
  });
});
