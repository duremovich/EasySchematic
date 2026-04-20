import type { ConnectorType, Gender, Port } from "../types";
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

/** Generate the 5 ports for a 3-phase cam-lok set (L1/L2/L3/N/G) */
export function camLokSet(
  direction: "input" | "output",
  prefix: string,
  section?: string,
): Port[] {
  const ps = [
    port(`${prefix} L1`, "power-l1", direction, "cam-lok"),
    port(`${prefix} L2`, "power-l2", direction, "cam-lok"),
    port(`${prefix} L3`, "power-l3", direction, "cam-lok"),
    port(`${prefix} N`, "power-neutral", direction, "cam-lok"),
    port(`${prefix} G`, "power-ground", direction, "cam-lok"),
  ];
  if (section) ps.forEach(p => (p.section = section));
  return ps;
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

/**
 * Generate the rear+front port pairs for a patch panel. Rear ports use direction "input",
 * front ports use direction "output" — DeviceNode and DeviceEditor relabel these as
 * "Rear" and "Front" for any device with deviceType "patch-panel".
 *
 * `gender` lets a template force both faces to the same gender (common for XLR / TT bantam
 * patch bays where both sides are female sockets) when the connector convention would
 * otherwise produce M/F.
 */
export function patchPanelPorts(
  prefix: string,
  signalType: Port["signalType"],
  count: number,
  opts?: { connectorType?: ConnectorType; gender?: Gender },
): Port[] {
  const rear = ports(prefix, signalType, "input", count, opts?.connectorType);
  const front = ports(prefix, signalType, "output", count, opts?.connectorType);
  if (opts?.gender) {
    for (const p of rear) p.gender = opts.gender;
    for (const p of front) p.gender = opts.gender;
  }
  return [...rear, ...front];
}
