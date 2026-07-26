import { describe, it, expect } from "vitest";
import { inferRackForm, MM_PER_U } from "../rackUtils";
import type { DeviceData } from "../types";

/** Minimal DeviceData for rack-form inference — only dims + override are read. */
function dev(partial: Partial<DeviceData>): DeviceData {
  return { label: "Test", deviceType: "custom", ports: [], ...partial } as DeviceData;
}

const FULL_DIMS = { widthMm: 482, heightMm: MM_PER_U }; // 19" panel, 1U
const HALF_DIMS = { widthMm: 220, heightMm: MM_PER_U }; // 9.5" panel, 1U

describe("inferRackForm", () => {
  describe("explicit rackForm override wins over the size heuristic", () => {
    it("full override beats half-width dimensions", () => {
      expect(inferRackForm(dev({ ...HALF_DIMS, rackForm: "full" }))).toBe("full");
    });

    it("half override beats full-width dimensions", () => {
      expect(inferRackForm(dev({ ...FULL_DIMS, rackForm: "half" }))).toBe("half");
    });

    it("shelf-only override beats full-width dimensions", () => {
      expect(inferRackForm(dev({ ...FULL_DIMS, rackForm: "shelf-only" }))).toBe("shelf-only");
    });

    it("override applies even with no dimensions at all", () => {
      expect(inferRackForm(dev({ rackForm: "half" }))).toBe("half");
    });
  });

  describe("without an override, falls back to the width/height heuristic", () => {
    it("infers full from a 19\" panel at whole-U height", () => {
      expect(inferRackForm(dev(FULL_DIMS))).toBe("full");
    });

    it("infers half from a 9.5\" panel at whole-U height", () => {
      expect(inferRackForm(dev(HALF_DIMS))).toBe("half");
    });

    it("returns unknown when both dimensions are missing", () => {
      expect(inferRackForm(dev({}))).toBe("unknown");
    });
  });
});
