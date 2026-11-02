/**
 * The one lookup layer for signal, connector and device types.
 *
 * Built-ins come from code (`types.ts`, `builtinTypeTables.ts`, `deviceTypeCategories.ts`).
 * Community types (fetched from `GET /types`: the devices site since P3, the app in P4) and
 * user types (P5, the user's library and the open file) are registered with `registerTypes`;
 * built-ins always win, because community and user ids are unique against them. See .claude/plans/custom-types.md.
 *
 * Every getter takes any id and never throws: an id nobody defined — an old, offline or
 * self-hosted client meeting a newer type — degrades to a grey, raw-id, "Other" fallback
 * instead of breaking. Tables that encode *behaviour* (compat pairs, PoE, network
 * semantics) stay built-in-keyed in their own modules; read them with `builtinEntry`.
 */
import {
  CONNECTOR_GROUPS,
  CONNECTOR_LABELS,
  SIGNAL_GROUPS,
  SIGNAL_LABELS,
  type BuiltinConnectorType,
  type BuiltinSignalType,
  type ConnectorType,
  type SignalType,
} from "./types";
import {
  CONNECTOR_ACCEPTS,
  CONNECTOR_GENDER,
  CONNECTOR_TO_CABLE,
  DEFAULT_CONNECTOR,
  DEFAULT_SIGNAL_COLORS,
  SIGNAL_ALIASES,
  SIGNAL_PREFIX,
  SIGNAL_TO_CABLE,
  type ConnectorAcceptance,
  type ConnectorGenderRule,
} from "./builtinTypeTables";
import { DEVICE_TYPE_LABELS, DEVICE_TYPE_TO_CATEGORY } from "./deviceTypeCategories";
import type { ConnectorTypeDef, DeviceTypeDef, SignalTypeDef } from "./customTypes/model";

export type { ConnectorAcceptance, ConnectorGenderRule };

/** Fallbacks for an id nobody defined. */
export const UNKNOWN_TYPE_COLOR = "#71717a";
export const UNKNOWN_TYPE_GROUP = "Other";
export const UNKNOWN_CONNECTOR: ConnectorType = "other";
/** Cable-ID prefix for a signal with none (the type-prefix naming scheme's catch-all). */
export const UNKNOWN_CABLE_PREFIX = "X";

export type { SignalTypeDef, ConnectorTypeDef, DeviceTypeDef };

/** Where a registered definition came from. Each source is one replaceable layer. */
export type TypeSource = "community" | "user";

export interface TypeDefs {
  signals?: readonly SignalTypeDef[];
  connectors?: readonly ConnectorTypeDef[];
  deviceTypes?: readonly DeviceTypeDef[];
}

// The merge point for community (`GET /types`) and user (P5) definitions: one layer per
// source, flattened into the extra* maps the getters read. Built-ins never enter here.
const layers = new Map<TypeSource, TypeDefs>();
const extraSignals = new Map<string, SignalTypeDef>();
const extraConnectors = new Map<string, ConnectorTypeDef>();
const extraDeviceTypes = new Map<string, DeviceTypeDef>();
let version = 0;
const listeners = new Set<() => void>();

/**
 * Replace one source's definitions (pass `{}` to clear it). A definition whose id is a
 * built-in is ignored: built-ins win, and a type graduated into code keeps its built-in
 * entry. Bumps `typeRegistryVersion()` and notifies subscribers, so pickers re-render.
 */
export function registerTypes(source: TypeSource, defs: TypeDefs): void {
  layers.set(source, defs);
  extraSignals.clear();
  extraConnectors.clear();
  extraDeviceTypes.clear();
  for (const src of ["community", "user"] as const) {
    const l = layers.get(src);
    if (!l) continue;
    for (const d of l.signals ?? []) if (!isBuiltinSignal(d.id)) extraSignals.set(d.id, d);
    for (const d of l.connectors ?? []) if (!isBuiltinConnector(d.id)) extraConnectors.set(d.id, d);
    for (const d of l.deviceTypes ?? []) if (!hasOwn(DEVICE_TYPE_TO_CATEGORY, d.id)) extraDeviceTypes.set(d.id, d);
  }
  version++;
  for (const fn of listeners) fn();
}

