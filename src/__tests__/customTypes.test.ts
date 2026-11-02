import { describe, it, expect } from "vitest";
import {
  checkTypeIdFormat,
  checkTypeIdAvailable,
  slugifyTypeId,
  validateNewCustomType,
  validateCustomTypeUpdate,
  suggestSimilarTypes,
  deviceTypeCandidates,
  buildDeviceTypeCatalog,
  checkSignalColor,
  nearestPassingColor,
  checkCablePrefix,
  typeCandidates,
  unknownPortTypes,
  type CustomTypeRecord,
} from "../customTypes";

const community: CustomTypeRecord[] = [
  { kind: "device", id: "rs232-converter", label: "RS-232 Converter", data: { category: "Control" }, status: "active" },
  { kind: "device", id: "old-thing", label: "Old Thing", data: { category: "Audio" }, status: "retired" },
];

describe("custom type ids", () => {
  it("accepts lowercase kebab slugs of 2–31 chars", () => {
    expect(checkTypeIdFormat("wireless-dmx-node")).toBeNull();
    expect(checkTypeIdFormat("a1")).toBeNull();
    expect(checkTypeIdFormat("a".repeat(31))).toBeNull();
  });

  it("refuses everything else", () => {
    for (const bad of ["", "a", "-lead", "Upper", "has space", "under_score", "a".repeat(32), 42, null]) {
      expect(checkTypeIdFormat(bad), String(bad)).not.toBeNull();
    }
  });

  it("slugifies free text into a valid id", () => {
    expect(slugifyTypeId("Wireless DMX Node")).toBe("wireless-dmx-node");
    expect(slugifyTypeId("  RS-232 / Serial box! ")).toBe("rs-232-serial-box");
    expect(checkTypeIdFormat(slugifyTypeId("x".repeat(40) + " y"))).toBeNull();
  });
});

describe("custom type id uniqueness", () => {
  it("refuses built-in device types", () => {
    expect(checkTypeIdAvailable("device", "wireless-dmx", [])).toContain("built-in");
  });

  it("refuses alias spellings, including the slug form of a non-slug alias", () => {
    expect(checkTypeIdAvailable("device", "pir-motion-sensor", [])).toContain('"pir-sensor"');
    expect(checkTypeIdAvailable("device", "passive-subwoofer", [])).toContain('"subwoofer"');
  });

  it("refuses existing community types, and points at unretire for retired ones", () => {
    expect(checkTypeIdAvailable("device", "rs232-converter", community)).toContain("already a community");
    expect(checkTypeIdAvailable("device", "old-thing", community)).toContain("Unretire");
  });

  it("scopes community uniqueness by kind and accepts a fresh id", () => {
    const signal = [{ kind: "signal" as const, id: "weco-3", status: "active" as const }];
    expect(checkTypeIdAvailable("device", "weco-3", signal)).toBeNull();
    expect(checkTypeIdAvailable("device", "wireless-dmx-node", community)).toBeNull();
  });
});

describe("validateNewCustomType", () => {
  const good = { kind: "device", id: "wireless-dmx-node", label: "Wireless DMX Node", data: { category: "Lighting" }, reasonOrUrl: "LumenRadio Stardust" };

  it("accepts a well-formed device type", () => {
    const r = validateNewCustomType(good, community);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.data).toEqual({ category: "Lighting" });
  });

  it("requires an existing category, a label and a reason", () => {
    expect(validateNewCustomType({ ...good, data: { category: "Lasers" } }, [])).toMatchObject({ ok: false });
    expect(validateNewCustomType({ ...good, label: " " }, [])).toMatchObject({ ok: false });
    expect(validateNewCustomType({ ...good, reasonOrUrl: "" }, [])).toMatchObject({ ok: false });
  });

});

// Stored signal / connector types the cross-checks see.
const stored: CustomTypeRecord[] = [
  { kind: "connector", id: "weco-3", label: "WECO 3-pin", data: { group: "Power", cable: "WECO", gender: "female", matesWith: [], adaptsTo: [] }, status: "active" },
  { kind: "signal", id: "show-comms", label: "Show Comms", data: { color: "#2563eb", group: "Audio", defaultConnector: "xlr-3", cable: "Comms", cablePrefix: "SHC" }, status: "active" },
];

