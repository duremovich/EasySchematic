import type { ConnectionEdge, InstalledSlot, Port, PortDirection, SchematicNode } from "./types";
import type { PortDraft } from "./deviceTemplateBuild";
import { normalizeShortcutKey } from "./keyUtils";

/**
 * Form-local undo/redo for the device editor (#412).
 *
 * The editor's port list is local form state until Apply, so the canvas undo stack can't
 * see a Bulk Add, a deleted port or a reorder — Ctrl+Z either did nothing or undid
 * something on the canvas behind the dialog. This is a small structural undo stack for
 * the editor instead: it records port/slot structure changes (add, bulk add, duplicate,
 * delete, reorder, slot add/remove/card swap), not per-field typing — text fields keep
 * the browser's own undo.
 *
 * Two kinds of step:
 *  - "ports": the editor's local port list (nothing in the store changes until Apply).
 *  - "slots": expansion-slot edits, which write to the store immediately (they always
 *    have), so undoing one restores the device's slots/ports and its connections there.
 */

/** Store-side state an expansion-slot edit touches on the device under edit. */
export interface DeviceSlotSnapshot {
  slots: InstalledSlot[] | undefined;
  ports: Port[];
  /** Only the connections that touch the device. */
  edges: ConnectionEdge[];
}

export type EditorHistoryEntry =
  | { kind: "ports"; ports: PortDraft[] }
  | ({ kind: "slots" } & DeviceSlotSnapshot);

export interface EditorHistory<E> {
  past: E[];
  future: E[];
}

export const EDITOR_HISTORY_LIMIT = 100;

export function emptyHistory<E>(): EditorHistory<E> {
  return { past: [], future: [] };
}

/** Record the state from BEFORE a change. A new change drops anything redoable. */
export function recordEntry<E>(h: EditorHistory<E>, before: E, limit = EDITOR_HISTORY_LIMIT): EditorHistory<E> {
  const past = [...h.past, before];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

/**
 * Step back. `capture` snapshots the CURRENT state in the same shape as the entry being
 * undone, so the step can be redone. Returns null when there is nothing to undo.
 */
export function undoStep<E>(
  h: EditorHistory<E>,
  capture: (entry: E) => E,
): { history: EditorHistory<E>; restore: E } | null {
  if (h.past.length === 0) return null;
  const restore = h.past[h.past.length - 1];
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, capture(restore)] },
    restore,
  };
}

/** Step forward again — the mirror of `undoStep`. */
export function redoStep<E>(
  h: EditorHistory<E>,
  capture: (entry: E) => E,
): { history: EditorHistory<E>; restore: E } | null {
  if (h.future.length === 0) return null;
  const restore = h.future[h.future.length - 1];
  return {
    history: { past: [...h.past, capture(restore)], future: h.future.slice(0, -1) },
    restore,
  };
}

/**
 * Bring the port list back to `target`'s STRUCTURE — which ports exist, their order and
 * which section (direction) each sits in — while keeping whatever the user has typed
 * into a port since. Undoing a Bulk Add must not also throw away a rename made after it;
 * the stack is structural, field edits are not on it.
 */
export function restorePortStructure(target: PortDraft[], current: PortDraft[]): PortDraft[] {
  const byId = new Map(current.map((p) => [p.id, p]));
  return target.map((tp) => {
    const cp = byId.get(tp.id);
    return cp ? (cp.direction === tp.direction ? cp : { ...cp, direction: tp.direction }) : tp;
  });
}

/**
 * Slot counterpart of `restorePortStructure`: membership, order and the installed card
 * come from `target`; a slot's label / family / hidden flag (edited in place, not on the
 * stack) keep their current values.
 */
export function restoreSlotStructure(
  target: InstalledSlot[] | undefined,
  current: InstalledSlot[] | undefined,
): InstalledSlot[] | undefined {
  if (!target) return target;
  const byId = new Map((current ?? []).map((s) => [s.slotId, s]));
  return target.map((ts) => {
    const cs = byId.get(ts.slotId);
    if (!cs) return ts;
    return { ...ts, label: cs.label, slotFamily: cs.slotFamily, hidden: cs.hidden };
  });
}

