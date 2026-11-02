import type { BuiltinConnectorType, BuiltinSignalType, ConnectorType, ConnectionEdge, DeviceTemplate, Gender, Port, SignalType } from "./types";
import { connectorAccepts, connectorGender } from "./typeRegistry";

/** Bare-wire connectors that are still a REAL termination — a screw-terminal block the
 *  stripped conductors land in. One cable can carry a moulded plug on one end and a
 *  screw-terminal tail on the other (DSP euroblock out → amplifier XLR in), so these may
 *  headline a combined pack-list label. */
export const TERMINABLE_BARE_WIRE_CONNECTORS: Set<ConnectorType> = new Set<BuiltinConnectorType>([
  "phoenix", "terminal-block",
]);

/** Bare-wire terminations with NO connector at all — the cable is cut from a spool and
 *  soldered or punched down in the field. Whatever the far end is, the part packed is
 *  bulk cable, so these must never appear in a combined label. */
export const FIELD_TERMINATED_CONNECTORS: Set<ConnectorType> = new Set<BuiltinConnectorType>([
  "solder-cup", "punch-down-110", "punch-down-66", "krone-idc",
]);

/** Bare-wire connectors (no physical connector — cable goes straight in) are compatible with anything */
export const BARE_WIRE_CONNECTORS: Set<ConnectorType> = new Set([
  ...TERMINABLE_BARE_WIRE_CONNECTORS,
  ...FIELD_TERMINATED_CONNECTORS,
]);

/** Real connectors that plausibly share one cable with a screw-terminal end. Bare wire is
 *  *compatible* with everything (the block doesn't care what the far end carries), but a
 *  combined label is only minted for pairings that exist as a physical part — the
 *  analog/speaker audio runs like XLR↔Phoenix. hdmi↔phoenix passes the compatibility
 *  check yet no such cable exists, so pairings outside this set keep the far end's own
 *  cable label instead of inventing a hybrid. */
export const BARE_WIRE_HYBRID_PARTNERS: Set<ConnectorType> = new Set<BuiltinConnectorType>([
  "xlr-3", "mini-xlr", "combo-xlr-trs", "trs-quarter", "ts-quarter", "trs-eighth", "rca", "speakon",
]);

/** Signal pairs that physically share a connector and are interchangeable when both ports use it.
 *  Thunderbolt ports are USB-C and carry USB; a plain USB-C cable works between them. */
export const SIGNAL_COMPAT_VIA_CONNECTOR: ReadonlyArray<readonly [BuiltinSignalType, BuiltinSignalType, BuiltinConnectorType]> = [
  ["thunderbolt", "usb", "usb-c"],
];

export function areSignalsCompatibleViaConnector(
  aSignal: SignalType,
  aConn: ConnectorType | undefined,
  bSignal: SignalType,
  bConn: ConnectorType | undefined,
): boolean {
  if (!aConn || !bConn || aConn !== bConn) return false;
  return SIGNAL_COMPAT_VIA_CONNECTOR.some(
    ([s1, s2, c]) =>
      aConn === c &&
      ((s1 === aSignal && s2 === bSignal) || (s1 === bSignal && s2 === aSignal)),
  );
}

/** Signal pairs that interconnect natively regardless of connector — no adapter needed.
 *  An Allen & Heath SLink port auto-senses dSNAKE, DX and gigaACE, so an SLink jack mates
 *  directly with any of those stageboxes/consoles. These all ride ethercon/rj45, which
 *  areConnectorsCompatible already treats as interchangeable. */
export const SIGNAL_COMPAT_PAIRS: ReadonlyArray<readonly [BuiltinSignalType, BuiltinSignalType]> = [
  ["slink", "dsnake"],
  ["slink", "dx5"],
  ["slink", "gigaace"],
];

export function areSignalPairsCompatible(a: SignalType, b: SignalType): boolean {
  return SIGNAL_COMPAT_PAIRS.some(
    ([s1, s2]) => (s1 === a && s2 === b) || (s1 === b && s2 === a),
  );
}

