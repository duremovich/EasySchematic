import { describe, expect, it } from "vitest";
import { scoreTemplate } from "../templateSearch";
import type { DeviceTemplate } from "../types";

const speakerTemplate: DeviceTemplate = {
  id: "one-sound-cannon",
  deviceType: "speaker",
  label: "1 SOUND Cannon",
  manufacturer: "1 SOUND",
  modelNumber: "Cannon C8",
  ports: [
    { id: "speaker-in", label: "Speaker In", signalType: "speaker-level", direction: "input" },
  ],
};

const displayTemplate: DeviceTemplate = {
  id: "display",
  deviceType: "display",
  label: "Display",
  searchTerms: ["television", "screen"],
  ports: [
    { id: "hdmi-in", label: "HDMI In", signalType: "hdmi", direction: "input" },
  ],
};

describe("scoreTemplate", () => {
  it("does not match a screen query against speaker-only text", () => {
    expect(scoreTemplate(speakerTemplate, "screen")).toBe(0);
  });

  it("still matches curated aliases such as screen", () => {
    expect(scoreTemplate(displayTemplate, "screen")).toBeGreaterThan(0);
  });

  it("does not flood results for one-letter searches", () => {
    expect(scoreTemplate(speakerTemplate, "s")).toBe(0);
  });

  it("supports useful prefixes for real words", () => {
    expect(scoreTemplate(speakerTemplate, "speak")).toBeGreaterThan(0);
  });
});
