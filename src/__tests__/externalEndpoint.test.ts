import { describe, expect, it } from "vitest";
import {
  createExternalEndpointData,
  EXTERNAL_ENDPOINT_HEIGHT,
  reconcileExternalEndpointConnections,
  snapExternalEndpointY,
} from "../externalEndpoint";
import { computeSnap, getPortAbsolutePositions } from "../snapUtils";
import type { ConnectionEdge, DeviceNode } from "../types";

function externalEndpoint(y: number): DeviceNode {
  return {
    id: "external-1",
    type: "device",
    position: { x: 100, y },
    measured: { width: 160, height: EXTERNAL_ENDPOINT_HEIGHT },
    data: createExternalEndpointData("Martin Audio CDD6WTX-MAR"),
  } as DeviceNode;
}

function amplifier(y: number): DeviceNode {
  return {
    id: "amp-1",
    type: "device",
    position: { x: 0, y },
    measured: { width: 180, height: 120 },
    data: {
      label: "Powersoft Unica 8M 8K8",
      deviceType: "amplifier",
      auxiliaryData: [],
      ports: [
        { id: "speaker-1", label: "Speaker Out 1", signalType: "speaker-level", direction: "output" },
        { id: "speaker-2", label: "Speaker Out 2", signalType: "speaker-level", direction: "output" },
      ],
    },
  } as DeviceNode;
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

  it("snaps to a nearby device port row even when it sits between endpoint grid rows", () => {
    const amp = amplifier(3);
    const endpoint = externalEndpoint(53);
    const nodeMap = new Map([["amp-1", amp], ["external-1", endpoint]]);
    const portY = getPortAbsolutePositions(amp, nodeMap).find((p) => p.handleId === "speaker-1")!.absY;

    const result = computeSnap(endpoint, [amp, endpoint]);

    expect(portY).toBe(63);
    expect(result.y + EXTERNAL_ENDPOINT_HEIGHT / 2).toBe(portY);
  });

  it("repairs a legacy source handle after an endpoint was changed to input", () => {
    const endpoint = externalEndpoint(200);
    endpoint.data.ports[0].direction = "input";
    const edge = {
      id: "legacy-endpoint-edge",
      source: "external-1",
      sourceHandle: "endpoint",
      target: "amp-1",
      targetHandle: "speaker-1",
      data: { signalType: "speaker-level" },
    } as ConnectionEdge;

    const result = reconcileExternalEndpointConnections([endpoint, amplifier(0)], [edge]);
    const repairedEndpoint = result.nodes.find((node) => node.id === "external-1") as DeviceNode;

    expect(result.changed).toBe(true);
    expect(repairedEndpoint.data.ports[0].direction).toBe("output");
    expect(result.edges[0].sourceHandle).toBe("endpoint");
  });

  it("upgrades bidirectional endpoint handles without changing edge direction", () => {
    const endpoint = externalEndpoint(200);
    const edge = {
      id: "legacy-bidirectional-edge",
      source: "external-1",
      sourceHandle: "endpoint",
      target: "amp-1",
      targetHandle: "speaker-1",
      data: { signalType: "speaker-level" },
    } as ConnectionEdge;

    const result = reconcileExternalEndpointConnections([endpoint, amplifier(0)], [edge]);

    expect(result.changed).toBe(true);
    expect(result.edges[0].source).toBe("external-1");
    expect(result.edges[0].target).toBe("amp-1");
    expect(result.edges[0].sourceHandle).toBe("endpoint-out");
  });

  it("prefers its connected port over an adjacent closer row at any cable length", () => {
    const amp = amplifier(3);
    const endpoint = { ...externalEndpoint(73), position: { x: 1200, y: 73 } } as DeviceNode;
    const edge = {
      id: "speaker-run",
      source: "amp-1",
      sourceHandle: "speaker-1",
      target: "external-1",
      targetHandle: "endpoint-in",
      data: { signalType: "speaker-level" },
    } as ConnectionEdge;

    const result = computeSnap(endpoint, [amp, endpoint], undefined, [edge]);

    expect(result.y + EXTERNAL_ENDPOINT_HEIGHT / 2).toBe(63);
  });
});
