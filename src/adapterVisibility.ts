import type { ConnectionEdge, DeviceData, SchematicNode } from "./types";

/**
 * Whether an adapter reads as hidden given its own visibility override and the
 * global "hide adapters" toggle. 'default' defers to the global toggle; an
 * explicit force-hide/force-show always wins. Shared by DeviceContextMenu and
 * EdgeContextMenu so the two Hide/Show Adapter menu items can't drift (#312).
 */
export function isAdapterHidden(
  visibility: DeviceData["adapterVisibility"] | undefined,
  globalHideAdapters: boolean,
): boolean {
  const current = visibility ?? "default";
  return current === "force-hide" || (current === "default" && globalHideAdapters);
}

/** Flip an adapter's visibility override, reading 'default' per {@link isAdapterHidden}. */
export function toggleAdapterVisibility(
  visibility: DeviceData["adapterVisibility"] | undefined,
  globalHideAdapters: boolean,
): "force-show" | "force-hide" {
  return isAdapterHidden(visibility, globalHideAdapters) ? "force-show" : "force-hide";
}

/**
 * The two legs of an inline adapter: the connection arriving at it and the one leaving
 * it. recomputeRoutes/computeSimpleRoutes splice exactly this pair into one connection
 * drawn straight through when the adapter is hidden.
 */
export function adapterLegs(
  adapterId: string,
  edges: readonly ConnectionEdge[],
): { inbound?: ConnectionEdge; outbound?: ConnectionEdge } {
  return {
    inbound: edges.find((e) => e.target === adapterId),
    outbound: edges.find((e) => e.source === adapterId),
  };
}

/**
 * Whether an adapter can be drawn hidden at all: only an adapter with a leg on each
 * side sits inline, so only it has a connection to draw through it. Hiding one that
 * doesn't — an unwired adapter, or one whose other leg was deleted along with the far
 * device — leaves an invisible device holding a port, with a dangling connection
 * nobody can see, select or delete (#426). Such an adapter stays drawn, whatever its
 * override or the global toggle says, so the user can see it and deal with it.
 */
export function canHideAdapter(adapterId: string, edges: readonly ConnectionEdge[]): boolean {
  const { inbound, outbound } = adapterLegs(adapterId, edges);
  return !!inbound && !!outbound;
}

/**
 * Whether this device is an adapter the canvas draws hidden right now — the per-node
 * form of {@link resolveHiddenAdapterIds}. Both context menus read their Show/Hide
 * label through this, so the label always describes what is on screen (#425).
 */
export function isAdapterNodeHidden(
  node: SchematicNode | undefined,
  hideAdapters: boolean,
  edges: readonly ConnectionEdge[],
): boolean {
  if (!node || node.type !== "device") return false;
  const data = node.data as DeviceData;
  if (data.deviceType !== "adapter") return false;
  return isAdapterHidden(data.adapterVisibility, hideAdapters) && canHideAdapter(node.id, edges);
}

/**
 * The inline adapters the canvas is hiding right now: every adapter device whose
 * per-device override says `force-hide`, plus — when the global "hide adapters" toggle
 * is on — every adapter that has not opted out with `force-show`. Either way only an
 * adapter that {@link canHideAdapter} — one with a leg on each side — is hidden.
 *
 * Both route builders (recomputeRoutes and, with auto-route off, computeSimpleRoutes)
 * derive this to splice a hidden adapter's two connections into one that draws straight
 * through. Everything that has to read the schematic the way the user sees it — the
 * stub tag's pairing host and the device its label names (#334, #348), the context
 * menus' Show/Hide label (#425) — resolves against the same rule.
 */
export function resolveHiddenAdapterIds(
  nodes: readonly SchematicNode[],
  hideAdapters: boolean,
  edges: readonly ConnectionEdge[],
): Set<string> {
  const hidden = new Set<string>();
  for (const n of nodes) {
    if (isAdapterNodeHidden(n, hideAdapters, edges)) hidden.add(n.id);
  }
  return hidden;
}

/**
 * The adapter a connection's context menu acts on: the adapter device at either end of
 * the connection, source first. A hidden adapter's spliced connection is its inbound
 * leg, so that adapter is the leg's target and is found the same way.
 */
