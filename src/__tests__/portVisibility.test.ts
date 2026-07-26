import { describe, it, expect } from "vitest";
import { isPortConnected } from "../portVisibility";
import type { Port } from "../types";

const port = (over: Partial<Port>): Port => ({
  id: "p1",
  label: "P1",
  signalType: "hdmi",
  direction: "input",
  ...over,
});

describe("isPortConnected (#135 show-only-connected predicate)", () => {
  it("input/output port is connected when its own handle id has an edge", () => {
    const p = port({ id: "a", direction: "input" });
    expect(isPortConnected(p, new Set(["a"]))).toBe(true);
    expect(isPortConnected(p, new Set(["b"]))).toBe(false);
    expect(isPortConnected(p, new Set())).toBe(false);
  });

  it("output port keyed by the bare port id (source handle)", () => {
    const p = port({ id: "out1", direction: "output" });
    expect(isPortConnected(p, new Set(["out1"]))).toBe(true);
    // the -in/-out variants belong to bidirectional ports, not plain outputs
    expect(isPortConnected(p, new Set(["out1-out"]))).toBe(false);
  });

  it("bidirectional port is connected when either -in or -out is wired", () => {
    const p = port({ id: "bd", direction: "bidirectional" });
    expect(isPortConnected(p, new Set(["bd-in"]))).toBe(true);
    expect(isPortConnected(p, new Set(["bd-out"]))).toBe(true);
    expect(isPortConnected(p, new Set(["bd-in", "bd-out"]))).toBe(true);
    // the bare id is not a bidirectional handle
    expect(isPortConnected(p, new Set(["bd"]))).toBe(false);
    expect(isPortConnected(p, new Set())).toBe(false);
  });

  it("passthrough port (incl. expansion-slot/card ports) uses -rear/-front handles", () => {
    const p = port({ id: "pt", direction: "passthrough" });
    expect(isPortConnected(p, new Set(["pt-rear"]))).toBe(true);
    expect(isPortConnected(p, new Set(["pt-front"]))).toBe(true);
    expect(isPortConnected(p, new Set(["pt-rear", "pt-front"]))).toBe(true);
    expect(isPortConnected(p, new Set(["pt"]))).toBe(false);
    expect(isPortConnected(p, new Set())).toBe(false);
  });

  it("treats a stubbed connection as connected (stub leg retains the device handle id)", () => {
    // convertEdgeToStubs keeps `sourceHandle: edge.sourceHandle` on the stub leg, so the
    // device's handle id is still present in connectedHandles — a stub counts as connected.
    const p = port({ id: "s1", direction: "output" });
    const connectedFromStubLeg = new Set(["s1"]);
    expect(isPortConnected(p, connectedFromStubLeg)).toBe(true);
  });

  it("does not confuse similarly-prefixed handle ids", () => {
    const p = port({ id: "p1", direction: "input" });
    // "p10" shares the "p1" prefix but is a different port — must not match.
    expect(isPortConnected(p, new Set(["p10"]))).toBe(false);
  });
});
