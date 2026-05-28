import { registerSW } from "virtual:pwa-register";
import { useSWStore } from "./swStore";

const POLL_MS = 10 * 60_000;
const IDLE_RELOAD_MS = 2 * 60_000;

let lastActivity = Date.now();
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

function trackActivity(): void {
  const bump = () => { lastActivity = Date.now(); };
  window.addEventListener("mousemove", bump, { passive: true });
  window.addEventListener("keydown", bump, { passive: true });
  window.addEventListener("pointerdown", bump, { passive: true });
}

export function initServiceWorkerUpdates(): void {
  if (typeof window === "undefined") return;
  trackActivity();

  updateSW = registerSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      setInterval(() => { reg.update().catch(() => { /* offline / transient */ }); }, POLL_MS);
    },
    onNeedRefresh() {
      const idle = Date.now() - lastActivity > IDLE_RELOAD_MS;
      const hidden = document.visibilityState === "hidden";
      if (hidden || idle) {
        void updateSW?.(true);
      } else {
        useSWStore.getState().setUpdateAvailable(true);
      }
    },
  });
}

export function triggerUpdate(): void {
  if (updateSW) void updateSW(true);
  else location.reload();
}

/** Nuclear option: unregister all SWs + clear the Cache API, then reload.
 *  Does NOT touch localStorage or IndexedDB — schematic data lives there. */
export async function forceFullReset(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    location.reload();
  }
}