describe("community signal types", () => {
  const signal = {
    kind: "signal", id: "weco-power", label: "WECO Power", reasonOrUrl: "#375",
    data: { color: "#2563eb", group: "Power", defaultConnector: "weco-3", cable: "WECO", cablePrefix: "WP" },
  };

  it("accepts a well-formed signal with a community default connector", () => {
    const r = validateNewCustomType(signal, stored);
    expect(r).toMatchObject({ ok: true, value: { data: { color: "#2563eb", defaultConnector: "weco-3", cablePrefix: "WP" } } });
  });

  it("refuses built-in signal ids and alias spellings", () => {
    expect(checkTypeIdAvailable("signal", "dante", [])).toContain("built-in signal");
    expect(checkTypeIdAvailable("signal", "rs232", [])).toContain('"serial"');
    expect(checkTypeIdAvailable("signal", "word-clock", [])).toContain('"wordclock"');
  });

  it("needs an existing group and a known default connector", () => {
    expect(validateNewCustomType({ ...signal, data: { ...signal.data, group: "Lasers" } }, stored)).toMatchObject({ ok: false });
    expect(validateNewCustomType({ ...signal, data: { ...signal.data, defaultConnector: "weco-9" } }, stored)).toMatchObject({ ok: false });
  });

  it("keeps cable-ID prefixes unique against built-ins and community signals", () => {
    expect(checkCablePrefix("AV", stored)).toContain('built-in signal "avb"');
    expect(checkCablePrefix("SHC", stored)).toContain('"show-comms"');
    expect(checkCablePrefix("SHC", stored, "show-comms")).toBeNull();
    for (const bad of ["S", "sc", "ABCDE", "A1"]) expect(checkCablePrefix(bad, stored), bad).not.toBeNull();
  });

  it("lets an edit keep its own prefix and colour", () => {
    const current = { ...stored[1], reasonOrUrl: "x" };
    expect(validateCustomTypeUpdate(current, { label: "Comms" }, stored)).toMatchObject({ ok: true });
    expect(validateCustomTypeUpdate(current, { data: { cablePrefix: "AV" } }, stored)).toMatchObject({ ok: false });
  });
});

