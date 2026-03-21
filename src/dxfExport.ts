import type { ReactFlowInstance } from "@xyflow/react";
import { useSchematicStore } from "./store";
import type { SchematicNode, SignalType } from "./types";

// ACI color mapping (closest match for each signal type)
const SIGNAL_ACI: Record<SignalType, number> = {
  sdi: 5,          // blue
  hdmi: 1,         // red
  ndi: 3,          // green
  dante: 30,       // orange
  "analog-audio": 46, // brown
  aes: 178,        // purple
  usb: 6,          // magenta
  ethernet: 4,     // teal/cyan
  fiber: 40,       // amber
  displayport: 4,  // dark teal
  hdbaset: 170,    // violet
  srt: 3,          // forest green
  genlock: 8,      // slate
  gpio: 9,         // warm gray
  rs422: 174,      // deep violet
  serial: 8,       // gray
  thunderbolt: 174, // indigo
  composite: 40,   // yellow
  vga: 150,        // dark sky blue
  power: 46,       // dark amber
  dmx: 1,          // dark red
  madi: 3,         // emerald
  midi: 6,         // fuchsia
  tally: 1,        // deep rose
  spdif: 178,      // lighter violet
  adat: 4,         // dark cyan
  ultranet: 3,     // green
  aes50: 171,      // blue-violet
  custom: 9,       // cool gray
};

