/**
 * CSV Cable Schedule → Schematic import.
 * Pure functions — no React or store dependencies.
 */

import type { SignalType, Port, DeviceTemplate, SchematicNode, DeviceNode, ConnectionEdge } from "./types";
import { normalizeHeaderColor } from "./deviceHeaderColor";
import { scoreTemplate } from "./templateSearch";
import { allSignals, defaultConnector, signalAliases, signalCssColor, signalLabel } from "./typeRegistry";

// ---------- Types ----------

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
}

export interface ColumnMapping {
  sourceDevice: number; // column index, -1 = unmapped
  sourcePort: number;
  destDevice: number;
  destPort: number;
  signalType: number;
  sourceRoom: number;
  destRoom: number;
}

export interface ParsedConnection {
  sourceDevice: string;
  sourcePort: string;
  destDevice: string;
  destPort: string;
  signalType: string;
  sourceRoom: string;
  destRoom: string;
}

export interface DeviceMatch {
  csvName: string;
  template: DeviceTemplate | null; // null = generic
  score: number;
  inferredPorts: Port[]; // used when template is null
}

const GRID_SIZE = 20;

// ---------- CSV Parsing ----------

/**
 * State-machine CSV parser. Handles quoted fields, escaped quotes,
 * commas in quotes, BOM, auto-detects delimiter (tab vs comma).
 */
export function parseCsv(text: string): CsvParseResult {
  // Strip BOM
  let t = text.startsWith("\uFEFF") ? text.slice(1) : text;
  // Normalize line endings
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Auto-detect delimiter. Probe the first few lines, not just the first one —
  // report exports open with a title/date preamble that carries no delimiters.
  let tabCount = 0;
  let commaCount = 0;
  for (const line of t.split("\n").slice(0, 5)) {
    tabCount = Math.max(tabCount, (line.match(/\t/g) ?? []).length);
    commaCount = Math.max(commaCount, (line.match(/,/g) ?? []).length);
  }
  const delim = tabCount > commaCount ? "\t" : ",";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuote) {
      if (c === '"') {
        if (i + 1 < t.length && t[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === delim) {
        currentRow.push(field.trim());
        field = "";
      } else if (c === "\n") {
        currentRow.push(field.trim());
        if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);
        currentRow = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  // Flush last row
  currentRow.push(field.trim());
  if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);

  if (rows.length === 0) return { headers: [], rows: [] };

  // The first row is not always the header row: our own cable-schedule export
  // (and many vendor schedules) lead with title/date lines. Take the first row
  // that maps both device columns; fall back to row 0 for plain files.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const m = detectColumns(rows[i]);
    if (m.sourceDevice >= 0 && m.destDevice >= 0) {
      headerIdx = i;
      break;
    }
  }
  return { headers: rows[headerIdx], rows: rows.slice(headerIdx + 1) };
}

// ---------- Column Detection ----------

const COLUMN_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  sourceDevice: ["source device", "source", "from device", "from", "send", "src device", "src", "origin"],
  sourcePort: ["source port", "src port", "output", "out port", "from port", "src output"],
  destDevice: ["dest device", "destination device", "destination", "dest", "to device", "to", "receive", "target device", "target", "tgt device", "tgt"],
  destPort: ["dest port", "destination port", "tgt port", "input", "in port", "to port", "dst port"],
  signalType: ["signal type", "signal", "type", "format", "cable type"],
  sourceRoom: ["source room", "src room", "from room", "source location"],
  destRoom: ["dest room", "destination room", "tgt room", "to room", "dest location"],
};

