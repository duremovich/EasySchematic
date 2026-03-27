#!/usr/bin/env npx tsx
/**
 * Headless A* routing parameter tuner.
 * Loads the broadcast CSV, creates a schematic, runs routing with
 * different parameter configurations, and scores each result.
 *
 * Usage: npx tsx scripts/tune-routing.ts
 */

import "./env-shim";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  parseCsv,
  detectColumns,
  extractConnections,
  matchDevices,
  buildImportResult,
} from "../src/csvImport";
import { routeAllEdges, findViolations, ROUTER_PARAMS } from "../src/edgeRouter";
import { ROUTING_PARAMS } from "../src/pathfinding";
import { getBundledTemplates } from "../src/templateApi";
import type { SchematicNode, DeviceNode, DeviceData, ConnectionEdge } from "../src/types";
import type { RoutedEdge } from "../src/edgeRouter";

// ---------- CSV Loading ----------

function loadTestSchematic(): { nodes: SchematicNode[]; edges: ConnectionEdge[] } {
  const csvPath = resolve(__dirname, "../docs/public/examples/broadcast-control-room.csv");
  const csvText = readFileSync(csvPath, "utf-8");
  const parsed = parseCsv(csvText);
  const mapping = detectColumns(parsed.headers);
  const connections = extractConnections(parsed.rows, mapping);
  const templates = getBundledTemplates();
  const matches = matchDevices(connections, templates);
  return buildImportResult(connections, matches);
}

// ---------- Mock React Flow Instance ----------

function createMockRfInstance(nodes: SchematicNode[]) {
  // Pre-compute absolute positions (handle parent offsets)
  const absPositions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    let x = n.position.x;
    let y = n.position.y;
    if (n.parentId) {
      const parent = nodes.find((p) => p.id === n.parentId);
      if (parent) { x += parent.position.x; y += parent.position.y; }
    }
    absPositions.set(n.id, { x, y });
  }

  return {
    getInternalNode(nodeId: string) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return null;
      const abs = absPositions.get(nodeId)!;
      const data = node.type === "device" ? (node as DeviceNode).data as DeviceData : null;
      const ports = data?.ports ?? [];

      // Compute handle positions from port layout
      // DeviceNode: 1px border + 40px header + 9px padding + rows×20px
      // Handle center Y = 60 + portIndex * 20 (relative to node top)
      const nodeWidth = node.measured?.width ?? 180;

      const sourceHandles: { id: string; x: number; y: number; width: number; height: number }[] = [];
      const targetHandles: { id: string; x: number; y: number; width: number; height: number }[] = [];

      const inputPorts = ports.filter((p) => p.direction === "input");
      const outputPorts = ports.filter((p) => p.direction === "output");
      const bidiPorts = ports.filter((p) => p.direction === "bidirectional");
      const maxPaired = Math.max(inputPorts.length, outputPorts.length);

      // Input handles (left side)
      for (let i = 0; i < inputPorts.length; i++) {
        const y = 60 + i * 20;
        targetHandles.push({ id: inputPorts[i].id, x: -5, y: y - 5, width: 10, height: 10 });
      }

      // Output handles (right side)
      for (let i = 0; i < outputPorts.length; i++) {
        const y = 60 + i * 20;
        sourceHandles.push({ id: outputPorts[i].id, x: nodeWidth - 5, y: y - 5, width: 10, height: 10 });
      }

      // Bidirectional handles (both sides, below paired section)
      for (let i = 0; i < bidiPorts.length; i++) {
        const y = 60 + (maxPaired + i) * 20;
        targetHandles.push({ id: `${bidiPorts[i].id}-in`, x: -5, y: y - 5, width: 10, height: 10 });
        sourceHandles.push({ id: `${bidiPorts[i].id}-out`, x: nodeWidth - 5, y: y - 5, width: 10, height: 10 });
      }

      return {
        internals: {
          positionAbsolute: abs,
          handleBounds: {
            source: sourceHandles,
            target: targetHandles,
          },
        },
      };
    },
  };
}

// ---------- Quality Metrics ----------

