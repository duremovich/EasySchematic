/**
 * Pure helpers for the MCP bridge — no store, DOM, or socket access, so they are
 * unit-testable in isolation. The bridge (`src/mcpBridge.ts`) wraps these and
 * applies their results through the store actions.
 */
import { SAFE_DEVICE_FIELDS, type PortFace } from "./protocol";

export interface ClassifiedProperties {
  /** New device label, if `label` was supplied (apply via updateDeviceLabel). */
  label?: string;
  /** New short name, if `shortName` was supplied (apply via updateDeviceShortName). */
  shortName?: string;
  /** Remaining safe scalar fields to merge via patchDeviceData. */
  patch: Record<string, string | number | boolean>;
  /** Keys that were accepted (across all three buckets above). */
  applied: string[];
  /** Keys rejected because they are not in the Ship-1 whitelist. */
  rejected: string[];
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Split a property bag into the correct store-action buckets, dropping any field
 *  that is not on the safe whitelist OR whose value is not a plain scalar. Input is
 *  untrusted (it arrives over the bridge), so non-scalar values (objects, arrays,
 *  null) are rejected rather than persisted. Fields with port/edge/structural
 *  invariants are never in SAFE_DEVICE_FIELDS, so this can never drive a structural
 *  mutation. */
export function classifyDeviceProperties(
  properties: Record<string, unknown>,
): ClassifiedProperties {
  const result: ClassifiedProperties = { patch: {}, applied: [], rejected: [] };
  for (const [key, value] of Object.entries(properties)) {
    const kind = SAFE_DEVICE_FIELDS[key];
    if (!kind || !isScalar(value)) {
      result.rejected.push(key);
      continue;
    }
    if (kind === "label") result.label = String(value);
    else if (kind === "shortName") result.shortName = String(value);
    else result.patch[key] = value;
    result.applied.push(key);
  }
  return result;
}

export type HandleResolution =
  | { ok: true; handleId: string }
  | { ok: false; error: string };

/**
 * Pick the React Flow handle id for a (portId, face) given the candidate handle
 * ids the layout produced for that port:
 *   - 0 candidates -> port not found
 *   - 1 candidate  -> use it (face ignored; plain input/output port)
 *   - 2 candidates -> two-sided port; the face selects `${portId}-${face}`
 */
export function resolveHandleFromCandidates(
  candidateHandleIds: string[],
  portId: string,
  face: PortFace | undefined,
): HandleResolution {
  if (candidateHandleIds.length === 0) {
    return { ok: false, error: `Port "${portId}" not found.` };
  }
  if (candidateHandleIds.length === 1) {
    return { ok: true, handleId: candidateHandleIds[0] };
  }
  const faces = candidateHandleIds
    .map((h) => (h.startsWith(`${portId}-`) ? h.slice(portId.length + 1) : ""))
    .filter(Boolean);
  if (!face) {
    return { ok: false, error: `Port "${portId}" has two sides; specify face as one of: ${faces.join(", ")}.` };
  }
  const wanted = `${portId}-${face}`;
  if (candidateHandleIds.includes(wanted)) {
    return { ok: true, handleId: wanted };
  }
  return { ok: false, error: `Invalid face "${face}" for port "${portId}". Valid: ${faces.join(", ")}.` };
}
