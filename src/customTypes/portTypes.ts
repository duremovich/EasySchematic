/**
 * The signal and connector ids a device's ports use: what the approval warning
 * (unknown ids) and the review page's "Create this type" shortcut look at.
 */

export interface PortTypeIds {
  signals: string[];
  connectors: string[];
}

const CONNECTOR_FIELDS = ["connectorType", "rearConnectorType", "frontConnectorType"] as const;

/** Distinct signal and connector ids across `ports`, in first-seen order. Tolerates junk. */
export function portTypeIds(ports: unknown): PortTypeIds {
  const signals = new Set<string>();
  const connectors = new Set<string>();
  if (Array.isArray(ports)) {
    for (const p of ports) {
      if (!p || typeof p !== "object") continue;
      const port = p as Record<string, unknown>;
      if (typeof port.signalType === "string" && port.signalType) signals.add(port.signalType);
      for (const f of CONNECTOR_FIELDS) {
        const c = port[f];
        if (typeof c === "string" && c) connectors.add(c);
      }
    }
  }
  return { signals: [...signals], connectors: [...connectors] };
}

/** The port signal / connector ids that `known` doesn't recognise. */
export function unknownPortTypes(
  ports: unknown,
  known: { signal: (id: string) => boolean; connector: (id: string) => boolean },
): PortTypeIds {
  const ids = portTypeIds(ports);
  return {
    signals: ids.signals.filter((id) => !known.signal(id)),
    connectors: ids.connectors.filter((id) => !known.connector(id)),
  };
}

/** One line per unknown id, for the approval response. Empty when all are known. */
export function unknownPortTypeWarnings(unknown: PortTypeIds): string[] {
  return [
    ...unknown.signals.map((id) => `Signal "${id}" is not a built-in or community signal type. It renders grey with its raw id until a moderator creates it on the Types page (/admin/types?kind=signal).`),
    ...unknown.connectors.map((id) => `Connector "${id}" is not a built-in or community connector type. It renders with its raw id and mates with nothing else until a moderator creates it on the Types page (/admin/types?kind=connector).`),
  ];
}
