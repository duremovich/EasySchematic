import { afterEach, describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import type { ReactFlowInstance } from "@xyflow/react";

import type { AuxRow, ConnectionEdge, LabelCaseMode, SchematicNode, SignalType } from "../types";
import { DEFAULT_LABEL_CASE, DEFAULT_STUB_LABEL_SHOW_ARROW } from "../types";
import { useSchematicStore } from "../store";
import { DxfWriter } from "../dxfExport/writer";
import { buildDxf } from "../dxfExport";
import { emitAnnotation, emitDevice, emitRoom } from "../dxfExport/nodes";
import { emitLegend } from "../dxfExport/legend";
import {
  CAP_HEIGHT_RATIO,
  DPI,
  cssFontPxToDxfHeight,
  escapeForMText,
  escapeForText,
  fmt,
  hexToRgb,
  rgbToAci,
  rgbToTrueColor,
  sanitizeName,
  tintToWhite,
  truncateToWidth,
} from "../dxfExport/units";
import { CANONICAL_LAYERS, LTYPE_DEFS, buildLayerDefs, signalLayerName } from "../dxfExport/layers";
import { createDefaultLayout } from "../titleBlockLayout";
import { DEFAULT_SIGNAL_COLORS } from "../signalColors";
import { wrapDeviceLabelLines } from "../displayName";
import { emitRoundedWaypointPath } from "../dxfExport/geometry";
import { MISSING_CABLE_ID } from "../stubLabelText";
import type { RoutedEdge } from "../edgeRouter";

/** Build a minimum-viable DXF document with the given entities inside ENTITIES. */
function buildMinimalDxf(
  emit: (writer: DxfWriter) => void,
): string {
  const w = new DxfWriter();
  w.setExtents({ x: 0, y: 0 }, { x: 10, y: 10 });
  w.writeHeader();
  w.writeClasses();
  w.writeTables(
    [
      { name: "0", color: 7 },
      { name: "TEST", color: 7 },
    ],
    LTYPE_DEFS,
  );
  w.writeBlocks();
  w.startEntities();
  emit(w);
  w.endEntities();
  w.writeObjects();
  w.writeEof();
  return w.toString();
}

// dxf-parser's types are stricter than its runtime behavior — cast to any so
// we can access entity-specific fields without narrowing every read site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(dxfString: string): any {
  const parser = new DxfParser();
  return parser.parseSync(dxfString);
}

/** A single horizontal run, the shape the router produces for a straight hop. */
function straightRoute(x1: number, y: number, x2: number) {
  return {
    segments: [{ x1, y1: y, x2, y2: y, axis: "h" }],
    waypoints: [{ x: x1, y }, { x: x2, y }],
    crossingPoints: [],
    labelX: (x1 + x2) / 2,
    labelY: y,
  } as unknown as RoutedEdge;
}

/** ReactFlowInstance stand-in over a fixed node list — the exporter only reads
 *  positionAbsolute and handleBounds. */
function instanceFor(nodes: SchematicNode[]): ReactFlowInstance {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return {
    getInternalNode: (id: string) => {
      const n = byId.get(id);
      if (!n) return undefined;
      return {
        internals: {
          positionAbsolute: { x: n.position.x, y: n.position.y },
          handleBounds: { source: [], target: [] },
        },
      };
    },
  } as unknown as ReactFlowInstance;
}

interface RawEntity { type: string; layer: string; pairs: [string, string][] }

/** Every entity in the ENTITIES section, in emission order, walking the (group code,
 *  value) pairs directly. dxf-parser normalizes and reorders what it keeps, so anything
 *  asserting about raw group codes — or about where a fill sits relative to the text it
 *  masks — has to read the stream itself. */
function rawEntityStream(dxf: string): RawEntity[] {
  const lines = dxf.split("\r\n");
  const out: RawEntity[] = [];
  let inEntities = false;
  let current: RawEntity | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i];
    const value = lines[i + 1];
    if (code === "0") {
      if (value === "ENDSEC") inEntities = false;
      current = null;
      if (inEntities && value !== "SECTION") {
        current = { type: value, layer: "", pairs: [] };
        out.push(current);
      }
    } else if (code === "2" && value === "ENTITIES") {
      inEntities = true;
    } else if (current) {
      if (code === "8" && !current.layer) current.layer = value;
      current.pairs.push([code, value]);
    }
  }
  return out;
}

/** The four corners of a SOLID, in DXF group order (10/11/12/13). */
function solidCorners(e: RawEntity): { x: number; y: number }[] {
  const byCode = new Map(e.pairs.map(([code, value]) => [code, Number(value)]));
  return ["10", "11", "12", "13"].map((code, i) => ({
    x: byCode.get(code)!,
    y: byCode.get(String(20 + i))!,
  }));
}

/** Bounding box (DXF inches) of an opaque mask — a SOLID quad. */
function maskBounds(e: RawEntity): { x1: number; y1: number; x2: number; y2: number } {
  const corners = solidCorners(e);
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** Drop the schematic the whole-document tests loaded into the store. */
function resetExportStore() {
  useSchematicStore.setState({
    nodes: [], edges: [], routedEdges: {}, labelCase: DEFAULT_LABEL_CASE,
    cableIdLabelMode: "endpoint", cableIdGap: 4, cableIdMidOffset: 0,
    // Derived state, rebuilt by an App effect rather than by newSchematic — clear it or
    // one case's map decides what the next case's cable-ID tags print (#270).
    cableIdMap: {},
  });
}

describe("units helpers", () => {
  it("sanitizes layer names, keeping only legal DXF chars", () => {
    expect(sanitizeName("analog-audio")).toBe("ANALOG-AUDIO");
    expect(sanitizeName("power l1")).toBe("POWER_L1");
    expect(sanitizeName("hdmi")).toBe("HDMI");
    // Runs of unsupported chars collapse to a single underscore
    expect(sanitizeName("foo   bar")).toBe("FOO_BAR");
    // Leading/trailing underscores (from invalid chars) get stripped
    expect(sanitizeName("!!!weird!!!")).toBe("WEIRD");
  });

  it("converts hex colors to RGB and packs true-color ints", () => {
    expect(hexToRgb("#ff0000")).toEqual([0xff, 0, 0]);
    expect(hexToRgb("#2563eb")).toEqual([0x25, 0x63, 0xeb]);
    expect(rgbToTrueColor(0xff, 0, 0)).toBe(0xff0000);
    expect(rgbToTrueColor(0x25, 0x63, 0xeb)).toBe(0x2563eb);
  });

  it("tints colors toward white", () => {
    expect(tintToWhite("#000000", 1)).toBe("#ffffff");
    expect(tintToWhite("#000000", 0)).toBe("#000000");
    const mid = tintToWhite("#000000", 0.5);
    expect(mid).toMatch(/^#[78][0-9a-f]{5}$/);
  });

  it("escapes non-ASCII to \\U+XXXX and preserves ASCII", () => {
    expect(escapeForText("Audio")).toBe("Audio");
    expect(escapeForText("\u2192")).toBe("\\U+2192"); // right arrow
    expect(escapeForText("\u00b1")).toBe("\\U+00B1"); // plus-minus
    expect(escapeForText("a\\b")).toBe("a\\\\b");
  });

  it("escapes MText-specific characters", () => {
    expect(escapeForMText("{group}")).toBe("\\{group\\}");
    expect(escapeForMText("x\\y")).toBe("x\\\\y");
  });

  it("formats numbers cleanly", () => {
    expect(fmt(1)).toBe("1");
    expect(fmt(1.0)).toBe("1");
    expect(fmt(1.23456789)).toBe("1.234568");
    expect(fmt(0.0000001)).toBe("0");
    expect(fmt(NaN)).toBe("0");
  });
});

describe("layers helpers", () => {
  it("builds layer list with all canonical layers + one per signal type", () => {
    const sigs = new Set(["hdmi", "sdi"] as const);
    const layers = buildLayerDefs(sigs as Set<never>, undefined);
    const names = layers.map((l) => l.name);
    expect(names).toContain("0");
    expect(names).toContain("EasySchematic-Rooms");
    expect(names).toContain("EasySchematic-Rooms-Fill");
    expect(names).toContain("EasySchematic-Devices");
    expect(names).toContain("EasySchematic-Connections-HDMI");
    expect(names).toContain("EasySchematic-Connections-SDI");
  });

  it("sanitizes signal layer names — never spaces", () => {
    expect(signalLayerName("analog-audio")).toBe("EasySchematic-Connections-ANALOG-AUDIO");
    expect(signalLayerName("power-l1")).toBe("EasySchematic-Connections-POWER-L1");
    expect(signalLayerName("s-video")).toBe("EasySchematic-Connections-S-VIDEO");
    for (const sig of ["analog-audio", "power-l1", "s-video"] as const) {
      expect(signalLayerName(sig)).not.toContain(" ");
    }
  });
});

describe("DxfWriter — structural", () => {
  it("produces a DXF that dxf-parser can read without errors", () => {
    const dxf = buildMinimalDxf(() => {
      // No entities — just exercise the header/tables/blocks/objects.
    });
    const parsed = parse(dxf);
    expect(parsed).toBeTruthy();
    expect(parsed.header).toBeTruthy();
    expect(parsed.header.$ACADVER).toBe("AC1018");
    expect(parsed.header.$INSUNITS).toBe(1);
    expect(parsed.tables.layer).toBeTruthy();
    expect(parsed.tables.lineType).toBeTruthy();
  });

  it("declares inches via $INSUNITS=1 and emits $MEASUREMENT=0", () => {
    const dxf = buildMinimalDxf(() => {});
    const parsed = parse(dxf);
    expect(parsed.header.$INSUNITS).toBe(1);
    expect(parsed.header.$MEASUREMENT).toBe(0);
  });

  it("includes all standard tables required by AutoCAD", () => {
    const dxf = buildMinimalDxf(() => {});
    const parsed = parse(dxf);
    // dxf-parser exposes layer, lineType, viewPort (STYLE/APPID/etc. are
    // present in the file but not reflected in the parser's top-level tables)
    expect(Object.keys(parsed.tables)).toEqual(
      expect.arrayContaining(["layer", "lineType", "viewPort"]),
    );
    // Confirm STYLE and BLOCK_RECORD tables are in the raw output
    expect(dxf).toMatch(/\r?\nSTYLE\r?\n/);
    expect(dxf).toMatch(/\r?\nBLOCK_RECORD\r?\n/);
    expect(dxf).toMatch(/\r?\nVPORT\r?\n/);
  });

  it("emits all configured layers with correct colors", () => {
    const dxf = buildMinimalDxf(() => {});
    const parsed = parse(dxf);
    const layerNames = Object.keys(parsed.tables.layer.layers);
    expect(layerNames).toContain("0");
    expect(layerNames).toContain("TEST");
  });

  it("LINE entity appears in ENTITIES with correct endpoints", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addLine("0", 0, 0, 5, 3);
    });
    const parsed = parse(dxf);
    const lines = parsed.entities.filter((e: { type: string }) => e.type === "LINE");
    expect(lines.length).toBe(1);
    const line = lines[0] as { vertices: { x: number; y: number }[] };
    expect(line.vertices[0].x).toBeCloseTo(0);
    expect(line.vertices[0].y).toBeCloseTo(0);
    expect(line.vertices[1].x).toBeCloseTo(5);
    expect(line.vertices[1].y).toBeCloseTo(3);
  });

  it("LWPOLYLINE rect has 4 vertices and closed flag", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addRect("0", 0, 0, 10, 5);
    });
    const parsed = parse(dxf);
    const polys = parsed.entities.filter((e: { type: string }) => e.type === "LWPOLYLINE");
    expect(polys.length).toBe(1);
    const poly = polys[0] as { vertices: { x: number; y: number }[]; shape: boolean };
    expect(poly.vertices.length).toBe(4);
    expect(poly.shape).toBe(true); // closed
  });

  it("TEXT entity is emitted with escaped non-ASCII content", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addText("0", 1, 1, "Arrow \u2192 target", { height: 0.1 });
    });
    expect(dxf).toContain("Arrow \\U+2192 target");
    const parsed = parse(dxf);
    const texts = parsed.entities.filter((e: { type: string }) => e.type === "TEXT");
    expect(texts.length).toBe(1);
  });

  it("ARC entity has correct center, radius, and angles", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addArc("0", 2, 3, 0.5, 0, 180);
    });
    const parsed = parse(dxf);
    const arcs = parsed.entities.filter((e: { type: string }) => e.type === "ARC");
    expect(arcs.length).toBe(1);
    const arc = arcs[0] as { center: { x: number; y: number }; radius: number };
    expect(arc.center.x).toBeCloseTo(2);
    expect(arc.center.y).toBeCloseTo(3);
    expect(arc.radius).toBeCloseTo(0.5);
  });

  it("ELLIPSE entity has correct center and ratio", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addEllipse("0", 5, 5, 3, 0, 0.5);
    });
    const parsed = parse(dxf);
    const ellipses = parsed.entities.filter((e: { type: string }) => e.type === "ELLIPSE");
    expect(ellipses.length).toBe(1);
    const ell = ellipses[0] as { center: { x: number; y: number }; axisRatio: number };
    expect(ell.center.x).toBeCloseTo(5);
    expect(ell.axisRatio).toBeCloseTo(0.5);
  });

  it("MTEXT with non-ASCII escapes survives parsing", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addMText("0", 0, 0, "\u00b14 dB", { height: 0.1 });
    });
    expect(dxf).toContain("\\U+00B1");
    const parsed = parse(dxf);
    const mts = parsed.entities.filter((e: { type: string }) => e.type === "MTEXT");
    expect(mts.length).toBe(1);
  });

  it("mixes entities on multiple layers correctly", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addLine("0", 0, 0, 1, 0);
      w.addLine("TEST", 0, 1, 1, 1);
      w.addRect("TEST", 0, 2, 1, 1);
    });
    const parsed = parse(dxf);
    const entities = parsed.entities as { layer: string; type: string }[];
    const onTest = entities.filter((e) => e.layer === "TEST");
    expect(onTest.length).toBe(2);
    const onZero = entities.filter((e) => e.layer === "0");
    expect(onZero.length).toBe(1);
  });

  it("emits true-color (group 420) when set on entity style", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addLine("0", 0, 0, 1, 0, { trueColor: 0xff0000 });
    });
    // Group code 420 with the packed color value should appear in output
    expect(dxf).toMatch(/\b420\r?\n\s*16711680/);
    const parsed = parse(dxf);
    expect(parsed.entities.length).toBe(1);
  });

  it("linetype definitions are present in tables", () => {
    const dxf = buildMinimalDxf(() => {});
    const parsed = parse(dxf);
    const ltypeNames = Object.keys(parsed.tables.lineType.lineTypes);
    expect(ltypeNames).toContain("CONTINUOUS");
    expect(ltypeNames).toContain("ES_DASHED");
    expect(ltypeNames).toContain("ES_DOTTED");
    expect(ltypeNames).toContain("ES_DASHDOT");
    expect(ltypeNames).toContain("ES_MISMATCH");
  });

  it("writes extents that parse as numeric values", () => {
    const w = new DxfWriter();
    w.setExtents({ x: -1.5, y: -2.5 }, { x: 10.25, y: 8.75 });
    w.writeHeader();
    w.writeClasses();
    w.writeTables([{ name: "0", color: 7 }], LTYPE_DEFS);
    w.writeBlocks();
    w.startEntities();
    w.endEntities();
    w.writeObjects();
    w.writeEof();
    const parsed = parse(w.toString());
    expect(parsed.header.$EXTMIN.x).toBeCloseTo(-1.5);
    expect(parsed.header.$EXTMIN.y).toBeCloseTo(-2.5);
    expect(parsed.header.$EXTMAX.x).toBeCloseTo(10.25);
    expect(parsed.header.$EXTMAX.y).toBeCloseTo(8.75);
  });

  it("produces output that starts with a SECTION and ends with EOF", () => {
    const dxf = buildMinimalDxf(() => {});
    const trimmed = dxf.trim();
    expect(trimmed.startsWith("0")).toBe(true);
    expect(trimmed.endsWith("EOF")).toBe(true);
    // Every section should have a matching ENDSEC
    const sectionCount = (trimmed.match(/\r?\nSECTION\r?\n/g) ?? []).length;
    const endsecCount = (trimmed.match(/\r?\nENDSEC\r?\n/g) ?? []).length;
    expect(sectionCount).toBe(endsecCount);
    expect(sectionCount).toBeGreaterThanOrEqual(6); // HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS
  });
});

