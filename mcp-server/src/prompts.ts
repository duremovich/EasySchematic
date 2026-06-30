/**
 * Companion guidance for the EasySchematic MCP server.
 *
 * Two things ship here, both available to ANY paired MCP client (Claude Desktop,
 * claude.ai, Claude Code) — not just Claude Code:
 *   - SERVER_INSTRUCTIONS: a short always-on overview surfaced at initialize time.
 *   - PROMPTS / getPrompt: three named, parameterized playbooks for the common
 *     multi-step jobs, so the assistant follows the right tool order instead of
 *     rediscovering it each time.
 *
 * The playbooks reference the real tool names and stay inside their documented
 * contracts (see tools.ts). User-facing text uses AV terms: Device, Connection, Port.
 */
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { GetPromptResult, Prompt } from "@modelcontextprotocol/sdk/types.js";

export const SERVER_INSTRUCTIONS = `EasySchematic lets you read and edit an AV signal-flow schematic live in the user's editor. The boxes are Devices, the links between their Ports are Connections — always use those AV terms with the user (never node/edge/handle).

Golden rules:
- Call get_schematic first to see what already exists before you change anything.
- Use search_templates to get a templateId before adding a Device — never invent ids.
- Prefer the batch tools (add_devices, connect_devices_batch, install_card_batch, place_device_in_rack_batch) over repeated single calls; each reports per-item success so you can retry only what failed.
- Re-read get_device after a structural change (e.g. installing a card) before wiring the new Ports.

Three prompts hold step-by-step playbooks: "build-schematic" (lay out and wire a system), "rack-elevation" (build and populate a rack), and "modular-chassis" (fit cards into a chassis).`;

/** Definitions returned by the prompts/list handler. */
export const PROMPTS: Prompt[] = [
  {
    name: "build-schematic",
    description: "Playbook for laying out and wiring an AV system on the schematic canvas (get_schematic → search_templates → add_devices → rooms → connect_devices_batch).",
    arguments: [
      { name: "brief", description: "What to build, in plain words (e.g. 'a huddle room: laptop to a 4K display via a switcher').", required: false },
    ],
  },
  {
    name: "rack-elevation",
    description: "Playbook for creating and populating an equipment rack elevation (list_racks → create_rack → place_device_in_rack_batch).",
    arguments: [
      { name: "rack", description: "What rack to build and what to mount in it (e.g. 'a 24U rack with the amp, switcher and matrix').", required: false },
    ],
  },
  {
    name: "modular-chassis",
    description: "Playbook for fitting expansion cards into a modular device's slots (get_device → list_slot_cards → install_card_batch).",
    arguments: [
      { name: "chassis", description: "Which chassis to configure and which cards to fit (e.g. 'fill the DM matrix with 4 HDMI input cards').", required: false },
    ],
  },
];

const BUILD_SCHEMATIC = `You are building or extending an AV signal-flow schematic in EasySchematic through the live MCP bridge. Work in this order:

1. Call get_schematic FIRST to see the Devices, Connections, rooms and notes that already exist. Never assume an empty canvas.
2. Find each Device you need with search_templates and use the templateId it returns — never invent a templateId.
3. Add Devices with add_devices (the batch tool), not repeated add_device calls. Lay them out left-to-right by signal flow: sources and inputs on the left, switchers/processors in the middle, displays and outputs on the right.
4. If the brief names rooms or areas, create them with create_room BEFORE placing Devices, then place Devices with place_device_in_room. Creating a room on top of Devices that already exist absorbs them and makes their coordinates room-relative — if that happens, call get_schematic again before reusing any old position.
5. Make Connections with connect_devices_batch. For two-sided Ports give the face: bidirectional Ports use "in"/"out", passthrough Ports use "rear"/"front"; plain Ports need no face. Connections are validated, so read the per-item results and retry only the failures.
6. After any structural change that adds Ports (e.g. installing a card) re-read get_device before wiring the new Ports.
7. In anything you say to the user, use the AV terms Device, Connection and Port.`;

const RACK_ELEVATION = `You are creating or populating an equipment rack elevation in EasySchematic through the live MCP bridge. Rack elevations are a separate view from the schematic canvas. Work in this order:

1. Call list_racks FIRST to see existing rack-elevation pages, racks and placements, and to get the pageId / rackId / placementId values the other rack tools need.
2. Create a rack with create_rack. Omit pageId to start a new rack-elevation page; pass an existing pageId to add the rack to one. Height (U) and depth (mm) are clamped to the editor's ranges.
3. A Device must already exist on the schematic before it can be mounted — add it there first if needed. Mount existing Devices with place_device_in_rack_batch rather than one at a time.
4. uPosition is 1-based from the bottom of the rack. Batch placements apply in array order and consume the U span / half-rack side they land on, so order them so they do not overlap, and put heavy or deep gear low.
5. A Device's height in U is inferred from its dimensions; half-rack gear is auto-placed on a free side, and gear too small to rack-mount is put on an auto-created 1U shelf (the response carries that shelfId).`;

const MODULAR_CHASSIS = `You are configuring a modular Device — a chassis with card slots — in EasySchematic through the live MCP bridge. Work in this order:

1. Call get_device on the chassis to read its slots (each slot has an id and a slot family).
2. For an empty slot, call list_slot_cards(deviceId, slotId) to get compatible card templateIds. If the full community library has not loaded this session, call search_templates once first so live-library cards are included.
3. A card's slot family must match the slot's, or the install is refused. A filled slot is never silently overwritten — call remove_card first if you mean to replace one.
4. Install with install_card_batch rather than one card at a time. Items apply in array order, so an earlier install that opens sub-slots can make a later install into one of them valid.
5. Installing a card adds Ports to the chassis. Re-read get_device after installs to pick up the new Port ids before you connect them.`;

const PLAYBOOKS: Record<string, { body: string; argName: string; noArgFallback: string }> = {
  "build-schematic": {
    body: BUILD_SCHEMATIC,
    argName: "brief",
    noArgFallback: "No brief was supplied — summarise the current schematic with get_schematic and ask the user what they want to build or change.",
  },
  "rack-elevation": {
    body: RACK_ELEVATION,
    argName: "rack",
    noArgFallback: "No rack was described — call list_racks and ask the user which rack to build or what to mount.",
  },
  "modular-chassis": {
    body: MODULAR_CHASSIS,
    argName: "chassis",
    noArgFallback: "No chassis was named — list the modular Devices with get_schematic / get_device and ask the user which one to configure.",
  },
};

/**
 * Resolve a named playbook into prompt messages. The user's free-text argument, if
 * given, is appended as a second line so the assistant has the concrete task in hand.
 * Throws an MCP InvalidParams error for an unknown prompt name.
 */
export function getPrompt(name: string, args?: Record<string, string>): GetPromptResult {
  const playbook = PLAYBOOKS[name];
  if (!playbook) {
    throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
  }
  const detail = args?.[playbook.argName]?.trim();
  const tail = detail ? `The user's request: ${detail}` : playbook.noArgFallback;
  return {
    description: PROMPTS.find((p) => p.name === name)?.description,
    messages: [
      {
        role: "user",
        content: { type: "text", text: `${playbook.body}\n\n${tail}` },
      },
    ],
  };
}
