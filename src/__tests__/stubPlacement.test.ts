import { describe, it, expect } from "vitest";
import { healStubPortAlignment, snapStubHandleY, STUB_H_EST } from "../stubPlacement";
import type { SchematicNode, ConnectionEdge } from "../types";
import type { HandleSnapshot } from "../routing/handleSnapshot";

const device = (id: string, x: number, y: number): SchematicNode =>
  ({ id, type: "device", position: { x, y }, data: {} } as unknown as SchematicNode);
const stub = (id: string, x: number, y: number): SchematicNode =>
  ({ id, type: "stub-label", position: { x, y }, data: {}, measured: { width: 80, height: STUB_H_EST } } as unknown as SchematicNode);
const leg = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): ConnectionEdge =>
  ({ id, source, sourceHandle, target, targetHandle, data: { signalType: "sdi" } } as unknown as ConnectionEdge);

/** Snapshot with one device (port handle at deviceY+portRelY) and one stub. */
function snapshot(devY: number, portRelY: number, portHandleId: string, stubY: number): HandleSnapshot {
  return {
    dev: {
      type: "device",
      positionAbsolute: { x: 400, y: devY },
      source: [{ id: portHandleId, x: 175, y: portRelY - 3, width: 6, height: 6 }],
      target: [],
    },
    s1: {
      type: "stub-label",
      positionAbsolute: { x: 600, y: stubY },
      measuredHeight: STUB_H_EST,
      source: [],
      target: [{ id: "l", x: 0, y: STUB_H_EST / 2 - 3, width: 6, height: 6 }],
    },
  };
}

describe("snapStubHandleY", () => {
  it("lands the handle (top + h/2) on the nearest grid line", () => {
    expect(snapStubHandleY(100, 14) + 7).toBe(107 % 20 < 10 ? 100 : 120); // 107 → 100
    expect(snapStubHandleY(93, 14)).toBe(93);   // handle already at 100
    expect(snapStubHandleY(100, 14)).toBe(93);  // grid-aligned top → handle re-centered
  });
});

describe("healStubPortAlignment", () => {
  const nodes = (stubY: number) => [device("dev", 400, 100), stub("s1", 600, stubY)];
  const edges = [leg("e1", "dev", "p1", "s1", "l")];

  it("corrects sub-grid drift to the partner port row", () => {
    // Port at absolute y 100+60=160; aligned stub top = 153. Stub drifted to 160 (handle 167).
    const healed = healStubPortAlignment(nodes(160), edges, snapshot(100, 60, "p1", 160));
    expect(healed).not.toBeNull();
    expect(healed!.find((n) => n.id === "s1")!.position.y).toBe(153);
  });

  it("aligns to the REAL port even when the port is off-grid", () => {
    // Port at 100+63=163 (off-grid). Stub handle at 160 → expect top 163-7=156.
    const healed = healStubPortAlignment(nodes(153), edges, snapshot(100, 63, "p1", 153));
    expect(healed).not.toBeNull();
    expect(healed!.find((n) => n.id === "s1")!.position.y).toBe(156);
  });

  it("leaves aligned stubs alone", () => {
    expect(healStubPortAlignment(nodes(153), edges, snapshot(100, 60, "p1", 153))).toBeNull();
  });

  it("leaves deliberate (>= half-cell) offsets alone", () => {
    expect(healStubPortAlignment(nodes(253), edges, snapshot(100, 60, "p1", 253))).toBeNull();
  });

  it("resolves directional handle variants (bare ref to -out handle)", () => {
    const healed = healStubPortAlignment(nodes(160), edges, snapshot(100, 60, "p1-out", 160));
    expect(healed).not.toBeNull();
    expect(healed!.find((n) => n.id === "s1")!.position.y).toBe(153);
  });
});