describe("visual-fidelity follow-up", () => {
  it("text heights use cap-height ratio (10px CSS → ~0.075\" DXF)", () => {
    expect(CAP_HEIGHT_RATIO).toBeLessThan(1);
    expect(CAP_HEIGHT_RATIO).toBeGreaterThan(0.5);
    const h10 = cssFontPxToDxfHeight(10);
    // 10 * 0.72 / 96 ≈ 0.075
    expect(h10).toBeCloseTo(10 * CAP_HEIGHT_RATIO / 96, 4);
  });

  it("addRoundedRect emits 8-vertex closed LWPOLYLINE with 4 bulges", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addRoundedRect("0", 0, 0, 10, 6, 0.5);
    });
    const parsed = parse(dxf);
    const polys = parsed.entities.filter((e: { type: string }) => e.type === "LWPOLYLINE");
    expect(polys.length).toBe(1);
    const poly = polys[0] as { vertices: { x: number; y: number; bulge?: number }[]; shape: boolean };
    expect(poly.shape).toBe(true);
    expect(poly.vertices.length).toBe(8);
    // 4 of the 8 vertices should have a non-zero bulge (one per fillet)
    const bulged = poly.vertices.filter((v) => v.bulge !== undefined && Math.abs(v.bulge) > 0.01);
    expect(bulged.length).toBe(4);
    // Bulge for a 90° arc is tan(π/8) ≈ 0.4142
    for (const v of bulged) {
      expect(v.bulge).toBeCloseTo(Math.tan(Math.PI / 8), 3);
    }
  });

  it("addRoundedRect with zero radius falls back to addRect", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addRoundedRect("0", 0, 0, 10, 6, 0);
    });
    const parsed = parse(dxf);
    const polys = parsed.entities.filter((e: { type: string }) => e.type === "LWPOLYLINE");
    expect(polys.length).toBe(1);
    expect((polys[0] as { vertices: unknown[] }).vertices.length).toBe(4);
  });

  it("waypoint path with one 90° turn emits LINE + ARC + LINE", () => {
    const dxf = buildMinimalDxf((w) => {
      // Path: (0,0) → (100,0) → (100,50). Corner at (100, 0).
      emitRoundedWaypointPath(
        w,
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
        [], [],
        "0",
        {},
      );
    });
    const parsed = parse(dxf);
    const lines = parsed.entities.filter((e: { type: string }) => e.type === "LINE");
    const arcs = parsed.entities.filter((e: { type: string }) => e.type === "ARC");
    expect(lines.length).toBe(2);
    expect(arcs.length).toBe(1);
  });

  it("waypoint path with no interior corner emits a single LINE (no fillet)", () => {
    const dxf = buildMinimalDxf((w) => {
      emitRoundedWaypointPath(
        w,
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        [], [],
        "0",
        {},
      );
    });
    const parsed = parse(dxf);
    const lines = parsed.entities.filter((e: { type: string }) => e.type === "LINE");
    const arcs = parsed.entities.filter((e: { type: string }) => e.type === "ARC");
    expect(lines.length).toBe(1);
    expect(arcs.length).toBe(0);
  });

  it("waypoint path with a hop crossing emits hop arc + corner fillet", () => {
    const dxf = buildMinimalDxf((w) => {
      // Path: (0,0) → (200,0) → (200,100). Horizontal segment has a hop at (100,0).
      emitRoundedWaypointPath(
        w,
        [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }],
        [{ x: 100, y: 0 }],  // arc hop on horizontal segment
        [],
        "0",
        {},
      );
    });
    const parsed = parse(dxf);
    const arcs = parsed.entities.filter((e: { type: string }) => e.type === "ARC");
    // Expect at least 2 arcs: 1 hop + 1 corner fillet
    expect(arcs.length).toBeGreaterThanOrEqual(2);
  });

  it("truncateToWidth adds ellipsis when text exceeds maxWidth", () => {
    // Short text fits as-is.
    expect(truncateToWidth("short", 10, 0.1)).toBe("short");
    // Long text gets truncated and ends with "..."
    const result = truncateToWidth("This device name is way too long to fit", 0.5, 0.1);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThan("This device name is way too long to fit".length);
    // Empty input returns empty
    expect(truncateToWidth("", 5, 0.1)).toBe("");
    // Zero width returns empty
    expect(truncateToWidth("hello", 0, 0.1)).toBe("");
  });

  it("truncateToWidth keeps the result inside the requested maxWidth", () => {
    // Long label in a narrow box — after truncation, estimated width of
    // <prefix> + "..." must fit within the requested maxWidth.
    const height = 0.09; // ≈ 12px CSS label
    const maxWidth = 1.625; // 180px device minus px-3 padding
    const result = truncateToWidth(
      "BMD Micro Studio camera 4K G2 1",
      maxWidth,
      height,
    );
    expect(result.endsWith("...")).toBe(true);
    // Compute an independent width estimate with the same aspect assumptions.
    const charW = height * 0.65;
    const ellipsisW = height * 0.28 * 3;
    const prefixLen = result.length - 3; // strip "..."
    const estWidth = prefixLen * charW + ellipsisW;
    expect(estWidth).toBeLessThanOrEqual(maxWidth);
  });

  it("STYLE table primary font is arial.ttf (Inter-compatible)", () => {
    const dxf = buildMinimalDxf(() => {});
    expect(dxf).toContain("arial.ttf");
    // And not the blocky txt fallback
    const styleStart = dxf.indexOf("STANDARD");
    const styleEnd = dxf.indexOf("ENDTAB", styleStart);
    const styleBlock = dxf.substring(styleStart, styleEnd);
    expect(styleBlock).not.toMatch(/\r?\n\s*3\r?\n\s*txt\r?\n/);
  });
});

