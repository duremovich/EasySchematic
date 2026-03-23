import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const DISMISS_KEY = 'easyschematic-mobile-dismissed';

export default function MobileGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const check = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        setShow(false);
      } else if (!sessionStorage.getItem(DISMISS_KEY)) {
        setShow(true);
      }
    };

    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6">
      <div className="max-w-sm rounded-lg bg-[var(--bg-primary)] p-8 text-center shadow-xl">
        <h1 className="mb-4 text-xl font-bold text-[var(--text-primary)]">
          EasySchematic is designed for desktop browsers.
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-[var(--text-secondary)]">
          This tool works best with a keyboard, mouse, and a screen wide enough
          to see your signal flow. For the full experience, open this on a
          laptop or desktop.
        </p>
        <button
          onClick={dismiss}
          className="rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
        >
          Continue Anyway →
        </button>
      </div>
    </div>
  );
}
