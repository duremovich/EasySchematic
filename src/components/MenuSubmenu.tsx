import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** The label shown on the parent-menu row. */
  label: ReactNode;
  /** The submenu body — typically a series of buttons. */
  children: ReactNode;
  /** Optional min-width for the submenu panel (defaults to 160px to match the parent menu). */
  minWidth?: number;
}

const HOVER_CLOSE_GRACE_MS = 120;
const VIEWPORT_MARGIN = 8;

/** Hover-to-open submenu used inside context menus. The submenu panel renders
 *  as its own fixed-position div (not nested visually inside the parent), and
 *  uses the same flip/clamp logic as the top-level menu so it never escapes
 *  the viewport. A small mouse-leave grace period lets the user diagonal-mouse
 *  from the trigger into the submenu without it closing on them. */
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
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_GRACE_MS);
  };

  const openNow = () => {
    cancelClose();
    // Reset ready synchronously on open so the panel hides until the layout
    // effect re-measures — prevents a flash at the previous open's position.
    setPos((p) => ({ ...p, ready: false }));
    setOpen(true);
  };

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
    setPos({ x, y, maxHeight, ready: true });
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center justify-between gap-2"
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
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
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </>
  );
}