// `priority` is only ever comparable within a single role — keyword lists differ in
// length between roles, so mixing it into `score` would silently reorder cross-role
// ties (a bare "Room" would flip from sourceRoom to destRoom). detectColumns keeps
// the two separate for exactly that reason.
function scoreHeader(header: string, keywords: string[]): { score: number; priority: number } {
  const h = header.toLowerCase().trim();
  // Take the BEST match across all keywords, not the first one that matches. A header
  // could easily win a weak match against keyword N ("Source" is a substring of the
  // earlier keyword "source device") before ever reaching its own exact keyword later
  // in the list — which used to return 40 for "Source" instead of the 100 it deserves,
  // and let a weaker column (e.g. "Src Conn", also containing "src") win the role
  // instead. That misdetected the app's own cable-schedule export headers (#331).
  let best = 0;
  // Earlier keywords are the more specific/primary spelling of the role, so when two
  // columns tie in the same tier — e.g. "Signal" and "Cable Type" both exactly matching
  // a signalType keyword, which the app's own export ships as separate columns — the
  // one matching the earlier keyword wins.
  let priority = 0;
  keywords.forEach((kw, i) => {
    const rank = keywords.length - i;
    let s = 0;
    if (h === kw) s = 100;
    else if (h.includes(kw)) s = 60;
    else if (kw.includes(h) && h.length > 2) s = 40;
    if (s > best || (s === best && s > 0 && rank > priority)) {
      best = s;
      priority = rank;
    }
  });
  return { score: best, priority };
}

export function detectColumns(headers: string[]): ColumnMapping {
  const roles = Object.keys(COLUMN_KEYWORDS) as (keyof ColumnMapping)[];
  const mapping: ColumnMapping = {
    sourceDevice: -1,
    sourcePort: -1,
    destDevice: -1,
    destPort: -1,
    signalType: -1,
    sourceRoom: -1,
    destRoom: -1,
  };

  // Build score matrix
  const scores: { role: keyof ColumnMapping; col: number; score: number; priority: number }[] = [];
  for (const role of roles) {
    for (let col = 0; col < headers.length; col++) {
      const { score, priority } = scoreHeader(headers[col], COLUMN_KEYWORDS[role]);
      if (score > 0) scores.push({ role, col, score, priority });
    }
  }

  // Greedy assignment: highest score first, then role-declaration order — a tie across
  // roles has always been settled that way (so a bare "Room" stays on sourceRoom,
  // matching the fallback below). Keyword priority only breaks ties between two columns
  // competing for the SAME role; comparing it across roles is meaningless, since the
  // keyword lists differ in length.
  const roleOrder = new Map(roles.map((r, i) => [r, i]));
  scores.sort(
    (a, b) =>
      b.score - a.score ||
      roleOrder.get(a.role)! - roleOrder.get(b.role)! ||
      b.priority - a.priority ||
      a.col - b.col,
  );
  const usedCols = new Set<number>();
  const usedRoles = new Set<string>();
  for (const { role, col } of scores) {
    if (usedCols.has(col) || usedRoles.has(role)) continue;
    mapping[role] = col;
    usedCols.add(col);
    usedRoles.add(role);
  }

  // Fallback: if we have "room" but not sourceRoom/destRoom, assign "room" column to sourceRoom
  if (mapping.sourceRoom === -1 && mapping.destRoom === -1) {
    for (let col = 0; col < headers.length; col++) {
      if (usedCols.has(col)) continue;
      const h = headers[col].toLowerCase().trim();
      if (h === "room" || h === "location" || h === "area") {
        mapping.sourceRoom = col;
        break;
      }
    }
  }

  return mapping;
}

// ---------- Signal Type Parsing ----------

const SIGNAL_REVERSE = new Map<string, SignalType>();
for (const key of allSignals()) {
  SIGNAL_REVERSE.set(signalLabel(key).toLowerCase(), key);
  SIGNAL_REVERSE.set(key.toLowerCase(), key);
}
// Common aliases
for (const [alias, type] of Object.entries(signalAliases())) SIGNAL_REVERSE.set(alias, type);

export function parseSignalType(raw: string): SignalType {
  if (!raw) return "custom";
  const normalized = raw.toLowerCase().trim().replace(/[_\-/]/g, " ").replace(/\s+/g, " ");
  const direct = SIGNAL_REVERSE.get(normalized);
  if (direct) return direct;
  // Try without spaces/hyphens
  const compact = normalized.replace(/\s/g, "-");
  const compact2 = SIGNAL_REVERSE.get(compact);
  if (compact2) return compact2;
  // Substring match
  for (const [alias, type] of SIGNAL_REVERSE) {
    if (normalized.includes(alias) && alias.length > 2) return type;
  }
  return "custom";
}

// ---------- Connection Extraction ----------

