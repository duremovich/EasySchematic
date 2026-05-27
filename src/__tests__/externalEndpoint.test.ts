import { describe, expect, it } from "vitest";
import { createExternalEndpointData, EXTERNAL_ENDPOINT_HEIGHT, snapExternalEndpointY } from "../externalEndpoint";
import { computeSnap } from "../snapUtils";
import type { SchematicNode } from "../types";

function externalEndpoint(y: number): SchematicNode {
  return {
    id: "external-1",
    type: "device",
    position: { x: 100, y },
    measured: { width: 160, height: EXTERNAL_ENDPOINT_HEIGHT },
    data: createExternalEndpointData("Martin Audio CDD6WTX-MAR"),
  } as SchematicNode;
}

describe("external endpoint grid alignment", () => {
  it("snaps the handle centre rather than the top of the compact label", () => {
    const y = snapExternalEndpointY(200);

    expect(y).toBe(193);
    expect(y + EXTERNAL_ENDPOINT_HEIGHT / 2).toBe(200);
  });

  it("keeps a dragged compact endpoint handle on the routing grid", () => {
    const endpoint = externalEndpoint(200);
    const result = computeSnap(endpoint, [endpoint]);

    expect(result.y).toBe(193);
    expect(result.y + EXTERNAL_ENDPOINT_HEIGHT / 2).toBe(200);
  });
});
