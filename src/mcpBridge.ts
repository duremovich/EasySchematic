/**
 * In-app side of the EasySchematic MCP bridge (Beta).
 *
 * A small WebSocket *client* that connects to the standalone MCP server
 * (`mcp-server/`) running on localhost. It receives tool commands from Claude
 * and executes each by calling the EXISTING store actions — so undo, autosave,
 * validation and auto-routing all keep working unchanged. It never opens a
 * listening socket and only connects when the user turns on the Beta setting and
 * supplies the pairing token.
 *
 * Security: the connection is gated by a pairing token (sent in the handshake)
 * and the server additionally checks the request Origin. Both must pass before
 * any command runs.
 */
import { useEffect } from "react";
import type { Connection } from "@xyflow/react";
import { useSchematicStore } from "./store";
import { getPortAbsolutePositions } from "./snapUtils";
import { getBundledTemplates, getTemplateById, getCardsByFamily, fetchTemplates } from "./templateApi";
import {
  DEFAULT_BRIDGE_PORT,
  PROTOCOL_VERSION,
  MAX_BATCH_ITEMS,
  type CommandType,
  type BridgeServerMessage,
  type AddDeviceParams,
  type AddDevicesParams,
  type SetDevicePropertyParams,
  type ConnectDevicesParams,
  type ConnectDevicesBatchParams,
  type GetDeviceParams,
  type SearchTemplatesParams,
  type DeleteDeviceParams,
  type MoveDeviceParams,
  type DeleteConnectionParams,
  type CreateRoomParams,
  type PlaceDeviceInRoomParams,
  type AddNoteParams,
  type ListSlotCardsParams,
  type InstallCardParams,
  type RemoveCardParams,
  type PortFace,
} from "./mcp/protocol";
import {
  classifyDeviceProperties,
  resolveHandleFromCandidates,
  validatePosition,
  validateRoomSize,
  planConnectionRemoval,
  runBatch,
  noteTextToHtml,
  validateCardForSlot,
} from "./mcp/validation";
import type { DeviceData, DeviceTemplate, InstalledSlot, Port, SchematicNode } from "./types";

export type BridgeStatus = "off" | "connecting" | "connected" | "error";

/** Raised inside a command handler to return ok:false with a readable message. */
class CommandError extends Error {}

function st() {
  return useSchematicStore.getState();
}

function setStatus(status: BridgeStatus, detail?: string) {
  useSchematicStore.setState({ mcpBridgeStatus: status, mcpBridgeStatusDetail: detail });
}

function deviceNodes(): SchematicNode[] {
  return st().nodes.filter((n) => n.type === "device");
}

function requireDevice(nodeId: string): SchematicNode {
  const node = st().nodes.find((n) => n.id === nodeId);
  if (!node) throw new CommandError(`No device found with id "${nodeId}".`);
  if (node.type !== "device") throw new CommandError(`Node "${nodeId}" is not a device.`);
  return node;
}

function portSummary(p: Port) {
  return { id: p.id, label: p.label, direction: p.direction, signalType: p.signalType };
}

/** Compact view of a device's modular slot, for get_device. `filled` is the quick
 *  flag; cardTemplateId/cardLabel describe the installed card (absent when empty). */
function slotSummary(s: InstalledSlot) {
  return {
    slotId: s.slotId,
    label: s.label,
    slotFamily: s.slotFamily,
    parentSlotId: s.parentSlotId,
    filled: Boolean(s.cardTemplateId),
    cardTemplateId: s.cardTemplateId,
    cardLabel: s.cardLabel,
  };
}

/** Find an installed slot on a device, or throw a readable CommandError. Used by the
 *  slot tools so they fully pre-validate before touching the structural swapCard
 *  action (which pushes an undo entry before its own guards). */
function requireSlot(device: SchematicNode, slotId: string): InstalledSlot {
  const slot = ((device.data as DeviceData).slots ?? []).find((s) => s.slotId === slotId);
  if (!slot) {
    throw new CommandError(`No slot found with id "${slotId}" on device "${device.id}".`);
  }
  return slot;
}

