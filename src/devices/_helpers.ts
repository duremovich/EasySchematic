import type { ConnectorType, Port } from "../types";
import { DEFAULT_CONNECTOR } from "../connectorTypes";

let portIdCounter = 0;
export function port(
  label: string,
  signalType: Port["signalType"],
  direction: Port["direction"],
  connectorType?: ConnectorType,
  addressable?: boolean,
): Port {
  const p: Port = {
    id: `port-${++portIdCounter}`,
    label,
    signalType,
    direction,
    connectorType: connectorType ?? DEFAULT_CONNECTOR[signalType],
  };
  if (addressable !== undefined) p.addressable = addressable;
  return p;
}

/** Create a multicable trunk port */
export function trunkPort(
  label: string,
  signalType: Port["signalType"],
  direction: Port["direction"],
  channelCount: number,
  connectorType?: ConnectorType,
): Port {
  return {
    ...port(label, signalType, direction, connectorType),
    isMulticable: true,
    channelCount,
  };
}

/** Generate a sequence of numbered ports (for routers, matrices, etc.) */
export function ports(
  prefix: string,
  signalType: Port["signalType"],
  direction: Port["direction"],
  count: number,
  connectorType?: ConnectorType,
): Port[] {
  return Array.from({ length: count }, (_, i) =>
    port(`${prefix} ${i + 1}`, signalType, direction, connectorType),
  );
}
