/**
 * Cable-length label resolution for the canvas (#100).
 *
 * The cable schedule already carries a per-edge length: an explicit override
 * stored on `ConnectionData.cableLength`, plus an estimate derived from the
 * room-to-room distance (#146). These helpers pick which string to render on a
 * connection and reuse the exact distance math the schedule uses, so a label
 * edited on the canvas and the schedule row always agree.
 */

import type { DistanceSettings, SchematicNode } from "./types";
import { DEFAULT_DISTANCE_SETTINGS } from "./types";
import { computeCableLength, formatLength, getRoomDistance } from "./roomDistance";

/**
 * Resolve the length string to display on a connection.
 * Precedence: an explicit per-edge override wins; otherwise the room-to-room
 * computed estimate; otherwise empty (nothing to show).
 */
export function resolveCableLengthLabel(
  override: string | undefined,
  computed: string | undefined,
): string {
  const o = override?.trim();
  if (o) return o;
  return computed?.trim() ?? "";
}

/**
 * Estimated cable length for an edge, derived from the stored room distance
 * between the two endpoints' rooms plus slack. Returns undefined when no
 * distance is available (no room distances set, same room, or missing rooms).
 */
export function computeEdgeLengthEstimate(
  sourceParentId: string | undefined,
  targetParentId: string | undefined,
  nodes: SchematicNode[],
  roomDistances: Record<string, number> | undefined,
  distanceSettings: DistanceSettings | undefined,
): string | undefined {
  if (!roomDistances) return undefined;
  const dist = getRoomDistance(sourceParentId, targetParentId, { roomDistances }, nodes);
  if (dist === undefined) return undefined;
  const settings = distanceSettings ?? DEFAULT_DISTANCE_SETTINGS;
  return formatLength(computeCableLength(dist, settings), settings.unit);
}
