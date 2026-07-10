/**
 * Cancellation of an in-flight auto-route pass (#207).
 *
 * These run in the Node/vitest env where `Worker` is undefined, so routingClient takes its
 * synchronous main-thread portfolio path: requestRoutes() routes every candidate inline and
 * schedules the winning apply via queueMicrotask. That microtask re-reads the module's
 * `cancelled` latch, which is exactly the seam cancelRouting() flips — so the sync path is a
 * faithful, headless stand-in for "a result is pending and the user hits Cancel".
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  requestRoutes,
  cancelRouting,
  setRoutingResultHandler,
  type RoutingRequest,
  type RoutingResult,
} from "../routing/routingClient";
import type { SchematicNode, ConnectionEdge } from "../types";

/** Minimal empty request — no edges means each candidate routes nothing (fast) but the sync
 *  portfolio + microtask apply machinery still runs end-to-end. */
function makeRequest(seq: number): RoutingRequest {
  return {
    seq,
    nodes: [] as SchematicNode[],
    edges: [] as ConnectionEdge[],
    handles: {},
    bundles: {},
    debug: false,
  };
}

/** Flush both microtasks (queueMicrotask apply) and any macrotask turns. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("cancelRouting (#207)", () => {
  beforeEach(() => {
    // Reset the module's single handler between cases.
    setRoutingResultHandler(() => {});
  });

  it("normal pass: the winning result reaches the handler", async () => {
    const handler = vi.fn<(r: RoutingResult) => void>();
    setRoutingResultHandler(handler);

    requestRoutes(makeRequest(1));
    await flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].seq).toBe(1);
  });

  it("cancel before the result lands: the handler is never called", async () => {
    const handler = vi.fn<(r: RoutingResult) => void>();
    setRoutingResultHandler(handler);

    requestRoutes(makeRequest(2)); // schedules the apply microtask
    cancelRouting(); // latch cancellation before the microtask runs
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it("a fresh pass after a cancel routes normally again", async () => {
    const handler = vi.fn<(r: RoutingResult) => void>();
    setRoutingResultHandler(handler);

    requestRoutes(makeRequest(3));
    cancelRouting();
    await flush();
    expect(handler).not.toHaveBeenCalled();

    // Subsequent request must clear the cancelled latch and deliver its result.
    requestRoutes(makeRequest(4));
    await flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].seq).toBe(4);
  });

  it("is a no-op that does not throw when nothing is in flight", () => {
    expect(() => cancelRouting()).not.toThrow();
  });
});