/** Check if two connector types are compatible (same type or one accepts the other) */
export function areConnectorsCompatible(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b) return true; // missing connector info = no mismatch
  // Identical connectors always mate. This is why USB-A to USB-A and USB-B to
  // USB-B connect without a warning — a deliberate call on #219, not an
  // oversight. Making a connector invalid against itself would need gender
  // modelled too (an A-male to A-female extension is legitimate), and a false
  // warning on a valid run is worse than a missing one on a questionable run.
  if (a === b) return true;
  if (BARE_WIRE_CONNECTORS.has(a) || BARE_WIRE_CONNECTORS.has(b)) return true;
  const aAccepts = connectorAccepts(a);
  if (aAccepts.native?.includes(b) || aAccepts.adapter?.includes(b)) return true;
  const bAccepts = connectorAccepts(b);
  if (bAccepts.native?.includes(a) || bAccepts.adapter?.includes(a)) return true;
  return false;
}

/** Check if two DIFFERENT connector types mate directly, with nothing in between. */
export function matesNatively(a: ConnectorType, b: ConnectorType): boolean {
  return (
    connectorAccepts(a).native?.includes(b) === true ||
    connectorAccepts(b).native?.includes(a) === true
  );
}

/** Check if a connection between two connector types requires an adapter cable */
export function needsAdapter(a: ConnectorType | undefined, b: ConnectorType | undefined): boolean {
  if (!a || !b || a === b) return false;
  if (BARE_WIRE_CONNECTORS.has(a) || BARE_WIRE_CONNECTORS.has(b)) return false;
  if (connectorAccepts(a).adapter?.includes(b)) return true;
  if (connectorAccepts(b).adapter?.includes(a)) return true;
  return false;
}

/**
 * Connector families whose members mate natively but terminate a cable DIFFERENTLY.
 *
 * A run between two members is one physical cable carrying a different end on each
 * side — a hybrid patch cord — so the pack list has to name both ends or the wrong
 * part gets packed. LC/SC/ST/opticalCON are the only such family: they were made
 * mutually compatible above *precisely because* no adapter is inserted, which is what
 * leaves a single cable spanning two terminations. Every other mismatch is resolved
 * either by an inserted adapter (which splits the run into two correctly-labelled
 * cables) or by one connector being a superset jack that an ordinary single-type
 * cable already fits — combo XLR/TRS, EtherCon accepting RJ45, binding-post/banana,
 * USB-A to USB-B/mini/micro, 1/4" TRS to TS. Those must NOT get a combined label:
 * the hybrid part it would name does not exist.
 *
 * The value is the cable-family word that every member's CONNECTOR_TO_CABLE entry
 * ends with, so "LC Fiber" + "SC Fiber" reads back out as "LC to SC Fiber".
 */
export const HYBRID_CABLE_FAMILY: Partial<Record<BuiltinConnectorType, string>> = {
  lc: "Fiber",
  sc: "Fiber",
  st: "Fiber",
  opticalcon: "Fiber",
};

/** The two adapter ports that carry a bridge, and which way round the adapter sits. */
export interface AdapterBridgePorts {
  /** Adapter port the source device's signal arrives at */
  sourceSidePort: Port;
  /** Adapter port that carries on to the target device */
  targetSidePort: Port;
  /** True when the adapter is being used against its declared port directions */
  reversed: boolean;
}

const canReceive = (p: Port): boolean =>
  p.direction === "input" || p.direction === "bidirectional";
const canSend = (p: Port): boolean =>
  p.direction === "output" || p.direction === "bidirectional";

/**
 * Resolve the pair of adapter ports that bridges `sourceSignalType` → `targetSignalType`,
 * or null when the template can't bridge them.
 *
 * The template's declared orientation is tried first, then the reverse. A USB→Ethernet
 * dongle is the same physical part whichever end you plug in first, so dragging
 * Ethernet→USB reuses that one template rather than the library carrying a mirrored
 * copy of every adapter. Forward wins on a tie, so existing behaviour is unchanged
 * wherever a template already matched.
 */
export function resolveSignalBridgePorts(
  template: Pick<DeviceTemplate, "ports">,
  sourceSignalType: SignalType,
  targetSignalType: SignalType,
): AdapterBridgePorts | null {
  const forwardIn = template.ports.find((p) => canReceive(p) && p.signalType === sourceSignalType);
  const forwardOut = template.ports.find((p) => canSend(p) && p.signalType === targetSignalType);
  if (forwardIn && forwardOut) {
    return { sourceSidePort: forwardIn, targetSidePort: forwardOut, reversed: false };
  }

  const reverseIn = template.ports.find((p) => canSend(p) && p.signalType === sourceSignalType);
  const reverseOut = template.ports.find((p) => canReceive(p) && p.signalType === targetSignalType);
  if (reverseIn && reverseOut) {
    return { sourceSidePort: reverseIn, targetSidePort: reverseOut, reversed: true };
  }

  return null;
}