export function extractConnections(rows: string[][], mapping: ColumnMapping): ParsedConnection[] {
  const connections: ParsedConnection[] = [];
  for (const row of rows) {
    const srcDev = mapping.sourceDevice >= 0 ? (row[mapping.sourceDevice] ?? "").trim() : "";
    const dstDev = mapping.destDevice >= 0 ? (row[mapping.destDevice] ?? "").trim() : "";
    if (!srcDev && !dstDev) continue; // skip empty rows
    if (!srcDev || !dstDev) continue; // need both endpoints

    connections.push({
      sourceDevice: srcDev,
      sourcePort: mapping.sourcePort >= 0 ? (row[mapping.sourcePort] ?? "").trim() : "",
      destDevice: dstDev,
      destPort: mapping.destPort >= 0 ? (row[mapping.destPort] ?? "").trim() : "",
      signalType: mapping.signalType >= 0 ? (row[mapping.signalType] ?? "").trim() : "",
      sourceRoom: mapping.sourceRoom >= 0 ? (row[mapping.sourceRoom] ?? "").trim() : "",
      destRoom: mapping.destRoom >= 0 ? (row[mapping.destRoom] ?? "").trim() : "",
    });
  }
  return connections;
}

// ---------- Device Matching ----------

export function matchDevices(
  connections: ParsedConnection[],
  templates: DeviceTemplate[],
): Map<string, DeviceMatch> {
  // Collect unique device names
  const deviceNames = new Set<string>();
  for (const c of connections) {
    deviceNames.add(c.sourceDevice);
    deviceNames.add(c.destDevice);
  }

  const matches = new Map<string, DeviceMatch>();
  for (const name of deviceNames) {
    // Score against all templates
    let bestTemplate: DeviceTemplate | null = null;
    let bestScore = 0;
    for (const tpl of templates) {
      if (tpl.deviceType === "expansion-card" || tpl.deviceType === "cable-accessory" || tpl.deviceType === "adapter") continue;
      const s = scoreTemplate(tpl, name);
      if (s > bestScore) {
        bestScore = s;
        bestTemplate = tpl;
      }
    }

    // Infer ports from CSV data (used for generic mode or supplementing templates)
    const inferredPorts = inferPorts(name, connections);

    if (bestScore > 40 && bestTemplate) {
      matches.set(name, { csvName: name, template: bestTemplate, score: bestScore, inferredPorts });
    } else {
      matches.set(name, { csvName: name, template: null, score: bestScore, inferredPorts });
    }
  }

  return matches;
}

function inferPorts(deviceName: string, connections: ParsedConnection[]): Port[] {
  const ports: Port[] = [];
  const seen = new Set<string>();

  // Output ports: rows where this device is source
  for (const c of connections) {
    if (c.sourceDevice !== deviceName) continue;
    const label = c.sourcePort || `Out ${ports.filter((p) => p.direction === "output").length + 1}`;
    const key = `out:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sig = parseSignalType(c.signalType);
    ports.push({
      id: `csv-${ports.length}`,
      label,
      signalType: sig,
      direction: "output",
      connectorType: defaultConnector(sig),
    });
  }

  // Input ports: rows where this device is destination
  for (const c of connections) {
    if (c.destDevice !== deviceName) continue;
    const label = c.destPort || `In ${ports.filter((p) => p.direction === "input").length + 1}`;
    const key = `in:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sig = parseSignalType(c.signalType);
    ports.push({
      id: `csv-${ports.length}`,
      label,
      signalType: sig,
      direction: "input",
      connectorType: defaultConnector(sig),
    });
  }

  return ports;
}

// ---------- Port Matching ----------

/** Find the best matching port on a device for a CSV port label + direction. */
function findPort(
  ports: Port[],
  label: string,
  direction: "input" | "output",
  signalType?: SignalType,
): Port | undefined {
  if (!label && !signalType) return undefined;
  const lbl = label.toLowerCase();

  // Exact label match (case-insensitive)
  const exact = ports.find(
    (p) => p.label.toLowerCase() === lbl && (p.direction === direction || p.direction === "bidirectional"),
  );
  if (exact) return exact;

  // Label contains search
  if (lbl) {
    const contains = ports.find(
      (p) => p.label.toLowerCase().includes(lbl) && (p.direction === direction || p.direction === "bidirectional"),
    );
    if (contains) return contains;

    // Search contains label
    const reverse = ports.find(
      (p) => lbl.includes(p.label.toLowerCase()) && (p.direction === direction || p.direction === "bidirectional"),
    );
    if (reverse) return reverse;
  }

  // Same signal type + direction
  if (signalType) {
    const bySig = ports.find(
      (p) => p.signalType === signalType && (p.direction === direction || p.direction === "bidirectional"),
    );
    if (bySig) return bySig;
  }

  // Last resort: first port of matching direction
  return ports.find((p) => p.direction === direction || p.direction === "bidirectional");
}

