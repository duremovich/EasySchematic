/**
 * Bundled-library additions: SDI snakes (#391) and D-series patch panels (#431).
 * Both are modelled on templates that already exist (Audio Snake XLR pairs, the XLR
 * patch panels), so these pin the shape the app relies on.
 */
import { describe, it, expect } from "vitest";
import { DEVICE_TEMPLATES } from "../deviceLibrary";

const byLabel = (label: string) => DEVICE_TEMPLATES.find((t) => t.label === label);

describe("SDI snake break-in / break-out (#391)", () => {
  it.each([4, 8, 12, 16])("%i-ch pair mirrors the audio snake structure", (n) => {
    const breakIn = byLabel(`SDI Snake (${n}-ch) Break-in`)!;
    const breakOut = byLabel(`SDI Snake (${n}-ch) Break-out`)!;
    expect(breakIn, "break-in").toBeDefined();
    expect(breakOut, "break-out").toBeDefined();
    expect(breakIn.deviceType).toBe("cable-accessory");
    expect(breakOut.deviceType).toBe("cable-accessory");

    const chIn = breakIn.ports.filter((p) => !p.isMulticable);
    expect(chIn).toHaveLength(n);
    for (const p of chIn) {
      expect(p.direction).toBe("input");
      expect(p.signalType).toBe("sdi");
      expect(p.connectorType).toBe("bnc");
    }
    const trunkOut = breakIn.ports.filter((p) => p.isMulticable);
    expect(trunkOut).toHaveLength(1);
    expect(trunkOut[0]).toMatchObject({ direction: "output", signalType: "sdi", channelCount: n });

    const chOut = breakOut.ports.filter((p) => !p.isMulticable);
    expect(chOut).toHaveLength(n);
    for (const p of chOut) expect(p).toMatchObject({ direction: "output", signalType: "sdi", connectorType: "bnc" });
    const trunkIn = breakOut.ports.filter((p) => p.isMulticable);
    expect(trunkIn).toHaveLength(1);
    expect(trunkIn[0]).toMatchObject({ direction: "input", signalType: "sdi", channelCount: n });
  });

  it("is searchable as a video snake", () => {
    expect(byLabel("SDI Snake (8-ch) Break-in")!.searchTerms).toEqual(expect.arrayContaining(["snake", "sdi", "bnc"]));
  });
});

describe("D-series patch panels (#431)", () => {
  it.each([16, 24, 32])("generic %i-way panel has passthrough circuits", (n) => {
    const t = byLabel(`D-Series Patch Panel ${n}-Way`)!;
    expect(t).toBeDefined();
    expect(t.deviceType).toBe("patch-panel");
    expect(t.ports).toHaveLength(n);
    for (const p of t.ports) {
      expect(p.direction).toBe("passthrough");
      expect(p.rearConnectorType).toBe("xlr-3");
      expect(p.frontConnectorType).toBe("xlr-3");
    }
  });

  it("includes the Penn Elcom R2269-1UK-16 (1U, 16 D-series holes)", () => {
    const t = DEVICE_TEMPLATES.find((x) => x.modelNumber === "R2269-1UK-16")!;
    expect(t).toBeDefined();
    expect(t.manufacturer).toBe("Penn Elcom");
    expect(t.deviceType).toBe("patch-panel");
    expect(t.ports).toHaveLength(16);
    expect(t.ports.every((p) => p.direction === "passthrough")).toBe(true);
    expect(t.heightMm).toBeCloseTo(44.45, 1);
  });

  it("every new template id is unique across the library", () => {
    const ids = DEVICE_TEMPLATES.map((t) => t.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
