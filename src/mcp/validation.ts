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

export type PositionResult =
  | { ok: true; position: { x: number; y: number } }
  | { ok: false; error: string };

/** Validate the x/y of a move command. Input is untrusted (it arrives over the
 *  bridge), so only finite numbers are accepted — NaN, Infinity and non-numbers
 *  are rejected rather than written into a node's position. */
export function validatePosition(x: unknown, y: unknown): PositionResult {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: "x and y must both be finite numbers." };
  }
  return { ok: true, position: { x: x as number, y: y as number } };
}

/** Minimum room dimensions, matching the editor's room NodeResizer (RoomNode.tsx),
 *  so the bridge can't create a room smaller than one a user could draw by hand. */
export const MIN_ROOM_WIDTH = 200;
export const MIN_ROOM_HEIGHT = 150;

export type RoomSizeResult =
  | { ok: true; size: { width: number; height: number } | undefined }
  | { ok: false; error: string };

/** Validate the optional width/height of a create_room command. Input is untrusted
 *  (it arrives over the bridge). Both omitted -> ok with size undefined (the caller
 *  uses the 400x300 default). If either is given, BOTH must be finite numbers at or
 *  above the editor minimums; partial or sub-minimum sizes are rejected rather than
 *  written into a room that couldn't be created in the editor. */
export function validateRoomSize(width: unknown, height: unknown): RoomSizeResult {
  if (width === undefined && height === undefined) {
    return { ok: true, size: undefined };
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, error: "width and height must both be finite numbers, or both omitted." };
  }
  const w = width as number;
  const h = height as number;
  if (w < MIN_ROOM_WIDTH || h < MIN_ROOM_HEIGHT) {
    return { ok: false, error: `Room is too small; the minimum size is ${MIN_ROOM_WIDTH}x${MIN_ROOM_HEIGHT}.` };
  }
  return { ok: true, size: { width: w, height: h } };
}

/**
 * Convert untrusted plain text into safe note HTML. Note nodes store HTML and are
 * rendered via innerHTML (then re-sanitized by sanitizeNoteHtml on display/import),
 * so raw bridge text must be entity-escaped — otherwise `<`/`&` would corrupt the
 * markup or open an XSS hole. The output contains only escaped text plus `<br>`, so
 * it shows the text literally and is a no-op under sanitizeNoteHtml.
 *
 * CRLF / lone CR are normalized to LF first so every newline style becomes a single
 * `<br>`. (HTML still collapses runs of spaces — that is inherent to HTML rendering,
 * not something escaping can preserve.)
 */
export function noteTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/** Minimal shape of an edge this planner needs — kept structural so validation.ts
 *  stays dependency-free (no import from the rest of src/). */
interface RemovableEdge {
  id: string;
  data?: { linkedConnectionId?: string } | null;
}

export type ConnectionRemovalPlan =
  | { ok: true; removeId: string }
  | { ok: false; error: string };

/**
 * Decide whether a single connection can be removed by id.
 *   - id not found            -> error
 *   - stubbed/linked edge      -> rejected (it has a partner leg + stub-label node
 *     that a plain edge-remove would orphan; cascading that is out of scope for
 *     this Beta slice, so we fail honestly instead of corrupting the drawing)
 *   - plain edge               -> ok, remove just that edge
 */
export function planConnectionRemoval(
  edges: RemovableEdge[],
  connectionId: string,
): ConnectionRemovalPlan {
  const edge = edges.find((e) => e.id === connectionId);
  if (!edge) {
    return { ok: false, error: `No connection found with id "${connectionId}".` };
  }
  if (edge.data?.linkedConnectionId) {
    return {
      ok: false,
      error:
        `Connection "${connectionId}" is a stubbed (linked) connection; removing it ` +
        `via the AI bridge isn't supported yet — remove it in the editor, or delete ` +
        `one of its devices.`,
    };
  }
  return { ok: true, removeId: connectionId };
}

export interface BatchItemResult<T> {
  index: number;
  ok: boolean;
  result?: T;
  error?: string;
}

export type BatchOutcome<T> =
  | { ok: false; error: string }
  | { ok: true; results: BatchItemResult<T>[]; succeeded: number; failed: number };

/**
 * Run a best-effort batch: validate that `items` is a non-empty array within `max`,
 * then apply `fn` to each item in order, capturing per-item success/failure instead
 * of aborting the whole batch. `fn` is injected (the store-touching work lives in the
 * caller), so this stays pure and unit-testable. The caller turns an `ok:false`
 * outcome into a thrown error — it must not be returned as a successful tool result.
 */
export function runBatch<I, T>(
  items: unknown,
  max: number,
  fn: (item: I, index: number) => T,
): BatchOutcome<T> {
  if (!Array.isArray(items)) {
    return { ok: false, error: "Expected an array of items." };
  }
  if (items.length === 0) {
    return { ok: false, error: "The batch is empty — provide at least one item." };
  }
  if (items.length > max) {
    return { ok: false, error: `Too many items (${items.length}); the maximum is ${max} per call.` };
  }
  const results: BatchItemResult<T>[] = [];
  let succeeded = 0;
  let failed = 0;
  items.forEach((item, index) => {
    try {
      const result = fn(item as I, index);
      results.push({ index, ok: true, result });
      succeeded++;
    } catch (err) {
      results.push({ index, ok: false, error: err instanceof Error ? err.message : String(err) });
      failed++;
    }
  });
  return { ok: true, results, succeeded, failed };
}