describe("emitDevice — header label placement", () => {
  const DEVICE_Y = 100;

  function deviceNode(label: string, auxiliaryData: AuxRow[] = []): SchematicNode {
    return {
      id: "n1",
      type: "device",
      position: { x: 0, y: DEVICE_Y },
      measured: { width: 144, height: 80 },
      data: {
        label,
        // Wrapping enabled per-instance so `wrapsInHeader` turns purely on whether
        // the name overflows the 144-px box.
        wrapLabel: true,
        auxiliaryData,
        ports: [
          { id: "p1", label: "In", direction: "input", signalType: "hdmi" },
          { id: "p2", label: "Out", direction: "output", signalType: "hdmi" },
        ],
      },
    } as unknown as SchematicNode;
  }

  /** Minimal ReactFlowInstance stand-in — emitDevice only reads positionAbsolute
   *  and handleBounds off the internal node. */
  function stubInstance(node: SchematicNode): ReactFlowInstance {
    return {
      getInternalNode: () => ({
        internals: {
          positionAbsolute: { x: node.position.x, y: node.position.y },
          handleBounds: { source: [], target: [] },
        },
      }),
    } as unknown as ReactFlowInstance;
  }

  /** Device-name TEXT entities, in emission order, with each baseline expressed in px
   *  below the device's top edge. */
  function labelLines(
    label: string,
    auxiliaryData: AuxRow[] = [],
  ): { text: string; offsetPx: number }[] {
    const node = deviceNode(label, auxiliaryData);
    const dxf = buildMinimalDxf((w) => {
      emitDevice(w, node, stubInstance(node), [], undefined, "USD", {});
    });
    const parsed = parse(dxf);
    const labels = parsed.entities.filter(
      (e: { type: string; layer: string }) =>
        e.type === "TEXT" && e.layer === CANONICAL_LAYERS.LABELS,
    );
    expect(labels.length).toBeGreaterThan(0);
    // DXF is Y-up inches with the canvas origin at y=0; convert back to screen px.
    return labels.map((e: { text: string; startPoint: { y: number } }) => ({
      text: e.text,
      offsetPx: -e.startPoint.y * DPI - DEVICE_Y,
    }));
  }

  /** Baseline Y of the device name's FIRST line, in px below the device's top edge. */
  function labelBaselineOffsetPx(label: string, auxiliaryData: AuxRow[] = []): number {
    return labelLines(label, auxiliaryData)[0].offsetPx;
  }

  it("emits one line, centred in the band, for a name that fits the header", () => {
    const lines = labelLines("Camera");
    expect(lines.map((l) => l.text)).toEqual(["Camera"]);
    expect(lines[0].offsetPx).toBeCloseTo(20, 3);
  });

  // A name the canvas breaks over two lines used to leave the DXF as ONE ellipsised
  // line, so "USB-A (M) → RJ45 (F) Adapter" exported with its tail missing (#299).
  // DXF TEXT can't wrap, so the exporter emits the canvas's two lines as two entities.
  it("emits both canvas lines for a wrapped device name (#299)", () => {
    const lines = labelLines("USB-A (M) → RJ45 (F) Adapter");
    expect(lines.map((l) => l.text)).toEqual(
      wrapDeviceLabelLines("USB-A (M) → RJ45 (F) Adapter").map(escapeForText),
    );
    // Nothing is truncated: the whole name is on the page.
    expect(lines.map((l) => l.text).join(" ")).toBe(
      escapeForText("USB-A (M) → RJ45 (F) Adapter"),
    );
  });

  it("splits at the shared header measurement, not an exporter-local guess", () => {
    for (const name of ["Ethernet Switch (4-port)", "Main Hall Ceiling Microphone Array"]) {
      expect(labelLines(name).map((l) => l.text)).toEqual(
        wrapDeviceLabelLines(name, { ellipsis: "..." }).map(escapeForText),
      );
    }
  });

  it("ellipsises with three periods, never the single glyph CAD readers re-measure", () => {
    const lines = labelLines("Extron DTP CrossPoint 84 4K IPCP SA");
    expect(lines.length).toBe(2);
    expect(lines[1].text.endsWith("...")).toBe(true);
    expect(lines.map((l) => l.text).join("")).not.toContain("\\U+2026");
  });

  // Two lines stacked on the canvas's 14-px leading, centred as a block in the 32-px
  // zone: they straddle where the single line used to sit, rather than one of them
  // landing in the aux rows below (#249 follow-up).
  it("stacks the two lines on the canvas leading, centred in the two-line zone", () => {
    const lines = labelLines("USB-A (M) → RJ45 (F) Adapter");
    expect(lines[0].offsetPx).toBeCloseTo(13, 3);
    expect(lines[1].offsetPx).toBeCloseTo(27, 3);
    const single = labelBaselineOffsetPx("Camera");
    expect(lines[0].offsetPx).toBeLessThan(single);
    expect(lines[1].offsetPx).toBeGreaterThan(single);
  });

  it("keeps both label lines above the header aux rows", () => {
    const rows: AuxRow[] = [{ text: "{{deviceType}}", position: "header" }];
    // Band is 48px (32 zone + 12 row, rounded up to the 16-px grid), pad 4 → top pad 2.
    // The 28-px two-line block centres in the zone at 2 + 2, so the baselines land at
    // 15 and 29 — clear of the aux row, which starts at 2 + 32 = 34.
    const lines = labelLines("USB-A (M) → RJ45 (F) Adapter", rows);
    expect(lines.map((l) => l.offsetPx)).toEqual([
      expect.closeTo(15, 3),
      expect.closeTo(29, 3),
    ]);
    expect(labelBaselineOffsetPx("Camera", rows)).toBeCloseTo(14, 3);
  });

  it("still ellipsises a single line when the device opts out of wrapping", () => {
    const node = {
      ...deviceNode("Main Hall Ceiling Microphone Array"),
    } as unknown as SchematicNode;
    (node.data as { wrapLabel?: boolean }).wrapLabel = false;
    const dxf = buildMinimalDxf((w) => {
      emitDevice(w, node, stubInstance(node), [], undefined, "USD", {});
    });
    const texts = (parse(dxf).entities as { type: string; layer: string; text: string }[])
      .filter((e) => e.type === "TEXT" && e.layer === CANONICAL_LAYERS.LABELS)
      .map((e) => e.text);
    expect(texts.length).toBe(1);
    expect(texts[0].endsWith("...")).toBe(true);
  });
});

// Room names follow the display-case preference (#294) in the DXF too — and nothing else.
// The exporter used to hardcode `data.label.toUpperCase()` as a drafting convention, the
// counterpart of RoomNode's decorative CSS `uppercase`. Both are gone: rooms are cased by
// the preference alone, exactly like device and port labels, so an as-typed export now
// reproduces what the user actually typed.
describe("emitRoom — label casing", () => {
  afterEach(() => {
    useSchematicStore.setState({ labelCase: DEFAULT_LABEL_CASE });
  });

  function roomNode(label: string): SchematicNode {
    return {
      id: "r1",
      type: "room",
      position: { x: 0, y: 0 },
      measured: { width: 400, height: 300 },
      data: { label },
    } as unknown as SchematicNode;
  }

  /** The room name as it lands in the DXF TEXT entity, for the given case mode. */
  function emittedRoomLabel(label: string, mode: LabelCaseMode): string {
    useSchematicStore.setState({ labelCase: mode });
    const node = roomNode(label);
    const dxf = buildMinimalDxf((w) => {
      emitRoom(w, node, {
        getInternalNode: () => ({
          internals: {
            positionAbsolute: { x: node.position.x, y: node.position.y },
            handleBounds: { source: [], target: [] },
          },
        }),
      } as unknown as ReactFlowInstance);
    });
    const parsed = parse(dxf);
    const labels = parsed.entities.filter(
      (e: { type: string; layer: string }) =>
        e.type === "TEXT" && e.layer === CANONICAL_LAYERS.LABELS,
    );
    expect(labels.length).toBe(1);
    return labels[0].text;
  }

  it("applies the case preference to the room name in all four modes", () => {
    expect(emittedRoomLabel("main Hall", "uppercase")).toBe("MAIN HALL");
    expect(emittedRoomLabel("main Hall", "lowercase")).toBe("main hall");
    expect(emittedRoomLabel("main Hall", "capitalize")).toBe("Main Hall");
  });

  it("emits the room name verbatim under as-typed — no drafting all-caps", () => {
    // This is the assertion that fails if anyone reinstates the hardcoded `.toUpperCase()`:
    // a mixed-case room name has to survive the export untouched in the default mode.
    for (const label of ["main Hall", "Booth", "FOH", "rack room 2"]) {
      expect(emittedRoomLabel(label, "as-typed")).toBe(label);
    }
    // Spelled out for the one case where verbatim and all-caps would otherwise agree.
    expect(emittedRoomLabel("main Hall", "as-typed")).not.toBe("MAIN HALL");
  });

  it("is display-only — the stored room label is never mutated", () => {
    const node = roomNode("main Hall");
    emittedRoomLabel("main Hall", "lowercase");
    expect((node.data as { label: string }).label).toBe("main Hall");
  });
});

