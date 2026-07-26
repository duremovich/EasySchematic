import { describe, it, expect } from "vitest";
import { autoNamePorts, duplicatePortLabel } from "../portNaming";
import type { PortDirection } from "../types";

const p = (label: string, direction: PortDirection) => ({ label, direction });

describe("autoNamePorts", () => {
  it("leaves named ports alone (but trims whitespace)", () => {
    const out = autoNamePorts([p("SDI In", "input"), p("  HDMI  ", "output")]);
    expect(out.map((x) => x.label)).toEqual(["SDI In", "HDMI"]);
  });

  it("auto-names blank ports per direction", () => {
    const out = autoNamePorts([
      p("", "input"),
      p("", "input"),
      p("", "output"),
      p("", "bidirectional"),
      p("", "passthrough"),
    ]);
    expect(out.map((x) => x.label)).toEqual([
      "Input 1",
      "Input 2",
      "Output 1",
      "Bidir 1",
      "Passthrough 1",
    ]);
  });

  it("does not collide with names already in use", () => {
    const out = autoNamePorts([p("Input 1", "input"), p("", "input")]);
    expect(out.map((x) => x.label)).toEqual(["Input 1", "Input 2"]);
  });

  it("treats whitespace-only labels as blank", () => {
    const out = autoNamePorts([p("   ", "input")]);
    expect(out[0].label).toBe("Input 1");
  });

  it("preserves other fields and order", () => {
    const out = autoNamePorts([
      { label: "", direction: "input" as PortDirection, id: "draft-x", signalType: "sdi" },
    ]);
    expect(out[0]).toMatchObject({ id: "draft-x", signalType: "sdi", label: "Input 1" });
  });
});

describe("duplicatePortLabel", () => {
  it("advances a trailing number to the next free value", () => {
    expect(duplicatePortLabel("Input 1", ["Input 1"])).toBe("Input 2");
  });

  it("skips numbers already in use when advancing", () => {
    expect(duplicatePortLabel("Input 1", ["Input 1", "Input 2", "Input 3"])).toBe("Input 4");
  });

  it("handles a number with no separating space", () => {
    expect(duplicatePortLabel("Camera3", ["Camera3"])).toBe("Camera4");
  });

  it("appends (copy) to an un-numbered name", () => {
    expect(duplicatePortLabel("HDMI", ["HDMI"])).toBe("HDMI (copy)");
  });

  it("uniquifies (copy) with a counter", () => {
    expect(duplicatePortLabel("HDMI", ["HDMI", "HDMI (copy)"])).toBe("HDMI (copy 2)");
  });

  it("bumps an existing (copy) suffix instead of stacking it", () => {
    expect(duplicatePortLabel("HDMI (copy)", ["HDMI", "HDMI (copy)"])).toBe("HDMI (copy 2)");
    expect(duplicatePortLabel("HDMI (copy 2)", ["HDMI (copy 2)"])).toBe("HDMI (copy 3)");
  });

  it("keeps a blank source label blank (auto-named on save)", () => {
    expect(duplicatePortLabel("", ["Input 1"])).toBe("");
    expect(duplicatePortLabel("   ", [])).toBe("");
  });

  it("ignores blank existing labels when checking collisions", () => {
    expect(duplicatePortLabel("Input 1", ["Input 1", "", "  "])).toBe("Input 2");
  });
});
