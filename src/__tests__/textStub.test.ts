import { describe, it, expect } from "vitest";
import {
  textStubSideForPort,
  textStubBoxPosition,
  textStubLeaderPoints,
  pointsToSvg,
} from "../textStub";
import { STUB_GAP, STUB_H_EST } from "../stubPlacement";

// Pure geometry for text-only port stubs (#196). These helpers back TextStubNode's
// placement + leader line; the node component itself needs a DOM, so the maths lives here.

describe("textStubSideForPort", () => {
  it("puts the box to the right of a right-side port (box left edge faces device)", () => {
    expect(textStubSideForPort("right")).toBe("l");
  });
  it("puts the box to the left of a left-side port (box right edge faces device)", () => {
    expect(textStubSideForPort("left")).toBe("r");
  });
});

describe("textStubBoxPosition", () => {
  it("anchors the box's left edge STUB_GAP right of a right-side port, centred on it", () => {
    const pos = textStubBoxPosition({ x: 100, y: 50 }, "l", 80, STUB_H_EST);
    expect(pos).toEqual({ x: 100 + STUB_GAP, y: 50 - STUB_H_EST / 2 });
  });

  it("anchors the box's right edge STUB_GAP left of a left-side port (accounts for width)", () => {
    const pos = textStubBoxPosition({ x: 100, y: 50 }, "r", 80, STUB_H_EST);
    expect(pos).toEqual({ x: 100 - STUB_GAP - 80, y: 50 - STUB_H_EST / 2 });
  });

  it("defaults the height to the box estimate", () => {
    const pos = textStubBoxPosition({ x: 0, y: 20 }, "l", 40);
    expect(pos.y).toBe(20 - STUB_H_EST / 2);
  });
});

describe("textStubLeaderPoints", () => {
  const box = { width: 80, height: 14 };

  it("collapses to a single horizontal segment when the port is aligned (left-facing)", () => {
    const pts = textStubLeaderPoints(box, { x: -STUB_GAP, y: 7 }, "l");
    expect(pts).toEqual([
      { x: 0, y: 7 },
      { x: -STUB_GAP, y: 7 },
    ]);
  });

  it("collapses to a single horizontal segment when the port is aligned (right-facing)", () => {
    const pts = textStubLeaderPoints(box, { x: 144, y: 7 }, "r");
    expect(pts).toEqual([
      { x: 80, y: 7 },
      { x: 144, y: 7 },
    ]);
  });

  it("makes an L (horizontal then vertical) when the port sits off the box row", () => {
    const pts = textStubLeaderPoints(box, { x: -STUB_GAP, y: 24 }, "l");
    expect(pts).toEqual([
      { x: 0, y: 7 },
      { x: -STUB_GAP, y: 7 },
      { x: -STUB_GAP, y: 24 },
    ]);
  });

  it("starts at the box's right edge for a right-facing stub", () => {
    const pts = textStubLeaderPoints(box, { x: 100, y: 30 }, "r");
    expect(pts[0]).toEqual({ x: 80, y: 7 });
  });
});

describe("pointsToSvg", () => {
  it("serializes points to an SVG points attribute", () => {
    expect(pointsToSvg([{ x: 0, y: 7 }, { x: -64, y: 7 }])).toBe("0,7 -64,7");
  });
});
