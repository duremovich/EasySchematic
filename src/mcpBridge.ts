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
import { inferRackForm, inferRackHeightU } from "./rackUtils";
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
  type CreateRackParams,
  type PlaceDeviceInRackParams,
  type RemoveDeviceFromRackParams,
  type UpdateNoteParams,
  type DeleteNoteParams,
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
  noteHtmlToText,
  validateCardForSlot,
  validateUPosition,
  validateRackFace,
  validateRackSpec,
} from "./mcp/validation";
import type {
  DeviceData,
  DeviceTemplate,
  InstalledSlot,
  Port,
  RackData,
  RackDevicePlacement,
  RackElevationPage,
  SchematicNode,
} from "./types";

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

/** Compact view of a room (container) node for get_schematic. `parentId`/`position`
 *  follow the same frame convention as devices — position is room-relative when the room
 *  is nested inside another room. Size follows the same `measured ?? width ?? style ??
 *  default` chain the rest of the app uses (snapUtils.nodeRect), so a room whose live
 *  measured size differs from its style isn't misreported; defaults mirror addRoom (400x300). */
function roomSummary(n: SchematicNode) {
  const style = (n.style ?? {}) as { width?: number; height?: number };
  return {
    roomId: n.id,
    label: (n.data as { label?: string }).label,
    position: n.position,
    parentId: n.parentId,
    width: n.measured?.width ?? (n.width as number | undefined) ?? style.width ?? 400,
    height: n.measured?.height ?? (n.height as number | undefined) ?? style.height ?? 300,
  };
}

/** Compact view of a note (sticky-note) node for get_schematic. `text` is a best-effort
 *  plain-text rendering of the note's stored HTML (see noteHtmlToText). `parentId` is
 *  reported because a note can be reparented into a room, making `position` room-relative. */
function noteSummary(n: SchematicNode) {
  return {
    noteId: n.id,
    text: noteHtmlToText((n.data as { html?: string }).html ?? ""),
    position: n.position,
    parentId: n.parentId,
  };
}

