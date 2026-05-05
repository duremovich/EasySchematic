import { useLayoutEffect, useRef, useState } from "react";

/** Adjusted menu position, plus a `ready` flag so consumers can hide the menu
 *  for the single frame between mount and measurement (avoids a flash at the
 *  unadjusted position). `maxHeight` is set only when the menu is taller than
 *  both the space below and above the click — in that case it sticks to the
 *  top of the viewport with vertical scrolling. */
export interface ContextMenuPosition {
  x: number;
  y: number;
  maxHeight?: number;
  ready: boolean;
}

const VIEWPORT_MARGIN = 8;

/** Measure a context-menu container and return a viewport-aware position.
 *  Prefers placing the menu at (desiredX, desiredY); flips up/left when that
 *  would clip; falls back to top-anchored + scroll if it doesn't fit either way.
 *  Pass `extraDeps` if the rendered element swaps (e.g. the menu enters an
 *  inline-edit mode with a different DOM structure) — the layout effect will
 *  re-measure the new element. */
export function useContextMenuPosition(desiredX: number, desiredY: number, extraDeps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<ContextMenuPosition>({ x: desiredX, y: desiredY, ready: false });

  useLayoutEffect(() => {
    if (!ref.current) {
      setPos({ x: desiredX, y: desiredY, ready: false });
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const m = VIEWPORT_MARGIN;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = desiredX;
    let y = desiredY;
    let maxHeight: number | undefined;

    if (x + rect.width + m > vw) x = Math.max(m, vw - rect.width - m);
    if (rect.width + 2 * m > vw) x = m;

    const spaceBelow = vh - desiredY - m;
    const spaceAbove = desiredY - m;
    if (rect.height > spaceBelow) {
      if (rect.height <= spaceAbove) {
        y = desiredY - rect.height;
      } else {
        y = m;
        maxHeight = vh - 2 * m;
      }
    }

    setPos({ x, y, maxHeight, ready: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredX, desiredY, ...extraDeps]);

  return { ref, pos };
}
