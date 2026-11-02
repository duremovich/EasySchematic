/**
 * The user's own signal, connector and device types (custom-types P5): a small library
 * in localStorage, registered into the type registry as the `user` layer. Ids are
 * `x-<slug>-<4 random>` and never shown in the UI. See .claude/plans/custom-types.md.
 *
 * Every tab of the app shares one localStorage but keeps its own copy in memory, so each
 * write starts from what is stored, not from memory (the #251 stale-tab guard the custom
 * device library has), and a `storage` event from another tab re-reads and re-registers.
 */
import {
  isKnownConnectorRef,
  normalizeTypeDefs,
  slugifyTypeId,
  type ConnectorTypeDef,
  type CustomTypeDefs,
  type CustomTypeKind,
  type DeviceTypeDef,
  type SignalTypeDef,
} from "./customTypes";
import { registerTypes, registeredTypes } from "./typeRegistry";
import type { ExistingCustomType } from "./customTypes";

export const USER_TYPES_KEY = "easyschematic-custom-types";

export type UserTypeLibrary = Required<CustomTypeDefs>;
export type UserTypeDef = SignalTypeDef | ConnectorTypeDef | DeviceTypeDef;

const LIST_OF = { signal: "signals", connector: "connectors", device: "deviceTypes" } as const satisfies Record<CustomTypeKind, keyof UserTypeLibrary>;

const empty = (): UserTypeLibrary => ({ signals: [], connectors: [], deviceTypes: [] });

let memory: UserTypeLibrary = empty();

/** The stored library, or null when nothing was ever saved or storage is unreadable. */
function readStored(): UserTypeLibrary | null {
  try {
    const raw = localStorage.getItem(USER_TYPES_KEY);
    if (raw == null) return null;
    return normalizeTypeDefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** What a write starts from: storage is the truth, memory only when storage has nothing (#251). */
function current(): UserTypeLibrary {
  return readStored() ?? memory;
}

function commit(lib: UserTypeLibrary): void {
  memory = lib;
  try {
    localStorage.setItem(USER_TYPES_KEY, JSON.stringify(lib));
  } catch {
    // Storage full or unavailable: the types still work for this session.
  }
  registerTypes("user", lib);
}

function reload(): void {
  memory = readStored() ?? empty();
  registerTypes("user", memory);
}

let listening = false;

/** Register the stored library (before the first render) and follow other tabs' writes. */
export function initUserTypes(): void {
  reload();
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key === USER_TYPES_KEY) reload();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) reload();
  });
}

/** The library as last loaded or written. Treat as read-only. */
export function userTypeLibrary(): UserTypeLibrary {
  return memory;
}

export function userTypesOf(kind: CustomTypeKind): readonly UserTypeDef[] {
  return memory[LIST_OF[kind]];
}

export function findUserType(kind: CustomTypeKind, id: string): UserTypeDef | undefined {
  return userTypesOf(kind).find((d) => d.id === id);
}

function randomSuffix(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * A fresh `x-<slug>-<4 random>` id for a type labelled `label`: 2–31 characters, so it
 * passes the shared id format. `taken` rejects an id already in use (any tier).
 */
export function newUserTypeId(label: string, taken: (id: string) => boolean = () => false): string {
  const slug = slugifyTypeId(label).slice(0, 24).replace(/-+$/, "") || "type";
  for (;;) {
    const id = `x-${slug}-${randomSuffix()}`;
    if (!taken(id)) return id;
  }
}

/** Add a type, or replace the one with the same id. */
export function saveUserType(kind: CustomTypeKind, def: UserTypeDef): void {
  const lib = current();
  const key = LIST_OF[kind];
  const list = lib[key] as UserTypeDef[];
  const at = list.findIndex((d) => d.id === def.id);
  const next = at >= 0 ? list.map((d, i) => (i === at ? def : d)) : [...list, def];
  commit({ ...lib, [key]: next });
}

export function deleteUserType(kind: CustomTypeKind, id: string): void {
  const lib = current();
  const key = LIST_OF[kind];
  commit({ ...lib, [key]: (lib[key] as UserTypeDef[]).filter((d) => d.id !== id) });
}

/**
 * Merge definitions into the library (a device archive, "Add to my library"). Additive:
 * an id the library already has keeps the library's definition unless `overwrite`.
 * Returns how many were added or replaced.
 */
export function importUserTypes(raw: unknown, overwrite = false): number {
  const incoming = normalizeTypeDefs(raw);
  const lib = current();
  let changed = 0;
  const merge = <D extends { id: string }>(have: D[], add: D[]): D[] => {
    const out = [...have];
    for (const d of add) {
      const at = out.findIndex((x) => x.id === d.id);
      if (at < 0) out.push(d);
      else if (overwrite) out[at] = d;
      else continue;
      changed++;
    }
    return out;
  };
  const next: UserTypeLibrary = {
    signals: merge(lib.signals, incoming.signals),
    connectors: merge(lib.connectors, incoming.connectors),
    deviceTypes: merge(lib.deviceTypes, incoming.deviceTypes),
  };
  if (changed) commit(next);
  return changed;
}

/**
 * Every registered non-built-in type (community, library, open file) in the shape the
 * shared validator checks against: cable-prefix uniqueness, and which connectors a
 * default connector or a mating list may name.
 */
export function registeredTypesForValidation(): ExistingCustomType[] {
  const all = registeredTypes();
  const rec = (kind: CustomTypeKind, d: UserTypeDef): ExistingCustomType => ({
    kind,
    id: d.id,
    status: d.retired ? "retired" : "active",
    data: d as unknown as Record<string, unknown>,
  });
  return [
    ...all.signals.map((d) => rec("signal", d)),
    ...all.connectors.map((d) => rec("connector", d)),
    ...all.deviceTypes.map((d) => rec("device", d)),
  ];
}

/** Any tier already uses this id (so a fresh random id must avoid it). */
export function isTypeIdTaken(id: string): boolean {
  return registeredTypesForValidation().some((r) => r.id === id) || isKnownConnectorRef(id, []);
}
