import type { ConnectorType, Port, SignalType } from "./types";
import { builtinEntry, connectorAccepts, connectorCable, connectorLabel, signalCable, signalLabel } from "./typeRegistry";
import {
  HYBRID_CABLE_FAMILY,
  BARE_WIRE_CONNECTORS,
  BARE_WIRE_HYBRID_PARTNERS,
  FIELD_TERMINATED_CONNECTORS,
  TERMINABLE_BARE_WIRE_CONNECTORS,
  matesNatively,
  needsAdapter,
  resolvePortGender,
} from "./connectorTypes";

const HYBRID_FAMILY_ORDER: ConnectorType[] = Object.keys(HYBRID_CABLE_FAMILY);

/**
 * Cable label for a run whose two ends terminate differently but mate with no adapter
 * in between — e.g. "LC to SC Fiber". Returns undefined unless both ends sit in the
 * same hybrid family (see HYBRID_CABLE_FAMILY) and actually mate natively.
 *
 * Without this the pack list names the cable after ONE end, and whoever packs an
 * "LC Fiber" for an LC↔SC run arrives with a cable that only lands at one device.
 *
 * The two ends are ordered by HYBRID_CABLE_FAMILY declaration order rather than by drag
 * direction: a hybrid cord is a symmetric part, so LC→SC and SC→LC have to collapse onto
 * one pack-list row instead of billing as two SKUs. (Adapter labels stay directional — an
 * adapter is directional hardware with a male and a female end.) Declaration order runs
 * commonplace → specialty, so it reads as "LC to opticalCON Fiber"; sorting the labels
 * alphabetically instead would file opticalCON between LC and SC.
 */
export function hybridCableLabel(
  a: ConnectorType | undefined,
  b: ConnectorType | undefined,
): string | undefined {
  if (!a || !b || a === b) return undefined;
  const family = builtinEntry(HYBRID_CABLE_FAMILY, a);
  if (!family || builtinEntry(HYBRID_CABLE_FAMILY, b) !== family) return undefined;
  if (!matesNatively(a, b)) return undefined;
  // "LC Fiber" → "LC"; the family word is appended once at the end.
  const end = (c: ConnectorType): string => {
    const cable = connectorCable(c);
    return cable.endsWith(` ${family}`) ? cable.slice(0, -family.length - 1) : cable;
  };
  const [first, second] =
    HYBRID_FAMILY_ORDER.indexOf(a) <= HYBRID_FAMILY_ORDER.indexOf(b) ? [a, b] : [b, a];
  return `${end(first)} to ${end(second)} ${family}`;
}

/**
 * Cable label for a run with a bare-wire end. Bare wire is compatible with every
 * connector, so these runs used to fall through to the source-connector default and the
 * same two endpoints packed under different names depending on drag direction.
 *
 * Returns undefined unless exactly the bare-wire cases apply; every label produced is
 * independent of argument order.
 *
 * - Field-terminated end (solder cup, punch-down, IDC): there is no connector — the part
 *   packed is bulk cable, named for the far end's family ("Bulk Cat6") or plain
 *   "Bulk Cable" when the far end is bare too.
 * - Screw-terminal end (Phoenix, terminal block) against a real connector: one cable with
 *   a plug on one end and a screw-terminal tail on the other, but only pairings that exist
 *   as a physical part (BARE_WIRE_HYBRID_PARTNERS) get the combined label. Implausible
 *   pairings like hdmi↔phoenix keep the far end's own cable label — conservative, since
 *   compatibility waves bare wire through against everything.
 */
