/**
 * One context menu at a time (#411).
 *
 * Every right-click menu used to own its open state and its own dismissal listeners,
 * with nothing shared between them. The listeners were bubble-phase `click` and
 * `contextmenu` handlers on document, so any opener that stopped propagation slipped
 * past them. A port's right-click does exactly that so its device's menu won't open
 * too, and the device menu stayed up under the new port menu.
 *
 * Two pieces fix the whole family:
 *  - an owner slot. Whichever menu opens claims it, and the claim closes the previous
 *    holder, so two menus can't be open at once however the second one was opened;
 *  - dismissal listeners in the capture phase. A pointer press or right-click outside
 *    every menu, or Escape, closes the current one before any element below can stop
 *    the event.
 *
 * A menu marks its root element with CONTEXT_MENU_ATTR. Presses inside it (submenus
 * are DOM descendants) are left to the menu's own items.
 */

/** Attribute on a context menu's root element. A press inside it doesn't dismiss it. */
export const CONTEXT_MENU_ATTR = "data-context-menu";

let current: { close: () => void } | null = null;

/** Make the menu that `close` dismisses the open one, closing whichever menu held the
 *  slot before. Returns the release to call when this menu closes or unmounts. A stale
 *  release (from a menu that was already displaced) does nothing. */
export function claimContextMenu(close: () => void): () => void {
  const token = { close };
  const previous = current;
  current = token;
  if (previous) previous.close();
  return () => {
    if (current === token) current = null;
  };
}

function insideAMenu(e: Event): boolean {
  const target = e.target as { closest?: (selector: string) => unknown } | null;
  return typeof target?.closest === "function" && !!target.closest(`[${CONTEXT_MENU_ATTR}]`);
}

/** Listen on `doc` for the gestures that dismiss an open menu: a pointer press or a
 *  right-click outside every menu (capture phase, so nothing underneath can swallow
 *  it), or Escape. Escape listens in the bubble phase so an input inside a menu can
 *  still use Escape for itself by stopping propagation. Returns the detach. */
export function attachContextMenuDismiss(doc: EventTarget, close: () => void): () => void {
  const onPointerDown = (e: Event) => {
    if (!insideAMenu(e)) close();
  };
  const onContextMenu = (e: Event) => {
    if (!insideAMenu(e)) close();
  };
  const onKeyDown = (e: Event) => {
    if ((e as KeyboardEvent).key === "Escape") close();
  };
  const capture = { capture: true };
  doc.addEventListener("pointerdown", onPointerDown, capture);
  doc.addEventListener("contextmenu", onContextMenu, capture);
  doc.addEventListener("keydown", onKeyDown);
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown, capture);
    doc.removeEventListener("contextmenu", onContextMenu, capture);
    doc.removeEventListener("keydown", onKeyDown);
  };
}
