/**
 * Normalize a KeyboardEvent `key` for shortcut matching.
 *
 * With Caps Lock on, a letter key reports as uppercase (e.g. "C" instead of
 * "c"), which breaks the lowercase comparisons our shortcut handlers rely on
 * (#179). Single-character keys are lowercased so `key === "c"` still matches;
 * multi-character key names ("Enter", "ArrowUp", "Delete", …) are left as-is.
 *
 * Shortcuts that intentionally distinguish Shift (e.g. redo vs. undo) must
 * branch on `event.shiftKey`, never on the letter's case: Shift and Caps Lock
 * cancel out, so the reported case is not a reliable signal.
 */
export function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}
