/**
 * Main-thread client for the routing Web Worker POOL — portfolio search.
 *
 * Each routing request fans out to the diversified candidate set (portfolio.ts): one sub-job per
 * candidate, dispatched across a pool of workers. Every worker routes its candidate and SELF-SCORES
 * (shared objective, scoreRoutes). Results stream PROGRESSIVELY: each arriving candidate that beats
 * the currently-applied one (lower score; ties resolve to the earliest candidate, i.e. the shipped
 * default) is handed to the store immediately, so the first routes paint as soon as the fastest
 * candidate lands instead of waiting for the slowest. When the whole portfolio has reported, the
 * final pick is re-checked — the applied winner is always identical to a wait-for-all pick. The
 * store may therefore see a few successively-better RoutingResults per seq (applyRoutingResult is
 * idempotent per seq); requestRoutes / setRoutingResultHandler API shapes are unchanged.
 *
 * Coalescing is at the request (seq) level: a newer request supersedes the older one — queued
 * stale candidates are dropped, in-flight ones complete but are discarded. If no Worker exists (or
 * one crashes), the whole portfolio runs synchronously on the main thread — identical winner, just
 * no offload.
 */

import type { SchematicNode, ConnectionEdge, BundleMeta } from "../types";
import { routeAllEdges, type RoutedEdge } from "../edgeRouter";
import { scoreRoutes } from "./scoreRoutes";
import { ROUTING_CANDIDATES } from "./portfolio";
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
  /** Set per sub-job by the portfolio dispatcher; identifies which candidate produced this run. */
  candidateLabel?: string;
}

export interface RoutingResult {
  seq: number;
  routes: Record<string, RoutedEdge>;
  overBudget: boolean;
  /** Objective score of this candidate's routing (lower = cleaner). Set by the worker/sync scorer. */
  score: number;
  /** Which portfolio candidate produced this result. */
  candidateLabel?: string;
  /** __routingDebug (overlay) + __routingReport (copy-report button), ferried from the worker. */
  routingDebug: unknown;
  routingReport: unknown;
}

type ResultHandler = (r: RoutingResult) => void;

let handler: ResultHandler | null = null;

/** Register the (single) callback invoked when the winning routing result for a request arrives. */
export function setRoutingResultHandler(cb: ResultHandler): void {
  handler = cb;
}

// ---------- Worker pool ----------
// No more workers than candidates; leave cores for the main thread + rendering.
const POOL_SIZE = Math.min(
  ROUTING_CANDIDATES.length,
  Math.max(2, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) - 2),
);

let pool: Worker[] = [];
let idle: Worker[] = [];
let poolUnavailable = false;

// Candidate label → its index in ROUTING_CANDIDATES (default is 0), for tie-breaking toward default.
const candIndex = new Map(ROUTING_CANDIDATES.map((c, i) => [c.label, i] as const));

// ---------- Dispatch state (only the latest request's portfolio is live) ----------
let latestMasterReq: RoutingRequest | null = null;
let latestSeq = -1;
let expectedForSeq = 0;
let collected: RoutingResult[] = [];
let appliedBest: RoutingResult | null = null; // best result already handed to the store this seq
let awaiting = false;
let jobQueue: RoutingRequest[] = [];
// Set by cancelRouting(), cleared at the start of every requestRoutes(). Guards the sync-fallback
// microtask so a cancel that lands between runSyncPortfolio() and its queued apply is honoured. On
// the worker path teardownPool() + awaiting=false already drop in-flight/late results; this only
// matters where no Worker exists (main-thread fallback, most test environments).
let cancelled = false;

function teardownPool(): void {
  for (const w of pool) { try { w.terminate(); } catch { /* ignore */ } }
  pool = [];
  idle = [];
}

