/**
 * The non-built-in types a drawing uses (custom-types P5). A saved file carries their
 * definitions in `SchematicFile.customTypes`, so it opens with the right labels and
 * colours on a client that has never seen them; opening it registers them as the
 * `document` layer of the type registry.
 */
import {
  isBuiltinConnector,
  isBuiltinSignal,
  registeredConnector,
  registeredDeviceType,
  registeredSignal,
  typeLayer,
} from "./typeRegistry";
import { DEVICE_TYPE_TO_CATEGORY } from "./deviceTypeCategories";
import type { ConnectorTypeDef, CustomTypeDefs, CustomTypeKind, DeviceTypeDef, SignalTypeDef } from "./customTypes";

export interface UsedTypeIds {
  signals: Set<string>;
  connectors: Set<string>;
  deviceTypes: Set<string>;
}

const CONNECTOR_KEYS = new Set(["connectorType", "rearConnectorType", "frontConnectorType"]);

/**
 * Every signal / connector / device-type id anywhere in `roots` (devices, ports, cards,
 * connections, embedded templates, pages). A generic walk over the plain data rather
 * than a list of shapes, so a new place a port can live is covered without a change here.
 */
export function collectTypeIds(...roots: unknown[]): UsedTypeIds {
  const out: UsedTypeIds = { signals: new Set(), connectors: new Set(), deviceTypes: new Set() };
  const stack: unknown[] = [...roots];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (const x of v) if (x && typeof x === "object") stack.push(x);
      continue;
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === "string") {
        if (k === "signalType") out.signals.add(x);
        else if (CONNECTOR_KEYS.has(k)) out.connectors.add(x);
        else if (k === "deviceType") out.deviceTypes.add(x);
      } else if (x && typeof x === "object") {
        stack.push(x);
      }
    }
  }
  return out;
}

/**
 * The definitions to write into a file: every registered non-built-in type the drawing
 * uses, plus the connectors those types point at (a signal's default connector, a
 * connector's mating lists), so the file is self-contained. Undefined when there are none.
 */
export function embeddedTypesFor(...roots: unknown[]): CustomTypeDefs | undefined {
  const used = collectTypeIds(...roots);
  const signals: SignalTypeDef[] = [];
  const connectors: ConnectorTypeDef[] = [];
  const deviceTypes: DeviceTypeDef[] = [];
  const connectorIds = new Set<string>();
  const addConnector = (id: string) => {
    if (connectorIds.has(id) || isBuiltinConnector(id)) return;
    const def = registeredConnector(id);
    if (!def) return;
    connectorIds.add(id);
    connectors.push(def);
    for (const ref of [...def.matesWith, ...def.adaptsTo]) addConnector(ref);
  };
  for (const id of [...used.signals].sort()) {
    if (isBuiltinSignal(id)) continue;
    const def = registeredSignal(id);
    if (!def) continue;
    signals.push(def);
    addConnector(def.defaultConnector);
  }
  for (const id of [...used.connectors].sort()) addConnector(id);
  for (const id of [...used.deviceTypes].sort()) {
    if (Object.prototype.hasOwnProperty.call(DEVICE_TYPE_TO_CATEGORY, id)) continue;
    const def = registeredDeviceType(id);
    if (def) deviceTypes.push(def);
  }
  connectors.sort((a, b) => a.id.localeCompare(b.id));
  if (!signals.length && !connectors.length && !deviceTypes.length) return undefined;
  return {
    ...(signals.length ? { signals } : {}),
    ...(connectors.length ? { connectors } : {}),
    ...(deviceTypes.length ? { deviceTypes } : {}),
  };
}

/** How many places in `roots` use a type of this kind (ports, connections, devices). */
export function countTypeUses(kind: CustomTypeKind, id: string, ...roots: unknown[]): number {
  let n = 0;
  const stack: unknown[] = [...roots];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
      continue;
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === id) {
        if (kind === "signal" ? k === "signalType" : kind === "connector" ? CONNECTOR_KEYS.has(k) : k === "deviceType") n++;
      } else if (x && typeof x === "object") {
        stack.push(x);
      }
    }
  }
  return n;
}

/** User / community definitions that point at a connector (default connector, mating lists). */
export function connectorReferencedBy(id: string, defs: CustomTypeDefs): string[] {
  const out: string[] = [];
  for (const s of defs.signals ?? []) if (s.defaultConnector === id) out.push(s.label);
  for (const c of defs.connectors ?? []) if (c.id !== id && (c.matesWith.includes(id) || c.adaptsTo.includes(id))) out.push(c.label);
  return out;
}

/**
 * The definitions in `defs` that `roots` use (plus the connectors those point at), minus
 * any id the community layer defines: what a file's or archive's templates should bring
 * into the user's library when they join it, so the library keeps rendering them after
 * the document that carried them is closed.
 */
export function libraryTypesFor(defs: CustomTypeDefs | undefined, ...roots: unknown[]): CustomTypeDefs {
  if (!defs) return {};
  const used = collectTypeIds(...roots);
  const community = typeLayer("community");
  const isCommunity = (list: readonly { id: string }[] | undefined, id: string) => !!list?.some((d) => d.id === id);
  const signals = (defs.signals ?? []).filter((d) => used.signals.has(d.id) && !isCommunity(community.signals, d.id));
  const connectorIds = new Set<string>();
  const byId = new Map((defs.connectors ?? []).map((c) => [c.id, c]));
  const addConnector = (id: string) => {
    const c = byId.get(id);
    if (!c || connectorIds.has(id) || isCommunity(community.connectors, id)) return;
    connectorIds.add(id);
    for (const ref of [...c.matesWith, ...c.adaptsTo]) addConnector(ref);
  };
  for (const s of signals) addConnector(s.defaultConnector);
  for (const id of used.connectors) addConnector(id);
  return {
    signals,
    connectors: (defs.connectors ?? []).filter((c) => connectorIds.has(c.id)),
    deviceTypes: (defs.deviceTypes ?? []).filter((d) => used.deviceTypes.has(d.id) && !isCommunity(community.deviceTypes, d.id)),
  };
}