interface Metrics {
  sharedVerticals: number;
  spacingInconsistency: number;
  turnInconsistency: number;
  crossings: number;
  violations: number;
  signalMixing: number;
  signalClustering: number;
  avgLaneSeparation: number;
  totalTurns: number;
  fallbacks: number;
  score: number;
  avgDetourRatio?: number;
  totalBboxExcess?: number;
  backwardSegments?: number;
}

interface VerticalSeg {
  edgeId: string;
  x: number;
  yMin: number;
  yMax: number;
  signalType?: string;
}

function scoreRouting(
  routed: Record<string, RoutedEdge>,
  edges: ConnectionEdge[],
  nodes: SchematicNode[],
): Metrics {
  // Build node position map for directness calculations
  const nodeAbsPos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    let x = n.position.x, y = n.position.y;
    if (n.parentId) {
      const parent = nodes.find((p) => p.id === n.parentId);
      if (parent) { x += parent.position.x; y += parent.position.y; }
    }
    nodeAbsPos.set(n.id, { x, y });
  }

  const vertSegs: VerticalSeg[] = [];
  let totalTurns = 0;
  let fallbacks = 0;
  let totalDetourRatio = 0;
  let detourCount = 0;
  let backwardSegments = 0;
  let totalBboxExcess = 0;

  const edgeSignalMap = new Map<string, string>();
  for (const e of edges) edgeSignalMap.set(e.id, e.data?.signalType ?? "custom");

  for (const [edgeId, re] of Object.entries(routed)) {
    if (re.turns === "fallback") fallbacks++;

    const edge = edges.find((e) => e.id === edgeId);

    // Count turns
    for (let i = 1; i < re.waypoints.length - 1; i++) {
      const prev = re.waypoints[i - 1];
      const curr = re.waypoints[i];
      const next = re.waypoints[i + 1];
      const d1h = curr.x !== prev.x;
      const d2h = next.x !== curr.x;
      if (d1h !== d2h) totalTurns++;
    }

    // Extract vertical segments
    for (const seg of re.segments) {
      if (seg.axis === "v") {
        vertSegs.push({
          edgeId,
          x: seg.x1,
          yMin: Math.min(seg.y1, seg.y2),
          yMax: Math.max(seg.y1, seg.y2),
          signalType: edgeSignalMap.get(edgeId),
        });
      }
    }

    // --- PATH DIRECTNESS (new) ---
    // Ratio of actual path length to Manhattan distance between source/target
    if (edge && re.waypoints.length >= 2) {
      const srcPos = nodeAbsPos.get(edge.source);
      const tgtPos = nodeAbsPos.get(edge.target);
      if (srcPos && tgtPos) {
        const manhattan = Math.abs(srcPos.x - tgtPos.x) + Math.abs(srcPos.y - tgtPos.y);
        let pathLen = 0;
        for (let i = 1; i < re.waypoints.length; i++) {
          pathLen += Math.abs(re.waypoints[i].x - re.waypoints[i - 1].x) +
                     Math.abs(re.waypoints[i].y - re.waypoints[i - 1].y);
        }
        if (manhattan > 0) {
          totalDetourRatio += pathLen / manhattan;
          detourCount++;
        }

        // --- BOUNDING BOX EXCESS (new) ---
        // How much does the path extend beyond source↔target bounding box?
        const bboxLeft = Math.min(srcPos.x, tgtPos.x) - 60; // allow some margin for stubs
        const bboxRight = Math.max(srcPos.x, tgtPos.x) + 240;
        const bboxTop = Math.min(srcPos.y, tgtPos.y) - 40;
        const bboxBottom = Math.max(srcPos.y, tgtPos.y) + 100;
        for (const wp of re.waypoints) {
          if (wp.x < bboxLeft) totalBboxExcess += bboxLeft - wp.x;
          if (wp.x > bboxRight) totalBboxExcess += wp.x - bboxRight;
          if (wp.y < bboxTop) totalBboxExcess += bboxTop - wp.y;
          if (wp.y > bboxBottom) totalBboxExcess += wp.y - bboxBottom;
        }
      }
    }

    // --- BACKWARD SEGMENTS (new) ---
    // Horizontal segments going right-to-left (against signal flow)
    for (const seg of re.segments) {
      if (seg.axis === "h" && seg.x2 < seg.x1) backwardSegments++;
    }
  }

  const avgDetourRatio = detourCount > 0 ? totalDetourRatio / detourCount : 1;

  // --- Shared verticals ---
  let sharedVerticals = 0;
  for (let i = 0; i < vertSegs.length; i++) {
    for (let j = i + 1; j < vertSegs.length; j++) {
      const a = vertSegs[i], b = vertSegs[j];
      if (a.edgeId === b.edgeId) continue;
      if (Math.abs(a.x - b.x) <= 4) {
        const overlap = Math.min(a.yMax, b.yMax) - Math.max(a.yMin, b.yMin);
        if (overlap > 8) sharedVerticals++;
      }
    }
  }

  // --- Crossings ---
  let crossings = 0;
  const allSegs = Object.entries(routed).flatMap(([edgeId, re]) =>
    re.segments.map((s) => ({ ...s, edgeId })),
  );
  for (let i = 0; i < allSegs.length; i++) {
    for (let j = i + 1; j < allSegs.length; j++) {
      const a = allSegs[i], b = allSegs[j];
      if (a.edgeId === b.edgeId) continue;
      if (a.axis === b.axis) continue;
      const h = a.axis === "h" ? a : b;
      const v = a.axis === "v" ? a : b;
      const hMinX = Math.min(h.x1, h.x2), hMaxX = Math.max(h.x1, h.x2);
      const vMinY = Math.min(v.y1, v.y2), vMaxY = Math.max(v.y1, v.y2);
      if (v.x1 > hMinX && v.x1 < hMaxX && h.y1 > vMinY && h.y1 < vMaxY) crossings++;
    }
  }

  // --- Violations ---
  const violationEdges = findViolations(
    Object.entries(routed).map(([edgeId, re]) => ({
      edgeId,
      segments: re.segments,
      signalType: edgeSignalMap.get(edgeId),
    })),
  );
  const violations = violationEdges.size;

  // --- Composite score ---
  // DIRECTNESS IS KING. A clean crossing beats a messy detour every time.
  const score =
    -200 * (avgDetourRatio - 1) +  // HEAVIEST: penalize detours (ratio > 1 = bad)
    -0.5 * totalBboxExcess +       // paths straying outside source↔target bounds
    -80 * backwardSegments +        // going against signal flow
    -60 * sharedVerticals +         // shared vertical corridors
    -20 * crossings +               // crossings (acceptable if path is direct)
    -15 * violations +              // overlap/weaving
    -1 * totalTurns +               // fewer turns preferred (minor)
    -5 * fallbacks;                 // L-shape fallbacks

  return {
    sharedVerticals,
    spacingInconsistency: 0, // removed — less important than directness
    turnInconsistency: 0,
    crossings,
    violations,
    signalMixing: 0,
    signalClustering: 0,
    avgLaneSeparation: 0,
    totalTurns,
    fallbacks,
    score: Math.round(score),
    // New metrics
    avgDetourRatio: Math.round(avgDetourRatio * 100) / 100,
    totalBboxExcess: Math.round(totalBboxExcess),
    backwardSegments,
  } as Metrics;
}