export function connectionAdapterId(
  edge: Pick<ConnectionEdge, "source" | "target"> | undefined,
  nodes: readonly SchematicNode[],
): string | null {
  if (!edge) return null;
  const isAdapter = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n?.type === "device" && (n.data as DeviceData).deviceType === "adapter";
  };
  if (isAdapter(edge.source)) return edge.source;
  if (isAdapter(edge.target)) return edge.target;
  return null;
}

/** The inline style a hidden adapter's React Flow wrapper carries (see syncHiddenAdapterStyles). */
const HIDDEN_ADAPTER_STYLE = { width: 1, height: 1, opacity: 0, pointerEvents: "none" as const };

function hasHiddenAdapterStyle(n: SchematicNode): boolean {
  return n.style?.opacity === 0 && n.style?.pointerEvents === "none";
}

/**
 * Bring every adapter's wrapper style in line with the resolved hidden set: a hidden
 * adapter gets the 1px / transparent / click-through style that makes React Flow
 * re-measure it as a speck, every other adapter has it cleared.
 *
 * The style used to be written only by the global toggle, and only onto adapters
 * following it — so an adapter shown with "Show Adapter" while the toggle was on kept
 * an opacity-0, click-through wrapper and stayed invisible, and saved files carry that
 * stale style. Syncing against the one resolved set, wherever that set is published,
 * keeps the wrapper honest whichever control changed (#425, #409).
 *
 * Returns the input array untouched when nothing needed to change.
 */
export function syncHiddenAdapterStyles<T extends SchematicNode>(
  nodes: T[],
  hiddenAdapterIds: ReadonlySet<string>,
): T[] {
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== "device" || (n.data as DeviceData).deviceType !== "adapter") return n;
    const hidden = hiddenAdapterIds.has(n.id);
    if (hidden === hasHiddenAdapterStyle(n)) return n;
    changed = true;
    return hidden
      ? { ...n, style: { ...n.style, ...HIDDEN_ADAPTER_STYLE } }
      : { ...n, style: { ...n.style, width: undefined, height: undefined, opacity: undefined, pointerEvents: undefined } };
  });
  return changed ? next : nodes;
}

/** Where a connection lands: the device it arrives at and the port on it. */
export interface RunEnd {
  nodeId: string;
  handleId: string | null;
}

/**
 * Follow a run past any hidden inline adapters it arrives at, and report the visible
 * device — and the port on it — the run really terminates at.
 *
 * `arrivedAt` is where the connection `arrivedVia` ended; when that device is a hidden
 * adapter the walk continues out of its other side, repeating for a chain of them. A
 * hidden adapter renders as a 1x1 pointerEvents:none placeholder that no selection can
 * contain, and recomputeRoutes splices its two connections into one that draws straight
 * through, so the device on the far side is what the user actually sees and reads.
 * Shared by the tag-pairing walk and the stub tag's own label so the two can't drift
 * (#334, #348). A visible adapter is a real device and stops the walk.
 *
 * Only a connection onward to another DEVICE counts. An adapter whose far side is
 * itself stubbed has legs running to stub-label tags, and those name nothing a reader
 * could follow, so the walk stops on the adapter exactly as it does when nothing is
 * plugged into its far side at all.
 */
export function hopHiddenAdapters(
  arrivedAt: RunEnd,
  arrivedVia: string | undefined,
  nodes: readonly SchematicNode[],
  edges: readonly ConnectionEdge[],
  hiddenAdapterIds?: ReadonlySet<string>,
): RunEnd {
  if (!hiddenAdapterIds?.has(arrivedAt.nodeId)) return arrivedAt;
  const deviceIds = new Set(nodes.filter((n) => n.type === "device").map((n) => n.id));
  let end = arrivedAt;
  let legId = arrivedVia;
  const seen = new Set<string>();
  while (hiddenAdapterIds.has(end.nodeId) && !seen.has(end.nodeId)) {
    seen.add(end.nodeId);
    const from = end.nodeId;
    const onward = edges.find((e) => {
      if (e.id === legId || (e.source !== from && e.target !== from)) return false;
      return deviceIds.has(e.source === from ? e.target : e.source);
    });
    if (!onward) break;
    legId = onward.id;
    const outbound = onward.source === from;
    end = {
      nodeId: outbound ? onward.target : onward.source,
      handleId: (outbound ? onward.targetHandle : onward.sourceHandle) ?? null,
    };
  }
  return end;
}
