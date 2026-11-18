/**
 * Per-connection line width (#415): `data.strokeWidth` is set through the same store
 * actions the context menu (patchEdgeData) and the bulk Edit-connections panel
 * (batchPatchEdgeData) call, and has to survive save/load, copy/paste and stubbing the
 * way lineStyle does. Legacy hand-edited widths (top-level `edge.strokeWidth`, or a
 * non-default `edge.style.strokeWidth`) are adopted on load.
 *
 * The store reads editor preferences from localStorage at import time, so a minimal
 * in-memory localStorage is installed before the store is imported.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fixture from "../testSchematic/schematic.json";
import { CURRENT_SCHEMA_VERSION, migrateSchematic } from "../migrations";
import {
  adoptLegacyStrokeWidth,
  clampLineWidth,
  effectiveLineWidth,
  lineWidthPatchValue,
  lineWidthToDxfLineweight,
} from "../lineWidth";
import type { ConnectionEdge, SchematicFile, SchematicNode } from "../types";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

let useSchematicStore: typeof import("../store")["useSchematicStore"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as { crypto?: unknown }).crypto = {
      randomUUID: () => "test-" + Math.random().toString(36).slice(2),
    };
  }
  ({ useSchematicStore } = await import("../store"));
});

const file = fixture as unknown as SchematicFile;
const state = () => useSchematicStore.getState();
const edge = (id: string) => state().edges.find((e) => e.id === id)!;

beforeEach(() => {
  useSchematicStore.setState({
    nodes: structuredClone(file.nodes) as SchematicNode[],
    edges: structuredClone(file.edges) as ConnectionEdge[],
  });
});

describe("lineWidth helpers", () => {
  it("clamps to 1–8 whole px and rejects junk", () => {
    expect(clampLineWidth(6)).toBe(6);
    expect(clampLineWidth(10)).toBe(8);
    expect(clampLineWidth(0)).toBe(1);
    expect(clampLineWidth(3.4)).toBe(3);
    expect(clampLineWidth("5")).toBe(5);
    expect(clampLineWidth("wide")).toBeUndefined();
    expect(clampLineWidth(Number.NaN)).toBeUndefined();
    expect(clampLineWidth(undefined)).toBeUndefined();
  });

  it("defaults to 2px, honours the override, and pins direct attach to its hairline", () => {
    expect(effectiveLineWidth({})).toBe(2);
    expect(effectiveLineWidth({ strokeWidth: 6 })).toBe(6);
    expect(effectiveLineWidth({ strokeWidth: 6, directAttach: true })).toBe(1);
  });

  it("stores the default as absent", () => {
    expect(lineWidthPatchValue(2)).toBeUndefined();
    expect(lineWidthPatchValue(5)).toBe(5);
  });

  it("maps widths onto standard DXF lineweights, default staying 0.25mm", () => {
    expect(lineWidthToDxfLineweight(2)).toBe(25);
    const standard = new Set([0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211]);
    let prev = 0;
    for (let w = 1; w <= 8; w++) {
      const lw = lineWidthToDxfLineweight(w);
      expect(standard.has(lw)).toBe(true);
      expect(lw).toBeGreaterThan(prev);
      prev = lw;
    }
  });
});

describe("setting a connection's line width", () => {
  it("patchEdgeData (context menu) sets it, and the default clears it", () => {
    state().patchEdgeData("edge-1", { strokeWidth: lineWidthPatchValue(6) });
    expect(edge("edge-1").data?.strokeWidth).toBe(6);
    state().patchEdgeData("edge-1", { strokeWidth: lineWidthPatchValue(2) });
    expect(edge("edge-1").data && "strokeWidth" in edge("edge-1").data!).toBe(false);
  });

  it("survives a colour change (which rewrites edge.style)", () => {
    state().patchEdgeData("edge-1", { strokeWidth: 5 });
    state().patchEdgeData("edge-1", { color: "#ff0000" });
    expect(edge("edge-1").data?.strokeWidth).toBe(5);
    expect(effectiveLineWidth(edge("edge-1").data)).toBe(5);
  });

  it("batchPatchEdgeData (bulk Edit connections panel) sets it on every selected connection", () => {
    state().batchPatchEdgeData(["edge-1", "edge-3", "edge-5"].map((id) => ({ edgeId: id, patch: { strokeWidth: 4 } })));
    expect(["edge-1", "edge-3", "edge-5"].map((id) => edge(id).data?.strokeWidth)).toEqual([4, 4, 4]);
    expect(edge("edge-2").data?.strokeWidth).toBeUndefined();
  });

  it("is undone with Ctrl+Z", () => {
    state().patchEdgeData("edge-1", { strokeWidth: 7 });
    state().undo();
    expect(edge("edge-1").data?.strokeWidth).toBeUndefined();
  });
});

describe("persistence", () => {
  it("round-trips through File save/open (exportToJSON → importFromJSON)", () => {
    state().patchEdgeData("edge-1", { strokeWidth: 6 });
    const saved = JSON.parse(JSON.stringify(state().exportToJSON())) as SchematicFile;
    expect(saved.edges.find((e) => e.id === "edge-1")?.data?.strokeWidth).toBe(6);

    useSchematicStore.setState({ edges: [] });
    state().importFromJSON(saved);
    expect(edge("edge-1").data?.strokeWidth).toBe(6);
    expect(edge("edge-3").data?.strokeWidth).toBeUndefined();
  });

  it("round-trips through autosave (saveToLocalStorage → loadFromLocalStorage)", () => {
    state().patchEdgeData("edge-3", { strokeWidth: 8 });
    state().saveToLocalStorage();
    useSchematicStore.setState({ edges: [] });
    state().loadFromLocalStorage();
    expect(edge("edge-3").data?.strokeWidth).toBe(8);
  });
});

describe("copy / paste", () => {
  it("a pasted connection keeps its line width", () => {
    const e1 = edge("edge-1");
    state().patchEdgeData("edge-1", { strokeWidth: 6 });
    useSchematicStore.setState({
      nodes: state().nodes.map((n) => ({ ...n, selected: n.id === e1.source || n.id === e1.target })),
    });
    const before = new Set(state().edges.map((e) => e.id));
    state().copySelected();
    state().pasteClipboard();
    const pasted = state().edges.filter((e) => !before.has(e.id));
    // Paste re-keys devices and ports, so find the copy by its endpoint devices' labels.
    const labelOf = (id: string) => (state().nodes.find((n) => n.id === id)?.data as { label?: string })?.label;
    const twin = pasted.find(
      (e) => labelOf(e.source) === labelOf(e1.source) && labelOf(e.target) === labelOf(e1.target),
    );
    expect(pasted.length).toBeGreaterThan(0);
    expect(twin).toBeDefined();
    expect(twin!.data?.strokeWidth).toBe(6);
  });
});

describe("stubbing", () => {
  it("both stub legs keep the width, and showing it in full keeps it", () => {
    state().patchEdgeData("edge-1", { strokeWidth: 5 });
    state().convertEdgesToStubs(["edge-1"]);
    const legs = state().edges.filter((e) => e.data?.linkedConnectionId);
    expect(legs.length).toBe(2);
    expect(legs.map((e) => e.data?.strokeWidth)).toEqual([5, 5]);
    state().collapseStubsForEdges([legs[0].id]);
    const back = state().edges.find((e) => e.source === "device-1" && e.sourceHandle === "lc-out-1");
    expect(back?.data?.strokeWidth).toBe(5);
  });
});

describe("legacy hand-edited widths (#415 reporter files)", () => {
  const base = { id: "e", source: "a", target: "b", data: { signalType: "sdi" } };

  it("adopts a top-level edge.strokeWidth, clamped, and drops the stray key", () => {
    const out = adoptLegacyStrokeWidth({ ...base, strokeWidth: 10, style: { stroke: "x", strokeWidth: 2 } });
    expect(out.data.strokeWidth).toBe(8);
    expect("strokeWidth" in out).toBe(false);
    expect(out.style.strokeWidth).toBe(2);
  });

  it("adopts a non-default style.strokeWidth and resets style so 'back to default' sticks", () => {
    const out = adoptLegacyStrokeWidth({ ...base, style: { stroke: "x", strokeWidth: 6 } });
    expect(out.data.strokeWidth).toBe(6);
    expect(out.style).toEqual({ stroke: "x", strokeWidth: 2 });
    // Idempotent: a second load changes nothing.
    expect(adoptLegacyStrokeWidth(out)).toBe(out);
  });

  it("leaves app-written widths, direct attach and existing overrides alone", () => {
    const plain = { ...base, style: { strokeWidth: 2 } };
    expect(adoptLegacyStrokeWidth(plain)).toBe(plain);
    const da = { ...base, data: { signalType: "usb", directAttach: true }, style: { strokeWidth: 1 } };
    expect(adoptLegacyStrokeWidth(da)).toBe(da);
    const already = { ...base, data: { signalType: "sdi", strokeWidth: 4 }, style: { strokeWidth: 6 } };
    expect(adoptLegacyStrokeWidth(already)).toBe(already);
  });

  it("is applied on File ▸ Open of a current-version file", () => {
    const doc = structuredClone(file);
    doc.version = CURRENT_SCHEMA_VERSION;
    const raw = doc.edges.find((e) => e.id === "edge-1") as unknown as Record<string, unknown>;
    raw.strokeWidth = 6;
    state().importFromJSON(doc);
    expect(edge("edge-1").data?.strokeWidth).toBe(6);
    expect(edge("edge-3").data?.strokeWidth).toBeUndefined();
  });

  it("does not touch the shipped fixture (all app-written widths)", () => {
    const migrated = migrateSchematic(structuredClone(file)) as SchematicFile;
    expect(migrated.edges.some((e) => e.data?.strokeWidth !== undefined)).toBe(false);
  });
});
