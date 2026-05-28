import type { ConnectionEdge, SchematicNode, WaypointNode } from "./types";

const WP_PREFIX = "wp-";

// React Flow elevates edges whose source/target nodes have a parentId (e.g.
// devices inside rooms). Without an explicit zIndex, top-level waypoint nodes
// end up under those elevated edges and become unclickable. 100 is well above
// any edge z and below the 10000 used by edge labels.
const WAYPOINT_Z_INDEX = 100;

export function waypointNodeId(edgeId: string, index: number): string {
  return `${WP_PREFIX}${edgeId}-${index}`;
}

/**
 * Reconcile waypoint nodes against the canonical `edge.data.manualWaypoints`
 * arrays. Spawns missing nodes, removes orphans, repositions where mismatched.
 * Preserves selection state on nodes that survive the pass.
 *
 * Returns the same `nodes` reference when nothing changes.
 */
export function reconcileWaypointNodes(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
): SchematicNode[] {
  type Expected = { id: string; edgeId: string; index: number; x: number; y: number };
  const expected: Expected[] = [];
  const expectedById = new Map<string, Expected>();
  for (const edge of edges) {
    if (edge.data?.autoRouteWaypoints) continue;
    const wps = edge.data?.manualWaypoints;
    if (!Array.isArray(wps) || wps.length === 0) continue;
    for (let i = 0; i < wps.length; i++) {
      const id = waypointNodeId(edge.id, i);
      const exp: Expected = { id, edgeId: edge.id, index: i, x: wps[i].x, y: wps[i].y };
      expected.push(exp);
      expectedById.set(id, exp);
    }
  }

  const existingWaypoints = new Map<string, WaypointNode>();
  let waypointCount = 0;
  for (const n of nodes) {
    if (n.type !== "waypoint") continue;
    waypointCount++;
    existingWaypoints.set(n.id, n as WaypointNode);
  }

  if (expected.length === waypointCount) {
    let allMatch = true;
    for (const exp of expected) {
      const ex = existingWaypoints.get(exp.id);
      if (
        !ex ||
        ex.position.x !== exp.x ||
        ex.position.y !== exp.y ||
        ex.data.index !== exp.index ||
        ex.zIndex !== WAYPOINT_Z_INDEX
      ) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return nodes;
  }

  const nonWaypoints = nodes.filter((n) => n.type !== "waypoint");
  const newWaypointNodes: WaypointNode[] = expected.map((exp) => {
    const existing = existingWaypoints.get(exp.id);
    const node: WaypointNode = {
      id: exp.id,
      type: "waypoint",
      position: { x: exp.x, y: exp.y },
      data: { edgeId: exp.edgeId, index: exp.index },
      zIndex: WAYPOINT_Z_INDEX,
      ...(existing?.selected ? { selected: true } : {}),
    };
    return node;
  });

  return [...nonWaypoints, ...newWaypointNodes];
}

/**
 * Read waypoint node positions back into each edge's manualWaypoints array.
 * Used after React Flow has applied position changes (e.g. drag) so the
 * canonical edge data stays in lockstep with the on-canvas waypoint nodes.
 *
 * Returns the same `edges` reference when nothing changes.
 */
export function syncEdgesFromWaypointNodes(
  edges: ConnectionEdge[],
  nodes: SchematicNode[],
): ConnectionEdge[] {
  // manualWaypoints are absolute coords. If a waypoint somehow ended up with a
  // parentId (e.g. an older reparentAllDevices call swept it under a room),
  // walking the parent chain gives us the absolute position to write back.
  const nodeMap = new Map(nodes.map((nn) => [nn.id, nn] as const));
  const absPos = (n: SchematicNode): { x: number; y: number } => {
    let x = n.position.x;
    let y = n.position.y;
    let p: string | undefined = n.parentId;
    while (p) {
      const parent = nodeMap.get(p);
      if (!parent) break;
      x += parent.position.x;
      y += parent.position.y;
      p = parent.parentId;
    }
    return { x, y };
  };
  // Group waypoint nodes by edgeId, sorted by index
  const byEdge = new Map<string, { x: number; y: number; index: number }[]>();
  for (const n of nodes) {
    if (n.type !== "waypoint") continue;
    const data = n.data as WaypointNode["data"];
    const { x, y } = absPos(n);
    const list = byEdge.get(data.edgeId) ?? [];
    list.push({ x, y, index: data.index });
    byEdge.set(data.edgeId, list);
  }

  let changed = false;
  const newEdges = edges.map((edge) => {
    const wpList = byEdge.get(edge.id);
    const existing = edge.data?.manualWaypoints;
    if (!wpList || wpList.length === 0) {
      return edge;
    }
    wpList.sort((a, b) => a.index - b.index);
    if (existing && existing.length === wpList.length) {
      let same = true;
      for (let i = 0; i < wpList.length; i++) {
        if (existing[i].x !== wpList[i].x || existing[i].y !== wpList[i].y) {
          same = false;
          break;
        }
      }
      if (same) return edge;
    }
    changed = true;
    const newWps = wpList.map((p) => ({ x: p.x, y: p.y }));
    return {
      ...edge,
      data: { ...edge.data!, manualWaypoints: newWps, autoRouteWaypoints: undefined },
    };
  });

  return changed ? newEdges : edges;
}

/**
 * Splice manualWaypoints entries on edges whose corresponding waypoint nodes
 * are about to be removed. Returns updated edges (canonical) — caller is
 * responsible for the final `reconcileWaypointNodes` pass to clean up node ids.
 */
export function spliceWaypointsForRemovedNodes(
  edges: ConnectionEdge[],
  removedWaypointNodes: WaypointNode[],
): ConnectionEdge[] {
  if (removedWaypointNodes.length === 0) return edges;
  const removedByEdge = new Map<string, Set<number>>();
  for (const n of removedWaypointNodes) {
    const data = n.data as WaypointNode["data"];
    const set = removedByEdge.get(data.edgeId) ?? new Set<number>();
    set.add(data.index);
    removedByEdge.set(data.edgeId, set);
  }

  return edges.map((edge) => {
    const removed = removedByEdge.get(edge.id);
    if (!removed) return edge;
    const wps = edge.data?.manualWaypoints;
    if (!Array.isArray(wps)) return edge;
    const next = wps.filter((_, i) => !removed.has(i));
    if (next.length === wps.length) return edge;
    if (next.length === 0) {
      const { manualWaypoints: _mw, autoRouteWaypoints: _ar, ...rest } = edge.data!;
      return { ...edge, data: rest as ConnectionEdge["data"] };
    }
    return {
      ...edge,
      data: { ...edge.data!, manualWaypoints: next, autoRouteWaypoints: undefined },
    };
  });
}