describe("colour guardrail", () => {
  it("passes a mid-tone that reads on both canvases", () => {
    expect(checkSignalColor("#2563eb")).toMatchObject({ ok: true, hex: "#2563eb", problems: [] });
  });

  it("refuses non-hex and CSS variables", () => {
    expect(checkSignalColor("var(--color-sdi)").ok).toBe(false);
    expect(checkSignalColor("blue").hex).toBeNull();
  });

  it.each([
    ["#fde047", "too light"], // yellow on white
    ["#1e1b4b", "too dark"], // navy on slate-900
    ["#808080", "ACI 8"], // mid grey: passes contrast, lands on the grey DXF layer
  ])("refuses %s (%s) and suggests a nearby colour that passes", (hex, why) => {
    const c = checkSignalColor(hex);
    expect(c.ok).toBe(false);
    expect(c.problems.join(" ")).toContain(why);
    expect(c.suggestion).toMatch(/^#[0-9a-f]{6}$/);
    expect(checkSignalColor(c.suggestion).ok).toBe(true);
  });

  it("keeps the suggestion's hue: a failing yellow stays yellowish", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(nearestPassingColor("#fde047").slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("puts the suggestion in the validation failure", () => {
    const r = validateNewCustomType({
      kind: "signal", id: "pale", label: "Pale", reasonOrUrl: "x",
      data: { color: "#fde047", group: "Audio", defaultConnector: "xlr-3", cable: "Pale", cablePrefix: "PL" },
    }, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestedColor && checkSignalColor(r.suggestedColor).ok).toBe(true);
  });
});

describe("community connector types", () => {
  const connector = {
    kind: "connector", id: "test-hdbnc-like", label: "HD-BNC-ish", reasonOrUrl: "x",
    data: { group: "Video", cable: "Mini coax", gender: "female", adaptsTo: ["bnc"] },
  };

  it("accepts mating lists of built-in and community connectors, defaulting the absent one to []", () => {
    const r = validateNewCustomType({ ...connector, data: { ...connector.data, matesWith: ["weco-3"] } }, stored);
    expect(r).toMatchObject({ ok: true, value: { data: { matesWith: ["weco-3"], adaptsTo: ["bnc"], gender: "female" } } });
    expect(validateNewCustomType(connector, stored)).toMatchObject({ ok: true, value: { data: { matesWith: [] } } });
  });

  it("refuses unknown ids, self-mating, an id in both lists, a bad gender or group", () => {
    const bad = (data: Record<string, unknown>) => validateNewCustomType({ ...connector, data: { ...connector.data, ...data } }, stored);
    expect(bad({ matesWith: ["weco-9"] })).toMatchObject({ ok: false });
    expect(bad({ matesWith: ["test-hdbnc-like"] })).toMatchObject({ ok: false });
    expect(bad({ matesWith: ["bnc"], adaptsTo: ["bnc"] })).toMatchObject({ ok: false });
    expect(bad({ gender: "both" })).toMatchObject({ ok: false });
    expect(bad({ group: "Pneumatic" })).toMatchObject({ ok: false });
  });

  it("refuses built-in connector ids, including the slug form of one", () => {
    expect(checkTypeIdAvailable("connector", "xlr-3", [])).toContain("built-in connector");
    expect(checkTypeIdAvailable("connector", "trs-2-5mm", [])).toContain('"trs-2.5mm"');
    expect(checkTypeIdAvailable("connector", "weco-3", stored)).toContain("already a community connector");
  });
});

describe("did you mean: signals and connectors", () => {
  it("finds serial for 'RS232' through its alias", () => {
    const [top] = suggestSimilarTypes(["RS232", "rs232"], typeCandidates("signal", stored));
    expect(top).toMatchObject({ id: "serial", source: "built-in" });
  });

  it("finds the community signal and the built-in or community connector by label", () => {
    expect(suggestSimilarTypes("Show Comm", typeCandidates("signal", stored))[0]).toMatchObject({ id: "show-comms", source: "community" });
    expect(suggestSimilarTypes("HD BNC", typeCandidates("connector", stored))[0]).toMatchObject({ id: "hd-bnc", group: "Video" });
    expect(suggestSimilarTypes("weco 3 pin", typeCandidates("connector", stored))[0]).toMatchObject({ id: "weco-3", source: "community" });
  });
});

describe("unknownPortTypes", () => {
  it("lists port signal and connector ids nobody defined, rear/front faces included", () => {
    const ports = [
      { signalType: "sdi", connectorType: "bnc" },
      { signalType: "show-comms", connectorType: "weco-3" },
      { signalType: "shwo-comms", rearConnectorType: "weco-4", frontConnectorType: "rj45" },
    ];
    const known = new Set(["sdi", "bnc", "rj45", "show-comms", "weco-3"]);
    const has = (id: string) => known.has(id);
    expect(unknownPortTypes(ports, { signal: has, connector: has })).toEqual({ signals: ["shwo-comms"], connectors: ["weco-4"] });
  });
});

describe("validateCustomTypeUpdate", () => {
  const current = { kind: "device" as const, id: "rs232-converter", label: "RS-232 Converter", data: { category: "Control" }, status: "active" as const, reasonOrUrl: "x" };

  it("locks the id", () => {
    expect(validateCustomTypeUpdate(current, { id: "rs232-box" })).toMatchObject({ ok: false });
  });

  it("edits label/category and retires, keeping unsent fields", () => {
    const r = validateCustomTypeUpdate(current, { label: "RS-232 Box", data: { category: "Processing" }, status: "retired" });
    expect(r).toMatchObject({ ok: true, value: { label: "RS-232 Box", data: { category: "Processing" }, status: "retired", reasonOrUrl: "x" } });
  });
});

describe("did you mean", () => {
  const candidates = deviceTypeCandidates(community);

  it("finds the existing wireless-dmx for 'wireless dmx' as an exact match", () => {
    const [top] = suggestSimilarTypes("wireless dmx", candidates);
    expect(top).toMatchObject({ id: "wireless-dmx", source: "built-in", score: 1 });
  });

  it("ranks the RS-232 community type first for 'RS232 Box'", () => {
    const s = suggestSimilarTypes(["RS232 Box", "rs232-box"], candidates);
    expect(s[0]).toMatchObject({ id: "rs232-converter", source: "community" });
  });

  it("offers both halves for 'Wireless DMX Node'", () => {
    const ids = suggestSimilarTypes("Wireless DMX Node", candidates).map((s) => s.id);
    expect(ids).toContain("wireless-dmx");
    expect(ids).toContain("dmx-node");
  });

  it("finds a built-in through its alias spelling", () => {
    const [top] = suggestSimilarTypes("PIR motion sensor", candidates);
    expect(top).toMatchObject({ id: "pir-sensor", matched: "pir-motion-sensor" });
  });

  it("tolerates typos and flags retired matches", () => {
    expect(suggestSimilarTypes("Commentry Box", candidates)[0].id).toBe("commentary-box");
    expect(suggestSimilarTypes("old thing", candidates)[0]).toMatchObject({ id: "old-thing", retired: true });
  });

  it("returns nothing for unrelated text", () => {
    expect(suggestSimilarTypes("zzqx", candidates)).toEqual([]);
  });
});

describe("buildDeviceTypeCatalog", () => {
  it("adds active community types to the picker and keeps retired ones resolvable", () => {
    const cat = buildDeviceTypeCatalog(community);
    expect(cat.toCategory["rs232-converter"]).toBe("Control");
    expect(cat.byCategory.Control).toContain("rs232-converter");
    expect(cat.labels["old-thing"]).toBe("Old Thing");
    expect(cat.byCategory.Audio).not.toContain("old-thing");
  });
});