/** The full discoverable set: the live community library (which already has the
 *  bundled fallback merged as a floor) plus this schematic's custom templates,
 *  de-duped by key. fetchTemplates() is internally cached, so repeated calls are
 *  cheap; on a network failure it falls back to the bundled subset. */
async function allTemplates(): Promise<DeviceTemplate[]> {
  let library: DeviceTemplate[];
  try {
    library = await fetchTemplates();
  } catch {
    library = getBundledTemplates();
  }
  const merged = new Map<string, DeviceTemplate>();
  for (const t of [...library, ...st().customTemplates]) {
    merged.set(t.id ?? t.deviceType, t);
  }
  return [...merged.values()];
}

function resolveTemplate(templateId: string, list: DeviceTemplate[]): DeviceTemplate | undefined {
  return (
    getTemplateById(templateId, st().customTemplates) ??
    list.find((t) => (t.id ?? t.deviceType) === templateId) ??
    list.find((t) => t.deviceType === templateId)
  );
}

/** Resolve a (portId, face) to the React Flow handle id the UI would use, by
 *  asking the same geometry helper that lays out the node's handles. */
function resolveHandle(node: SchematicNode, portId: string, face: PortFace | undefined): string {
  const nodeMap = new Map(st().nodes.map((n) => [n.id, n] as const));
  const candidates = getPortAbsolutePositions(node, nodeMap)
    .filter((h) => h.portId === portId)
    .map((h) => h.handleId);
  const res = resolveHandleFromCandidates(candidates, portId, face);
  if (!res.ok) throw new CommandError(res.error);
  return res.handleId;
}

// ---------------------------------------------------------------------------
// Shared cores — one device / one connection. Used by both the singular tools and
// the batch tools (add_devices / connect_devices_batch), so the two stay identical.
// Each throws CommandError on failure.
// ---------------------------------------------------------------------------
function addDeviceCore(spec: AddDeviceParams, templates: DeviceTemplate[]) {
  const { templateId, label, x, y } = spec;
  if (!templateId) throw new CommandError("templateId is required.");
  const tpl = resolveTemplate(templateId, templates);
  if (!tpl) throw new CommandError(`No template found for "${templateId}". Use search_templates first.`);
  const position = { x: x ?? 0, y: y ?? 0 };
  const before = new Set(st().nodes.map((n) => n.id));
  st().addDevice(tpl, position);
  const added = st().nodes.find((n) => !before.has(n.id));
  if (!added) throw new CommandError("Device was not added (no new node appeared).");
  const renamed = Boolean(label && label !== tpl.label);
  if (renamed) st().updateDeviceLabel(added.id, label!);
  // Report the final label — `added` was captured before the rename, so read the
  // applied custom label rather than the stale template label.
  return { nodeId: added.id, label: renamed ? label! : (added.data as DeviceData).label, position };
}

function connectDevicesCore(p: ConnectDevicesParams) {
  const sourceNode = requireDevice(p.sourceNodeId);
  const targetNode = requireDevice(p.targetNodeId);
  const sourceHandle = resolveHandle(sourceNode, p.sourcePortId, p.sourceFace);
  const targetHandle = resolveHandle(targetNode, p.targetPortId, p.targetFace);
  const connection: Connection = {
    source: p.sourceNodeId,
    sourceHandle,
    target: p.targetNodeId,
    targetHandle,
  };
  if (!st().isValidConnection(connection)) {
    throw new CommandError(
      `That connection is not valid (incompatible direction/signal, duplicate, or self-connection).`,
    );
  }
  const before = new Set(st().edges.map((e) => e.id));
  st().onConnect(connection);
  const edge = st().edges.find((e) => !before.has(e.id));
  if (!edge) {
    // isValidConnection passed, but onConnect can still bail into the
    // incompatible-connection flow (connector/signal needs an adapter, or there
    // are zero/multiple adapter matches), leaving a pending UI prompt and no
    // edge. Clear that pending state and report honestly rather than claiming
    // a connection that never happened.
    useSchematicStore.setState({ pendingIncompatibleConnection: null });
    throw new CommandError(
      "Connection was not created — these ports are incompatible and need an adapter device between them.",
    );
  }
  return { connected: true, edgeId: edge.id, sourceHandle, targetHandle };
}

