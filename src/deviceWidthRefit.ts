/**
 * Keeping what hangs off a device's right edge attached when the device's WIDTH changes
 * (#418) — whether by the Fit Width to Labels / Reset menu actions, or because a
 * fit-width device's label set changed (port rename, hide/show, template sync, swap,
 * card swap, label-case switch).
 *
 * Changing a device's width moves its right edge, and with it every right-side handle.
 * Nothing else in the app reacts to that on its own:
 *   - stub tags only re-anchor when their device is dragged, so a widened device would
 *     grow over a right-side tag;
 *   - manual waypoints are absolute world coordinates, so a widened device swallows the
 *     first waypoint of a right-side connection (or lands exactly on it, leaving a
 *     zero-length first leg that leaves the port vertically).
 * This module re-anchors both, by the width delta. Callers run it inside the same state
 * update (and undo step) as the change that moved the edge.
 *
 * Rule, per device whose width changed (delta = newWidth - oldWidth, oldRight = old
 * right edge):
 *   - Tags (stub labels / text stubs) hosted by the device whose box sits right of the
 *     old right edge shift by delta — the gap to the device is kept.
 *   - For each connection leg that ends on a right-side handle and carries manual
 *     waypoints, the contiguous run of waypoints nearest that handle lying within
 *     [oldRight, oldRight + |delta| + GRID_SIZE] shifts by delta. Shifting only x keeps
 *     every segment orthogonal (vertical segments share an x, so both ends are in or out
 *     of the band together). If the shift would flip the direction of the horizontal
 *     segment where the run ends, that connection's manual route is cleared instead
 *     (it re-auto-routes) and counted, so the caller can say so.
 * The band is measured from the edge the device is LEAVING, so a widen followed by the
 * matching shrink moves the same waypoints out and back.
 */

import type { ConnectionEdge, DeviceData, DeviceNode, SchematicNode } from "./types";
import { estimateDeviceWidth } from "./deviceWidth";
import { getPortAbsolutePositions, parentOffsetFromMap, tagHostId } from "./snapUtils";
import { GRID_SIZE } from "./gridConstants";

type Waypoint = { x: number; y: number };

export interface ReanchorResult {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  /** Devices whose width actually changed (and so had their right edge re-anchored). */
  resizedIds: string[];
  /** Connections whose manual route had to be cleared rather than shifted. */
  clearedRouteEdgeIds: string[];
}

export interface RefitResult extends ReanchorResult {
  /** Devices whose fitWidth flag actually changed. */
  changedIds: string[];
}

/** Shift the run of waypoints nearest the handle (index 0 first) that lies in the band.
 *  Returns the new list, the input unchanged, or null when the route must be cleared. */
function shiftNearRun(
  wps: Waypoint[],
  delta: number,
  oldRight: number,
): Waypoint[] | null {
  const bandEnd = oldRight + Math.abs(delta) + GRID_SIZE;
  let k = 0;
  while (k < wps.length && wps[k].x >= oldRight - 0.5 && wps[k].x <= bandEnd) k++;
  if (k === 0) return wps;
  const out = wps.map((p, i) => (i < k ? { x: p.x + delta, y: p.y } : p));
  if (k < wps.length) {
    const before = Math.sign(wps[k].x - wps[k - 1].x);
    const after = Math.sign(wps[k].x - out[k - 1].x);
    if (before !== after) return null;
  }
  return out;
}

const asTyped = (s: string) => s;

/**
 * Compare a state transition device by device and re-anchor the right edge of every
 * device whose rendered width changed. `prevNodes` is the state before the change;
 * `nodes` / `edges` the state after it. Only devices whose data object changed are
 * measured — unless `displayBefore !== displayAfter` (a label-case switch), which can
 * change every fit-width device's width with no data change at all. Unflagged devices
 * are always 144 on both sides, so they never move.
 *
 * Returns the inputs unchanged (same array identities) when nothing moved.
 */
