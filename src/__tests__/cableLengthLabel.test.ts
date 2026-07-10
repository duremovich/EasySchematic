import { describe, it, expect } from "vitest";
import { resolveCableLengthLabel, computeEdgeLengthEstimate } from "../cableLengthLabel";
import { pairKey } from "../roomDistance";
import type { DistanceSettings, RoomData, SchematicNode } from "../types";

function makeRoom(id: string, parentId?: string): SchematicNode {
  return {
    id,
    type: "room",
    position: { x: 0, y: 0 },
    data: { label: id } as RoomData,
    ...(parentId ? { parentId } : {}),
  } as SchematicNode;
}

function makeDevice(id: string, parentId?: string): SchematicNode {
  return {
    id,
    type: "device",
    position: { x: 0, y: 0 },
    data: { label: id } as unknown as RoomData,
    ...(parentId ? { parentId } : {}),
  } as SchematicNode;
}

describe("resolveCableLengthLabel", () => {
  it("prefers the explicit override over the computed estimate", () => {
    expect(resolveCableLengthLabel("42 ft", "117.0 ft")).toBe("42 ft");
  });

  it("trims whitespace and treats a blank override as absent", () => {
    expect(resolveCableLengthLabel("  50 ft  ", "117.0 ft")).toBe("50 ft");
    expect(resolveCableLengthLabel("   ", "117.0 ft")).toBe("117.0 ft");
  });

  it("falls back to the computed estimate when no override is set", () => {
    expect(resolveCableLengthLabel(undefined, "117.0 ft")).toBe("117.0 ft");
    expect(resolveCableLengthLabel("", "117.0 ft")).toBe("117.0 ft");
  });

  it("returns empty when neither override nor estimate is available", () => {
    expect(resolveCableLengthLabel(undefined, undefined)).toBe("");
    expect(resolveCableLengthLabel("", "")).toBe("");
  });
});

describe("computeEdgeLengthEstimate", () => {
  const roomA = makeRoom("A");
  const roomB = makeRoom("B");
  const devA = makeDevice("dA", "A");
  const devB = makeDevice("dB", "B");
  const nodes = [roomA, roomB, devA, devB];
  const distances = { [pairKey("A", "B")]: 100 };

  it("returns undefined when no room distances are provided", () => {
    expect(computeEdgeLengthEstimate("A", "B", nodes, undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when the two endpoints resolve to the same room", () => {
    expect(computeEdgeLengthEstimate("A", "A", nodes, distances, undefined)).toBeUndefined();
  });

  it("applies the default slack (15% + 0) when no settings are given", () => {
    // 100 * 1.15 + 0 = 115.0, default unit is ft
    expect(computeEdgeLengthEstimate("A", "B", nodes, distances, undefined)).toBe("115.0 ft");
  });

  it("honours custom slack and unit from distance settings", () => {
    const settings: DistanceSettings = { unit: "m", slackPercent: 10, slackFixed: 5 };
    // 100 * 1.10 + 5 = 115.0 m
    expect(computeEdgeLengthEstimate("A", "B", nodes, distances, settings)).toBe("115.0 m");
  });

  it("resolves device endpoints through their parent rooms", () => {
    // Passing the device parent room ids directly, matching how OffsetEdge/cableSchedule call it.
    expect(computeEdgeLengthEstimate(devA.parentId, devB.parentId, nodes, distances, undefined)).toBe("115.0 ft");
  });
});
