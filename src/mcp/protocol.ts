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

/** The bridge tools: the eight Ship-1 "working core" tools, the two Ship-2
 *  "editing & layout" tools (move_device, delete_connection), the two Ship-3
 *  "batch" tools (add_devices, connect_devices_batch), and the two Ship-4
 *  "rooms" tools (create_room, place_device_in_room). */
export type CommandType =
  | "get_schematic"
  | "list_devices"
  | "get_device"
  | "search_templates"
  | "add_device"
  | "set_device_property"
  | "connect_devices"
  | "delete_device"
  | "move_device"
  | "delete_connection"
  | "add_devices"
  | "connect_devices_batch"
  | "create_room"
  | "place_device_in_room";

/** Max items accepted by a single batch tool call (input arrives over the bridge,
 *  so it is capped). The mcp-server tool schemas mirror this as `maxItems`. */
export const MAX_BATCH_ITEMS = 100;

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

export interface MoveDeviceParams {
  nodeId: string;
  /** New position in the SAME coordinate space get_device/get_schematic report for
   *  this device: canvas coordinates for a top-level device, or coordinates relative
   *  to its room/rack when the device has a parentId. Does not change containment. */
  x: number;
  y: number;
}

export interface DeleteConnectionParams {
  /** The connection (edge) id from get_schematic / connect_devices. */
  connectionId: string;
}

export interface AddDevicesParams {
  /** Devices to add in one call; each is added independently (best-effort). */
  devices: AddDeviceParams[];
}

export interface ConnectDevicesBatchParams {
  /** Connections to make in one call; each is attempted independently in array
   *  order (best-effort), so an earlier connection can affect a later one. */
  connections: ConnectDevicesParams[];
}

export interface CreateRoomParams {
  /** The room's name, shown on the canvas. */
  label: string;
  /** Room top-left position in canvas coordinates. */
  x: number;
  y: number;
  /** Optional room size; both are required together when given. Defaults to
   *  400x300. Minimums mirror the editor: width >= 200, height >= 150. */
  width?: number;
  height?: number;
}

export interface PlaceDeviceInRoomParams {
  /** The device to place inside the room. */
  deviceId: string;
  /** The target room (container) id from get_schematic / create_room. */
  roomId: string;
  /** Position relative to the room's top-left corner; defaults to (16,16). The
   *  device's center must land inside the room or the call fails (nothing changes). */
  x?: number;
  y?: number;
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
