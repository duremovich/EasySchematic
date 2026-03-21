import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from "@xyflow/react";
import type {
  DeviceNode,
  DeviceData,
  SchematicNode,
  ConnectionEdge,
  DeviceTemplate,
  Port,
  SchematicFile,
  TitleBlock,
  TitleBlockLayout,
  TemplatePreset,
  InstalledSlot,
} from "./types";
import type { ReactFlowInstance } from "@xyflow/react";
import type { SignalType, ScrollConfig } from "./types";
import { DEFAULT_SCROLL_CONFIG } from "./types";
import type { Orientation } from "./printConfig";
import { computeAlignment, type AlignOperation } from "./alignUtils";
import { CURRENT_SCHEMA_VERSION, migrateSchematic } from "./migrations";
import { routeAllEdges, type RoutedEdge } from "./edgeRouter";
import { areConnectorsCompatible } from "./connectorTypes";
import { createDefaultLayout } from "./titleBlockLayout";
import { sanitizeNoteHtml } from "./sanitizeHtml";
import { getTemplateById } from "./templateApi";
import { getSignalColorOverrides, applySignalColors, loadSignalColors, saveSignalColors } from "./signalColors";
import { computeCableSchedule } from "./cableSchedule";

const STORAGE_KEY = "easyschematic-autosave";
const TEMPLATES_KEY = "easyschematic-custom-templates";

/** Migrate legacy scrollBehavior to ScrollConfig, or use provided scrollConfig */
function resolveScrollConfig(data: { scrollBehavior?: string; scrollConfig?: ScrollConfig }): ScrollConfig {
  if (data.scrollConfig) return data.scrollConfig;
  if (data.scrollBehavior === "pan") return { scroll: "pan-y", shiftScroll: "pan-x", ctrlScroll: "zoom" };
  return { ...DEFAULT_SCROLL_CONFIG };
}

/** True if the scroll config matches the default (omit from JSON when saving) */
function isDefaultScrollConfig(c: ScrollConfig): boolean {
  return c.scroll === DEFAULT_SCROLL_CONFIG.scroll
    && c.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll
    && c.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll;
}

/** Guard: don't persist empty state before initial load completes */
let hydrated = false;

/** Grid size in px — must match snapGrid in App.tsx and Background gap */
export const GRID_SIZE = 20;

/** Snap all node positions to the grid. Mutates the array in place. */
function snapNodesToGrid(nodes: SchematicNode[]): SchematicNode[] {
  for (const n of nodes) {
    n.position.x = Math.round(n.position.x / GRID_SIZE) * GRID_SIZE;
    n.position.y = Math.round(n.position.y / GRID_SIZE) * GRID_SIZE;
  }
  return nodes;
}

/** Ensure `draggable: false` is set on any room with `data.locked`. Mutates in place. */
function applyRoomLockState(nodes: SchematicNode[]): void {
  for (const n of nodes) {
    if (n.type === "room" && (n.data as import("./types").RoomData).locked) {
      n.draggable = false;
    }
  }
}

interface Clipboard {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  /** Height of the copied selection's bounding box, used for paste offset */
  boundsHeight: number;
}

interface SchematicState {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  schematicName: string;
  editingNodeId: string | null;
  customTemplates: DeviceTemplate[];

  // React Flow handlers
  onNodesChange: OnNodesChange<SchematicNode>;
  onEdgesChange: OnEdgesChange<ConnectionEdge>;
  onConnect: OnConnect;

  // Actions
  addDevice: (template: DeviceTemplate, position: { x: number; y: number }) => void;
  removeSelected: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  alignSelectedNodes: (op: AlignOperation) => void;
  isValidConnection: (connection: Connection) => boolean;
  updateDeviceLabel: (nodeId: string, label: string) => void;
  batchUpdateDeviceLabels: (changes: { nodeId: string; label: string }[]) => void;
  updateDevice: (nodeId: string, data: DeviceData) => void;
  /** Patch device data without clearing baseLabel (for spreadsheet edits). */
  patchDeviceData: (nodeId: string, patch: Partial<DeviceData>) => void;
  /** Swap or remove a card in a modular slot. Pass null cardTemplateId to empty the slot. */
  swapCard: (nodeId: string, slotId: string, cardTemplateId: string | null) => void;
  setEditingNodeId: (id: string | null) => void;
  addRoom: (label: string, position: { x: number; y: number }) => void;
  updateRoomLabel: (nodeId: string, label: string) => void;
  updateRoom: (nodeId: string, data: import("./types").RoomData) => void;
  toggleRoomLock: (nodeId: string) => void;
  addNote: (position: { x: number; y: number }) => void;
  updateNoteHtml: (nodeId: string, html: string) => void;
  reparentNode: (nodeId: string, absolutePosition: { x: number; y: number }) => void;

  // Undo/Redo
  pushSnapshot: () => void;
  setPendingUndoSnapshot: () => void;
  clearPendingUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoSize: number;
  redoSize: number;

  // Selection
  selectAll: () => void;

  // Custom templates
  addCustomTemplate: (template: DeviceTemplate) => void;
  removeCustomTemplate: (deviceType: string) => void;

  // Edge data
  patchEdgeData: (edgeId: string, patch: Partial<import("./types").ConnectionData>) => void;
  batchPatchEdgeData: (changes: { edgeId: string; patch: Partial<import("./types").ConnectionData> }[]) => void;

  // Manual edge routing
  setManualWaypoints: (edgeId: string, waypoints: { x: number; y: number }[]) => void;
  clearManualWaypoints: (edgeId: string) => void;
  edgeContextMenu: { edgeId: string; screenX: number; screenY: number; flowX: number; flowY: number } | null;
  roomContextMenu: { nodeId: string; screenX: number; screenY: number } | null;

  // Centralized edge routing
  routedEdges: Record<string, RoutedEdge>;
  recomputeRoutes: (rfInstance: ReactFlowInstance) => void;

  // Debug
  debugEdges: boolean;
  toggleDebugEdges: () => void;

  // Resize snap guides (shown while resizing rooms)
  resizeGuides: import("./snapUtils").GuideLine[];
  setResizeGuides: (guides: import("./snapUtils").GuideLine[]) => void;

  // Demo state — true when the demo schematic was auto-loaded for first-time visitors
  isDemo: boolean;

  // Drag state — edges freeze during drag and recalculate on drop
  isDragging: boolean;

  // Print view (printView toggle is ephemeral; paper/orientation/scale are persisted)
  printView: boolean;
  printPaperId: string;
  printOrientation: Orientation;
  printScale: number;
  setPrintView: (v: boolean) => void;
  setPrintPaperId: (id: string) => void;
  setPrintOrientation: (o: Orientation) => void;
  setPrintScale: (s: number) => void;

  // Title block
  titleBlock: TitleBlock;
  setTitleBlock: (tb: TitleBlock) => void;
  titleBlockLayout: TitleBlockLayout;
  setTitleBlockLayout: (layout: TitleBlockLayout) => void;

  // Signal colors
  signalColors: Partial<Record<SignalType, string>> | undefined;
  setSignalColors: (colors: Record<SignalType, string>) => void;

  // Report layouts (pack list PDF settings, etc.)
  reportLayouts: Record<string, unknown>;
  setReportLayout: (key: string, layout: unknown) => void;
  globalReportHeaderLayout: TitleBlockLayout | null;
  globalReportFooterLayout: TitleBlockLayout | null;
  setGlobalReportHeaderLayout: (layout: TitleBlockLayout) => void;
  setGlobalReportFooterLayout: (layout: TitleBlockLayout) => void;

