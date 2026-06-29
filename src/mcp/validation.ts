/**
 * Pure helpers for the MCP bridge — no store, DOM, or socket access, so they are
 * unit-testable in isolation. The bridge (`src/mcpBridge.ts`) wraps these and
 * applies their results through the store actions.
 */
import { SAFE_DEVICE_FIELDS, RACK_TYPES, type PortFace } from "./protocol";

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

/**
 * Best-effort inverse of noteTextToHtml: render a note's stored HTML back to readable
 * plain text for the MCP read surface (get_schematic). The block-level tags the note
 * sanitizer keeps (`br`/`div`/`p`/`li`/`ul`/`ol`) become line breaks, so block structure
 * isn't collapsed (`<div>A</div><div>B</div>` -> "A\nB", never "AB"); the remaining
 * inline formatting tags (b/i/strong/…) are dropped; HTML entities are unescaped (&amp;
 * last, so `&amp;lt;` -> `&lt;`). Lossy for rich formatting — which is fine for a read
 * surface, and update_note replaces a note's content with plain text anyway.
 */
export function noteHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:div|p|li|ul|ol|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export type CardForSlotResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Decide whether a card template may be installed into a modular slot. A card "fits"
 * a slot only when their slot families match exactly. The store's swapCard does NOT
 * check this (it installs any resolvable card blindly), so the bridge enforces it —
 * otherwise an AI could install, say, an audio card into a video slot. Both families
 * come from the live data: the slot's denormalized `slotFamily` (set on nested slots
 * too) and the card template's `slotFamily` (present only on expansion-card templates).
 */
export function validateCardForSlot(
  slotFamily: string | undefined,
  cardSlotFamily: string | undefined,
): CardForSlotResult {
  if (!cardSlotFamily) {
    return { ok: false, error: "That template is not an expansion card (it has no slot family)." };
  }
  if (!slotFamily) {
    return { ok: false, error: "That slot has no slot family, so no card can be matched to it." };
  }
  if (slotFamily !== cardSlotFamily) {
    return {
      ok: false,
      error: `Card slot family "${cardSlotFamily}" does not fit slot family "${slotFamily}".`,
    };
  }
  return { ok: true };
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

// ── Rack helpers (Ship 7) ──────────────────────────────────────────
// Pure validators for the rack tools. The store-state-dependent checks (slot
// availability, which page holds a rack) stay in the bridge handler; these cover only
// the untrusted scalar inputs that arrive over the bridge.

export type UPositionResult =
  | { ok: true; u: number }
  | { ok: false; error: string };

/** Validate a rack U position. Must be a whole number >= 1 (1-based, bottom-up). The
 *  upper bound is rack-specific and is enforced by the store's isRackSlotAvailable, not
 *  here. */
export function validateUPosition(u: unknown): UPositionResult {
  if (typeof u !== "number" || !Number.isInteger(u) || u < 1) {
    return { ok: false, error: "uPosition must be a whole number of 1 or more (1-based, from the bottom)." };
  }
  return { ok: true, u };
}

export type RackFaceResult =
  | { ok: true; face: "front" | "rear" }
  | { ok: false; error: string };

/** Validate the optional rack face. Omitted -> "front". Only "front"/"rear" are valid
 *  (the 2-post-rear restriction is rack-specific and checked in the handler). */
export function validateRackFace(face: unknown): RackFaceResult {
  if (face === undefined) return { ok: true, face: "front" };
  if (face === "front" || face === "rear") return { ok: true, face };
  return { ok: false, error: `face must be "front" or "rear".` };
}

/** Editor clamps for a rack, mirroring RackSidebar.tsx so the bridge can't create a rack
 *  outside the range a user could build by hand. */
export const RACK_MIN_HEIGHT_U = 2;
export const RACK_MAX_HEIGHT_U = 60;
export const RACK_MIN_DEPTH_MM = 100;
export const RACK_MAX_DEPTH_MM = 2000;
export const DEFAULT_RACK_HEIGHT_U = 42;
export const DEFAULT_RACK_DEPTH_MM = 600;

export type RackSpecResult =
  | { ok: true; rackType: (typeof RACK_TYPES)[number]; heightU: number; depthMm: number }
  | { ok: false; error: string };

/** Validate + normalize a create_rack spec. rackType defaults to "floor-19" and must be
 *  one of RACK_TYPES. heightU/depthMm default to 42U / 600mm and are rounded then clamped
 *  to the editor's ranges; a non-numeric (but supplied) value is rejected rather than
 *  silently defaulted. */
export function validateRackSpec(
  rackType: unknown,
  heightU: unknown,
  depthMm: unknown,
): RackSpecResult {
  const rt = rackType === undefined ? "floor-19" : rackType;
  if (typeof rt !== "string" || !(RACK_TYPES as readonly string[]).includes(rt)) {
    return { ok: false, error: `rackType must be one of: ${RACK_TYPES.join(", ")}.` };
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  let h = DEFAULT_RACK_HEIGHT_U;
  if (heightU !== undefined) {
    if (!Number.isFinite(heightU)) return { ok: false, error: "heightU must be a finite number." };
    h = clamp(heightU as number, RACK_MIN_HEIGHT_U, RACK_MAX_HEIGHT_U);
  }
  let d = DEFAULT_RACK_DEPTH_MM;
  if (depthMm !== undefined) {
    if (!Number.isFinite(depthMm)) return { ok: false, error: "depthMm must be a finite number." };
    d = clamp(depthMm as number, RACK_MIN_DEPTH_MM, RACK_MAX_DEPTH_MM);
  }
  return { ok: true, rackType: rt as (typeof RACK_TYPES)[number], heightU: h, depthMm: d };
}
