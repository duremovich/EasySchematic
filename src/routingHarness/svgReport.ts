/**
 * Render a routed fixture to a standalone SVG string a human (or Claude, via the
 * Read tool) can open to eyeball routing quality. Devices, rooms, stub boxes, and
 * routed paths are drawn to scale; violating/fallback edges are highlighted red; a
 * legend lists the per-rule metric counts so one glance shows picture + numbers.
 */

import type { SchematicNode, ConnectionEdge } from "../types";
import { waypointsToSvgPath } from "../pathfinding";
import type { RuleReport } from "./metrics";
import { signalColor } from "../typeRegistry";

function absPos(node: SchematicNode, map: Map<string, SchematicNode>) {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = map.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nodeSize(n: SchematicNode): { w: number; h: number } {
  const w = n.measured?.width ?? (n.type === "device" ? 144 : 120);
  const h = n.measured?.height ?? (n.type === "device" ? 48 : 48);
  return { w, h };
}

/** Edge ids the report flags (per-edge offenders + both sides of pair offenders). */
function badEdgeSet(report: RuleReport): Set<string> {
  const bad = new Set<string>();
  for (const [, ids] of Object.entries(report.offenders)) {
    for (const id of ids) {
      if (id.startsWith("…")) continue;
      if (id.includes("|")) id.split("|").forEach((p) => bad.add(p));
      else bad.add(id);
    }
  }
  return bad;
}

export function renderFixtureSvg(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  routes: Record<string, { waypoints: { x: number; y: number }[]; turns?: string }>,
  report: RuleReport,
): string {
  const map = new Map<string, SchematicNode>();
  for (const n of nodes) map.set(n.id, n);
  const bad = badEdgeSet(report);

  // --- bounding box ---
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const n of nodes) {
    if (n.type === "note" || n.type === "annotation" || n.type === "waypoint" || n.type === "bundle-junction") continue;
    const p = absPos(n, map);
    const { w, h } = nodeSize(n);
    grow(p.x, p.y);
    grow(p.x + w, p.y + h);
  }
  for (const e of edges) {
    for (const pt of routes[e.id]?.waypoints ?? []) grow(pt.x, pt.y);
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }
  const margin = 60;
  const vbX = minX - margin;
  const vbY = minY - margin;
  const vbW = maxX - minX + margin * 2;
  const legendH = 180;
  const vbH = maxY - minY + margin * 2 + legendH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" font-family="sans-serif">`,
  );
  parts.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff"/>`);

  // --- rooms (behind everything) ---
  for (const n of nodes) {
    if (n.type !== "room") continue;
    const p = absPos(n, map);
    const { w, h } = nodeSize(n);
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" fill="#f8fafc" stroke="#94a3b8" stroke-width="2" stroke-dasharray="8 6"/>`,
    );
    const label = (n.data as { label?: string })?.label;
    if (label) parts.push(`<text x="${p.x + 8}" y="${p.y + 22}" font-size="18" fill="#64748b">${esc(label)}</text>`);
  }

  // --- devices ---
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const p = absPos(n, map);
    const { w, h } = nodeSize(n);
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="6" fill="#eef2f7" stroke="#475569" stroke-width="1.5"/>`,
    );
    const label = (n.data as { label?: string })?.label ?? n.id;
    parts.push(
      `<text x="${p.x + w / 2}" y="${p.y + 13}" font-size="11" font-weight="600" text-anchor="middle" fill="#1e293b">${esc(String(label).slice(0, 28))}</text>`,
    );
  }

  // --- stub-label boxes ---
  for (const n of nodes) {
    if (n.type !== "stub-label") continue;
    const p = absPos(n, map);
    const { w, h } = nodeSize(n);
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="3" fill="#fff7ed" stroke="#c2410c" stroke-width="1"/>`,
    );
  }

  // --- track guides: faint dashed verticals at each trunk X, so corridor packing
  //     and concentric nesting are eyeball-able against the routed paths ---
  const trunkXs = new Set<number>();
  for (const e of edges) {
    const wps = routes[e.id]?.waypoints ?? [];
    for (let i = 0; i < wps.length - 1; i++) {
      if (wps[i].x === wps[i + 1].x && wps[i].y !== wps[i + 1].y) trunkXs.add(wps[i].x);
    }
  }
  for (const x of trunkXs) {
    parts.push(`<line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="#c7d2fe" stroke-width="0.5" stroke-dasharray="2 5"/>`);
  }

  // --- edges ---
  for (const e of edges) {
    const route = routes[e.id];
    if (!route || route.waypoints.length < 2) continue;
    const isBad = bad.has(e.id);
    const isFallback = typeof route.turns === "string" && /fallback/i.test(route.turns);
    const color = isBad
      ? "#ef4444"
      : e.data?.signalType ? signalColor(e.data.signalType) : "#64748b";
    const width = isBad ? 3 : 1.5;
    const dash = isFallback ? ` stroke-dasharray="6 4"` : "";
    const d = waypointsToSvgPath(route.waypoints);
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash} opacity="0.9"/>`);
    // endpoint dots
    const a = route.waypoints[0];
    const b = route.waypoints[route.waypoints.length - 1];
    parts.push(`<circle cx="${a.x}" cy="${a.y}" r="3" fill="${color}"/>`);
    parts.push(`<circle cx="${b.x}" cy="${b.y}" r="3" fill="${color}"/>`);
  }

  // --- legend ---
  const lx = vbX + 10;
  const ly = maxY + margin + 10;
  parts.push(
    `<rect x="${lx}" y="${ly}" width="${Math.min(vbW - 20, 520)}" height="${legendH - 20}" fill="#0f172a" opacity="0.95" rx="6"/>`,
  );
  const m = report.metrics;
  const lines = [
    `${report.fixture}  —  ${report.deviceCount} devices, ${report.routedCount}/${report.edgeCount} routed${report.overBudget ? "  [OVER BUDGET]" : ""}`,
    `R1 deviceOverlap=${m.deviceOverlapCount}   R3 nonOrthogonal=${m.nonOrthogonalSegments}   unrouted=${m.unroutedEdges}   R2 vertArrivals=${m.nonHorizontalArrivals}`,
    `shared(R5/6)=${m.sharedParallelSegments}   crossings=${m.crossingPairs}   weaving=${m.weavingPairs}   crossType(R11)=${m.crossTypeSepViolations}`,
    `backwardSegs=${m.backwardSegments}   turns(tot/max)=${m.turnsTotal}/${m.turnsMax}   detour(max/mean)=${m.detourRatioMax}/${m.detourRatioMean}   fallback=${m.fallbackCount}`,
    `channelDensity=${m.channelDensity}   distinctTracks=${m.distinctTrackXs}   doglegs=${m.doglegCount}`,
  ];
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${lx + 12}" y="${ly + 26 + i * 26}" font-size="14" fill="#e2e8f0" font-family="monospace">${esc(line)}</text>`,
    );
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}
