/**
 * Shared wire protocol for the EasySchematic MCP bridge (Beta).
 *
 * This is the single source of truth for the messages exchanged between:
 *   - the standalone MCP server (`mcp-server/`, a Node process Claude attaches to), and
 *   - the in-app bridge (`src/mcpBridge.ts`, a WebSocket client inside the running editor).
 *
 * It MUST stay dependency-free (no imports from the rest of `src/`) so the server's
 * own TypeScript build can include this exact file without pulling in the app. Keep it
 * to plain types + constants.
 */

/** Default localhost port the MCP server listens on and the app dials. Both sides
 *  share this constant; either may override it (server via env, app via the setting). */
export const DEFAULT_BRIDGE_PORT = 8765;

/** Bumped when the message shapes change incompatibly, so a mismatched server/app pair
 *  refuses to pair instead of misbehaving. */
export const PROTOCOL_VERSION = 1;

/** The eight tools exposed in Ship 1 ("working core"). */
export type CommandType =
  | "get_schematic"
  | "list_devices"
  | "get_device"
  | "search_templates"
  | "add_device"
  | "set_device_property"
  | "connect_devices"
  | "delete_device";

/** Which two-sided face of a port to wire. Required only for bidirectional ports
 *  (`in`/`out`) and passthrough ports (`rear`/`front`); ignored for plain ports. */
export type PortFace = "in" | "out" | "rear" | "front";

// ---------------------------------------------------------------------------
// App -> server: handshake. The app proves it is the real editor (token) and the
// server validates token + Origin before accepting any commands.
// ---------------------------------------------------------------------------
export interface HelloMessage {
  type: "hello";
  /** Pairing token the user copied from the server into the app's Preferences. */
  token: string;
  protocolVersion: number;
  /** Stable id for this browser tab, so the server can report which tab is bound. */
  clientId: string;
  /** Human-friendly name of the open schematic, surfaced to Claude. */
  schematicName?: string;
}

/** Server -> app: result of the handshake. */
export interface HelloAck {
  type: "hello_ack";
  ok: boolean;
  /** When ok=false, why pairing was refused (bad token, version mismatch, etc.). */
  reason?: string;
}

/** Server -> app: a tool invocation to run against the store. */
export interface CommandMessage {
  type: "command";
  requestId: string;
  command: CommandType;
  params: Record<string, unknown>;
}

/** App -> server: the correlated result of a CommandMessage. */
export interface ResponseMessage {
  type: "response";
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Server -> app: sent when this tab is being unbound because another tab claimed
 *  the connection, so the app can show an honest "disconnected" status. */
export interface SupersededMessage {
  type: "superseded";
  reason: string;
}

/** Messages the app may send to the server. */
export type BridgeClientMessage = HelloMessage | ResponseMessage;
/** Messages the server may send to the app. */
export type BridgeServerMessage = HelloAck | CommandMessage | SupersededMessage;

// ---------------------------------------------------------------------------
// Tool parameter shapes (documented contract; validated on both ends).
// ---------------------------------------------------------------------------
export interface AddDeviceParams {
  /** Template identity to instantiate — get one from `search_templates`. */
  templateId: string;
  /** Optional custom label; defaults to the template's name. */
  label?: string;
  /** Canvas position; defaults to a free spot near origin when omitted. */
  x?: number;
  y?: number;
}

export interface SetDevicePropertyParams {
  nodeId: string;
  /** Only keys in SAFE_DEVICE_FIELDS are applied; anything else is rejected. */
  properties: Record<string, string | number | boolean>;
}

export interface ConnectDevicesParams {
  sourceNodeId: string;
  sourcePortId: string;
  sourceFace?: PortFace;
  targetNodeId: string;
  targetPortId: string;
  targetFace?: PortFace;
}

export interface GetDeviceParams {
  nodeId: string;
}

export interface SearchTemplatesParams {
  query: string;
  limit?: number;
}

export interface DeleteDeviceParams {
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Device-property whitelist. Each safe field maps to the store action that
// applies it correctly. Fields with port/edge/structural invariants are
// deliberately ABSENT and rejected (deferred to Ship 2), so the bridge can
// never corrupt a drawing through a blind merge.
// ---------------------------------------------------------------------------
export type SafeFieldKind = "label" | "shortName" | "patch";

export const SAFE_DEVICE_FIELDS: Record<string, SafeFieldKind> = {
  label: "label",
  shortName: "shortName",
  hostname: "patch",
  color: "patch",
  headerColor: "patch",
  manufacturer: "patch",
  modelNumber: "patch",
  referenceUrl: "patch",
  category: "patch",
  note: "patch",
  serialNumber: "patch",
  voltage: "patch",
  powerDrawW: "patch",
  powerCapacityW: "patch",
  thermalBtuh: "patch",
  poeBudgetW: "patch",
  poeDrawW: "patch",
  unitCost: "patch",
  heightMm: "patch",
  widthMm: "patch",
  depthMm: "patch",
  weightKg: "patch",
  isSpare: "patch",
  isVenueProvided: "patch",
  useShortName: "patch",
  wrapLabel: "patch",
};