// ---------- Parameter Ranges ----------

interface ParamConfig {
  // pathfinding.ts
  TURN_PENALTY: number;
  SEPARATION_PX: number;
  CROSS_TYPE_SEPARATION: number;
  PROXIMITY_PENALTY: number;
  SAME_TYPE_PROXIMITY: number;
  CROSSING_PENALTY: number;
  EARLY_TURN_BIAS: number;
  // edgeRouter.ts
  MAX_ITERATIONS: number;
  SEPARATION_THRESHOLD: number;
  EDGE_GAP: number;
  CX_THRESHOLD: number;
  SORT_STRATEGY: number;
}

const RANGES: Record<keyof ParamConfig, [number, number]> = {
  TURN_PENALTY: [50, 300],
  SEPARATION_PX: [8, 40],
  CROSS_TYPE_SEPARATION: [10, 50],
  PROXIMITY_PENALTY: [50, 500],
  SAME_TYPE_PROXIMITY: [5, 80],
  CROSSING_PENALTY: [100, 1000],
  EARLY_TURN_BIAS: [10, 200],
  MAX_ITERATIONS: [1, 8],
  SEPARATION_THRESHOLD: [4, 16],
  EDGE_GAP: [6, 24],
  CX_THRESHOLD: [8, 30],
  SORT_STRATEGY: [0, 2],
};

