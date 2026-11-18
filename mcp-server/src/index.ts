#!/usr/bin/env node
/**
 * EasySchematic MCP server (Beta).
 *
 * Speaks MCP to Claude over stdio, and hosts a localhost WebSocket the running
 * editor connects to. Tool calls from Claude are relayed to the bound tab, which
 * executes them against the live schematic and replies.
 *
 * IMPORTANT: stdout is reserved for the MCP stdio protocol — all human-facing
 * logging goes to stderr.
 */
import { randomBytes } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AppBridge } from "./bridge.js";
import { TOOLS } from "./tools.js";
import { PROMPTS, getPrompt, SERVER_INSTRUCTIONS } from "./prompts.js";
import { DEFAULT_BRIDGE_PORT } from "./protocol.generated.js";

const log = (msg: string) => process.stderr.write(`[easyschematic-mcp] ${msg}\n`);

const port = Number(process.env.EASYSCHEMATIC_MCP_PORT) || DEFAULT_BRIDGE_PORT;
const token = process.env.EASYSCHEMATIC_MCP_TOKEN || randomBytes(16).toString("hex");
const allowedOrigins = (process.env.EASYSCHEMATIC_MCP_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function logOwnerBanner(takeover: boolean): void {
  log("");
  log(`WebSocket bridge listening on ws://127.0.0.1:${port}`);
  log(`Pairing token: ${token}`);
  if (takeover) {
    log("This instance took over the port from one that exited. If the editor was paired with a different token,");
    log("paste this one into EasySchematic → Preferences → AI (Beta).");
  } else {
    log("Paste this token into EasySchematic → Preferences → AI (Beta), then turn the toggle on.");
  }
  log("");
}

// The owner banner (with the token) is printed every time this instance becomes the
// port owner — including a later takeover — never before the bind has succeeded.
const bridge = new AppBridge({ port, token, allowedOrigins, log, onOwner: logOwnerBanner });
// Not awaited here, so stdio comes up immediately; tool calls wait for it below.
const started = bridge.start().then((mode) => {
  if (mode === "owner") return; // banner already printed via onOwner
  log("");
  if (mode === "peer") {
    log(`Port ${port} is already held by another EasySchematic MCP server instance with the same pairing token.`);
    log("This instance relays its tool calls through that one; the editor pairs with that token as usual.");
  } else {
    log(`WebSocket bridge NOT listening — ${bridge.unavailableDetail}.`);
    log("Tool calls from this instance will fail with that reason until the port frees up (retrying in the background).");
  }
  log("");
});

// Exit when the MCP client goes away (stdin EOF/close — e.g. Claude desktop quit
// or crashed). Without this, a peer (open relay socket) or an unavailable instance
// (retry timer) would live on as an orphan with no client, occupy a peer slot, and
// could even win a later takeover of the port.
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => process.exit(0), 2000).unref(); // backstop if a close hangs
  void bridge.stop().finally(() => process.exit(0));
}
process.stdin.once("end", shutdown);
process.stdin.once("close", shutdown);

const server = new Server(
  { name: "easyschematic", version: "0.1.0" },
  { capabilities: { tools: {}, prompts: {} }, instructions: SERVER_INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (req) =>
  getPrompt(req.params.name, req.params.arguments),
);

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    await started;
    const result = await bridge.call(name, (args ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
log("MCP server ready (stdio). Waiting for the editor to connect…");
