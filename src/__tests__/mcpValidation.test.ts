import { describe, it, expect } from "vitest";
import { classifyDeviceProperties, resolveHandleFromCandidates } from "../mcp/validation";

describe("classifyDeviceProperties", () => {
  it("routes label and shortName to their dedicated buckets", () => {
    const r = classifyDeviceProperties({ label: "Main Display", shortName: "DISP-1" });
    expect(r.label).toBe("Main Display");
    expect(r.shortName).toBe("DISP-1");
    expect(r.patch).toEqual({});
    expect(r.applied.sort()).toEqual(["label", "shortName"]);
    expect(r.rejected).toEqual([]);
  });

  it("collects safe scalar fields into patch", () => {
    const r = classifyDeviceProperties({ manufacturer: "Crestron", unitCost: 1200, isSpare: true });
    expect(r.patch).toEqual({ manufacturer: "Crestron", unitCost: 1200, isSpare: true });
    expect(r.applied.sort()).toEqual(["isSpare", "manufacturer", "unitCost"]);
  });

  it("rejects non-scalar values for whitelisted fields (untrusted input)", () => {
    const r = classifyDeviceProperties({
      label: "OK",
      unitCost: { bad: 1 },
      note: ["nope"],
      manufacturer: null,
    } as Record<string, unknown>);
    expect(r.applied).toEqual(["label"]);
    expect(r.rejected.sort()).toEqual(["manufacturer", "note", "unitCost"]);
    expect(r.patch).toEqual({});
  });

  it("rejects structural / unknown fields and never patches them", () => {
    const r = classifyDeviceProperties({
      label: "OK",
      ports: "nope",
      slots: "nope",
      deviceType: "nope",
      bogus: "nope",
    } as Record<string, string>);
    expect(r.applied).toEqual(["label"]);
    expect(r.rejected.sort()).toEqual(["bogus", "deviceType", "ports", "slots"]);
    expect(r.patch).toEqual({});
  });
});

describe("resolveHandleFromCandidates", () => {
  it("uses the only handle for a plain port (face ignored)", () => {
    expect(resolveHandleFromCandidates(["hdmi1"], "hdmi1", undefined)).toEqual({
      ok: true,
      handleId: "hdmi1",
    });
  });

  it("errors when the port is missing", () => {
    const r = resolveHandleFromCandidates([], "hdmi1", undefined);
    expect(r.ok).toBe(false);
  });

  it("requires a face for a two-sided bidirectional port", () => {
    const r = resolveHandleFromCandidates(["lan-in", "lan-out"], "lan", undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/two sides/);
  });

  it("selects the requested face for a passthrough port", () => {
    expect(resolveHandleFromCandidates(["loop-rear", "loop-front"], "loop", "front")).toEqual({
      ok: true,
      handleId: "loop-front",
    });
  });

  it("rejects an invalid face", () => {
    const r = resolveHandleFromCandidates(["lan-in", "lan-out"], "lan", "rear");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid face/);
  });
});