/** Increments on every registration; a cheap snapshot for `useSyncExternalStore`. */
export function typeRegistryVersion(): number {
  return version;
}

export function subscribeTypeRegistry(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Read a built-in-keyed table with any id. Own keys only, so an id like "constructor"
 *  can't pick up an Object.prototype member. */
export function builtinEntry<V>(table: Partial<Record<string, V>>, id: string): V | undefined {
  return hasOwn(table, id) ? table[id] : undefined;
}

// Not Object.hasOwn: the docs site compiles against an ES2020 lib.
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isBuiltinSignal(id: string): id is BuiltinSignalType {
  return hasOwn(SIGNAL_LABELS, id);
}

export function isBuiltinConnector(id: string): id is BuiltinConnectorType {
  return hasOwn(CONNECTOR_LABELS, id);
}

/** Defined anywhere — built-in or registered. Unknown ids still render via the fallbacks. */
export function isKnownSignal(id: string): boolean {
  return isBuiltinSignal(id) || extraSignals.has(id);
}

export function isKnownConnector(id: string): boolean {
  return isBuiltinConnector(id) || extraConnectors.has(id);
}

function groupIndex(groups: Record<string, readonly string[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [group, ids] of Object.entries(groups)) for (const id of ids) if (!out.has(id)) out.set(id, group);
  return out;
}
const BUILTIN_SIGNAL_GROUP = groupIndex(SIGNAL_GROUPS);
const BUILTIN_CONNECTOR_GROUP = groupIndex(CONNECTOR_GROUPS);

// ── Signals ─────────────────────────────────────────────────────────

export function signalLabel(id: SignalType): string {
  return builtinEntry(SIGNAL_LABELS, id) ?? extraSignals.get(id)?.label ?? id;
}

/** Concrete hex color, for exports (PDF, DXF, reports) that can't resolve CSS variables.
 *  Built-ins give their default, not the user's live theme override. */
export function signalColor(id: SignalType): string {
  return builtinEntry(DEFAULT_SIGNAL_COLORS, id) ?? extraSignals.get(id)?.color ?? UNKNOWN_TYPE_COLOR;
}

/**
 * The color to put in CSS on the canvas, and what a connection's `style.stroke` stores:
 * `var(--color-<id>)` for built-ins, so the user's signal-color overrides apply live and
 * saved files keep their exact stroke strings; the literal hex for anything else, which
 * has no CSS variable behind it.
 */
export function signalCssColor(id: SignalType): string {
  return isBuiltinSignal(id) ? `var(--color-${id})` : signalColor(id);
}

/** Functional group for pickers ("Video", "Audio", …). */
export function signalGroup(id: SignalType): string {
  return BUILTIN_SIGNAL_GROUP.get(id) ?? extraSignals.get(id)?.group ?? UNKNOWN_TYPE_GROUP;
}

/** Connector a new port of this signal starts with. */
export function defaultConnector(id: SignalType): ConnectorType {
  return builtinEntry(DEFAULT_CONNECTOR, id) ?? extraSignals.get(id)?.defaultConnector ?? UNKNOWN_CONNECTOR;
}

/** Cable-ID prefix under type-prefix cable naming (S001, A001, …). */
export function cablePrefix(id: SignalType): string {
  return builtinEntry(SIGNAL_PREFIX, id) ?? extraSignals.get(id)?.cablePrefix ?? UNKNOWN_CABLE_PREFIX;
}

/** Cable name derived from the signal alone, for runs with no connector info. */
export function signalCable(id: SignalType): string {
  return builtinEntry(SIGNAL_TO_CABLE, id) ?? extraSignals.get(id)?.cable ?? signalLabel(id);
}

// ── Connectors ──────────────────────────────────────────────────────

export function connectorLabel(id: ConnectorType): string {
  return builtinEntry(CONNECTOR_LABELS, id) ?? extraConnectors.get(id)?.label ?? id;
}

export function connectorGroup(id: ConnectorType): string {
  return BUILTIN_CONNECTOR_GROUP.get(id) ?? extraConnectors.get(id)?.group ?? UNKNOWN_TYPE_GROUP;
}

/** Cable name for pack lists. Built-ins may be "" (none, D-hole insert): no cable of its own. */
export function connectorCable(id: ConnectorType): string {
  return builtinEntry(CONNECTOR_TO_CABLE, id) ?? extraConnectors.get(id)?.cable ?? connectorLabel(id);
}

/** Device-side gender convention; undefined when genderless or unknown. */
export function connectorGender(id: ConnectorType): ConnectorGenderRule | undefined {
  const builtin = builtinEntry(CONNECTOR_GENDER, id);
  if (builtin) return builtin;
  const g = extraConnectors.get(id)?.gender;
  return g === "male" || g === "female" ? g : undefined;
}

const NO_ACCEPTANCE: Readonly<ConnectorAcceptance> = Object.freeze({});

/** What this connector physically accepts, natively or through an adapter cable. One end
 *  only: mating checks (`areConnectorsCompatible` & co.) ask both ends. */
export function connectorAccepts(id: ConnectorType): Readonly<ConnectorAcceptance> {
  const builtin = builtinEntry(CONNECTOR_ACCEPTS, id);
  if (builtin) return builtin;
  const def = extraConnectors.get(id);
  if (def) return { native: def.matesWith, adapter: def.adaptsTo };
  return NO_ACCEPTANCE;
}

// ── Device types ────────────────────────────────────────────────────

export function deviceTypeLabel(id: string): string {
  return builtinEntry(DEVICE_TYPE_LABELS, id) ?? extraDeviceTypes.get(id)?.label ?? id;
}

export function deviceTypeCategory(id: string): string {
  return builtinEntry(DEVICE_TYPE_TO_CATEGORY, id) ?? extraDeviceTypes.get(id)?.category ?? UNKNOWN_TYPE_GROUP;
}

// ── Pickers ─────────────────────────────────────────────────────────

// Picker lists leave retired types out; the getters above still resolve them.
function pickable<D extends { id: string; retired?: boolean }>(extra: Map<string, D>): string[] {
  const out: string[] = [];
  for (const d of extra.values()) if (!d.retired) out.push(d.id);
  return out;
}

/** Every pickable signal id, built-ins first in declaration order. */
export function allSignals(): SignalType[] {
  return [...Object.keys(SIGNAL_LABELS), ...pickable(extraSignals)];
}

export function allConnectors(): ConnectorType[] {
  return [...Object.keys(CONNECTOR_LABELS), ...pickable(extraConnectors)];
}

export function allDeviceTypes(): string[] {
  return [...Object.keys(DEVICE_TYPE_TO_CATEGORY), ...pickable(extraDeviceTypes)];
}

function mergeGroups<D extends { id: string; group: string; retired?: boolean }>(
  builtin: Record<string, readonly string[]>,
  extra: Map<string, D>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [group, ids] of Object.entries(builtin)) out[group] = [...ids];
  for (const def of extra.values()) if (!def.retired) (out[def.group] ??= []).push(def.id);
  return out;
}