/** Format a number as a clean decimal (no scientific notation). */
function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/** Parse an SVG path `d` attribute into a sequence of {x,y} points. */
function parseSvgPath(d: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
  if (!commands) return points;

  let cx = 0;
  let cy = 0;

  for (const cmd of commands) {
    const type = cmd[0];
    const nums = cmd
      .slice(1)
      .trim()
      .match(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi)
      ?.map(Number) ?? [];

    switch (type) {
      case "M":
        cx = nums[0]; cy = nums[1];
        points.push({ x: cx, y: cy });
        for (let i = 2; i < nums.length; i += 2) {
          cx = nums[i]; cy = nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "m":
        cx += nums[0]; cy += nums[1];
        points.push({ x: cx, y: cy });
        for (let i = 2; i < nums.length; i += 2) {
          cx += nums[i]; cy += nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "L":
        for (let i = 0; i < nums.length; i += 2) {
          cx = nums[i]; cy = nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "l":
        for (let i = 0; i < nums.length; i += 2) {
          cx += nums[i]; cy += nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "H":
        for (const n of nums) { cx = n; points.push({ x: cx, y: cy }); }
        break;
      case "h":
        for (const n of nums) { cx += n; points.push({ x: cx, y: cy }); }
        break;
      case "V":
        for (const n of nums) { cy = n; points.push({ x: cx, y: cy }); }
        break;
      case "v":
        for (const n of nums) { cy += n; points.push({ x: cx, y: cy }); }
        break;
      case "C":
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = nums[i], y1 = nums[i + 1];
          const x2 = nums[i + 2], y2 = nums[i + 3];
          const x3 = nums[i + 4], y3 = nums[i + 5];
          for (const t of [0.25, 0.5, 0.75]) {
            const u = 1 - t;
            points.push({
              x: u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
              y: u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
            });
          }
          cx = x3; cy = y3;
          points.push({ x: cx, y: cy });
        }
        break;
      case "c":
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = cx + nums[i], y1 = cy + nums[i + 1];
          const x2 = cx + nums[i + 2], y2 = cy + nums[i + 3];
          const x3 = cx + nums[i + 4], y3 = cy + nums[i + 5];
          for (const t of [0.25, 0.5, 0.75]) {
            const u = 1 - t;
            points.push({
              x: u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
              y: u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
            });
          }
          cx = x3; cy = y3;
          points.push({ x: cx, y: cy });
        }
        break;
      case "Q":
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = nums[i], y1 = nums[i + 1];
          const x2 = nums[i + 2], y2 = nums[i + 3];
          for (const t of [0.33, 0.67]) {
            const u = 1 - t;
            points.push({
              x: u * u * cx + 2 * u * t * x1 + t * t * x2,
              y: u * u * cy + 2 * u * t * y1 + t * t * y2,
            });
          }
          cx = x2; cy = y2;
          points.push({ x: cx, y: cy });
        }
        break;
      case "Z":
      case "z":
        if (points.length > 0) {
          points.push({ x: points[0].x, y: points[0].y });
        }
        break;
    }
  }
  return points;
}

/**
 * Minimal R12 DXF writer (AC1009).
 */
class DxfWriter {
  private lines: string[] = [];

  private write(code: number, value: string) {
    this.lines.push(`  ${code}`);
    this.lines.push(value);
  }

  private int(code: number, value: number) {
    this.write(code, value.toString());
  }

  private real(code: number, value: number) {
    this.write(code, fmt(value));
  }

  private str(code: number, value: string) {
    this.write(code, value);
  }

  writeHeader(extMin: { x: number; y: number }, extMax: { x: number; y: number }) {
    this.str(0, "SECTION");
    this.str(2, "HEADER");
    this.str(9, "$ACADVER"); this.str(1, "AC1009");
    this.str(9, "$INSBASE");
    this.real(10, 0); this.real(20, 0); this.real(30, 0);
    this.str(9, "$EXTMIN");
    this.real(10, extMin.x); this.real(20, extMin.y); this.real(30, 0);
    this.str(9, "$EXTMAX");
    this.real(10, extMax.x); this.real(20, extMax.y); this.real(30, 0);
    this.str(9, "$CLAYER"); this.str(8, "0");
    this.str(0, "ENDSEC");
  }

  writeTables(layers: { name: string; color: number; linetype?: string }[]) {
    this.str(0, "SECTION");
    this.str(2, "TABLES");

    // LTYPE table
    this.str(0, "TABLE"); this.str(2, "LTYPE"); this.int(70, 2);
    this.str(0, "LTYPE"); this.str(2, "CONTINUOUS"); this.int(70, 0);
    this.str(3, "Solid line"); this.int(72, 65); this.int(73, 0); this.real(40, 0);
    this.str(0, "LTYPE"); this.str(2, "DASHED"); this.int(70, 0);
    this.str(3, "Dashed"); this.int(72, 65); this.int(73, 2);
    this.real(40, 0.75); this.real(49, 0.5); this.real(49, -0.25);
    this.str(0, "ENDTAB");

    // LAYER table
    this.str(0, "TABLE"); this.str(2, "LAYER"); this.int(70, layers.length);
    for (const layer of layers) {
      this.str(0, "LAYER"); this.str(2, layer.name); this.int(70, 0);
      this.int(62, layer.color); this.str(6, layer.linetype ?? "CONTINUOUS");
    }
    this.str(0, "ENDTAB");

    // STYLE table
    this.str(0, "TABLE"); this.str(2, "STYLE"); this.int(70, 1);
    this.str(0, "STYLE"); this.str(2, "STANDARD"); this.int(70, 0);
    this.real(40, 0); this.real(41, 1); this.real(50, 0);
    this.int(71, 0); this.real(42, 10);
    this.str(3, "txt"); this.str(4, "");
    this.str(0, "ENDTAB");

    this.str(0, "ENDSEC");
  }

  writeBlocks() {
    this.str(0, "SECTION"); this.str(2, "BLOCKS"); this.str(0, "ENDSEC");
  }

  startEntities() { this.str(0, "SECTION"); this.str(2, "ENTITIES"); }
  endEntities() { this.str(0, "ENDSEC"); }

  addLine(layer: string, x1: number, y1: number, x2: number, y2: number, color?: number) {
    this.str(0, "LINE"); this.str(8, layer);
    if (color !== undefined) this.int(62, color);
    this.real(10, x1); this.real(20, y1); this.real(30, 0);
    this.real(11, x2); this.real(21, y2); this.real(31, 0);
  }

  addRect(layer: string, x: number, y: number, w: number, h: number, color?: number) {
    this.addLine(layer, x, y, x + w, y, color);
    this.addLine(layer, x + w, y, x + w, y + h, color);
    this.addLine(layer, x + w, y + h, x, y + h, color);
    this.addLine(layer, x, y + h, x, y, color);
  }

  addPolyline(layer: string, points: { x: number; y: number }[], color?: number) {
    if (points.length < 2) return;
    this.str(0, "POLYLINE"); this.str(8, layer);
    if (color !== undefined) this.int(62, color);
    this.int(66, 1); this.int(70, 0);
    this.real(10, 0); this.real(20, 0); this.real(30, 0);
    for (const p of points) {
      this.str(0, "VERTEX"); this.str(8, layer);
      this.real(10, p.x); this.real(20, p.y); this.real(30, 0);
    }
    this.str(0, "SEQEND"); this.str(8, layer);
  }

  addText(layer: string, x: number, y: number, height: number, text: string, color?: number) {
    this.str(0, "TEXT"); this.str(8, layer);
    if (color !== undefined) this.int(62, color);
    this.real(10, x); this.real(20, y); this.real(30, 0);
    this.real(40, height); this.str(1, text); this.str(7, "STANDARD");
  }

  /** Right-aligned text using second alignment point. */
  addTextRight(layer: string, x: number, y: number, height: number, text: string, color?: number) {
    this.str(0, "TEXT"); this.str(8, layer);
    if (color !== undefined) this.int(62, color);
    this.real(10, x); this.real(20, y); this.real(30, 0);
    this.real(40, height); this.str(1, text); this.str(7, "STANDARD");
    this.int(72, 2); // horizontal right-align
    this.int(73, 1); // vertical bottom
    this.real(11, x); this.real(21, y); this.real(31, 0);
  }

  writeEof() { this.str(0, "EOF"); }
  toString() { return this.lines.join("\n"); }
}

/** Handle position info: absolute flow coordinates */
interface HandlePos {
  id: string;
  absX: number;
  absY: number;
}

function getHandlePositions(
  node: SchematicNode,
  rfInstance: ReactFlowInstance,
): HandlePos[] {
  const internal = rfInstance.getInternalNode(node.id);
  if (!internal) return [];

  const absX = internal.internals.positionAbsolute.x;
  const absY = internal.internals.positionAbsolute.y;
  const bounds = internal.internals.handleBounds;
  const result: HandlePos[] = [];

  for (const handle of bounds?.source ?? []) {
    if (handle.id) {
      result.push({
        id: handle.id,
        absX: absX + handle.x + handle.width / 2,
        absY: absY + handle.y + handle.height / 2,
      });
    }
  }
  for (const handle of bounds?.target ?? []) {
    if (handle.id) {
      result.push({
        id: handle.id,
        absX: absX + handle.x + handle.width / 2,
        absY: absY + handle.y + handle.height / 2,
      });
    }
  }
  return result;
}

export function exportDxf(rfInstance: ReactFlowInstance) {
  const state = useSchematicStore.getState();
  const { nodes, edges } = state;

  if (nodes.length === 0) return;

  const dxf = new DxfWriter();

  // Build handle position map for all nodes
  const handleMap = new Map<string, HandlePos>(); // handleId → position
  for (const node of nodes) {
    for (const hp of getHandlePositions(node, rfInstance)) {
      handleMap.set(`${node.id}:${hp.id}`, hp);
    }
  }

  // Compute bounds (DXF Y is flipped: screenY → -screenY)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function trackBounds(x: number, y: number) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  // Pre-pass to compute extents
  for (const node of nodes) {
    const internal = rfInstance.getInternalNode(node.id);
    if (!internal) continue;
    const ax = internal.internals.positionAbsolute.x;
    const ay = internal.internals.positionAbsolute.y;
    const w = node.measured?.width ?? 180;
    const h = node.measured?.height ?? 80;
    trackBounds(ax, -ay);
    trackBounds(ax + w, -(ay + h));
  }

  // Collect signal types actually used in connections
  const usedSignalTypes = new Set<SignalType>();
  for (const edge of edges) {
    if (edge.data?.signalType) usedSignalTypes.add(edge.data.signalType);
  }

  const layers: { name: string; color: number; linetype?: string }[] = [
    { name: "0", color: 7 },
    { name: "EasySchematic-Rooms", color: 9, linetype: "DASHED" },
    { name: "EasySchematic-Devices", color: 7 },
    { name: "EasySchematic-Labels", color: 7 },
    { name: "EasySchematic-Ports", color: 8 },
  ];
  // Add a connection sub-layer per signal type
  for (const sig of usedSignalTypes) {
    const label = sig.toUpperCase().replace(/-/g, " ");
    layers.push({
      name: `EasySchematic-Connections-${label}`,
      color: SIGNAL_ACI[sig] ?? 5,
    });
  }

  dxf.writeHeader(
    { x: minX - 20, y: minY - 20 },
    { x: maxX + 20, y: maxY + 20 },
  );
  dxf.writeTables(layers);
  dxf.writeBlocks();
  dxf.startEntities();

  // --- Rooms ---
  for (const node of nodes) {
    if (node.type !== "room") continue;
    const internal = rfInstance.getInternalNode(node.id);
    if (!internal) continue;
    const ax = internal.internals.positionAbsolute.x;
    const ay = internal.internals.positionAbsolute.y;
    const w = node.measured?.width ?? 400;
    const h = node.measured?.height ?? 300;
    // DXF: bottom-left corner, Y flipped
    dxf.addRect("EasySchematic-Rooms", ax, -(ay + h), w, h, 9);
    dxf.addText("EasySchematic-Labels", ax + 4, -ay - 10, 8, node.data.label, 9);
  }

  // --- Device nodes ---
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const internal = rfInstance.getInternalNode(node.id);
    if (!internal) continue;
    const ax = internal.internals.positionAbsolute.x;
    const ay = internal.internals.positionAbsolute.y;
    const w = node.measured?.width ?? 180;
    const h = node.measured?.height ?? 80;

    // Outer box (DXF y-flipped)
    const dxfTop = -ay;
    const dxfBot = -(ay + h);
    dxf.addRect("EasySchematic-Devices", ax, dxfBot, w, h);

    // Device label — positioned near top of box
    dxf.addText("EasySchematic-Labels", ax + 8, dxfTop - 10, 6, node.data.label);
    dxf.addText("EasySchematic-Labels", ax + 8, dxfTop - 18, 4,
      node.data.deviceType.replace(/-/g, " "), 8);

    // Port labels — positioned at actual handle Y coordinates
    const handles = getHandlePositions(node, rfInstance);
    const portMap = new Map(node.data.ports.map((p) => [p.id, p]));

    // Build set of connected handle IDs for this node
    const connectedHandles = new Set<string>();
    for (const e of edges) {
      if (e.source === node.id && e.sourceHandle) connectedHandles.add(e.sourceHandle);
      if (e.target === node.id && e.targetHandle) connectedHandles.add(e.targetHandle);
    }

    // Track which bidirectional ports we've already labeled
    const bidirLabeled = new Set<string>();

    for (const hp of handles) {
      // Handle IDs: for bidirectional ports, format is "portId-in" or "portId-out"
      let portId = hp.id;
      if (portId.endsWith("-in")) {
        portId = portId.slice(0, -3);
      } else if (portId.endsWith("-out")) {
        portId = portId.slice(0, -4);
      }

      const port = portMap.get(portId);
      if (!port) continue;

      const aci = SIGNAL_ACI[port.signalType] ?? 7;
      const dxfY = -hp.absY - 2;

      if (port.direction === "bidirectional") {
        // Only label once per bidirectional port
        if (bidirLabeled.has(portId)) continue;

        // Check which side is connected
        const inHandle = `${portId}-in`;
        const outHandle = `${portId}-out`;
        const connectedIn = connectedHandles.has(inHandle);
        const connectedOut = connectedHandles.has(outHandle);

        if (connectedOut && !connectedIn) {
          // Connected on the right (output) side
          dxf.addTextRight("EasySchematic-Ports", ax + w - 8, dxfY, 4, port.label, aci);
        } else {
          // Connected on left, both, or neither — default to left
          dxf.addText("EasySchematic-Ports", ax + 8, dxfY, 4, port.label, aci);
        }
        bidirLabeled.add(portId);
      } else if (port.direction === "input") {
        dxf.addText("EasySchematic-Ports", ax + 8, dxfY, 4, port.label, aci);
      } else if (port.direction === "output") {
        dxf.addTextRight("EasySchematic-Ports", ax + w - 8, dxfY, 4, port.label, aci);
      }
    }

    // Header separator — find where ports start (use first handle Y, or estimate)
    if (handles.length > 0) {
      const firstHandleY = Math.min(...handles.map((h) => h.absY));
      const separatorDxfY = -(firstHandleY - 6);
      dxf.addLine("EasySchematic-Devices", ax, separatorDxfY, ax + w, separatorDxfY);
    }

    // Section separators — detect when port.section changes within inputs/outputs
    const portsWithHandles: { port: typeof node.data.ports[number]; handleY: number }[] = [];
    for (const port of node.data.ports) {
      // Find the handle Y for this port
      const handleId = port.direction === "bidirectional" ? `${port.id}-in` : port.id;
      const hp = handles.find((h) => h.id === handleId);
      if (hp) portsWithHandles.push({ port, handleY: hp.absY });
    }

    // Group by direction, draw separators where section changes
    for (const dir of ["input", "output", "bidirectional"] as const) {
      const dirPorts = portsWithHandles.filter((p) => p.port.direction === dir);
      let lastSection: string | undefined;
      for (const { port, handleY } of dirPorts) {
        if (port.section && port.section !== lastSection && lastSection !== undefined) {
          // Draw separator line between previous port and this one
          const sepY = -(handleY - 6);
          if (dir === "input") {
            dxf.addLine("EasySchematic-Devices", ax, sepY, ax + w / 2, sepY, 8);
            dxf.addText("EasySchematic-Labels", ax + 4, sepY + 1, 3, port.section, 8);
          } else if (dir === "output") {
            dxf.addLine("EasySchematic-Devices", ax + w / 2, sepY, ax + w, sepY, 8);
            dxf.addTextRight("EasySchematic-Labels", ax + w - 4, sepY + 1, 3, port.section, 8);
          } else {
            dxf.addLine("EasySchematic-Devices", ax, sepY, ax + w, sepY, 8);
            dxf.addText("EasySchematic-Labels", ax + w / 2 - 10, sepY + 1, 3, port.section, 8);
          }
        }
        lastSection = port.section;
      }
    }
  }

  // --- Connections (from SVG paths in the DOM) ---
  const svgEdges = document.querySelectorAll(".react-flow__edge path");
  const edgeMap = new Map<string, string>();
  for (const el of svgEdges) {
    const parent = el.closest(".react-flow__edge");
    if (!parent) continue;
    const edgeId = parent.getAttribute("data-id");
    const d = el.getAttribute("d");
    if (edgeId && d) edgeMap.set(edgeId, d);
  }

  for (const edge of edges) {
    const d = edgeMap.get(edge.id);
    if (!d) continue;

    const rawPoints = parseSvgPath(d);
    if (rawPoints.length < 2) continue;

    // Flip Y for DXF
    const pts = rawPoints.map((p) => ({ x: p.x, y: -p.y }));

    const sig = edge.data?.signalType;
    const layerName = sig
      ? `EasySchematic-Connections-${sig.toUpperCase().replace(/-/g, " ")}`
      : "0";
    dxf.addPolyline(layerName, pts);
  }

  dxf.endEntities();
  dxf.writeEof();

  // Download
  const blob = new Blob([dxf.toString()], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${state.schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.dxf`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