function randomConfig(): ParamConfig {
  const cfg: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (key === "SORT_STRATEGY") {
      cfg[key] = Math.floor(Math.random() * 3); // 0, 1, 2
    } else if (key === "MAX_ITERATIONS") {
      cfg[key] = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      cfg[key] = Math.round(Math.random() * (max - min) + min);
    }
  }
  return cfg as unknown as ParamConfig;
}

function getDefaults(): ParamConfig {
  return {
    TURN_PENALTY: 100,
    SEPARATION_PX: 16,
    CROSS_TYPE_SEPARATION: 20,
    PROXIMITY_PENALTY: 150,
    SAME_TYPE_PROXIMITY: 20,
    CROSSING_PENALTY: 350,
    EARLY_TURN_BIAS: 50,
    MAX_ITERATIONS: 5,
    SEPARATION_THRESHOLD: 8,
    EDGE_GAP: 12,
    CX_THRESHOLD: 15,
    SORT_STRATEGY: 0,
  };
}

function applyConfig(cfg: ParamConfig) {
  ROUTING_PARAMS.TURN_PENALTY = cfg.TURN_PENALTY;
  ROUTING_PARAMS.SEPARATION_PX = cfg.SEPARATION_PX;
  ROUTING_PARAMS.CROSS_TYPE_SEPARATION = cfg.CROSS_TYPE_SEPARATION;
  ROUTING_PARAMS.PROXIMITY_PENALTY = cfg.PROXIMITY_PENALTY;
  ROUTING_PARAMS.SAME_TYPE_PROXIMITY = cfg.SAME_TYPE_PROXIMITY;
  ROUTING_PARAMS.CROSSING_PENALTY = cfg.CROSSING_PENALTY;
  ROUTING_PARAMS.EARLY_TURN_BIAS = cfg.EARLY_TURN_BIAS;
  ROUTER_PARAMS.MAX_ITERATIONS = cfg.MAX_ITERATIONS;
  ROUTER_PARAMS.SEPARATION_THRESHOLD = cfg.SEPARATION_THRESHOLD;
  ROUTER_PARAMS.EDGE_GAP = cfg.EDGE_GAP;
  ROUTER_PARAMS.CX_THRESHOLD = cfg.CX_THRESHOLD;
  ROUTER_PARAMS.SORT_STRATEGY = cfg.SORT_STRATEGY;
}

// ---------- Main ----------

const SAMPLE_COUNT = 300;

function formatMetrics(m: Metrics): string {
  return [
    `  Score: ${m.score}`,
    `  Avg detour ratio: ${m.avgDetourRatio ?? "?"}x (1.0 = perfectly direct)`,
    `  Bbox excess: ${m.totalBboxExcess ?? 0}px (paths straying outside bounds)`,
    `  Backward segments: ${m.backwardSegments ?? 0}`,
    `  Shared verticals: ${m.sharedVerticals}`,
    `  Crossings: ${m.crossings}`,
    `  Violations: ${m.violations}`,
    `  Total turns: ${m.totalTurns}`,
    `  Fallbacks: ${m.fallbacks}`,
  ].join("\n");
}

function formatConfig(cfg: ParamConfig): string {
  const strategies = ["signal-type→shortest→position", "longest-first", "most-connected-first"];
  return Object.entries(cfg)
    .map(([k, v]) => `  ${k}: ${k === "SORT_STRATEGY" ? `${v} (${strategies[v]})` : v}`)
    .join("\n");
}

