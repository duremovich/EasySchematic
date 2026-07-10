import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** The label shown on the parent-menu row. */
  label: ReactNode;
  /** The submenu body — typically a series of buttons. */
  children: ReactNode;
  /** Optional min-width for the submenu panel (defaults to 160px to match the parent menu). */
  minWidth?: number;
}

const HOVER_CLOSE_GRACE_MS = 250;
const VIEWPORT_MARGIN = 8;
// Slack (px) used to bridge the hair-line seam between the trigger and the
// flyout, and to forgive imprecise pointer positions right on an edge.
const HOVER_TOLERANCE = 6;

/** Hover-to-open submenu used inside context menus. The submenu panel renders
 *  as its own fixed-position div (not nested visually inside the parent), and
 *  uses the same flip/clamp logic as the top-level menu so it never escapes
 *  the viewport.
 *
 *  Staying open is governed geometrically (#177): while the flyout is open we
 *  watch the real pointer position and keep it open as long as the cursor is
 *  over the trigger row, over the flyout, or in the corridor bridging the two.
 *  Only once the pointer has actually left that whole region for a short grace
 *  period does it close. This survives the two cases a relatedTarget/onMouseLeave
 *  scheme misses: the sub-pixel (or scrollbar-width) seam between the trigger and
 *  the flyout, and a slow diagonal traverse that grazes sibling menu rows on the
 *  way in. */
export default function MenuSubmenu({ label, children, minWidth = 160 }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; maxHeight?: number; ready: boolean }>({
    x: 0,
    y: 0,
    ready: false,
  });

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    if (closeTimer.current) return; // a close is already pending
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, HOVER_CLOSE_GRACE_MS);
  };

  const openNow = () => {
    cancelClose();
    // Reset ready only when opening from closed so the panel hides until the
    // layout effect re-measures (prevents a flash at the previous position).
    // Re-entering the trigger while already open must NOT hide it — a hidden
    // panel stops receiving pointer events and would then close on us.
    if (!open) setPos((p) => ({ ...p, ready: false }));
    setOpen(true);
  };

  // Keep-open region = trigger rect ∪ flyout rect ∪ the horizontal corridor at
  // the trigger's row that spans across to the flyout (bridges any seam/gap,
  // whatever its width). Everything is padded by HOVER_TOLERANCE.
  const pointerIsInside = (x: number, y: number): boolean => {
    const t = triggerRef.current?.getBoundingClientRect();
    const s = submenuRef.current?.getBoundingClientRect();
    const tol = HOVER_TOLERANCE;
    const within = (r: DOMRect) =>
      x >= r.left - tol && x <= r.right + tol && y >= r.top - tol && y <= r.bottom + tol;
    if (t && within(t)) return true;
    if (s && within(s)) return true;
    if (t && s) {
      // Corridor: a band at the trigger's vertical extent spanning horizontally
      // from the leftmost to the rightmost edge of the two rects, so the pointer
      // can never fall "between" the trigger and the flyout.
      const bandTop = t.top - tol;
      const bandBottom = t.bottom + tol;
      const bandLeft = Math.min(t.left, s.left) - tol;
      const bandRight = Math.max(t.right, s.right) + tol;
      if (y >= bandTop && y <= bandBottom && x >= bandLeft && x <= bandRight) return true;
    }
    return false;
  };

  // While open, drive open/close purely from the pointer's real position.
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      if (pointerIsInside(e.clientX, e.clientY)) cancelClose();
      else scheduleClose();
    };
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelClose();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !submenuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const sub = submenuRef.current.getBoundingClientRect();
    const m = VIEWPORT_MARGIN;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = trigger.right;
    if (x + sub.width + m > vw) {
      const flipped = trigger.left - sub.width;
      x = flipped >= m ? flipped : Math.max(m, vw - sub.width - m);
    }

    let y = trigger.top;
    let maxHeight: number | undefined;
    if (y + sub.height + m > vh) {
      const flipped = trigger.bottom - sub.height;
      if (flipped >= m) {
        y = flipped;
      } else {
        y = m;
        maxHeight = vh - 2 * m;
      }
    }

    // Measure-then-position pattern: we have to read DOM rects first, then
    // commit the resolved coordinates as state so the panel rerenders in place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos({ x, y, maxHeight, ready: true });
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center justify-between gap-2"
        onMouseEnter={openNow}
        onClick={(e) => e.stopPropagation()}
      >
        <span>{label}</span>
        <span className="text-gray-400">▶</span>
      </button>
      {open && (
        <div
          ref={submenuRef}
          className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1"
          style={{
            left: pos.x,
            top: pos.y,
            minWidth,
            maxHeight: pos.maxHeight,
            overflowY: pos.maxHeight ? "auto" : undefined,
            visibility: pos.ready ? "visible" : "hidden",
          }}
          onMouseEnter={cancelClose}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </>
  );
}
