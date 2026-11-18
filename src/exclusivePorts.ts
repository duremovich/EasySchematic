/**
 * Mutually exclusive ports (#414).
 *
 * A template can tag ports with the same `exclusiveGroup` to say they are physically separate
 * jacks on one signal path — only one of them is usable at a time (e.g. a front-panel AUX input
 * that overrides the matching rear input). The default is unchanged: ports without a group stay
 * independent. Connecting two or more ports of one group is allowed but warned about; there are
 * no priority semantics.
 *
 * A group is scoped to the hardware that owns the port: the device itself for chassis ports,
 * or the installed card for a card's ports. Two identical cards in one frame each carry the
 * card template's group names verbatim, and their jacks are not alternatives to each other.
 *
 * Everything here is pure so the warning predicate is unit-testable without the store.
 */

import type { ConnectionEdge, DeviceData, InstalledSlot, Port, SchematicNode } from "./types";
import { isPortConnected } from "./portVisibility";

export interface ExclusiveConflict {
  /** The shared group value (trimmed). */
  group: string;
  /** The slot whose card owns these ports; undefined for the device's own ports. */
  slotId?: string;
  /** The connected ports in that group, in the device's port order. Always 2 or more. */
  ports: Port[];
}

/** A group value, trimmed; undefined when unset or blank. Used by the editors too, so a
 *  whitespace-only entry is stored as no group rather than reaching the API validator. */
export function normalizeExclusiveGroup(value: string | undefined): string | undefined {
  const g = value?.trim();
  return g ? g : undefined;
}

/** A port's exclusive group, trimmed; undefined when unset or blank. */
export function exclusiveGroupOf(port: Port): string | undefined {
  return normalizeExclusiveGroup(port.exclusiveGroup);
}

/** Every handle id that a connection attaches to on this device. Stub-leg connections keep
 *  the device's own port handle, so a stubbed connection counts as connected. */
export function connectedHandlesFor(nodeId: string, edges: readonly ConnectionEdge[]): Set<string> {
  const handles = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId && e.sourceHandle) handles.add(e.sourceHandle);
    if (e.target === nodeId && e.targetHandle) handles.add(e.targetHandle);
  }
  return handles;
}

interface ScopedGroup {
  group: string;
  slotId?: string;
  ports: Port[];
}

function connectedByScope(
  ports: readonly Port[],
  connectedHandles: Set<string>,
  slots: readonly InstalledSlot[] | undefined,
): Map<string, ScopedGroup> {
  const slotOf = new Map<string, string>();
  for (const s of slots ?? []) for (const id of s.portIds ?? []) slotOf.set(id, s.slotId);
  const byScope = new Map<string, ScopedGroup>();
  for (const port of ports) {
    const group = exclusiveGroupOf(port);
    if (!group || !isPortConnected(port, connectedHandles)) continue;
    const slotId = slotOf.get(port.id);
    const key = `${slotId ?? ""}\0${group}`;
    const entry = byScope.get(key);
    if (entry) entry.ports.push(port);
    else byScope.set(key, { group, ...(slotId ? { slotId } : {}), ports: [port] });
  }
  return byScope;
}

/** Groups on one device with two or more of their ports connected at once. Pass the device's
 *  installed slots so a card's groups are kept to that card. */
export function exclusiveGroupConflicts(
  ports: readonly Port[],
  connectedHandles: Set<string>,
  slots?: readonly InstalledSlot[],
): ExclusiveConflict[] {
  const out: ExclusiveConflict[] = [];
  for (const entry of connectedByScope(ports, connectedHandles, slots).values()) {
    if (entry.ports.length >= 2) out.push(entry);
  }
  return out;
}

/** Ids of every port that is part of a conflict — drives the on-canvas indicator. */
export function conflictingExclusivePortIds(
  ports: readonly Port[],
  connectedHandles: Set<string>,
  slots?: readonly InstalledSlot[],
): Set<string> {
  const ids = new Set<string>();
  for (const c of exclusiveGroupConflicts(ports, connectedHandles, slots)) {
    for (const p of c.ports) ids.add(p.id);
  }
  return ids;
}

export interface NewExclusiveConflict {
  nodeId: string;
  deviceLabel: string;
  conflict: ExclusiveConflict;
}

const endpointsOf = (e: ConnectionEdge) =>
  `${e.source}\0${e.sourceHandle ?? ""}\0${e.target}\0${e.targetHandle ?? ""}`;

/**
 * Conflicts that a change from `edgesBefore` to `edgesAfter` created or grew — a group that now
 * has more connected ports than before, and at least two. Only devices at the ends of an added
 * or re-pointed connection (a reconnect keeps its id) are checked, so a pre-existing conflict
 * elsewhere doesn't warn again on every unrelated connection.
 */
export function newExclusiveConflicts(
  nodes: readonly SchematicNode[],
  edgesBefore: readonly ConnectionEdge[],
  edgesAfter: readonly ConnectionEdge[],
): NewExclusiveConflict[] {
  const beforeEnds = new Map(edgesBefore.map((e) => [e.id, endpointsOf(e)]));
  const touched = new Set<string>();
  for (const e of edgesAfter) {
    if (beforeEnds.get(e.id) === endpointsOf(e)) continue;
    touched.add(e.source);
    touched.add(e.target);
  }
  const out: NewExclusiveConflict[] = [];
  for (const nodeId of touched) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "device") continue;
    const data = node.data as DeviceData;
    const ports = data.ports ?? [];
    if (!ports.some((p) => exclusiveGroupOf(p))) continue;
    const before = connectedByScope(ports, connectedHandlesFor(nodeId, edgesBefore), data.slots);
    for (const conflict of exclusiveGroupConflicts(ports, connectedHandlesFor(nodeId, edgesAfter), data.slots)) {
      const key = `${conflict.slotId ?? ""}\0${conflict.group}`;
      const prior = before.get(key)?.ports.length ?? 0;
      if (conflict.ports.length > prior) out.push({ nodeId, deviceLabel: data.label, conflict });
    }
  }
  return out;
}

function quotedList(labels: string[]): string {
  const q = labels.map((l) => `"${l}"`);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}

/** The toast shown when a connection creates a conflict. */
export function exclusiveConflictMessage(deviceLabel: string, conflict: ExclusiveConflict): string {
  const labels = conflict.ports.map((p) => p.label);
  const all = labels.length > 2 ? "all" : "both";
  return `${deviceLabel}: ${quotedList(labels)} are ${all} connected, but share exclusive group "${conflict.group}" — only one can be in use at a time.`;
}