/**
 * Resolve the pair of adapter ports that bridges `sourceConnector` → `targetConnector`
 * within one signal type, or null when the template can't bridge them.
 *
 * Same declared-then-reversed rule as `resolveSignalBridgePorts`: a USB-C→USB-A dongle
 * is the same part whichever end you plug in first. The two ports are always distinct
 * because callers only bridge connectors that differ.
 */
export function resolveConnectorBridgePorts(
  template: Pick<DeviceTemplate, "ports">,
  sourceConnector: ConnectorType,
  targetConnector: ConnectorType,
  signalType: SignalType,
): AdapterBridgePorts | null {
  const matches = (p: Port, connector: ConnectorType) =>
    p.signalType === signalType && p.connectorType === connector;

  const forwardIn = template.ports.find((p) => canReceive(p) && matches(p, sourceConnector));
  const forwardOut = template.ports.find((p) => canSend(p) && matches(p, targetConnector));
  if (forwardIn && forwardOut) {
    return { sourceSidePort: forwardIn, targetSidePort: forwardOut, reversed: false };
  }

  const reverseIn = template.ports.find((p) => canSend(p) && matches(p, sourceConnector));
  const reverseOut = template.ports.find((p) => canReceive(p) && matches(p, targetConnector));
  if (reverseIn && reverseOut) {
    return { sourceSidePort: reverseIn, targetSidePort: reverseOut, reversed: true };
  }

  return null;
}

/** The two device ports a bridge would span — all `canWireAdapterBridge` needs of them. */
export interface BridgeEndpoints {
  sourcePort: Pick<Port, "direction" | "signalType">;
  targetPort: Pick<Port, "direction" | "signalType">;
}

/**
 * Whether a resolved bridge can actually be inserted between two device ports.
 *
 * Matching only proves the adapter carries both signals/connectors; whether the two
 * legs can be *wired* also depends on the device ports' directions, and on a canvas
 * constraint: React Flow resolves an edge's sourceHandle only against source-type
 * handles (even in ConnectionMode.Loose — only targetHandle falls back), and
 * DeviceNode renders a strict `input` port as a target-only handle. So any leg whose
 * drawn source end is a strict input exists in the model but never appears (#310).
 */
export function canWireAdapterBridge(
  bridge: AdapterBridgePorts,
  sourcePort: BridgeEndpoints["sourcePort"],
  targetPort: BridgeEndpoints["targetPort"],
): boolean {
  // The source leg is always drawn source device → adapter, so the device port must
  // render a source-type handle. Drag and click-connect normalization both put a lone
  // strict input at the target end, so this only rejects input-to-input pairs — where
  // neither device could originate the signal anyway.
  if (sourcePort.direction === "input") return false;
  if (bridge.reversed) {
    // Reversed match: the same physical part used in its other orientation.
    // insertAdapterBetween flips the instance's port directions to match, so the
    // outgoing leg always draws adapter → device from a source-type handle. Any
    // target direction accepts it — a strict input receives the adapter's signal, a
    // strict output hosts the adapter's male end (#310 defects 1 and 2).
    return true;
  }
  // Forward match: the adapter's declared output feeds the target. Drawing is safe
  // either way (a strict-output target still resolves as a Loose-mode edge target);
  // this is a signal-flow rule, not a canvas one: don't offer to feed a strict
  // output — unless both signals are network traffic, which is direction-agnostic.
  const net = NETWORK_SIGNAL_TYPES.has(sourcePort.signalType) && NETWORK_SIGNAL_TYPES.has(targetPort.signalType);
  return net || targetPort.direction !== "output";
}

/**
 * Rank bridge matches for the pickers and for the exactly-one-match auto-insert rule.
 *
 * Reverse matches are a **fallback, not an addition**: they are only offered when no
 * template matches in its declared direction. The library deliberately ships mirrored
 * connector adapters — both `XLR-3 (M) → TRS 1/4" (F)` and `TRS 1/4" (M) → XLR-3 (F)`
 * exist — so admitting reverse matches alongside forward ones would put two templates
 * where one used to be and silently downgrade 28 connector pairings (all of power, most
 * of analog-audio, HDMI↔DVI) from auto-insert to the picker dialog. Tiering keeps every
 * pairing that auto-inserted before doing exactly what it did before.
 *
 * The cost is that a reverse match is never shown next to a forward one, so a mirrored
 * template stays out of the picker for the direction its twin already covers. That twin
 * is the correctly-oriented part for that drag, so it is the one worth offering.
 */
