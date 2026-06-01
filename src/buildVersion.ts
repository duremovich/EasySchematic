declare const __BUILD_HASH__: string;

type BuildInfo = {
  hash?: string;
};

async function clearServiceWorkerState(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // If we cannot touch the SW registry, a hard reload is still worth trying.
  }

  try {
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache Storage may be unavailable in private or restricted modes.
  }
}

export async function ensureLatestBuild(): Promise<boolean> {
  if (import.meta.env.DEV) return true;

  try {
    const res = await fetch("/build-info.json", { cache: "no-store" });
    if (!res.ok) return true;

    const info = await res.json() as BuildInfo;
    if (!info.hash || info.hash === __BUILD_HASH__) return true;

    await clearServiceWorkerState();
    window.location.reload();
    return false;
  } catch {
    // If the version check fails, leave the app alone rather than risking a reload loop.
    return true;
  }
}