export function reanchorWidthChanges(
  prevNodes: readonly SchematicNode[],
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  opts: { displayBefore?: (s: string) => string; displayAfter?: (s: string) => string } = {},
): ReanchorResult {
  const displayBefore = opts.displayBefore ?? asTyped;
  const displayAfter = opts.displayAfter ?? displayBefore;
  const displayChanged = displayBefore !== displayAfter;
  const prevMap = new Map(prevNodes.map((n) => [n.id, n] as const));
  const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));

  // Per resized device: delta, old right edge (absolute) and its right-side handle ids.
  const moves = new Map<string, { delta: number; oldRight: number; rightHandles: Set<string> }>();
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const p = prevMap.get(n.id);
    if (!p || p.type !== "device") continue;
    if (p.data === n.data && !displayChanged) continue;
    const before = p.data as DeviceData;
    const after = n.data as DeviceData;
    if (!before.fitWidth && !after.fitWidth) continue; // standard width on both sides
    const oldW = estimateDeviceWidth(before, displayBefore);
    const delta = estimateDeviceWidth(after, displayAfter) - oldW;
    if (delta === 0) continue;
    const { dx } = parentOffsetFromMap(p, prevMap);
    // Right-side handles before AND after: a port change can re-id a handle (e.g. a pair
    // merged into a passthrough's -front) while the connection stays on the right edge.
    const rightHandles = new Set<string>();
    for (const [node, map] of [[p, prevMap], [n, nodeMap]] as const) {
      for (const pos of getPortAbsolutePositions(node, map)) {
        if (pos.side === "right") rightHandles.add(pos.handleId);
      }
    }
    moves.set(n.id, { delta, oldRight: p.position.x + dx + oldW, rightHandles });
  }

  if (moves.size === 0) return { nodes, edges, resizedIds: [], clearedRouteEdgeIds: [] };

  // Edges: shift (or clear) manual waypoints on legs leaving a moved right edge.
  const clearedRouteEdgeIds: string[] = [];
  const nextEdges = edges.map((e) => {
    let wps = e.data?.manualWaypoints;
    if (!wps?.length) return e;
    let cleared = false;
    const src = moves.get(e.source);
    if (src && e.sourceHandle && src.rightHandles.has(e.sourceHandle)) {
      const r = shiftNearRun(wps, src.delta, src.oldRight);
      if (r === null) cleared = true; else wps = r;
    }
    const tgt = moves.get(e.target);
    if (!cleared && tgt && e.targetHandle && tgt.rightHandles.has(e.targetHandle)) {
      const r = shiftNearRun([...wps].reverse(), tgt.delta, tgt.oldRight);
      if (r === null) cleared = true; else wps = r.reverse();
    }
    if (cleared) {
      clearedRouteEdgeIds.push(e.id);
      const data = { ...e.data! };
      delete data.manualWaypoints;
      delete data.autoRouteWaypoints;
      return { ...e, data };
    }
    if (wps === e.data!.manualWaypoints) return e;
    return { ...e, data: { ...e.data!, manualWaypoints: wps } };
  });

  // Nodes: tags right of a moved edge ride along.
  let nodesChanged = false;
  const nextNodes = nodes.map((n) => {
    if (n.type !== "stub-label" && n.type !== "text-stub") return n;
    const host = tagHostId(n, nodes, edges);
    const move = host ? moves.get(host) : undefined;
    if (!move) return n;
    const absX = n.position.x + parentOffsetFromMap(n, nodeMap).dx;
    if (absX < move.oldRight - 0.5) return n; // left-side tag — its edge didn't move
    nodesChanged = true;
    return { ...n, position: { x: n.position.x + move.delta, y: n.position.y } } as SchematicNode;
  });

  const edgesChanged = nextEdges.some((e, i) => e !== edges[i]);
  return {
    nodes: nodesChanged ? nextNodes : nodes,
    edges: edgesChanged ? nextEdges : edges,
    resizedIds: [...moves.keys()],
    clearedRouteEdgeIds,
  };
}

/** Fit Width to Labels / Reset to Standard Width: set or clear the flag on `nodeIds`,
 *  then re-anchor whatever the width change moved. */
export function refitDeviceWidths(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  nodeIds: readonly string[],
  fit: boolean,
  display?: (s: string) => string,
): RefitResult {
  const ids = new Set(nodeIds);
  const changedIds: string[] = [];
  const flagged = nodes.map((n) => {
    if (!ids.has(n.id) || n.type !== "device") return n;
    const data = n.data as DeviceData;
    if (!!data.fitWidth === fit) return n;
    changedIds.push(n.id);
    const rest = { ...data };
    delete rest.fitWidth;
    return { ...n, data: fit ? { ...rest, fitWidth: true } : rest } as DeviceNode;
  });
  if (changedIds.length === 0) {
    return { nodes, edges, changedIds, resizedIds: [], clearedRouteEdgeIds: [] };
  }
  const r = reanchorWidthChanges(nodes, flagged, edges, { displayBefore: display, displayAfter: display });
  return { ...r, changedIds };
}
