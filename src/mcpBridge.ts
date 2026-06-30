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
import { getBundledTemplates, getTemplateById, fetchTemplates } from "./templateApi";
import {
  DEFAULT_BRIDGE_PORT,
  PROTOCOL_VERSION,
  type CommandType,
  type BridgeServerMessage,
  type AddDeviceParams,
  type SetDevicePropertyParams,
  type ConnectDevicesParams,
  type GetDeviceParams,
  type SearchTemplatesParams,
  type DeleteDeviceParams,
  type PortFace,
} from "./mcp/protocol";
import { classifyDeviceProperties, resolveHandleFromCandidates } from "./mcp/validation";
import type { DeviceData, DeviceTemplate, Port, SchematicNode } from "./types";

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
// Command handlers — each returns a JSON-serializable result or throws CommandError.
// ---------------------------------------------------------------------------
const handlers: Record<CommandType, (params: Record<string, unknown>) => unknown | Promise<unknown>> = {
  get_schematic: () => {
    const devices = deviceNodes().map((n) => {
      const d = n.data as DeviceData;
      return {
        nodeId: n.id,
        label: d.label,
        deviceType: d.deviceType,
        manufacturer: d.manufacturer,
        position: n.position,
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
      ports: (d.ports ?? []).map(portSummary),
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
    const { templateId, label, x, y } = params as unknown as AddDeviceParams;
    if (!templateId) throw new CommandError("templateId is required.");
    const tpl = resolveTemplate(templateId, await allTemplates());
    if (!tpl) throw new CommandError(`No template found for "${templateId}". Use search_templates first.`);
    const position = { x: x ?? 0, y: y ?? 0 };
    const before = new Set(st().nodes.map((n) => n.id));
    st().addDevice(tpl, position);
    const added = st().nodes.find((n) => !before.has(n.id));
    if (!added) throw new CommandError("Device was not added (no new node appeared).");
    if (label && label !== tpl.label) st().updateDeviceLabel(added.id, label);
    return { nodeId: added.id, label: (added.data as DeviceData).label, position };
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

  connect_devices: (params) => {
    const p = params as unknown as ConnectDevicesParams;
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
  },

  delete_device: (params) => {
    const { nodeId } = params as unknown as DeleteDeviceParams;
    requireDevice(nodeId);
    st().deleteNode(nodeId);
    return { deleted: true, nodeId };
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