// The second half of #294: I/O section headers follow the case preference in the DXF too.
// The canvas already does this via DeviceNode's `displayLabel(item.name)`; without the
// same call here a sectioned device's DXF disagrees with what's on screen.
describe("emitDevice — I/O section header casing", () => {
  afterEach(() => {
    useSchematicStore.setState({ labelCase: DEFAULT_LABEL_CASE });
  });

  /** Two sections per direction — the first section in a direction emits no separator
   *  (there's nothing above it to separate from), so the second one carries the label. */
  const PORTS = [
    { id: "p1", label: "Mic 1", direction: "input", signalType: "analog-audio", section: "mic In" },
    { id: "p2", label: "Line 1", direction: "input", signalType: "analog-audio", section: "line In" },
    { id: "p3", label: "Main", direction: "output", signalType: "analog-audio", section: "main Out" },
    { id: "p4", label: "Aux", direction: "output", signalType: "analog-audio", section: "aux Out" },
    { id: "p5", label: "Net A", direction: "bidirectional", signalType: "ethernet", section: "net A" },
    { id: "p6", label: "Net B", direction: "bidirectional", signalType: "ethernet", section: "net B" },
  ];

  const sectionedDevice = (): SchematicNode =>
    ({
      id: "n1",
      type: "device",
      position: { x: 0, y: 0 },
      measured: { width: 144, height: 200 },
      data: { label: "patch Bay", ports: PORTS, auxiliaryData: [] },
    }) as unknown as SchematicNode;

  /** Handle bounds for every port, one row apart. Bidirectional ports expose -in/-out. */
  function handleBounds() {
    const source: { id: string; x: number; y: number; width: number; height: number }[] = [];
    let row = 0;
    for (const p of PORTS) {
      const y = 40 + row * 16;
      if (p.direction === "bidirectional") {
        source.push({ id: `${p.id}-in`, x: 0, y, width: 8, height: 8 });
        source.push({ id: `${p.id}-out`, x: 136, y, width: 8, height: 8 });
      } else {
        source.push({ id: p.id, x: p.direction === "input" ? 0 : 136, y, width: 8, height: 8 });
      }
      row++;
    }
    return { source, target: [] };
  }

  /** Every LABELS-layer TEXT emitted for the sectioned device, in emission order.
   *  Index 0 is the device name; the rest are the section headers. */
  function emittedLabelTexts(mode: LabelCaseMode): string[] {
    useSchematicStore.setState({ labelCase: mode });
    const node = sectionedDevice();
    const dxf = buildMinimalDxf((w) => {
      emitDevice(
        w,
        node,
        {
          getInternalNode: () => ({
            internals: {
              positionAbsolute: { x: node.position.x, y: node.position.y },
              handleBounds: handleBounds(),
            },
          }),
        } as unknown as ReactFlowInstance,
        [],
        undefined,
        "USD",
        {},
      );
    });
    return parse(dxf)
      .entities.filter(
        (e: { type: string; layer: string }) =>
          e.type === "TEXT" && e.layer === CANONICAL_LAYERS.LABELS,
      )
      .map((e: { text: string }) => e.text);
  }

  /** Just the section headers — drops the device name at index 0. */
  const sectionHeaders = (mode: LabelCaseMode) => emittedLabelTexts(mode).slice(1);

  it("emits one header per section change, covering all three port directions", () => {
    // input / output / bidirectional each take a different branch of the separator code.
    expect(sectionHeaders("as-typed")).toEqual(["line In", "aux Out", "net B"]);
  });

  it("applies the case preference to section headers in all four modes", () => {
    expect(sectionHeaders("as-typed")).toEqual(["line In", "aux Out", "net B"]);
    expect(sectionHeaders("uppercase")).toEqual(["LINE IN", "AUX OUT", "NET B"]);
    expect(sectionHeaders("lowercase")).toEqual(["line in", "aux out", "net b"]);
    expect(sectionHeaders("capitalize")).toEqual(["Line In", "Aux Out", "Net B"]);
  });

  it("leaves section headers untouched under as-typed", () => {
    // Unlike room labels there was never a decorative uppercase here — the section text
    // was emitted raw — so as-typed must be the identity, byte for byte.
    for (const text of sectionHeaders("as-typed")) {
      expect(text).toBe(PORTS.find((p) => p.section?.toLowerCase() === text.toLowerCase())?.section);
    }
  });

  it("is display-only — the stored section names are never mutated", () => {
    sectionHeaders("uppercase");
    expect(PORTS.map((p) => p.section)).toEqual([
      "mic In", "line In", "main Out", "aux Out", "net A", "net B",
    ]);
  });
});

// ─── Whole-document emission (entity order + stub labels) ────────────────────
//
// AutoCAD, TrueView and LibreCAD all paint model-space entities in database order and
// give layers no precedence of their own, so where a label lands in the ENTITIES stream
// decides whether it is readable — and DXF text has no fill area, so a label that sits
// ON its own routed line needs a mask entity too. These pin all three consequences:
// cable IDs must follow ALL connection geometry AND carry an opaque chip (#298), and
// stub-label boxes must be in the document at all (#319 — they were skipped entirely,
// leaving the leg's cable ID as the only text at a stub end).

describe("buildDxf — connection label draw order and masking (#298)", () => {
  const devices: SchematicNode[] = [
    {
      id: "dev-switch",
      type: "device",
      position: { x: 0, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "Rack Switch", ports: [{ id: "port-1", label: "Port 1", direction: "output", signalType: "ethernet" }] },
    },
    {
      id: "dev-display",
      type: "device",
      position: { x: 600, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "Lobby Display", ports: [{ id: "port-1", label: "LAN 1", direction: "input", signalType: "ethernet" }] },
    },
    {
      id: "dev-camera",
      type: "device",
      position: { x: 0, y: 300 },
      measured: { width: 144, height: 80 },
      data: { label: "PTZ Camera", ports: [{ id: "port-1", label: "LAN 1", direction: "output", signalType: "ethernet" }] },
    },
    {
      id: "dev-encoder",
      type: "device",
      position: { x: 600, y: 300 },
      measured: { width: 144, height: 80 },
      data: { label: "NDI Encoder", ports: [{ id: "port-1", label: "LAN 1", direction: "input", signalType: "ethernet" }] },
    },
  ] as unknown as SchematicNode[];

  const edges = [
    { id: "e-switch-display", source: "dev-switch", target: "dev-display", sourceHandle: "port-1", targetHandle: "port-1", data: { signalType: "ethernet", cableId: "C-001" } },
    { id: "e-camera-encoder", source: "dev-camera", target: "dev-encoder", sourceHandle: "port-1", targetHandle: "port-1", data: { signalType: "ethernet", cableId: "C-002" } },
  ] as unknown as ConnectionEdge[];

  /** Both connections run dead horizontal, so the label lands exactly on the wire —
   *  the default geometry the issue is about. */
  const WIRE_Y_A = 40;
  const routedEdges = {
    "e-switch-display": straightRoute(144, WIRE_Y_A, 600),
    "e-camera-encoder": straightRoute(144, 340, 600),
  };

  afterEach(resetExportStore);

  function exportEdges(over: Record<string, unknown> = {}) {
    useSchematicStore.setState({
      nodes: devices, edges, routedEdges,
      cableIdLabelMode: "midpoint", cableIdGap: 4, cableIdMidOffset: 0,
      colorKeyEnabled: false, printView: false,
      ...over,
    });
    const dxf = buildDxf(instanceFor(devices));
    expect(dxf).not.toBeNull();
    return dxf!;
  }

  function connectionLabelOrder(over: Record<string, unknown> = {}) {
    const entities = parse(exportEdges(over)).entities as { type: string; layer: string; text?: string }[];
    const isConnectionGeometry = (e: { type: string; layer: string }) =>
      (e.type === "LINE" || e.type === "ARC") && e.layer.startsWith("EasySchematic-Connections-");
    const isCableId = (e: { type: string; layer: string; text?: string }) =>
      e.type === "MTEXT" && e.layer === CANONICAL_LAYERS.LABELS && /^C-00[12]$/.test(e.text ?? "");
    return {
      lastGeometry: entities.map(isConnectionGeometry).lastIndexOf(true),
      firstCableId: entities.findIndex(isCableId),
      cableIds: entities.filter(isCableId).map((e) => e.text),
    };
  }

  it("emits both cable IDs", () => {
    expect(connectionLabelOrder().cableIds.sort()).toEqual(["C-001", "C-002"]);
  });

  // Half the regression: labels used to be emitted inside the per-edge loop, so C-001
  // landed in the stream BEFORE the second connection's lines and that line drew
  // through it.
  it("puts every cable ID after every connection line", () => {
    const { lastGeometry, firstCableId } = connectionLabelOrder();
    expect(lastGeometry).toBeGreaterThan(-1);
    expect(firstCableId).toBeGreaterThan(lastGeometry);
  });

  // The other half, and the one ordering cannot reach: in midpoint mode with no offset
  // the label sits dead on its own wire, so it needs an opaque chip under it. Without
  // the chip the wire reads straight through the glyphs in every viewer.
  it("masks a cable ID's own connection line with an opaque chip", () => {
    const stream = rawEntityStream(exportEdges());
    const chips = stream
      .filter((e) => e.type === "SOLID" && e.layer === CANONICAL_LAYERS.LABELS)
      .map(maskBounds);
    expect(chips.length).toBe(2);

    // The midpoint of the first connection, in DXF inches.
    const labelX = (144 + 600) / 2 / DPI;
    const wireY = -WIRE_Y_A / DPI;
    const covering = chips.filter(
      (c) => c.x1 < labelX && labelX < c.x2 && c.y1 < wireY && wireY < c.y2,
    );
    expect(covering.length).toBe(1);
    // Wide enough for "C-001" plus the canvas chip's 3px side padding, not a hairline.
    expect((covering[0].x2 - covering[0].x1) * DPI).toBeGreaterThan(5 * 9 * 0.5);
  });

  it("draws each chip after all connection geometry and under its own text", () => {
    const stream = rawEntityStream(exportEdges());
    const lastGeometry = stream
      .map((e) => (e.type === "LINE" || e.type === "ARC") && e.layer.startsWith("EasySchematic-Connections-"))
      .lastIndexOf(true);
    const firstChip = stream.findIndex(
      (e) => e.type === "SOLID" && e.layer === CANONICAL_LAYERS.LABELS,
    );
    const firstCableId = stream.findIndex(
      (e) => e.type === "MTEXT" && e.pairs.some(([c, v]) => c === "1" && v === "C-001"),
    );
    expect(lastGeometry).toBeGreaterThan(-1);
    expect(firstChip).toBeGreaterThan(lastGeometry);
    expect(firstCableId).toBeGreaterThan(firstChip);
  });

  // The chip masks twice: a SOLID under the text for readers that fill SOLID, and the
  // MTEXT's own background fill for readers that don't. LibreCAD needs the first (it
  // cannot parse the background groups at all) and there is no public answer for what
  // Illustrator does with either, so the label carries both grounds.
  it("backs the cable ID with the MTEXT background fill as well as the chip", () => {
    const stream = rawEntityStream(exportEdges());
    const cableIdText = stream.find(
      (e) => e.type === "MTEXT" && e.pairs.some(([c, v]) => c === "1" && v === "C-001"),
    );
    expect(cableIdText).toBeDefined();
    const byCode = new Map(cableIdText!.pairs);
    expect(byCode.get("90")).toBe("1");   // background fill on
    expect(byCode.get("63")).toBe("255"); // plain white, NOT the adaptive 7
    expect(cableIdText!.pairs.some(([c]) => c === "45")).toBe(true); // border offset
  });

  // ACI 7 is the adaptive white/black pseudo-color. A reader that takes it literally
  // paints it white, so a "white" ground written as 7 is either invisible or — on
  // white paper in AutoCAD — a solid black bar straight over the label it should be
  // backing. Neither ground may use it.
  it("grounds the chip in plain white (ACI 255), never the adaptive ACI 7", () => {
    const chip = rawEntityStream(exportEdges())
      .find((e) => e.type === "SOLID" && e.layer === CANONICAL_LAYERS.LABELS)!;
    const byCode = new Map(chip.pairs);
    expect(byCode.get("62")).toBe("255");
    expect(byCode.get("420")).toBe(String(0xffffff));
  });

  it("chips endpoint-mode cable IDs too, at both ends", () => {
    const chips = rawEntityStream(exportEdges({ cableIdLabelMode: "endpoint" }))
      .filter((e) => e.type === "SOLID" && e.layer === CANONICAL_LAYERS.LABELS);
    expect(chips.length).toBe(4); // 2 connections x 2 ends
  });

  // #333. The chip first shipped as a HATCH, which put a HATCH under every cable ID in
  // every export — until then HATCH was only reachable through opt-in fills (a room
  // colour, the colour key) so nobody had one. Illustrator and the Autodesk viewer both
  // refused the whole file: an AutoCAD-lineage reader that dislikes one HATCH group
  // discards the entire drawing, not the entity. The mask is a SOLID now — four corners,
  // no options, R12-era — and these pin the shape so the finicky entity can't creep back.
  describe("mask entity shape (#333)", () => {
    it("emits no HATCH anywhere in the document", () => {
      expect(rawEntityStream(exportEdges()).some((e) => e.type === "HATCH")).toBe(false);
    });

    // The cable-ID chip fixture above has no room colour, no device header colour, no
    // annotations and the colour key off — exactly the opt-in paths that were the
    // pre-existing HATCH landmine (a room fill, a header band, an annotation fill, the
    // legend ground). Exercise all of them together so a HATCH creeping back into any one
    // emitter can't hide behind a fixture that never reaches it.
    it("still emits no HATCH with a coloured room, a coloured device header, every annotation shape and the colour key all in play", () => {
      const rf = (node: SchematicNode): ReactFlowInstance => ({
        getInternalNode: () => ({
          internals: {
            positionAbsolute: { x: node.position.x, y: node.position.y },
            handleBounds: { source: [], target: [] },
          },
        }),
      }) as unknown as ReactFlowInstance;

      const dxf = buildMinimalDxf((w) => {
        const room = {
          id: "r1", type: "room", position: { x: 0, y: 0 },
          measured: { width: 400, height: 300 },
          data: { label: "Booth", color: "#ff0000" },
        } as unknown as SchematicNode;
        emitRoom(w, room, rf(room));

        const device = {
          id: "d1", type: "device", position: { x: 0, y: 400 },
          measured: { width: 144, height: 80 },
          data: {
            label: "Rack", headerColor: "#0000ff",
            ports: [{ id: "p1", label: "In", direction: "input", signalType: "hdmi" }],
          },
        } as unknown as SchematicNode;
        emitDevice(w, device, rf(device), [], undefined, "USD", {});

        for (const shape of ["rectangle", "ellipse", "circle", "diamond", "triangle"] as const) {
          const ann = {
            id: `a-${shape}`, type: "annotation", position: { x: 500, y: 0 },
            measured: { width: 100, height: 80 },
            data: { shape, color: "#00ff00" },
          } as unknown as SchematicNode;
          emitAnnotation(w, ann, rf(ann));
        }

        emitLegend(
          w,
          [{
            id: "e1", source: "d1", target: "d1", sourceHandle: "p1", targetHandle: "p1",
            data: { signalType: "hdmi" },
          }] as unknown as ConnectionEdge[],
          undefined, undefined, undefined,
          { x: 0, y: 0 }, { x: 10, y: 10 },
        );
      });

      const stream = rawEntityStream(dxf);
      expect(stream.some((e) => e.type === "HATCH")).toBe(false);
      // Confirms every opt-in path above actually fired a fill, not just that HATCH is
      // absent because nothing tried to fill anything.
      expect(stream.filter((e) => e.type === "SOLID").length).toBeGreaterThanOrEqual(8);
    });

    it("writes each cable ID as a SOLID ground, then a border, then the text", () => {
      // Device names live on the labels layer too, so read only the chip entities.
      const chipTriple = rawEntityStream(exportEdges())
        .filter((e) => e.layer === CANONICAL_LAYERS.LABELS && e.type !== "TEXT")
        .map((e) => e.type);
      // Two connections, so the pass drains two identical triples back to back.
      expect(chipTriple).toEqual([
        "SOLID", "LWPOLYLINE", "MTEXT",
        "SOLID", "LWPOLYLINE", "MTEXT",
      ]);
    });

    it("writes each chip as a SOLID carrying the AcDbTrace subclass and four corners", () => {
      const chip = rawEntityStream(exportEdges())
        .find((e) => e.type === "SOLID" && e.layer === CANONICAL_LAYERS.LABELS);
      expect(chip).toBeDefined();
      const codes = chip!.pairs.map(([c]) => c);
      // AcDbEntity then AcDbTrace — a missing subclass marker is an instant reject.
      expect(chip!.pairs.filter(([c]) => c === "100").map(([, v]) => v))
        .toEqual(["AcDbEntity", "AcDbTrace"]);
      // All four corners, each with its full x/y/z triple.
      for (const corner of [["10", "20", "30"], ["11", "21", "31"], ["12", "22", "32"], ["13", "23", "33"]]) {
        for (const code of corner) expect(codes.filter((c) => c === code).length).toBe(1);
      }
    });

    it("orders the corners so the quad is a rectangle, not a bow tie", () => {
      const chip = rawEntityStream(exportEdges())
        .find((e) => e.type === "SOLID" && e.layer === CANONICAL_LAYERS.LABELS)!;
      // SOLID paints 10 → 11 → 13 → 12. Writing outline order straight through swaps the
      // far edge and the fill crosses itself, leaving the text half masked.
      const [c0, c1, c2, c3] = solidCorners(chip);
      expect(c0.y).toBeCloseTo(c1.y, 9); // 10-11 is one full edge
      expect(c2.y).toBeCloseTo(c3.y, 9); // 12-13 is the opposite edge
      expect(c0.x).toBeCloseTo(c2.x, 9); // and they run the same direction
      expect(c1.x).toBeCloseTo(c3.x, 9);
      expect(c0.y).not.toBeCloseTo(c2.y, 6);
    });
  });
});

