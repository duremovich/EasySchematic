import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";

import { DxfWriter } from "../dxfExport/writer";
import {
  CAP_HEIGHT_RATIO,
  cssFontPxToDxfHeight,
  escapeForMText,
  escapeForText,
  fmt,
  hexToRgb,
  rgbToTrueColor,
  sanitizeName,
  tintToWhite,
  truncateToWidth,
} from "../dxfExport/units";
import { LTYPE_DEFS, buildLayerDefs, signalLayerName } from "../dxfExport/layers";
import { emitRoundedWaypointPath } from "../dxfExport/geometry";

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
    expect(parsed.header.$ACADVER).toBe("AC1015");
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
