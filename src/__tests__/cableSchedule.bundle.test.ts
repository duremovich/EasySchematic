import { describe, it, expect } from "vitest";
import { computeCableSchedule } from "../cableSchedule";
import { makeDevice, makeEdge, makePort } from "../routingHarness/fixtures";
import type { SchematicNode, ConnectionEdge } from "../types";

/** One source fanning to N targets; the first `bundledCount` edges carry bundleId "b1". */
function scene(total: number, bundledCount: number) {
  const outs = Array.from({ length: total }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const src = makeDevice({ id: "src", label: "Router", x: 0, y: 0, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges: ConnectionEdge[] = outs.map((p, i) => {
    const tIn = makePort("In", "sdi", "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Display ${i + 1}`, x: 700, y: i * 110, ports: [tIn] });
    nodes.push(tgt);
    return makeEdge({
      id: `e${i}`, source: "src", sourceHandle: p.id, target: `tgt${i}`, targetHandle: tIn.id,
      signalType: "sdi", data: i < bundledCount ? { bundleId: "b1" } : undefined,
    });
  });
  return { nodes, edges };
}

describe("cable schedule + bundles", () => {
  it("a 6-member bundle still emits 6 rows — counts are never collapsed", () => {
    const { nodes, edges } = scene(6, 6);
    const rows = computeCableSchedule(nodes, edges, "sequential", undefined, { b1: { id: "b1", label: "Snake A" } });
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.bundle === "Snake A")).toBe(true);
  });

  it("uses a stable 'Bundle N' name when the bundle has no label", () => {
    const { nodes, edges } = scene(3, 3);
    const rows = computeCableSchedule(nodes, edges, "sequential");
    expect(rows.every((r) => r.bundle === "Bundle 1")).toBe(true);
  });

  it("leaves non-bundled cables blank, and ignores a lone (sub-2) bundle member", () => {
    const { nodes, edges } = scene(3, 1); // only e0 carries bundleId, so <2 members
    const rows = computeCableSchedule(nodes, edges, "sequential", undefined, { b1: { id: "b1" } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.bundle === "")).toBe(true);
  });
});