function ensurePool(): boolean {
  if (poolUnavailable) return false;
  if (pool.length > 0) return true;
  if (typeof Worker === "undefined") {
    poolUnavailable = true;
    return false;
  }
  try {
    for (let i = 0; i < POOL_SIZE; i++) {
      const w = new Worker(new URL("./routing.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev: MessageEvent<RoutingResult>) => onWorkerResult(w, ev.data);
      w.onerror = onWorkerError;
      pool.push(w);
      idle.push(w);
    }
    return true;
  } catch {
    teardownPool();
    poolUnavailable = true;
    return false;
  }
}

function onWorkerError(): void {
  // A worker crashed — abandon the pool, fall back to sync for the rest of the session, and re-run
  // the latest request synchronously so the caller's isRouting state can't stick.
  teardownPool();
  poolUnavailable = true;
  jobQueue = [];
  collected = [];
  appliedBest = null;
  awaiting = false;
  const req = latestMasterReq;
  if (req) runSyncPortfolio(req);
}

function pump(): void {
  while (idle.length > 0 && jobQueue.length > 0) {
    const job = jobQueue.shift()!;
    const w = idle.shift()!;
    w.postMessage(job);
  }
}

function onWorkerResult(w: Worker, res: RoutingResult): void {
  idle.push(w);
  // Discard stale results (from a superseded request); only the latest seq's portfolio is live.
  if (awaiting && res.seq === latestSeq) {
    collected.push(res);
    // Progressive apply: paint each improvement as it lands rather than waiting for the slowest
    // candidate. Over-budget results are withheld until the final pick — applying one flips
    // autoRoute off in the store, which would discard the rest of the portfolio.
    if (!res.overBudget && beats(res, appliedBest) && handler) {
      appliedBest = res;
      handler(res);
    }
    if (collected.length >= expectedForSeq) {
      awaiting = false;
      const best = pickBestResult(collected);
      collected = [];
      // Usually already applied; re-send only if the full-portfolio pick differs (e.g. the
      // winner was over-budget and got withheld above).
      if (best && best !== appliedBest && handler) handler(best);
      appliedBest = null;
    }
  }
  pump();
}

/** True when r beats cur: lower score wins; ties resolve to the earliest candidate (the default). */
function beats(r: RoutingResult, cur: RoutingResult | null): boolean {
  if (cur === null) return true;
  if (r.score !== cur.score) return r.score < cur.score;
  return (
    (candIndex.get(r.candidateLabel ?? "") ?? Number.MAX_SAFE_INTEGER) <
    (candIndex.get(cur.candidateLabel ?? "") ?? Number.MAX_SAFE_INTEGER)
  );
}

function pickBestResult(results: RoutingResult[]): RoutingResult | null {
  let best: RoutingResult | null = null;
  for (const r of results) if (beats(r, best)) best = r;
  return best;
}

/** Build one sub-request per candidate: merge the candidate's params over any live tuning params. */
function buildSubJobs(req: RoutingRequest): RoutingRequest[] {
  return ROUTING_CANDIDATES.map((c) => ({
    ...req,
    candidateLabel: c.label,
    routingParams: { ...(req.routingParams ?? {}), ...c.params },
  }));
}

function runSyncPortfolio(req: RoutingRequest): void {
  // Main-thread fallback: route every candidate, score, pick best. Slower (no offload) but identical.
  const g = globalThis as Record<string, unknown>;
  const results: RoutingResult[] = [];
  for (const c of ROUTING_CANDIDATES) {
    g.__routingParams = { ...(req.routingParams ?? {}), ...c.params };
    const { routes, overBudget } = routeAllEdges(
      req.nodes, req.edges, req.handles, req.debug, undefined, req.opsBudget, req.bundles,
    );
    results.push({
      seq: req.seq,
      candidateLabel: c.label,
      score: scoreRoutes(req.nodes, req.edges, routes),
      routes,
      overBudget,
      routingDebug: g.__routingDebug ?? null,
      routingReport: g.__routingReport ?? null,
    });
  }
  const best = pickBestResult(results);
  // Keep the async shape so the caller's apply path is uniform whether or not a worker exists.
  // Re-check `cancelled` at apply time: a cancelRouting() between here and the microtask must win.
  queueMicrotask(() => { if (!cancelled && best && handler) handler(best); });
}

/** Queue a routing request. Returns immediately; the winning result arrives via the handler. */
export function requestRoutes(req: RoutingRequest): void {
  latestMasterReq = req;
  // Supersede any older in-flight portfolio: drop its queued candidates and reset collection.
  latestSeq = req.seq;
  collected = [];
  appliedBest = null;
  jobQueue = [];
  cancelled = false; // fresh pass — clear any prior cancellation latch

  const subs = buildSubJobs(req);
  expectedForSeq = subs.length;

  if (!ensurePool()) {
    awaiting = false;
    runSyncPortfolio(req);
    return;
  }
  awaiting = true;
  jobQueue.push(...subs);
  pump();
}

/** Eagerly spawn the worker pool so the first real route doesn't pay construction latency. */
export function warmupRoutingWorker(): void {
  ensurePool();
}

/**
 * Abort the in-flight routing pass (#207). Drops the queued/collected portfolio and latches
 * `cancelled` so any straggler (a late worker message, or the sync-fallback microtask) is
 * discarded instead of clobbering the store. Workers still crunching a candidate are TERMINATED
 * rather than left to finish-then-discard, so a core is freed immediately; the pool is eagerly
 * rebuilt so the next pass doesn't pay worker-construction latency.
 *
 * Already-applied routes are intentionally left in place — each candidate result is a COMPLETE
 * routing of every edge (applyRoutingResult swaps the whole routedEdges map atomically), so
 * whatever the store last committed is internally consistent; there is no partial edge geometry
 * to roll back. Callers that also want the "routing…" indicator cleared handle that in the store.
 */
export function cancelRouting(): void {
  cancelled = true;
  awaiting = false;
  jobQueue = [];
  collected = [];
  appliedBest = null;
  latestMasterReq = null;
  latestSeq = -1;
  expectedForSeq = 0;
  const hadPool = pool.length > 0;
  teardownPool();
  if (hadPool) ensurePool();
}