  // View options
  hiddenSignalTypes: string;
  hideDeviceTypes: boolean;
  hideUnconnectedPorts: boolean;
  templateHiddenSignals: Record<string, SignalType[]>;
  toggleSignalTypeVisibility: (type: SignalType) => void;
  setHideDeviceTypes: (hide: boolean) => void;
  setHideUnconnectedPorts: (hide: boolean) => void;
  setTemplateHiddenSignals: (templateId: string, hidden: SignalType[]) => void;
  showAllSignalTypes: () => void;

  // Template presets
  templatePresets: Record<string, TemplatePreset>;
  setTemplatePreset: (templateId: string, preset: TemplatePreset | null) => void;

  // Favorite templates
  favoriteTemplates: string[];
  toggleFavoriteTemplate: (templateKey: string) => void;

  // Scroll behavior (#19)
  scrollConfig: ScrollConfig;
  setScrollConfig: (v: ScrollConfig) => void;

  // Cable naming scheme (#1)
  cableNamingScheme: "sequential" | "type-prefix";
  setCableNamingScheme: (v: "sequential" | "type-prefix") => void;

  // Incompatible connection dialog (#6)
  pendingIncompatibleConnection: {
    connection: Connection;
    sourcePort: Port;
    targetPort: Port;
  } | null;
  dismissIncompatibleDialog: () => void;
  forceIncompatibleConnection: () => void;
  insertAdapterBetween: (template: DeviceTemplate) => void;

  // Line jumps (#18)
  showLineJumps: boolean;
  setShowLineJumps: (show: boolean) => void;

  // Connection labels (#5)
  showConnectionLabels: boolean;
  setShowConnectionLabels: (show: boolean) => void;
  cableIdMap: Record<string, string>;
  recomputeCableIds: () => void;

  // Template import/export (#12/#26)
  exportCustomTemplates: () => DeviceTemplate[];
  importCustomTemplates: (templates: DeviceTemplate[]) => void;

  // Persistence
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => boolean;
  exportToJSON: () => SchematicFile;
  importFromJSON: (data: SchematicFile) => void;
  newSchematic: () => void;
  setSchematicName: (name: string) => void;
}

let nodeIdCounter = 0;
function nextNodeId(): string {
  return `device-${++nodeIdCounter}`;
}

let edgeIdCounter = 0;
function nextEdgeId(): string {
  return `edge-${++edgeIdCounter}`;
}

let roomIdCounter = 0;
function nextRoomId(): string {
  return `room-${++roomIdCounter}`;
}

let noteIdCounter = 0;
function nextNoteId(): string {
  return `note-${++noteIdCounter}`;
}

/** Sync counters so new IDs never collide with existing ones. */
function syncCounters(nodes: SchematicNode[], edges: ConnectionEdge[]) {
  for (const n of nodes) {
    const dm = n.id.match(/^device-(\d+)$/);
    if (dm) nodeIdCounter = Math.max(nodeIdCounter, Number(dm[1]));
    const rm = n.id.match(/^room-(\d+)$/);
    if (rm) roomIdCounter = Math.max(roomIdCounter, Number(rm[1]));
    const nm = n.id.match(/^note-(\d+)$/);
    if (nm) noteIdCounter = Math.max(noteIdCounter, Number(nm[1]));
  }
  for (const e of edges) {
    const m = e.id.match(/^edge-(\d+)$/);
    if (m) edgeIdCounter = Math.max(edgeIdCounter, Number(m[1]));
  }
}

let clipboard: Clipboard | null = null;
const PASTE_GAP = 20;

// Undo/redo history
interface Snapshot {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
}
const MAX_HISTORY = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

/** If set, the next pushUndo call uses this instead of the passed snapshot. */
let pendingUndoSnapshot: Snapshot | null = null;

/** Edge ID being reconnected — excluded from isValidConnection duplicate checks. */
let _reconnectingEdgeId: string | null = null;
export function setReconnectingEdgeId(id: string | null) {
  _reconnectingEdgeId = id;
}

function pushUndo(snapshot: Snapshot) {
  undoStack.push(pendingUndoSnapshot ?? snapshot);
  pendingUndoSnapshot = null;
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
}

function clonePorts(ports: Port[]): Port[] {
  const prefix = `p${Date.now()}`;
  return ports.map((p, i) => {
    const clone: Port = { ...p, id: `${prefix}-${i}` };
    // Deep clone nested objects
    if (p.capabilities) clone.capabilities = { ...p.capabilities };
    if (p.networkConfig) clone.networkConfig = { ...p.networkConfig };
    if (p.activeConfig) clone.activeConfig = { ...p.activeConfig };
    return clone;
  });
}

/** Clone ports for a card installed in a slot, namespacing IDs and setting section. */
function cloneCardPorts(ports: Port[], slotId: string, slotLabel: string): Port[] {
  const prefix = `slot-${slotId}-${Date.now()}`;
  return ports.map((p, i) => {
    const clone: Port = { ...p, id: `${prefix}-${i}`, section: slotLabel };
    if (p.capabilities) clone.capabilities = { ...p.capabilities };
    if (p.networkConfig) clone.networkConfig = { ...p.networkConfig };
    if (p.activeConfig) clone.activeConfig = { ...p.activeConfig };
    return clone;
  });
}

/** Auto-number devices that share a baseLabel. Returns a new array if anything changed. */
function renumberNodes(nodes: SchematicNode[]): SchematicNode[] {
  // Group by baseLabel (only device nodes have this)
  const groups = new Map<string, SchematicNode[]>();
  for (const n of nodes) {
    if (n.type !== "device") continue;
    const baseLabel = (n.data as DeviceData).baseLabel;
    if (!baseLabel) continue;
    const group = groups.get(baseLabel) ?? [];
    group.push(n);
    groups.set(baseLabel, group);
  }

  // Build id→newLabel map
  const labelUpdates = new Map<string, string>();
  for (const [base, group] of groups) {
    if (group.length === 1) {
      // Only one — use base name with no number
      if (group[0].data.label !== base) {
        labelUpdates.set(group[0].id, base);
      }
    } else {
      // Multiple — number them in order of position (top-left first)
      group.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
      group.forEach((n, i) => {
        const numbered = `${base} ${i + 1}`;
        if (n.data.label !== numbered) {
          labelUpdates.set(n.id, numbered);
        }
      });
    }
  }

  if (labelUpdates.size === 0) return nodes;
  return nodes.map((n) => {
    const newLabel = labelUpdates.get(n.id);
    return newLabel ? { ...n, data: { ...n.data, label: newLabel } } as SchematicNode : n;
  });
}

/** Ensure parent (room) nodes appear before their children in the array. */
function sortNodesParentFirst(nodes: SchematicNode[]): SchematicNode[] {
  const rooms: SchematicNode[] = [];
  const others: SchematicNode[] = [];
  for (const n of nodes) {
    if (n.type === "room") rooms.push(n);
    else others.push(n);
  }
  return [...rooms, ...others];
}

function getPortFromHandle(
  nodes: SchematicNode[],
  nodeId: string,
  handleId: string | null,
): Port | undefined {
  if (!handleId) return undefined;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.type !== "device") return undefined;
  const ports = (node.data as DeviceData).ports;
  // Direct match first
  const direct = ports.find((p) => p.id === handleId);
  if (direct) return direct;
  // Bidirectional handles use "{portId}-in" / "{portId}-out" suffixes
  const baseId = handleId.replace(/-(in|out)$/, "");
  return ports.find((p) => p.id === baseId);
}