export function bareWireCableLabel(
  a: ConnectorType | undefined,
  b: ConnectorType | undefined,
): string | undefined {
  if (!a || !b || a === b) return undefined;
  if (!BARE_WIRE_CONNECTORS.has(a) && !BARE_WIRE_CONNECTORS.has(b)) return undefined;

  if (FIELD_TERMINATED_CONNECTORS.has(a) || FIELD_TERMINATED_CONNECTORS.has(b)) {
    const far = FIELD_TERMINATED_CONNECTORS.has(a) ? b : a;
    const cable = BARE_WIRE_CONNECTORS.has(far) ? "" : connectorCable(far);
    return cable ? `Bulk ${cable}` : "Bulk Cable";
  }

  const bare = TERMINABLE_BARE_WIRE_CONNECTORS.has(a) ? a : b;
  const far = bare === a ? b : a;
  if (TERMINABLE_BARE_WIRE_CONNECTORS.has(far)) {
    // Screw terminals on both ends: plain wire either way; name it deterministically.
    return connectorCable([a, b].sort()[0]);
  }
  if (BARE_WIRE_HYBRID_PARTNERS.has(far)) {
    return `${connectorCable(far)} to ${connectorCable(bare)}`;
  }
  return connectorCable(far) || connectorCable(bare);
}

/**
 * Derive cable type from ports and signal type.
 * Prefers connector-based lookup; falls back to signal-based for legacy data.
 */
export function getCableType(
  sourcePort: Port | undefined,
  targetPort: Port | undefined,
  signalType: SignalType,
): string {
  // Multicable trunk: derive from channel count + signal type
  const multicablePort = sourcePort?.isMulticable ? sourcePort : targetPort?.isMulticable ? targetPort : undefined;
  if (multicablePort) {
    const count = multicablePort.channelCount ?? 0;
    const connector = multicablePort.connectorType;
    if (connector === "socapex") {
      return `Socapex (${count}-Ch ${signalLabel(signalType)})`;
    }
    return `${count}-Ch ${signalLabel(signalType)}`;
  }

  const src = sourcePort?.connectorType;
  const tgt = targetPort?.connectorType;

  if (src && tgt && src !== tgt) {
    // Adapter-needed connection: label as adapter cable
    if (needsAdapter(src, tgt)) {
      const srcLabel = connectorLabel(src);
      const tgtLabel = connectorLabel(tgt);
      return `${srcLabel} to ${tgtLabel} Adapter`;
    }
    // Natively-mating ends that terminate differently: one hybrid cord, both ends named.
    const hybrid = hybridCableLabel(src, tgt);
    if (hybrid) return hybrid;
    // Bare-wire end: direction-independent bulk or screw-terminal label.
    const bareWire = bareWireCableLabel(src, tgt);
    if (bareWire) return bareWire;
    // Native combo: prefer the more specific (accepted) connector for cable label
    if (connectorAccepts(src).native?.includes(tgt)) {
      return connectorCable(tgt) || signalCable(signalType);
    }
    if (connectorAccepts(tgt).native?.includes(src)) {
      return connectorCable(src) || signalCable(signalType);
    }
  }

  // Default: use source connector
  const connector = src ?? tgt;
  if (connector) {
    const cable = connectorCable(connector);
    if (cable) {
      const suffix = sameGenderSuffix(sourcePort, targetPort);
      return suffix ? `${cable} ${suffix}` : cable;
    }
  }
  return signalCable(signalType);
}

/**
 * Returns the cable's own gender suffix ("M-M" or "F-F") when both endpoints share a gender
 * — the case where a standard M-F cable won't work. A cable plug is always the opposite
 * gender of the port it mates with (male plug → female socket), so two female ports demand
 * an M-M cable and two male ports demand an F-F cable. Returns undefined for normal M-F
 * runs, for mismatched or genderless connectors, or when gender can't be confidently resolved.
 */
function sameGenderSuffix(sourcePort: Port | undefined, targetPort: Port | undefined): string | undefined {
  const srcG = resolvePortGender(sourcePort);
  const tgtG = resolvePortGender(targetPort);
  if (!srcG || !tgtG || srcG !== tgtG) return undefined;
  // Cable ends are opposite gender to the ports they plug into.
  return srcG === "male" ? "F-F" : "M-M";
}
