const EDGE_ID_RE = /^edge-(\d+)(?:-(?:src|tgt))?$/;

export function maxEdgeCounterFromIds(ids: Iterable<string>, initial = 0): number {
  let max = initial;
  for (const id of ids) {
    const match = id.match(EDGE_ID_RE);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function edgeIdUnavailable(id: string, usedIds: Set<string>): boolean {
  return usedIds.has(id) || usedIds.has(`${id}-src`) || usedIds.has(`${id}-tgt`);
}

export function allocateEdgeId(
  usedIds: Iterable<string>,
  currentCounter: number,
): { id: string; counter: number } {
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds);
  let counter = currentCounter;
  let id = "";
  do {
    id = `edge-${++counter}`;
  } while (edgeIdUnavailable(id, used));
  return { id, counter };
}

export function uniquifyEdgeIds<T extends { id: string }>(
  edges: T[],
  currentCounter: number,
): { edges: T[]; counter: number; changed: boolean } {
  let counter = maxEdgeCounterFromIds(edges.map((edge) => edge.id), currentCounter);
  const unavailable = new Set(edges.map((edge) => edge.id));
  const seen = new Set<string>();
  let changed = false;

  const normalized = edges.map((edge) => {
    if (!seen.has(edge.id)) {
      seen.add(edge.id);
      return edge;
    }

    const allocated = allocateEdgeId(unavailable, counter);
    counter = allocated.counter;
    unavailable.add(allocated.id);
    seen.add(allocated.id);
    changed = true;
    return { ...edge, id: allocated.id };
  });

  return { edges: changed ? normalized : edges, counter, changed };
}