function loadCustomTemplates(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as DeviceTemplate[]) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: DeviceTemplate[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // silently fail
  }
}

export const useSchematicStore = create<SchematicState>((set, get) => ({
  nodes: [],
  edges: [],
  schematicName: "Untitled Schematic",
  editingNodeId: null,
  customTemplates: loadCustomTemplates(),
  routedEdges: {},
  edgeContextMenu: null,
  roomContextMenu: null,
  debugEdges: false,
  resizeGuides: [],
  isDemo: false,
  isDragging: false,
  undoSize: 0,
  redoSize: 0,
  printView: false,
  printPaperId: "arch-d",
  printOrientation: "landscape" as Orientation,
  printScale: 1.0,
  titleBlock: { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
  titleBlockLayout: createDefaultLayout(),
  signalColors: undefined,
  reportLayouts: {},
  globalReportHeaderLayout: null,
  globalReportFooterLayout: null,
  hiddenSignalTypes: "",
  hideDeviceTypes: false,
  hideUnconnectedPorts: false,
  templateHiddenSignals: {},
  templatePresets: {},
  favoriteTemplates: [],
  scrollConfig: { ...DEFAULT_SCROLL_CONFIG },
  cableNamingScheme: "type-prefix" as "sequential" | "type-prefix",
  showLineJumps: true,
  showConnectionLabels: true,
  cableIdMap: {},
  pendingIncompatibleConnection: null,

  onNodesChange: (changes) => {
    const updated = applyNodeChanges(changes, get().nodes) as SchematicNode[];
    // Keep room zIndex pinned low (React Flow may reset it)
    set({
      nodes: updated.map((n) =>
        n.type === "room" ? { ...n, zIndex: -1 } : n,
      ),
    });
    get().saveToLocalStorage();
  },

  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === "remove")) {
      const state = get();
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }
    set({ edges: applyEdgeChanges(changes, get().edges) as ConnectionEdge[] });
    get().saveToLocalStorage();
  },

  onConnect: (connection) => {
    const state = get();
    if (!state.isValidConnection(connection)) {
      // Check if the failure is specifically a signal-type mismatch
      const srcPort = getPortFromHandle(state.nodes, connection.source, connection.sourceHandle);
      const tgtPort = getPortFromHandle(state.nodes, connection.target, connection.targetHandle);
      if (srcPort && tgtPort) {
        const canSource = srcPort.direction === "output" || srcPort.direction === "bidirectional";
        const canTarget = tgtPort.direction === "input" || tgtPort.direction === "bidirectional";
        if (canSource && canTarget && srcPort.signalType !== tgtPort.signalType) {
          set({ pendingIncompatibleConnection: { connection, sourcePort: srcPort, targetPort: tgtPort } });
        }
      }
      return;
    }
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const sourcePort = getPortFromHandle(
      state.nodes,
      connection.source,
      connection.sourceHandle,
    );
    const targetPort = getPortFromHandle(
      state.nodes,
      connection.target,
      connection.targetHandle,
    );

    const connectorMismatch = !areConnectorsCompatible(
      sourcePort?.connectorType,
      targetPort?.connectorType,
    );

    const newEdge: ConnectionEdge = {
      id: nextEdgeId(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      data: {
        signalType: sourcePort?.signalType ?? "custom",
        ...(connectorMismatch ? { connectorMismatch: true } : {}),
      },
      style: {
        stroke: `var(--color-${sourcePort?.signalType ?? "custom"})`,
        strokeWidth: 2,
      },
    };

    set({ edges: [...state.edges, newEdge] });
    get().saveToLocalStorage();
  },

  addDevice: (template, position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Check for a project preset for this template
    const preset = template.id ? state.templatePresets[template.id] : undefined;

    let ports: Port[];
    let hiddenPorts: string[] | undefined;
    let color = template.color;

    if (preset) {
      // Clone preset ports, then map preset hiddenPorts through old→new ID mapping
      const cloned = clonePorts(preset.ports);
      const idMap = new Map<string, string>();
      preset.ports.forEach((p, i) => { idMap.set(p.id, cloned[i].id); });
      ports = cloned;
      hiddenPorts = preset.hiddenPorts?.map((id) => idMap.get(id) ?? id).filter((id) => cloned.some((p) => p.id === id));
      color = preset.color ?? template.color;
    } else {
      ports = clonePorts(template.ports);
    }

    // Initialize expansion slots from template
    let installedSlots: InstalledSlot[] | undefined;
    if (template.slots && template.slots.length > 0) {
      installedSlots = [];
      for (const slotDef of template.slots) {
        const cardTpl = slotDef.defaultCardId ? getTemplateById(slotDef.defaultCardId) : undefined;
        if (cardTpl) {
          const cardPorts = cloneCardPorts(cardTpl.ports, slotDef.id, slotDef.label);
          ports = [...ports, ...cardPorts];
          installedSlots.push({
            slotId: slotDef.id,
            label: slotDef.label,
            cardTemplateId: cardTpl.id,
            cardLabel: cardTpl.label,
            cardManufacturer: cardTpl.manufacturer,
            cardModelNumber: cardTpl.modelNumber,
            portIds: cardPorts.map((p) => p.id),
          });
        } else {
          installedSlots.push({
            slotId: slotDef.id,
            label: slotDef.label,
            portIds: [],
          });
        }
      }
    }

    const newNode: DeviceNode = {
      id: nextNodeId(),
      type: "device",
      position,
      data: {
        label: template.label,
        deviceType: template.deviceType,
        ports,
        color,
        baseLabel: template.label,
        model: template.label,
        ...(template.id ? { templateId: template.id } : {}),
        ...(template.version ? { templateVersion: template.version } : {}),
        ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
        ...(template.modelNumber ? { modelNumber: template.modelNumber } : {}),
        ...(hiddenPorts && hiddenPorts.length > 0 ? { hiddenPorts } : {}),
        ...(template.deviceType === "cable-accessory" ? { isCableAccessory: true } : {}),
        ...(template.deviceType === "cable-accessory" &&
          template.ports.some((p) => p.isMulticable && p.connectorType === "none")
          ? { integratedWithCable: true }
          : {}),
        ...(installedSlots && installedSlots.length > 0 ? { slots: installedSlots } : {}),
      },
    };
    set({ nodes: renumberNodes([...get().nodes, newNode]) });
    get().saveToLocalStorage();
  },

  removeSelected: () => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const selectedNodeIds = new Set(
      state.nodes.filter((n) => n.selected).map((n) => n.id),
    );
    const selectedEdgeIds = new Set(
      state.edges.filter((e) => e.selected).map((e) => e.id),
    );

    // Un-parent children of deleted rooms
    const deletedRoomIds = new Set(
      state.nodes
        .filter((n) => n.type === "room" && selectedNodeIds.has(n.id))
        .map((n) => n.id),
    );

    // Also remove edges connected to deleted nodes
    const newEdges = state.edges.filter(
      (e) =>
        !selectedEdgeIds.has(e.id) &&
        !selectedNodeIds.has(e.source) &&
        !selectedNodeIds.has(e.target),
    );

    const remainingNodes = state.nodes
      .filter((n) => !n.selected)
      .map((n) => {
        if (n.parentId && deletedRoomIds.has(n.parentId)) {
          // Convert to absolute position
          const room = state.nodes.find((r) => r.id === n.parentId);
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            position: room
              ? { x: n.position.x + room.position.x, y: n.position.y + room.position.y }
              : n.position,
          };
        }
        return n;
      });

    set({
      nodes: renumberNodes(remainingNodes),
      edges: newEdges,
    });
    get().saveToLocalStorage();
  },

  copySelected: () => {
    const state = get();
    const selectedNodes = state.nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedEdges = state.edges.filter(
      (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
    );

    // Compute bounding box height of selection
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of selectedNodes) {
      const h = n.measured?.height ?? 60;
      minY = Math.min(minY, n.position.y);
      maxY = Math.max(maxY, n.position.y + h);
    }

    clipboard = {
      nodes: selectedNodes.map((n) => structuredClone(n)),
      edges: connectedEdges.map((e) => structuredClone(e)),
      boundsHeight: maxY - minY,
    };
  },

  pasteClipboard: () => {
    if (!clipboard || clipboard.nodes.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Build old ID → new ID mapping for nodes and ports
    const nodeIdMap = new Map<string, string>();
    const portIdMap = new Map<string, string>();

    const yOffset = clipboard.boundsHeight + PASTE_GAP;

    const newNodes: SchematicNode[] = clipboard.nodes.map((n) => {
      const newId = n.type === "room" ? nextRoomId() : nextNodeId();
      nodeIdMap.set(n.id, newId);
      if (n.type === "device") {
        const deviceData = n.data as DeviceData;
        const newPorts = clonePorts(deviceData.ports);
        deviceData.ports.forEach((oldPort: Port, i: number) => {
          portIdMap.set(oldPort.id, newPorts[i].id);
        });
        return {
          ...n,
          id: newId,
          position: { x: n.position.x, y: n.position.y + yOffset },
          selected: true,
          data: { ...deviceData, ports: newPorts },
        } as DeviceNode;
      }
      return {
        ...n,
        id: newId,
        position: { x: n.position.x, y: n.position.y + yOffset },
        selected: true,
      };
    });

    const newEdges: ConnectionEdge[] = clipboard.edges.map((e) => ({
      ...e,
      id: nextEdgeId(),
      source: nodeIdMap.get(e.source) ?? e.source,
      target: nodeIdMap.get(e.target) ?? e.target,
      sourceHandle: e.sourceHandle ? (portIdMap.get(e.sourceHandle) ?? e.sourceHandle) : e.sourceHandle,
      targetHandle: e.targetHandle ? (portIdMap.get(e.targetHandle) ?? e.targetHandle) : e.targetHandle,
    }));

    // Deselect existing nodes/edges, add pasted ones as selected
    const current = get();
    set({
      nodes: renumberNodes([
        ...current.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...newNodes,
      ]),
      edges: [
        ...current.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
        ...newEdges,
      ],
    });

    // Update clipboard positions so repeated paste keeps offsetting
    clipboard = {
      nodes: clipboard.nodes.map((n) => ({
        ...n,
        position: { x: n.position.x, y: n.position.y + yOffset },
      })),
      edges: clipboard.edges,
      boundsHeight: clipboard.boundsHeight,
    };

    get().saveToLocalStorage();
  },

  alignSelectedNodes: (op) => {
    const state = get();
    const selected = state.nodes.filter((n) => n.selected);
    const updates = computeAlignment(selected, op);
    if (updates.size === 0) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        const pos = updates.get(n.id);
        return pos ? { ...n, position: pos } : n;
      }),
    });
    get().saveToLocalStorage();
  },

  isValidConnection: (connection) => {
    const state = get();
    const sourcePort = getPortFromHandle(
      state.nodes,
      connection.source,
      connection.sourceHandle,
    );
    const targetPort = getPortFromHandle(
      state.nodes,
      connection.target,
      connection.targetHandle,
    );

    if (!sourcePort || !targetPort) return false;
    // Source must be output or bidirectional, target must be input or bidirectional
    const canSource = sourcePort.direction === "output" || sourcePort.direction === "bidirectional";
    const canTarget = targetPort.direction === "input" || targetPort.direction === "bidirectional";
    if (!canSource || !canTarget) return false;
    if (sourcePort.signalType !== targetPort.signalType) return false;

    // Multicable ports can only connect to other multicable ports
    const srcIsMulticable = sourcePort.isMulticable ?? false;
    const tgtIsMulticable = targetPort.isMulticable ?? false;
    if (srcIsMulticable !== tgtIsMulticable) return false;

    // Don't allow multiple connections to the same handle (input or output)
    const duplicateTarget = state.edges.some(
      (e) =>
        e.id !== _reconnectingEdgeId &&
        e.target === connection.target &&
        e.targetHandle === connection.targetHandle,
    );
    if (duplicateTarget) return false;

    const duplicateSource = state.edges.some(
      (e) =>
        e.id !== _reconnectingEdgeId &&
        e.source === connection.source &&
        e.sourceHandle === connection.sourceHandle,
    );
    if (duplicateSource) return false;

    // For bidirectional ports, block the opposite side if one side is already connected
    if (sourcePort.direction === "bidirectional" && connection.sourceHandle) {
      const baseId = connection.sourceHandle.replace(/-(in|out)$/, "");
      const otherHandle = connection.sourceHandle.endsWith("-out")
        ? `${baseId}-in`
        : `${baseId}-out`;
      const otherConnected = state.edges.some(
        (e) =>
          (e.source === connection.source && e.sourceHandle === otherHandle) ||
          (e.target === connection.source && e.targetHandle === otherHandle),
      );
      if (otherConnected) return false;
    }
    if (targetPort.direction === "bidirectional" && connection.targetHandle) {
      const baseId = connection.targetHandle.replace(/-(in|out)$/, "");
      const otherHandle = connection.targetHandle.endsWith("-in")
        ? `${baseId}-out`
        : `${baseId}-in`;
      const otherConnected = state.edges.some(
        (e) =>
          (e.source === connection.target && e.sourceHandle === otherHandle) ||
          (e.target === connection.target && e.targetHandle === otherHandle),
      );
      if (otherConnected) return false;
    }

    return true;
  },

  updateDeviceLabel: (nodeId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: renumberNodes(state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...n.data, label, baseLabel: undefined } } as DeviceNode;
      })),
    });
    get().saveToLocalStorage();
  },

  batchUpdateDeviceLabels: (changes) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const changeMap = new Map(changes.map((c) => [c.nodeId, c.label]));
    set({
      nodes: renumberNodes(state.nodes.map((n) => {
        if (n.type !== "device") return n;
        const label = changeMap.get(n.id);
        if (label === undefined) return n;
        return { ...n, data: { ...n.data, label, baseLabel: undefined } } as DeviceNode;
      })),
    });
    get().saveToLocalStorage();
  },

  updateDevice: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: renumberNodes(state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...data, baseLabel: undefined } } as DeviceNode;
      })),
    });
    get().saveToLocalStorage();
  },

  patchDeviceData: (nodeId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...n.data, ...patch } } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  swapCard: (nodeId, slotId, cardTemplateId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];
    const slotIdx = slots.findIndex((s) => s.slotId === slotId);
    if (slotIdx === -1) return;

    const oldSlot = slots[slotIdx];
    const oldPortIds = new Set(oldSlot.portIds);

    // Remove old card's ports
    let newPorts = data.ports.filter((p) => !oldPortIds.has(p.id));

    // Remove edges connected to old card's ports
    const newEdges = oldPortIds.size > 0
      ? state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && oldPortIds.has(srcHandle)) return false;
          if (e.target === nodeId && oldPortIds.has(tgtHandle)) return false;
          // Also check bidirectional suffixes
          if (e.source === nodeId && oldPortIds.has(srcHandle.replace(/-(in|out)$/, ""))) return false;
          if (e.target === nodeId && oldPortIds.has(tgtHandle.replace(/-(in|out)$/, ""))) return false;
          return true;
        })
      : state.edges;

    // Build new slot
    let newSlot: InstalledSlot;
    if (cardTemplateId) {
      const cardTpl = getTemplateById(cardTemplateId);
      if (!cardTpl) return;
      const cardPorts = cloneCardPorts(cardTpl.ports, slotId, oldSlot.label);
      newPorts = [...newPorts, ...cardPorts];
      newSlot = {
        slotId,
        label: oldSlot.label,
        cardTemplateId: cardTpl.id,
        cardLabel: cardTpl.label,
        cardManufacturer: cardTpl.manufacturer,
        cardModelNumber: cardTpl.modelNumber,
        portIds: cardPorts.map((p) => p.id),
      };
    } else {
      newSlot = {
        slotId,
        label: oldSlot.label,
        portIds: [],
      };
    }

    const newSlots = slots.map((s, i) => (i === slotIdx ? newSlot : s));

    const newNode = {
      ...node,
      data: { ...data, ports: newPorts, slots: newSlots },
    } as DeviceNode;

    const newNodes = state.nodes.map((n, i) => (i === nodeIdx ? newNode : n));
    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  setEditingNodeId: (id) => {
    set({ editingNodeId: id });
  },

  addRoom: (label, position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newRoom: SchematicNode = {
      id: nextRoomId(),
      type: "room",
      position,
      data: { label },
      style: { width: 400, height: 300 },
      zIndex: -1,
    };
    // Rooms must appear before their potential children in the array
    set({ nodes: [newRoom, ...state.nodes] });
    get().saveToLocalStorage();
  },

  updateRoomLabel: (nodeId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...n.data, label } } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  updateRoom: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "room") return n;
        // Preserve locked state when RoomEditor reconstructs data
        const wasLocked = (n.data as import("./types").RoomData).locked;
        const merged = wasLocked ? { ...data, locked: true } : data;
        return { ...n, data: merged } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  toggleRoomLock: (nodeId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "room") return n;
        const wasLocked = (n.data as import("./types").RoomData).locked;
        const locked = !wasLocked;
        return {
          ...n,
          draggable: locked ? false : undefined,
          data: {
            ...n.data,
            locked: locked || undefined, // keep JSON clean
          },
        } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  addNote: (position) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newNote: SchematicNode = {
      id: nextNoteId(),
      type: "note",
      position,
      data: { html: "" },
      style: { width: 200, height: 100 },
    };
    set({ nodes: [...state.nodes, newNote] });
    get().saveToLocalStorage();
  },

  updateNoteHtml: (nodeId, html) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId && n.type === "note"
          ? { ...n, data: { ...n.data, html } } as SchematicNode
          : n,
      ),
    });
    get().saveToLocalStorage();
  },

  reparentNode: (nodeId, absolutePosition) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === "room") return;

    // Find which room (if any) the node's center falls inside
    const nodeW = node.measured?.width ?? 180;
    const nodeH = node.measured?.height ?? 60;
    const centerX = absolutePosition.x + nodeW / 2;
    const centerY = absolutePosition.y + nodeH / 2;

    let targetRoom: SchematicNode | undefined;
    for (const n of state.nodes) {
      if (n.type !== "room") continue;
      const rw = n.measured?.width ?? (n.style?.width as number) ?? (n.width as number) ?? 400;
      const rh = n.measured?.height ?? (n.style?.height as number) ?? (n.height as number) ?? 300;
      if (
        centerX >= n.position.x && centerX <= n.position.x + rw &&
        centerY >= n.position.y && centerY <= n.position.y + rh
      ) {
        targetRoom = n;
        break;
      }
    }

    const currentParent = node.parentId;
    const newParent = targetRoom?.id;

    if (currentParent === newParent) return; // no change

    pushUndo({ nodes: state.nodes, edges: state.edges });

    let updated = state.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      if (newParent && targetRoom) {
        // Reparent into room — convert to relative position
        return {
          ...n,
          parentId: newParent,
          position: {
            x: absolutePosition.x - targetRoom.position.x,
            y: absolutePosition.y - targetRoom.position.y,
          },
        };
      } else {
        // Un-parent — use absolute position
        return {
          ...n,
          parentId: undefined,
          position: absolutePosition,
        };
      }
    });

    // Ensure parent nodes come before children in the array
    updated = sortNodesParentFirst(updated);

    set({ nodes: updated });
    get().saveToLocalStorage();
  },

  pushSnapshot: () => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ undoSize: undoStack.length, redoSize: 0 });
  },

  setPendingUndoSnapshot: () => {
    const state = get();
    pendingUndoSnapshot = { nodes: state.nodes, edges: state.edges };
  },

  clearPendingUndoSnapshot: () => {
    pendingUndoSnapshot = null;
  },

  undo: () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const state = get();
    redoStack.push({ nodes: state.nodes, edges: state.edges });
    set({ nodes: prev.nodes, edges: prev.edges, undoSize: undoStack.length, redoSize: redoStack.length });
    get().saveToLocalStorage();
  },

  redo: () => {
    const next = redoStack.pop();
    if (!next) return;
    const state = get();
    undoStack.push({ nodes: state.nodes, edges: state.edges });
    set({ nodes: next.nodes, edges: next.edges, undoSize: undoStack.length, redoSize: redoStack.length });
    get().saveToLocalStorage();
  },

  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

  selectAll: () => {
    const state = get();
    set({
      nodes: state.nodes.map((n) => ({ ...n, selected: true })),
      edges: state.edges.map((e) => ({ ...e, selected: true })),
    });
  },

  addCustomTemplate: (template) => {
    const updated = [...get().customTemplates, template];
    set({ customTemplates: updated });
    saveCustomTemplates(updated);
  },

  removeCustomTemplate: (deviceType) => {
    const updated = get().customTemplates.filter((t) => t.deviceType !== deviceType);
    set({ customTemplates: updated });
    saveCustomTemplates(updated);
  },

  dismissIncompatibleDialog: () => {
    set({ pendingIncompatibleConnection: null });
  },

  forceIncompatibleConnection: () => {
    const state = get();
    const pending = state.pendingIncompatibleConnection;
    if (!pending) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const newEdge: ConnectionEdge = {
      id: nextEdgeId(),
      source: pending.connection.source,
      target: pending.connection.target,
      sourceHandle: pending.connection.sourceHandle,
      targetHandle: pending.connection.targetHandle,
      data: {
        signalType: pending.sourcePort.signalType,
        connectorMismatch: true,
        allowIncompatible: true,
      },
      style: {
        stroke: `var(--color-${pending.sourcePort.signalType})`,
        strokeWidth: 2,
      },
    };

    set({ edges: [...state.edges, newEdge], pendingIncompatibleConnection: null });
    get().saveToLocalStorage();
  },

  insertAdapterBetween: (template) => {
    const state = get();
    const pending = state.pendingIncompatibleConnection;
    if (!pending) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Resolve source and target device absolute positions for midpoint
    const sourceNode = state.nodes.find((n) => n.id === pending.connection.source);
    const targetNode = state.nodes.find((n) => n.id === pending.connection.target);
    if (!sourceNode || !targetNode) {
      set({ pendingIncompatibleConnection: null });
      return;
    }

    // Compute absolute positions (accounting for room parents)
    const absPos = (node: SchematicNode): { x: number; y: number } => {
      if (!node.parentId) return node.position;
      const parent = state.nodes.find((n) => n.id === node.parentId);
      if (!parent) return node.position;
      return { x: node.position.x + parent.position.x, y: node.position.y + parent.position.y };
    };

    const srcAbs = absPos(sourceNode);
    const tgtAbs = absPos(targetNode);
    const srcW = sourceNode.measured?.width ?? 180;
    const tgtW = targetNode.measured?.width ?? 180;

    // Midpoint between the right edge of the left device and left edge of the right device
    // (or just center-to-center if they're stacked vertically)
    const srcCenterX = srcAbs.x + srcW / 2;
    const tgtCenterX = tgtAbs.x + tgtW / 2;
    const srcCenterY = srcAbs.y + (sourceNode.measured?.height ?? 60) / 2;
    const tgtCenterY = tgtAbs.y + (targetNode.measured?.height ?? 60) / 2;

    let idealX = Math.round(((srcCenterX + tgtCenterX) / 2) / GRID_SIZE) * GRID_SIZE;
    let idealY = Math.round(((srcCenterY + tgtCenterY) / 2) / GRID_SIZE) * GRID_SIZE;

    // If both are in the same room, parent the adapter there too
    const adapterParentId = (sourceNode.parentId && sourceNode.parentId === targetNode.parentId)
      ? sourceNode.parentId : undefined;

    // Convert back to parent-relative coords if parented
    if (adapterParentId) {
      const parentNode = state.nodes.find((n) => n.id === adapterParentId);
      if (parentNode) {
        idealX -= parentNode.position.x;
        idealY -= parentNode.position.y;
      }
    }

    // Snap to grid
    idealX = Math.round(idealX / GRID_SIZE) * GRID_SIZE;
    idealY = Math.round(idealY / GRID_SIZE) * GRID_SIZE;

    // Create adapter device
    const preset = template.id ? state.templatePresets[template.id] : undefined;
    let adapterPorts: Port[];
    let hiddenPorts: string[] | undefined;
    let color = template.color;

    if (preset) {
      const cloned = clonePorts(preset.ports);
      const idMap = new Map<string, string>();
      preset.ports.forEach((p, i) => { idMap.set(p.id, cloned[i].id); });
      adapterPorts = cloned;
      hiddenPorts = preset.hiddenPorts?.map((id) => idMap.get(id) ?? id).filter((id) => cloned.some((p) => p.id === id));
      color = preset.color ?? template.color;
    } else {
      adapterPorts = clonePorts(template.ports);
    }

    const adapterId = nextNodeId();
    let adapterNode: DeviceNode = {
      id: adapterId,
      type: "device",
      position: { x: idealX, y: idealY },
      ...(adapterParentId ? { parentId: adapterParentId } : {}),
      data: {
        label: template.label,
        deviceType: template.deviceType,
        ports: adapterPorts,
        color,
        baseLabel: template.label,
        model: template.label,
        ...(template.id ? { templateId: template.id } : {}),
        ...(template.version ? { templateVersion: template.version } : {}),
        ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
        ...(template.modelNumber ? { modelNumber: template.modelNumber } : {}),
        ...(hiddenPorts && hiddenPorts.length > 0 ? { hiddenPorts } : {}),
      },
    };

    // Nudge adapter position if it overlaps existing devices
    const MIN_GAP = GRID_SIZE * 5; // 100px — enough for stubs + routing
    const adapterW = 180; // approximate width before measurement
    const adapterH = 60;
    let posX = adapterNode.position.x;
    const posY = adapterNode.position.y;
    for (const other of state.nodes) {
      if (other.type !== "device") continue;
      if (other.parentId !== adapterParentId) continue;
      const ow = other.measured?.width ?? 180;
      const oh = other.measured?.height ?? 60;
      // Check AABB overlap with gap
      const overlapX = posX < other.position.x + ow + MIN_GAP && posX + adapterW + MIN_GAP > other.position.x;
      const overlapY = posY < other.position.y + oh && posY + adapterH > other.position.y;
      if (overlapX && overlapY) {
        // Push horizontally toward the midpoint direction
        const pushRight = other.position.x + ow + MIN_GAP;
        const pushLeft = other.position.x - adapterW - MIN_GAP;
        // Pick whichever side is closer to the ideal position
        if (Math.abs(pushRight - idealX) < Math.abs(pushLeft - idealX)) {
          posX = Math.round(pushRight / GRID_SIZE) * GRID_SIZE;
        } else {
          posX = Math.round(pushLeft / GRID_SIZE) * GRID_SIZE;
        }
      }
    }
    adapterNode = { ...adapterNode, position: { x: posX, y: posY } };

    // Find matching ports on adapter
    const adapterInput = adapterPorts.find(
      (p) => (p.direction === "input" || p.direction === "bidirectional") && p.signalType === pending.sourcePort.signalType,
    );
    const adapterOutput = adapterPorts.find(
      (p) => (p.direction === "output" || p.direction === "bidirectional") && p.signalType === pending.targetPort.signalType,
    );

    const newEdges: ConnectionEdge[] = [];

    if (adapterInput) {
      const inputHandle = adapterInput.direction === "bidirectional" ? `${adapterInput.id}-in` : adapterInput.id;
      newEdges.push({
        id: nextEdgeId(),
        source: pending.connection.source,
        target: adapterId,
        sourceHandle: pending.connection.sourceHandle,
        targetHandle: inputHandle,
        data: {
          signalType: pending.sourcePort.signalType,
          ...(!areConnectorsCompatible(pending.sourcePort.connectorType, adapterInput.connectorType) ? { connectorMismatch: true } : {}),
        },
        style: {
          stroke: `var(--color-${pending.sourcePort.signalType})`,
          strokeWidth: 2,
        },
      });
    }

    if (adapterOutput) {
      const outputHandle = adapterOutput.direction === "bidirectional" ? `${adapterOutput.id}-out` : adapterOutput.id;
      newEdges.push({
        id: nextEdgeId(),
        source: adapterId,
        target: pending.connection.target,
        sourceHandle: outputHandle,
        targetHandle: pending.connection.targetHandle,
        data: {
          signalType: pending.targetPort.signalType,
          ...(!areConnectorsCompatible(adapterOutput.connectorType, pending.targetPort.connectorType) ? { connectorMismatch: true } : {}),
        },
        style: {
          stroke: `var(--color-${pending.targetPort.signalType})`,
          strokeWidth: 2,
        },
      });
    }

    const updatedNodes = renumberNodes([...state.nodes, adapterNode]);
    set({
      nodes: updatedNodes,
      edges: [...state.edges, ...newEdges],
      pendingIncompatibleConnection: null,
    });
    get().saveToLocalStorage();
  },

  setPrintView: (v) => { set({ printView: v }); },
  setPrintPaperId: (id) => { set({ printPaperId: id }); get().saveToLocalStorage(); },
  setPrintOrientation: (o) => { set({ printOrientation: o }); get().saveToLocalStorage(); },
  setPrintScale: (s) => { set({ printScale: Math.max(0.25, Math.min(2, s)) }); get().saveToLocalStorage(); },
  setTitleBlock: (tb) => { set({ titleBlock: tb }); get().saveToLocalStorage(); },
  setTitleBlockLayout: (layout) => { set({ titleBlockLayout: layout }); get().saveToLocalStorage(); },

  setSignalColors: (colors) => {
    const overrides = getSignalColorOverrides(colors);
    set({ signalColors: overrides });
    applySignalColors(colors);
    saveSignalColors(colors);
    get().saveToLocalStorage();
  },

  toggleSignalTypeVisibility: (type) => {
    const current = get().hiddenSignalTypes;
    const set_ = new Set(current ? current.split(",").filter(Boolean) : []);
    if (set_.has(type)) set_.delete(type);
    else set_.add(type);
    const next = [...set_].sort().join(",");
    set({ hiddenSignalTypes: next });
    get().saveToLocalStorage();
  },

  setHideDeviceTypes: (hide) => {
    set({ hideDeviceTypes: hide });
    get().saveToLocalStorage();
  },

  setHideUnconnectedPorts: (hide) => {
    set({ hideUnconnectedPorts: hide });
    get().saveToLocalStorage();
  },

  setTemplateHiddenSignals: (templateId, hidden) => {
    const current = get().templateHiddenSignals;
    if (hidden.length === 0) {
      const { [templateId]: _, ...rest } = current;
      set({ templateHiddenSignals: rest });
    } else {
      set({ templateHiddenSignals: { ...current, [templateId]: hidden } });
    }
    get().saveToLocalStorage();
  },

  setReportLayout: (key, layout) => {
    set({ reportLayouts: { ...get().reportLayouts, [key]: layout } });
    get().saveToLocalStorage();
  },

  setGlobalReportHeaderLayout: (layout) => {
    set({ globalReportHeaderLayout: layout });
    get().saveToLocalStorage();
  },
  setGlobalReportFooterLayout: (layout) => {
    set({ globalReportFooterLayout: layout });
    get().saveToLocalStorage();
  },

  showAllSignalTypes: () => {
    set({ hiddenSignalTypes: "" });
    get().saveToLocalStorage();
  },

  setTemplatePreset: (templateId, preset) => {
    const current = get().templatePresets;
    if (preset === null) {
      const { [templateId]: _, ...rest } = current;
      set({ templatePresets: rest });
    } else {
      set({ templatePresets: { ...current, [templateId]: preset } });
    }
    get().saveToLocalStorage();
  },

  toggleFavoriteTemplate: (templateKey) => {
    const current = get().favoriteTemplates;
    const next = current.includes(templateKey)
      ? current.filter((k) => k !== templateKey)
      : [...current, templateKey];
    set({ favoriteTemplates: next });
    get().saveToLocalStorage();
  },

  setScrollConfig: (v) => {
    set({ scrollConfig: v });
    get().saveToLocalStorage();
  },

  setCableNamingScheme: (v) => {
    set({ cableNamingScheme: v });
    get().saveToLocalStorage();
  },

  setShowLineJumps: (show) => {
    set({ showLineJumps: show });
    get().saveToLocalStorage();
  },

  setShowConnectionLabels: (show) => {
    set({ showConnectionLabels: show });
    get().saveToLocalStorage();
  },

  recomputeCableIds: () => {
    const state = get();
    const rows = computeCableSchedule(state.nodes, state.edges, state.cableNamingScheme);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.edgeId] = r.cableId;
    set({ cableIdMap: map });
  },

  exportCustomTemplates: () => {
    return structuredClone(get().customTemplates);
  },

  importCustomTemplates: (templates) => {
    const existing = get().customTemplates;
    const existingTypes = new Set(existing.map((t) => t.deviceType));
    const newTemplates = templates.filter((t) => !existingTypes.has(t.deviceType));
    if (newTemplates.length > 0) {
      const merged = [...existing, ...newTemplates];
      set({ customTemplates: merged });
      saveCustomTemplates(merged);
    }
  },

  saveToLocalStorage: () => {
    if (!hydrated) return;
    const state = get();
    const data: SchematicFile = {
      version: CURRENT_SCHEMA_VERSION,
      name: state.schematicName,
      nodes: state.nodes,
      edges: state.edges,
      signalColors: state.signalColors,
      printPaperId: state.printPaperId,
      printOrientation: state.printOrientation,
      printScale: state.printScale,
      titleBlock: state.titleBlock,
      titleBlockLayout: state.titleBlockLayout,
      hiddenSignalTypes: state.hiddenSignalTypes ? state.hiddenSignalTypes.split(",") as SignalType[] : undefined,
      hideDeviceTypes: state.hideDeviceTypes || undefined,
      hideUnconnectedPorts: state.hideUnconnectedPorts || undefined,
      templateHiddenSignals: Object.keys(state.templateHiddenSignals).length > 0 ? state.templateHiddenSignals : undefined,
      templatePresets: Object.keys(state.templatePresets).length > 0 ? state.templatePresets : undefined,
      favoriteTemplates: state.favoriteTemplates.length > 0 ? state.favoriteTemplates : undefined,
      reportLayouts: Object.keys(state.reportLayouts).length > 0 ? state.reportLayouts : undefined,
      globalReportHeaderLayout: state.globalReportHeaderLayout ?? undefined,
      globalReportFooterLayout: state.globalReportFooterLayout ?? undefined,
      scrollConfig: isDefaultScrollConfig(state.scrollConfig) ? undefined : state.scrollConfig,
      cableNamingScheme: state.cableNamingScheme !== "type-prefix" ? state.cableNamingScheme : undefined,
      showLineJumps: !state.showLineJumps ? false : undefined,
      showConnectionLabels: !state.showConnectionLabels ? false : undefined,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — silently fail
    }
  },

  loadFromLocalStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Load default demo schematic for first-time visitors
        // Dynamically import to avoid bundling in the critical path
        import("./defaultSchematic.json").then((mod) => {
          // Only load if still empty (no race with user actions)
          if (get().nodes.length > 0) return;
          const data = migrateSchematic(mod.default) as SchematicFile;
          snapNodesToGrid(data.nodes);
          applyRoomLockState(data.nodes);
          syncCounters(data.nodes, data.edges);
          const colors = data.signalColors ?? {};
          applySignalColors(colors);
          saveSignalColors({ ...loadSignalColors(), ...colors });
          set({
            nodes: data.nodes,
            edges: data.edges,
            isDemo: true,
            schematicName: data.name ?? "Demo Schematic",
            signalColors: data.signalColors,
            printPaperId: data.printPaperId ?? "arch-d",
            printOrientation: data.printOrientation ?? "landscape",
            printScale: data.printScale ?? 1.0,
            titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
            titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
            hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
            hideDeviceTypes: data.hideDeviceTypes ?? false,
            hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
            templateHiddenSignals: data.templateHiddenSignals ?? {},
            templatePresets: data.templatePresets ?? {},
            favoriteTemplates: data.favoriteTemplates ?? [],
            reportLayouts: data.reportLayouts ?? {},
            globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
            globalReportFooterLayout: data.globalReportFooterLayout ?? null,
            scrollConfig: resolveScrollConfig(data),
            cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
            showLineJumps: data.showLineJumps ?? true,
            showConnectionLabels: data.showConnectionLabels ?? true,
          });
          hydrated = true;
          get().saveToLocalStorage();
        });
        return false;
      }
      const data = migrateSchematic(JSON.parse(raw)) as SchematicFile;
      snapNodesToGrid(data.nodes);
      applyRoomLockState(data.nodes);
      syncCounters(data.nodes, data.edges);
      // Always apply colors — if file has none, reset to defaults
      const colors = data.signalColors ?? {};
      applySignalColors(colors);
      saveSignalColors({ ...loadSignalColors(), ...colors });
      set({
        nodes: data.nodes,
        edges: data.edges,
        schematicName: data.name ?? "Untitled Schematic",
        signalColors: data.signalColors,
        printPaperId: data.printPaperId ?? "arch-d",
        printOrientation: data.printOrientation ?? "landscape",
        printScale: data.printScale ?? 1.0,
        titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
        titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
        hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
        hideDeviceTypes: data.hideDeviceTypes ?? false,
        hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
        templateHiddenSignals: data.templateHiddenSignals ?? {},
        templatePresets: data.templatePresets ?? {},
        favoriteTemplates: data.favoriteTemplates ?? [],
        reportLayouts: data.reportLayouts ?? {},
        globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
        globalReportFooterLayout: data.globalReportFooterLayout ?? null,
        scrollConfig: resolveScrollConfig(data),
        cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
        showLineJumps: data.showLineJumps ?? true,
        showConnectionLabels: data.showConnectionLabels ?? true,
      });
      hydrated = true;
      return true;
    } catch {
      hydrated = true;
      return false;
    }
  },

  exportToJSON: () => {
    const state = get();
    return {
      version: CURRENT_SCHEMA_VERSION,
      name: state.schematicName,
      nodes: state.nodes,
      edges: state.edges,
      customTemplates: state.customTemplates.length > 0 ? state.customTemplates : undefined,
      signalColors: state.signalColors,
      printPaperId: state.printPaperId,
      printOrientation: state.printOrientation,
      printScale: state.printScale,
      titleBlock: state.titleBlock,
      titleBlockLayout: state.titleBlockLayout,
      hiddenSignalTypes: state.hiddenSignalTypes ? state.hiddenSignalTypes.split(",") as SignalType[] : undefined,
      hideDeviceTypes: state.hideDeviceTypes || undefined,
      hideUnconnectedPorts: state.hideUnconnectedPorts || undefined,
      templateHiddenSignals: Object.keys(state.templateHiddenSignals).length > 0 ? state.templateHiddenSignals : undefined,
      templatePresets: Object.keys(state.templatePresets).length > 0 ? state.templatePresets : undefined,
      favoriteTemplates: state.favoriteTemplates.length > 0 ? state.favoriteTemplates : undefined,
      reportLayouts: Object.keys(state.reportLayouts).length > 0 ? state.reportLayouts : undefined,
      globalReportHeaderLayout: state.globalReportHeaderLayout ?? undefined,
      globalReportFooterLayout: state.globalReportFooterLayout ?? undefined,
      scrollConfig: isDefaultScrollConfig(state.scrollConfig) ? undefined : state.scrollConfig,
      cableNamingScheme: state.cableNamingScheme !== "type-prefix" ? state.cableNamingScheme : undefined,
      showLineJumps: !state.showLineJumps ? false : undefined,
      showConnectionLabels: !state.showConnectionLabels ? false : undefined,
    };
  },

  importFromJSON: (rawData) => {
    const data = migrateSchematic(rawData) as SchematicFile;
    const nodes = data.nodes ?? [];
    const edges = data.edges ?? [];
    // Sanitize note HTML to prevent XSS from malicious schematic files
    for (const node of nodes) {
      if (node.type === "note" && node.data && "html" in node.data) {
        (node.data as { html: string }).html = sanitizeNoteHtml((node.data as { html: string }).html);
      }
    }
    snapNodesToGrid(nodes);
    applyRoomLockState(nodes);
    syncCounters(nodes, edges);
    // Merge imported custom templates with existing ones (avoid duplicates by deviceType)
    if (data.customTemplates?.length) {
      const existing = get().customTemplates;
      const existingTypes = new Set(existing.map((t) => t.deviceType));
      const newTemplates = data.customTemplates.filter((t) => !existingTypes.has(t.deviceType));
      if (newTemplates.length > 0) {
        const merged = [...existing, ...newTemplates];
        set({ customTemplates: merged });
        saveCustomTemplates(merged);
      }
    }
    // Always apply colors — if file has none, reset to defaults
    const colors = data.signalColors ?? {};
    applySignalColors(colors);
    saveSignalColors({ ...loadSignalColors(), ...colors });
    set({
      nodes,
      edges,
      schematicName: data.name ?? "Imported Schematic",
      isDemo: false,
      signalColors: data.signalColors,
      printPaperId: data.printPaperId ?? "arch-d",
      printOrientation: data.printOrientation ?? "landscape",
      printScale: data.printScale ?? 1.0,
      titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
      titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
      hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
      hideDeviceTypes: data.hideDeviceTypes ?? false,
      hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
      templateHiddenSignals: data.templateHiddenSignals ?? {},
      templatePresets: data.templatePresets ?? {},
      favoriteTemplates: data.favoriteTemplates ?? [],
      reportLayouts: data.reportLayouts ?? {},
      globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
      globalReportFooterLayout: data.globalReportFooterLayout ?? null,
      scrollConfig: resolveScrollConfig(data),
      cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
      showLineJumps: data.showLineJumps ?? true,
      showConnectionLabels: data.showConnectionLabels ?? true,
    });
    get().saveToLocalStorage();
  },

  newSchematic: () => {
    undoStack.length = 0;
    redoStack.length = 0;
    set({
      nodes: [],
      edges: [],
      schematicName: "Untitled Schematic",
      isDemo: false,
      titleBlock: { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
      titleBlockLayout: createDefaultLayout(),
      hiddenSignalTypes: "",
      hideDeviceTypes: false,
      hideUnconnectedPorts: false,
      templateHiddenSignals: {},
      templatePresets: {},
      favoriteTemplates: [],
      reportLayouts: {},
      globalReportHeaderLayout: null,
      globalReportFooterLayout: null,
      scrollConfig: { ...DEFAULT_SCROLL_CONFIG },
      cableNamingScheme: "type-prefix",
      showLineJumps: true,
      showConnectionLabels: true,
      undoSize: 0,
      redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  setSchematicName: (name) => {
    set({ schematicName: name });
    get().saveToLocalStorage();
  },

  patchEdgeData: (edgeId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      edges: state.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const merged = { ...e.data!, ...patch };
        // Remove keys explicitly set to undefined so they don't persist in JSON
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
        }
        return { ...e, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  batchPatchEdgeData: (changes) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const changeMap = new Map(changes.map((c) => [c.edgeId, c.patch]));
    set({
      edges: state.edges.map((e) => {
        const patch = changeMap.get(e.id);
        if (!patch) return e;
        const merged = { ...e.data!, ...patch };
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
        }
        return { ...e, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  setManualWaypoints: (edgeId, waypoints) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      edges: state.edges.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data!, manualWaypoints: waypoints } }
          : e,
      ),
    });
    get().saveToLocalStorage();
  },

  clearManualWaypoints: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge?.data?.manualWaypoints) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const { manualWaypoints: _, ...restData } = edge.data;
    set({
      edges: state.edges.map((e) =>
        e.id === edgeId
          ? { ...e, data: restData as ConnectionEdge["data"] }
          : e,
      ),
    });
    get().saveToLocalStorage();
  },

  recomputeRoutes: (rfInstance) => {
    const state = get();
    const hiddenSet = state.hiddenSignalTypes ? new Set(state.hiddenSignalTypes.split(",")) : null;
    const visibleEdges = hiddenSet
      ? state.edges.filter((e) => !hiddenSet.has(e.data?.signalType ?? ""))
      : state.edges;
    const results = routeAllEdges(state.nodes, visibleEdges, rfInstance, state.debugEdges);
    set({ routedEdges: results });
  },

  toggleDebugEdges: () => {
    set((s) => ({ debugEdges: !s.debugEdges }));
  },

  setResizeGuides: (guides) => {
    set({ resizeGuides: guides });
  },
}));