// ---------------------------------------------------------------------------
// Command handlers — each returns a JSON-serializable result or throws CommandError.
// ---------------------------------------------------------------------------
export const handlers: Record<CommandType, (params: Record<string, unknown>) => unknown | Promise<unknown>> = {
  get_schematic: () => {
    const devices = deviceNodes().map((n) => {
      const d = n.data as DeviceData;
      return {
        nodeId: n.id,
        label: d.label,
        deviceType: d.deviceType,
        manufacturer: d.manufacturer,
        position: n.position,
        parentId: n.parentId,
        slotCount: (d.slots ?? []).length,
        ports: (d.ports ?? []).map(portSummary),
      };
    });
    const connections = st().edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
    }));
    return {
      schematicName: st().schematicName,
      deviceCount: devices.length,
      connectionCount: connections.length,
      devices,
      connections,
    };
  },

  list_devices: () =>
    deviceNodes().map((n) => {
      const d = n.data as DeviceData;
      return {
        nodeId: n.id,
        label: d.label,
        deviceType: d.deviceType,
        manufacturer: d.manufacturer,
        modelNumber: d.modelNumber,
        position: n.position,
        parentId: n.parentId,
      };
    }),

  get_device: (params) => {
    const { nodeId } = params as unknown as GetDeviceParams;
    const node = requireDevice(nodeId);
    const d = node.data as DeviceData;
    return {
      nodeId: node.id,
      label: d.label,
      shortName: d.shortName,
      deviceType: d.deviceType,
      manufacturer: d.manufacturer,
      modelNumber: d.modelNumber,
      position: node.position,
      parentId: node.parentId,
      ports: (d.ports ?? []).map(portSummary),
      slots: (d.slots ?? []).map(slotSummary),
    };
  },

  search_templates: async (params) => {
    const { query, limit } = params as unknown as SearchTemplatesParams;
    const q = (query ?? "").trim().toLowerCase();
    const list = await allTemplates();
    const scored = list.filter((t) => {
      if (!q) return true;
      const hay = [t.label, t.deviceType, t.manufacturer, t.modelNumber, ...(t.searchTerms ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return scored.slice(0, Math.max(1, Math.min(limit ?? 25, 100))).map((t) => ({
      templateId: t.id ?? t.deviceType,
      label: t.label,
      deviceType: t.deviceType,
      manufacturer: t.manufacturer,
      portCount: (t.ports ?? []).length,
    }));
  },

  add_device: async (params) => {
    return addDeviceCore(params as unknown as AddDeviceParams, await allTemplates());
  },

  set_device_property: (params) => {
    const { nodeId, properties } = params as unknown as SetDevicePropertyParams;
    requireDevice(nodeId);
    if (!properties || typeof properties !== "object") {
      throw new CommandError("properties must be an object.");
    }
    const { label, shortName, patch, applied, rejected } = classifyDeviceProperties(properties);
    if (applied.length === 0) {
      throw new CommandError(
        `No editable fields. Rejected (not allowed in Beta): ${rejected.join(", ")}.`,
      );
    }
    if (label !== undefined) st().updateDeviceLabel(nodeId, label);
    if (shortName !== undefined) st().updateDeviceShortName(nodeId, shortName);
    if (Object.keys(patch).length > 0) st().patchDeviceData(nodeId, patch as Partial<DeviceData>);
    return { nodeId, applied, rejected };
  },

  connect_devices: (params) => connectDevicesCore(params as unknown as ConnectDevicesParams),

  delete_device: (params) => {
    const { nodeId } = params as unknown as DeleteDeviceParams;
    requireDevice(nodeId);
    st().deleteNode(nodeId);
    return { deleted: true, nodeId };
  },

  move_device: (params) => {
    const { nodeId, x, y } = params as unknown as MoveDeviceParams;
    requireDevice(nodeId);
    const pos = validatePosition(x, y);
    if (!pos.ok) throw new CommandError(pos.error);
    st().moveDevice(nodeId, pos.position);
    return { nodeId, position: pos.position };
  },

  delete_connection: (params) => {
    const { connectionId } = params as unknown as DeleteConnectionParams;
    if (!connectionId) throw new CommandError("connectionId is required.");
    const plan = planConnectionRemoval(st().edges, connectionId);
    if (!plan.ok) throw new CommandError(plan.error);
    st().deleteConnection(plan.removeId);
    return { deleted: true, connectionId };
  },

  add_devices: async (params) => {
    const { devices } = (params ?? {}) as unknown as AddDevicesParams;
    // One template fetch for the whole batch (allTemplates() is cached anyway).
    const templates = await allTemplates();
    const outcome = runBatch(devices, MAX_BATCH_ITEMS, (spec: AddDeviceParams) =>
      addDeviceCore(spec, templates),
    );
    if (!outcome.ok) throw new CommandError(outcome.error);
    return { results: outcome.results, succeeded: outcome.succeeded, failed: outcome.failed };
  },

  connect_devices_batch: (params) => {
    const { connections } = (params ?? {}) as unknown as ConnectDevicesBatchParams;
    const outcome = runBatch(connections, MAX_BATCH_ITEMS, (c: ConnectDevicesParams) =>
      connectDevicesCore(c),
    );
    if (!outcome.ok) throw new CommandError(outcome.error);
    return { results: outcome.results, succeeded: outcome.succeeded, failed: outcome.failed };
  },

  create_room: (params) => {
    const { label, x, y, width, height } = params as unknown as CreateRoomParams;
    if (typeof label !== "string" || label.trim() === "") {
      throw new CommandError("label is required (a non-empty room name).");
    }
    const pos = validatePosition(x, y);
    if (!pos.ok) throw new CommandError(pos.error);
    const size = validateRoomSize(width, height);
    if (!size.ok) throw new CommandError(size.error);
    const beforeRooms = new Set(st().nodes.filter((n) => n.type === "room").map((n) => n.id));
    const beforeParents = new Map(deviceNodes().map((n) => [n.id, n.parentId] as const));
    st().addRoom(label, pos.position, size.size);
    const room = st().nodes.find((n) => n.type === "room" && !beforeRooms.has(n.id));
    if (!room) throw new CommandError("Room was not created (no new room node appeared).");
    // addRoom runs reparentAllDevices, which pulls any existing devices that now fall
    // inside the new room into it (and rewrites their coords to room-relative). Report
    // those so the caller knows those devices' positions changed (re-read via get_device
    // / get_schematic before using their old coordinates).
    const absorbedDeviceIds = deviceNodes()
      .filter((n) => n.parentId === room.id && beforeParents.get(n.id) !== room.id)
      .map((n) => n.id);
    return {
      roomId: room.id,
      label: (room.data as { label?: string }).label ?? label,
      position: pos.position,
      size: { width: size.size?.width ?? 400, height: size.size?.height ?? 300 },
      absorbedDeviceIds,
    };
  },

  place_device_in_room: (params) => {
    const { deviceId, roomId, x, y } = params as unknown as PlaceDeviceInRoomParams;
    requireDevice(deviceId);
    const room = st().nodes.find((n) => n.id === roomId);
    if (!room) throw new CommandError(`No room found with id "${roomId}".`);
    if (room.type !== "room") throw new CommandError(`Node "${roomId}" is not a room.`);
    let rel = { x: 16, y: 16 };
    if (x !== undefined || y !== undefined) {
      const pos = validatePosition(x, y);
      if (!pos.ok) throw new CommandError(pos.error);
      rel = pos.position;
    }
    // The store action is atomic and returns whether it actually committed: it mutates
    // only if the device's center lands inside the requested room, otherwise it changes
    // nothing. Gate on that boolean (NOT a parentId read-back, which can't tell a
    // rejected placement of an already-in-this-room device from a real one).
    const placed = st().placeDeviceInRoom(deviceId, roomId, rel);
    if (!placed) {
      const after = st().nodes.find((n) => n.id === deviceId);
      throw new CommandError(
        `Device "${deviceId}" could not be placed in room "${roomId}": at the given position ` +
          `(${rel.x}, ${rel.y} relative to the room) its center falls outside the room or inside a ` +
          `nested room (current parent: ${after?.parentId ?? "none"}). Adjust x/y or enlarge the room.`,
      );
    }
    return { nodeId: deviceId, roomId, position: rel };
  },

  add_note: (params) => {
    const { text, x, y } = params as unknown as AddNoteParams;
    if (typeof text !== "string" || text.trim() === "") {
      throw new CommandError("text is required (a non-empty note).");
    }
    const pos = validatePosition(x, y);
    if (!pos.ok) throw new CommandError(pos.error);
    // No store action returns the new note's id, and addNote/updateNoteHtml are two
    // calls — but only addNote pushes undo, so the pair is a single undo step. Snapshot
    // ids, create the (empty) note, then set its escaped HTML on the new node.
    const before = new Set(st().nodes.map((n) => n.id));
    st().addNote(pos.position);
    const note = st().nodes.find((n) => n.type === "note" && !before.has(n.id));
    if (!note) throw new CommandError("Note was not created (no new note node appeared).");
    st().updateNoteHtml(note.id, noteTextToHtml(text));
    return { noteId: note.id, text, position: pos.position };
  },

  list_slot_cards: (params) => {
    const { deviceId, slotId } = params as unknown as ListSlotCardsParams;
    const device = requireDevice(deviceId);
    const slot = requireSlot(device, slotId);
    if (!slot.slotFamily) return { slotId, slotFamily: undefined, cards: [] };
    // Reads the current library view (live-library cache if warmed by an earlier
    // search_templates call, plus the bundled floor) and this schematic's custom
    // templates — the same view install_card resolves against. Only cards with a real
    // template id are returned: install_card resolves by id, so an id-less card could
    // be listed but not installed (kept consistent here).
    // Known minor limitation: if a custom template reuses a library card's id,
    // install_card's getTemplateById prefers the library copy, so the listed-vs-
    // installed card could differ. This can't corrupt state — install_card re-checks
    // the slot family and re-reads the slot, so a wrong-family resolution just rejects.
    const cards = getCardsByFamily(slot.slotFamily, st().customTemplates)
      .filter((t) => Boolean(t.id))
      .map((t) => ({
        templateId: t.id!,
        label: t.label,
        manufacturer: t.manufacturer,
        modelNumber: t.modelNumber,
      }));
    return { slotId, slotFamily: slot.slotFamily, cards };
  },

  install_card: (params) => {
    const { deviceId, slotId, cardTemplateId } = params as unknown as InstallCardParams;
    const device = requireDevice(deviceId);
    const slot = requireSlot(device, slotId);
    // Refuse to overwrite a filled slot: swapCard would replace the card and drop its
    // ports + connected connections. Make the AI remove_card first so that loss is
    // explicit, never silent.
    if (slot.cardTemplateId) {
      throw new CommandError(
        `Slot "${slotId}" already holds a card ("${slot.cardLabel ?? slot.cardTemplateId}"). ` +
          `Remove it first with remove_card, then install.`,
      );
    }
    if (!cardTemplateId) throw new CommandError("cardTemplateId is required.");
    // Resolve exactly the way swapCard will (getTemplateById over the current library
    // view + custom templates), so a card we accept is one swapCard can actually find.
    const card = getTemplateById(cardTemplateId, st().customTemplates);
    if (!card) {
      throw new CommandError(
        `No card template found for "${cardTemplateId}". Call list_slot_cards (or ` +
          `search_templates to load the full library) first.`,
      );
    }
    const compat = validateCardForSlot(slot.slotFamily, card.slotFamily);
    if (!compat.ok) throw new CommandError(compat.error);
    if (!card.id) throw new CommandError(`Card template "${cardTemplateId}" has no id and cannot be installed.`);
    st().swapCard(deviceId, slotId, card.id);
    // Confirm by re-reading the slot (swapCard returns void); guards against any
    // residual resolution mismatch rather than reporting a blind success.
    const after = requireSlot(requireDevice(deviceId), slotId);
    if (after.cardTemplateId !== card.id) {
      throw new CommandError(`Card "${card.id}" could not be installed into slot "${slotId}".`);
    }
    return {
      deviceId,
      slotId,
      cardTemplateId: card.id,
      cardLabel: after.cardLabel,
      portIds: after.portIds,
    };
  },

  remove_card: (params) => {
    const { deviceId, slotId } = params as unknown as RemoveCardParams;
    const device = requireDevice(deviceId);
    const slot = requireSlot(device, slotId);
    // Empty slot -> nothing to remove. Reject WITHOUT calling swapCard, which would
    // push an empty undo step and rebuild the (already-empty) slot for no reason.
    if (!slot.cardTemplateId) {
      throw new CommandError(`Slot "${slotId}" is already empty.`);
    }
    st().swapCard(deviceId, slotId, null);
    const after = requireSlot(requireDevice(deviceId), slotId);
    if (after.cardTemplateId) {
      throw new CommandError(`Card could not be removed from slot "${slotId}".`);
    }
    return { deviceId, slotId, emptied: true };
  },
};

// ---------------------------------------------------------------------------
// Connection controller — a singleton driven by the useMcpBridge() hook.
// ---------------------------------------------------------------------------
class BridgeController {
  private ws: WebSocket | null = null;
  private enabled = false;
  private token = "";
  private port = DEFAULT_BRIDGE_PORT;
  private clientId =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Date.now()}`;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  /** Set when pairing was refused (bad token / superseded) so we stop retrying. */
  private halted = false;

  /** (Re)start with the latest settings. Idempotent for unchanged inputs. */
  start(token: string, port: number) {
    if (this.enabled && this.token === token && this.port === port && (this.ws || this.reconnectTimer)) {
      return; // already running with the same config (StrictMode-safe)
    }
    this.stop();
    this.enabled = true;
    this.token = token;
    this.port = port || DEFAULT_BRIDGE_PORT;
    this.halted = false;
    this.backoffMs = 1000;
    this.connect();
  }

  stop() {
    this.enabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    setStatus("off");
  }

  private scheduleReconnect() {
    if (!this.enabled || this.halted) return;
    this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, 15000);
  }

  private connect() {
    if (!this.enabled || this.halted) return;
    setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    } catch {
      setStatus("error", "Could not open a connection.");
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "hello",
          token: this.token,
          protocolVersion: PROTOCOL_VERSION,
          clientId: this.clientId,
          schematicName: st().schematicName,
        }),
      );
    };

    ws.onmessage = (ev) => this.onMessage(ev);

    ws.onerror = () => {
      setStatus("error", "Connection error — is the MCP server running?");
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (this.enabled && !this.halted) {
        setStatus("connecting", "Reconnecting…");
        this.scheduleReconnect();
      }
    };
  }

  private async onMessage(ev: MessageEvent) {
    let msg: BridgeServerMessage;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }
    if (msg.type === "hello_ack") {
      if (msg.ok) {
        this.backoffMs = 1000;
        setStatus("connected");
      } else {
        this.halted = true;
        setStatus("error", msg.reason ?? "Pairing refused.");
      }
      return;
    }
    if (msg.type === "superseded") {
      this.halted = true;
      setStatus("error", msg.reason ?? "Another tab took the AI connection.");
      return;
    }
    if (msg.type === "command") {
      const { requestId, command, params } = msg;
      const reply = (ok: boolean, payload: { result?: unknown; error?: string }) =>
        this.ws?.send(JSON.stringify({ type: "response", requestId, ok, ...payload }));
      const handler = handlers[command];
      if (!handler) {
        reply(false, { error: `Unknown command "${command}".` });
        return;
      }
      try {
        const result = await handler(params ?? {});
        reply(true, { result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply(false, { error: message });
      }
    }
  }
}

export const mcpBridge = new BridgeController();

/** Mount once (in App). Starts/stops the bridge as the Beta setting changes. */
export function useMcpBridge() {
  const enabled = useSchematicStore((s) => s.mcpBridgeEnabled);
  const token = useSchematicStore((s) => s.mcpBridgeToken);
  const port = useSchematicStore((s) => s.mcpBridgePort);
  useEffect(() => {
    if (enabled && token) mcpBridge.start(token, port);
    else mcpBridge.stop();
    return () => mcpBridge.stop();
  }, [enabled, token, port]);
}
