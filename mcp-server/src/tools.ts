/**
 * MCP tool catalog: the Ship-1 "working core" tools, the Ship-2 "editing & layout"
 * tools (move_device, delete_connection), the Ship-3 "batch" tools (add_devices,
 * connect_devices_batch), the Ship-4 "rooms" tools (create_room,
 * place_device_in_room), the Ship-5 "annotations" tool (add_note), and the Ship-6
 * "slots / modular chassis" tools (list_slot_cards, install_card, remove_card). Each
 * entry is a plain JSON-Schema tool definition; the call
 * is relayed verbatim to the editor over the bridge, which validates and executes it
 * against the live store.
 *
 * In AV terms the user sees Device / Connection / Port; these tool names and the
 * docs use the same AV language.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const noArgs = { type: "object", properties: {}, additionalProperties: false };

export const TOOLS: ToolDef[] = [
  {
    name: "get_schematic",
    description:
      "Get a summary of the current schematic: its name, every device (with ports) and every connection. Call this first to see what already exists.",
    inputSchema: noArgs,
  },
  {
    name: "list_devices",
    description: "List the devices on the canvas with their ids, labels, type, manufacturer and position.",
    inputSchema: noArgs,
  },
  {
    name: "get_device",
    description: "Get one device's details, including its ports (id, label, direction, signal type).",
    inputSchema: {
      type: "object",
      properties: { nodeId: { type: "string", description: "The device id." } },
      required: ["nodeId"],
      additionalProperties: false,
    },
  },
  {
    name: "search_templates",
    description:
      "Search the device template library (community library + this schematic's custom devices) by name, type or manufacturer. Returns templateId values to pass to add_device.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search, e.g. 'crestron switcher' or 'display'." },
        limit: { type: "number", description: "Max results (default 25)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "add_device",
    description:
      "Add a device to the canvas from a template. Use search_templates to get a templateId. Returns the new device's id.",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "Template id from search_templates." },
        label: { type: "string", description: "Optional custom name; defaults to the template name." },
        x: { type: "number", description: "Optional canvas X position." },
        y: { type: "number", description: "Optional canvas Y position." },
      },
      required: ["templateId"],
      additionalProperties: false,
    },
  },
  {
    name: "set_device_property",
    description:
      "Set safe properties on a device (e.g. label, shortName, manufacturer, modelNumber, note, serialNumber, unitCost, power figures). Structural fields like ports and slots are not editable in this Beta and are rejected.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "The device id." },
        properties: {
          type: "object",
          description: "Map of field name to new value (string, number or boolean).",
        },
      },
      required: ["nodeId", "properties"],
      additionalProperties: false,
    },
  },
  {
    name: "connect_devices",
    description:
      "Create a connection from one device's port to another's. For two-sided ports give the face: bidirectional ports use 'in'/'out'; passthrough ports use 'rear'/'front'. Plain ports need no face. The connection is validated before it is made.",
    inputSchema: {
      type: "object",
      properties: {
        sourceNodeId: { type: "string" },
        sourcePortId: { type: "string" },
        sourceFace: { type: "string", enum: ["in", "out", "rear", "front"], description: "Required only for two-sided source ports." },
        targetNodeId: { type: "string" },
        targetPortId: { type: "string" },
        targetFace: { type: "string", enum: ["in", "out", "rear", "front"], description: "Required only for two-sided target ports." },
      },
      required: ["sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_device",
    description: "Delete a device (and its connections) from the canvas.",
    inputSchema: {
      type: "object",
      properties: { nodeId: { type: "string", description: "The device id." } },
      required: ["nodeId"],
      additionalProperties: false,
    },
  },
  {
    name: "move_device",
    description:
      "Reposition a device on the canvas. x and y are in the same coordinate space get_device/get_schematic report for that device — canvas coordinates for a top-level device, or coordinates relative to its room/rack when the device has a parentId. This moves the device within its current container; it does not move a device into or out of a room or rack.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "The device id." },
        x: { type: "number", description: "New X position." },
        y: { type: "number", description: "New Y position." },
      },
      required: ["nodeId", "x", "y"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_connection",
    description:
      "Remove a single connection from the canvas by its id (the connection ids are returned by get_schematic and connect_devices). Stubbed connections cannot be removed this way yet.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: { type: "string", description: "The connection (edge) id to remove." },
      },
      required: ["connectionId"],
      additionalProperties: false,
    },
  },
  {
    name: "add_devices",
    description:
      "Add several devices to the canvas in one call — use this instead of repeated add_device calls when placing many devices. Best-effort: each device is added independently, and the result lists per-device success or failure (with the new device id) so you can retry only the ones that failed.",
    inputSchema: {
      type: "object",
      properties: {
        devices: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          description: "The devices to add.",
          items: {
            type: "object",
            properties: {
              templateId: { type: "string", description: "Template id from search_templates." },
              label: { type: "string", description: "Optional custom name; defaults to the template name." },
              x: { type: "number", description: "Optional canvas X position." },
              y: { type: "number", description: "Optional canvas Y position." },
            },
            required: ["templateId"],
            additionalProperties: false,
          },
        },
      },
      required: ["devices"],
      additionalProperties: false,
    },
  },
  {
    name: "connect_devices_batch",
    description:
      "Make several connections in one call — use this instead of repeated connect_devices calls. Best-effort: each connection is attempted independently and the result lists per-connection success or failure. Connections are applied in array order, so an earlier one can affect a later one (for example, using up a single-link port). For two-sided ports give the face: bidirectional ports use 'in'/'out'; passthrough ports use 'rear'/'front'.",
    inputSchema: {
      type: "object",
      properties: {
        connections: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          description: "The connections to make.",
          items: {
            type: "object",
            properties: {
              sourceNodeId: { type: "string" },
              sourcePortId: { type: "string" },
              sourceFace: { type: "string", enum: ["in", "out", "rear", "front"], description: "Required only for two-sided source ports." },
              targetNodeId: { type: "string" },
              targetPortId: { type: "string" },
              targetFace: { type: "string", enum: ["in", "out", "rear", "front"], description: "Required only for two-sided target ports." },
            },
            required: ["sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId"],
            additionalProperties: false,
          },
        },
      },
      required: ["connections"],
      additionalProperties: false,
    },
  },
  {
    name: "create_room",
    description:
      "Create a room — a labelled container on the canvas that devices can be placed inside (use place_device_in_room). Returns the new room's id. width/height are optional (default 400x300; minimums 200x150). Any existing devices already inside the new room's bounds are absorbed into it and listed in absorbedDeviceIds (their coordinates become relative to the room, so re-read them before reusing old positions).",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "The room's name, shown on the canvas." },
        x: { type: "number", description: "Room top-left X position on the canvas." },
        y: { type: "number", description: "Room top-left Y position on the canvas." },
        width: { type: "number", description: "Optional room width (minimum 200; default 400)." },
        height: { type: "number", description: "Optional room height (minimum 150; default 300)." },
      },
      required: ["label", "x", "y"],
      additionalProperties: false,
    },
  },
  {
    name: "place_device_in_room",
    description:
      "Place a device inside a room. x and y are the device's position relative to the room's top-left corner (default 16,16). The device's center must land inside the room or the call fails without changing anything, so a device is never reported as placed when it isn't. To reposition a device that is already in a room, use move_device instead.",
    inputSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "The device id." },
        roomId: { type: "string", description: "The room id (from get_schematic or create_room)." },
        x: { type: "number", description: "Optional X relative to the room's top-left corner (default 16)." },
        y: { type: "number", description: "Optional Y relative to the room's top-left corner (default 16)." },
      },
      required: ["deviceId", "roomId"],
      additionalProperties: false,
    },
  },
  {
    name: "add_note",
    description:
      "Add a text note (a sticky-note card) to the canvas to annotate or explain the schematic. The text is shown literally (it is escaped, and line breaks are kept). Returns the new note's id. Notes can't yet be listed, edited, or deleted through the assistant — do that in the editor.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The note's text. Shown literally; newlines become line breaks." },
        x: { type: "number", description: "Note top-left X position on the canvas." },
        y: { type: "number", description: "Note top-left Y position on the canvas." },
      },
      required: ["text", "x", "y"],
      additionalProperties: false,
    },
  },
  {
    name: "list_slot_cards",
    description:
      "List the expansion cards that fit a given slot on a modular device (chassis). A device's slots come from get_device. Returns the card templateId values to pass to install_card. If the full community library hasn't been loaded yet this session, call search_templates once first so live-library cards are included.",
    inputSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "The modular device (chassis) id." },
        slotId: { type: "string", description: "The slot id from get_device's slots." },
      },
      required: ["deviceId", "slotId"],
      additionalProperties: false,
    },
  },
  {
    name: "install_card",
    description:
      "Install an expansion card into an empty slot on a modular device. Use list_slot_cards to get a compatible card templateId. The card's slot family must match the slot's, or the call is refused. If the slot already holds a card, remove it first with remove_card (installing never silently replaces a card). Returns the installed card and the ids of the ports it added.",
    inputSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "The modular device (chassis) id." },
        slotId: { type: "string", description: "The empty slot's id from get_device's slots." },
        cardTemplateId: { type: "string", description: "A card templateId from list_slot_cards." },
      },
      required: ["deviceId", "slotId", "cardTemplateId"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_card",
    description:
      "Remove the card from a filled slot on a modular device, emptying the slot. This also removes the card's ports and any connections on them. Fails if the slot is already empty.",
    inputSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "The modular device (chassis) id." },
        slotId: { type: "string", description: "The filled slot's id from get_device's slots." },
      },
      required: ["deviceId", "slotId"],
      additionalProperties: false,
    },
  },
];
