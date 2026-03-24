/**
 * CSV Cable Schedule → Schematic import.
 * Pure functions — no React or store dependencies.
 */

import type { SignalType, Port, DeviceTemplate, SchematicNode, DeviceNode, ConnectionEdge } from "./types";
import { SIGNAL_LABELS, SIGNAL_COLORS } from "./types";
import { DEFAULT_CONNECTOR } from "./connectorTypes";
import { scoreTemplate } from "./templateSearch";

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

  // Auto-detect delimiter: count tabs vs commas in first line
  const firstLine = t.split("\n")[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
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
  return { headers: rows[0], rows: rows.slice(1) };
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

function scoreHeader(header: string, keywords: string[]): number {
  const h = header.toLowerCase().trim();
  for (const kw of keywords) {
    if (h === kw) return 100; // exact match
    if (h.includes(kw)) return 60; // contains
    if (kw.includes(h) && h.length > 2) return 40; // header is substring of keyword
  }
  return 0;
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
  const scores: { role: keyof ColumnMapping; col: number; score: number }[] = [];
  for (const role of roles) {
    for (let col = 0; col < headers.length; col++) {
      const s = scoreHeader(headers[col], COLUMN_KEYWORDS[role]);
      if (s > 0) scores.push({ role, col, score: s });
    }
  }

  // Greedy assignment: highest score first
  scores.sort((a, b) => b.score - a.score);
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
for (const [key, label] of Object.entries(SIGNAL_LABELS)) {
  SIGNAL_REVERSE.set(label.toLowerCase(), key as SignalType);
  SIGNAL_REVERSE.set(key.toLowerCase(), key as SignalType);
}
// Common aliases
SIGNAL_REVERSE.set("audio", "analog-audio");
SIGNAL_REVERSE.set("analog", "analog-audio");
SIGNAL_REVERSE.set("network", "ethernet");
SIGNAL_REVERSE.set("cat6", "ethernet");
SIGNAL_REVERSE.set("cat5e", "ethernet");
SIGNAL_REVERSE.set("cat5", "ethernet");
SIGNAL_REVERSE.set("cat6a", "ethernet");
SIGNAL_REVERSE.set("optical", "fiber");
SIGNAL_REVERSE.set("fibre", "fiber");
SIGNAL_REVERSE.set("3g-sdi", "sdi");
SIGNAL_REVERSE.set("12g-sdi", "sdi");
SIGNAL_REVERSE.set("hd-sdi", "sdi");
SIGNAL_REVERSE.set("dp", "displayport");
SIGNAL_REVERSE.set("tb", "thunderbolt");
SIGNAL_REVERSE.set("usb-c", "usb");
SIGNAL_REVERSE.set("digital audio", "aes");
SIGNAL_REVERSE.set("aes/ebu", "aes");
SIGNAL_REVERSE.set("aes3", "aes");
SIGNAL_REVERSE.set("word clock", "wordclock");
SIGNAL_REVERSE.set("dmx512", "dmx");

export function parseSignalType(raw: string): SignalType {
  if (!raw) return "custom";
  const normalized = raw.toLowerCase().trim().replace(/[_\-\/]/g, " ").replace(/\s+/g, " ");
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
      connectorType: DEFAULT_CONNECTOR[sig],
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
      connectorType: DEFAULT_CONNECTOR[sig],
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

/** Estimate device height from port count (matches DeviceNode rendering: 60 + rows×20). */
function estimateHeight(ports: Port[]): number {
  const inputs = ports.filter((p) => p.direction === "input").length;
  const outputs = ports.filter((p) => p.direction === "output").length;
  const bidirs = ports.filter((p) => p.direction === "bidirectional").length;
  return 60 + (Math.max(inputs, outputs) + bidirs) * 20;
}

const DEVICE_WIDTH = 180;
const COLUMN_SPACING = 400; // 180px device + 220px gap (generous for routing stubs)
const VERTICAL_GAP = 40;   // 2 grid steps between devices
const ROOM_GAP = 80;       // gap between room bands

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

  // Collect unique rooms (preserving order)
  const roomNames = [...new Set(deviceRooms.values())];
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
  const deviceRoom = new Map<string, string>(); // device csvName → room name
  for (const c of connections) {
    if (c.sourceRoom) deviceRoom.set(c.sourceDevice, c.sourceRoom);
    if (c.destRoom) deviceRoom.set(c.destDevice, c.destRoom);
  }

  // Compute layout with size + room awareness
  const positions = autoLayout(connections, deviceNames, deviceSizes, deviceRoom);

  // Create room nodes if rooms are specified
  const roomMap = new Map<string, string>(); // room name → room node ID
  const uniqueRooms = [...new Set(deviceRoom.values())];
  for (const roomName of uniqueRooms) {
    const roomId = `room-import-${++importCounter}`;
    roomMap.set(roomName, roomId);
    // Room positioning will be computed after devices
    nodes.push({
      id: roomId,
      type: "room",
      position: { x: 0, y: 0 },
      data: { label: roomName },
      style: { width: 400, height: 300 },
      zIndex: -1,
    } as SchematicNode);
  }

  // Create device nodes
  for (const name of deviceNames) {
    const match = deviceMatches.get(name);
    if (!match) continue;

    const nodeId = `device-import-${++importCounter}`;
    const pos = positions.get(name) ?? { x: 0, y: 0 };

    let ports: Port[];
    let deviceType: string;
    let color: string | undefined;

    if (match.template) {
      // Use template ports with fresh IDs
      const prefix = `p${++importCounter}`;
      ports = match.template.ports.map((p, i) => ({
        ...p,
        id: `${prefix}-${i}`,
      }));
      deviceType = match.template.deviceType;
      color = match.template.color;
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

    const room = deviceRoom.get(name);
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
        ...(match.template?.manufacturer ? { manufacturer: match.template.manufacturer } : {}),
        ...(match.template?.modelNumber ? { modelNumber: match.template.modelNumber } : {}),
        baseLabel: name,
        model: match.template?.modelNumber ?? name,
      },
    } as DeviceNode;

    nodes.push(node);
    deviceNodeMap.set(name, node);
  }

  // Size room nodes to fit their children
  for (const [, roomId] of roomMap) {
    const roomNode = nodes.find((n) => n.id === roomId);
    if (!roomNode) continue;
    const children = nodes.filter((n) => n.type === "device" && (n as DeviceNode).parentId === roomId);
    if (children.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const child of children) {
      const childData = (child as DeviceNode).data;
      const h = estimateHeight(childData.ports);
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + DEVICE_WIDTH);
      maxY = Math.max(maxY, child.position.y + h);
    }

    const pad = 60; // generous padding for room label + routing space
    roomNode.position = { x: minX - pad, y: minY - pad };
    (roomNode.style as Record<string, number>).width = maxX - minX + pad * 2;
    (roomNode.style as Record<string, number>).height = maxY - minY + pad * 2;

    // Convert child positions to room-relative
    for (const child of children) {
      child.position = {
        x: child.position.x - roomNode.position.x,
        y: child.position.y - roomNode.position.y,
      };
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
        stroke: SIGNAL_COLORS[sig] ?? "var(--color-custom)",
        strokeWidth: 2,
      },
    } as ConnectionEdge);
  }

  return { nodes, edges };
}
