/**
 * IndexedDB cache for the community device-template library.
 *
 * Lets the app fall back to the last-good FULL library (not just the thin
 * bundled subset) when GET /api/templates is unreachable on a later visit, so a
 * flaky/slow/firewalled fetch doesn't silently drop a user's community devices. (#181)
 * The community types fetched alongside it are cached too (localStorage, below).
 */

import type { DeviceTemplate } from "./types";
import type { CustomTypeRecord } from "./customTypes/model";

const DB_NAME = "easyschematic-template-cache";
const DB_VERSION = 1;
const STORE = "templates";
const KEY = "library";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Persist the last successfully-fetched library. Best-effort; never throws. */
export async function saveCachedTemplates(templates: DeviceTemplate[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(templates, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable / quota — caching is optional, ignore.
  }
}

/** Load the last-good library, or null if nothing cached / IDB unavailable. */
export async function loadCachedTemplates(): Promise<DeviceTemplate[] | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DeviceTemplate[] | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// ── Community types (GET /types) ────────────────────────────────────

const TYPES_KEY = "easyschematic-community-types";

/**
 * The last-good community types live in localStorage, not IndexedDB: the list is
 * small, and a synchronous read lets the app register them before the first render,
 * so an open schematic using community signals never flashes grey.
 */
export function loadCachedCommunityTypes(): CustomTypeRecord[] | null {
  try {
    const raw = localStorage.getItem(TYPES_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomTypeRecord[]) : null;
  } catch {
    return null;
  }
}

/** Persist the last successfully fetched types. Best-effort; never throws. */
export function saveCachedCommunityTypes(records: readonly CustomTypeRecord[]): void {
  try {
    localStorage.setItem(TYPES_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable / quota: the bundled fallback still applies next boot.
  }
}