/** Same ports in the same order and sections — i.e. a structural no-op. */
export function samePortStructure(a: PortDraft[], b: PortDraft[]): boolean {
  return a.length === b.length && a.every((p, i) => p.id === b[i].id && p.direction === b[i].direction);
}

/**
 * Move one port to `targetIndex` within the `targetDirection` section (drag-to-reorder).
 * Index is counted among that section's ports with the dragged port removed.
 */
export function movePortInList(
  ports: PortDraft[],
  portId: string,
  targetDirection: PortDirection,
  targetIndex: number,
): PortDraft[] {
  const port = ports.find((p) => p.id === portId);
  if (!port) return ports;

  const without = ports.filter((p) => p.id !== portId);
  const updated = { ...port, direction: targetDirection };

  const sectionPorts = without.filter((p) => p.direction === targetDirection);
  const insertAfterId = targetIndex > 0 ? sectionPorts[targetIndex - 1]?.id : null;

  if (sectionPorts.length === 0 || targetIndex === 0) {
    const firstOfSection = without.findIndex((p) => p.direction === targetDirection);
    if (firstOfSection === -1) return [...without, updated];
    without.splice(firstOfSection, 0, updated);
    return [...without];
  }

  const insertAfterIdx = without.findIndex((p) => p.id === insertAfterId);
  without.splice(insertAfterIdx + 1, 0, updated);
  return [...without];
}

/** Connections that touch `nodeId` at either end. */
export function edgesTouching(edges: ConnectionEdge[], nodeId: string): ConnectionEdge[] {
  return edges.filter((e) => e.source === nodeId || e.target === nodeId);
}

export type EditorShortcut = "undo" | "redo" | "close";

/** Which editor shortcut a keydown is, if any. Caps Lock safe (#179). */
export function editorShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey?: boolean; isComposing?: boolean }): EditorShortcut | null {
  // Mid-IME composition, Esc cancels the composition and Ctrl+Z belongs to the IME.
  if (e.isComposing || e.key === "Process") return null;
  if (e.key === "Escape") return "close";
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = normalizeShortcutKey(e.key);
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.shiftKey) return "redo";
  return null;
}

/**
 * Marks the device editor's root and every dialog that can stack over it (confirm prompts,
 * card creator, template sync, login, face-plate editor, custom-type dialog). The editor
 * decides whether a key is its own by the nearest marked ancestor of the key's target.
 */
export const EDITOR_LAYER_SELECTOR = "[data-editor-layer]";

/**
 * Whether the device editor should act on a key (Esc / Ctrl+Z / Ctrl+Y).
 *
 * - `editor`: the editor's root element, or null when the device editor isn't rendered —
 *   `editingNodeId` is shared with the Room / Annotation editors and text-stub inline
 *   edit, so a null editor must never own anything.
 * - `targetLayer`: the nearest marked layer around the key's target, or null when the
 *   target sits in none (body with nothing focused, or the canvas device that was just
 *   double-clicked and still holds focus).
 * - `nestedOpen`: a dialog is stacked over the editor.
 */
export function ownsEditorKey<T>(o: { editor: T | null; targetLayer: T | null; nestedOpen: boolean }): boolean {
  if (o.editor == null) return false;
  if (o.targetLayer != null) return o.targetLayer === o.editor;
  return !o.nestedOpen;
}

const TEXT_INPUT_TYPES =new Set(["", "text", "search", "url", "tel", "email", "password", "number"]);

/**
 * True for a field that has its own native undo (typing). Ctrl+Z there stays with the
 * browser; on anything else (a button, checkbox, select, the dialog itself) it is the
 * editor's structural undo.
 */
export function isTextEditingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; type?: string; isContentEditable?: boolean };
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((el.type ?? "").toLowerCase());
  return false;
}

/**
 * The Device Properties editor is open. The canvas undo/redo shortcut stands down while
 * it is: Ctrl+Z behind the dialog used to undo canvas history (even the just-placed
 * device itself) out from under the open form (#412).
 */
export function isDeviceEditorOpen(state: { editingNodeId: string | null; nodes: Pick<SchematicNode, "id" | "type">[] }): boolean {
  const id = state.editingNodeId;
  if (!id) return false;
  return state.nodes.some((n) => n.id === id && n.type === "device");
}