function rankBridgeMatches(
  matches: ReadonlyArray<{ template: DeviceTemplate; reversed: boolean }>,
): DeviceTemplate[] {
  const forward = matches.filter((m) => !m.reversed);
  const chosen = (forward.length > 0 ? forward : matches).map((m) => m.template);

  // Sort: fewest total ports first (tightest match), then alphabetically
  chosen.sort((a, b) => {
    const aPorts = a.ports.filter((p) => p.signalType !== "power").length;
    const bPorts = b.ports.filter((p) => p.signalType !== "power").length;
    if (aPorts !== bPorts) return aPorts - bPorts;
    return a.label.localeCompare(b.label);
  });

  return chosen;
}

/** Find adapter/converter templates that bridge two different signal types, in either
 *  drag direction. Pass `endpoints` to drop matches `canWireAdapterBridge` rules out
 *  for those device ports — every caller acting on a concrete pair should, so the drag
 *  preview, the picker dialog, and the auto-insert can never disagree (#310). */
export function findAdaptersForSignalBridge(
  sourceSignalType: SignalType,
  targetSignalType: SignalType,
  templates: DeviceTemplate[],
  endpoints?: BridgeEndpoints,
): DeviceTemplate[] {
  const matches = [];
  for (const t of templates) {
    if (t.deviceType !== "adapter") continue;
    const bridge = resolveSignalBridgePorts(t, sourceSignalType, targetSignalType);
    if (!bridge) continue;
    if (endpoints && !canWireAdapterBridge(bridge, endpoints.sourcePort, endpoints.targetPort)) continue;
    matches.push({ template: t, reversed: bridge.reversed });
  }
  return rankBridgeMatches(matches);
}

/** Find adapter templates that bridge two different connector types within the same
 *  signal type, in either drag direction. `endpoints` filters as in
 *  `findAdaptersForSignalBridge`. */
export function findAdaptersForConnectorBridge(
  sourceConnector: ConnectorType,
  targetConnector: ConnectorType,
  signalType: SignalType,
  templates: DeviceTemplate[],
  endpoints?: BridgeEndpoints,
): DeviceTemplate[] {
  const matches = [];
  for (const t of templates) {
    if (t.deviceType !== "adapter") continue;
    const bridge = resolveConnectorBridgePorts(t, sourceConnector, targetConnector, signalType);
    if (!bridge) continue;
    if (endpoints && !canWireAdapterBridge(bridge, endpoints.sourcePort, endpoints.targetPort)) continue;
    matches.push({ template: t, reversed: bridge.reversed });
  }
  return rankBridgeMatches(matches);
}

/**
 * Connectors where gender genuinely varies in real gear (and thus where the editor should expose
 * a manual override). Connectors not listed here use whatever `connectorGender` says without prompting.
 */
export const CONNECTORS_WITH_GENDER_VARIATION: Set<ConnectorType> = new Set<BuiltinConnectorType>([
  "xlr-3", "xlr-4", "xlr-5", "mini-xlr",
  "powercon", "powercon-true1",
  "iec", "iec-c5", "iec-c7", "iec-c15", "iec-c20",
  "edison", "schuko", "french-power", "europlug", "uk-power", "l5-20", "l6-20", "l6-30", "l21-30",
  "cam-lok", "socapex", "multipin",
  "speakon", "banana", "binding-post", "binding-post-banana",
  "bnc", "hd-bnc",
  "trs-quarter", "ts-quarter", "trs-eighth", "trs-2.5mm",
]);

/** Resolve a port's gender: explicit override → convention from connector + direction → undefined. */
export function resolvePortGender(port: Port | undefined): Gender | undefined {
  if (!port) return undefined;
  if (port.gender) return port.gender;
  if (!port.connectorType) return undefined;
  const entry = connectorGender(port.connectorType);
  if (!entry) return undefined;
  if (typeof entry === "string") return entry;
  // Bidirectional ports fall back to the input convention.
  return port.direction === "output" ? entry.output : entry.input;
}

