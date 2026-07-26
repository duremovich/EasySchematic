import type { Port } from "./types";

/**
 * Whether a port has at least one active connection, given the set of handle ids
 * that edges attach to on this device. Handles are collected from every edge whose
 * source/target is this node (including stub-leg edges, which retain the original
 * device port handle — so stubbed connections count as connected).
 *
 * A port contributes different handle ids by direction:
 *   - bidirectional: `${id}-in`, `${id}-out`
 *   - passthrough:   `${id}-rear`, `${id}-front` (expansion-slot/card ports included)
 *   - input/output:  `${id}`
 *
 * Shared by DeviceNode's "show only connected ports" filter and the port-count row so
 * both agree on what "connected" means.
 */
export function isPortConnected(port: Port, connectedHandles: Set<string>): boolean {
  if (port.direction === "bidirectional") {
    return connectedHandles.has(`${port.id}-in`) || connectedHandles.has(`${port.id}-out`);
  }
  if (port.direction === "passthrough") {
    return connectedHandles.has(`${port.id}-rear`) || connectedHandles.has(`${port.id}-front`);
  }
  return connectedHandles.has(port.id);
}
