import type { ConnectorType, PortDirection, SignalType } from "./types";
import type { PortDraft } from "./deviceTemplateBuild";
import { shouldDefaultMultiConnect } from "./connectorTypes";
import { bulkLabel } from "./slotBulk";

export interface BulkPortSpec {
  direction: PortDirection;
  prefix: string;
  start: number;
  count: number;
  signalType: SignalType;
  /** Always explicit: the dialog defaults it to the signal's default connector, but the user can override (#245). */
  connectorType: ConnectorType;
  section?: string;
  /** "Input 1" (true, the default) vs "Input1" (false). */
  spaceBeforeNumber?: boolean;
  /** Passthrough only: the circuit takes its signal from whatever is patched through it,
   *  the way bundled patch panels do (`signalType` is then ignored). */
  inheritsSignal?: boolean;
  /** Passthrough only: rear (field) face connector. Falls back to `connectorType`. */
  rearConnectorType?: ConnectorType;
  /** Passthrough only: front (patch) face connector. Falls back to `connectorType`. */
  frontConnectorType?: ConnectorType;
}

/** Build the port drafts for a bulk add. Pure: `newId` supplies unique draft ids.
 *
 *  Passthrough circuits come out in the per-face shape `patchPanelCircuits()` builds for
 *  the library's patch panels — rear/front connectors, no single `connectorType` — so the
 *  Patch Bay and its reports treat an editor-built panel like a library one (#424). The
 *  signal inherits from the connection when `inheritsSignal` is set (the form's default for
 *  new circuits; `patchPanelCircuits()`' no-signal branch); the library panels themselves
 *  fix theirs, which a picked `signalType` reproduces. */
export function buildBulkPorts(spec: BulkPortSpec, newId: (i: number) => string): PortDraft[] {
  if (spec.direction === "passthrough") {
    const rear = spec.rearConnectorType ?? spec.connectorType;
    const front = spec.frontConnectorType ?? spec.connectorType;
    return Array.from({ length: spec.count }, (_, i) => {
      const p: PortDraft = {
        id: newId(i),
        label: bulkLabel(spec.prefix, spec.start + i, spec.spaceBeforeNumber ?? true),
        signalType: spec.inheritsSignal ? "custom" : spec.signalType,
        direction: "passthrough",
        rearConnectorType: rear,
        frontConnectorType: front,
      };
      if (spec.inheritsSignal) p.inheritsSignal = true;
      if (spec.section) p.section = spec.section;
      return p;
    });
  }
  const multiConnect = shouldDefaultMultiConnect(spec.signalType, spec.connectorType) || undefined;
  const ports: PortDraft[] = [];
  for (let i = 0; i < spec.count; i++) {
    ports.push({
      id: newId(i),
      label: bulkLabel(spec.prefix, spec.start + i, spec.spaceBeforeNumber ?? true),
      signalType: spec.signalType,
      connectorType: spec.connectorType,
      direction: spec.direction,
      section: spec.section || undefined,
      multiConnect,
    });
  }
  return ports;
}
