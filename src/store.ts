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
} from "./types";
import { computeAlignment, type AlignOperation } from "./alignUtils";
import { CURRENT_SCHEMA_VERSION, migrateSchematic } from "./migrations";

const STORAGE_KEY = "easyschematic-autosave";
const TEMPLATES_KEY = "easyschematic-custom-templates";

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
  updateDevice: (nodeId: string, data: DeviceData) => void;
  setEditingNodeId: (id: string | null) => void;
  addRoom: (label: string, position: { x: number; y: number }) => void;
  updateRoomLabel: (nodeId: string, label: string) => void;
  reparentNode: (nodeId: string, absolutePosition: { x: number; y: number }) => void;

  // Undo/Redo
  pushSnapshot: () => void;
  setPendingUndoSnapshot: () => void;
  clearPendingUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Custom templates
  addCustomTemplate: (template: DeviceTemplate) => void;
  removeCustomTemplate: (deviceType: string) => void;

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

/** Sync counters so new IDs never collide with existing ones. */
function syncCounters(nodes: SchematicNode[], edges: ConnectionEdge[]) {
  for (const n of nodes) {
    const dm = n.id.match(/^device-(\d+)$/);
    if (dm) nodeIdCounter = Math.max(nodeIdCounter, Number(dm[1]));
    const rm = n.id.match(/^room-(\d+)$/);
    if (rm) roomIdCounter = Math.max(roomIdCounter, Number(rm[1]));
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

function pushUndo(snapshot: Snapshot) {
  undoStack.push(pendingUndoSnapshot ?? snapshot);
  pendingUndoSnapshot = null;
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
}

function clonePorts(ports: Port[]): Port[] {
  const prefix = `p${Date.now()}`;
  return ports.map((p, i) => ({ ...p, id: `${prefix}-${i}` }));
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
    if (!state.isValidConnection(connection)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const sourcePort = getPortFromHandle(
      state.nodes,
      connection.source,
      connection.sourceHandle,
    );

    const newEdge: ConnectionEdge = {
      id: nextEdgeId(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      data: { signalType: sourcePort?.signalType ?? "custom" },
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
    const newNode: DeviceNode = {
      id: nextNodeId(),
      type: "device",
      position,
      data: {
        label: template.label,
        deviceType: template.deviceType,
        ports: clonePorts(template.ports),
        color: template.color,
        baseLabel: template.label,
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

    // Don't allow duplicate connections to same target handle
    const duplicate = state.edges.some(
      (e) =>
        e.target === connection.target &&
        e.targetHandle === connection.targetHandle,
    );
    if (duplicate) return false;

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
    set({ nodes: prev.nodes, edges: prev.edges });
    get().saveToLocalStorage();
  },

  redo: () => {
    const next = redoStack.pop();
    if (!next) return;
    const state = get();
    undoStack.push({ nodes: state.nodes, edges: state.edges });
    set({ nodes: next.nodes, edges: next.edges });
    get().saveToLocalStorage();
  },

  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

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

  saveToLocalStorage: () => {
    const state = get();
    const data: SchematicFile = {
      version: CURRENT_SCHEMA_VERSION,
      name: state.schematicName,
      nodes: state.nodes,
      edges: state.edges,
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
      if (!raw) return false;
      const data = migrateSchematic(JSON.parse(raw)) as SchematicFile;
      syncCounters(data.nodes, data.edges);
      set({
        nodes: data.nodes,
        edges: data.edges,
        schematicName: data.name ?? "Untitled Schematic",
      });
      return true;
    } catch {
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
    };
  },

  importFromJSON: (rawData) => {
    const data = migrateSchematic(rawData) as SchematicFile;
    const nodes = data.nodes ?? [];
    const edges = data.edges ?? [];
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
    set({
      nodes,
      edges,
      schematicName: data.name ?? "Imported Schematic",
    });
    get().saveToLocalStorage();
  },

  newSchematic: () => {
    set({
      nodes: [],
      edges: [],
      schematicName: "Untitled Schematic",
    });
    get().saveToLocalStorage();
  },

  setSchematicName: (name) => {
    set({ schematicName: name });
    get().saveToLocalStorage();
  },
}));