/** Signal ids by functional group, in SIGNAL_GROUPS order, for grouped dropdowns. */
export function signalGroups(): Record<string, SignalType[]> {
  return mergeGroups(SIGNAL_GROUPS, extraSignals);
}

/** Connector ids by functional group, in CONNECTOR_GROUPS order. */
export function connectorGroups(): Record<string, ConnectorType[]> {
  return mergeGroups(CONNECTOR_GROUPS, extraConnectors);
}

// ── Built-in sets (validating new community / user types) ───────────

/** Built-in signal ids only, whatever is registered. */
export function builtinSignals(): BuiltinSignalType[] {
  return Object.keys(SIGNAL_LABELS) as BuiltinSignalType[];
}

export function builtinConnectors(): BuiltinConnectorType[] {
  return Object.keys(CONNECTOR_LABELS) as BuiltinConnectorType[];
}

/** The fixed group names a custom signal / connector may join, in picker order. */
export const SIGNAL_GROUP_NAMES: readonly string[] = Object.keys(SIGNAL_GROUPS);
export const CONNECTOR_GROUP_NAMES: readonly string[] = Object.keys(CONNECTOR_GROUPS);

/** Other spellings of built-in signals ("rs232" → serial). Lower case; may hold spaces. */
export function signalAliases(): Readonly<Record<string, BuiltinSignalType>> {
  return SIGNAL_ALIASES;
}