// ---------- Auto Layout ----------

/** Estimate device height from port count (matches DeviceNode rendering: 48 + rows×16). */
function estimateHeight(ports: Port[]): number {
  const inputs = ports.filter((p) => p.direction === "input").length;
  const outputs = ports.filter((p) => p.direction === "output").length;
  const bidirs = ports.filter((p) => p.direction === "bidirectional").length;
  return 48 + (Math.max(inputs, outputs) + bidirs) * 16;
}

const DEVICE_WIDTH = 144;
const COLUMN_SPACING = 320; // 144px device + 176px gap (generous for routing stubs)
const VERTICAL_GAP = 32;   // 2 grid steps between devices
const ROOM_GAP = 64;       // gap between room bands

function autoLayout(
  connections: ParsedConnection[],
  deviceNames: string[],
  deviceSizes: Map<string, number>,    // csvName → estimated height
  deviceRooms: Map<string, string>,    // csvName → room name
): Map<string, { x: number; y: number }> {
  // Build directed graph
  const outgoing = new Map<string, Set<string>>();
  const inDeg = new Map<string, number>();
  for (const name of deviceNames) {
    outgoing.set(name, new Set());
    inDeg.set(name, 0);
  }
  for (const c of connections) {
    if (c.sourceDevice === c.destDevice) continue;
    const set = outgoing.get(c.sourceDevice);
    if (set && !set.has(c.destDevice)) {
      set.add(c.destDevice);
      inDeg.set(c.destDevice, (inDeg.get(c.destDevice) ?? 0) + 1);
    }
  }

  // BFS layer assignment (topological)
  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const name of deviceNames) {
    if ((inDeg.get(name) ?? 0) === 0) {
      layers.set(name, 0);
      queue.push(name);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current) ?? 0;
    for (const neighbor of outgoing.get(current) ?? []) {
      const newLayer = currentLayer + 1;
      if (newLayer > (layers.get(neighbor) ?? 0)) {
        layers.set(neighbor, newLayer);
      }
      inDeg.set(neighbor, (inDeg.get(neighbor) ?? 0) - 1);
      if (inDeg.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Assign unvisited devices (cycles) to layer 0
  for (const name of deviceNames) {
    if (!layers.has(name)) layers.set(name, 0);
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>();
  for (const [name, layer] of layers) {
    const group = layerGroups.get(layer) ?? [];
    group.push(name);
    layerGroups.set(layer, group);
  }

  // Sort within each layer alphabetically for determinism
  for (const group of layerGroups.values()) group.sort();

  // Collect unique rooms, sorted so all paths under the same top-level room are
  // consecutive. Without this, CSV row order can interleave bands from different
  // parent rooms, causing parent room nodes to span across unrelated siblings.
  const roomNames = [...new Set(deviceRooms.values())].sort((a, b) => {
    const aParts = a.split(">").map((s) => s.trim());
    const bParts = b.split(">").map((s) => s.trim());
    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
      const cmp = aParts[i].localeCompare(bParts[i]);
      if (cmp !== 0) return cmp;
    }
    return aParts.length - bParts.length;
  });
  const hasRooms = roomNames.length > 0;

  // Position devices with size-aware spacing
  const positions = new Map<string, { x: number; y: number }>();

  if (hasRooms) {
    // Room-aware layout: each room gets its own vertical band to prevent overlap
    // Devices without a room go in a separate band at the top
    const bands = ["", ...roomNames]; // "" = no-room band
    let bandY = 0;

    for (const band of bands) {
      let bandMaxHeight = 0; // track tallest column in this band

      for (const [layer, devices] of layerGroups) {
        const bandDevices = devices.filter((d) =>
          band === "" ? !deviceRooms.has(d) : deviceRooms.get(d) === band,
        );
        if (bandDevices.length === 0) continue;

        const x = snap(layer * COLUMN_SPACING);
        let y = bandY;
        for (const name of bandDevices) {
          positions.set(name, { x, y: snap(y) });
          const h = deviceSizes.get(name) ?? 60;
          y += h + VERTICAL_GAP;
        }
        bandMaxHeight = Math.max(bandMaxHeight, y - bandY);
      }

      if (bandMaxHeight > 0) {
        bandY += bandMaxHeight + ROOM_GAP;
      }
    }
  } else {
    // Simple layout: no rooms, just stack by layer with size-aware spacing
    for (const [layer, devices] of layerGroups) {
      const x = snap(layer * COLUMN_SPACING);
      let y = 0;
      for (const name of devices) {
        positions.set(name, { x, y: snap(y) });
        const h = deviceSizes.get(name) ?? 60;
        y += h + VERTICAL_GAP;
      }
    }
  }

  // Offset all positions so rooms (which add padding around children) don't go negative
  const ORIGIN_PAD = 80; // room pad + a little breathing room from canvas origin
  for (const [name, pos] of positions) {
    positions.set(name, { x: pos.x + ORIGIN_PAD, y: pos.y + ORIGIN_PAD });
  }

  return positions;
}

function snap(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

// ---------- Build Import Result ----------

let importCounter = 0;

export function buildImportResult(
  connections: ParsedConnection[],
  deviceMatches: Map<string, DeviceMatch>,
  opts?: {
    /** Header color for the devices this import creates — already resolved from the project
     *  override / app preference by the caller (#354). Omitted = no header color at all. */
    defaultHeaderColor?: string;
    /** The project presets, by template id, so a matched template's preset color outranks the
     *  template's own the same way it does when the device is placed from the library. */
    templatePresets?: Record<string, { headerColor?: string }>;
  },
): { nodes: SchematicNode[]; edges: ConnectionEdge[] } {
  importCounter = Date.now();
  const nodes: SchematicNode[] = [];
  const edges: ConnectionEdge[] = [];
  const deviceNodeMap = new Map<string, DeviceNode>(); // csvName → node

  // Collect unique device names in order
  const deviceNames: string[] = [];
  const seen = new Set<string>();
  for (const c of connections) {
    if (!seen.has(c.sourceDevice)) { seen.add(c.sourceDevice); deviceNames.push(c.sourceDevice); }
    if (!seen.has(c.destDevice)) { seen.add(c.destDevice); deviceNames.push(c.destDevice); }
  }

  // Compute device sizes for layout
  const deviceSizes = new Map<string, number>();
  for (const name of deviceNames) {
    const match = deviceMatches.get(name);
    if (!match) continue;
    const ports = match.template ? match.template.ports : match.inferredPorts;
    deviceSizes.set(name, estimateHeight(ports));
  }

  // Build room assignments
  // deviceRoomPath: device → full room path string (e.g. "Studio A > Control Room"),
  // normalized so "A>B" and "A > B" resolve to the same room
  const normalizeRoomPath = (path: string) =>
    path.split(">").map((s) => s.trim()).filter(Boolean).join(" > ");
  const deviceRoomPath = new Map<string, string>();
  for (const c of connections) {
    if (c.sourceRoom) deviceRoomPath.set(c.sourceDevice, normalizeRoomPath(c.sourceRoom));
    if (c.destRoom) deviceRoomPath.set(c.destDevice, normalizeRoomPath(c.destRoom));
  }

  // For layout grouping, use the full path as the band key (handles same-name subrooms)
  const deviceRoom = new Map<string, string>();
  for (const [device, path] of deviceRoomPath) deviceRoom.set(device, path);

  // Compute layout with size + room awareness
  const positions = autoLayout(connections, deviceNames, deviceSizes, deviceRoom);

  // Build all unique room paths including every ancestor prefix
  // e.g. "A > B > C" → ["A", "A > B", "A > B > C"]
  const allRoomPaths = new Set<string>();
  for (const path of deviceRoomPath.values()) {
    const parts = path.split(">").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      allRoomPaths.add(parts.slice(0, i + 1).join(" > "));
    }
  }

  // Sort shallowest first so parents are created before children
  const sortedPaths = [...allRoomPaths].sort(
    (a, b) => a.split(">").length - b.split(">").length,
  );

  // roomPathMap: full path string → room node ID
  const roomPathMap = new Map<string, string>();
  for (const fullPath of sortedPaths) {
    const parts = fullPath.split(">").map((s) => s.trim());
    const label = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join(" > ") : undefined;
    const parentRoomId = parentPath ? roomPathMap.get(parentPath) : undefined;

    const roomId = `room-import-${++importCounter}`;
    roomPathMap.set(fullPath, roomId);
    nodes.push({
      id: roomId,
      type: "room",
      position: { x: 0, y: 0 },
      data: {
        label,
        ...(parentRoomId ? { borderStyle: "solid" as const } : {}),
      },
      style: { width: 400, height: 300 },
      zIndex: -1,
      ...(parentRoomId ? { parentId: parentRoomId } : {}),
    } as SchematicNode);
  }

  // Legacy alias so the device-creation code below can use roomPathMap uniformly
  const roomMap = roomPathMap;

  // Create device nodes
  for (const name of deviceNames) {
    const match = deviceMatches.get(name);
    if (!match) continue;

    const nodeId = `device-import-${++importCounter}`;
    const pos = positions.get(name) ?? { x: 0, y: 0 };

    let ports: Port[];
    let deviceType: string;
    let color: string | undefined;
    // A header color saved onto the matched template — or onto that template's project
    // preset — is about that device specifically, so it beats the default the caller
    // resolved from the two settings (#354).
    let headerColor = opts?.defaultHeaderColor;

    if (match.template) {
      // Use template ports with fresh IDs
      const prefix = `p${++importCounter}`;
      ports = match.template.ports.map((p, i) => ({
        ...p,
        id: `${prefix}-${i}`,
      }));
      deviceType = match.template.deviceType;
      color = match.template.color;
      const presetHeaderColor = match.template.id
        ? opts?.templatePresets?.[match.template.id]?.headerColor
        : undefined;
      headerColor =
        normalizeHeaderColor(presetHeaderColor) ??
        normalizeHeaderColor(match.template.headerColor) ??
        headerColor;
    } else {
      // Generic: use inferred ports with fresh IDs
      const prefix = `p${++importCounter}`;
      ports = match.inferredPorts.map((p, i) => ({
        ...p,
        id: `${prefix}-${i}`,
      }));
      deviceType = "converter"; // neutral type
      color = "#9ca3af"; // gray for generic
    }

    const room = deviceRoomPath.get(name);
    const parentId = room ? roomMap.get(room) : undefined;

    const node: DeviceNode = {
      id: nodeId,
      type: "device",
      position: pos,
      ...(parentId ? { parentId } : {}),
      data: {
        label: name,
        deviceType,
        ports,
        ...(color ? { color } : {}),
        ...(headerColor ? { headerColor } : {}),
        ...(match.template?.manufacturer ? { manufacturer: match.template.manufacturer } : {}),
        ...(match.template?.modelNumber ? { modelNumber: match.template.modelNumber } : {}),
        baseLabel: name,
        model: match.template?.modelNumber ?? name,
      },
    } as DeviceNode;

    nodes.push(node);
    deviceNodeMap.set(name, node);
  }

  // Size room nodes to fit their children — process deepest rooms first so parent
  // rooms can then be sized to contain their already-sized child rooms.
  const roomDepthCache = new Map<string, number>();
  function getRoomDepth(roomId: string): number {
    if (roomDepthCache.has(roomId)) return roomDepthCache.get(roomId)!;
    const room = nodes.find((n) => n.id === roomId);
    const depth = room?.parentId ? 1 + getRoomDepth(room.parentId as string) : 0;
    roomDepthCache.set(roomId, depth);
    return depth;
  }

  const allRoomIds = [...roomPathMap.values()].sort(
    (a, b) => getRoomDepth(b) - getRoomDepth(a), // deepest first
  );

  for (const roomId of allRoomIds) {
    const roomNode = nodes.find((n) => n.id === roomId);
    if (!roomNode) continue;

    const deviceChildren = nodes.filter(
      (n) => n.type === "device" && (n as DeviceNode).parentId === roomId,
    );
    const roomChildren = nodes.filter(
      (n) => n.type === "room" && n.parentId === roomId,
    );

    if (deviceChildren.length === 0 && roomChildren.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const child of deviceChildren) {
      const h = estimateHeight((child as DeviceNode).data.ports);
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + DEVICE_WIDTH);
      maxY = Math.max(maxY, child.position.y + h);
    }

    for (const subroom of roomChildren) {
      // subroom positions are still absolute at this point (not yet relativised)
      const rw = (subroom.style as Record<string, number>).width ?? 400;
      const rh = (subroom.style as Record<string, number>).height ?? 300;
      minX = Math.min(minX, subroom.position.x);
      minY = Math.min(minY, subroom.position.y);
      maxX = Math.max(maxX, subroom.position.x + rw);
      maxY = Math.max(maxY, subroom.position.y + rh);
    }

    const pad = 60;
    roomNode.position = { x: minX - pad, y: minY - pad };
    (roomNode.style as Record<string, number>).width = maxX - minX + pad * 2;
    (roomNode.style as Record<string, number>).height = maxY - minY + pad * 2;

    // Convert direct children (devices + subrooms) to room-relative positions
    for (const child of [...deviceChildren, ...roomChildren]) {
      child.position = {
        x: child.position.x - roomNode.position.x,
        y: child.position.y - roomNode.position.y,
      };
    }
  }

  // Re-stack top-level rooms vertically. ROOM_GAP (80px) between layout bands
  // is far smaller than the parent-room padding on both sides (60px × 2 = 120px
  // per room), so parent rooms still overlap after sizing. Sort by current y
  // and stack them cleanly — subrooms stay correct since their positions are
  // already relative to their parent at this point.
  const topLevelRooms = nodes
    .filter((n) => n.type === "room" && !n.parentId)
    .sort((a, b) => a.position.y - b.position.y);

  if (topLevelRooms.length > 0) {
    const OUTER_GAP = 40;
    const CANVAS_ORIGIN = 40; // minimum x/y offset from canvas edge

    // Normalize x: shift all top-level rooms so the leftmost starts at CANVAS_ORIGIN
    const minX = Math.min(...topLevelRooms.map((r) => r.position.x));
    const xShift = CANVAS_ORIGIN - minX;

    // Stack vertically starting at CANVAS_ORIGIN, applying x normalization
    let curY = CANVAS_ORIGIN;
    for (const room of topLevelRooms) {
      room.position = { x: room.position.x + xShift, y: curY };
      curY += ((room.style as Record<string, number>).height ?? 300) + OUTER_GAP;
    }
  }

  // Create edges
  const usedPorts = new Map<string, Set<string>>(); // nodeId → set of used port IDs
  let edgeCounter = importCounter;

  for (const c of connections) {
    const srcNode = deviceNodeMap.get(c.sourceDevice);
    const dstNode = deviceNodeMap.get(c.destDevice);
    if (!srcNode || !dstNode) continue;
    if (srcNode.id === dstNode.id) continue; // skip self-connections

    const sig = parseSignalType(c.signalType);

    // Find matching ports (avoid reusing already-connected ports)
    const srcUsed = usedPorts.get(srcNode.id) ?? new Set();
    const dstUsed = usedPorts.get(dstNode.id) ?? new Set();
    const srcPorts = srcNode.data.ports.filter((p) => !srcUsed.has(p.id));
    const dstPorts = dstNode.data.ports.filter((p) => !dstUsed.has(p.id));

    const srcPort = findPort(srcPorts, c.sourcePort, "output", sig);
    const dstPort = findPort(dstPorts, c.destPort, "input", sig);
    if (!srcPort || !dstPort) continue;

    // Mark ports as used
    srcUsed.add(srcPort.id);
    dstUsed.add(dstPort.id);
    usedPorts.set(srcNode.id, srcUsed);
    usedPorts.set(dstNode.id, dstUsed);

    // Handle IDs: bidirectional ports use -out/-in suffixes
    const sourceHandle = srcPort.direction === "bidirectional" ? `${srcPort.id}-out` : srcPort.id;
    const targetHandle = dstPort.direction === "bidirectional" ? `${dstPort.id}-in` : dstPort.id;

    edges.push({
      id: `edge-import-${++edgeCounter}`,
      source: srcNode.id,
      target: dstNode.id,
      sourceHandle,
      targetHandle,
      data: { signalType: sig },
      style: {
        stroke: signalCssColor(sig),
        strokeWidth: 2,
      },
    } as ConnectionEdge);
  }

  return { nodes, edges };
}
