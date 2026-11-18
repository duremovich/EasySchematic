import { createServer, STATUS_CODES, type IncomingMessage, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { classifyHandshake, tokensMatch } from "./security.js";
import { PROTOCOL_VERSION } from "./protocol.generated.js";

export interface BridgeOptions {
  port: number;
  token: string;
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  log: (msg: string) => void;
  /** Called every time this instance becomes the port owner — on the first bind
   *  (`takeover` false) and when it takes the port over later (`takeover` true) —
   *  so the caller can print the pairing banner (incl. the token) each time. */
  onOwner?: (takeover: boolean) => void;
}

/**
 * Which role this server instance currently plays.
 *  - `owner`: it holds the port and hosts the editor tab's WebSocket.
 *  - `peer`: another EasySchematic MCP server holds the port; this one relays its
 *    tool calls through it (Claude desktop launches the stdio server twice — #434).
 *  - `unavailable`: the port is held by something we cannot relay through (wrong
 *    token, not an EasySchematic MCP server, an older server, bind refused).
 *  - `starting`: first bind/peer attempt (or a takeover attempt) is in progress.
 *  - `stopped`: `stop()` was called.
 */
export type BridgeMode = "starting" | "owner" | "peer" | "unavailable" | "stopped";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

// ---------------------------------------------------------------------------
// Peer (instance-to-instance) relay limits. Peers are other local processes, so
// every per-connection resource is bounded and released on disconnect.
// ---------------------------------------------------------------------------
/** Version of the peer_* message shapes below (independent of PROTOCOL_VERSION,
 *  which both sides must also agree on since the owner forwards to the tab). */
export const PEER_PROTOCOL_VERSION = 1;
/** Max concurrent no-Origin (peer) sockets on the owner, authenticated or not. */
export const MAX_PEERS = 16;
/** Max tool calls one peer may have in flight through the owner at once. */
export const MAX_INFLIGHT_PER_PEER = 32;
/** Max calls the owner may have waiting on the tab (direct + relayed). */
export const MAX_PENDING_TAB = 256;
/** Max calls a peer instance may have waiting on the owner. */
export const MAX_PENDING_PEER = 64;
/** The first (pre-auth) message on a peer socket must be at most this big (checked
 *  after receipt; the hard ws-enforced ceiling on a peer socket is MAX_PEER_CALL_BYTES). */
export const MAX_PEER_HELLO_BYTES = 4 * 1024;
/** Largest message accepted on a peer socket (a relayed tool call): enforced by ws
 *  as that socket's maxPayload, so nothing bigger is ever buffered. */
export const MAX_PEER_CALL_BYTES = 1024 * 1024;
/** Largest message accepted on a tab socket (a command response — a big schematic
 *  read is a few MB), enforced by ws as maxPayload (was ws's 100 MiB default). The
 *  same bound applies to a relayed result, so anything the tab can return directly
 *  can also be relayed. */
export const MAX_RESULT_BYTES = 64 * 1024 * 1024;
/** Envelope allowance on top of MAX_RESULT_BYTES for the peer_result wrapper. */
const RELAY_ENVELOPE_BYTES = 1024;
/** How long a peer socket may sit unauthenticated, and how long a peer waits for
 *  the owner's ack, before giving up. */
export const PEER_HELLO_TIMEOUT_MS = 5000;
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 30000;

const CALL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COMMAND_RE = /^[a-z_]{1,64}$/;

function rawSize(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((n, b) => n + b.length, 0);
  return data instanceof ArrayBuffer ? data.byteLength : data.length;
}

function parse(data: WebSocket.RawData): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(data.toString());
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Fixed-text explanation for a peer_hello_ack refusal (the owner's own text is
 *  untrusted — whatever holds the port wrote it). */
function refusalReason(reason: unknown): string {
  if (reason === "invalid pairing token") {
    return "another EasySchematic MCP server instance is running there with a different pairing token, so tool calls can't be relayed through it. Give every instance the same EASYSCHEMATIC_MCP_TOKEN, or stop the extra one";
  }
  if (typeof reason === "string" && reason.startsWith("version mismatch")) {
    return "another EasySchematic MCP server instance is running there from a different version — rebuild both from the same version, or stop the extra one";
  }
  return "another EasySchematic MCP server instance refused the relay";
}

type PeerConnectResult = { ok: true; ws: WebSocket } | { ok: false; reason: string };

/**
 * Hosts the localhost WebSocket the editor dials into, and relays MCP tool calls
 * to the single bound tab. Enforces the token + origin handshake and a one-active-
 * connection model (a new authenticated tab supersedes the previous one).
 *
 * If the port is already held (a second instance of this server — Claude desktop
 * starts two), the instance becomes a *peer*: it dials the owner as a localhost
 * client with no Origin header, proves itself with the same pairing token
 * (`peer_hello`), and relays its tool calls (`peer_call` / `peer_result`) through
 * the owner to the tab. If the owner goes away the peer retries binding the port
 * itself, with backoff.
 */
export class AppBridge {
  /** Owner side: the HTTP server holding the port, and one ws server per socket
   *  kind so each gets its own maxPayload (peers: 1 MiB, tabs: 64 MiB). */
  private httpServer: HttpServer | null = null;
  private tabWss: WebSocketServer | null = null;
  private peerWss: WebSocketServer | null = null;
  private active: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  private _mode: BridgeMode = "starting";
  /** Why we can't relay (mode "unavailable"), for the tool error + logs. */
  private unavailableReason = "";
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryMs = RETRY_MIN_MS;
  /** Set after start()'s first attempt, so later role changes get logged here
   *  (index.ts logs the initial outcome). */
  private firstAttemptDone = false;

  /** Owner side: every no-Origin socket (authenticated or not). */
  private readonly peerSockets = new Set<WebSocket>();
  private lastPeerRejectLog = 0;

  /** Peer side: our socket to the owner and our calls awaiting its results. */
  private ownerSocket: WebSocket | null = null;
  private readonly peerPending = new Map<string, Pending>();
  private peerSeq = 0;

  constructor(private readonly opts: BridgeOptions) {}

  /** Bind the port (or, if it's taken, connect to the holder as a peer). Resolves
   *  once the first attempt has a definite outcome — see `mode`. */
  async start(): Promise<BridgeMode> {
    this.stopped = false;
    await this.attempt();
    return this._mode;
  }

  get mode(): BridgeMode {
    return this._mode;
  }

  /** Human-readable reason this instance can't reach the editor (mode "unavailable"). */
  get unavailableDetail(): string {
    return this.unavailableReason;
  }

  get connected(): boolean {
    return this.active !== null && this.active.readyState === WebSocket.OPEN;
  }

  /** Tear everything down (tests, shutdown). No further retries happen. */
  async stop(): Promise<void> {
    this.stopped = true;
    this._mode = "stopped";
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.rejectAll(this.peerPending, new Error("EasySchematic MCP server stopped."));
    if (this.ownerSocket) {
      this.ownerSocket.removeAllListeners();
      this.ownerSocket.on("error", () => {});
      this.ownerSocket.terminate();
      this.ownerSocket = null;
    }
    this.rejectAll(this.pending, new Error("EasySchematic MCP server stopped."));
    this.active = null;
    const server = this.httpServer;
    const wsss = [this.tabWss, this.peerWss];
    this.httpServer = this.tabWss = this.peerWss = null;
    for (const wss of wsss) {
      if (!wss) continue;
      for (const c of wss.clients) c.terminate();
      wss.close();
    }
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // -------------------------------------------------------------------------
  // Role selection: bind, else peer, else unavailable — retried with backoff.
  // -------------------------------------------------------------------------
  private async attempt(): Promise<void> {
    if (this.stopped) return;
    const bound = await this.tryBind();
    if (this.stopped) return;
    if (bound === true) {
      this.retryMs = RETRY_MIN_MS;
      this.unavailableReason = "";
      this._mode = "owner";
      const takeover = this.firstAttemptDone;
      if (takeover) {
        this.opts.log(`Port ${this.opts.port} is free again — this instance now hosts the bridge on ws://127.0.0.1:${this.opts.port}.`);
      }
      this.firstAttemptDone = true;
      this.opts.onOwner?.(takeover);
      return;
    }
    if (bound !== "in-use") {
      this.setUnavailable(`could not open port ${this.opts.port} on 127.0.0.1 (${bound.message})`, false);
      this.firstAttemptDone = true;
      this.scheduleRetry();
      return;
    }
    const peer = await this.connectAsPeer();
    if (this.stopped) {
      if (peer.ok) peer.ws.terminate();
      return;
    }
    if (!peer.ok) {
      this.setUnavailable(peer.reason, true);
      this.firstAttemptDone = true;
      this.scheduleRetry();
      return;
    }
    this.retryMs = RETRY_MIN_MS;
    this.unavailableReason = "";
    this.ownerSocket = peer.ws;
    if (this.firstAttemptDone) {
      this.opts.log(
        `Port ${this.opts.port} is held by another EasySchematic MCP server instance — relaying this instance's tool calls through it.`,
      );
    }
    this._mode = "peer";
    this.firstAttemptDone = true;
    peer.ws.on("message", (data) => this.onOwnerMessage(data));
    peer.ws.on("close", () => {
      if (this.ownerSocket !== peer.ws) return;
      this.ownerSocket = null;
      this.rejectAll(
        this.peerPending,
        new Error(
          "Lost the relay to the EasySchematic MCP server that owns the port while this call was in flight. " +
            "The change may or may not have been applied — re-read the schematic (get_schematic) before retrying.",
        ),
      );
      if (this.stopped) return;
      this._mode = "starting";
      this.opts.log("Relay to the port owner closed — trying to take over the port.");
      // Retry at once (tiny jitter so same-token peers don't all collide): a peer
      // whose relay just closed should usually win the port over an "unavailable"
      // (e.g. wrong-token) instance, whose backoff timer is >= 250 ms.
      this.scheduleRetry(Math.floor(Math.random() * 50));
    });
  }

  private setUnavailable(reason: string, portHeld: boolean): void {
    const full = portHeld ? `port ${this.opts.port} on 127.0.0.1 is held by another process: ${reason}` : reason;
    if (this.firstAttemptDone && (this._mode !== "unavailable" || this.unavailableReason !== full)) {
      this.opts.log(`Bridge unavailable — ${full}. Retrying in the background.`);
    }
    this._mode = "unavailable";
    this.unavailableReason = full;
  }

  /** Retry the bind/peer attempt after the current backoff (doubling it), or
   *  after `immediateMs` without touching the backoff. */
  private scheduleRetry(immediateMs?: number): void {
    if (this.stopped || this.retryTimer) return;
    let delay: number;
    if (immediateMs === undefined) {
      delay = this.retryMs;
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    } else {
      delay = Math.max(0, immediateMs);
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.attempt();
    }, delay);
  }

  /** Try to listen on 127.0.0.1:port. true = we're the owner now. */
  private tryBind(): Promise<true | "in-use" | Error> {
    return new Promise((resolve) => {
      // Same plain-HTTP 426 answer ws gives when it owns the server itself.
      const server = createServer((_req, res) => {
        const body = STATUS_CODES[426] ?? "Upgrade Required";
        res.writeHead(426, { "Content-Length": Buffer.byteLength(body), "Content-Type": "text/plain" });
        res.end(body);
      });
      const tabWss = new WebSocketServer({ noServer: true, maxPayload: MAX_RESULT_BYTES });
      const peerWss = new WebSocketServer({ noServer: true, maxPayload: MAX_PEER_CALL_BYTES });
      // Route at upgrade time so a peer socket never gets the tab's larger maxPayload.
      server.on("upgrade", (req: IncomingMessage, socket, head) => {
        const kind = classifyHandshake(req.headers.origin, req.socket.remoteAddress, this.opts.allowedOrigins);
        const target = kind === "peer" ? peerWss : tabWss;
        target.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, req, kind));
      });
      const discard = () => {
        server.on("error", () => {}); // a never-listening server: nothing left to report
        tabWss.close();
        peerWss.close();
        server.close();
      };
      const onError = (err: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        discard();
        resolve(err.code === "EADDRINUSE" ? "in-use" : err);
      };
      const onListening = () => {
        server.off("error", onError);
        if (this.stopped) {
          discard();
          resolve(new Error("stopped"));
          return;
        }
        this.httpServer = server;
        this.tabWss = tabWss;
        this.peerWss = peerWss;
        server.on("error", (err) => this.opts.log(`WebSocket server error: ${err.message}`));
        resolve(true);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      try {
        server.listen(this.opts.port, "127.0.0.1");
      } catch (err) {
        // e.g. an out-of-range EASYSCHEMATIC_MCP_PORT throws synchronously.
        server.off("error", onError);
        server.off("listening", onListening);
        tabWss.close();
        peerWss.close();
        resolve(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // -------------------------------------------------------------------------
  // Owner side: incoming sockets.
  // -------------------------------------------------------------------------
  private onConnection(ws: WebSocket, req: IncomingMessage, kind: "tab" | "peer" | "reject"): void {
    if (kind === "peer") {
      this.onPeerConnection(ws);
      return;
    }
    if (kind === "reject") {
      this.opts.log(`Rejected connection from disallowed origin: ${req.headers.origin ?? "(none)"}`);
      ws.close();
      return;
    }
    let helloed = false;

    ws.on("message", (data: WebSocket.RawData) => {
      const msg = parse(data);
      if (!msg) return;

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
          this.rejectAll(this.pending, new Error("Connection superseded by a new tab."));
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
        this.rejectAll(this.pending, new Error("EasySchematic disconnected."));
        this.opts.log("EasySchematic disconnected.");
      }
    });
    ws.on("error", () => {
      /* surfaced via the close handler */
    });
  }

  /**
   * A no-Origin loopback socket: only ever a peer instance, never a tab. It must
   * send a valid `peer_hello` (token, constant-time compared) as its first message
   * within PEER_HELLO_TIMEOUT_MS; afterwards it may only send `peer_call`s, whose
   * results go back on this socket alone, keyed by the peer's own call id.
   */
  private onPeerConnection(ws: WebSocket): void {
    ws.on("error", () => {
      /* surfaced via the close handler */
    });
    if (this.peerSockets.size >= MAX_PEERS) {
      this.opts.log("Rejected peer connection: too many peer instances connected.");
      ws.close(1013, "Too many peers");
      return;
    }
    this.peerSockets.add(ws);
    let authed = false;
    const inflight = new Set<string>();
    const helloTimer = setTimeout(() => {
      if (!authed) ws.terminate();
    }, PEER_HELLO_TIMEOUT_MS);

    const sendIfOpen = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    ws.on("message", (data: WebSocket.RawData) => {
      const size = rawSize(data);
      if (!authed) {
        if (size > MAX_PEER_HELLO_BYTES) {
          ws.terminate();
          return;
        }
        const msg = parse(data);
        if (!msg || msg.type !== "peer_hello") {
          ws.close();
          return;
        }
        if (msg.protocolVersion !== PROTOCOL_VERSION || msg.peerProtocol !== PEER_PROTOCOL_VERSION) {
          sendIfOpen({ type: "peer_hello_ack", ok: false, reason: "version mismatch — rebuild both MCP server instances from the same version" });
          ws.close();
          return;
        }
        if (!tokensMatch(typeof msg.token === "string" ? msg.token : "", this.opts.token)) {
          // A mismatched instance retries with backoff — don't log every attempt.
          const now = Date.now();
          if (now - this.lastPeerRejectLog > 60_000) {
            this.lastPeerRejectLog = now;
            this.opts.log("Rejected another EasySchematic MCP server instance: invalid pairing token (it keeps retrying; logged at most once a minute).");
          }
          sendIfOpen({ type: "peer_hello_ack", ok: false, reason: "invalid pairing token" });
          ws.close();
          return;
        }
        authed = true;
        clearTimeout(helloTimer);
        sendIfOpen({ type: "peer_hello_ack", ok: true });
        this.opts.log("Another EasySchematic MCP server instance connected as a relay peer.");
        return;
      }

      if (size > MAX_PEER_CALL_BYTES) {
        ws.close(1009, "Message too big");
        return;
      }
      const msg = parse(data);
      if (!msg || msg.type !== "peer_call") return;
      const callId = msg.callId;
      if (typeof callId !== "string" || !CALL_ID_RE.test(callId)) return;
      const fail = (error: string) => sendIfOpen({ type: "peer_result", callId, ok: false, error });
      if (typeof msg.command !== "string" || !COMMAND_RE.test(msg.command)) return fail("Invalid command.");
      const params = msg.params ?? {};
      if (typeof params !== "object" || params === null || Array.isArray(params)) return fail("Invalid params.");
      if (inflight.has(callId)) return fail("Duplicate call id.");
      if (inflight.size >= MAX_INFLIGHT_PER_PEER) return fail("Too many relayed calls in flight — try again shortly.");
      inflight.add(callId);
      this.callTab(msg.command, params as Record<string, unknown>).then(
        (result) => {
          if (!inflight.delete(callId)) return; // socket closed meanwhile
          const payload = JSON.stringify({ type: "peer_result", callId, ok: true, result });
          if (Buffer.byteLength(payload) > MAX_RESULT_BYTES + RELAY_ENVELOPE_BYTES) {
            fail("Result too large to relay between MCP server instances.");
          } else if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        },
        (err: unknown) => {
          if (!inflight.delete(callId)) return;
          fail(err instanceof Error ? err.message : String(err));
        },
      );
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      this.peerSockets.delete(ws);
      inflight.clear();
      if (authed) this.opts.log("A relay peer instance disconnected.");
    });
  }

  // -------------------------------------------------------------------------
  // Peer side: dial the owner, authenticate, relay.
  // -------------------------------------------------------------------------
  private connectAsPeer(): Promise<PeerConnectResult> {
    const port = this.opts.port;
    return new Promise((resolve) => {
      let settled = false;
      // No `origin` option → no Origin header: that is what marks us as a peer
      // (browsers always send one), so the owner routes us to the peer path.
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
        handshakeTimeout: PEER_HELLO_TIMEOUT_MS,
        maxPayload: MAX_RESULT_BYTES + RELAY_ENVELOPE_BYTES,
        perMessageDeflate: false,
      });
      const finish = (r: PeerConnectResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(ackTimer);
        ws.removeAllListeners("message");
        ws.removeAllListeners("close");
        ws.removeAllListeners("unexpected-response");
        if (!r.ok) {
          ws.removeAllListeners("open");
          ws.terminate();
        }
        resolve(r);
      };
      const notBridge = "it is not an EasySchematic MCP server (or is an older version without multi-instance support)";
      const ackTimer = setTimeout(() => finish({ ok: false, reason: `${notBridge} — no reply to the relay handshake` }), PEER_HELLO_TIMEOUT_MS + 1000);
      ws.on("error", (err) => finish({ ok: false, reason: `could not connect to it as a relay (${err.message})` }));
      ws.on("unexpected-response", (_req, res) =>
        finish({ ok: false, reason: `${notBridge} — it answered HTTP ${res.statusCode}` }),
      );
      ws.on("open", () => {
        ws.send(
          JSON.stringify({ type: "peer_hello", token: this.opts.token, protocolVersion: PROTOCOL_VERSION, peerProtocol: PEER_PROTOCOL_VERSION }),
        );
      });
      ws.on("message", (data) => {
        const msg = parse(data);
        if (!msg || msg.type !== "peer_hello_ack") {
          finish({ ok: false, reason: `${notBridge} — unexpected reply to the relay handshake` });
          return;
        }
        if (msg.ok === true) {
          finish({ ok: true, ws });
          return;
        }
        // Never splice the port holder's text into our errors (it lands in the
        // agent's context) — map the known reasons to fixed strings.
        finish({ ok: false, reason: refusalReason(msg.reason) });
      });
      ws.on("close", (code) =>
        finish({
          ok: false,
          reason:
            code === 1013
              ? "another EasySchematic MCP server instance there already has too many relay instances connected — close some of the other Claude sessions"
              : `${notBridge} — it closed the relay handshake`,
        }),
      );
    });
  }

  private onOwnerMessage(data: WebSocket.RawData): void {
    const msg = parse(data);
    if (!msg || msg.type !== "peer_result" || typeof msg.callId !== "string") return;
    const p = this.peerPending.get(msg.callId);
    if (!p) return;
    this.peerPending.delete(msg.callId);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(String(msg.error || "Command failed.")));
  }

  private callViaOwner(command: string, params: Record<string, unknown>): Promise<unknown> {
    const socket = this.ownerSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(this.notReadyMessage()));
    }
    if (this.peerPending.size >= MAX_PENDING_PEER) {
      return Promise.reject(new Error("Too many EasySchematic calls in flight — try again shortly."));
    }
    const callId = `p${++this.peerSeq}`;
    const payload = JSON.stringify({ type: "peer_call", callId, command, params });
    if (Buffer.byteLength(payload) > MAX_PEER_CALL_BYTES) {
      return Promise.reject(new Error("Tool arguments are too large to relay between MCP server instances."));
    }
    // The owner applies the normal per-call timeout against the tab; ours is a
    // little longer so its precise error normally wins.
    const timeoutMs = (this.opts.requestTimeoutMs ?? 15000) + 2000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.peerPending.delete(callId);
        reject(new Error(`Timed out waiting for EasySchematic to handle "${command}" (relayed through the instance on port ${this.opts.port}).`));
      }, timeoutMs);
      this.peerPending.set(callId, { resolve, reject, timer });
      socket.send(payload);
    });
  }

  // -------------------------------------------------------------------------
  // Shared.
  // -------------------------------------------------------------------------
  private rejectAll(map: Map<string, Pending>, err: Error): void {
    for (const p of map.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    map.clear();
  }

  private notReadyMessage(): string {
    if (this._mode === "unavailable") {
      return `This EasySchematic MCP server instance can't reach the editor: ${this.unavailableReason}. Stop the other process or set EASYSCHEMATIC_MCP_PORT (and the Server port in Preferences → AI (Beta)) to a free port.`;
    }
    if (this._mode === "stopped") return "The EasySchematic MCP server is shutting down.";
    return `This EasySchematic MCP server instance is still connecting to port ${this.opts.port} — try again in a moment.`;
  }

  /** Send a command to the bound tab — directly if we own the port, otherwise
   *  relayed through the instance that does — and await its correlated response. */
  call(command: string, params: Record<string, unknown>): Promise<unknown> {
    if (this._mode === "owner") return this.callTab(command, params);
    if (this._mode === "peer") return this.callViaOwner(command, params);
    return Promise.reject(new Error(this.notReadyMessage()));
  }

  private callTab(command: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connected || !this.active) {
      return Promise.reject(
        new Error("No EasySchematic app is connected. Open the editor and turn on AI Assistant (MCP) in Preferences."),
      );
    }
    if (this.pending.size >= MAX_PENDING_TAB) {
      return Promise.reject(new Error("Too many EasySchematic calls in flight — try again shortly."));
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
