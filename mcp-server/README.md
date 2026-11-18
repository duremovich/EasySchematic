# EasySchematic MCP server (Beta)

A small local program that lets an AI assistant (Claude) **read and edit a schematic
live** in your running EasySchematic editor. It speaks [MCP](https://modelcontextprotocol.io)
to the assistant over stdio, and connects to the editor over a localhost WebSocket.

> Beta — supported actions: read the schematic, search the device library, add and
> delete devices, set safe device properties, connect and disconnect devices (refusals
> say why; exclusive-port conflicts come back as `warnings`), move a
> device, group devices into rooms, add/edit/delete text notes, fit expansion cards
> into modular-chassis slots, and build rack elevations (create racks, mount devices).
> Adding devices, making connections, installing cards and mounting devices in racks
> each have a batch version for doing many at once.

## How it fits together

```
Claude (MCP client)  ──stdio──▶  easyschematic-mcp  ──ws://127.0.0.1──▶  EasySchematic tab
```

The server never listens on the public network — the WebSocket binds to
`127.0.0.1` only — and a tab must present a **pairing token** (and an allowed
Origin) before any command runs.

## Build

This package is self-contained (it is **not** built by the main app's
`npm run build` or by CI). Build it once:

```bash
cd mcp-server
npm install
npm run build        # also regenerates the shared protocol file from ../src/mcp
```

## Run

```bash
node mcp-server/dist/index.js
```

On startup it prints (to stderr) a **pairing token** and the port it is listening
on. If the port is already taken, it says so instead (see *More than one instance*). Configure with environment variables if needed:

| Variable | Default | Purpose |
|----------|---------|---------|
| `EASYSCHEMATIC_MCP_PORT` | `8765` | WebSocket port (must match the app's setting). |
| `EASYSCHEMATIC_MCP_TOKEN` | random | Fixed pairing token (otherwise a new one each run). |
| `EASYSCHEMATIC_MCP_ORIGINS` | — | Comma-separated extra allowed Origins for self-hosted editors on a non-localhost domain. |

### More than one instance

Some clients (Claude desktop, for one) start the server twice, and several Claude
Code sessions each start their own. Only one process can hold the port. The first
one to start owns it and hosts the editor connection. Any later instance with the
**same pairing token** connects to the owner over localhost and relays its tool
calls through it, so tools work from every instance. If the owner exits, a relaying
instance takes the port over and prints its pairing token again. The editor
reconnects on its own. Every instance exits when its MCP client closes its stdin,
so it doesn't leave orphaned processes behind.

So that the instances share a token, set a fixed `EASYSCHEMATIC_MCP_TOKEN` when
your client may start more than one. If the port is held by something it can't
relay through (an instance with a different token, an older version of this
server, or an unrelated program), that instance's tool calls fail with an error
that says port N is held by another process and why. It does not report "no app
is connected". It keeps retrying in the background.

Relaying instances are accepted only from `127.0.0.1`, only without an Origin
header (browsers always send one, so a web page can't pose as an instance), and
only after the pairing token matches. They can never bind as the editor tab.

## Connect the editor

1. Open EasySchematic and go to **Preferences → AI (Beta)**.
2. Paste the **pairing token** the server printed.
3. Make sure the **port** matches (default 8765).
4. Turn on **“Let Claude read & edit this schematic.”** The status should read *Connected*.

Only one tab is bound at a time — the most recent tab you enable claims the
connection; an earlier tab shows *Not connected*.

## Register with Claude Code

Add the server to your MCP config so Claude can attach to it, e.g.:

```bash
claude mcp add easyschematic -- node /absolute/path/to/EasySchematic/mcp-server/dist/index.js
```

If your client may start more than one instance (see *More than one instance*),
give them all the same token when you register:

```bash
claude mcp add --env EASYSCHEMATIC_MCP_TOKEN=pick-a-long-random-string easyschematic -- node /absolute/path/to/EasySchematic/mcp-server/dist/index.js
```

Then ask Claude things like *“search for a 4K display, add it, and connect the
laptop's HDMI output to it.”*

## Playbooks & instructions

The server also ships **companion guidance** so any paired client (Claude Desktop,
claude.ai, Claude Code) drives the schematic the right way without you spelling out
each step:

- **Server instructions** — a short always-on overview (call `get_schematic` first,
  `search_templates` before adding, prefer the batch tools, re-read `get_device`
  after structural changes, use AV terms with the user) that clients surface at
  connect time.
- **Prompts** — three named, step-by-step playbooks the user can pick from the
  client's prompt menu, each taking an optional plain-words argument:

  | Prompt | Argument | What it walks through |
  |--------|----------|------------------------|
  | `build-schematic` | `brief` | Lay out and wire a system: `get_schematic` → `search_templates` → `add_devices` → rooms → `connect_devices_batch`. |
  | `rack-elevation` | `rack` | Build and populate a rack: `list_racks` → `create_rack` → `place_device_in_rack_batch`. |
  | `modular-chassis` | `chassis` | Fit cards into a chassis: `get_device` → `list_slot_cards` → `install_card_batch`. |

The text lives in `src/prompts.ts`.

## Develop

```bash
npm run typecheck   # regenerate protocol + tsc --noEmit
npm test            # build + node --test (origin/token, multi-instance relay tests)
```

The wire protocol is defined once in `../src/mcp/protocol.ts` and copied here as
`src/protocol.generated.ts` by `scripts/sync-protocol.mjs` on every build, so the
two sides can never drift.
