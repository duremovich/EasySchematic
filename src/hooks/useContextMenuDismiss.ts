import { useEffect } from "react";
import { attachContextMenuDismiss, claimContextMenu } from "../contextMenuOwner";

/** Wire a context menu into the one-menu-at-a-time owner (#411). While `open`, the menu
 *  holds the shared slot (opening it closes any other menu) and closes on a press or
 *  right-click outside every menu, or on Escape. The menu's root element needs the
 *  CONTEXT_MENU_ATTR attribute. `close` must be stable across renders. */
export function useContextMenuDismiss(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const release = claimContextMenu(close);
    let detach: (() => void) | null = null;
    // Attach once the gesture that opened the menu has finished dispatching, so the
    // right-click that opened it can't also dismiss it.
    const timer = setTimeout(() => {
      detach = attachContextMenuDismiss(document, close);
    }, 0);
    return () => {
      clearTimeout(timer);
      detach?.();
      release();
    };
  }, [open, close]);
}
