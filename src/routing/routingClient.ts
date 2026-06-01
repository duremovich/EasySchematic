/**
 * Main-thread client for the routing Web Worker.
 *
 * Owns a single long-lived worker, assigns nothing (the caller owns the seq), and coalesces:
 * if a request arrives while the worker is busy, only the newest pending request is kept — older
 * ones are dropped (a superseded route is wasted work). `routeAllEdges` is one synchronous call and
 * can't be interrupted mid-run, so coalescing + the router's own time budget are the responsiveness
 * levers; the main thread is never blocked regardless.
 *
 * If the environment has no Worker (or one fails to construct / crashes), every request runs
 * synchronously on the main thread via the same `routeAllEdges` — identical results, just no offload.
 */

import type { SchematicNode, ConnectionEdge, BundleMeta } from "../types";
import { routeAllEdges, type RoutedEdge } from "../edgeRouter";
import type { HandleSnapshot } from "./handleSnapshot";

export interface RoutingRequest {
  /** Caller-assigned monotonic id; echoed back so the caller can discard stale results. */
  seq: number;
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  handles: HandleSnapshot;
  bundles: Record<string, BundleMeta>;
  debug: boolean;
  opsBudget?: number;
  /** window.__routingParams snapshot (live tuning overrides) — re-applied inside the worker. */
  routingParams?: Record<string, number>;
}

export interface RoutingResult {
  seq: number;
  routes: Record<string, RoutedEdge>;
  overBudget: boolean;
  /** __routingDebug (overlay) + __routingReport (copy-report button), ferried from the worker. */
  routingDebug: unknown;
  routingReport: unknown;
}

type ResultHandler = (r: RoutingResult) => void;

let worker: Worker | null = null;
let workerUnavailable = false;
let busy = false;
let pending: RoutingRequest | null = null;
/** The request currently posted to the worker — retained so a worker crash can re-run it. */
let inFlight: RoutingRequest | null = null;
let handler: ResultHandler | null = null;

/** Register the (single) callback invoked when routing results arrive. */
export function setRoutingResultHandler(cb: ResultHandler): void {
  handler = cb;
}

function ensureWorker(): Worker | null {
  if (worker || workerUnavailable) return worker;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./routing.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<RoutingResult>) => {
      busy = false;
      inFlight = null;
      handler?.(ev.data);
      if (pending) {
        const next = pending;
        pending = null;
        postToWorker(next);
      }
    };
    worker.onerror = () => {
      // Worker crashed — drop it and route synchronously for the rest of the session. Re-run the
      // newest lost request (pending if any, else the in-flight one) so isRouting can't stick.
      try { worker?.terminate(); } catch { /* ignore */ }
      worker = null;
      workerUnavailable = true;
      busy = false;
      const lost = pending ?? inFlight;
      pending = null;
      inFlight = null;
      if (lost) runSync(lost);
    };
    return worker;
  } catch {
    workerUnavailable = true;
    worker = null;
    return null;
  }
}

function postToWorker(req: RoutingRequest): void {
  const w = ensureWorker();
  if (!w) {
    runSync(req);
    return;
  }
  busy = true;
  inFlight = req;
  w.postMessage(req);
}

function runSync(req: RoutingRequest): void {
  // Main-thread fallback. Routing params already live on window here, so no re-apply needed.
  const { routes, overBudget } = routeAllEdges(
    req.nodes, req.edges, req.handles, req.debug, undefined, req.opsBudget, req.bundles,
  );
  const g = globalThis as Record<string, unknown>;
  // Keep the async shape so the caller's apply path is uniform whether or not a worker exists.
  queueMicrotask(() =>
    handler?.({
      seq: req.seq,
      routes,
      overBudget,
      routingDebug: g.__routingDebug ?? null,
      routingReport: g.__routingReport ?? null,
    }),
  );
}

/** Queue a routing request. Returns immediately; the result arrives via the registered handler. */
export function requestRoutes(req: RoutingRequest): void {
  if (workerUnavailable) {
    runSync(req);
    return;
  }
  if (busy) {
    pending = req; // coalesce — keep only the newest
    return;
  }
  postToWorker(req);
}

/** Eagerly spawn the worker so the first real route doesn't pay construction latency. */
export function warmupRoutingWorker(): void {
  ensureWorker();
}
