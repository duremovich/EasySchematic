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

  it("refuses signal and connector kinds until P3", () => {
    const r = validateNewCustomType({ ...good, kind: "signal" }, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not supported yet");
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
