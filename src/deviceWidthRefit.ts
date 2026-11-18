/**
 * Turning fit-width mode on or off for existing devices (#418 opt-in action) — and
 * carrying along what hangs off each device's right edge.
 *
 * Changing a device's width moves its right edge, and with it every right-side handle.
 * Nothing else in the app reacts to that on its own:
 *   - stub tags only re-anchor when their device is dragged, so a widened device would
 *     grow over a right-side tag;
 *   - manual waypoints are absolute world coordinates, so a widened device swallows the
 *     first waypoint of a right-side connection (or lands exactly on it, leaving a
 *     zero-length first leg that leaves the port vertically).
 * This module re-anchors both, by the width delta, in the same state update the store
 * pushes one undo step for.
 *
 * Rule, per changed device (delta = newWidth - oldWidth, oldRight = old right edge):
 *   - Tags (stub labels / text stubs) hosted by the device whose box sits right of the
 *     old right edge shift by delta — the gap to the device is kept.
 *   - For each connection leg that ends on a right-side handle and carries manual
 *     waypoints, the contiguous run of waypoints nearest that handle lying within
 *     [oldRight, oldRight + |delta| + GRID_SIZE] shifts by delta. Shifting only x keeps
 *     every segment orthogonal (vertical segments share an x, so both ends are in or out
 *     of the band together). If the shift would flip the direction of the horizontal
 *     segment where the run ends, that connection's manual route is cleared instead
 *     (it re-auto-routes) and counted, so the caller can say so.
 * The band is measured from the edge the device is LEAVING, so Fit followed by Reset
 * moves the same waypoints out and back.
 */

import type { ConnectionEdge, DeviceData, DeviceNode, SchematicNode } from "./types";
import { estimateDeviceWidth } from "./deviceWidth";
import { getPortAbsolutePositions, parentOffsetFromMap, tagHostId } from "./snapUtils";
import { GRID_SIZE } from "./gridConstants";

type Waypoint = { x: number; y: number };

export interface RefitResult {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  /** Devices whose fitWidth flag actually changed. */
  changedIds: string[];
  /** Connections whose manual route had to be cleared rather than shifted. */
  clearedRouteEdgeIds: string[];
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

export function refitDeviceWidths(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  nodeIds: readonly string[],
  fit: boolean,
  display?: (s: string) => string,
): RefitResult {
  const ids = new Set(nodeIds);
  const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));

  // Per changed device: delta, old right edge (absolute) and its right-side handle ids.
  const moves = new Map<string, { delta: number; oldRight: number; rightHandles: Set<string> }>();
  const changedIds: string[] = [];
  const nextData = new Map<string, DeviceData>();
  for (const id of ids) {
    const n = nodeMap.get(id);
    if (!n || n.type !== "device") continue;
    const data = n.data as DeviceData;
    if (!!data.fitWidth === fit) continue;
    const rest = { ...data };
    delete rest.fitWidth;
    const updated: DeviceData = fit ? { ...rest, fitWidth: true } : rest;
    changedIds.push(id);
    nextData.set(id, updated);
    const oldW = estimateDeviceWidth(data, display);
    const delta = estimateDeviceWidth(updated, display) - oldW;
    if (delta === 0) continue;
    const { dx } = parentOffsetFromMap(n, nodeMap);
    const rightHandles = new Set(
      getPortAbsolutePositions(n, nodeMap).filter((p) => p.side === "right").map((p) => p.handleId),
    );
    moves.set(id, { delta, oldRight: n.position.x + dx + oldW, rightHandles });
  }

  if (changedIds.length === 0) return { nodes, edges, changedIds, clearedRouteEdgeIds: [] };

  // Edges: shift (or clear) manual waypoints on legs leaving a moved right edge.
  const clearedRouteEdgeIds: string[] = [];
  const nextEdges = edges.map((e) => {
    let wps = e.data?.manualWaypoints;
    if (!wps?.length || moves.size === 0) return e;
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

  // Nodes: new device data, and tags right of a moved edge ride along.
  const nextNodes = nodes.map((n) => {
    const updated = nextData.get(n.id);
    if (updated) return { ...n, data: updated } as DeviceNode;
    if ((n.type !== "stub-label" && n.type !== "text-stub") || moves.size === 0) return n;
    const host = tagHostId(n, nodes, edges);
    const move = host ? moves.get(host) : undefined;
    if (!move) return n;
    const absX = n.position.x + parentOffsetFromMap(n, nodeMap).dx;
    if (absX < move.oldRight - 0.5) return n; // left-side tag — its edge didn't move
    return { ...n, position: { x: n.position.x + move.delta, y: n.position.y } } as SchematicNode;
  });

  const edgesChanged = nextEdges.some((e, i) => e !== edges[i]);
  return { nodes: nextNodes, edges: edgesChanged ? nextEdges : edges, changedIds, clearedRouteEdgeIds };
}
