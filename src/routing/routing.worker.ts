/**
 * Routing Web Worker. Runs `routeAllEdges` off the main thread so editing never blocks on A*.
 * Receives a fully-serialized request (nodes, edges, handle snapshot, bundles), routes, and posts
 * back the routes plus the two debug artifacts (`__routingDebug`, `__routingReport`) that
 * `routeAllEdges` writes to globalThis — re-published on the main thread by the client.
 */

import { routeAllEdges } from "../edgeRouter";
import type { RoutingRequest, RoutingResult } from "./routingClient";

// `self` is the DedicatedWorkerGlobalScope; the app's tsconfig only includes the DOM lib, so cast
// to the minimal shape we use rather than pulling in the conflicting WebWorker lib.
const ctx = self as unknown as {
  postMessage: (msg: RoutingResult) => void;
  onmessage: ((ev: MessageEvent<RoutingRequest>) => void) | null;
};

ctx.onmessage = (ev) => {
  const req = ev.data;
  const g = globalThis as Record<string, unknown>;
  // Re-apply live tuning overrides inside the worker (ROUTER_PARAMS reads globalThis.__routingParams).
  g.__routingParams = req.routingParams;

  const { routes, overBudget } = routeAllEdges(
    req.nodes, req.edges, req.handles, req.debug, undefined, req.opsBudget, req.bundles,
  );

  ctx.postMessage({
    seq: req.seq,
    routes,
    overBudget,
    routingDebug: g.__routingDebug ?? null,
    routingReport: g.__routingReport ?? null,
  });
};