describe("DxfWriter — solid fills (#333)", () => {
  function entities(emit: (w: DxfWriter) => void) {
    return rawEntityStream(buildMinimalDxf(emit));
  }

  it("fills a convex polygon with SOLID quads covering the whole shape", () => {
    // A diamond, the shape an annotation uses.
    const pts = [{ x: 2, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 2 }];
    const solids = entities((w) => w.addSolidFillPolygon("TEST", pts));
    expect(solids.map((e) => e.type)).toEqual(["SOLID"]);
    const b = maskBounds(solids[0]);
    expect(b).toEqual({ x1: 0, y1: 0, x2: 4, y2: 4 });
  });

  it("fans an odd-cornered polygon into quad + triangle, never a HATCH", () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    const solids = entities((w) => w.addSolidFillPolygon("TEST", pts));
    expect(solids.map((e) => e.type)).toEqual(["SOLID", "SOLID"]);
    // The tail triangle repeats its last corner, which is how SOLID spells a triangle.
    const tail = solidCorners(solids[1]);
    expect(tail[2]).toEqual(tail[3]);
  });

  it("polygonises an ellipse fill rather than emitting a HATCH boundary", () => {
    const solids = entities((w) => w.addSolidFillEllipse("TEST", 5, 5, 2, 0, 0.5));
    expect(solids.length).toBeGreaterThan(4);
    expect(solids.every((e) => e.type === "SOLID")).toBe(true);
    const xs = solids.flatMap((e) => solidCorners(e).map((c) => c.x));
    const ys = solids.flatMap((e) => solidCorners(e).map((c) => c.y));
    expect(Math.min(...xs)).toBeCloseTo(3, 3);
    expect(Math.max(...xs)).toBeCloseTo(7, 3);
    expect(Math.min(...ys)).toBeCloseTo(4, 3);
    expect(Math.max(...ys)).toBeCloseTo(6, 3);
  });

  it("ignores degenerate input instead of writing a two-corner fill", () => {
    expect(entities((w) => w.addSolidFillPolygon("TEST", [{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toEqual([]);
    expect(entities((w) => w.addSolidFillEllipse("TEST", 0, 0, 0, 0, 1))).toEqual([]);
  });
});

// True colour (group 420) is an R2004 group. Every export carried it and nothing else —
// no entity in the whole document had an ACI at all — while the header still called the
// file R2000, so any reader entitled to drop 420 fell back to BYLAYER and took its colour
// from the layer. Half those layers were ACI 7, the adaptive white/black pseudo-colour,
// so device names and device boxes came in white and simply weren't there on a white
// page. Two invariants close it: the header names a version where 420 is legal, and 62
// always rides along beside 420.
describe("colour fallback — group 62 always accompanies group 420", () => {
  /** A document touching every emitter that colours anything: room fill and border,
   *  device box/header/name/ports/section rules, all five annotation shapes, and the
   *  colour key. */
  function richDocument(): RawEntity[] {
    const rf = (node: SchematicNode): ReactFlowInstance => ({
      getInternalNode: () => ({
        internals: {
          positionAbsolute: { x: node.position.x, y: node.position.y },
          handleBounds: {
            source: [{ id: "p1", x: 0, y: 24, width: 8, height: 8 }],
            target: [],
          },
        },
      }),
    }) as unknown as ReactFlowInstance;

    return rawEntityStream(buildMinimalDxf((w) => {
      const room = {
        id: "r1", type: "room", position: { x: 0, y: 0 },
        measured: { width: 400, height: 300 },
        data: { label: "Booth", color: "#ff0000" },
      } as unknown as SchematicNode;
      emitRoom(w, room, rf(room));

      // A second room with no colour of its own — the BYLAYER case that used to
      // inherit ACI 7 from the layer.
      const plainRoom = {
        id: "r2", type: "room", position: { x: 0, y: 700 },
        measured: { width: 400, height: 300 },
        data: { label: "Corridor" },
      } as unknown as SchematicNode;
      emitRoom(w, plainRoom, rf(plainRoom));

      const device = {
        id: "d1", type: "device", position: { x: 0, y: 400 },
        measured: { width: 144, height: 80 },
        data: {
          label: "Rack",
          ports: [{ id: "p1", label: "In", direction: "output", signalType: "hdmi" }],
        },
      } as unknown as SchematicNode;
      emitDevice(w, device, rf(device), [], undefined, "USD", {});

      for (const shape of ["rectangle", "ellipse", "circle", "diamond", "triangle"] as const) {
        const ann = {
          id: `a-${shape}`, type: "annotation", position: { x: 500, y: 0 },
          measured: { width: 100, height: 80 },
          data: { shape, label: "Note" },
        } as unknown as SchematicNode;
        emitAnnotation(w, ann, rf(ann));
      }

      emitLegend(
        w,
        [{
          id: "e1", source: "d1", target: "d1", sourceHandle: "p1", targetHandle: "p1",
          data: { signalType: "hdmi" },
        }] as unknown as ConnectionEdge[],
        undefined, undefined, undefined,
        { x: 0, y: 0 }, { x: 10, y: 10 },
      );
    }));
  }

  it("gives every entity an explicit colour — nothing is left BYLAYER", () => {
    const bylayer = richDocument().filter(
      (e) => !e.pairs.some(([c]) => c === "62") && !e.pairs.some(([c]) => c === "420"),
    );
    expect(bylayer.map((e) => `${e.type} on ${e.layer}`)).toEqual([]);
  });

  it("never writes a true colour without an ACI fallback beside it", () => {
    const orphaned = richDocument().filter(
      (e) => e.pairs.some(([c]) => c === "420") && !e.pairs.some(([c]) => c === "62"),
    );
    expect(orphaned.map((e) => `${e.type} on ${e.layer}`)).toEqual([]);
  });

  it("derives the ACI fallback from the true colour", () => {
    const dxf = buildMinimalDxf((w) => {
      w.addLine("TEST", 0, 0, 1, 1, { trueColor: 0xff0000 });   // red   -> 1
      w.addLine("TEST", 0, 0, 1, 1, { trueColor: 0xffffff });   // white -> 255
      w.addLine("TEST", 0, 0, 1, 1, { trueColor: 0x808080 });   // grey  -> 8
      // An explicit aci is an override, not a suggestion.
      w.addLine("TEST", 0, 0, 1, 1, { trueColor: 0xffffff, aci: 9 });
    });
    const acis = rawEntityStream(dxf)
      .filter((e) => e.type === "LINE")
      .map((e) => e.pairs.find(([c]) => c === "62")![1]);
    expect(acis).toEqual(["1", "255", "8", "9"]);
  });

  // The fallback exists to keep signals TELLABLE APART when 420 is dropped, so the
  // palette may only contain colours worth landing on. A near-black candidate was
  // briefly in it and, sitting near the centroid of the mid-dark saturated colours the
  // app actually ships, it swallowed 20 of the 73 signal types — NDI green and DigiLink
  // orange both came out grey. Nearest-match must resolve to the nearest HUE.
  it("resolves each signal colour to its nearest hue, not to a neutral", () => {
    expect(rgbToAci(...hexToRgb(DEFAULT_SIGNAL_COLORS.ndi))).toBe(3);              // green
    expect(rgbToAci(...hexToRgb(DEFAULT_SIGNAL_COLORS.rtmp))).toBe(3);             // green
    expect(rgbToAci(...hexToRgb(DEFAULT_SIGNAL_COLORS.digilink))).toBe(1);         // red
    expect(rgbToAci(...hexToRgb(DEFAULT_SIGNAL_COLORS["control-voltage"]))).toBe(1);
    expect(rgbToAci(128, 128, 128)).toBe(8);      // a real grey may still be grey
    expect(rgbToAci(255, 255, 255)).toBe(255);    // white, never the adaptive 7
    expect(rgbToAci(0, 0, 0)).toBe(8);            // black has always landed on 8
  });

  it("keeps every signal type on a hue layer — no neutral sink", () => {
    const sigs = Object.keys(DEFAULT_SIGNAL_COLORS) as SignalType[];
    const layers = buildLayerDefs(new Set(sigs), undefined)
      .filter((l) => l.name.startsWith("EasySchematic-Connections-"));
    expect(layers.length).toBe(sigs.length);
    // 250 is reachable only by asking for it (INK); nearest-match must never produce it.
    expect(layers.filter((l) => l.color === 250).map((l) => l.name)).toEqual([]);
    expect(layers.filter((l) => l.color === 7).map((l) => l.name)).toEqual([]);
    // ACI 8 is a legitimate answer — a genuinely desaturated mid-dark signal colour
    // has no nearer hue in a nine-entry palette — but it must not become the sink
    // that 250 was, so hold the line at the count this palette actually produces.
    expect(layers.filter((l) => l.color === 8).length).toBe(37);
  });

  // The layer's own ACI and an entity's derived ACI come from the same function, so a
  // signal-coloured connection can never disagree with the layer it sits on.
  it("derives the same ACI for an entity as for its layer, given one colour", () => {
    const hex = DEFAULT_SIGNAL_COLORS.ndi;
    const [layer] = buildLayerDefs(new Set(["ndi"] as SignalType[]), undefined)
      .filter((l) => l.name === signalLayerName("ndi"));
    const dxf = buildMinimalDxf((w) => {
      w.addLine("TEST", 0, 0, 1, 1, { trueColor: rgbToTrueColor(...hexToRgb(hex)) });
    });
    const entityAci = rawEntityStream(dxf)
      .find((e) => e.type === "LINE")!
      .pairs.find(([c]) => c === "62")![1];
    expect(Number(entityAci)).toBe(layer.color);
  });
});

// A port whose own id ends in "-in" or "-out" used to be dropped from the drawing: the
// handle id was stripped back to a port id unconditionally, so the lookup asked for a
// port that does not exist and the label was skipped. Fourteen of the seeded fixture's
// ports are named that way — both Powered Speakers lost every port they had — and
// nothing failed, the ports were just missing. Ids here follow the fixture's shape.
describe("emitDevice — ports whose ids end in -in / -out (#306 pattern)", () => {
  const ports = [
    // Named -in / -out, and NOT bidirectional: the handle id IS the port id.
    { id: "spk-iec-in", label: "IEC AC In", direction: "input", signalType: "power" },
    { id: "spk-xlr-in", label: "XLR In", direction: "input", signalType: "analog-audio" },
    { id: "combo-xlr-out", label: "XLR Out", direction: "output", signalType: "analog-audio" },
    { id: "laptop-hdmi-out", label: "HDMI Out", direction: "output", signalType: "hdmi" },
    // Plain names, to prove the fix doesn't cost the ordinary case.
    { id: "amp-power", label: "AC In", direction: "input", signalType: "power" },
    { id: "deck-trs-out-l", label: "TRS Out L", direction: "output", signalType: "analog-audio" },
    // Bidirectional: two handles, "<id>-in" and "<id>-out", one shared label. Stripping
    // still has to happen for these — the port id itself is "sw-port-1".
    { id: "sw-port-1", label: "Port 1", direction: "bidirectional", signalType: "ethernet" },
    // Passthrough: "<id>-rear" and "<id>-front", labelled on both faces.
    { id: "pp-1", label: "Cat6 Circuit", direction: "passthrough", signalType: "ethernet" },
  ];

  const device = {
    id: "dev-ports", type: "device", position: { x: 0, y: 0 },
    measured: { width: 176, height: 240 },
    data: { label: "Port Names", ports },
  } as unknown as SchematicNode;

  /** React Flow stand-in that publishes the handles the canvas actually renders:
   *  one per port, except bidirectional (-in/-out) and passthrough (-rear/-front). */
  function instanceWithHandles(node: SchematicNode): ReactFlowInstance {
    const handleIds = (node.data as { ports: typeof ports }).ports.flatMap((p) =>
      p.direction === "bidirectional" ? [`${p.id}-in`, `${p.id}-out`]
      : p.direction === "passthrough" ? [`${p.id}-rear`, `${p.id}-front`]
      : [p.id],
    );
    const bounds = handleIds.map((id, i) => ({ id, x: 0, y: 24 + i * 16, width: 8, height: 8 }));
    return {
      getInternalNode: () => ({
        internals: {
          positionAbsolute: { x: node.position.x, y: node.position.y },
          handleBounds: { source: bounds, target: [] },
        },
      }),
    } as unknown as ReactFlowInstance;
  }

  function portLabels() {
    const dxf = buildMinimalDxf((w) => {
      emitDevice(w, device, instanceWithHandles(device), [], undefined, "USD", {});
    });
    return rawEntityStream(dxf)
      .filter((e) => e.type === "TEXT" && e.layer === CANONICAL_LAYERS.PORTS)
      .map((e) => e.pairs.find(([c]) => c === "1")![1]);
  }

  it("labels ports whose own ids end in -in or -out", () => {
    const labels = portLabels();
    for (const expected of ["IEC AC In", "XLR In", "XLR Out", "HDMI Out"]) {
      expect(labels).toContain(expected);
    }
  });

  it("still resolves bidirectional and passthrough handles by stripping the suffix", () => {
    const labels = portLabels();
    // One label for the bidirectional port even though it owns two handles...
    expect(labels.filter((l) => l === "Port 1").length).toBe(1);
    // ...and one per face for the passthrough port, which owns two as well.
    expect(labels.filter((l) => l === "Cat6 Circuit").length).toBe(2);
  });

  it("emits a label for every handle the canvas renders, and no more", () => {
    // 6 single-handle ports (1 label each) + 1 bidirectional (2 handles, 1 label)
    // + 1 passthrough (2 handles, 2 labels) = 10 handles, 9 labels.
    expect(portLabels().length).toBe(9);
  });
});

describe("buildDxf — stub labels (#319)", () => {
  // One logical connection split into two legs sharing a linkedConnectionId, each ending
  // at a stub-label node — the shape convertEdgeToStubs produces.
  const LINKED = "lnk-7f31";

  const nodes = [
    {
      id: "dev-rack-switch",
      type: "device",
      position: { x: 0, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "Rack Switch", ports: [{ id: "port-12", label: "Port 12", direction: "output", signalType: "ethernet" }] },
    },
    {
      id: "stub-a",
      type: "stub-label",
      position: { x: 208, y: 33 },
      measured: { width: 96, height: 14 },
      data: { signalType: "ethernet", linkedConnectionId: LINKED, side: "source", placed: true },
    },
    {
      id: "stub-b",
      type: "stub-label",
      position: { x: 900, y: 33 },
      measured: { width: 96, height: 14 },
      data: { signalType: "ethernet", linkedConnectionId: LINKED, side: "target", placed: true },
    },
    {
      id: "dev-lobby-display",
      type: "device",
      position: { x: 1060, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "Lobby Display", ports: [{ id: "port-1", label: "LAN 1", direction: "input", signalType: "ethernet" }] },
    },
  ] as unknown as SchematicNode[];

  const edges = [
    { id: "e-leg-a", source: "dev-rack-switch", target: "stub-a", sourceHandle: "port-12", targetHandle: "l", data: { signalType: "ethernet", cableId: "C-014", linkedConnectionId: LINKED } },
    { id: "e-leg-b", source: "stub-b", target: "dev-lobby-display", sourceHandle: "r", targetHandle: "port-1", data: { signalType: "ethernet", cableId: "C-014", linkedConnectionId: LINKED } },
  ] as unknown as ConnectionEdge[];

  const routedEdges = {
    "e-leg-a": straightRoute(144, 40, 208),
    "e-leg-b": straightRoute(996, 40, 1060),
  };

  afterEach(resetExportStore);

  function exportWithStubs(over: Record<string, unknown> = {}) {
    useSchematicStore.setState({
      nodes, edges, routedEdges,
      stubLabelShowArrow: DEFAULT_STUB_LABEL_SHOW_ARROW,
      stubLabelShowPort: true, stubLabelShowRoom: false, stubLabelPageMode: "cross-page",
      cableIdLabelMode: "endpoint", cableIdGap: 4,
      colorKeyEnabled: false, printView: false,
      ...over,
    });
    const dxf = buildDxf(instanceFor(nodes));
    expect(dxf).not.toBeNull();
    return dxf!;
  }

  /** Every LABELS-layer MTEXT in emission order. Text arrives DXF-escaped, so compare
   *  against escapeForMText of the expected string rather than the raw glyphs. */
  function labelTexts(dxf: string): string[] {
    return (parse(dxf).entities as { type: string; layer: string; text?: string }[])
      .filter((e) => e.type === "MTEXT" && e.layer === CANONICAL_LAYERS.LABELS)
      .map((e) => e.text ?? "");
  }

  it("writes the stub label text the canvas shows, not just the cable ID", () => {
    const texts = labelTexts(exportWithStubs());
    // Both stubs name the far device across the split, with its far-end port.
    expect(texts).toContain(escapeForMText("Lobby Display [LAN 1]"));
    expect(texts).toContain(escapeForMText("Rack Switch [Port 12]"));
  });

  it("omits the direction arrow by default and restores it with the option on (#350)", () => {
    expect(labelTexts(exportWithStubs())).toContain(escapeForMText("Lobby Display [LAN 1]"));
    const withArrows = labelTexts(exportWithStubs({ stubLabelShowArrow: true }));
    expect(withArrows).toContain(escapeForMText("→ Lobby Display [LAN 1]"));
    expect(withArrows).toContain(escapeForMText("← Rack Switch [Port 12]"));
  });

  it("lets a single stub opt back into the arrow while the schematic default is off", () => {
    const withOverride = nodes.map((n) =>
      n.id === "stub-a" ? { ...n, data: { ...n.data, showArrow: true } } : n,
    ) as unknown as SchematicNode[];
    const texts = labelTexts(exportWithStubs({ nodes: withOverride }));
    expect(texts).toContain(escapeForMText("→ Lobby Display [LAN 1]"));
    expect(texts).toContain(escapeForMText("Rack Switch [Port 12]"));
  });

  // The canvas suppresses the endpoint cable ID at a stub end: the stub box already
  // names the connection there, so printing the ID at the device port AND the stub
  // would put four IDs on one logical cable. The DXF used to emit all four, and the
  // stub pill's opaque fill then clipped the two it overlapped (#319).
  it("suppresses the cable ID at the stub end of each leg", () => {
    const texts = labelTexts(exportWithStubs());
    expect(texts.filter((t) => t === "C-014").length).toBe(2); // one per leg, device end only
  });

  it("keeps the cable ID at the stub end when the mode is midpoint", () => {
    // Midpoint labels aren't at an endpoint at all, so nothing is suppressed —
    // matching OffsetEdge, which only guards the endpoint branch.
    const texts = labelTexts(exportWithStubs({ cableIdLabelMode: "midpoint" }));
    expect(texts.filter((t) => t === "C-014").length).toBe(2);
  });

  it("honours the per-stub port toggle", () => {
    const texts = labelTexts(exportWithStubs({ stubLabelShowPort: false }));
    expect(texts).toContain(escapeForMText("Lobby Display"));
    expect(texts).toContain(escapeForMText("Rack Switch"));
  });

  /** The stub-a node with a per-stub labelMode set. */
  function withLabelMode(mode: string): SchematicNode[] {
    return nodes.map((n) =>
      n.id === "stub-a" ? { ...n, data: { ...n.data, labelMode: mode } } : n,
    ) as unknown as SchematicNode[];
  }

  // #270's whole point is that the mode reaches every surface from the one shared
  // composer. DXF is the surface where that plumbing is testable, so it is pinned here:
  // drop `labelMode` from emitStubLabel's options and the CAD drawing goes back to
  // printing the destination the reporter asked to remove.
  it("honours the per-stub cable-ID-only mode (#270)", () => {
    const texts = labelTexts(exportWithStubs({ nodes: withLabelMode("cableId") }));
    expect(texts).not.toContain(escapeForMText("Lobby Display [LAN 1]"));
    // Two device-end chips (the stub ends stay suppressed) plus the tag itself.
    expect(texts.filter((t) => t === "C-014").length).toBe(3);
    // The partner stub was not switched and still names its destination.
    expect(texts).toContain(escapeForMText("Rack Switch [Port 12]"));
  });

  // The tag has to print the ID the store derived, not a stale one left on the edge —
  // the leg chips still come from edge.data.cableId, which is what makes the two
  // distinguishable here.
  it("takes the cable ID for the tag from the store's map (#270)", () => {
    const texts = labelTexts(exportWithStubs({
      nodes: withLabelMode("cableId"),
      cableIdMap: { "e-leg-a": "C-777", "e-leg-b": "C-777" },
    }));
    expect(texts).toContain("C-777");
    expect(texts.filter((t) => t === "C-014").length).toBe(2);
  });

  it("marks a cable-ID tag on an unnumbered connection rather than leaving it blank (#270)", () => {
    const unnumbered = edges.map(
      (e) => ({ ...e, data: { ...e.data, cableId: undefined } }),
    ) as unknown as ConnectionEdge[];
    const texts = labelTexts(exportWithStubs({
      nodes: withLabelMode("cableId"),
      edges: unnumbered,
    }));
    expect(texts).toContain(escapeForMText(MISSING_CABLE_ID));
  });

  it("leaves the cable ID out of the display-case transform (#270)", () => {
    useSchematicStore.setState({ labelCase: "lowercase" });
    const texts = labelTexts(exportWithStubs({ nodes: withLabelMode("cableId") }));
    // Tag plus the two device-end chips, none of them case-folded.
    expect(texts.filter((t) => t === "C-014").length).toBe(3);
    expect(texts).not.toContain("c-014");
  });

  /** Index of the mask whose bounds are the given stub node's box, or -1. */
  function stubPillIndex(stream: ReturnType<typeof rawEntityStream>, x: number, y: number, w: number, h: number) {
    return stream.findIndex((e) => {
      if (e.type !== "SOLID" || e.layer !== CANONICAL_LAYERS.LABELS) return false;
      const b = maskBounds(e);
      return Math.abs(b.x1 - x / DPI) < 1e-6 && Math.abs(b.y1 + (y + h) / DPI) < 1e-6
        && Math.abs(b.x2 - b.x1 - w / DPI) < 1e-6 && Math.abs(b.y2 - b.y1 - h / DPI) < 1e-6;
    });
  }

  it("draws each stub pill as an opaque fill plus an outline on the labels layer", () => {
    const stream = rawEntityStream(exportWithStubs());
    // Both stub node boxes are filled...
    expect(stubPillIndex(stream, 208, 33, 96, 14)).toBeGreaterThan(-1);
    expect(stubPillIndex(stream, 900, 33, 96, 14)).toBeGreaterThan(-1);
    // ...and outlined. Two pills + one chip per surviving cable ID (2) = 4 outlines.
    const outlines = stream.filter(
      (e) => e.type === "LWPOLYLINE" && e.layer === CANONICAL_LAYERS.LABELS,
    );
    expect(outlines.length).toBe(4);
  });

  // With the arrow off, a stub can resolve to no text at all — an unnamed far device
  // whose far-end port is unnamed too. The canvas and the PDF still draw the empty box,
  // so the DXF has to as well; only the MTEXT is skipped.
  it("still draws the pill for a stub whose text resolves to nothing (#350)", () => {
    const unnamed = nodes.map((n) =>
      n.id === "dev-lobby-display"
        ? { ...n, data: { label: "", ports: [{ id: "port-1", label: "", direction: "input", signalType: "ethernet" }] } }
        : n,
    ) as unknown as SchematicNode[];
    const dxf = exportWithStubs({ nodes: unnamed });

    expect(stubPillIndex(rawEntityStream(dxf), 208, 33, 96, 14)).toBeGreaterThan(-1);
    const texts = labelTexts(dxf);
    expect(texts).not.toContain("");
    expect(texts).toContain(escapeForMText("Rack Switch [Port 12]"));
  });

  it("emits the stub boxes after all connection geometry", () => {
    const stream = rawEntityStream(exportWithStubs());
    const lastGeometry = stream
      .map((e) => (e.type === "LINE" || e.type === "ARC") && e.layer.startsWith("EasySchematic-Connections-"))
      .lastIndexOf(true);
    expect(lastGeometry).toBeGreaterThan(-1);
    expect(stubPillIndex(stream, 208, 33, 96, 14)).toBeGreaterThan(lastGeometry);
    expect(stubPillIndex(stream, 900, 33, 96, 14)).toBeGreaterThan(lastGeometry);
  });

  it("follows the display-case preference like every other label", () => {
    useSchematicStore.setState({ labelCase: "uppercase" });
    const texts = labelTexts(exportWithStubs());
    expect(texts).toContain(escapeForMText("LOBBY DISPLAY [LAN 1]"));
  });

  // The stub pill is a mask like the cable-ID chip and needs the same two grounds:
  // the SOLID for readers that fill SOLID, the MTEXT background for readers that
  // don't. It had only the first, so the belt-and-braces stopped at the chip.
  it("grounds the stub pill twice, at plain white, exactly like the cable-ID chip", () => {
    const stream = rawEntityStream(exportWithStubs());

    const pills = [stubPillIndex(stream, 208, 33, 96, 14), stubPillIndex(stream, 900, 33, 96, 14)];
    for (const i of pills) {
      expect(i).toBeGreaterThan(-1);
      const byCode = new Map(stream[i].pairs);
      expect(byCode.get("62")).toBe("255");
      expect(byCode.get("420")).toBe(String(0xffffff));
    }

    // Every MTEXT on the labels layer — both stub texts and both cable IDs — carries
    // the background fill, at 255 rather than the adaptive 7.
    const labelMTexts = stream.filter(
      (e) => e.type === "MTEXT" && e.layer === CANONICAL_LAYERS.LABELS,
    );
    expect(labelMTexts.length).toBe(4);
    for (const m of labelMTexts) {
      const byCode = new Map(m.pairs);
      expect(byCode.get("90")).toBe("1");
      expect(byCode.get("63")).toBe("255");
    }
  });

  it("writes the MTEXT background groups in reference order (90, 45, 63, 441)", () => {
    const m = rawEntityStream(exportWithStubs())
      .find((e) => e.type === "MTEXT" && e.layer === CANONICAL_LAYERS.LABELS)!;
    const order = m.pairs
      .map(([c]) => c)
      .filter((c) => ["90", "45", "63", "441"].includes(c));
    expect(order).toEqual(["90", "45", "63", "441"]);
  });

  // The report behind #319 was a tag reading "C-014" where the editor shows the device,
  // its port and its room. All three parts have to survive the export together.
  it("carries device, port and room across, exactly as the tag composes them", () => {
    const inRoom = [
      {
        id: "room-lobby",
        type: "room",
        position: { x: 1040, y: -40 },
        measured: { width: 260, height: 200 },
        data: { label: "Lobby" },
      },
      ...nodes.map((n) =>
        n.id === "dev-lobby-display"
          ? { ...n, parentId: "room-lobby", position: { x: 20, y: 40 } }
          : n,
      ),
    ] as unknown as SchematicNode[];
    const texts = labelTexts(
      exportWithStubs({ nodes: inRoom, stubLabelShowRoom: true, stubLabelShowArrow: true }),
    );
    expect(texts).toContain(escapeForMText("→ Lobby Display [LAN 1] (Lobby)"));
    // The far end of the other leg has no room, so its tag simply omits the parens.
    expect(texts).toContain(escapeForMText("← Rack Switch [Port 12]"));
    // ...and the cable ID is still only at the device ends, never standing in for a tag.
    expect(texts.filter((t) => t === "C-014").length).toBe(2);
  });

  // A half-deleted connection leaves a stub whose partner leg resolves to nothing. The
  // canvas prints "?" there; the DXF used to drop the node, which left the leg's cable ID
  // as the only text at that end — the exact failure #319 is about.
  it("prints the canvas's '?' for a stub whose partner leg is gone", () => {
    const orphaned = edges.filter((e) => e.id === "e-leg-a");
    const dxf = exportWithStubs({
      edges: orphaned,
      routedEdges: { "e-leg-a": routedEdges["e-leg-a"] },
    });
    expect(labelTexts(dxf)).toContain("?");
    expect(stubPillIndex(rawEntityStream(dxf), 208, 33, 96, 14)).toBeGreaterThan(-1);
  });

  // ...except in cable-ID-only mode, where the tag's whole contract is the ID and the ID
  // is on the tag's OWN leg — the leg that survived. Printing "?" beside a wire still
  // carrying the number was #364.
  it("prints a cable-ID tag's own-leg ID when its partner leg is gone (#364)", () => {
    const orphaned = edges.filter((e) => e.id === "e-leg-a");
    const texts = labelTexts(exportWithStubs({
      nodes: withLabelMode("cableId"),
      edges: orphaned,
      routedEdges: { "e-leg-a": routedEdges["e-leg-a"] },
    }));
    // The tag itself plus the surviving leg's device-end chip — and no "?" from stub-a.
    expect(texts.filter((t) => t === "C-014").length).toBe(2);
    // stub-b lost its own leg as well, so nothing is left to name OR number there.
    expect(texts.filter((t) => t === "?").length).toBe(1);
  });

  // Canvas and DXF have to agree on the exception too: with the tag left in the default
  // mode the same orphaned stub still reads "?" in the CAD drawing.
  it("leaves the default-mode tag on '?' in the same orphaned drawing (#364)", () => {
    const orphaned = edges.filter((e) => e.id === "e-leg-a");
    const texts = labelTexts(exportWithStubs({
      edges: orphaned,
      routedEdges: { "e-leg-a": routedEdges["e-leg-a"] },
    }));
    expect(texts.filter((t) => t === "?").length).toBe(2);
    expect(texts.filter((t) => t === "C-014").length).toBe(1);
  });

  // Same-room tags drop the room name by default (#297), but an explicit per-tag
  // "Show room: On" still prints it — and only on that tag.
  it("prints the room on a same-room tag set to Show room: On, and omits it on the default tag", () => {
    const sameRoom = [
      {
        id: "room-hall",
        type: "room",
        position: { x: -40, y: -40 },
        measured: { width: 1400, height: 200 },
        data: { label: "Hall" },
      },
      ...nodes.map((n) => {
        if (n.id === "dev-rack-switch") return { ...n, parentId: "room-hall", position: { x: 40, y: 40 } };
        if (n.id === "dev-lobby-display") return { ...n, parentId: "room-hall", position: { x: 1100, y: 40 } };
        if (n.id === "stub-a") return { ...n, data: { ...(n.data as object), showRoom: true } };
        return n;
      }),
    ] as unknown as SchematicNode[];
    const texts = labelTexts(exportWithStubs({ nodes: sameRoom, stubLabelShowRoom: true }));
    // stub-a is explicitly On: it names the far device's room.
    expect(texts).toContain(escapeForMText("Lobby Display [LAN 1] (Hall)"));
    // stub-b follows the default, and both devices share a room, so no room text.
    expect(texts).toContain(escapeForMText("Rack Switch [Port 12]"));
  });
});

// ─── Stub labels across a hidden inline adapter (#348) ───────────────────────
//
// A hidden adapter reaches the DXF the way it reaches the canvas: as the 1x1 placeholder
// DeviceNode renders, far too small for emitDevice to fit even its name into. A stub tag
// naming it was a dead end on paper as well as on screen, so the exporter feeds the
// hidden set into the label resolver too.
describe("buildDxf — stub labels read past a hidden adapter (#348)", () => {
  const LINKED = "lnk-348a";

  // CAM-01 ─▶ [BNC barrel, hidden] ─▶ SWITCHER, with the camera half stubbed. The
  // switcher's port is bidirectional, so the adapter's far leg lands on "-in".
  const nodes = [
    {
      id: "dev-cam", type: "device", position: { x: 0, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "CAM-01", deviceType: "camera", ports: [{ id: "sdi-out-1", label: "SDI Out 1", direction: "output", signalType: "sdi" }] },
    },
    {
      id: "stub-a", type: "stub-label", position: { x: 208, y: 33 },
      measured: { width: 96, height: 14 },
      data: { signalType: "sdi", linkedConnectionId: LINKED, side: "source", placed: true },
    },
    {
      id: "stub-b", type: "stub-label", position: { x: 900, y: 33 },
      measured: { width: 96, height: 14 },
      data: { signalType: "sdi", linkedConnectionId: LINKED, side: "target", placed: true },
    },
    {
      id: "dev-adapter", type: "device", position: { x: 1060, y: 40 },
      measured: { width: 1, height: 1 },
      data: {
        label: "BNC (F) to BNC (M) Barrel", deviceType: "adapter",
        ports: [
          { id: "bnc-f-1", label: "BNC (F)", direction: "input", signalType: "sdi" },
          { id: "bnc-m-1", label: "BNC (M)", direction: "output", signalType: "sdi" },
        ],
      },
    },
    {
      id: "dev-switcher", type: "device", position: { x: 1200, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "SWITCHER", ports: [{ id: "sdi-io-1", label: "SDI I/O 1", direction: "bidirectional", signalType: "sdi" }] },
    },
  ] as unknown as SchematicNode[];

  const edges = [
    { id: "e-leg-a", source: "dev-cam", target: "stub-a", sourceHandle: "sdi-out-1", targetHandle: "l", data: { signalType: "sdi", cableId: "C-101", linkedConnectionId: LINKED } },
    { id: "e-leg-b", source: "stub-b", target: "dev-adapter", sourceHandle: "r", targetHandle: "bnc-f-1", data: { signalType: "sdi", cableId: "C-101", linkedConnectionId: LINKED } },
    { id: "e-adapter-switcher", source: "dev-adapter", target: "dev-switcher", sourceHandle: "bnc-m-1", targetHandle: "sdi-io-1-in", data: { signalType: "sdi", cableId: "C-102" } },
  ] as unknown as ConnectionEdge[];

  const routedEdges = {
    "e-leg-a": straightRoute(144, 40, 208),
    "e-leg-b": straightRoute(996, 40, 1060),
    "e-adapter-switcher": straightRoute(1061, 40, 1200),
  };

  afterEach(() => {
    resetExportStore();
    useSchematicStore.setState({ hiddenAdapterNodeIds: new Set() });
  });

  function stubLabelTexts(hidden: string[]) {
    useSchematicStore.setState({
      nodes, edges, routedEdges,
      hiddenAdapterNodeIds: new Set(hidden),
      stubLabelShowPort: true, stubLabelShowRoom: false, stubLabelPageMode: "never",
      cableIdLabelMode: "endpoint", cableIdGap: 4,
      colorKeyEnabled: false, printView: false,
    });
    const dxf = buildDxf(instanceFor(nodes));
    expect(dxf).not.toBeNull();
    return (parse(dxf!).entities as { type: string; layer: string; text?: string }[])
      .filter((e) => e.type === "MTEXT" && e.layer === CANONICAL_LAYERS.LABELS)
      .map((e) => e.text ?? "");
  }

  it("names the switcher, not the adapter the leg lands on", () => {
    const texts = stubLabelTexts(["dev-adapter"]);
    expect(texts).toContain(escapeForMText("SWITCHER [SDI I/O 1]"));
    expect(texts).not.toContain(escapeForMText("BNC (F) to BNC (M) Barrel [BNC (F)]"));
  });

  it("still names the adapter while the adapter is drawn", () => {
    const texts = stubLabelTexts([]);
    expect(texts).toContain(escapeForMText("BNC (F) to BNC (M) Barrel [BNC (F)]"));
  });
});

describe("buildDxf — Print View title block toggle (#388)", () => {
  const nodes = [
    {
      id: "dev-a",
      type: "device",
      position: { x: 0, y: 0 },
      measured: { width: 144, height: 80 },
      data: { label: "Device A", ports: [] },
    },
  ] as unknown as SchematicNode[];

  afterEach(resetExportStore);

  function titleBlockEntities(enabled: boolean) {
    useSchematicStore.setState({
      nodes, edges: [], routedEdges: {},
      colorKeyEnabled: false, printView: false,
      titleBlock: { title: "Main Hall" } as never,
      titleBlockLayout: createDefaultLayout(),
      printTitleBlockEnabled: enabled,
    });
    const dxf = buildDxf(instanceFor(nodes));
    expect(dxf).not.toBeNull();
    return (parse(dxf!).entities as { layer: string }[]).filter(
      (e) => e.layer === CANONICAL_LAYERS.TITLE_BLOCK,
    );
  }

  it("draws the title block when the toggle is on", () => {
    expect(titleBlockEntities(true).length).toBeGreaterThan(0);
  });

  it("omits the title block when the toggle is off", () => {
    expect(titleBlockEntities(false).length).toBe(0);
  });
});

// Per-connection line width (#415): a widened connection carries a heavier DXF
// lineweight (group 370); the default width keeps the 0.25mm every connection
// exported with before the feature existed.
describe("buildDxf — per-connection line width (#415)", () => {
  const devices: SchematicNode[] = [
    {
      id: "dev-router", type: "device", position: { x: 0, y: 0 }, measured: { width: 144, height: 80 },
      data: { label: "SDI Router", ports: [{ id: "sdi-out-1", label: "Out 1", direction: "output", signalType: "sdi" }] },
    },
    {
      id: "dev-monitor", type: "device", position: { x: 600, y: 0 }, measured: { width: 144, height: 80 },
      data: { label: "Monitor", ports: [{ id: "sdi-in-1", label: "In 1", direction: "input", signalType: "sdi" }] },
    },
    {
      id: "dev-camera", type: "device", position: { x: 0, y: 300 }, measured: { width: 144, height: 80 },
      data: { label: "Camera", ports: [{ id: "sdi-out-1", label: "SDI Out", direction: "output", signalType: "sdi" }] },
    },
    {
      id: "dev-ccu", type: "device", position: { x: 600, y: 300 }, measured: { width: 144, height: 80 },
      data: { label: "CCU", ports: [{ id: "sdi-in-1", label: "SDI In", direction: "input", signalType: "sdi" }] },
    },
  ] as unknown as SchematicNode[];

  afterEach(resetExportStore);

  function connectionLineweights(strokeWidth: number | undefined): Record<string, string[]> {
    const edges = [
      { id: "e-bus", source: "dev-router", target: "dev-monitor", sourceHandle: "sdi-out-1", targetHandle: "sdi-in-1",
        data: { signalType: "sdi", ...(strokeWidth !== undefined ? { strokeWidth } : {}) } },
      { id: "e-plain", source: "dev-camera", target: "dev-ccu", sourceHandle: "sdi-out-1", targetHandle: "sdi-in-1",
        data: { signalType: "sdi" } },
    ] as unknown as ConnectionEdge[];
    useSchematicStore.setState({
      nodes: devices, edges,
      routedEdges: { "e-bus": straightRoute(144, 40, 600), "e-plain": straightRoute(144, 340, 600) },
      colorKeyEnabled: false, printView: false,
    });
    const dxf = buildDxf(instanceFor(devices));
    expect(dxf).not.toBeNull();
    const byY: Record<string, string[]> = {};
    for (const e of rawEntityStream(dxf!)) {
      if (e.type !== "LINE" || !e.layer.startsWith("EasySchematic-Connections-")) continue;
      const y = e.pairs.find(([c]) => c === "20")?.[1] ?? "?";
      const lw = e.pairs.find(([c]) => c === "370")?.[1] ?? "none";
      (byY[y] ??= []).push(lw);
    }
    return byY;
  }

  it("keeps 0.25mm for connections without an override", () => {
    const lws = Object.values(connectionLineweights(undefined)).flat();
    expect(lws.length).toBeGreaterThanOrEqual(2);
    expect(new Set(lws)).toEqual(new Set(["25"]));
  });

  it("exports a widened connection heavier, leaving the other at 0.25mm", () => {
    const lws = Object.values(connectionLineweights(6)).flat();
    expect(lws).toContain("70");
    expect(lws).toContain("25");
  });
});
