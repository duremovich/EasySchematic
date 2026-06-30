import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { isOriginAllowed, tokensMatch } from "./security.js";
import { PROTOCOL_VERSION } from "./protocol.generated.js";

export interface BridgeOptions {
  port: number;
  token: string;
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  log: (msg: string) => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Hosts the localhost WebSocket the editor dials into, and relays MCP tool calls
 * to the single bound tab. Enforces the token + origin handshake and a one-active-
 * connection model (a new authenticated tab supersedes the previous one).
 */
export class AppBridge {
  private wss: WebSocketServer | null = null;
  private active: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  constructor(private readonly opts: BridgeOptions) {}

  start(): void {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: this.opts.port });
    this.wss.on("connection", (ws, req) => this.onConnection(ws, req));
    this.wss.on("error", (err) => this.opts.log(`WebSocket server error: ${err.message}`));
  }

  get connected(): boolean {
    return this.active !== null && this.active.readyState === WebSocket.OPEN;
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    if (!isOriginAllowed(req.headers.origin, this.opts.allowedOrigins)) {
      this.opts.log(`Rejected connection from disallowed origin: ${req.headers.origin ?? "(none)"}`);
      ws.close();
      return;
    }
    let helloed = false;

    ws.on("message", (data: WebSocket.RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!helloed) {
        if (msg.type !== "hello") {
          ws.close();
          return;
        }
        if (msg.protocolVersion !== PROTOCOL_VERSION) {
          ws.send(JSON.stringify({ type: "hello_ack", ok: false, reason: "Protocol version mismatch — update the MCP server." }));
          ws.close();
          return;
        }
        if (!tokensMatch(String(msg.token ?? ""), this.opts.token)) {
          ws.send(JSON.stringify({ type: "hello_ack", ok: false, reason: "Invalid pairing token." }));
          ws.close();
          return;
        }
        helloed = true;
        // Single active binding: supersede any previously bound tab.
        if (this.active && this.active !== ws) {
          try {
            this.active.send(JSON.stringify({ type: "superseded", reason: "Another EasySchematic tab took the AI connection." }));
            this.active.close();
          } catch {
            /* ignore */
          }
          this.rejectAllPending(new Error("Connection superseded by a new tab."));
        }
        this.active = ws;
        ws.send(JSON.stringify({ type: "hello_ack", ok: true }));
        this.opts.log(`EasySchematic connected (schematic: ${String(msg.schematicName ?? "untitled")}).`);
        return;
      }

      if (msg.type === "response" && typeof msg.requestId === "string") {
        const p = this.pending.get(msg.requestId);
        if (!p) return;
        this.pending.delete(msg.requestId);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(String(msg.error || "Command failed.")));
      }
    });

    ws.on("close", () => {
      if (this.active === ws) {
        this.active = null;
        this.rejectAllPending(new Error("EasySchematic disconnected."));
        this.opts.log("EasySchematic disconnected.");
      }
    });
    ws.on("error", () => {
      /* surfaced via the close handler */
    });
  }

  private rejectAllPending(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  /** Send a command to the bound tab and await its correlated response. */
  call(command: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connected || !this.active) {
      return Promise.reject(
        new Error("No EasySchematic app is connected. Open the editor and turn on AI Assistant (MCP) in Preferences."),
      );
    }
    const requestId = `req-${++this.seq}`;
    const timeoutMs = this.opts.requestTimeoutMs ?? 15000;
    const socket = this.active;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for EasySchematic to handle "${command}".`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ type: "command", requestId, command, params }));
    });
  }
}