/** Find a note node by id, or throw a readable CommandError (mirrors requireDevice). */
function requireNote(noteId: string): SchematicNode {
  const node = st().nodes.find((n) => n.id === noteId);
  if (!node) throw new CommandError(`No note found with id "${noteId}".`);
  if (node.type !== "note") throw new CommandError(`Node "${noteId}" is not a note.`);
  return node;
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

/** All rack-elevation pages in the schematic (racks live on their own page type,
 *  separate from the main device graph). */
function rackPages(): RackElevationPage[] {
  return st().pages.filter((p): p is RackElevationPage => p.type === "rack-elevation");
}

/** Compact view of a rack device placement, resolving the device's current label and
 *  inferred U height from its node. deviceLabel/heightU are null when the placement
 *  points at a node that no longer exists. */
function rackPlacementSummary(pl: RackDevicePlacement) {
  const data = st().nodes.find((n) => n.id === pl.deviceNodeId)?.data as DeviceData | undefined;
  return {
    placementId: pl.id,
    deviceNodeId: pl.deviceNodeId,
    deviceLabel: data?.label ?? null,
    uPosition: pl.uPosition,
    face: pl.face,
    halfRackSide: pl.halfRackSide,
    mountedOnShelfId: pl.mountedOnShelfId,
    heightU: data ? inferRackHeightU(data) : null,
  };
}

/** Resolve the rack-elevation page + rack for a rackId, failing on zero or multiple
 *  matches rather than guessing. Rack ids are intended to be unique; a duplicate means
 *  the file is already inconsistent, and silently mutating the first match would risk
 *  touching the wrong rack. */
function requireRack(rackId: string): { page: RackElevationPage; rack: RackData } {
  const matches: { page: RackElevationPage; rack: RackData }[] = [];
  for (const page of rackPages()) {
    for (const rack of page.racks) {
      if (rack.id === rackId) matches.push({ page, rack });
    }
  }
  if (matches.length === 0) throw new CommandError(`No rack found with id "${rackId}". Call list_racks first.`);
  if (matches.length > 1) throw new CommandError(`Rack id "${rackId}" is ambiguous (matches ${matches.length} racks).`);
  return matches[0];
}

/** Resolve the rack-elevation page + placement for a placementId, failing on zero or
 *  multiple matches (same reasoning as requireRack). */
function requirePlacement(placementId: string): { page: RackElevationPage; placement: RackDevicePlacement } {
  const matches: { page: RackElevationPage; placement: RackDevicePlacement }[] = [];
  for (const page of rackPages()) {
    for (const placement of page.placements) {
      if (placement.id === placementId) matches.push({ page, placement });
    }
  }
  if (matches.length === 0) throw new CommandError(`No rack placement found with id "${placementId}". Call list_racks first.`);
  if (matches.length > 1) throw new CommandError(`Placement id "${placementId}" is ambiguous (matches ${matches.length}).`);
  return matches[0];
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
    const rooms = st().nodes.filter((n) => n.type === "room").map(roomSummary);
    const notes = st().nodes.filter((n) => n.type === "note").map(noteSummary);
    return {
      schematicName: st().schematicName,
      deviceCount: devices.length,
      connectionCount: connections.length,
      roomCount: rooms.length,
      noteCount: notes.length,
      devices,
      connections,
      rooms,
      notes,
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

  list_racks: () => {
    const pages = rackPages().map((page) => ({
      pageId: page.id,
      label: page.label,
      racks: page.racks.map((r) => ({
        rackId: r.id,
        label: r.label,
        rackType: r.rackType,
        heightU: r.heightU,
        depthMm: r.depthMm,
        widthClass: r.widthClass,
        placements: page.placements.filter((pl) => pl.rackId === r.id).map(rackPlacementSummary),
        // Accessories (shelves, blank/vent panels, etc.) also occupy U positions, so list
        // them too — otherwise a U that's blocked by, say, a shelf would look free here and
        // place_device_in_rack would reject it for no visible reason.
        accessories: page.accessories
          .filter((a) => a.rackId === r.id)
          .map((a) => ({ accessoryId: a.id, type: a.type, label: a.label, uPosition: a.uPosition, heightU: a.heightU })),
      })),
    }));
    return { pageCount: pages.length, pages };
  },

  create_rack: (params) => {
    const { label, heightU, rackType, depthMm, pageId, pageLabel } = params as unknown as CreateRackParams;
    const spec = validateRackSpec(rackType, heightU, depthMm);
    if (!spec.ok) throw new CommandError(spec.error);
    const rackLabel = typeof label === "string" && label.trim() !== "" ? label.trim() : "Rack";

    // Resolve the target page. An explicit pageId must already exist; otherwise create a
    // fresh rack page. (Creating a page here is a second undo step — addRackPage and
    // addRack each push undo — but that only happens on the first rack; coalescing would
    // need a store change, out of scope.)
    let targetPageId: string;
    let createdPage = false;
    if (pageId !== undefined) {
      // Fail on zero or multiple matches rather than guessing — addRack applies through
      // mapElevationPage, which would write to EVERY page sharing this id (same fail-on-
      // ambiguity rule as requireRack / requirePlacement).
      const matches = rackPages().filter((p) => p.id === pageId);
      if (matches.length === 0) {
        throw new CommandError(`No rack-elevation page found with id "${pageId}". Call list_racks, or omit pageId to create one.`);
      }
      if (matches.length > 1) {
        throw new CommandError(`Page id "${pageId}" is ambiguous (matches ${matches.length} pages).`);
      }
      targetPageId = pageId;
    } else {
      const newLabel = typeof pageLabel === "string" && pageLabel.trim() !== "" ? pageLabel.trim() : "Rack Elevation";
      targetPageId = st().addRackPage(newLabel);
      createdPage = true;
    }

    // New rack x-position follows the editor: PAGE-LOCAL rack count * 400 (a new page
    // starts at 0).
    const page = rackPages().find((p) => p.id === targetPageId)!;
    const position = { x: page.racks.length * 400, y: 0 };

    const rackId = st().addRack(targetPageId, {
      label: rackLabel,
      rackType: spec.rackType,
      heightU: spec.heightU,
      depthMm: spec.depthMm,
      widthClass: "19in",
      position,
    });
    return {
      pageId: targetPageId,
      rackId,
      label: rackLabel,
      rackType: spec.rackType,
      heightU: spec.heightU,
      depthMm: spec.depthMm,
      createdPage,
    };
  },

  place_device_in_rack: (params) => {
    const { deviceId, rackId, uPosition, face } = params as unknown as PlaceDeviceInRackParams;
    const node = requireDevice(deviceId);
    const data = node.data as DeviceData;
    const { page, rack } = requireRack(rackId);
    const f = validateRackFace(face);
    if (!f.ok) throw new CommandError(f.error);
    const u = validateUPosition(uPosition);
    if (!u.ok) throw new CommandError(u.error);

    // 2-post frames have no rear face (mirrors the editor's isRackRearBlocked).
    if (f.face === "rear" && rack.rackType === "open-2post") {
      throw new CommandError(`Rack "${rackId}" is a 2-post frame, which has no rear face — use face "front".`);
    }

    // A device is placed in at most one rack at a time: the editor hides "Place in Rack"
    // once a device is placed and excludes already-placed devices from auto-fill, but the
    // store does not enforce singularity. Reject a duplicate placement explicitly.
    for (const p of rackPages()) {
      const existing = p.placements.find((pl) => pl.deviceNodeId === deviceId);
      if (existing) {
        throw new CommandError(
          `Device "${deviceId}" is already placed in a rack (placement "${existing.id}"). ` +
            `Remove it first with remove_device_from_rack.`,
        );
      }
    }

    const form = inferRackForm(data);
    if (form === "oversize") {
      throw new CommandError(`Device "${deviceId}" is too wide to mount in a 19" rack (oversize).`);
    }
    if (form === "shelf-only") {
      // Shelf-only gear (too small for a direct rack-mount panel) needs a shelf to sit on.
      // The editor creates that shelf and lets the user position the device on it; doing
      // that from the bridge would mean auto-creating a shelf whose later cleanup can't be
      // told apart from a user-built shelf (no provenance flag on the data). Rather than
      // risk dropping a user's shelf or leaving an orphan, shelf placement stays an editor
      // task for this slice.
      throw new CommandError(
        `Device "${deviceId}" is too small for a direct rack-mount (it needs a shelf). ` +
          `Add a shelf and place it on the shelf in the editor.`,
      );
    }
    const heightU = inferRackHeightU(data);

    // addPlacementSmart does NOT check occupancy — it appends the placement unconditionally
    // (only its oversize/no-page/no-device early returns bail). So the bridge MUST pre-check
    // isRackSlotAvailable here, or two devices could be stacked into the same U range.
    let preferredHalfRackSide: "left" | "right" | undefined;
    if (form === "half") {
      // Pick the exact side that is free per the authoritative occupancy check, then pass
      // it to addPlacementSmart — its internal side heuristic is weaker (ignores multi-U
      // overlap, full-width blockers and accessories), so "either side free" alone is not
      // safe. isRackSlotAvailable(side)=true guarantees its sideTaken(side)=false, so the
      // side we pass is honored.
      const leftFree = st().isRackSlotAvailable(page.id, rackId, u.u, heightU, f.face, "left");
      const rightFree = st().isRackSlotAvailable(page.id, rackId, u.u, heightU, f.face, "right");
      preferredHalfRackSide = leftFree ? "left" : rightFree ? "right" : undefined;
      if (!preferredHalfRackSide) {
        throw new CommandError(`No free half-rack space at U${u.u} on the ${f.face} of rack "${rackId}".`);
      }
    } else {
      // full / unknown — full-width direct placement spanning heightU.
      if (!st().isRackSlotAvailable(page.id, rackId, u.u, heightU, f.face)) {
        throw new CommandError(`U${u.u}–${u.u + heightU - 1} on the ${f.face} of rack "${rackId}" is occupied or out of bounds.`);
      }
    }

    const res = st().addPlacementSmart(page.id, rackId, deviceId, u.u, f.face, preferredHalfRackSide);
    if (!res.ok) {
      throw new CommandError(`Could not place device "${deviceId}" in rack "${rackId}" (${res.reason}).`);
    }
    return {
      placementId: res.placementId,
      rackId,
      deviceId,
      uPosition: u.u,
      face: f.face,
      form,
      heightU,
      halfRackSide: preferredHalfRackSide,
    };
  },

  remove_device_from_rack: (params) => {
    const { placementId } = params as unknown as RemoveDeviceFromRackParams;
    if (!placementId) throw new CommandError("placementId is required.");
    const { page } = requirePlacement(placementId);
    // Remove only the placement (one undo step). The device stays on the schematic. Shelf
    // accessories are never auto-created by the bridge (shelf-only placement is rejected),
    // so there is nothing to cascade-clean here — and we never delete a user-built shelf.
    st().removeRackPlacement(page.id, placementId);
    return { removed: true, placementId };
  },

  update_note: (params) => {
    const { noteId, text } = params as unknown as UpdateNoteParams;
    requireNote(noteId);
    if (typeof text !== "string" || text.trim() === "") {
      throw new CommandError("text is required (a non-empty note).");
    }
    const html = noteTextToHtml(text);
    const current = (requireNote(noteId).data as { html?: string }).html ?? "";
    // No-op when the content is unchanged — updateNoteHtml does not guard identical writes,
    // and pushSnapshot() would otherwise add an empty undo step (the editor's own commit
    // path is likewise gated on `html !== data.html`).
    if (html === current) {
      return { noteId, text, changed: false };
    }
    // pushSnapshot() makes this a single undo step (updateNoteHtml itself does not push undo,
    // because the editor calls it on every keystroke and snapshots separately). Text is
    // XSS-safe via the same noteTextToHtml path add_note uses.
    st().pushSnapshot();
    st().updateNoteHtml(noteId, html);
    return { noteId, text, changed: true };
  },

  delete_note: (params) => {
    const { noteId } = params as unknown as DeleteNoteParams;
    requireNote(noteId);
    // deleteNode selects only this note and routes through removeSelected (undoable, full
    // cleanup). Notes have no ports/edges/children, so nothing cascades. delete_device uses
    // the same path.
    st().deleteNode(noteId);
    return { deleted: true, noteId };
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