// ---------- Load default demo schematic ----------

function loadDemoSchematic(): { nodes: SchematicNode[]; edges: ConnectionEdge[] } {
  const demoPath = resolve(__dirname, "../src/defaultSchematic.json");
  const data = JSON.parse(readFileSync(demoPath, "utf-8"));
  return { nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

// ---------- Run on a test case ----------

function runTest(
  label: string,
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  cfg: ParamConfig,
): Metrics {
  applyConfig(cfg);
  const mock = createMockRfInstance(nodes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routed = routeAllEdges(nodes, edges, mock as any);
  return scoreRouting(routed, edges, nodes);
}

// ---------- Main ----------

async function main() {
  // Load BOTH test cases
  console.log("Loading test schematics...");
  const csv = loadTestSchematic();
  console.log(`  CSV: ${csv.nodes.filter((n) => n.type === "device").length} devices, ${csv.edges.length} edges`);
  const demo = loadDemoSchematic();
  console.log(`  Demo: ${demo.nodes.filter((n) => n.type === "device").length} devices, ${demo.edges.length} edges\n`);

  // Baseline
  console.log("=== BASELINE (current defaults) ===");
  const defaults = getDefaults();
  const csvBaseline = runTest("CSV", csv.nodes, csv.edges, defaults);
  const demoBaseline = runTest("Demo", demo.nodes, demo.edges, defaults);
  console.log("CSV schematic:");
  console.log(formatMetrics(csvBaseline));
  console.log("Demo schematic:");
  console.log(formatMetrics(demoBaseline));
  console.log(`Combined: ${csvBaseline.score + demoBaseline.score}\n`);

  // Random search — score is COMBINED across both test cases
  console.log(`=== RANDOM SEARCH (${SAMPLE_COUNT} samples, scored on BOTH schematics) ===`);
  const results: { config: ParamConfig; csvMetrics: Metrics; demoMetrics: Metrics; combined: number }[] = [];
  const startTime = Date.now();

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const cfg = randomConfig();
    try {
      const csvM = runTest("CSV", csv.nodes, csv.edges, cfg);
      const demoM = runTest("Demo", demo.nodes, demo.edges, cfg);
      results.push({ config: cfg, csvMetrics: csvM, demoMetrics: demoM, combined: csvM.score + demoM.score });
    } catch {
      // Skip failed configs
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${SAMPLE_COUNT} complete (${elapsed}s)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Done: ${results.length} successful runs in ${elapsed}s\n`);

  // Sort by combined score
  results.sort((a, b) => b.combined - a.combined);

  // Top 5
  console.log("=== TOP 5 CONFIGURATIONS ===\n");
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i];
    console.log(`--- #${i + 1} (combined: ${r.combined}) ---`);
    console.log("CSV:");
    console.log(formatMetrics(r.csvMetrics));
    console.log("Demo:");
    console.log(formatMetrics(r.demoMetrics));
    console.log("Parameters:");
    console.log(formatConfig(r.config));
    console.log();
  }

  // Comparison
  const best = results[0];
  const baselineCombined = csvBaseline.score + demoBaseline.score;
  if (best) {
    console.log("=== IMPROVEMENT ===");
    console.log(`Baseline combined: ${baselineCombined}`);
    console.log(`Best combined:     ${best.combined}`);
    console.log(`Improvement:       ${best.combined - baselineCombined > 0 ? "+" : ""}${best.combined - baselineCombined}`);
    console.log();
    console.log("Demo detour ratio: " +
      `${demoBaseline.avgDetourRatio}x → ${best.demoMetrics.avgDetourRatio}x`);
    console.log("Demo crossings: " +
      `${demoBaseline.crossings} → ${best.demoMetrics.crossings}`);
    console.log("Demo backward segs: " +
      `${demoBaseline.backwardSegments} → ${best.demoMetrics.backwardSegments}`);
  }

  // Restore defaults
  applyConfig(getDefaults());
}

main().catch(console.error);
