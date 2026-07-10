import { describe, it, expect } from "vitest";
import { rackUnitLabel, inferRackHeightU, type RackSizable } from "../rackUtils";

const base: RackSizable = { deviceType: "processor", ports: [] };

describe("rackUnitLabel", () => {
  it("returns whole-U label for a standard 19\" rack-mount device", () => {
    // 1U = 44.45mm; a 2U panel ≈ 88.9mm tall, ~482mm wide
    expect(rackUnitLabel({ ...base, heightMm: 88.9, widthMm: 482 })).toBe("2U");
    expect(rackUnitLabel({ ...base, heightMm: 44.45, widthMm: 482 })).toBe("1U");
    expect(rackUnitLabel({ ...base, heightMm: 133.35, widthMm: 482 })).toBe("3U");
  });

  it("recognizes half-rack (9.5\") devices", () => {
    expect(rackUnitLabel({ ...base, heightMm: 44.45, widthMm: 220 })).toBe("1U");
  });

  it("is consistent with the rack builder's occupied-U math", () => {
    const d: RackSizable = { ...base, heightMm: 88.9, widthMm: 482 };
    expect(rackUnitLabel(d)).toBe(`${inferRackHeightU(d)}U`);
  });

  it("returns null for desktop / non-rack-mount devices", () => {
    // Small tabletop unit: fits on a shelf but isn't a rack panel
    expect(rackUnitLabel({ ...base, heightMm: 40, widthMm: 150 })).toBeNull();
    // Oversize (wider than the rack interior)
    expect(rackUnitLabel({ ...base, heightMm: 44.45, widthMm: 700 })).toBeNull();
  });

  it("returns null when dimensions are unknown", () => {
    expect(rackUnitLabel({ ...base })).toBeNull();
    // Height only, no width — can't confirm it's 19"
    expect(rackUnitLabel({ ...base, heightMm: 44.45 })).toBeNull();
  });

  it("honors an explicit rackForm override", () => {
    // Marked full-rack even though width is absent
    expect(rackUnitLabel({ ...base, heightMm: 44.45, rackForm: "full" })).toBe("1U");
    // Marked shelf-only despite rack-panel-like dimensions → no U
    expect(rackUnitLabel({ ...base, heightMm: 44.45, widthMm: 482, rackForm: "shelf-only" })).toBeNull();
  });
});