/**
 * Returns the effective signal type for a port.
 *
 * For ports with `inheritsSignal: true`, the signal type is derived from connected edges
 * rather than the stored `signalType` placeholder ("custom"). The `side` parameter controls
 * which face of a passthrough port to look at:
 *   - "rear"      → only edges whose handle ends in "-rear"
 *   - "front"     → only edges whose handle ends in "-front"
 *   - undefined   → rear first, then front, then any match (deterministic preference)
 *
 * For all other ports, `port.signalType` is returned directly.
 */
export function effectiveSignalType(
  port: Port,
  nodeId: string,
  edges: ConnectionEdge[],
  side?: "rear" | "front",
): SignalType {
  if (!port.inheritsSignal) return port.signalType;

  const portHandle = port.id;

  const matchesHandle = (handle: string | null | undefined, suffix: string): boolean =>
    handle === `${portHandle}-${suffix}`;

  const edgeForSuffix = (suffix: string): ConnectionEdge | undefined =>
    edges.find(
      (e) =>
        (e.source === nodeId && matchesHandle(e.sourceHandle, suffix)) ||
        (e.target === nodeId && matchesHandle(e.targetHandle, suffix)),
    );

  if (side !== undefined) {
    return edgeForSuffix(side)?.data?.signalType ?? port.signalType;
  }

  // Deterministic preference: rear → front → any handle match → stored placeholder
  return (
    edgeForSuffix("rear")?.data?.signalType ??
    edgeForSuffix("front")?.data?.signalType ??
    edges.find(
      (e) =>
        (e.source === nodeId && (e.sourceHandle === portHandle || e.sourceHandle?.startsWith(`${portHandle}-`))) ||
        (e.target === nodeId && (e.targetHandle === portHandle || e.targetHandle?.startsWith(`${portHandle}-`))),
    )?.data?.signalType ??
    port.signalType
  );
}

/**
 * USB-C Power Delivery shortfall (in watts) for a connection between two ports,
 * or null when it doesn't apply (missing data) or the source covers the sink.
 *
 * Either end may be the source — USB-C PD's power role is independent of data
 * direction — so both orientations are checked and the worst deficit wins.
 */
export function usbcPowerShortfallW(
  a: Pick<Port, "usbcPowerSourceW" | "usbcPowerDrawW"> | undefined,
  b: Pick<Port, "usbcPowerSourceW" | "usbcPowerDrawW"> | undefined,
): number | null {
  if (!a || !b) return null;
  const deficits: number[] = [];
  if (a.usbcPowerSourceW != null && b.usbcPowerDrawW != null) {
    deficits.push(b.usbcPowerDrawW - a.usbcPowerSourceW);
  }
  if (b.usbcPowerSourceW != null && a.usbcPowerDrawW != null) {
    deficits.push(a.usbcPowerDrawW - b.usbcPowerSourceW);
  }
  if (deficits.length === 0) return null;
  const worst = Math.max(...deficits);
  return worst > 0 ? worst : null;
}

/** Signal types that can have network configuration */
export const NETWORK_SIGNAL_TYPES: Set<SignalType> = new Set<BuiltinSignalType>([
  "ethernet", "ndi", "dante", "avb", "srt", "hdbaset", "aes67", "st2110",
]);

/** Signal types that can have video capabilities */
export const VIDEO_SIGNAL_TYPES: Set<SignalType> = new Set<BuiltinSignalType>([
  "sdi", "hdmi", "ndi", "displayport", "hdbaset", "fiber", "thunderbolt", "composite", "vga", "dvi", "srt", "st2110",
]);

/** Signal types whose new ports default to multi-connect — logical/streaming signals where fan-in is the norm. */
export const MULTI_CONNECT_DEFAULT_SIGNALS: Set<SignalType> = new Set<BuiltinSignalType>([
  "srt", "custom",
]);

/** Connector types whose new ports default to multi-connect — wireless/RF carriers where many TX → one RX. */
export const MULTI_CONNECT_DEFAULT_CONNECTORS: Set<ConnectorType> = new Set<BuiltinConnectorType>([
  "wireless",
]);

export function shouldDefaultMultiConnect(
  signalType: SignalType,
  connectorType?: ConnectorType,
): boolean {
  return (
    MULTI_CONNECT_DEFAULT_SIGNALS.has(signalType) ||
    (connectorType != null && MULTI_CONNECT_DEFAULT_CONNECTORS.has(connectorType))
  );
}
