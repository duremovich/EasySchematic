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
  ConnectionData,
  DeviceTemplate,
  OwnedGearItem,
  Port,
  SchematicFile,
  SchematicPage,
  RackElevationPage,
  PrintSheetPage,
  PrintViewport,
  RackData,
  RackDevicePlacement,
  RackAccessory,
  TitleBlock,
  TitleBlockLayout,
  TemplatePreset,
  InstalledSlot,
  SlotDefinition,
  CustomTemplateGroup,
  CustomTemplateMeta,
  BundleMeta,
} from "./types";
import type { ReactFlowInstance } from "@xyflow/react";
import type { SignalType, ScrollConfig, LineStyle, LabelCaseMode, DistanceSettings, PanMode, StubLabelPageMode, ProjectStatus } from "./types";
import { defaultStubPlacement, healStubPortAlignment } from "./stubPlacement";
import { getPortAbsolutePositions } from "./snapUtils";
import { DEFAULT_SCROLL_CONFIG, DEFAULT_LABEL_CASE, DEFAULT_DISTANCE_SETTINGS, DEFAULT_PAN_MODE, DEFAULT_STUB_LABEL_SHOW_PORT, DEFAULT_STUB_LABEL_SHOW_ROOM, DEFAULT_STUB_LABEL_PAGE_MODE } from "./types";
import { pairKey } from "./roomDistance";
import type { Orientation } from "./printConfig";
import { computeAlignment, resolveAlignmentOverlaps, type AlignOperation } from "./alignUtils";
import { CURRENT_SCHEMA_VERSION, STUB_LABEL_Z_INDEX, migrateSchematic } from "./migrations";
import { healStaleWaypoints } from "./waypointHealing";
import { newBundleId, gcBundles, reconcileBundleJunctions, bundleJunctionsFor, splitMemberWaypoints } from "./bundles";
import { computeBundleTrunk, type BundleEndpoint } from "./routing/bundleRoute";
import { buildHandleSnapshot } from "./routing/handleSnapshot";
import { requestRoutes, setRoutingResultHandler, type RoutingResult } from "./routing/routingClient";
import { reconcileWaypointNodes, syncEdgesFromWaypointNodes, spliceWaypointsForRemovedNodes } from "./waypointSync";
import { orthogonalize, extractSegments, segmentsCross, type RoutedEdge, type CrossingPoint } from "./edgeRouter";
import { simplifyWaypoints, waypointsToSvgPath, waypointsToSvgPathWithHops } from "./pathfinding";
import { areConnectorsCompatible, needsAdapter, findAdaptersForConnectorBridge, findAdaptersForSignalBridge, NETWORK_SIGNAL_TYPES, BARE_WIRE_CONNECTORS, areSignalsCompatibleViaConnector, effectiveSignalType } from "./connectorTypes";
import { inferRackHeightU, inferRackForm, shelfFootprintMm, shelfInnerWidthMm } from "./rackUtils";
import { DEVICE_TEMPLATES } from "./deviceLibrary";
import { createDefaultLayout } from "./titleBlockLayout";
import { sanitizeNoteHtml } from "./sanitizeHtml";
import { getTemplateById } from "./templateApi";
import { syncDeviceWithTemplate, type SyncResult } from "./templateSync";
import { chooseNewHandleSuffix, type SwapPlan, type NewPortRef } from "./deviceSwap";
import { getSignalColorOverrides, applySignalColors, loadSignalColors, saveSignalColors } from "./signalColors";
import { computeCableSchedule } from "./cableSchedule";
import { autoFillSheetForRack } from "./printSheetAutoFill";
import { allocateEdgeId, maxEdgeCounterFromIds, newLinkedConnectionId, uniquifyEdgeIds } from "./idUtils";

/** Fix UTF-8 → Windows-1252 double-encoding in string values (e.g. → becomes â†').
 *  Applied on import so old/corrupted saves display correctly. */
function repairMojibake(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj
      .replace(/\u00e2\u2020\u2019/g, "\u2192")  // â†' → →
      .replace(/\u00e2\u2020\u2018/g, "\u2191")  // â†' → ↑
      .replace(/\u00e2\u2020\u201c/g, "\u2193")  // â†" → ↓
      .replace(/\u00e2\u2020\u201d/g, "\u2194");  // â†" → ↔
  }
  if (Array.isArray(obj)) return obj.map(repairMojibake);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = repairMojibake(v);
    return out;
  }
  return obj;
}

/** Resolve the rendered stroke color for a connection. Direct-attach always wins as gray;
 *  otherwise per-connection `color` override beats the signal-type CSS variable. */
function resolveEdgeStroke(data: ConnectionData | undefined): string {
  if (!data) return "var(--color-custom)";
  if (data.directAttach) return "#9ca3af";
  if (data.color) return data.color;
  return `var(--color-${data.signalType ?? "custom"})`;
}

const STORAGE_KEY = "easyschematic-autosave";
const TEMPLATES_KEY = "easyschematic-custom-templates";
const TEMPLATE_META_KEY = "easyschematic-custom-template-meta";
const CATEGORY_ORDER_KEY = "easyschematic-category-order";
const MINIMAP_PREF_KEY = "easyschematic-show-minimap";

/** Minimap visibility is an editor preference (not document data), persisted to
 *  localStorage and shared across schematics/sessions. Default visible. (#210) */
function loadShowMinimap(): boolean {
  try {
    return localStorage.getItem(MINIMAP_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

export const CATEGORY_ORDER_DEFAULT: string[] = [
  "Sources",
  "Peripherals",
  "Switching",
  "Processing",
  "Distribution",
  "Displays",
  "Projection",
  "Recording",
  "Mixing Consoles",
  "Powered Mixers",
  "Audio",
  "Audio I/O",
  "Microphones",
  "Speakers",
  "Amplifiers",
  "Networking",
  "Codecs",
  "KVM / Extenders",
  "Wireless",
  "LED Video",
  "Media Servers",
  "Lighting",
  "Control",
  "Audio Expansion",
  "Expansion Cards",
  "Storage",
  "Storage Media",
  "Infrastructure",
  "Intercom",
  "Monitoring",
  "Cloud Services",
  "Cable Accessories",
];

/** Migrate legacy scrollBehavior to ScrollConfig, or use provided scrollConfig */
function resolveScrollConfig(data: { scrollBehavior?: string; scrollConfig?: Partial<ScrollConfig> }): ScrollConfig {
  if (data.scrollConfig) return { ...DEFAULT_SCROLL_CONFIG, ...data.scrollConfig };
  if (data.scrollBehavior === "pan") return { ...DEFAULT_SCROLL_CONFIG, scroll: "pan-y", shiftScroll: "pan-x", ctrlScroll: "zoom" };
  return { ...DEFAULT_SCROLL_CONFIG };
}

/** True if the scroll config matches the default (omit from JSON when saving) */
function isDefaultScrollConfig(c: ScrollConfig): boolean {
  return c.scroll === DEFAULT_SCROLL_CONFIG.scroll
    && c.shiftScroll === DEFAULT_SCROLL_CONFIG.shiftScroll
    && c.ctrlScroll === DEFAULT_SCROLL_CONFIG.ctrlScroll
    && c.zoomSpeed === DEFAULT_SCROLL_CONFIG.zoomSpeed
    && c.panSpeed === DEFAULT_SCROLL_CONFIG.panSpeed
    && c.trackpadEnabled === DEFAULT_SCROLL_CONFIG.trackpadEnabled;
}

/** Coerce a persisted labelCase value to a known mode. Anything unrecognized falls back to default. */
function resolveLabelCase(v: unknown): LabelCaseMode {
  return v === "uppercase" || v === "lowercase" || v === "capitalize" || v === "as-typed"
    ? v
    : DEFAULT_LABEL_CASE;
}

/** Guard: don't persist empty state before initial load completes */
let hydrated = false;

// Re-exported from gridConstants so existing `import { GRID_SIZE } from "./store"`
// call sites keep working. Utility modules that the store also depends on (e.g.
// snapUtils) must import directly from "./gridConstants" — pulling it through
// the store causes a TDZ error on first load because of the cycle.
export { GRID_SIZE } from "./gridConstants";
import { GRID_SIZE } from "./gridConstants";

/** Snap all node positions to the grid. Mutates the array in place.
 *  Stub labels are skipped — they store sub-grid Y to center the box on a
 *  port row (box height ≈13–14px, half of which would round away). Snapping
 *  them shifted the label down a few px on every load. */
/** Conservatively drop manual waypoints stranded by device/room moves in a loaded
 *  file (they detour the edge or route it through a device). Silent — logs a
 *  support-triage line if anything healed, mirroring the [waypoint-orphan] probe. */
/** Member-endpoint Y resolver for bundle junction placement: the live routed waypoints'
 *  first/last points are the exact pins. Returns null per end when the edge isn't routed
 *  (reconcile falls back to device-box centerY). */
function routedEndpointY(routedEdges: Record<string, RoutedEdge>) {
  return (edge: ConnectionEdge, end: "source" | "target"): number | null => {
    const wps = routedEdges[edge.id]?.waypoints;
    if (!wps || wps.length < 2) return null;
    return end === "source" ? wps[0].y : wps[wps.length - 1].y;
  };
}

function applyWaypointHeal(nodes: SchematicNode[], edges: ConnectionEdge[]): ConnectionEdge[] {
  const { edges: healedEdges, healed } = healStaleWaypoints(nodes, edges);
  if (healed.length > 0) {
    console.info("[waypoint-heal]", healed.length, "connection(s) re-routed (stale manual waypoints)");
  }
  return healedEdges;
}

function snapNodesToGrid(nodes: SchematicNode[]): SchematicNode[] {
  for (const n of nodes) {
    // Stub labels are healed against their REAL partner port at routing time
    // (healStubPortAlignment in recomputeRoutes) — DOM-measured ports can sit a few px
    // off the model grid, so snapping the stub to the abstract grid here would BREAK
    // colinearity with such ports (kink at the label). Leave their stored Y alone.
    if (n.type === "stub-label") continue;
    n.position.x = Math.round(n.position.x / GRID_SIZE) * GRID_SIZE;
    n.position.y = Math.round(n.position.y / GRID_SIZE) * GRID_SIZE;
  }
  return nodes;
}

/** Apply interaction flags on rooms based on lock state. Mutates in place.
 *  Ensures flags are always consistent, even for old save files that may
 *  be missing className/selectable/draggable. */
function applyRoomLockState(nodes: SchematicNode[]): void {
  for (const n of nodes) {
    if (n.type === "room") {
      const locked = (n.data as import("./types").RoomData).locked;
      if (locked) {
        n.draggable = false;
        n.selectable = false;
        n.className = "locked";
      } else {
        n.draggable = undefined;
        n.selectable = true;
        n.className = undefined;
      }
    }
  }
}

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
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
  /** Bumped when a new schematic is wholesale-loaded (import, share link, demo, autosave hydrate). Canvas refits its viewport when this changes. */
  loadSeq: number;
  editingNodeId: string | null;
  creatingNodeId: string | null;
  customTemplates: DeviceTemplate[];
  ownedGear: OwnedGearItem[];
  showOwnedGearPane: boolean;
  libraryActiveTab: "devices" | "owned";

  // React Flow handlers
  onNodesChange: OnNodesChange<SchematicNode>;
  onEdgesChange: OnEdgesChange<ConnectionEdge>;
  onConnect: OnConnect;

  // Actions
  addDevice: (template: DeviceTemplate, position: { x: number; y: number }) => void;
  removeSelected: () => void;
  deleteNode: (nodeId: string) => void;
  deleteNodeAndChildren: (nodeId: string) => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  alignSelectedNodes: (op: AlignOperation) => void;
  isValidConnection: (connection: Connection) => boolean;
  updateDeviceLabel: (nodeId: string, label: string) => void;
  batchUpdateDeviceLabels: (changes: { nodeId: string; label: string }[]) => void;
  updateDeviceShortName: (nodeId: string, shortName: string) => void;
  batchUpdateDeviceShortNames: (changes: { nodeId: string; shortName: string }[]) => void;
  updateDevice: (nodeId: string, data: DeviceData) => void;
  /** Patch device data without clearing baseLabel (for spreadsheet edits). */
  patchDeviceData: (nodeId: string, patch: Partial<DeviceData>) => void;
  /** Merge two paired ports into a single passthrough port and re-anchor their edges atomically. */
  convertPortsToPassthrough: (nodeId: string, inputPortId: string, outputPortId: string, newPort: import("./types").Port) => void;
  /** Merge every input/output port pair on a device into passthrough ports in one atomic undo step. */
  convertAllPairsToPassthrough: (
    nodeId: string,
    conversions: Array<{ inputPortId: string; outputPortId: string; newPort: import("./types").Port }>,
  ) => void;
  /** Reconcile a placed device against the latest version of its source template. */
  syncDeviceFromTemplate: (nodeId: string) => SyncResult | null;
  /** Replace a device in place with a different template, remapping connections per the plan. */
  swapDevice: (nodeId: string, plan: SwapPlan) => void;
  /** UI state: when set, the Swap Device dialog is open targeting this node. */
  deviceSwapTarget: { nodeId: string } | null;
  /** Swap or remove a card in a modular slot. Pass null cardTemplateId to empty the slot. */
  swapCard: (nodeId: string, slotId: string, cardTemplateId: string | null) => void;
  /** Add a new empty expansion slot to a device. */
  addSlot: (nodeId: string, slot: { label: string; slotFamily: string }) => void;
  addSlots: (nodeId: string, slots: { label: string; slotFamily: string }[]) => void;
  /** Update label / slotFamily on an existing installed slot. */
  updateSlot: (nodeId: string, slotId: string, patch: { label?: string; slotFamily?: string; hidden?: boolean }) => void;
  /** Remove a slot, its ports, descendant slots, and any edges connected to their ports. */
  removeSlot: (nodeId: string, slotId: string) => void;
  setEditingNodeId: (id: string | null) => void;
  setCreatingNodeId: (id: string | null) => void;
  createAndEditDevice: (template: DeviceTemplate, position: { x: number; y: number }) => void;
  addRoom: (label: string, position: { x: number; y: number }) => void;
  updateRoomLabel: (nodeId: string, label: string) => void;
  updateRoom: (nodeId: string, data: import("./types").RoomData) => void;
  updateAnnotation: (nodeId: string, data: Partial<import("./types").AnnotationData>) => void;
  toggleRoomLock: (nodeId: string) => void;
  toggleEquipmentRack: (nodeId: string) => void;
  addNote: (position: { x: number; y: number }) => void;
  updateNoteHtml: (nodeId: string, html: string) => void;
  reparentNode: (nodeId: string, absolutePosition: { x: number; y: number }, options?: { skipUndo?: boolean }) => void;
  /** Re-evaluate room membership for every non-room node. Used after a room is
   *  created, resized, or moved so devices get parented/unparented to match
   *  the new layout. */
  reparentAllDevices: (options?: { skipUndo?: boolean }) => void;
  /** Called when a room's NodeResizer finishes. Snapshots undo and reconciles
   *  device membership against the new bounds. */
  onRoomResizeEnd: (nodeId: string) => void;

  // Undo/Redo
  pushSnapshot: () => void;
  setPendingUndoSnapshot: () => void;
  clearPendingUndoSnapshot: () => void;
  flushPendingSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoSize: number;
  redoSize: number;

  // Selection
  selectAll: () => void;
  /** Select exactly the given edge ids (deselecting all other edges and all nodes). */
  selectEdges: (ids: string[]) => void;

  // Custom templates
  addCustomTemplate: (template: DeviceTemplate) => void;
  updateCustomTemplate: (id: string, template: DeviceTemplate) => void;
  removeCustomTemplate: (deviceType: string) => void;
  clearAllCustomTemplates: () => void;
  addOwnedGear: (template: DeviceTemplate, quantity?: number) => void;
  setOwnedGear: (items: OwnedGearItem[]) => void;
  updateOwnedGearQuantity: (templateKey: string, quantity: number) => void;
  removeOwnedGear: (templateKey: string) => void;
  setShowOwnedGearPane: (show: boolean) => void;
  setLibraryActiveTab: (tab: "devices" | "owned") => void;

  // Custom template organization (#62)
  customTemplateGroups: CustomTemplateGroup[];
  customTemplateOrder: string[];
  customTemplateGroupAssignments: Record<string, string>;
  reorderCustomTemplate: (deviceType: string, targetIndex: number) => void;
  moveCustomTemplateToGroup: (deviceType: string, groupId: string | null) => void;
  addCustomTemplateGroup: (label: string) => string;
  removeCustomTemplateGroup: (groupId: string) => void;
  renameCustomTemplateGroup: (groupId: string, label: string) => void;
  reorderCustomTemplateGroup: (groupId: string, newIndex: number) => void;
  toggleCustomGroupCollapsed: (groupId: string) => void;

  // Category order (#62)
  categoryOrder: string[] | null;  // null = use default CATEGORY_ORDER
  reorderCategory: (category: string, targetIndex: number) => void;
  resetCategoryOrder: () => void;

  // Edge data
  patchEdgeData: (edgeId: string, patch: Partial<import("./types").ConnectionData>) => void;
  batchPatchEdgeData: (changes: { edgeId: string; patch: Partial<import("./types").ConnectionData> }[]) => void;

  // Stub conversion (real React Flow nodes for the labels)
  convertEdgeToStubs: (edgeId: string) => void;
  collapseStubsForEdge: (edgeId: string) => void;

  // Manual edge routing
  setManualWaypoints: (edgeId: string, waypoints: { x: number; y: number }[]) => void;
  clearManualWaypoints: (edgeId: string) => void;
  /** Strip manual waypoints from EVERY connection so the whole schematic re-auto-routes
   *  from scratch. Undoable. Useful for vetting auto-route without resetting edges one by one. */
  clearAllManualWaypoints: () => void;
  deviceContextMenu: { nodeId: string; screenX: number; screenY: number } | null;
  setDeviceContextMenu: (menu: { nodeId: string; screenX: number; screenY: number } | null) => void;
  edgeContextMenu: { edgeId: string; screenX: number; screenY: number; flowX: number; flowY: number } | null;
  roomContextMenu: { nodeId: string; screenX: number; screenY: number } | null;
  stubLabelContextMenu: { nodeId: string; screenX: number; screenY: number } | null;
  portContextMenu: { nodeId: string; portId: string; screenX: number; screenY: number } | null;

  // Centralized edge routing
  routedEdges: Record<string, RoutedEdge>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routingDebugData: any;
  recomputeRoutes: (rfInstance: ReactFlowInstance) => void;
  computeSimpleRoutes: (rfInstance: ReactFlowInstance) => void;

  // Auto-route toggle
  autoRoute: boolean;
  toggleAutoRoute: () => void;
  /** Transient stash of per-edge waypoint state captured when toggling auto-route ON.
   *  Consumed (and cleared) when toggling back OFF so edges revert to their pre-toggle appearance.
   *  null = had no waypoints (L-shape), object = had waypoints. Not persisted/exported. */
  _edgeWaypointStash: Record<string, { manualWaypoints: { x: number; y: number }[]; autoRouteWaypoints?: boolean } | null> | null;
  /** When true, the auto-route-off confirmation dialog is shown */
  autoRouteConfirmPending: boolean;
  /** Complete the pending toggle-off with the user's choice (true = keep A* routes, false = restore previous) */
  confirmAutoRouteOff: (preserve: boolean) => void;
  /** Cancel the pending toggle-off (dismiss dialog, auto-route stays ON) */
  cancelAutoRouteOff: () => void;

  // Edge interaction hitbox width (pixels)
  edgeHitboxSize: number;
  setEdgeHitboxSize: (size: number) => void;

  // Debug
  debugEdges: boolean;
  debugShowLabels: boolean;
  debugShowObstacles: boolean;
  debugShowPenalties: boolean;
  debugShowWaypoints: boolean;
  debugShowGrid: boolean;
  toggleDebugEdges: () => void;
  routingParamVersion: number;
  bumpRoutingParams: () => void;

  // Resize snap guides (shown while resizing rooms)
  resizeGuides: import("./snapUtils").GuideLine[];
  setResizeGuides: (guides: import("./snapUtils").GuideLine[]) => void;

  // Demo state — true when the demo schematic was auto-loaded for first-time visitors
  isDemo: boolean;

  // Drag state — edges freeze during drag and recalculate on drop
  isDragging: boolean;
  isRouting: boolean;
  overlapNodeId: string | null;

  // Print view (printView toggle is ephemeral; paper/orientation/scale are persisted)
  printView: boolean;
  printPaperId: string;
  printOrientation: Orientation;
  printScale: number;
  printCustomWidthIn: number;
  printCustomHeightIn: number;
  printOriginOffsetX: number;
  printOriginOffsetY: number;
  // Color key / signal legend for print view
  colorKeyEnabled: boolean;
  colorKeyCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  colorKeyColumns: number;
  colorKeyPage: "first" | "last" | "all";
  colorKeyOverrides: Partial<Record<SignalType, boolean>> | undefined;
  cableCosts: Record<string, number> | undefined;
  setCableCost: (key: string, cost: number | undefined) => void;
  // Connection bundles — groups of ≥2 connections sharing one physical trunk (membership on edge.data.bundleId)
  bundles: Record<string, BundleMeta>;
  createBundle: (edgeIds: string[]) => void;
  dissolveBundle: (bundleId: string) => void;
  addToBundle: (bundleId: string, edgeIds: string[]) => void;
  removeFromBundle: (edgeIds: string[]) => void;
  setBundleMeta: (bundleId: string, patch: Partial<BundleMeta>) => void;
  setBundleTrunkWaypoints: (bundleId: string, trunkWaypoints: { x: number; y: number }[]) => void;
  // Room distance + cable-length estimation (#146)
  roomDistances: Record<string, number> | undefined;
  distanceSettings: DistanceSettings | undefined;
  setRoomDistance: (roomIdA: string, roomIdB: string, distance: number | undefined) => void;
  clearRoomDistance: (roomIdA: string, roomIdB: string) => void;
  setDistanceSettings: (partial: Partial<DistanceSettings>) => void;
  setColorKeyEnabled: (v: boolean) => void;
  setColorKeyCorner: (c: "top-left" | "top-right" | "bottom-left" | "bottom-right") => void;
  setColorKeyColumns: (n: number) => void;
  setColorKeyPage: (p: "first" | "last" | "all") => void;
  setColorKeyOverrides: (o: Partial<Record<SignalType, boolean>> | undefined) => void;
  setPrintView: (v: boolean) => void;
  setPrintPaperId: (id: string) => void;
  setPrintOrientation: (o: Orientation) => void;
  setPrintScale: (s: number) => void;
  setPrintCustomWidthIn: (w: number) => void;
  setPrintCustomHeightIn: (h: number) => void;
  setPrintOriginOffset: (x: number, y: number) => void;

  // Title block
  titleBlock: TitleBlock;
  setTitleBlock: (tb: TitleBlock) => void;
  titleBlockLayout: TitleBlockLayout;
  setTitleBlockLayout: (layout: TitleBlockLayout) => void;

  // Signal colors & line styles
  signalColors: Partial<Record<SignalType, string>> | undefined;
  setSignalColors: (colors: Record<SignalType, string>) => void;
  signalLineStyles: Partial<Record<SignalType, LineStyle>> | undefined;
  setSignalLineStyles: (styles: Partial<Record<SignalType, LineStyle>>) => void;

  // Report layouts (pack list PDF settings, etc.)
  reportLayouts: Record<string, unknown>;
  setReportLayout: (key: string, layout: unknown) => void;
  reportHiddenColumns: Record<string, string[]>;
  setReportHiddenColumns: (tableId: string, columnIds: string[]) => void;
  globalReportHeaderLayout: TitleBlockLayout | null;
  globalReportFooterLayout: TitleBlockLayout | null;
  setGlobalReportHeaderLayout: (layout: TitleBlockLayout) => void;
  setGlobalReportFooterLayout: (layout: TitleBlockLayout) => void;

  // View options
  hiddenSignalTypes: string;
  hiddenPinSignalTypes: string;
  hideUnconnectedPorts: boolean;
  templateHiddenSignals: Record<string, SignalType[]>;
  toggleSignalTypeVisibility: (type: SignalType) => void;
  togglePinSignalTypeVisibility: (type: SignalType) => void;
  setHideUnconnectedPorts: (hide: boolean) => void;
  showPortCounts: boolean;
  setShowPortCounts: (show: boolean) => void;
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

  // Label case preference — purely a display-time transform; data is never mutated.
  labelCase: LabelCaseMode;
  setLabelCase: (mode: LabelCaseMode) => void;

  // Left-drag canvas behavior: select box (default) or pan viewport.
  panMode: PanMode;
  setPanMode: (mode: PanMode) => void;

  // ISO 4217 currency code for cost display in reports (#158).
  currency: string;
  setCurrency: (code: string) => void;

  // Project lifecycle status (#P2-007). undefined = treated as Active.
  status: ProjectStatus | undefined;
  setProjectStatus: (status: ProjectStatus | undefined) => void;

  // Incompatible connection dialog (#6)
  pendingIncompatibleConnection: {
    connection: Connection;
    sourcePort: Port;
    targetPort: Port;
    reason: "signal-mismatch" | "connector-mismatch";
  } | null;
  dismissIncompatibleDialog: () => void;
  forceIncompatibleConnection: () => void;
  insertAdapterBetween: (template: DeviceTemplate) => void;

  // Adapter visibility (#adapter-overhaul)
  hideAdapters: boolean;
  setHideAdapters: (hide: boolean) => void;
  /** Set of node IDs for adapters that should be visually hidden */
  hiddenAdapterNodeIds: Set<string>;
  /** Set of edge IDs that are the "hidden half" of a virtual edge pair (no route, invisible) */
  hiddenVirtualEdgeIds: Set<string>;
  /** Map from edge ID to gradient colors for virtual edges bridging different signal types */
  virtualEdgeGradients: Record<string, { sourceColor: string; targetColor: string }>;

  // Line jumps (#18)
  showLineJumps: boolean;
  setShowLineJumps: (show: boolean) => void;

  /** Canvas minimap visibility — editor preference, persisted to localStorage. (#210) */
  showMinimap: boolean;
  setShowMinimap: (show: boolean) => void;

  /** Rack: show connector-level face-plate detail (default off; advanced) */
  showFacePlateDetail: boolean;
  setShowFacePlateDetail: (show: boolean) => void;

  // Connection labels (#5, #61)
  /** @deprecated Use showCableIdLabels instead */
  showConnectionLabels: boolean;
  setShowConnectionLabels: (show: boolean) => void;
  showCableIdLabels: boolean;
  setShowCableIdLabels: (show: boolean) => void;
  showCustomLabels: boolean;
  setShowCustomLabels: (show: boolean) => void;
  cableIdGap: number;
  setCableIdGap: (gap: number) => void;
  cableIdMidOffset: number;
  setCableIdMidOffset: (offset: number) => void;
  cableIdLabelMode: "endpoint" | "midpoint";
  setCableIdLabelMode: (mode: "endpoint" | "midpoint") => void;
  stubLabelShowPort: boolean;
  setStubLabelShowPort: (show: boolean) => void;
  stubLabelShowRoom: boolean;
  setStubLabelShowRoom: (show: boolean) => void;
  stubLabelPageMode: StubLabelPageMode;
  setStubLabelPageMode: (mode: StubLabelPageMode) => void;
  useShortNames: boolean;
  setUseShortNames: (use: boolean) => void;
  wrapDeviceLabels: boolean;
  setWrapDeviceLabels: (wrap: boolean) => void;
  patchStubLabelData: (nodeId: string, patch: Partial<import("./types").StubLabelData>) => void;
  cableIdMap: Record<string, string>;
  recomputeCableIds: () => void;

  // Template import/export (#12/#26)
  exportCustomTemplates: () => DeviceTemplate[];
  importCustomTemplates: (templates: DeviceTemplate[]) => void;

  // Cloud storage
  cloudSchematicId: string | null;
  cloudSavedAt: string | null;
  setCloudSchematicId: (id: string | null) => void;
  setCloudSavedAt: (ts: string | null) => void;

  // Rack builder pages
  pages: SchematicPage[];
  /** "schematic" for the main signal flow, or a page ID for rack elevation pages */
  activePage: string;
  setActivePage: (pageId: string) => void;
  addRackPage: (label: string) => string;
  removeRackPage: (pageId: string) => void;
  renameRackPage: (pageId: string, label: string) => void;
  addRack: (pageId: string, rack: Omit<RackData, "id">) => string;
  removeRack: (pageId: string, rackId: string) => void;
  updateRack: (pageId: string, rackId: string, patch: Partial<RackData>) => void;
  addRackPlacement: (pageId: string, placement: Omit<RackDevicePlacement, "id">) => string;
  /** Drop a device into a rack, routing to direct/half/shelf-mount based on its physical
   *  dimensions (see `inferRackForm`). Returns the resulting placement id, or null on
   *  rejection (oversize device). For half-rack form, `preferredHalfRackSide` honors the
   *  cursor's intent at drop time and only flips if that side is occupied. */
  addPlacementSmart: (
    pageId: string,
    rackId: string,
    deviceNodeId: string,
    uPosition: number,
    face: "front" | "rear",
    preferredHalfRackSide?: "left" | "right",
  ) => { ok: true; placementId: string; shelfId?: string } | { ok: false; reason: "oversize" | "no-page" | "no-device" };
  removeRackPlacement: (pageId: string, placementId: string) => void;
  updateRackPlacement: (pageId: string, placementId: string, patch: Partial<RackDevicePlacement>) => void;
  addRackAccessory: (pageId: string, accessory: Omit<RackAccessory, "id">) => string;
  updateRackAccessory: (pageId: string, accessoryId: string, patch: Partial<RackAccessory>) => void;
  removeRackAccessory: (pageId: string, accessoryId: string) => void;
  /** Remove a shelf with its mounted devices, returning them to the unracked pool. */
  removeRackAccessoryWithOccupants: (pageId: string, accessoryId: string) => void;
  /** Mount a device on a shelf accessory (face/uPosition inherited from the shelf). */
  addShelfMountedDevice: (pageId: string, shelfId: string, deviceNodeId: string) => string | null;
  /** Check if a U range is available in a rack for placement */
  isRackSlotAvailable: (pageId: string, rackId: string, uPosition: number, heightU: number, face: "front" | "rear", halfRackSide?: "left" | "right", excludePlacementId?: string, excludeAccessoryId?: string) => boolean;
  /** Link a schematic room to a rack-builder rack (and update both sides atomically). */
  linkRoomToRack: (roomId: string, pageId: string, rackId: string) => void;
  /** Remove the link between a room and its rack. */
  unlinkRoom: (roomId: string) => void;
  // Print sheet page CRUD
  addPrintSheetPage: (label?: string) => string;
  removePrintSheetPage: (pageId: string) => void;
  renamePrintSheetPage: (pageId: string, label: string) => void;
  duplicateRackPage: (pageId: string) => string;
  duplicatePrintSheetPage: (pageId: string) => string;
  addViewport: (pageId: string, viewport: Omit<PrintViewport, "id">) => string;
  updateViewport: (pageId: string, viewportId: string, patch: Partial<PrintViewport>) => void;
  removeViewport: (pageId: string, viewportId: string) => void;
  setPrintSheetPaper: (pageId: string, paperId: string, orientation: "landscape" | "portrait", customWidthIn?: number, customHeightIn?: number) => void;
  /** Move a rack (and all its placements + accessories) from one rack-elevation page to another. */
  moveRackToPage: (srcPageId: string, rackId: string, dstPageId: string) => void;

  // Local file handle (File System Access API — Chromium only, not persisted)
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;

  // Online / offline state
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Toasts
  toasts: Toast[];
  addToast: (message: string, type: Toast["type"], durationMs?: number) => void;
  removeToast: (id: string) => void;

  // Persistence
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => boolean;
  exportToJSON: () => SchematicFile;
  importFromJSON: (data: SchematicFile) => void;
  importCsvData: (newNodes: SchematicNode[], newEdges: ConnectionEdge[]) => void;
  newSchematic: (templateData?: SchematicFile) => void;
  setSchematicName: (name: string) => void;
}

let nodeIdCounter = 0;
function nextNodeId(): string {
  return `device-${++nodeIdCounter}`;
}

let edgeIdCounter = 0;
function nextEdgeId(existingEdges: Iterable<Pick<ConnectionEdge, "id">> = []): string {
  const usedIds = Array.from(existingEdges, (edge) => edge.id);
  const allocated = allocateEdgeId(usedIds, edgeIdCounter);
  edgeIdCounter = allocated.counter;
  return allocated.id;
}

function ensureUniqueEdgeIds(edges: ConnectionEdge[]): ConnectionEdge[] {
  const result = uniquifyEdgeIds(edges, edgeIdCounter);
  edgeIdCounter = result.counter;
  return result.edges as ConnectionEdge[];
}

let roomIdCounter = 0;
function nextRoomId(): string {
  return `room-${++roomIdCounter}`;
}

let noteIdCounter = 0;
function nextNoteId(): string {
  return `note-${++noteIdCounter}`;
}

let rackPageIdCounter = 0;
function nextRackPageId(): string {
  return `rackpage-${++rackPageIdCounter}`;
}

let rackIdCounter = 0;
function nextRackId(): string {
  return `rack-${++rackIdCounter}`;
}

let placementIdCounter = 0;
function nextPlacementId(): string {
  return `rp-${++placementIdCounter}`;
}

let accessoryIdCounter = 0;
function nextAccessoryId(): string {
  return `ra-${++accessoryIdCounter}`;
}

let printSheetIdCounter = 0;
function nextPrintSheetId(): string {
  return `printsheet-${++printSheetIdCounter}`;
}

let viewportIdCounter = 0;
function nextViewportId(): string {
  return `viewport-${++viewportIdCounter}`;
}

/** Apply fn to the rack-elevation page with the given id; leave other pages untouched. */
function mapElevationPage(pages: SchematicPage[], pageId: string, fn: (p: RackElevationPage) => RackElevationPage): SchematicPage[] {
  return pages.map((p) => (p.id === pageId && p.type === "rack-elevation") ? fn(p) : p);
}

/** Sync rack-related counters from pages data. */
function syncRackCounters(pages: SchematicPage[]) {
  for (const page of pages) {
    const pm = page.id.match(/^rackpage-(\d+)$/);
    if (pm) rackPageIdCounter = Math.max(rackPageIdCounter, Number(pm[1]));
    if (page.type === "print-sheet") {
      // Arrays default to [] — an older/partial page missing these would throw
      // "not iterable" here, AFTER importFromJSON already loaded the schematic,
      // surfacing to callers as a false "Invalid schematic file." (#176)
      for (const vp of page.viewports ?? []) {
        const vm = vp.id.match(/^viewport-(\d+)$/);
        if (vm) viewportIdCounter = Math.max(viewportIdCounter, Number(vm[1]));
        const sm = page.id.match(/^printsheet-(\d+)$/);
        if (sm) printSheetIdCounter = Math.max(printSheetIdCounter, Number(sm[1]));
      }
      continue;
    }
    for (const rack of page.racks ?? []) {
      const rm = rack.id.match(/^rack-(\d+)$/);
      if (rm) rackIdCounter = Math.max(rackIdCounter, Number(rm[1]));
    }
    for (const p of page.placements ?? []) {
      const pm2 = p.id.match(/^rp-(\d+)$/);
      if (pm2) placementIdCounter = Math.max(placementIdCounter, Number(pm2[1]));
    }
    for (const a of page.accessories ?? []) {
      const am = a.id.match(/^ra-(\d+)$/);
      if (am) accessoryIdCounter = Math.max(accessoryIdCounter, Number(am[1]));
    }
  }
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
    edgeIdCounter = maxEdgeCounterFromIds([e.id], edgeIdCounter);
  }
}

let clipboard: Clipboard | null = null;
const PASTE_GAP = 20;

// Undo/redo history
interface Snapshot {
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  pages: SchematicPage[];
  bundles: Record<string, BundleMeta>;
  autoRoute?: boolean;
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

function pushUndo(partial: { nodes: SchematicNode[]; edges: ConnectionEdge[]; autoRoute?: boolean }) {
  const liveState = useSchematicStore?.getState?.();
  const pages = liveState?.pages ?? [];
  const bundles = liveState?.bundles ?? {};
  const snapshot: Snapshot = { ...partial, pages, bundles };
  undoStack.push(structuredClone(pendingUndoSnapshot ?? snapshot));
  pendingUndoSnapshot = null;
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
  // Sync reactive counters so undo/redo buttons stay in sync
  useSchematicStore.setState({ undoSize: undoStack.length, redoSize: 0 });
}

// ── Async routing (Web Worker) plumbing ──────────────────────────────────
// recomputeRoutes posts a seq-tagged request to the routing worker and stashes the main-thread-only
// context (virtual-edge remap + adapter visibility) here; applyRoutingResult consumes it when the
// matching result returns. Coalescing in routingClient means only the newest request actually runs,
// so we discard any result whose seq isn't the latest we posted.
let routeSeq = 0;
let routingHandlerRegistered = false;
interface RouteApplyCtx {
  seq: number;
  virtualEdgeSources: Map<string, { primaryEdgeId: string; secondaryEdgeId: string; adapterNodeId: string }>;
  hiddenAdapterNodeIds: Set<string>;
  hiddenVirtualEdgeIds: Set<string>;
  virtualEdgeGradients: Record<string, { sourceColor: string; targetColor: string }>;
}
let pendingRouteCtx: RouteApplyCtx | null = null;

function applyRoutingResult(r: RoutingResult): void {
  // Discard stale/superseded results — only the latest posted seq's context is live.
  if (!pendingRouteCtx || r.seq !== pendingRouteCtx.seq) return;
  const ctx = pendingRouteCtx;
  const state = useSchematicStore.getState();
  // Auto-route was switched off after this request was posted — the simple (L-shape) routes are
  // already in place; drop the stale A* result rather than clobbering them.
  if (!state.autoRoute) {
    useSchematicStore.setState({ isRouting: false });
    return;
  }
  const results = r.routes;

  // Re-publish the debug artifacts (the worker computed them in its own globalThis).
  (globalThis as Record<string, unknown>).__routingReport = r.routingReport ?? undefined;

  // Map virtual edge routes (hidden adapters) back to their primary real edge IDs.
  for (const [virtualId, mapping] of ctx.virtualEdgeSources) {
    const route = results[virtualId];
    if (route) {
      results[mapping.primaryEdgeId] = { ...route, edgeId: mapping.primaryEdgeId };
      delete results[virtualId];
    }
  }

  if (r.overBudget) {
    state.addToast("Auto-routing disabled — schematic is too large for real-time routing", "info");
  }

  // Normalize edge zIndex: boost line-jump-hop edges to 1, everyone else 0.
  const hopEdgeIds = new Set<string>();
  if (state.showLineJumps) {
    for (const [edgeId, routed] of Object.entries(results)) {
      if (routed.crossingPoints && routed.crossingPoints.length > 0) hopEdgeIds.add(edgeId);
    }
  }
  const updatedEdges = state.edges.map((e) =>
    hopEdgeIds.has(e.id) ? { ...e, zIndex: 1 } : { ...e, zIndex: 0 },
  );

  useSchematicStore.setState({
    routedEdges: results,
    routingDebugData: r.routingDebug ?? null,
    edges: updatedEdges,
    hiddenAdapterNodeIds: ctx.hiddenAdapterNodeIds,
    hiddenVirtualEdgeIds: ctx.hiddenVirtualEdgeIds,
    virtualEdgeGradients: ctx.virtualEdgeGradients,
    isRouting: false,
    ...(r.overBudget ? { autoRoute: false } : {}),
  });
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

/**
 * Recursively process template slots, including sub-slots on expansion cards.
 * Returns a flat list of InstalledSlots (with parentSlotId for nesting) and
 * all ports from installed cards.
 */
function processTemplateSlots(
  templateSlots: SlotDefinition[],
  parentSlotId?: string,
  parentLabel?: string,
): { installedSlots: InstalledSlot[]; ports: Port[] } {
  const installedSlots: InstalledSlot[] = [];
  const ports: Port[] = [];

  for (const slotDef of templateSlots) {
    const fullSlotId = parentSlotId ? `${parentSlotId}/${slotDef.id}` : slotDef.id;
    const displayLabel = parentLabel ? `${parentLabel} > ${slotDef.label}` : slotDef.label;
    const cardTpl = slotDef.defaultCardId ? getTemplateById(slotDef.defaultCardId) : undefined;

    if (cardTpl) {
      const cardPorts = cloneCardPorts(cardTpl.ports, fullSlotId, displayLabel);
      ports.push(...cardPorts);

      const slot: InstalledSlot = {
        slotId: fullSlotId,
        label: slotDef.label,
        slotFamily: slotDef.slotFamily,
        ...(parentSlotId ? { parentSlotId } : {}),
        ...(slotDef.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        cardTemplateId: cardTpl.id,
        cardLabel: cardTpl.label,
        cardManufacturer: cardTpl.manufacturer,
        cardModelNumber: cardTpl.modelNumber,
        cardUnitCost: cardTpl.unitCost,
        portIds: cardPorts.map((p) => p.id),
      };
      installedSlots.push(slot);

      // Recurse into card's sub-slots (e.g. SFP cages on a network module)
      if (cardTpl.slots && cardTpl.slots.length > 0) {
        const nested = processTemplateSlots(cardTpl.slots, fullSlotId, displayLabel);
        installedSlots.push(...nested.installedSlots);
        ports.push(...nested.ports);
      }
    } else {
      installedSlots.push({
        slotId: fullSlotId,
        label: slotDef.label,
        slotFamily: slotDef.slotFamily,
        ...(parentSlotId ? { parentSlotId } : {}),
        ...(slotDef.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        portIds: [],
      });
    }
  }

  return { installedSlots, ports };
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

/** Ensure parent nodes appear before their children in the array (topological sort). */
function sortNodesParentFirst(nodes: SchematicNode[]): SchematicNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const result: SchematicNode[] = [];
  const visited = new Set<string>();

  function visit(n: SchematicNode) {
    if (visited.has(n.id)) return;
    if (n.parentId && nodeMap.has(n.parentId)) visit(nodeMap.get(n.parentId)!);
    visited.add(n.id);
    result.push(n);
  }

  // Visit rooms first so all rooms precede non-room nodes
  for (const n of nodes) if (n.type === "room") visit(n);
  for (const n of nodes) if (n.type !== "room") visit(n);
  return result;
}

/** Walk parent chain to compute a node's absolute canvas position. */
function getAbsolutePosition(
  nodeId: string,
  nodeMap: Map<string, SchematicNode>,
): { x: number; y: number } {
  const n = nodeMap.get(nodeId);
  if (!n) return { x: 0, y: 0 };
  if (!n.parentId) return n.position;
  const p = getAbsolutePosition(n.parentId, nodeMap);
  return { x: n.position.x + p.x, y: n.position.y + p.y };
}

/** True if ancestorId is an ancestor of childId (prevents circular nesting). */
function isAncestorOf(
  ancestorId: string,
  childId: string,
  nodeMap: Map<string, SchematicNode>,
): boolean {
  let cur = nodeMap.get(childId);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = nodeMap.get(cur.parentId);
  }
  return false;
}

/** Find the smallest-area room whose bounds enclose (centerX, centerY). Skips
 *  self and any descendant (for rooms being reparented). Returns undefined if
 *  no room contains the point. */
function findBestEnclosingRoom(
  candidateId: string,
  candidateIsRoom: boolean,
  centerX: number,
  centerY: number,
  nodes: SchematicNode[],
  nodeMap: Map<string, SchematicNode>,
): SchematicNode | undefined {
  let best: SchematicNode | undefined;
  let bestArea = Infinity;
  for (const n of nodes) {
    if (n.type !== "room") continue;
    if (n.id === candidateId) continue;
    if (candidateIsRoom && isAncestorOf(candidateId, n.id, nodeMap)) continue;
    const rw = n.measured?.width ?? (n.style?.width as number) ?? (n.width as number) ?? 400;
    const rh = n.measured?.height ?? (n.style?.height as number) ?? (n.height as number) ?? 300;
    const absPos = getAbsolutePosition(n.id, nodeMap);
    if (
      centerX >= absPos.x && centerX <= absPos.x + rw &&
      centerY >= absPos.y && centerY <= absPos.y + rh
    ) {
      const area = rw * rh;
      if (area < bestArea) {
        best = n;
        bestArea = area;
      }
    }
  }
  return best;
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
  // Bidirectional handles: "{portId}-in" / "{portId}-out"
  // Passthrough handles:   "{portId}-rear" / "{portId}-front"
  const baseId = handleId.replace(/-(in|out|rear|front)$/, "");
  return ports.find((p) => p.id === baseId);
}

function removeOrphanedEdges(nodes: SchematicNode[], edges: ConnectionEdge[]): ConnectionEdge[] {
  return edges.filter((e) => {
    const srcNode = nodes.find((n) => n.id === e.source);
    const tgtNode = nodes.find((n) => n.id === e.target);
    if (!srcNode || !tgtNode) return false;
    if (srcNode.type === "device" && !getPortFromHandle(nodes, e.source, e.sourceHandle ?? null)) return false;
    if (tgtNode.type === "device" && !getPortFromHandle(nodes, e.target, e.targetHandle ?? null)) return false;
    return true;
  });
}

/** Unique key for custom template management (order, groups, deletion). */
function templateKey(t: DeviceTemplate): string {
  return t.id ?? t.deviceType;
}

function loadCustomTemplates(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const templates = JSON.parse(raw) as DeviceTemplate[];
    // Migrate legacy custom templates: move unique key from deviceType to id
    for (const t of templates) {
      if (!t.id && t.deviceType.startsWith("custom-")) {
        t.id = t.deviceType;
      }
    }
    return templates;
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

function loadCustomTemplateMeta(templates: DeviceTemplate[]): CustomTemplateMeta {
  try {
    const raw = localStorage.getItem(TEMPLATE_META_KEY);
    if (raw) return JSON.parse(raw) as CustomTemplateMeta;
  } catch { /* fall through */ }
  // First load: initialize from current template order
  return { groups: [], order: templates.map((t) => templateKey(t)), groupAssignments: {} };
}

function saveCustomTemplateMeta(meta: CustomTemplateMeta) {
  try {
    localStorage.setItem(TEMPLATE_META_KEY, JSON.stringify(meta));
  } catch {
    // silently fail
  }
}

function loadCategoryOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(CATEGORY_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}

function saveCategoryOrder(order: string[] | null) {
  try {
    if (order) localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(order));
    else localStorage.removeItem(CATEGORY_ORDER_KEY);
  } catch { /* silently fail */ }
}

const _initCustomTemplates = loadCustomTemplates();
const _initCustomMeta = loadCustomTemplateMeta(_initCustomTemplates);

export const useSchematicStore = create<SchematicState>((set, get) => ({
  nodes: [],
  edges: [],
  schematicName: "Untitled Schematic",
  loadSeq: 0,
  editingNodeId: null,
  creatingNodeId: null,
  customTemplates: _initCustomTemplates,
  ownedGear: [],
  showOwnedGearPane: false,
  libraryActiveTab: "devices",
  customTemplateGroups: _initCustomMeta.groups,
  customTemplateOrder: _initCustomMeta.order,
  customTemplateGroupAssignments: _initCustomMeta.groupAssignments,
  categoryOrder: loadCategoryOrder(),
  routedEdges: {},
  routingDebugData: null,
  deviceContextMenu: null,
  setDeviceContextMenu: (menu) => set({ deviceContextMenu: menu }),
  deviceSwapTarget: null,
  edgeContextMenu: null,
  roomContextMenu: null,
  stubLabelContextMenu: null,
  portContextMenu: null,
  autoRoute: true,
  _edgeWaypointStash: null,
  autoRouteConfirmPending: false,
  edgeHitboxSize: 10,
  panMode: DEFAULT_PAN_MODE,
  debugEdges: false,
  debugShowLabels: true,
  debugShowObstacles: true,
  debugShowPenalties: true,
  debugShowWaypoints: true,
  debugShowGrid: true,
  routingParamVersion: 0,
  resizeGuides: [],
  isDemo: false,
  isDragging: false,
  isRouting: false,
  overlapNodeId: null,
  undoSize: 0,
  redoSize: 0,
  printView: false,
  printPaperId: "arch-d",
  printOrientation: "landscape" as Orientation,
  printScale: 1.0,
  printCustomWidthIn: 24,
  printCustomHeightIn: 36,
  printOriginOffsetX: 0,
  printOriginOffsetY: 0,
  colorKeyEnabled: false,
  colorKeyCorner: "bottom-left" as "top-left" | "top-right" | "bottom-left" | "bottom-right",
  colorKeyColumns: 1,
  colorKeyPage: "all" as "first" | "last" | "all",
  colorKeyOverrides: undefined,
  cableCosts: undefined,
  bundles: {},
  roomDistances: undefined,
  distanceSettings: undefined,
  titleBlock: { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
  titleBlockLayout: createDefaultLayout(),
  signalColors: undefined,
  signalLineStyles: undefined,
  reportLayouts: {},
  reportHiddenColumns: {},
  globalReportHeaderLayout: null,
  globalReportFooterLayout: null,
  hiddenSignalTypes: "",
  hiddenPinSignalTypes: "",
  hideUnconnectedPorts: false,
  showPortCounts: false,
  templateHiddenSignals: {},
  templatePresets: {},
  favoriteTemplates: [],
  scrollConfig: { ...DEFAULT_SCROLL_CONFIG },
  cableNamingScheme: "type-prefix" as "sequential" | "type-prefix",
  labelCase: DEFAULT_LABEL_CASE,
  currency: "USD",
  status: undefined,
  showLineJumps: true,
  showMinimap: loadShowMinimap(),
  showFacePlateDetail: false,
  showConnectionLabels: true,
  showCableIdLabels: true,
  showCustomLabels: true,
  cableIdGap: 4,
  cableIdMidOffset: 0,
  cableIdLabelMode: "endpoint" as "endpoint" | "midpoint",
  stubLabelShowPort: DEFAULT_STUB_LABEL_SHOW_PORT,
  stubLabelShowRoom: DEFAULT_STUB_LABEL_SHOW_ROOM,
  stubLabelPageMode: DEFAULT_STUB_LABEL_PAGE_MODE,
  useShortNames: false,
  wrapDeviceLabels: false,
  cableIdMap: {},
  cloudSchematicId: null,
  cloudSavedAt: null,
  fileHandle: null,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  pendingIncompatibleConnection: null,
  hideAdapters: false,
  hiddenAdapterNodeIds: new Set(),
  hiddenVirtualEdgeIds: new Set(),
  virtualEdgeGradients: {},
  pages: [],
  activePage: "schematic",

  setHideAdapters: (hide) => {
    const state = get();
    // Update node styles so React Flow re-measures hidden/shown adapters
    const updatedNodes = state.nodes.map((n) => {
      if (n.type !== "device") return n;
      const data = n.data as DeviceData;
      if (data.deviceType !== "adapter") return n;
      const visibility = data.adapterVisibility ?? "default";
      if (visibility === "force-show" || visibility === "force-hide") return n;
      // This adapter follows the global toggle — update its style to force RF re-measure
      return hide
        ? { ...n, style: { ...n.style, width: 1, height: 1, opacity: 0, pointerEvents: "none" as const } }
        : { ...n, style: { ...n.style, width: undefined, height: undefined, opacity: undefined, pointerEvents: undefined } };
    });
    set({ hideAdapters: hide, nodes: updatedNodes });
    get().saveToLocalStorage();
  },

  onNodesChange: (changes) => {
    const updated = applyNodeChanges(changes, get().nodes) as SchematicNode[];
    // Keep room zIndex pinned low (React Flow may reset it)
    const normalized = updated.map((n) => {
      if (n.type !== "room") return n;
      const locked = (n.data as import("./types").RoomData).locked;
      return {
        ...n,
        zIndex: -1,
        selectable: !locked,
        className: locked ? "locked" : undefined,
      };
    });
    // Mirror waypoint node positions back to canonical edge.data.manualWaypoints
    // so the router and persistence see drag/multi-select-drag results.
    const hasPositionChange = changes.some((c) => c.type === "position");
    const oldEdges = get().edges;
    const newEdges = hasPositionChange
      ? syncEdgesFromWaypointNodes(oldEdges, normalized)
      : oldEdges;
    set({ nodes: normalized, ...(newEdges !== oldEdges ? { edges: newEdges } : {}) });
    get().saveToLocalStorage();
  },

  onEdgesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === "remove");
    if (hasRemove) {
      const state = get();
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }
    const newEdges = applyEdgeChanges(changes, get().edges) as ConnectionEdge[];
    if (hasRemove) {
      // Removed edges may have had waypoint nodes — reconcile them away.
      set({ edges: newEdges, nodes: reconcileWaypointNodes(get().nodes, newEdges) });
    } else {
      set({ edges: newEdges });
    }
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
        const networkBypass = NETWORK_SIGNAL_TYPES.has(srcPort.signalType) && NETWORK_SIGNAL_TYPES.has(tgtPort.signalType);
        if ((canSource && canTarget || networkBypass) && srcPort.signalType !== tgtPort.signalType) {
          // Auto-insert if exactly one adapter matches
          const allTemplates = [...DEVICE_TEMPLATES, ...state.customTemplates];
          const adapterMatches = findAdaptersForSignalBridge(srcPort.signalType, tgtPort.signalType, allTemplates);
          if (adapterMatches.length === 1) {
            set({ pendingIncompatibleConnection: { connection, sourcePort: srcPort, targetPort: tgtPort, reason: "signal-mismatch" } });
            get().insertAdapterBetween(adapterMatches[0]);
            return;
          }
          set({ pendingIncompatibleConnection: { connection, sourcePort: srcPort, targetPort: tgtPort, reason: "signal-mismatch" } });
        }
      }
      return;
    }

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

    // Check if connector types are mismatched (any mismatch, not just CONNECTOR_ACCEPTS pairs)
    const connectorsDiffer = sourcePort && targetPort &&
      sourcePort.connectorType && targetPort.connectorType &&
      sourcePort.connectorType !== targetPort.connectorType &&
      !areConnectorsCompatible(sourcePort.connectorType, targetPort.connectorType);

    if (connectorsDiffer) {
      const allTemplates = [...DEVICE_TEMPLATES, ...state.customTemplates];
      const adapterMatches = findAdaptersForConnectorBridge(
        sourcePort.connectorType!,
        targetPort.connectorType!,
        sourcePort.signalType,
        allTemplates,
      );

      if (adapterMatches.length === 1) {
        // Auto-insert the single matching adapter (insertAdapterBetween handles its own undo)
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        get().insertAdapterBetween(adapterMatches[0]);
        return;
      } else {
        // Zero or multiple matches — show dialog for user to choose (or connect anyway)
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        return;
      }
    }

    // Also handle CONNECTOR_ACCEPTS adapter pairs (compatible but needs adapter cable)
    if (sourcePort && targetPort && needsAdapter(sourcePort.connectorType, targetPort.connectorType)) {
      const allTemplates = [...DEVICE_TEMPLATES, ...state.customTemplates];
      const adapterMatches = findAdaptersForConnectorBridge(
        sourcePort.connectorType!,
        targetPort.connectorType!,
        sourcePort.signalType,
        allTemplates,
      );

      if (adapterMatches.length === 1) {
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        get().insertAdapterBetween(adapterMatches[0]);
        return;
      } else {
        set({ pendingIncompatibleConnection: { connection, sourcePort, targetPort, reason: "connector-mismatch" } });
        return;
      }
    }

    pushUndo({ nodes: state.nodes, edges: state.edges });

    const connectorMismatch = !areConnectorsCompatible(
      sourcePort?.connectorType,
      targetPort?.connectorType,
    );

    // Check if either port is direct-attach (adapter plugs directly into device)
    const isDirectAttach = sourcePort?.directAttach || targetPort?.directAttach;

    const newEdgeData: ConnectionData = {
      signalType: sourcePort?.signalType ?? "custom",
      ...(connectorMismatch ? { connectorMismatch: true } : {}),
      ...(isDirectAttach ? { directAttach: true } : {}),
    };
    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdge: ConnectionEdge = {
      id: nextEdgeId(existingEdges),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      data: newEdgeData,
      style: {
        stroke: resolveEdgeStroke(newEdgeData),
        strokeWidth: isDirectAttach ? 1 : 2,
      },
    };

    set({
      nodes: existingEdges === state.edges ? state.nodes : reconcileWaypointNodes(state.nodes, existingEdges),
      edges: [...existingEdges, newEdge],
    });
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
      preset.ports.forEach((p, i) => {
        idMap.set(p.id, cloned[i].id);
        // Preserve templatePortId across the preset → placement clone.
        if (p.templatePortId) cloned[i].templatePortId = p.templatePortId;
      });
      ports = cloned;
      hiddenPorts = preset.hiddenPorts?.map((id) => idMap.get(id) ?? id).filter((id) => cloned.some((p) => p.id === id));
      color = preset.color ?? template.color;
    } else {
      ports = clonePorts(template.ports);
      // Stamp templatePortId so sync can reconcile even if port IDs drift.
      ports.forEach((p, i) => { p.templatePortId = template.ports[i].id; });
    }

    // Initialize expansion slots from template (recursively handles sub-slots)
    let installedSlots: InstalledSlot[] | undefined;
    if (template.slots && template.slots.length > 0) {
      const result = processTemplateSlots(template.slots);
      installedSlots = result.installedSlots;
      ports = [...ports, ...result.ports];
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
        ...(template.shortName ? { shortName: template.shortName } : {}),
        ...(template.id ? { templateId: template.id } : {}),
        ...(template.version ? { templateVersion: template.version } : {}),
        ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
        ...(template.modelNumber ? { modelNumber: template.modelNumber } : {}),
        ...(template.referenceUrl ? { referenceUrl: template.referenceUrl } : {}),
        ...(template.category ? { category: template.category } : {}),
        ...(template.powerDrawW != null ? { powerDrawW: template.powerDrawW } : {}),
        ...(template.powerCapacityW != null ? { powerCapacityW: template.powerCapacityW } : {}),
        ...(template.voltage ? { voltage: template.voltage } : {}),
        ...(template.poeBudgetW != null ? { poeBudgetW: template.poeBudgetW } : {}),
        ...(template.poeDrawW != null ? { poeDrawW: template.poeDrawW } : {}),
        ...(template.unitCost != null ? { unitCost: template.unitCost } : {}),
        ...(template.thermalBtuh != null ? { thermalBtuh: template.thermalBtuh } : {}),
        ...(template.searchTerms?.length ? { searchTerms: [...template.searchTerms] } : {}),
        ...(template.heightMm != null ? { heightMm: template.heightMm } : {}),
        ...(template.widthMm != null ? { widthMm: template.widthMm } : {}),
        ...(template.depthMm != null ? { depthMm: template.depthMm } : {}),
        ...(template.weightKg != null ? { weightKg: template.weightKg } : {}),
        ...(template.hostname ? { hostname: template.hostname } : {}),
        ...(hiddenPorts && hiddenPorts.length > 0 ? { hiddenPorts } : {}),
        ...(template.isVenueProvided ? { isVenueProvided: true } : {}),
        ...(template.deviceType === "cable-accessory" ? { isCableAccessory: true } : {}),
        ...(template.deviceType === "cable-accessory" &&
          template.ports.some((p) => p.isMulticable && p.connectorType === "none")
          ? { integratedWithCable: true }
          : {}),
        ...(installedSlots && installedSlots.length > 0 ? { slots: installedSlots } : {}),
        // Aux data: carry template's rows, or seed a default {{deviceType}} header row so
        // new placements match the unified aux-data model from schema v27.
        ...(template.auxiliaryData?.length
          ? { auxiliaryData: template.auxiliaryData.map((r) => ({ ...r })) }
          : { auxiliaryData: [{ text: "{{deviceType}}", position: "header" as const }] }),
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

    // Capture selected waypoint nodes — their indices will be spliced out of the
    // owning edge's manualWaypoints below before reconciliation re-spawns the rest.
    const selectedWaypoints = state.nodes.filter(
      (n) => n.type === "waypoint" && n.selected,
    ) as import("./types").WaypointNode[];

    // Build a map for absolute position resolution (needed for multi-level nesting)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    function computeAbsolutePos(nId: string): { x: number; y: number } {
      const n = nodeMap.get(nId);
      if (!n) return { x: 0, y: 0 };
      if (!n.parentId) return n.position;
      const p = computeAbsolutePos(n.parentId);
      return { x: n.position.x + p.x, y: n.position.y + p.y };
    }

    // Also remove edges connected to deleted nodes (excluding waypoint nodes —
    // a waypoint's source/target relationship doesn't exist; they're floating).
    const deletedConnectingNodes = new Set(
      [...selectedNodeIds].filter((id) => {
        const n = nodeMap.get(id);
        return n && n.type !== "waypoint";
      }),
    );
    const survivingEdges = state.edges.filter(
      (e) =>
        !selectedEdgeIds.has(e.id) &&
        !deletedConnectingNodes.has(e.source) &&
        !deletedConnectingNodes.has(e.target),
    );

    // Splice manualWaypoints entries for each selected waypoint node so their
    // indices vanish from the canonical store. Waypoints belonging to deleted
    // edges are dropped wholesale by reconcileWaypointNodes below.
    const edgesAfterSplice = spliceWaypointsForRemovedNodes(survivingEdges, selectedWaypoints);

    const remainingNodes = state.nodes
      .filter((n) => !n.selected)
      .map((n) => {
        if (n.parentId && deletedRoomIds.has(n.parentId)) {
          // Convert to absolute position — walk the full parent chain
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            position: computeAbsolutePos(n.id),
          };
        }
        return n;
      });

    // Cascade-remove rack placements for deleted devices; clear room links for deleted rooms
    const pages = state.pages.length > 0 && selectedNodeIds.size > 0
      ? state.pages.map((page): SchematicPage => {
          if (page.type !== "rack-elevation") return page;
          return {
            ...page,
            placements: page.placements.filter((p) => !selectedNodeIds.has(p.deviceNodeId)),
            racks: page.racks.map((r) =>
              r.linkedRoomId && deletedRoomIds.has(r.linkedRoomId)
                ? { ...r, linkedRoomId: undefined }
                : r
            ),
          };
        })
      : state.pages;

    // Notify user if rack placements were removed
    if (pages !== state.pages) {
      const elevPages = (ps: SchematicPage[]) => ps.filter((p): p is RackElevationPage => p.type === "rack-elevation");
      const removedCount = elevPages(state.pages).reduce((sum, p) => sum + p.placements.length, 0) -
        elevPages(pages).reduce((sum, p) => sum + p.placements.length, 0);
      if (removedCount > 0) {
        get().addToast(`Removed ${removedCount} rack placement${removedCount > 1 ? "s" : ""} for deleted device${selectedNodeIds.size > 1 ? "s" : ""}`, "info");
      }
    }

    // After deleting nodes/edges, waypoint node ids may be stale (indices shifted
    // or owning edges removed). Reconcile against the new canonical edges.
    const reconciledNodes = reconcileWaypointNodes(remainingNodes, edgesAfterSplice);

    // Purge any pairwise distances referencing a deleted room (#146).
    let nextDistances = state.roomDistances;
    if (state.roomDistances && deletedRoomIds.size > 0) {
      const filtered: Record<string, number> = {};
      for (const [key, value] of Object.entries(state.roomDistances)) {
        const [a, b] = key.split("|");
        if (!deletedRoomIds.has(a) && !deletedRoomIds.has(b)) {
          filtered[key] = value;
        }
      }
      nextDistances = Object.keys(filtered).length > 0 ? filtered : undefined;
    }

    // Deleting members may drop a bundle below 2 — GC dangling membership + empty bundles.
    const gc = gcBundles(edgesAfterSplice, state.bundles);
    // Drop junction anchors orphaned by a dissolved bundle (and re-heal a live bundle whose
    // anchor was itself in the deleted selection).
    const healedNodes = reconcileBundleJunctions(reconciledNodes, gc.edges);

    set({
      nodes: renumberNodes(healedNodes),
      edges: gc.edges,
      bundles: gc.bundles,
      pages,
      ...(nextDistances !== state.roomDistances ? { roomDistances: nextDistances } : {}),
    });
    get().saveToLocalStorage();
  },

  deleteNode: (nodeId: string) => {
    // Select only this node, deselect everything else, then removeSelected
    set({
      nodes: get().nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
      edges: get().edges.map((e) => ({ ...e, selected: false })),
    });
    get().removeSelected();
  },

  deleteNodeAndChildren: (nodeId: string) => {
    // Collect all descendants recursively (handles nested subrooms)
    const nodes = get().nodes;
    const toDelete = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (!toDelete.has(n.id) && n.parentId && toDelete.has(n.parentId)) {
          toDelete.add(n.id);
          changed = true;
        }
      }
    }
    set({
      nodes: nodes.map((n) => ({ ...n, selected: toDelete.has(n.id) })),
      edges: get().edges.map((e) => ({ ...e, selected: false })),
    });
    get().removeSelected();
  },

  copySelected: () => {
    const state = get();
    // Waypoint nodes are derived from edge.data.manualWaypoints, and bundle-junction
    // anchors are healed from bundle membership. Excluding both here keeps the clipboard
    // small and lets paste re-spawn them fresh (with re-keyed ids / the remapped bundle)
    // via reconcileWaypointNodes / reconcileBundleJunctions.
    const selectedNodes = state.nodes.filter(
      (n) => n.selected && n.type !== "waypoint" && n.type !== "bundle-junction",
    );
    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedEdges = state.edges.filter(
      (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
    );

    // Compute bounding box height of selection
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of selectedNodes) {
      const h = n.measured?.height ?? 48;
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
    // Stubbed connections are identified by a shared linkedConnectionId across
    // their stub-leg edges and stub-label nodes. Re-key it per pasted connection
    // so the copy is independent of the original — otherwise collapsing one stub
    // would delete both, and labels would resolve through the wrong partner.
    const linkIdMap = new Map<string, string>();
    const remapLink = (oldLink: string): string => {
      let v = linkIdMap.get(oldLink);
      if (!v) {
        v = newLinkedConnectionId();
        linkIdMap.set(oldLink, v);
      }
      return v;
    };
    // Bundles are likewise re-keyed per paste so the copy is an independent bundle.
    const bundleIdMap = new Map<string, string>();
    const remapBundle = (oldId: string): string => {
      let v = bundleIdMap.get(oldId);
      if (!v) {
        v = newBundleId();
        bundleIdMap.set(oldId, v);
      }
      return v;
    };

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
        const remappedHidden = deviceData.hiddenPorts?.length
          ? deviceData.hiddenPorts
              .map((id) => portIdMap.get(id) ?? id)
              .filter((id) => newPorts.some((p) => p.id === id))
          : undefined;
        return {
          ...n,
          id: newId,
          position: { x: n.position.x, y: n.position.y + yOffset },
          selected: true,
          data: {
            ...deviceData,
            ports: newPorts,
            hiddenPorts: remappedHidden && remappedHidden.length > 0 ? remappedHidden : undefined,
          },
        } as DeviceNode;
      }
      if (n.type === "stub-label") {
        const sd = n.data as import("./types").StubLabelData;
        return {
          ...n,
          id: newId,
          position: { x: n.position.x, y: n.position.y + yOffset },
          selected: true,
          data: { ...sd, linkedConnectionId: remapLink(sd.linkedConnectionId) },
        };
      }
      return {
        ...n,
        id: newId,
        position: { x: n.position.x, y: n.position.y + yOffset },
        selected: true,
      };
    });

    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdges: ConnectionEdge[] = [];
    for (const e of clipboard.edges) {
      let data = e.data;
      if (data?.linkedConnectionId) data = { ...data, linkedConnectionId: remapLink(data.linkedConnectionId) };
      if (data?.bundleId) data = { ...data, bundleId: remapBundle(data.bundleId) };
      // A pasted connection is a NEW physical cable — it must get its own cable ID,
      // not inherit the original's (IDs are permanent and label-printable).
      if (data?.cableId) {
        const { cableId: _omitCableId, ...rest } = data;
        data = rest;
      }
      newEdges.push({
        ...e,
        id: nextEdgeId([...existingEdges, ...newEdges]),
        source: nodeIdMap.get(e.source) ?? e.source,
        target: nodeIdMap.get(e.target) ?? e.target,
        sourceHandle: e.sourceHandle ? (portIdMap.get(e.sourceHandle) ?? e.sourceHandle) : e.sourceHandle,
        targetHandle: e.targetHandle ? (portIdMap.get(e.targetHandle) ?? e.targetHandle) : e.targetHandle,
        data,
      });
    }

    // Deselect existing nodes/edges, add pasted ones as selected
    const mergedNodes = [
      ...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      ...newNodes,
    ];
    const mergedEdges = [
      ...existingEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      ...newEdges,
    ];
    // Clone BundleMeta for each remapped bundle, then GC any pasted bundle that ended up
    // with <2 members (e.g. only some members were copied) — dropping both the empty
    // bundle and the now-dangling bundleId on its lone pasted edge.
    let finalEdges = mergedEdges;
    let finalBundles = state.bundles;
    if (bundleIdMap.size > 0) {
      const cloned: Record<string, BundleMeta> = { ...state.bundles };
      for (const [oldId, newId] of bundleIdMap) {
        cloned[newId] = { ...(state.bundles[oldId] ?? {}), id: newId };
      }
      const gc = gcBundles(mergedEdges, cloned);
      finalEdges = gc.edges;
      finalBundles = gc.bundles;
    }
    // Pasted edges may carry manualWaypoints; spawn fresh waypoint nodes for them. Pasted
    // bundles (remapped ids) get fresh break-in/out anchors via reconcileBundleJunctions.
    set({
      nodes: renumberNodes(reconcileBundleJunctions(reconcileWaypointNodes(mergedNodes, finalEdges), finalEdges)),
      edges: finalEdges,
      ...(finalBundles !== state.bundles ? { bundles: finalBundles } : {}),
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

    // Convert to absolute coordinates so alignment works across rooms.
    // Walk the full parent chain — nodes may live inside a rack inside a room.
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const parentOffsets = new Map<string, { dx: number; dy: number }>();
    const absSelected = selected.map((n) => {
      let dx = 0;
      let dy = 0;
      let pid: string | undefined = n.parentId;
      while (pid) {
        const parent = nodeMap.get(pid);
        if (!parent) break;
        dx += parent.position.x;
        dy += parent.position.y;
        pid = parent.parentId;
      }
      parentOffsets.set(n.id, { dx, dy });
      if (dx === 0 && dy === 0) return n;
      return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
    });

    const raw = computeAlignment(absSelected, op);
    if (raw.size === 0) return;
    const resolved = resolveAlignmentOverlaps(absSelected, raw, op);
    if (resolved.size === 0) return;

    // Convert back to parent-relative coordinates
    const updates = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of resolved) {
      const off = parentOffsets.get(id)!;
      updates.set(id, { x: pos.x - off.dx, y: pos.y - off.dy });
    }

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

    // ── Passthrough port handling ────────────────────────────────────────
    const srcIsPassthrough = sourcePort.direction === "passthrough";
    const tgtIsPassthrough = targetPort.direction === "passthrough";

    if (srcIsPassthrough || tgtIsPassthrough) {
      // Detect which face of each passthrough port this connection uses
      const srcSide = connection.sourceHandle?.endsWith("-rear") ? "rear"
        : connection.sourceHandle?.endsWith("-front") ? "front"
        : undefined;
      const tgtSide = connection.targetHandle?.endsWith("-rear") ? "rear"
        : connection.targetHandle?.endsWith("-front") ? "front"
        : undefined;

      // Block same-device connections unless both handles are "-front" on a patch-panel
      // (that's a patch cable connecting two front-face jacks on the same panel)
      if (connection.source === connection.target) {
        const srcNode = state.nodes.find((n) => n.id === connection.source);
        const isFrontToFront = srcSide === "front" && tgtSide === "front";
        const isPatchPanel = (srcNode as DeviceNode | undefined)?.data?.deviceType === "patch-panel";
        if (!isFrontToFront || !isPatchPanel) return false;
      }

      // Resolve the effective connector type for each side
      const srcConnector = srcIsPassthrough
        ? (srcSide === "rear" ? sourcePort.rearConnectorType : srcSide === "front" ? sourcePort.frontConnectorType : sourcePort.connectorType)
        : sourcePort.connectorType;
      const tgtConnector = tgtIsPassthrough
        ? (tgtSide === "rear" ? targetPort.rearConnectorType : tgtSide === "front" ? targetPort.frontConnectorType : targetPort.connectorType)
        : targetPort.connectorType;

      // Connector compatibility (bare-wire always passes)
      if (!areConnectorsCompatible(srcConnector ?? sourcePort.connectorType, tgtConnector ?? targetPort.connectorType)) return false;

      // Signal-type check: if either port inherits its signal from edges we can't know it
      // at connection time, so we accept anything. Otherwise use effectiveSignalType.
      const srcSignal = effectiveSignalType(sourcePort, connection.source, state.edges, srcIsPassthrough ? srcSide : undefined);
      const tgtSignal = effectiveSignalType(targetPort, connection.target, state.edges, tgtIsPassthrough ? tgtSide : undefined);
      const srcInherits = sourcePort.inheritsSignal && srcSignal === sourcePort.signalType;
      const tgtInherits = targetPort.inheritsSignal && tgtSignal === targetPort.signalType;
      if (!srcInherits && !tgtInherits && srcSignal !== tgtSignal) {
        const netBypass = NETWORK_SIGNAL_TYPES.has(srcSignal) && NETWORK_SIGNAL_TYPES.has(tgtSignal);
        const bareBypass = BARE_WIRE_CONNECTORS.has(srcConnector ?? "none" as never) ||
          BARE_WIRE_CONNECTORS.has(tgtConnector ?? "none" as never);
        if (!netBypass && !bareBypass) return false;
      }

      // Duplicate-handle guard (same as non-passthrough below)
      if (!sourcePort.multiConnect) {
        const dup = state.edges.some(
          (e) => e.id !== _reconnectingEdgeId && e.source === connection.source && e.sourceHandle === connection.sourceHandle,
        );
        if (dup) return false;
      }
      if (!targetPort.multiConnect) {
        const dup = state.edges.some(
          (e) => e.id !== _reconnectingEdgeId && e.target === connection.target && e.targetHandle === connection.targetHandle,
        );
        if (dup) return false;
      }

      return true;
    }
    // ── End passthrough handling ─────────────────────────────────────────

    // Network signal types (ethernet, dante, etc.) can connect in any direction
    const networkBypass = NETWORK_SIGNAL_TYPES.has(sourcePort.signalType) && NETWORK_SIGNAL_TYPES.has(targetPort.signalType);
    // Bare-wire connectors (phoenix/terminal-block) bypass signal type checks — if you're
    // screwing bare wire into screw terminals, you presumably know what signal you're carrying
    const bareWireBypass = !!sourcePort.connectorType && !!targetPort.connectorType &&
      BARE_WIRE_CONNECTORS.has(sourcePort.connectorType) && BARE_WIRE_CONNECTORS.has(targetPort.connectorType);
    const signalBypass = areSignalsCompatibleViaConnector(
      sourcePort.signalType, sourcePort.connectorType,
      targetPort.signalType, targetPort.connectorType,
    );
    if (!networkBypass && !bareWireBypass) {
      const canSource = sourcePort.direction === "output" || sourcePort.direction === "bidirectional";
      const canTarget = targetPort.direction === "input" || targetPort.direction === "bidirectional";
      if (!canSource || !canTarget) return false;
    }
    if (sourcePort.signalType !== targetPort.signalType && !networkBypass && !bareWireBypass && !signalBypass) return false;

    // Multicable ports can only connect to other multicable ports
    const srcIsMulticable = sourcePort.isMulticable ?? false;
    const tgtIsMulticable = targetPort.isMulticable ?? false;
    if (srcIsMulticable !== tgtIsMulticable) return false;

    // Don't allow multiple connections to the same handle, unless the port is multi-connect
    if (!targetPort.multiConnect) {
      const duplicateTarget = state.edges.some(
        (e) =>
          e.id !== _reconnectingEdgeId &&
          e.target === connection.target &&
          e.targetHandle === connection.targetHandle,
      );
      if (duplicateTarget) return false;
    }

    if (!sourcePort.multiConnect) {
      const duplicateSource = state.edges.some(
        (e) =>
          e.id !== _reconnectingEdgeId &&
          e.source === connection.source &&
          e.sourceHandle === connection.sourceHandle,
      );
      if (duplicateSource) return false;
    }

    // For bidirectional ports, block the opposite side if one side is already connected
    if (sourcePort.direction === "bidirectional" && connection.sourceHandle) {
      const baseId = connection.sourceHandle.replace(/-(in|out|rear|front)$/, "");
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
      const baseId = connection.targetHandle.replace(/-(in|out|rear|front)$/, "");
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

  updateDeviceShortName: (nodeId, shortName) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const trimmed = shortName.trim();
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        const next = { ...n.data } as DeviceData;
        if (trimmed) next.shortName = trimmed;
        else delete next.shortName;
        return { ...n, data: next } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  batchUpdateDeviceShortNames: (changes) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const changeMap = new Map(changes.map((c) => [c.nodeId, c.shortName.trim()]));
    set({
      nodes: state.nodes.map((n) => {
        if (n.type !== "device") return n;
        const v = changeMap.get(n.id);
        if (v === undefined) return n;
        const next = { ...n.data } as DeviceData;
        if (v) next.shortName = v;
        else delete next.shortName;
        return { ...n, data: next } as DeviceNode;
      }),
    });
    get().saveToLocalStorage();
  },

  updateDevice: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    // Diff old vs new ports to find removed port IDs
    const oldNode = state.nodes.find((n) => n.id === nodeId && n.type === "device");
    const oldPortIds = oldNode
      ? new Set((oldNode.data as DeviceData).ports.map((p) => p.id))
      : new Set<string>();
    const newPortIds = new Set(data.ports.map((p) => p.id));
    const removedPortIds = new Set([...oldPortIds].filter((id) => !newPortIds.has(id)));

    // Remove edges connected to removed ports FIRST so React Flow doesn't
    // reassign them to other handles when the node DOM updates
    if (removedPortIds.size > 0) {
      set({
        edges: state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && removedPortIds.has(srcHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          if (e.target === nodeId && removedPortIds.has(tgtHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          return true;
        }),
      });
    }

    set({
      nodes: renumberNodes(get().nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "device") return n;
        return { ...n, data: { ...data, baseLabel: undefined } } as DeviceNode;
      })),
    });

    // Sync directAttach flag on connected edges when port DA changes
    const newPortMap = new Map(data.ports.map((p) => [p.id, p]));
    const currentEdges = get().edges;
    let edgesChanged = false;
    const syncedEdges = currentEdges.map((e) => {
      // Check if this edge connects to the updated device
      let portOnThisDevice: Port | undefined;
      if (e.source === nodeId) {
        const portId = e.sourceHandle?.replace(/-(in|out|rear|front)$/, "") ?? "";
        portOnThisDevice = newPortMap.get(portId);
      } else if (e.target === nodeId) {
        const portId = e.targetHandle?.replace(/-(in|out|rear|front)$/, "") ?? "";
        portOnThisDevice = newPortMap.get(portId);
      }
      if (!portOnThisDevice) return e;

      const shouldBeDA = portOnThisDevice.directAttach ?? false;
      const currentlyDA = e.data?.directAttach ?? false;
      if (shouldBeDA === currentlyDA) return e;

      edgesChanged = true;
      const nextData = {
        ...e.data!,
        directAttach: shouldBeDA || undefined,
      };
      return {
        ...e,
        data: nextData,
        style: {
          ...e.style,
          stroke: resolveEdgeStroke(nextData),
          strokeWidth: shouldBeDA ? 1 : 2,
        },
      };
    });
    if (edgesChanged) {
      set({ edges: syncedEdges });
    }

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

  convertPortsToPassthrough: (nodeId, inputPortId, outputPortId, newPort) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const removedIds = new Set([inputPortId, outputPortId]);
    const newNodes = state.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "device") return n;
      const data = n.data as DeviceData;
      const insertAt = data.ports.findIndex((p) => removedIds.has(p.id));
      const newPorts = [
        ...data.ports.slice(0, insertAt).filter((p) => !removedIds.has(p.id)),
        newPort,
        ...data.ports.slice(insertAt).filter((p) => !removedIds.has(p.id)),
      ];
      return { ...n, data: { ...data, ports: newPorts } } as DeviceNode;
    });

    const newPortId = newPort.id;
    const newEdges = state.edges.map((e) => {
      if (e.source === nodeId && (e.sourceHandle === inputPortId || e.sourceHandle === `${inputPortId}-out`)) {
        return { ...e, sourceHandle: `${newPortId}-rear` };
      }
      if (e.target === nodeId && (e.targetHandle === inputPortId || e.targetHandle === `${inputPortId}-in`)) {
        return { ...e, targetHandle: `${newPortId}-rear` };
      }
      if (e.source === nodeId && (e.sourceHandle === outputPortId || e.sourceHandle === `${outputPortId}-out`)) {
        return { ...e, sourceHandle: `${newPortId}-front` };
      }
      if (e.target === nodeId && (e.targetHandle === outputPortId || e.targetHandle === `${outputPortId}-in`)) {
        return { ...e, targetHandle: `${newPortId}-front` };
      }
      return e;
    });

    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  convertAllPairsToPassthrough: (nodeId, conversions) => {
    if (conversions.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const inputToNew = new Map<string, string>();
    const outputToNew = new Map<string, string>();
    const newPortById = new Map<string, import("./types").Port>();
    for (const c of conversions) {
      inputToNew.set(c.inputPortId, c.newPort.id);
      outputToNew.set(c.outputPortId, c.newPort.id);
      newPortById.set(c.newPort.id, c.newPort);
    }

    const newNodes = state.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "device") return n;
      const data = n.data as DeviceData;
      const newPorts: import("./types").Port[] = [];
      for (const p of data.ports) {
        if (inputToNew.has(p.id)) {
          const replacement = newPortById.get(inputToNew.get(p.id)!);
          if (replacement) newPorts.push(replacement);
        } else if (outputToNew.has(p.id)) {
          // skip — its pair's input port already emitted the replacement
        } else {
          newPorts.push(p);
        }
      }
      return { ...n, data: { ...data, ports: newPorts } } as DeviceNode;
    });

    const newEdges = state.edges.map((e) => {
      if (e.source === nodeId && e.sourceHandle) {
        const bare = e.sourceHandle.replace(/-(in|out)$/, "");
        const rearId = inputToNew.get(bare);
        if (rearId) return { ...e, sourceHandle: `${rearId}-rear` };
        const frontId = outputToNew.get(bare);
        if (frontId) return { ...e, sourceHandle: `${frontId}-front` };
      }
      if (e.target === nodeId && e.targetHandle) {
        const bare = e.targetHandle.replace(/-(in|out)$/, "");
        const rearId = inputToNew.get(bare);
        if (rearId) return { ...e, targetHandle: `${rearId}-rear` };
        const frontId = outputToNew.get(bare);
        if (frontId) return { ...e, targetHandle: `${frontId}-front` };
      }
      return e;
    });

    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  syncDeviceFromTemplate: (nodeId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId && n.type === "device") as DeviceNode | undefined;
    if (!node?.data.templateId) return null;
    const template = getTemplateById(node.data.templateId, state.customTemplates);
    if (!template || template.version == null) return null;

    const result = syncDeviceWithTemplate(node.data, template, nodeId, state.edges);

    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) =>
        n.id === nodeId && n.type === "device"
          ? ({ ...n, data: result.updatedData } as DeviceNode)
          : n,
      ),
    });
    get().saveToLocalStorage();
    return result;
  },

  swapDevice: (nodeId, plan) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId && n.type === "device") as DeviceNode | undefined;
    if (!node) {
      set({ deviceSwapTarget: null });
      return;
    }

    pushUndo({ nodes: state.nodes, edges: state.edges });

    const oldData = node.data;
    const newTemplate = plan.newTemplate;
    const customTemplates = state.customTemplates;

    // 1. Build base ports — clone with fresh IDs and stamp templatePortId.
    const basePorts = clonePorts(newTemplate.ports);
    basePorts.forEach((p, i) => { p.templatePortId = newTemplate.ports[i].id; });
    const baseByTemplateId = new Map<string, Port>();
    newTemplate.ports.forEach((tp, i) => { baseByTemplateId.set(tp.id, basePorts[i]); });

    // 2. Build slots respecting plan.installedCards (only enabled cards installed).
    //    Walk slot defs depth-first; empty/unmatched slots get their template defaults.
    const installedSlots: InstalledSlot[] = [];
    const cardPorts: Port[] = [];
    const cardByRef = new Map<string, Map<string, Port>>(); // slotId → (cardTemplatePortId → clonedPort)

    const walkSlotDefs = (slotDefs: SlotDefinition[], parentPath: string | undefined, parentLabel: string | undefined) => {
      for (const sd of slotDefs) {
        const fullId = parentPath ? `${parentPath}/${sd.id}` : sd.id;
        const fullLabel = parentLabel ? `${parentLabel} > ${sd.label}` : sd.label;
        const planned = plan.installedCards.find((c) => c.slotId === fullId && c.enabled);
        const cardTplId = planned ? planned.cardTemplateId : sd.defaultCardId;
        const cardTpl = cardTplId ? getTemplateById(cardTplId, customTemplates) : undefined;

        if (cardTpl) {
          const cloned = cloneCardPorts(cardTpl.ports, fullId, fullLabel);
          cloned.forEach((p, i) => { p.templatePortId = cardTpl.ports[i].id; });
          cardPorts.push(...cloned);
          const refMap = new Map<string, Port>();
          cardTpl.ports.forEach((cp, i) => refMap.set(cp.id, cloned[i]));
          cardByRef.set(fullId, refMap);

          installedSlots.push({
            slotId: fullId,
            label: sd.label,
            slotFamily: sd.slotFamily,
            ...(parentPath ? { parentSlotId: parentPath } : {}),
            ...(sd.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
            cardTemplateId: cardTpl.id,
            cardLabel: cardTpl.label,
            cardManufacturer: cardTpl.manufacturer,
            cardModelNumber: cardTpl.modelNumber,
            cardUnitCost: cardTpl.unitCost,
            portIds: cloned.map((p) => p.id),
          });
          if (cardTpl.slots && cardTpl.slots.length > 0) {
            walkSlotDefs(cardTpl.slots, fullId, fullLabel);
          }
        } else {
          installedSlots.push({
            slotId: fullId,
            label: sd.label,
            slotFamily: sd.slotFamily,
            ...(parentPath ? { parentSlotId: parentPath } : {}),
            ...(sd.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
            portIds: [],
          });
        }
      }
    };
    if (newTemplate.slots && newTemplate.slots.length > 0) {
      walkSlotDefs(newTemplate.slots, undefined, undefined);
    }

    const newPorts: Port[] = [...basePorts, ...cardPorts];

    // 3. Resolve NewPortRef → final Port.
    const resolveRef = (ref: NewPortRef): Port | undefined => {
      if (ref.kind === "base") return baseByTemplateId.get(ref.templatePortId);
      return cardByRef.get(ref.slotId)?.get(ref.cardTemplatePortId);
    };

    // 4. Per-port preservation: carry user customizations (label, flipped, network config,
    //    notes, etc.) from old port onto its remapped new port. mergePort-style.
    const mergedNewPortIds = new Set<string>();
    for (const m of plan.mappings) {
      if (!m.newPortRef) continue;
      const target = resolveRef(m.newPortRef);
      if (!target) continue;
      if (mergedNewPortIds.has(target.id)) continue;
      mergedNewPortIds.add(target.id);
      const op = m.oldPort;
      if (op.label) target.label = op.label;
      if (op.flipped) target.flipped = op.flipped;
      if (op.notes) target.notes = op.notes;
      if (op.activeConfig) target.activeConfig = { ...op.activeConfig };
      if (op.linkSpeed) target.linkSpeed = op.linkSpeed;
      if (op.gender) target.gender = op.gender;
      if (op.poeDrawW != null) target.poeDrawW = op.poeDrawW;
      if (op.networkConfig && NETWORK_SIGNAL_TYPES.has(target.signalType)) {
        target.networkConfig = { ...op.networkConfig };
      }
    }

    // 5. Build new DeviceData. Take factual fields from template; preserve a small set
    //    of instance-level customizations from the old device.
    const userRenamed = !oldData.baseLabel; // baseLabel cleared on user rename
    const preservedLabel = userRenamed ? oldData.label : newTemplate.label;
    const newData: DeviceData = {
      label: preservedLabel,
      deviceType: newTemplate.deviceType,
      ports: newPorts,
      ...(newTemplate.color ? { color: newTemplate.color } : {}),
      ...(userRenamed ? {} : { baseLabel: newTemplate.label }),
      model: newTemplate.label,
      ...(newTemplate.shortName ? { shortName: newTemplate.shortName } : {}),
      ...(newTemplate.id ? { templateId: newTemplate.id } : {}),
      ...(newTemplate.version ? { templateVersion: newTemplate.version } : {}),
      ...(newTemplate.manufacturer ? { manufacturer: newTemplate.manufacturer } : {}),
      ...(newTemplate.modelNumber ? { modelNumber: newTemplate.modelNumber } : {}),
      ...(newTemplate.referenceUrl ? { referenceUrl: newTemplate.referenceUrl } : {}),
      ...(newTemplate.category ? { category: newTemplate.category } : {}),
      ...(newTemplate.powerDrawW != null ? { powerDrawW: newTemplate.powerDrawW } : {}),
      ...(newTemplate.powerCapacityW != null ? { powerCapacityW: newTemplate.powerCapacityW } : {}),
      ...(newTemplate.voltage ? { voltage: newTemplate.voltage } : {}),
      ...(newTemplate.poeBudgetW != null ? { poeBudgetW: newTemplate.poeBudgetW } : {}),
      ...(newTemplate.poeDrawW != null ? { poeDrawW: newTemplate.poeDrawW } : {}),
      ...(newTemplate.unitCost != null ? { unitCost: newTemplate.unitCost } : {}),
      ...(newTemplate.thermalBtuh != null ? { thermalBtuh: newTemplate.thermalBtuh } : {}),
      ...(newTemplate.searchTerms?.length ? { searchTerms: [...newTemplate.searchTerms] } : {}),
      ...(newTemplate.heightMm != null ? { heightMm: newTemplate.heightMm } : {}),
      ...(newTemplate.widthMm != null ? { widthMm: newTemplate.widthMm } : {}),
      ...(newTemplate.depthMm != null ? { depthMm: newTemplate.depthMm } : {}),
      ...(newTemplate.weightKg != null ? { weightKg: newTemplate.weightKg } : {}),
      ...(newTemplate.isVenueProvided ? { isVenueProvided: true } : {}),
      ...(newTemplate.deviceType === "cable-accessory" ? { isCableAccessory: true } : {}),
      ...(installedSlots.length > 0 ? { slots: installedSlots } : {}),
      ...(newTemplate.auxiliaryData?.length
        ? { auxiliaryData: newTemplate.auxiliaryData.map((r) => ({ ...r })) }
        : { auxiliaryData: [{ text: "{{deviceType}}", position: "header" as const }] }),
      // Preserved instance fields:
      ...(oldData.hostname ? { hostname: oldData.hostname } : (newTemplate.hostname ? { hostname: newTemplate.hostname } : {})),
      ...(oldData.useShortName !== undefined ? { useShortName: oldData.useShortName } : {}),
      ...(oldData.wrapLabel !== undefined ? { wrapLabel: oldData.wrapLabel } : {}),
    };

    // 6. Remap edges. For each mapping with a target, compute the new handle. Otherwise drop.
    const droppedEdgeIds = new Set<string>();
    const linkedIdsToDrop = new Set<string>();
    const edgeHandleUpdates = new Map<string, { sourceHandle?: string; targetHandle?: string }>();
    let remappedCount = 0;

    const markDropped = (edges: ConnectionEdge[]) => {
      for (const e of edges) {
        droppedEdgeIds.add(e.id);
        if (e.data?.linkedConnectionId) linkedIdsToDrop.add(e.data.linkedConnectionId);
      }
    };

    for (const m of plan.mappings) {
      if (!m.newPortRef) {
        markDropped(m.edges);
        continue;
      }
      const target = resolveRef(m.newPortRef);
      if (!target) {
        markDropped(m.edges);
        continue;
      }
      const newSuffix = chooseNewHandleSuffix(m.oldHandleSuffix, target.direction);
      if (newSuffix === null) {
        markDropped(m.edges);
        continue;
      }
      const newHandle = target.id + newSuffix;
      for (const e of m.edges) {
        const upd = edgeHandleUpdates.get(e.id) ?? {};
        if (m.oldEndpoint === "source") upd.sourceHandle = newHandle;
        else upd.targetHandle = newHandle;
        edgeHandleUpdates.set(e.id, upd);
        remappedCount++;
      }
    }

    // 7. Cascade drops to stub-leg partners and stub-label nodes.
    if (linkedIdsToDrop.size > 0) {
      for (const e of state.edges) {
        if (e.data?.linkedConnectionId && linkedIdsToDrop.has(e.data.linkedConnectionId)) {
          droppedEdgeIds.add(e.id);
        }
      }
    }

    // 8. Assemble new edges + node array.
    const newEdges: ConnectionEdge[] = [];
    for (const e of state.edges) {
      if (droppedEdgeIds.has(e.id)) continue;
      const upd = edgeHandleUpdates.get(e.id);
      newEdges.push(upd ? { ...e, ...upd } : e);
    }

    let newNodes: SchematicNode[] = state.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return { ...n, data: newData } as DeviceNode;
    });
    if (linkedIdsToDrop.size > 0) {
      newNodes = newNodes.filter((n) => {
        if (n.type !== "stub-label") return true;
        const sd = n.data as import("./types").StubLabelData;
        return !linkedIdsToDrop.has(sd.linkedConnectionId);
      });
    }

    set({
      nodes: renumberNodes(newNodes),
      edges: newEdges,
      deviceSwapTarget: null,
    });

    const droppedCount = [...droppedEdgeIds].filter((id) => state.edges.some((e) => e.id === id)).length;
    const installedCount = plan.installedCards.filter((c) => c.enabled).length;
    let toast = `Swapped to ${newTemplate.label}: ${remappedCount} connection${remappedCount !== 1 ? "s" : ""} remapped`;
    if (droppedCount > 0) toast += `, ${droppedCount} dropped`;
    if (installedCount > 0) toast += `; ${installedCount} card${installedCount !== 1 ? "s" : ""} installed`;
    get().addToast(toast, "success");
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

    // Collect ALL port IDs from this slot and any descendant slots
    const descendantSlots = slots.filter((s) => s.parentSlotId && s.parentSlotId.startsWith(slotId));
    const allOldPortIds = new Set([
      ...oldSlot.portIds,
      ...descendantSlots.flatMap((s) => s.portIds),
    ]);
    const descendantSlotIds = new Set(descendantSlots.map((s) => s.slotId));

    // Remove old card's ports (including descendant ports)
    let newPorts = data.ports.filter((p) => !allOldPortIds.has(p.id));

    // Remove edges connected to old card's ports
    const newEdges = allOldPortIds.size > 0
      ? state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && allOldPortIds.has(srcHandle)) return false;
          if (e.target === nodeId && allOldPortIds.has(tgtHandle)) return false;
          if (e.source === nodeId && allOldPortIds.has(srcHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          if (e.target === nodeId && allOldPortIds.has(tgtHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          return true;
        })
      : state.edges;

    // Remove descendant slots from the array
    let newSlots = slots.filter((s) => !descendantSlotIds.has(s.slotId));

    // Build new slot (with recursive sub-slot processing)
    let newSlot: InstalledSlot;
    let childSlots: InstalledSlot[] = [];
    if (cardTemplateId) {
      const cardTpl = getTemplateById(cardTemplateId, state.customTemplates);
      if (!cardTpl) return;

      // Determine display label for port sections
      const parentLabel = oldSlot.parentSlotId
        ? slots.find((s) => s.slotId === oldSlot.parentSlotId)?.label
        : undefined;
      const displayLabel = parentLabel ? `${parentLabel} > ${oldSlot.label}` : oldSlot.label;

      const cardPorts = cloneCardPorts(cardTpl.ports, slotId, displayLabel);
      newPorts = [...newPorts, ...cardPorts];
      newSlot = {
        slotId,
        label: oldSlot.label,
        slotFamily: oldSlot.slotFamily,
        ...(oldSlot.parentSlotId ? { parentSlotId: oldSlot.parentSlotId } : {}),
        ...(oldSlot.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        cardTemplateId: cardTpl.id,
        cardLabel: cardTpl.label,
        cardManufacturer: cardTpl.manufacturer,
        cardModelNumber: cardTpl.modelNumber,
        cardUnitCost: cardTpl.unitCost,
        portIds: cardPorts.map((p) => p.id),
      };

      // Process new card's sub-slots recursively
      if (cardTpl.slots && cardTpl.slots.length > 0) {
        const nested = processTemplateSlots(cardTpl.slots, slotId, displayLabel);
        childSlots = nested.installedSlots;
        newPorts = [...newPorts, ...nested.ports];
      }
    } else {
      newSlot = {
        slotId,
        label: oldSlot.label,
        slotFamily: oldSlot.slotFamily,
        ...(oldSlot.parentSlotId ? { parentSlotId: oldSlot.parentSlotId } : {}),
        ...(oldSlot.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
        portIds: [],
      };
    }

    newSlots = newSlots.map((s) => (s.slotId === slotId ? newSlot : s));
    // Insert child slots right after the parent slot
    if (childSlots.length > 0) {
      const parentIdx = newSlots.findIndex((s) => s.slotId === slotId);
      newSlots.splice(parentIdx + 1, 0, ...childSlots);
    }

    const newNode = {
      ...node,
      data: { ...data, ports: newPorts, slots: newSlots },
    } as DeviceNode;

    const newNodes = state.nodes.map((n, i) => (i === nodeIdx ? newNode : n));
    set({ nodes: newNodes, edges: newEdges });
    get().saveToLocalStorage();
  },

  addSlot: (nodeId, { label, slotFamily }) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];

    const newSlot: InstalledSlot = {
      slotId: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      slotFamily,
      portIds: [],
    };

    const newNode = {
      ...node,
      data: { ...data, slots: [...slots, newSlot] },
    } as DeviceNode;

    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)) });
    get().saveToLocalStorage();
  },

  addSlots: (nodeId, slots) => {
    if (slots.length === 0) return;
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const existing = data.slots ?? [];

    const stamp = Date.now();
    const newSlots: InstalledSlot[] = slots.map((s, i) => ({
      slotId: `slot-${stamp}-${Math.random().toString(36).slice(2, 6)}-${i}`,
      label: s.label,
      slotFamily: s.slotFamily,
      portIds: [],
    }));

    const newNode = {
      ...node,
      data: { ...data, slots: [...existing, ...newSlots] },
    } as DeviceNode;

    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)) });
    get().saveToLocalStorage();
  },

  updateSlot: (nodeId, slotId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];
    if (!slots.some((s) => s.slotId === slotId)) return;

    const newSlots = slots.map((s) =>
      s.slotId === slotId
        ? {
            ...s,
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            ...(patch.slotFamily !== undefined ? { slotFamily: patch.slotFamily } : {}),
            ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
          }
        : s,
    );

    const newNode = { ...node, data: { ...data, slots: newSlots } } as DeviceNode;
    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)) });
    get().saveToLocalStorage();
  },

  removeSlot: (nodeId, slotId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const nodeIdx = state.nodes.findIndex((n) => n.id === nodeId && n.type === "device");
    if (nodeIdx === -1) return;
    const node = state.nodes[nodeIdx] as DeviceNode;
    const data = node.data;
    const slots = data.slots ?? [];
    const target = slots.find((s) => s.slotId === slotId);
    if (!target) return;

    // Slot and all descendants (nested cards)
    const descendants = slots.filter((s) => s.parentSlotId && s.parentSlotId.startsWith(slotId));
    const removedSlotIds = new Set<string>([slotId, ...descendants.map((s) => s.slotId)]);
    const removedPortIds = new Set<string>([
      ...target.portIds,
      ...descendants.flatMap((s) => s.portIds),
    ]);

    const newPorts = data.ports.filter((p) => !removedPortIds.has(p.id));
    const newSlots = slots.filter((s) => !removedSlotIds.has(s.slotId));

    const newEdges = removedPortIds.size > 0
      ? state.edges.filter((e) => {
          const srcHandle = e.sourceHandle ?? "";
          const tgtHandle = e.targetHandle ?? "";
          if (e.source === nodeId && removedPortIds.has(srcHandle)) return false;
          if (e.target === nodeId && removedPortIds.has(tgtHandle)) return false;
          if (e.source === nodeId && removedPortIds.has(srcHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          if (e.target === nodeId && removedPortIds.has(tgtHandle.replace(/-(in|out|rear|front)$/, ""))) return false;
          return true;
        })
      : state.edges;

    const newNode = {
      ...node,
      data: { ...data, ports: newPorts, slots: newSlots },
    } as DeviceNode;

    set({ nodes: state.nodes.map((n, i) => (i === nodeIdx ? newNode : n)), edges: newEdges });
    get().saveToLocalStorage();
  },

  setEditingNodeId: (id) => {
    set({ editingNodeId: id });
  },

  setCreatingNodeId: (id) => {
    set({ creatingNodeId: id });
  },

  createAndEditDevice: (template, position) => {
    get().addDevice(template, position);
    const nodes = get().nodes;
    const newNodeId = nodes[nodes.length - 1].id;
    set({ editingNodeId: newNodeId, creatingNodeId: newNodeId });
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
      selected: true,
      zIndex: -1,
    };
    // Rooms must appear before their potential children in the array
    // Deselect everything else so the new room is the sole selection
    const deselected = state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
    set({ nodes: [newRoom, ...deselected] });
    // Capture any existing devices that now fall inside the new room's bounds
    get().reparentAllDevices({ skipUndo: true });
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
    const existingRoom = state.nodes.find((n) => n.id === nodeId && n.type === "room");
    const existingData = existingRoom?.data as import("./types").RoomData | undefined;
    const prevLinkedRackPageId = existingData?.linkedRackPageId;
    const prevLinkedRackId = existingData?.linkedRackId;
    const newLinkedRackPageId = data.linkedRackPageId;
    const newLinkedRackId = data.linkedRackId;
    const linkChanged = newLinkedRackPageId !== prevLinkedRackPageId || newLinkedRackId !== prevLinkedRackId;

    const updatedNodes = state.nodes.map((n) => {
      if (n.id !== nodeId || n.type !== "room") return n;
      const wasLocked = (n.data as import("./types").RoomData).locked;
      const merged = wasLocked ? { ...data, locked: true } : data;
      return { ...n, data: merged } as SchematicNode;
    });

    // Update rack backpointers atomically when link changes
    let updatedPages = state.pages;
    if (linkChanged) {
      updatedPages = state.pages.map((p): SchematicPage => {
        if (p.type !== "rack-elevation") return p;
        // Set new rack's linkedRoomId
        if (newLinkedRackPageId && newLinkedRackId && p.id === newLinkedRackPageId) {
          return { ...p, racks: p.racks.map((r) => {
            // Clear any previous link this rack had to a different room
            if (r.id === newLinkedRackId) return { ...r, linkedRoomId: nodeId };
            // Clear other racks on this page if they were linked to the same room
            if (r.linkedRoomId === nodeId) return { ...r, linkedRoomId: undefined };
            return r;
          })};
        }
        // Clear old rack's linkedRoomId
        if (prevLinkedRackPageId && prevLinkedRackId && p.id === prevLinkedRackPageId) {
          return { ...p, racks: p.racks.map((r) => r.id === prevLinkedRackId ? { ...r, linkedRoomId: undefined } : r) };
        }
        return p;
      });
    }

    set({ nodes: updatedNodes, pages: updatedPages });
    get().saveToLocalStorage();
  },

  updateAnnotation: (nodeId, data) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "annotation") return n;
        return { ...n, data: { ...n.data, ...data } } as SchematicNode;
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
          selectable: !locked,
          className: locked ? "locked" : undefined,
          data: {
            ...n.data,
            locked: locked || undefined, // keep JSON clean
          },
        } as SchematicNode;
      }),
    });
    get().saveToLocalStorage();
  },

  toggleEquipmentRack: (nodeId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "room") return n;
        const wasRack = (n.data as import("./types").RoomData).isEquipmentRack;
        return {
          ...n,
          data: {
            ...n.data,
            isEquipmentRack: wasRack ? undefined : true,
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

  reparentNode: (nodeId, absolutePosition, options) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const isRoom = node.type === "room";
    const nodeW = node.measured?.width ?? (isRoom ? 400 : 144);
    const nodeH = node.measured?.height ?? (isRoom ? 300 : 48);
    const centerX = absolutePosition.x + nodeW / 2;
    const centerY = absolutePosition.y + nodeH / 2;

    const targetRoom = findBestEnclosingRoom(nodeId, isRoom, centerX, centerY, state.nodes, nodeMap);

    const currentParent = node.parentId;
    const newParent = targetRoom?.id;

    if (currentParent === newParent) return; // no change

    if (!options?.skipUndo) {
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }

    let updated = state.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      if (newParent && targetRoom) {
        const targetAbsPos = getAbsolutePosition(targetRoom.id, nodeMap);
        return {
          ...n,
          parentId: newParent,
          position: {
            x: absolutePosition.x - targetAbsPos.x,
            y: absolutePosition.y - targetAbsPos.y,
          },
        };
      } else {
        return {
          ...n,
          parentId: undefined,
          position: absolutePosition,
        };
      }
    });

    updated = sortNodesParentFirst(updated);

    set({ nodes: updated });
    get().saveToLocalStorage();
  },

  reparentAllDevices: (options) => {
    const state = get();
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const updates = new Map<string, { parentId: string | undefined; position: { x: number; y: number } }>();

    // Diagnostic fingerprint — should never fire on current code paths. If it
    // does, some mutation is parenting waypoints under rooms despite the skip
    // here and the migration. Surfaces in user consoles too so support can ask
    // "do you see [waypoint-orphan] anywhere?" for a 5-second triage.
    const orphaned = state.nodes.filter((n) => n.type === "waypoint" && n.parentId);
    if (orphaned.length > 0) {
      console.warn(
        "[waypoint-orphan]",
        orphaned.length,
        "waypoints carrying parentId at reparent time",
        orphaned.slice(0, 5).map((n) => ({
          id: n.id,
          parentId: n.parentId,
          edgeId: (n.data as { edgeId?: string } | undefined)?.edgeId,
        })),
      );
    }

    for (const node of state.nodes) {
      // Waypoints belong to edges, not rooms — reparenting them turns their
      // .position into relative-to-room coords, which downstream sync code
      // mistakes for absolute and corrupts manualWaypoints.
      if (node.type === "room" || node.type === "waypoint") continue;

      const absPos = getAbsolutePosition(node.id, nodeMap);
      const nodeW = node.measured?.width ?? 144;
      const nodeH = node.measured?.height ?? 48;
      const centerX = absPos.x + nodeW / 2;
      const centerY = absPos.y + nodeH / 2;

      const targetRoom = findBestEnclosingRoom(node.id, false, centerX, centerY, state.nodes, nodeMap);
      const newParent = targetRoom?.id;
      if (node.parentId === newParent) continue;

      if (targetRoom) {
        const targetAbs = getAbsolutePosition(targetRoom.id, nodeMap);
        updates.set(node.id, {
          parentId: targetRoom.id,
          position: { x: absPos.x - targetAbs.x, y: absPos.y - targetAbs.y },
        });
      } else {
        updates.set(node.id, { parentId: undefined, position: absPos });
      }
    }

    if (updates.size === 0) return;

    if (!options?.skipUndo) {
      pushUndo({ nodes: state.nodes, edges: state.edges });
    }

    let updated = state.nodes.map((n) => {
      const u = updates.get(n.id);
      if (!u) return n;
      return { ...n, parentId: u.parentId, position: u.position };
    });
    updated = sortNodesParentFirst(updated);
    set({ nodes: updated });
    get().saveToLocalStorage();
  },

  onRoomResizeEnd: (_nodeId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    get().reparentAllDevices({ skipUndo: true });
  },

  pushSnapshot: () => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
  },

  setPendingUndoSnapshot: () => {
    const state = get();
    pendingUndoSnapshot = structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles });
  },

  clearPendingUndoSnapshot: () => {
    pendingUndoSnapshot = null;
  },

  flushPendingSnapshot: () => {
    if (pendingUndoSnapshot) {
      // pushUndo consumes pendingUndoSnapshot automatically
      pushUndo({ nodes: get().nodes, edges: get().edges });
    }
  },

  undo: () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const state = get();
    redoStack.push(structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles, autoRoute: state.autoRoute }));
    const edges = prev.edges.map(({ zIndex: _, selected: _s, ...rest }) => ({ ...rest, zIndex: 0 })) as typeof prev.edges;
    const restoreAutoRoute = prev.autoRoute !== undefined ? { autoRoute: prev.autoRoute } : {};
    set({ nodes: prev.nodes, edges, pages: prev.pages ?? state.pages, bundles: prev.bundles ?? state.bundles, ...restoreAutoRoute, undoSize: undoStack.length, redoSize: redoStack.length });
    get().saveToLocalStorage();
  },

  redo: () => {
    const next = redoStack.pop();
    if (!next) return;
    const state = get();
    undoStack.push(structuredClone({ nodes: state.nodes, edges: state.edges, pages: state.pages, bundles: state.bundles, autoRoute: state.autoRoute }));
    const edges = next.edges.map(({ zIndex: _, selected: _s, ...rest }) => ({ ...rest, zIndex: 0 })) as typeof next.edges;
    const restoreAutoRoute = next.autoRoute !== undefined ? { autoRoute: next.autoRoute } : {};
    set({ nodes: next.nodes, edges, pages: next.pages ?? state.pages, bundles: next.bundles ?? state.bundles, ...restoreAutoRoute, undoSize: undoStack.length, redoSize: redoStack.length });
    get().saveToLocalStorage();
  },

  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

  selectAll: () => {
    const state = get();
    set({
      nodes: state.nodes.map((n) => ({ ...n, selected: n.type !== "room" })),
      edges: state.edges.map((e) => ({ ...e, selected: true })),
    });
  },

  selectEdges: (ids) => {
    const want = new Set(ids);
    const state = get();
    set({
      nodes: state.nodes.some((n) => n.selected) ? state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) : state.nodes,
      edges: state.edges.map((e) => {
        const sel = want.has(e.id);
        return e.selected === sel ? e : { ...e, selected: sel };
      }),
    });
  },

  addCustomTemplate: (template) => {
    const updated = [...get().customTemplates, template];
    const order = [...get().customTemplateOrder, templateKey(template)];
    set({ customTemplates: updated, customTemplateOrder: order });
    saveCustomTemplates(updated);
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments: get().customTemplateGroupAssignments });
  },

  updateCustomTemplate: (id, template) => {
    const updated = get().customTemplates.map((t) => (t.id === id ? template : t));
    set({ customTemplates: updated });
    saveCustomTemplates(updated);
  },

  addOwnedGear: (template, quantity = 1) => {
    const normalizedQuantity = Math.max(1, Math.floor(quantity));
    const key = templateKey(template);
    const ownedGear = [...get().ownedGear];
    const existing = ownedGear.find((item) => templateKey(item.template) === key);
    if (existing) {
      existing.quantity += normalizedQuantity;
    } else {
      ownedGear.push({ template: structuredClone(template), quantity: normalizedQuantity });
    }
    set({ ownedGear, showOwnedGearPane: true });
    get().saveToLocalStorage();
  },

  setOwnedGear: (items) => {
    const ownedGear = items
      .map((item) => ({
        template: structuredClone(item.template),
        quantity: Math.max(1, Math.floor(item.quantity)),
      }))
      .filter((item) => item.template && item.quantity > 0);
    set({ ownedGear, showOwnedGearPane: true });
    get().saveToLocalStorage();
  },

  updateOwnedGearQuantity: (key, quantity) => {
    const nextQuantity = Math.max(0, Math.floor(quantity));
    const ownedGear = nextQuantity === 0
      ? get().ownedGear.filter((item) => templateKey(item.template) !== key)
      : get().ownedGear.map((item) =>
          templateKey(item.template) === key
            ? { ...item, quantity: nextQuantity }
            : item,
        );
    set({ ownedGear });
    get().saveToLocalStorage();
  },

  removeOwnedGear: (key) => {
    set({ ownedGear: get().ownedGear.filter((item) => templateKey(item.template) !== key) });
    get().saveToLocalStorage();
  },

  setShowOwnedGearPane: (show) => {
    set({
      showOwnedGearPane: show,
      libraryActiveTab: show ? get().libraryActiveTab : "devices",
    });
    get().saveToLocalStorage();
  },

  setLibraryActiveTab: (tab) => {
    set({ libraryActiveTab: tab });
    get().saveToLocalStorage();
  },

  removeCustomTemplate: (key) => {
    const updated = get().customTemplates.filter((t) => templateKey(t) !== key);
    const order = get().customTemplateOrder.filter((k) => k !== key);
    const { [key]: _, ...groupAssignments } = get().customTemplateGroupAssignments;
    set({ customTemplates: updated, customTemplateOrder: order, customTemplateGroupAssignments: groupAssignments });
    saveCustomTemplates(updated);
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments });
  },

  clearAllCustomTemplates: () => {
    set({
      customTemplates: [],
      customTemplateOrder: [],
      customTemplateGroups: [],
      customTemplateGroupAssignments: {},
    });
    saveCustomTemplates([]);
    saveCustomTemplateMeta({ groups: [], order: [], groupAssignments: {} });
  },

  // Custom template organization (#62)
  reorderCustomTemplate: (key, targetIndex) => {
    const order = get().customTemplateOrder.filter((k) => k !== key);
    order.splice(targetIndex, 0, key);
    set({ customTemplateOrder: order });
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments: get().customTemplateGroupAssignments });
  },

  moveCustomTemplateToGroup: (key, groupId) => {
    const groupAssignments = { ...get().customTemplateGroupAssignments };
    if (groupId) {
      groupAssignments[key] = groupId;
    } else {
      delete groupAssignments[key];
    }
    set({ customTemplateGroupAssignments: groupAssignments });
    saveCustomTemplateMeta({ groups: get().customTemplateGroups, order: get().customTemplateOrder, groupAssignments });
  },

  addCustomTemplateGroup: (label) => {
    const id = `group-${Date.now()}`;
    const groups = [...get().customTemplateGroups, { id, label }];
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
    return id;
  },

  removeCustomTemplateGroup: (groupId) => {
    const groups = get().customTemplateGroups.filter((g) => g.id !== groupId);
    const groupAssignments = { ...get().customTemplateGroupAssignments };
    for (const [dt, gid] of Object.entries(groupAssignments)) {
      if (gid === groupId) delete groupAssignments[dt];
    }
    set({ customTemplateGroups: groups, customTemplateGroupAssignments: groupAssignments });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments });
  },

  renameCustomTemplateGroup: (groupId, label) => {
    const groups = get().customTemplateGroups.map((g) => g.id === groupId ? { ...g, label } : g);
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
  },

  reorderCustomTemplateGroup: (groupId, newIndex) => {
    const groups = get().customTemplateGroups.filter((g) => g.id !== groupId);
    const group = get().customTemplateGroups.find((g) => g.id === groupId);
    if (!group) return;
    groups.splice(newIndex, 0, group);
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
  },

  toggleCustomGroupCollapsed: (groupId) => {
    const groups = get().customTemplateGroups.map((g) =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
    );
    set({ customTemplateGroups: groups });
    saveCustomTemplateMeta({ groups, order: get().customTemplateOrder, groupAssignments: get().customTemplateGroupAssignments });
  },

  // Category order (#62)
  reorderCategory: (category, targetIndex) => {
    // Build from current order or default
    const current = get().categoryOrder;
    const arr = current ? [...current] : [...CATEGORY_ORDER_DEFAULT];
    const fromIndex = arr.indexOf(category);
    if (fromIndex === -1) return;
    arr.splice(fromIndex, 1);
    arr.splice(targetIndex, 0, category);
    set({ categoryOrder: arr });
    saveCategoryOrder(arr);
  },

  resetCategoryOrder: () => {
    set({ categoryOrder: null });
    saveCategoryOrder(null);
  },

  dismissIncompatibleDialog: () => {
    set({ pendingIncompatibleConnection: null });
  },

  forceIncompatibleConnection: () => {
    const state = get();
    const pending = state.pendingIncompatibleConnection;
    if (!pending) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const incompatibleData: ConnectionData = {
      signalType: pending.sourcePort.signalType,
      connectorMismatch: true,
      allowIncompatible: true,
    };
    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdge: ConnectionEdge = {
      id: nextEdgeId(existingEdges),
      source: pending.connection.source,
      target: pending.connection.target,
      sourceHandle: pending.connection.sourceHandle,
      targetHandle: pending.connection.targetHandle,
      data: incompatibleData,
      style: {
        stroke: resolveEdgeStroke(incompatibleData),
        strokeWidth: 2,
      },
    };

    set({
      nodes: existingEdges === state.edges ? state.nodes : reconcileWaypointNodes(state.nodes, existingEdges),
      edges: [...existingEdges, newEdge],
      pendingIncompatibleConnection: null,
    });
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

    // Compute absolute positions, walking the full parent chain so devices
    // inside a rack inside a room resolve correctly.
    const adapterNodeMap = new Map(state.nodes.map((n) => [n.id, n]));
    const absPos = (node: SchematicNode): { x: number; y: number } => {
      let x = node.position.x;
      let y = node.position.y;
      let pid: string | undefined = node.parentId;
      while (pid) {
        const parent = adapterNodeMap.get(pid);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        pid = parent.parentId;
      }
      return { x, y };
    };

    const srcAbs = absPos(sourceNode);
    const tgtAbs = absPos(targetNode);
    const srcW = sourceNode.measured?.width ?? 144;
    const tgtW = targetNode.measured?.width ?? 144;

    // Midpoint between the right edge of the left device and left edge of the right device
    // (or just center-to-center if they're stacked vertically)
    const srcCenterX = srcAbs.x + srcW / 2;
    const tgtCenterX = tgtAbs.x + tgtW / 2;
    const srcCenterY = srcAbs.y + (sourceNode.measured?.height ?? 48) / 2;
    const tgtCenterY = tgtAbs.y + (targetNode.measured?.height ?? 48) / 2;

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
        ...(template.shortName ? { shortName: template.shortName } : {}),
        ...(template.id ? { templateId: template.id } : {}),
        ...(template.version ? { templateVersion: template.version } : {}),
        ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
        ...(template.modelNumber ? { modelNumber: template.modelNumber } : {}),
        ...(template.referenceUrl ? { referenceUrl: template.referenceUrl } : {}),
        ...(template.category ? { category: template.category } : {}),
        ...(hiddenPorts && hiddenPorts.length > 0 ? { hiddenPorts } : {}),
      },
    };

    // Nudge adapter position if it overlaps existing devices
    const MIN_GAP = GRID_SIZE * 5; // 80px — enough for stubs + routing
    const adapterW = 144; // approximate width before measurement
    const adapterH = 48;
    let posX = adapterNode.position.x;
    const posY = adapterNode.position.y;
    for (const other of state.nodes) {
      if (other.type !== "device") continue;
      if (other.parentId !== adapterParentId) continue;
      const ow = other.measured?.width ?? 144;
      const oh = other.measured?.height ?? 48;
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

    const existingEdges = ensureUniqueEdgeIds(state.edges);
    const newEdges: ConnectionEdge[] = [];

    if (adapterInput) {
      const inputHandle = adapterInput.direction === "bidirectional" ? `${adapterInput.id}-in` : adapterInput.id;
      const inputData: ConnectionData = {
        signalType: pending.sourcePort.signalType,
        ...(!areConnectorsCompatible(pending.sourcePort.connectorType, adapterInput.connectorType) ? { connectorMismatch: true } : {}),
        ...(adapterInput.directAttach ? { directAttach: true } : {}),
      };
      newEdges.push({
        id: nextEdgeId([...existingEdges, ...newEdges]),
        source: pending.connection.source,
        target: adapterId,
        sourceHandle: pending.connection.sourceHandle,
        targetHandle: inputHandle,
        data: inputData,
        style: {
          stroke: resolveEdgeStroke(inputData),
          strokeWidth: adapterInput.directAttach ? 1 : 2,
        },
      });
    }

    if (adapterOutput) {
      const outputHandle = adapterOutput.direction === "bidirectional" ? `${adapterOutput.id}-out` : adapterOutput.id;
      const outputData: ConnectionData = {
        signalType: pending.targetPort.signalType,
        ...(!areConnectorsCompatible(adapterOutput.connectorType, pending.targetPort.connectorType) ? { connectorMismatch: true } : {}),
        ...(adapterOutput.directAttach ? { directAttach: true } : {}),
      };
      newEdges.push({
        id: nextEdgeId([...existingEdges, ...newEdges]),
        source: adapterId,
        target: pending.connection.target,
        sourceHandle: outputHandle,
        targetHandle: pending.connection.targetHandle,
        data: outputData,
        style: {
          stroke: resolveEdgeStroke(outputData),
          strokeWidth: adapterOutput.directAttach ? 1 : 2,
        },
      });
    }

    const updatedNodes = renumberNodes([...state.nodes, adapterNode]);
    set({
      nodes: existingEdges === state.edges
        ? updatedNodes
        : reconcileWaypointNodes(updatedNodes, [...existingEdges, ...newEdges]),
      edges: [...existingEdges, ...newEdges],
      pendingIncompatibleConnection: null,
    });
    get().saveToLocalStorage();
  },

  setPrintView: (v) => { set({ printView: v }); },
  setPrintPaperId: (id) => { set({ printPaperId: id }); get().saveToLocalStorage(); },
  setPrintOrientation: (o) => { set({ printOrientation: o }); get().saveToLocalStorage(); },
  setPrintScale: (s) => { set({ printScale: Math.max(0.25, Math.min(2, s)) }); get().saveToLocalStorage(); },
  setPrintCustomWidthIn: (w) => { set({ printCustomWidthIn: Math.max(1, w) }); get().saveToLocalStorage(); },
  setPrintCustomHeightIn: (h) => { set({ printCustomHeightIn: Math.max(1, h) }); get().saveToLocalStorage(); },
  setPrintOriginOffset: (x, y) => { set({ printOriginOffsetX: x, printOriginOffsetY: y }); get().saveToLocalStorage(); },
  setColorKeyEnabled: (v) => { set({ colorKeyEnabled: v }); get().saveToLocalStorage(); },
  setColorKeyCorner: (c) => { set({ colorKeyCorner: c }); get().saveToLocalStorage(); },
  setColorKeyColumns: (n) => { set({ colorKeyColumns: Math.max(1, Math.min(4, n)) }); get().saveToLocalStorage(); },
  setColorKeyPage: (p) => { set({ colorKeyPage: p }); get().saveToLocalStorage(); },
  setColorKeyOverrides: (o) => { set({ colorKeyOverrides: o && Object.keys(o).length > 0 ? o : undefined }); get().saveToLocalStorage(); },
  setCableCost: (key, cost) => {
    const current = { ...get().cableCosts };
    if (cost == null || cost <= 0) { delete current[key]; } else { current[key] = cost; }
    set({ cableCosts: Object.keys(current).length > 0 ? current : undefined });
    get().saveToLocalStorage();
  },
  setRoomDistance: (roomIdA, roomIdB, distance) => {
    if (roomIdA === roomIdB) return;
    const current = { ...(get().roomDistances ?? {}) };
    const key = pairKey(roomIdA, roomIdB);
    if (distance == null || !Number.isFinite(distance) || distance <= 0) {
      delete current[key];
    } else {
      current[key] = distance;
    }
    set({ roomDistances: Object.keys(current).length > 0 ? current : undefined });
    get().saveToLocalStorage();
  },
  clearRoomDistance: (roomIdA, roomIdB) => {
    get().setRoomDistance(roomIdA, roomIdB, undefined);
  },
  setDistanceSettings: (partial) => {
    const merged: DistanceSettings = {
      ...DEFAULT_DISTANCE_SETTINGS,
      ...(get().distanceSettings ?? {}),
      ...partial,
    };
    // Clamp slack values so UI-typed garbage never propagates.
    if (!Number.isFinite(merged.slackPercent) || merged.slackPercent < 0) merged.slackPercent = 0;
    if (!Number.isFinite(merged.slackFixed) || merged.slackFixed < 0) merged.slackFixed = 0;
    set({ distanceSettings: merged });
    get().saveToLocalStorage();
  },
  setTitleBlock: (tb) => { set({ titleBlock: tb }); get().saveToLocalStorage(); },
  setTitleBlockLayout: (layout) => { set({ titleBlockLayout: layout }); get().saveToLocalStorage(); },

  setSignalColors: (colors) => {
    const overrides = getSignalColorOverrides(colors);
    set({ signalColors: overrides });
    applySignalColors(colors);
    saveSignalColors(colors);
    get().saveToLocalStorage();
  },

  setSignalLineStyles: (styles) => {
    // Only store non-solid entries
    const clean: Partial<Record<SignalType, LineStyle>> = {};
    for (const [k, v] of Object.entries(styles)) {
      if (v && v !== "solid") clean[k as SignalType] = v;
    }
    set({ signalLineStyles: Object.keys(clean).length > 0 ? clean : undefined });
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

  togglePinSignalTypeVisibility: (type) => {
    const current = get().hiddenPinSignalTypes;
    const set_ = new Set(current ? current.split(",").filter(Boolean) : []);
    if (set_.has(type)) set_.delete(type);
    else set_.add(type);
    const next = [...set_].sort().join(",");
    set({ hiddenPinSignalTypes: next });
    get().saveToLocalStorage();
  },

  setHideUnconnectedPorts: (hide) => {
    set({ hideUnconnectedPorts: hide });
    get().saveToLocalStorage();
  },

  setShowPortCounts: (show) => {
    set({ showPortCounts: show });
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

  setReportHiddenColumns: (tableId, columnIds) => {
    set({ reportHiddenColumns: { ...get().reportHiddenColumns, [tableId]: columnIds } });
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

  setEdgeHitboxSize: (size) => {
    set({ edgeHitboxSize: size });
    get().saveToLocalStorage();
  },

  showAllSignalTypes: () => {
    set({ hiddenSignalTypes: "", hiddenPinSignalTypes: "" });
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

  setLabelCase: (mode) => {
    set({ labelCase: mode });
    get().saveToLocalStorage();
  },

  setPanMode: (mode) => {
    set({ panMode: mode });
    get().saveToLocalStorage();
  },

  setCurrency: (code) => {
    set({ currency: code });
    get().saveToLocalStorage();
  },

  setProjectStatus: (status) => {
    set({ status });
    get().saveToLocalStorage();
  },

  setShowLineJumps: (show) => {
    set({ showLineJumps: show });
    get().saveToLocalStorage();
  },

  setShowMinimap: (show) => {
    // Persisted to localStorage (editor preference), not the schematic file. (#210)
    try { localStorage.setItem(MINIMAP_PREF_KEY, show ? "1" : "0"); } catch { /* ignore */ }
    set({ showMinimap: show });
  },

  setShowFacePlateDetail: (show) => {
    set({ showFacePlateDetail: show });
    get().saveToLocalStorage();
  },

  setShowConnectionLabels: (show) => {
    set({ showConnectionLabels: show, showCableIdLabels: show });
    get().saveToLocalStorage();
  },

  setShowCableIdLabels: (show) => {
    set({ showCableIdLabels: show, showConnectionLabels: show });
    get().saveToLocalStorage();
  },

  setShowCustomLabels: (show) => {
    set({ showCustomLabels: show });
    get().saveToLocalStorage();
  },

  setCableIdGap: (gap) => {
    set({ cableIdGap: gap });
    get().saveToLocalStorage();
  },

  setCableIdMidOffset: (offset) => {
    set({ cableIdMidOffset: offset });
    get().saveToLocalStorage();
  },

  setCableIdLabelMode: (mode) => {
    set({ cableIdLabelMode: mode });
    get().saveToLocalStorage();
  },

  setStubLabelShowPort: (show) => {
    set({ stubLabelShowPort: show });
    get().saveToLocalStorage();
  },

  setStubLabelShowRoom: (show) => {
    set({ stubLabelShowRoom: show });
    get().saveToLocalStorage();
  },

  setStubLabelPageMode: (mode) => {
    set({ stubLabelPageMode: mode });
    get().saveToLocalStorage();
  },

  setUseShortNames: (use) => {
    set({ useShortNames: use });
    get().saveToLocalStorage();
  },

  setWrapDeviceLabels: (wrap) => {
    set({ wrapDeviceLabels: wrap });
    get().saveToLocalStorage();
  },

  recomputeCableIds: () => {
    const state = get();
    const rows = computeCableSchedule(state.nodes, state.edges, state.cableNamingScheme);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.edgeId] = r.cableId;
    // Mirror cable IDs to the partner stub-leg edge so both halves render the same
    // cable label. The schedule emits one row per logical connection (source-side leg);
    // the target-side leg shares the same cable ID via linkedConnectionId.
    const linkById = new Map<string, string>();
    const idsByLink = new Map<string, string[]>();
    for (const e of state.edges) {
      const link = e.data?.linkedConnectionId;
      if (!link) continue;
      linkById.set(e.id, link);
      const list = idsByLink.get(link) ?? [];
      list.push(e.id);
      idsByLink.set(link, list);
    }
    for (const e of state.edges) {
      if (map[e.id]) continue;
      const link = linkById.get(e.id);
      if (!link) continue;
      const partners = idsByLink.get(link) ?? [];
      for (const pid of partners) {
        if (map[pid]) { map[e.id] = map[pid]; break; }
      }
    }
    // Persist generated IDs onto the edges themselves. Cable IDs are PERMANENT once
    // assigned — users print labels and reference them in pull sheets — so they ride
    // the save file (edge.data.cableId) instead of being re-derived per session.
    // Only edges MISSING an ID are written (stored/user-set IDs are never touched),
    // so this is a no-op on every run after the first and can't loop the App effect
    // that calls it. Not undo-tracked: assignment is derived bookkeeping, not an edit.
    let persisted = false;
    const edges = state.edges.map((e) => {
      const id = map[e.id];
      if (!id || !e.data || e.data.cableId) return e;
      persisted = true;
      return { ...e, data: { ...e.data, cableId: id } };
    });
    if (persisted) {
      set({ cableIdMap: map, edges });
      get().saveToLocalStorage();
    } else {
      set({ cableIdMap: map });
    }
  },

  exportCustomTemplates: () => {
    return structuredClone(get().customTemplates);
  },

  importCustomTemplates: (templates) => {
    const existing = get().customTemplates;
    const existingKeys = new Set(existing.map((t) => templateKey(t)));
    const newTemplates = templates.filter((t) => !existingKeys.has(templateKey(t)));
    if (newTemplates.length > 0) {
      const merged = [...existing, ...newTemplates];
      const order = [...get().customTemplateOrder, ...newTemplates.map((t) => templateKey(t))];
      set({ customTemplates: merged, customTemplateOrder: order });
      saveCustomTemplates(merged);
      saveCustomTemplateMeta({ groups: get().customTemplateGroups, order, groupAssignments: get().customTemplateGroupAssignments });
    }
  },

  setCloudSchematicId: (id) => { set({ cloudSchematicId: id }); get().saveToLocalStorage(); },
  setCloudSavedAt: (ts) => { set({ cloudSavedAt: ts }); get().saveToLocalStorage(); },
  setFileHandle: (handle) => set({ fileHandle: handle }),

  setIsOnline: (online) => set({ isOnline: online }),

  // Toasts
  toasts: [],
  addToast: (message, type, durationMs) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    const duration = durationMs ?? (type === "error" ? 8000 : 5000);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── Rack builder actions ──────────────────────────────────────────

  setActivePage: (pageId) => {
    set({ activePage: pageId });
  },

  addRackPage: (label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextRackPageId();
    const page: RackElevationPage = { id, label, type: "rack-elevation", racks: [], placements: [], accessories: [] };
    set({ pages: [...state.pages, page], activePage: id, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return id;
  },

  removeRackPage: (pageId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const pages = state.pages.filter((p) => p.id !== pageId);
    const activePage = state.activePage === pageId ? "schematic" : state.activePage;
    set({ pages, activePage, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  renameRackPage: (pageId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ pages: state.pages.map((p) => p.id === pageId ? { ...p, label } : p), undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  addRack: (pageId, rackData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextRackId();
    const rack: RackData = { ...rackData, id };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, racks: [...p.racks, rack] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  removeRack: (pageId, rackId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    // Find the rack's linked room before removing, so we can clear the backpointer
    const srcPage = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    const linkedRoomId = srcPage?.racks.find((r) => r.id === rackId)?.linkedRoomId;
    const updatedPages = mapElevationPage(state.pages, pageId, (p) => ({
      ...p,
      racks: p.racks.filter((r) => r.id !== rackId),
      placements: p.placements.filter((pl) => pl.rackId !== rackId),
      accessories: p.accessories.filter((a) => a.rackId !== rackId),
    }));
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    // Clear the backpointer on the linked room node
    if (linkedRoomId) {
      set({
        nodes: get().nodes.map((n) =>
          n.id === linkedRoomId && n.type === "room"
            ? { ...n, data: { ...n.data, linkedRackPageId: undefined, linkedRackId: undefined } }
            : n
        ),
      });
    }
    get().saveToLocalStorage();
  },

  updateRack: (pageId, rackId, patch) => {
    const state = get();
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        racks: p.racks.map((r) => r.id === rackId ? { ...r, ...patch } : r),
      })),
    });
    get().saveToLocalStorage();
  },

  addRackPlacement: (pageId, placementData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPlacementId();
    const placement: RackDevicePlacement = { ...placementData, id };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  addPlacementSmart: (pageId, rackId, deviceNodeId, uPosition, face, preferredHalfRackSide) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!page) return { ok: false, reason: "no-page" };
    const rack = page.racks.find((r) => r.id === rackId);
    if (!rack) return { ok: false, reason: "no-page" };
    const device = state.nodes.find((n) => n.id === deviceNodeId)?.data as DeviceData | undefined;
    if (!device) return { ok: false, reason: "no-device" };

    const form = inferRackForm(device);

    if (form === "oversize") {
      return { ok: false, reason: "oversize" };
    }

    if (form === "shelf-only") {
      // Atomic shelf + placement: one undo entry covers both.
      pushUndo({ nodes: state.nodes, edges: state.edges });
      const shelfId = nextAccessoryId();
      const placementId = nextPlacementId();
      const innerWMm = shelfInnerWidthMm();
      const shelf: RackAccessory = {
        id: shelfId,
        rackId,
        type: "shelf",
        uPosition,
        heightU: 1,
        face,
      };
      const newW = device.widthMm ?? innerWMm;
      // Center on the shelf when there's room; otherwise pin to the left rail.
      const centeredX = Math.max(0, (innerWMm - newW) / 2);
      const placement: RackDevicePlacement = {
        id: placementId,
        rackId,
        deviceNodeId,
        uPosition,
        face,
        mountedOnShelfId: shelfId,
        shelfOffsetMm: { x: centeredX, y: 0 },
      };
      set({
        pages: mapElevationPage(state.pages, pageId, (p) => ({
          ...p,
          accessories: [...p.accessories, shelf],
          placements: [...p.placements, placement],
        })),
        undoSize: undoStack.length, redoSize: 0,
      });
      get().saveToLocalStorage();
      return { ok: true, placementId, shelfId };
    }

    if (form === "half") {
      // Honor cursor-side preference when free; otherwise flip to the other side.
      // Falls back to "left first" if no preference was supplied (legacy callers).
      const sideTaken = (side: "left" | "right") => page.placements.some((p) =>
        p.rackId === rackId && p.face === face && !p.mountedOnShelfId
        && p.halfRackSide === side
        && p.uPosition === uPosition
      );
      const preferred: "left" | "right" = preferredHalfRackSide ?? "left";
      const other: "left" | "right" = preferred === "left" ? "right" : "left";
      const halfRackSide: "left" | "right" = sideTaken(preferred) ? other : preferred;
      pushUndo({ nodes: state.nodes, edges: state.edges });
      const id = nextPlacementId();
      const placement: RackDevicePlacement = { id, rackId, deviceNodeId, uPosition, face, halfRackSide };
      set({
        pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
        undoSize: undoStack.length, redoSize: 0,
      });
      get().saveToLocalStorage();
      return { ok: true, placementId: id };
    }

    // full / unknown — direct placement, current behavior
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPlacementId();
    const placement: RackDevicePlacement = { id, rackId, deviceNodeId, uPosition, face };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return { ok: true, placementId: id };
  },

  removeRackPlacement: (pageId, placementId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: p.placements.filter((pl) => pl.id !== placementId) })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  updateRackPlacement: (pageId, placementId, patch) => {
    const state = get();
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        placements: p.placements.map((pl) => pl.id === placementId ? { ...pl, ...patch } : pl),
      })),
    });
    get().saveToLocalStorage();
  },

  addRackAccessory: (pageId, accessoryData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextAccessoryId();
    const accessory: RackAccessory = { ...accessoryData, id };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, accessories: [...p.accessories, accessory] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  removeRackAccessory: (pageId, accessoryId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, accessories: p.accessories.filter((a) => a.id !== accessoryId) })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  updateRackAccessory: (pageId, accessoryId, patch) => {
    const state = get();
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        accessories: p.accessories.map((a) => a.id === accessoryId ? { ...a, ...patch } : a),
      })),
    });
    get().saveToLocalStorage();
  },

  removeRackAccessoryWithOccupants: (pageId, accessoryId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({
        ...p,
        accessories: p.accessories.filter((a) => a.id !== accessoryId),
        // Drop occupant placements — devices remain in the schematic, return to unracked pool
        placements: p.placements.filter((pl) => pl.mountedOnShelfId !== accessoryId),
      })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
  },

  addShelfMountedDevice: (pageId, shelfId, deviceNodeId) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!page) return null;
    const shelf = page.accessories.find((a) => a.id === shelfId);
    if (!shelf || shelf.type !== "shelf") return null;
    const newDevice = state.nodes.find((n) => n.id === deviceNodeId)?.data as DeviceData | undefined;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPlacementId();

    // Auto-place: walk row by row from y=0 upward. On each row, push past occupants
    // whose y range intersects [rowY, rowY + newH]. If the device fits horizontally
    // there, drop it. Otherwise hop above the tallest occupant on that row and retry.
    // Lets users keep stacking small devices when the bottom row is full.
    const innerWidthMm = shelfInnerWidthMm();
    const newW = newDevice?.widthMm ?? innerWidthMm;
    const newH = newDevice?.heightMm ?? 44.45;
    const GAP = 4;
    const MAX_ROWS = 8;
    const occupants = page.placements.filter((pl) => pl.mountedOnShelfId === shelfId);
    let rowY = 0;
    let nextX = 0;
    for (let attempt = 0; attempt < MAX_ROWS; attempt++) {
      let attemptX = 0;
      let rowCeiling = rowY;
      for (const occ of occupants) {
        const dd = state.nodes.find((n) => n.id === occ.deviceNodeId)?.data as DeviceData | undefined;
        if (!dd) continue;
        const { wMm: ow, hMm: oh } = shelfFootprintMm(occ, dd);
        const ox = occ.shelfOffsetMm?.x ?? 0;
        const oy = occ.shelfOffsetMm?.y ?? 0;
        if (oy < rowY + newH && oy + oh > rowY) {
          attemptX = Math.max(attemptX, ox + ow + GAP);
          rowCeiling = Math.max(rowCeiling, oy + oh);
        }
      }
      if (attemptX + newW <= innerWidthMm + 0.5) {
        nextX = attemptX;
        break;
      }
      // Row full — hop above the tallest occupant and try again.
      rowY = rowCeiling + GAP;
    }
    const offset = { x: nextX, y: rowY };

    const placement: RackDevicePlacement = {
      id,
      rackId: shelf.rackId,
      deviceNodeId,
      uPosition: shelf.uPosition,
      face: shelf.face,
      mountedOnShelfId: shelfId,
      shelfOffsetMm: offset,
    };
    set({
      pages: mapElevationPage(state.pages, pageId, (p) => ({ ...p, placements: [...p.placements, placement] })),
      undoSize: undoStack.length, redoSize: 0,
    });
    get().saveToLocalStorage();
    return id;
  },

  isRackSlotAvailable: (pageId, rackId, uPosition, heightU, face, halfRackSide, excludePlacementId, excludeAccessoryId) => {
    const state = get();
    const page = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!page) return false;
    const rack = page.racks.find((r) => r.id === rackId);
    if (!rack) return false;

    // Check bounds
    if (uPosition < 1 || uPosition + heightU - 1 > rack.heightU) return false;

    // Check against existing placements on this rack and face
    for (const p of page.placements) {
      if (p.rackId !== rackId || p.face !== face) continue;
      if (excludePlacementId && p.id === excludePlacementId) continue;
      // Shelf-mounted devices are passengers — the shelf already claims its U slots
      if (p.mountedOnShelfId) continue;
      const device = state.nodes.find((n) => n.id === p.deviceNodeId);
      const deviceData = device?.data as DeviceData | undefined;
      const deviceHeightU = deviceData ? inferRackHeightU(deviceData) : 1;
      const pTop = p.uPosition + deviceHeightU - 1;
      const newTop = uPosition + heightU - 1;
      // Check U range overlap
      if (p.uPosition <= newTop && uPosition <= pTop) {
        // Ranges overlap — check width compatibility
        if (!p.halfRackSide || !halfRackSide) return false; // either is full-width → blocked
        if (p.halfRackSide === halfRackSide) return false;  // same side → blocked
        // Different sides of half-rack → OK
      }
    }

    // Check against accessories
    for (const a of page.accessories) {
      if (a.rackId !== rackId || a.face !== face) continue;
      if (excludeAccessoryId && a.id === excludeAccessoryId) continue;
      const aTop = a.uPosition + a.heightU - 1;
      const newTop = uPosition + heightU - 1;
      if (a.uPosition <= newTop && uPosition <= aTop) return false;
    }

    return true;
  },

  linkRoomToRack: (roomId, pageId, rackId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    // Find the room's current link so we can clear the old rack's backpointer
    const roomNode = state.nodes.find((n) => n.id === roomId && n.type === "room");
    const prevRackPageId = (roomNode?.data as { linkedRackPageId?: string }).linkedRackPageId;
    const prevRackId = (roomNode?.data as { linkedRackId?: string }).linkedRackId;
    // Find the target rack's current linked room so we can clear that room's link
    const targetPage = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    const targetRack = targetPage?.racks.find((r) => r.id === rackId);
    const prevLinkedRoomId = targetRack?.linkedRoomId;

    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.type !== "rack-elevation") return p;
      if (p.id === pageId) {
        return { ...p, racks: p.racks.map((r) => r.id === rackId ? { ...r, linkedRoomId: roomId } : r) };
      }
      if (p.id === prevRackPageId) {
        return { ...p, racks: p.racks.map((r) => r.id === prevRackId ? { ...r, linkedRoomId: undefined } : r) };
      }
      return p;
    });

    const updatedNodes = state.nodes.map((n): SchematicNode => {
      // Set link on the target room
      if (n.id === roomId) return { ...n, data: { ...n.data, linkedRackPageId: pageId, linkedRackId: rackId } } as SchematicNode;
      // Clear link on the room that was previously linked to the target rack
      if (prevLinkedRoomId && n.id === prevLinkedRoomId) {
        return { ...n, data: { ...n.data, linkedRackPageId: undefined, linkedRackId: undefined } } as SchematicNode;
      }
      return n;
    });

    set({ pages: updatedPages, nodes: updatedNodes, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  unlinkRoom: (roomId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const roomNode = state.nodes.find((n) => n.id === roomId && n.type === "room");
    const prevRackPageId = (roomNode?.data as { linkedRackPageId?: string }).linkedRackPageId;
    const prevRackId = (roomNode?.data as { linkedRackId?: string }).linkedRackId;

    const updatedPages = prevRackPageId
      ? mapElevationPage(state.pages, prevRackPageId, (p) => ({
          ...p,
          racks: p.racks.map((r) => r.id === prevRackId ? { ...r, linkedRoomId: undefined } : r),
        }))
      : state.pages;

    const updatedNodes = state.nodes.map((n): SchematicNode =>
      n.id === roomId ? { ...n, data: { ...n.data, linkedRackPageId: undefined, linkedRackId: undefined } } as SchematicNode : n
    );

    set({ pages: updatedPages, nodes: updatedNodes, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  addPrintSheetPage: (label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextPrintSheetId();
    const pageLabel = label ?? `Sheet ${state.pages.filter((p) => p.type === "print-sheet").length + 1}`;
    const page: PrintSheetPage = {
      id,
      label: pageLabel,
      type: "print-sheet",
      paperId: state.printPaperId ?? "letter",
      orientation: state.printOrientation ?? "landscape",
      viewports: [],
      showTitleBlock: true,
    };

    // H9: auto-fill with first rack if any exist
    const firstElevPage = state.pages.find((p): p is RackElevationPage => p.type === "rack-elevation" && p.racks.length > 0);
    if (firstElevPage) {
      const firstRack = firstElevPage.racks[0];
      const proposals = autoFillSheetForRack(page, firstRack, firstElevPage);
      for (const vp of proposals) {
        page.viewports.push({ ...vp, id: nextViewportId() });
      }
    }

    set({ pages: [...state.pages, page], activePage: id, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return id;
  },

  removePrintSheetPage: (pageId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const pages = state.pages.filter((p) => p.id !== pageId);
    const activePage = state.activePage === pageId ? "schematic" : state.activePage;
    set({ pages, activePage, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  renamePrintSheetPage: (pageId, label) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ pages: state.pages.map((p) => p.id === pageId ? { ...p, label } : p), undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  duplicateRackPage: (pageId) => {
    const state = get();
    const src = state.pages.find((p) => p.id === pageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!src) return "";
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newPageId = nextRackPageId();
    // Remap rack IDs so placements + accessories reference the new copies
    const rackIdMap = new Map<string, string>();
    const newRacks: RackData[] = src.racks.map((r) => {
      const nid = nextRackId();
      rackIdMap.set(r.id, nid);
      // Don't copy room link — it's 1:1 and the original still owns it
      const { linkedRoomId: _dropped, ...rest } = r;
      return { ...rest, id: nid };
    });
    // Remap accessory IDs first so shelf-mounted placements can re-point at the copied shelf.
    const accessoryIdMap = new Map<string, string>();
    const newAccessories = src.accessories.map((a) => {
      const nid = nextAccessoryId();
      accessoryIdMap.set(a.id, nid);
      return {
        ...a,
        id: nid,
        rackId: rackIdMap.get(a.rackId) ?? a.rackId,
      };
    });
    const newPlacements = src.placements.map((pl) => ({
      ...pl,
      id: nextPlacementId(),
      rackId: rackIdMap.get(pl.rackId) ?? pl.rackId,
      // Re-point shelf-mounted devices at the COPIED shelf; otherwise they'd reference the
      // source page's shelf id and the renderers would drop them from the duplicated rack.
      mountedOnShelfId: pl.mountedOnShelfId ? accessoryIdMap.get(pl.mountedOnShelfId) ?? pl.mountedOnShelfId : pl.mountedOnShelfId,
    }));
    const newPage: RackElevationPage = {
      id: newPageId,
      label: `${src.label} (copy)`,
      type: "rack-elevation",
      racks: newRacks,
      placements: newPlacements,
      accessories: newAccessories,
    };
    // Insert immediately after the source
    const idx = state.pages.findIndex((p) => p.id === pageId);
    const pages = [...state.pages.slice(0, idx + 1), newPage, ...state.pages.slice(idx + 1)];
    set({ pages, activePage: newPageId, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return newPageId;
  },

  duplicatePrintSheetPage: (pageId) => {
    const state = get();
    const src = state.pages.find((p) => p.id === pageId && p.type === "print-sheet") as PrintSheetPage | undefined;
    if (!src) return "";
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newPageId = nextPrintSheetId();
    const newPage: PrintSheetPage = {
      ...src,
      id: newPageId,
      label: `${src.label} (copy)`,
      viewports: src.viewports.map((vp) => ({ ...vp, id: nextViewportId() })),
    };
    const idx = state.pages.findIndex((p) => p.id === pageId);
    const pages = [...state.pages.slice(0, idx + 1), newPage, ...state.pages.slice(idx + 1)];
    set({ pages, activePage: newPageId, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return newPageId;
  },

  addViewport: (pageId, viewportData) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = nextViewportId();
    const viewport: PrintViewport = { showStats: true, ...viewportData, id };
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, viewports: [...p.viewports, viewport] };
    });
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
    return id;
  },

  updateViewport: (pageId, viewportId, patch) => {
    const state = get();
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, viewports: p.viewports.map((v) => v.id === viewportId ? { ...v, ...patch } : v) };
    });
    set({ pages: updatedPages });
    get().saveToLocalStorage();
  },

  removeViewport: (pageId, viewportId) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, viewports: p.viewports.filter((v) => v.id !== viewportId) };
    });
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  setPrintSheetPaper: (pageId, paperId, orientation, customWidthIn, customHeightIn) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.id !== pageId || p.type !== "print-sheet") return p;
      return { ...p, paperId, orientation, customWidthIn, customHeightIn };
    });
    set({ pages: updatedPages, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  moveRackToPage: (srcPageId, rackId, dstPageId) => {
    const state = get();
    const srcPage = state.pages.find((p) => p.id === srcPageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    const dstPage = state.pages.find((p) => p.id === dstPageId && p.type === "rack-elevation") as RackElevationPage | undefined;
    if (!srcPage || !dstPage) return;
    const rack = srcPage.racks.find((r) => r.id === rackId);
    if (!rack) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const rackPlacements = srcPage.placements.filter((p) => p.rackId === rackId);
    const rackAccessories = srcPage.accessories.filter((a) => a.rackId === rackId);

    const updatedPages = state.pages.map((p): SchematicPage => {
      if (p.type === "print-sheet") {
        // Rewrite viewport refs that point to the moved rack
        return {
          ...p,
          viewports: p.viewports.map((v) =>
            v.rackRefPageId === srcPageId && v.rackRefId === rackId
              ? { ...v, rackRefPageId: dstPageId }
              : v
          ),
        };
      }
      if (p.id === srcPageId) {
        return {
          ...p,
          racks: p.racks.filter((r) => r.id !== rackId),
          placements: p.placements.filter((pl) => pl.rackId !== rackId),
          accessories: p.accessories.filter((a) => a.rackId !== rackId),
        };
      }
      if (p.id === dstPageId) {
        return {
          ...p,
          racks: [...p.racks, rack],
          placements: [...p.placements, ...rackPlacements],
          accessories: [...p.accessories, ...rackAccessories],
        };
      }
      return p;
    });

    // Update the linked room's linkedRackPageId to point to the new page
    const updatedNodes = rack.linkedRoomId
      ? state.nodes.map((n): SchematicNode =>
          n.id === rack.linkedRoomId
            ? { ...n, data: { ...n.data, linkedRackPageId: dstPageId } } as SchematicNode
            : n
        )
      : state.nodes;

    set({ pages: updatedPages, nodes: updatedNodes, undoSize: undoStack.length, redoSize: 0 });
    get().saveToLocalStorage();
  },

  saveToLocalStorage: () => {
    if (!hydrated) return;
    const state = get();
    const data: SchematicFile = {
      version: CURRENT_SCHEMA_VERSION,
      name: state.schematicName,
      nodes: state.nodes,
      edges: state.edges.map(({ zIndex: _, selected: _s, ...rest }) => rest) as ConnectionEdge[],
      ownedGear: state.ownedGear.length > 0 ? state.ownedGear : undefined,
      signalColors: state.signalColors,
      signalLineStyles: state.signalLineStyles,
      printPaperId: state.printPaperId,
      printOrientation: state.printOrientation,
      printScale: state.printScale,
      printCustomWidthIn: state.printPaperId === "custom" ? state.printCustomWidthIn : undefined,
      printCustomHeightIn: state.printPaperId === "custom" ? state.printCustomHeightIn : undefined,
      printOriginOffsetX: state.printOriginOffsetX || undefined,
      printOriginOffsetY: state.printOriginOffsetY || undefined,
      titleBlock: state.titleBlock,
      titleBlockLayout: state.titleBlockLayout,
      hiddenSignalTypes: state.hiddenSignalTypes ? state.hiddenSignalTypes.split(",") as SignalType[] : undefined,
      hiddenPinSignalTypes: state.hiddenPinSignalTypes ? state.hiddenPinSignalTypes.split(",") as SignalType[] : undefined,
      hideUnconnectedPorts: state.hideUnconnectedPorts || undefined,
      showPortCounts: state.showPortCounts || undefined,
      templateHiddenSignals: Object.keys(state.templateHiddenSignals).length > 0 ? state.templateHiddenSignals : undefined,
      templatePresets: Object.keys(state.templatePresets).length > 0 ? state.templatePresets : undefined,
      favoriteTemplates: state.favoriteTemplates.length > 0 ? state.favoriteTemplates : undefined,
      reportLayouts: Object.keys(state.reportLayouts).length > 0 ? state.reportLayouts : undefined,
      reportHiddenColumns: Object.keys(state.reportHiddenColumns).length > 0 ? state.reportHiddenColumns : undefined,
      globalReportHeaderLayout: state.globalReportHeaderLayout ?? undefined,
      globalReportFooterLayout: state.globalReportFooterLayout ?? undefined,
      scrollConfig: isDefaultScrollConfig(state.scrollConfig) ? undefined : state.scrollConfig,
      cableNamingScheme: state.cableNamingScheme !== "type-prefix" ? state.cableNamingScheme : undefined,
      labelCase: state.labelCase !== "as-typed" ? state.labelCase : undefined,
      currency: state.currency !== "USD" ? state.currency : undefined,
      status: state.status,
      panMode: state.panMode !== "select-first" ? state.panMode : undefined,
      showLineJumps: !state.showLineJumps ? false : undefined,
      showFacePlateDetail: state.showFacePlateDetail ? true : undefined,
      showCableIdLabels: !state.showCableIdLabels ? false : undefined,
      showCustomLabels: !state.showCustomLabels ? false : undefined,
      cableIdGap: state.cableIdGap !== 4 ? state.cableIdGap : undefined,
      cableIdMidOffset: state.cableIdMidOffset !== 0 ? state.cableIdMidOffset : undefined,
      cableIdLabelMode: state.cableIdLabelMode !== "endpoint" ? state.cableIdLabelMode : undefined,
      stubLabelShowPort: state.stubLabelShowPort !== DEFAULT_STUB_LABEL_SHOW_PORT ? state.stubLabelShowPort : undefined,
      stubLabelShowRoom: state.stubLabelShowRoom !== DEFAULT_STUB_LABEL_SHOW_ROOM ? state.stubLabelShowRoom : undefined,
      stubLabelPageMode: state.stubLabelPageMode !== DEFAULT_STUB_LABEL_PAGE_MODE ? state.stubLabelPageMode : undefined,
      useShortNames: state.useShortNames || undefined,
      wrapDeviceLabels: state.wrapDeviceLabels || undefined,
      hideAdapters: state.hideAdapters || undefined,
      autoRoute: state.autoRoute === false ? false : undefined,
      edgeHitboxSize: state.edgeHitboxSize !== 10 ? state.edgeHitboxSize : undefined,
      categoryOrder: state.categoryOrder ?? undefined,
      showOwnedGearPane: state.showOwnedGearPane || undefined,
      libraryActiveTab: state.libraryActiveTab !== "devices" ? state.libraryActiveTab : undefined,
      colorKeyEnabled: state.colorKeyEnabled || undefined,
      colorKeyCorner: state.colorKeyCorner !== "bottom-left" ? state.colorKeyCorner : undefined,
      colorKeyColumns: state.colorKeyColumns !== 1 ? state.colorKeyColumns : undefined,
      colorKeyPage: state.colorKeyPage !== "all" ? state.colorKeyPage : undefined,
      colorKeyOverrides: state.colorKeyOverrides && Object.keys(state.colorKeyOverrides).length > 0 ? state.colorKeyOverrides : undefined,
      pages: state.pages.length > 0 ? state.pages : undefined,
      cableCosts: state.cableCosts && Object.keys(state.cableCosts).length > 0 ? state.cableCosts : undefined,
      bundles: Object.keys(state.bundles).length > 0 ? state.bundles : undefined,
      roomDistances: state.roomDistances && Object.keys(state.roomDistances).length > 0 ? state.roomDistances : undefined,
      distanceSettings: state.distanceSettings,
    };
    // Persist cloud identity alongside autosave (not part of SchematicFile export)
    const blob: Record<string, unknown> = { ...data };
    if (state.cloudSchematicId) {
      blob.cloudSchematicId = state.cloudSchematicId;
      blob.cloudSavedAt = state.cloudSavedAt ?? undefined;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
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
          data.edges = ensureUniqueEdgeIds(removeOrphanedEdges(data.nodes, data.edges));
          data.edges = applyWaypointHeal(data.nodes, data.edges);
          // Heal-on-load: spawn break-in/out anchors for any pre-existing bundle (idempotent).
          data.nodes = reconcileBundleJunctions(data.nodes, data.edges);
          const colors = data.signalColors ?? {};
          applySignalColors(colors);
          saveSignalColors({ ...loadSignalColors(), ...colors });
          set({
            nodes: data.nodes,
            edges: data.edges,
            isDemo: true,
            schematicName: data.name ?? "Demo Schematic",
            ownedGear: data.ownedGear ?? [],
            signalColors: data.signalColors,
            signalLineStyles: data.signalLineStyles,
            printPaperId: data.printPaperId ?? "arch-d",
            printOrientation: data.printOrientation ?? "landscape",
            printScale: data.printScale ?? 1.0,
            printCustomWidthIn: data.printCustomWidthIn ?? 24,
            printCustomHeightIn: data.printCustomHeightIn ?? 36,
            printOriginOffsetX: data.printOriginOffsetX ?? 0,
            printOriginOffsetY: data.printOriginOffsetY ?? 0,
            titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
            titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
            hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
            hiddenPinSignalTypes: data.hiddenPinSignalTypes?.length ? [...data.hiddenPinSignalTypes].sort().join(",") : "",
            hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
            showPortCounts: data.showPortCounts ?? false,
            templateHiddenSignals: data.templateHiddenSignals ?? {},
            templatePresets: data.templatePresets ?? {},
            favoriteTemplates: data.favoriteTemplates ?? [],
            reportLayouts: data.reportLayouts ?? {},
            reportHiddenColumns: data.reportHiddenColumns ?? {},
            globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
            globalReportFooterLayout: data.globalReportFooterLayout ?? null,
            scrollConfig: resolveScrollConfig(data),
            cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
            labelCase: resolveLabelCase(data.labelCase),
            currency: data.currency ?? "USD",
            status: data.status,
            panMode: (data.panMode === "pan-first" ? "pan-first" : "select-first") as PanMode,
            showLineJumps: data.showLineJumps ?? true,
            showFacePlateDetail: data.showFacePlateDetail ?? false,
            autoRoute: data.autoRoute ?? true,
            edgeHitboxSize: data.edgeHitboxSize ?? 10,
            showCableIdLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
            showConnectionLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
            showCustomLabels: data.showCustomLabels ?? true,
            cableIdGap: data.cableIdGap ?? 4,
            cableIdMidOffset: data.cableIdMidOffset ?? 0,
            cableIdLabelMode: data.cableIdLabelMode ?? "endpoint",
            stubLabelShowPort: data.stubLabelShowPort ?? DEFAULT_STUB_LABEL_SHOW_PORT,
            stubLabelShowRoom: data.stubLabelShowRoom ?? DEFAULT_STUB_LABEL_SHOW_ROOM,
            stubLabelPageMode: data.stubLabelPageMode ?? DEFAULT_STUB_LABEL_PAGE_MODE,
            useShortNames: data.useShortNames ?? false,
            wrapDeviceLabels: data.wrapDeviceLabels ?? false,
            hideAdapters: data.hideAdapters ?? false,
            categoryOrder: data.categoryOrder ?? null,
            showOwnedGearPane: data.showOwnedGearPane ?? false,
            libraryActiveTab: data.showOwnedGearPane ? (data.libraryActiveTab ?? "devices") : "devices",
            colorKeyEnabled: data.colorKeyEnabled ?? false,
            colorKeyCorner: data.colorKeyCorner ?? "bottom-left",
            colorKeyColumns: data.colorKeyColumns ?? 1,
            colorKeyPage: data.colorKeyPage ?? "all",
            colorKeyOverrides: data.colorKeyOverrides ?? undefined,
            pages: data.pages ?? [],
            cableCosts: data.cableCosts ?? undefined,
            bundles: data.bundles ?? {},
            roomDistances: data.roomDistances ?? undefined,
            distanceSettings: data.distanceSettings ?? undefined,
            loadSeq: get().loadSeq + 1,
          });
          if (data.pages?.length) syncRackCounters(data.pages);
          hydrated = true;
          get().saveToLocalStorage();
        });
        return false;
      }
      const parsed = JSON.parse(raw);
      const data = migrateSchematic(parsed) as SchematicFile;
      snapNodesToGrid(data.nodes);
      applyRoomLockState(data.nodes);
      syncCounters(data.nodes, data.edges);
      data.edges = ensureUniqueEdgeIds(removeOrphanedEdges(data.nodes, data.edges));
      data.edges = applyWaypointHeal(data.nodes, data.edges);
      // Heal-on-load: spawn break-in/out anchors for any pre-existing bundle (idempotent).
      data.nodes = reconcileBundleJunctions(data.nodes, data.edges);
      // Always apply colors — if file has none, reset to defaults
      const colors = data.signalColors ?? {};
      applySignalColors(colors);
      saveSignalColors({ ...loadSignalColors(), ...colors });
      set({
        nodes: data.nodes,
        edges: data.edges,
        schematicName: data.name ?? "Untitled Schematic",
        ownedGear: data.ownedGear ?? [],
        signalColors: data.signalColors,
        signalLineStyles: data.signalLineStyles,
        printPaperId: data.printPaperId ?? "arch-d",
        printOrientation: data.printOrientation ?? "landscape",
        printScale: data.printScale ?? 1.0,
        printCustomWidthIn: data.printCustomWidthIn ?? 24,
        printCustomHeightIn: data.printCustomHeightIn ?? 36,
        printOriginOffsetX: data.printOriginOffsetX ?? 0,
        printOriginOffsetY: data.printOriginOffsetY ?? 0,
        titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
        titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
        hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
        hiddenPinSignalTypes: data.hiddenPinSignalTypes?.length ? [...data.hiddenPinSignalTypes].sort().join(",") : "",
        hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
        showPortCounts: data.showPortCounts ?? false,
        templateHiddenSignals: data.templateHiddenSignals ?? {},
        templatePresets: data.templatePresets ?? {},
        favoriteTemplates: data.favoriteTemplates ?? [],
        reportLayouts: data.reportLayouts ?? {},
        reportHiddenColumns: data.reportHiddenColumns ?? {},
        globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
        globalReportFooterLayout: data.globalReportFooterLayout ?? null,
        scrollConfig: resolveScrollConfig(data),
        cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
        labelCase: resolveLabelCase(data.labelCase),
        currency: data.currency ?? "USD",
        status: data.status,
        panMode: (data.panMode === "pan-first" ? "pan-first" : "select-first") as PanMode,
        showLineJumps: data.showLineJumps ?? true,
        showFacePlateDetail: data.showFacePlateDetail ?? false,
        showCableIdLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
        showConnectionLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
        showCustomLabels: data.showCustomLabels ?? true,
        cableIdGap: data.cableIdGap ?? 4,
        cableIdMidOffset: data.cableIdMidOffset ?? 0,
        cableIdLabelMode: data.cableIdLabelMode ?? "endpoint",
        stubLabelShowPort: data.stubLabelShowPort ?? DEFAULT_STUB_LABEL_SHOW_PORT,
        stubLabelShowRoom: data.stubLabelShowRoom ?? DEFAULT_STUB_LABEL_SHOW_ROOM,
        stubLabelPageMode: data.stubLabelPageMode ?? DEFAULT_STUB_LABEL_PAGE_MODE,
        useShortNames: data.useShortNames ?? false,
        wrapDeviceLabels: data.wrapDeviceLabels ?? false,
        hideAdapters: data.hideAdapters ?? false,
        autoRoute: data.autoRoute ?? true,
        edgeHitboxSize: data.edgeHitboxSize ?? 10,
        categoryOrder: data.categoryOrder ?? null,
        showOwnedGearPane: data.showOwnedGearPane ?? false,
        libraryActiveTab: data.showOwnedGearPane ? (data.libraryActiveTab ?? "devices") : "devices",
        colorKeyEnabled: data.colorKeyEnabled ?? false,
        colorKeyCorner: data.colorKeyCorner ?? "bottom-left",
        colorKeyColumns: data.colorKeyColumns ?? 1,
        colorKeyPage: data.colorKeyPage ?? "all",
        colorKeyOverrides: data.colorKeyOverrides ?? undefined,
        pages: data.pages ?? [],
        cableCosts: data.cableCosts ?? undefined,
        bundles: data.bundles ?? {},
        roomDistances: data.roomDistances ?? undefined,
        distanceSettings: data.distanceSettings ?? undefined,
        // Restore cloud identity from autosave (not part of SchematicFile)
        cloudSchematicId: parsed.cloudSchematicId ?? null,
        cloudSavedAt: parsed.cloudSavedAt ?? null,
        loadSeq: get().loadSeq + 1,
      });
      if (data.pages?.length) syncRackCounters(data.pages);
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
      edges: state.edges.map(({ zIndex: _, selected: _s, ...rest }) => rest) as ConnectionEdge[],
      customTemplates: state.customTemplates.length > 0 ? state.customTemplates : undefined,
      ownedGear: state.ownedGear.length > 0 ? state.ownedGear : undefined,
      signalColors: state.signalColors,
      signalLineStyles: state.signalLineStyles,
      printPaperId: state.printPaperId,
      printOrientation: state.printOrientation,
      printScale: state.printScale,
      printCustomWidthIn: state.printPaperId === "custom" ? state.printCustomWidthIn : undefined,
      printCustomHeightIn: state.printPaperId === "custom" ? state.printCustomHeightIn : undefined,
      printOriginOffsetX: state.printOriginOffsetX || undefined,
      printOriginOffsetY: state.printOriginOffsetY || undefined,
      titleBlock: state.titleBlock,
      titleBlockLayout: state.titleBlockLayout,
      hiddenSignalTypes: state.hiddenSignalTypes ? state.hiddenSignalTypes.split(",") as SignalType[] : undefined,
      hiddenPinSignalTypes: state.hiddenPinSignalTypes ? state.hiddenPinSignalTypes.split(",") as SignalType[] : undefined,
      hideUnconnectedPorts: state.hideUnconnectedPorts || undefined,
      showPortCounts: state.showPortCounts || undefined,
      templateHiddenSignals: Object.keys(state.templateHiddenSignals).length > 0 ? state.templateHiddenSignals : undefined,
      templatePresets: Object.keys(state.templatePresets).length > 0 ? state.templatePresets : undefined,
      favoriteTemplates: state.favoriteTemplates.length > 0 ? state.favoriteTemplates : undefined,
      reportLayouts: Object.keys(state.reportLayouts).length > 0 ? state.reportLayouts : undefined,
      reportHiddenColumns: Object.keys(state.reportHiddenColumns).length > 0 ? state.reportHiddenColumns : undefined,
      globalReportHeaderLayout: state.globalReportHeaderLayout ?? undefined,
      globalReportFooterLayout: state.globalReportFooterLayout ?? undefined,
      scrollConfig: isDefaultScrollConfig(state.scrollConfig) ? undefined : state.scrollConfig,
      cableNamingScheme: state.cableNamingScheme !== "type-prefix" ? state.cableNamingScheme : undefined,
      labelCase: state.labelCase !== "as-typed" ? state.labelCase : undefined,
      currency: state.currency !== "USD" ? state.currency : undefined,
      status: state.status,
      panMode: state.panMode !== "select-first" ? state.panMode : undefined,
      showLineJumps: !state.showLineJumps ? false : undefined,
      showFacePlateDetail: state.showFacePlateDetail ? true : undefined,
      showCableIdLabels: !state.showCableIdLabels ? false : undefined,
      showCustomLabels: !state.showCustomLabels ? false : undefined,
      cableIdGap: state.cableIdGap !== 4 ? state.cableIdGap : undefined,
      cableIdMidOffset: state.cableIdMidOffset !== 0 ? state.cableIdMidOffset : undefined,
      cableIdLabelMode: state.cableIdLabelMode !== "endpoint" ? state.cableIdLabelMode : undefined,
      stubLabelShowPort: state.stubLabelShowPort !== DEFAULT_STUB_LABEL_SHOW_PORT ? state.stubLabelShowPort : undefined,
      stubLabelShowRoom: state.stubLabelShowRoom !== DEFAULT_STUB_LABEL_SHOW_ROOM ? state.stubLabelShowRoom : undefined,
      stubLabelPageMode: state.stubLabelPageMode !== DEFAULT_STUB_LABEL_PAGE_MODE ? state.stubLabelPageMode : undefined,
      useShortNames: state.useShortNames || undefined,
      wrapDeviceLabels: state.wrapDeviceLabels || undefined,
      hideAdapters: state.hideAdapters || undefined,
      autoRoute: state.autoRoute === false ? false : undefined,
      edgeHitboxSize: state.edgeHitboxSize !== 10 ? state.edgeHitboxSize : undefined,
      categoryOrder: state.categoryOrder ?? undefined,
      showOwnedGearPane: state.showOwnedGearPane || undefined,
      libraryActiveTab: state.libraryActiveTab !== "devices" ? state.libraryActiveTab : undefined,
      colorKeyEnabled: state.colorKeyEnabled || undefined,
      colorKeyCorner: state.colorKeyCorner !== "bottom-left" ? state.colorKeyCorner : undefined,
      colorKeyColumns: state.colorKeyColumns !== 1 ? state.colorKeyColumns : undefined,
      colorKeyPage: state.colorKeyPage !== "all" ? state.colorKeyPage : undefined,
      colorKeyOverrides: state.colorKeyOverrides && Object.keys(state.colorKeyOverrides).length > 0 ? state.colorKeyOverrides : undefined,
      pages: state.pages.length > 0 ? state.pages : undefined,
      cableCosts: state.cableCosts && Object.keys(state.cableCosts).length > 0 ? state.cableCosts : undefined,
      bundles: Object.keys(state.bundles).length > 0 ? state.bundles : undefined,
      roomDistances: state.roomDistances && Object.keys(state.roomDistances).length > 0 ? state.roomDistances : undefined,
      distanceSettings: state.distanceSettings,
    };
  },

  importFromJSON: (rawData) => {
    rawData = repairMojibake(rawData) as SchematicFile;
    const data = migrateSchematic(rawData) as SchematicFile;
    let nodes = data.nodes ?? [];
    let edges = data.edges ?? [];
    // Sanitize note HTML to prevent XSS from malicious schematic files
    for (const node of nodes) {
      if (node.type === "note" && node.data && "html" in node.data) {
        (node.data as { html: string }).html = sanitizeNoteHtml((node.data as { html: string }).html);
      }
    }
    snapNodesToGrid(nodes);
    applyRoomLockState(nodes);
    syncCounters(nodes, edges);
    edges = ensureUniqueEdgeIds(removeOrphanedEdges(nodes, edges));
    edges = applyWaypointHeal(nodes, edges);
    // Heal-on-load: spawn break-in/out anchors for any imported bundle (idempotent).
    nodes = reconcileBundleJunctions(nodes, edges);
    // Merge imported custom templates with existing ones (avoid duplicates by template key)
    if (data.customTemplates?.length) {
      const existing = get().customTemplates;
      const existingKeys = new Set(existing.map((t) => templateKey(t)));
      const newTemplates = data.customTemplates.filter((t) => !existingKeys.has(templateKey(t)));
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
      ownedGear: data.ownedGear ?? [],
      signalColors: data.signalColors,
      signalLineStyles: data.signalLineStyles,
      printPaperId: data.printPaperId ?? "arch-d",
      printOrientation: data.printOrientation ?? "landscape",
      printScale: data.printScale ?? 1.0,
      printCustomWidthIn: data.printCustomWidthIn ?? 24,
      printCustomHeightIn: data.printCustomHeightIn ?? 36,
      printOriginOffsetX: data.printOriginOffsetX ?? 0,
      printOriginOffsetY: data.printOriginOffsetY ?? 0,
      titleBlock: data.titleBlock ?? { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
      titleBlockLayout: data.titleBlockLayout ?? createDefaultLayout(),
      hiddenSignalTypes: data.hiddenSignalTypes?.length ? [...data.hiddenSignalTypes].sort().join(",") : "",
      hiddenPinSignalTypes: data.hiddenPinSignalTypes?.length ? [...data.hiddenPinSignalTypes].sort().join(",") : "",
      hideUnconnectedPorts: data.hideUnconnectedPorts ?? false,
      showPortCounts: data.showPortCounts ?? false,
      templateHiddenSignals: data.templateHiddenSignals ?? {},
      templatePresets: data.templatePresets ?? {},
      favoriteTemplates: data.favoriteTemplates ?? [],
      reportLayouts: data.reportLayouts ?? {},
      reportHiddenColumns: data.reportHiddenColumns ?? {},
      globalReportHeaderLayout: data.globalReportHeaderLayout ?? null,
      globalReportFooterLayout: data.globalReportFooterLayout ?? null,
      scrollConfig: resolveScrollConfig(data),
      cableNamingScheme: data.cableNamingScheme ?? "type-prefix",
      labelCase: resolveLabelCase(data.labelCase),
      currency: data.currency ?? "USD",
      status: data.status,
      panMode: (data.panMode === "pan-first" ? "pan-first" : "select-first") as PanMode,
      showLineJumps: data.showLineJumps ?? true,
      showFacePlateDetail: data.showFacePlateDetail ?? false,
      showCableIdLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
      showConnectionLabels: data.showCableIdLabels ?? data.showConnectionLabels ?? true,
      showCustomLabels: data.showCustomLabels ?? true,
      cableIdGap: data.cableIdGap ?? 4,
      cableIdMidOffset: data.cableIdMidOffset ?? 0,
      cableIdLabelMode: data.cableIdLabelMode ?? "endpoint",
      stubLabelShowPort: data.stubLabelShowPort ?? DEFAULT_STUB_LABEL_SHOW_PORT,
      stubLabelPageMode: data.stubLabelPageMode ?? DEFAULT_STUB_LABEL_PAGE_MODE,
      useShortNames: data.useShortNames ?? false,
      wrapDeviceLabels: data.wrapDeviceLabels ?? false,
      hideAdapters: data.hideAdapters ?? false,
      autoRoute: data.autoRoute ?? true,
      edgeHitboxSize: data.edgeHitboxSize ?? 10,
      categoryOrder: data.categoryOrder ?? null,
      showOwnedGearPane: data.showOwnedGearPane ?? false,
      libraryActiveTab: data.showOwnedGearPane ? (data.libraryActiveTab ?? "devices") : "devices",
      colorKeyEnabled: data.colorKeyEnabled ?? false,
      colorKeyCorner: data.colorKeyCorner ?? "bottom-left",
      colorKeyColumns: data.colorKeyColumns ?? 1,
      colorKeyPage: data.colorKeyPage ?? "all",
      colorKeyOverrides: data.colorKeyOverrides ?? undefined,
      pages: data.pages ?? [],
      activePage: "schematic",
      cableCosts: data.cableCosts ?? undefined,
      bundles: data.bundles ?? {},
      roomDistances: data.roomDistances ?? undefined,
      distanceSettings: data.distanceSettings ?? undefined,
      // File imports and shared schematics always start as local-only
      cloudSchematicId: null,
      cloudSavedAt: null,
      fileHandle: null,
      loadSeq: get().loadSeq + 1,
    });
    // Post-load side-effects (ID counters + persistence). The schematic is
    // already committed to state above; a failure here must NOT propagate, or a
    // caller's try/catch mislabels a successfully-loaded file as invalid (#176).
    try {
      if (data.pages?.length) syncRackCounters(data.pages);
      saveCategoryOrder(data.categoryOrder ?? null);
      get().saveToLocalStorage();
    } catch (err) {
      console.error("Post-import side-effect failed (schematic still loaded):", err);
    }
  },

  importCsvData: (newNodes, newEdges) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });

    const mergedNodes = [...state.nodes, ...newNodes];
    const mergedEdges = ensureUniqueEdgeIds([...state.edges, ...newEdges]);

    syncCounters(mergedNodes, mergedEdges);
    snapNodesToGrid(mergedNodes);

    set({
      nodes: renumberNodes(mergedNodes),
      edges: mergedEdges,
    });
    get().saveToLocalStorage();
  },

  newSchematic: (templateData?: SchematicFile) => {
    undoStack.length = 0;
    redoStack.length = 0;
    if (templateData) {
      // Load template as a new unsaved file
      get().importFromJSON(templateData);
      set({
        schematicName: "Untitled Schematic",
        isDemo: false,
        cloudSchematicId: null,
        cloudSavedAt: null,
        fileHandle: null,
        undoSize: 0,
        redoSize: 0,
      });
    } else {
      set({
        nodes: [],
        edges: [],
        bundles: {},
        schematicName: "Untitled Schematic",
        isDemo: false,
        ownedGear: [],
        cloudSchematicId: null,
        cloudSavedAt: null,
        fileHandle: null,
        titleBlock: { showName: "", venue: "", designer: "", engineer: "", date: "", drawingTitle: "", company: "", revision: "", logo: "", customFields: [] },
        titleBlockLayout: createDefaultLayout(),
        hiddenSignalTypes: "",
        hiddenPinSignalTypes: "",
        hideUnconnectedPorts: false,
        showPortCounts: false,
        templateHiddenSignals: {},
        templatePresets: {},
        favoriteTemplates: [],
        reportLayouts: {},
        reportHiddenColumns: {},
        globalReportHeaderLayout: null,
        globalReportFooterLayout: null,
        scrollConfig: { ...DEFAULT_SCROLL_CONFIG },
        cableNamingScheme: "type-prefix",
        showLineJumps: true,
        showConnectionLabels: true,
        showCableIdLabels: true,
        showCustomLabels: true,
        cableIdGap: 4,
        cableIdMidOffset: 0,
        cableIdLabelMode: "endpoint" as "endpoint" | "midpoint",
        stubLabelShowPort: DEFAULT_STUB_LABEL_SHOW_PORT,
        stubLabelShowRoom: DEFAULT_STUB_LABEL_SHOW_ROOM,
        stubLabelPageMode: DEFAULT_STUB_LABEL_PAGE_MODE,
        useShortNames: false,
        wrapDeviceLabels: true,
        autoRoute: true,
        edgeHitboxSize: 10,
        panMode: DEFAULT_PAN_MODE,
        showOwnedGearPane: false,
        libraryActiveTab: "devices" as "devices" | "owned",
        undoSize: 0,
        redoSize: 0,
        pages: [],
        activePage: "schematic",
        loadSeq: get().loadSeq + 1,
      });
    }
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
        const strokeAffectingKeys = ["color", "directAttach", "signalType"] as const;
        const strokeAffected = strokeAffectingKeys.some((k) => k in patch);
        if (strokeAffected) {
          const strokeWidth = merged.directAttach ? 1 : 2;
          return {
            ...e,
            data: merged,
            style: { ...e.style, stroke: resolveEdgeStroke(merged), strokeWidth },
          };
        }
        return { ...e, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  patchStubLabelData: (nodeId, patch) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== "stub-label") return n;
        const merged = { ...(n.data as Record<string, unknown>), ...patch } as typeof n.data;
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
        }
        return { ...n, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  convertEdgeToStubs: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    if (edge.data?.linkedConnectionId) return; // already a stub leg

    const srcDevice = state.nodes.find((n) => n.id === edge.source);
    const tgtDevice = state.nodes.find((n) => n.id === edge.target);
    if (!srcDevice || !tgtDevice) return;

    const absPos = (n: typeof state.nodes[number]): { x: number; y: number } => {
      let x = n.position.x;
      let y = n.position.y;
      let pid = n.parentId;
      while (pid) {
        const p = state.nodes.find((nn) => nn.id === pid);
        if (!p) break;
        x += p.position.x;
        y += p.position.y;
        pid = p.parentId;
      }
      return { x, y };
    };

    // Resolve the real handle position using the same render-mirroring math the
    // stub-snap logic uses. Falls back to a device-edge approximation only when
    // the handle can't be resolved (unknown port id), which shouldn't happen in
    // practice since the edge already references the handle.
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n] as const));
    const displayDefaults = {
      useShortNames: state.useShortNames,
      wrapDeviceLabels: state.wrapDeviceLabels,
    };
    const handlePosFor = (
      deviceNode: typeof state.nodes[number],
      handleId: string | null | undefined,
    ): { x: number; y: number; side: "left" | "right" } => {
      const positions = getPortAbsolutePositions(deviceNode, nodeMap, displayDefaults);
      const match = positions.find((p) => p.handleId === handleId);
      if (match) return { x: match.absX, y: match.absY, side: match.side };
      // Fallback: device vertical center on the appropriate edge.
      const dPos = absPos(deviceNode);
      const w = (deviceNode.measured?.width as number | undefined) ?? 144;
      const h = (deviceNode.measured?.height as number | undefined) ?? 48;
      const ports = (deviceNode.data as { ports?: Port[] }).ports ?? [];
      const baseId = (handleId ?? "").replace(/-(in|out|rear|front)$/, "");
      const port = ports.find((pp) => pp.id === baseId);
      let side: "left" | "right" = "right";
      if (port) {
        if (port.direction === "input") side = port.flipped ? "right" : "left";
        else if (port.direction === "output") side = port.flipped ? "left" : "right";
        else side = port.flipped ? "right" : "left";
      }
      return { x: side === "right" ? dPos.x + w : dPos.x, y: dPos.y + h / 2, side };
    };

    const srcHandle = handlePosFor(srcDevice, edge.sourceHandle);
    const tgtHandle = handlePosFor(tgtDevice, edge.targetHandle);

    const srcPlace = defaultStubPlacement({ x: srcHandle.x, y: srcHandle.y }, srcHandle.side);
    const tgtPlace = defaultStubPlacement({ x: tgtHandle.x, y: tgtHandle.y }, tgtHandle.side);
    // Round to integer pixels — any sub-pixel from the parent-chain walk would
    // make the edge router round port and stub handles to adjacent integers and
    // produce a 1-px jog at the endpoint. The 14-px box height divided by 2 is
    // an integer already, so this is just defending against deviceAbs drift.
    const srcStubAbs = { x: Math.round(srcPlace.pos.x), y: Math.round(srcPlace.pos.y) };
    const tgtStubAbs = { x: Math.round(tgtPlace.pos.x), y: Math.round(tgtPlace.pos.y) };
    const srcSide = srcPlace.handle;
    const tgtSide = tgtPlace.handle;

    const srcParentId = srcDevice.parentId;
    const tgtParentId = tgtDevice.parentId;
    const rawSrcParentAbs = srcParentId
      ? absPos(state.nodes.find((n) => n.id === srcParentId)!)
      : { x: 0, y: 0 };
    const rawTgtParentAbs = tgtParentId
      ? absPos(state.nodes.find((n) => n.id === tgtParentId)!)
      : { x: 0, y: 0 };
    const srcParentAbs = { x: Math.round(rawSrcParentAbs.x), y: Math.round(rawSrcParentAbs.y) };
    const tgtParentAbs = { x: Math.round(rawTgtParentAbs.x), y: Math.round(rawTgtParentAbs.y) };

    const linkedConnectionId = newLinkedConnectionId();
    const stubNodeIdSrc = `stub-${edge.id}-src`;
    const stubNodeIdTgt = `stub-${edge.id}-tgt`;
    const sigType = edge.data!.signalType;

    // Don't stamp data.placed yet — the X above assumes STUB_W_EST (80px), but
    // a wide cable label can produce a 200+ px box. tryPlace's overlap-correction
    // pass needs to run once after React Flow measures the real width, especially
    // for left-side stubs whose box extends back toward the device. Y is already
    // correct (computed from the real port handle row), so tryPlace will only
    // ever shift X here, not jump the stub.
    const srcStubNode: SchematicNode = {
      id: stubNodeIdSrc,
      type: "stub-label",
      position: { x: srcStubAbs.x - srcParentAbs.x, y: srcStubAbs.y - srcParentAbs.y },
      ...(srcParentId ? { parentId: srcParentId } : {}),
      zIndex: STUB_LABEL_Z_INDEX, // paint above connection lines (#178)
      data: { signalType: sigType, linkedConnectionId, side: "source" },
    } as SchematicNode;
    const tgtStubNode: SchematicNode = {
      id: stubNodeIdTgt,
      type: "stub-label",
      position: { x: tgtStubAbs.x - tgtParentAbs.x, y: tgtStubAbs.y - tgtParentAbs.y },
      ...(tgtParentId ? { parentId: tgtParentId } : {}),
      zIndex: STUB_LABEL_Z_INDEX, // paint above connection lines (#178)
      data: { signalType: sigType, linkedConnectionId, side: "target" },
    } as SchematicNode;

    const baseData = { ...edge.data! };
    delete (baseData as Record<string, unknown>).manualWaypoints;
    delete (baseData as Record<string, unknown>).autoRouteWaypoints;
    // Stubbing a bundled member removes it from the bundle (a stub has no trunk to share).
    const wasBundled = !!(baseData as Record<string, unknown>).bundleId;
    delete (baseData as Record<string, unknown>).bundleId;

    const srcLeg: ConnectionEdge = {
      ...edge,
      id: `${edge.id}-src`,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: stubNodeIdSrc,
      targetHandle: srcSide,
      data: { ...baseData, linkedConnectionId },
    };
    const tgtLegData = { ...baseData, linkedConnectionId } as ConnectionEdge["data"];
    delete (tgtLegData as Record<string, unknown>).cableId;
    delete (tgtLegData as Record<string, unknown>).label;
    delete (tgtLegData as Record<string, unknown>).cableLength;
    delete (tgtLegData as Record<string, unknown>).multicableLabel;
    const tgtLeg: ConnectionEdge = {
      ...edge,
      id: `${edge.id}-tgt`,
      source: stubNodeIdTgt,
      sourceHandle: tgtSide,
      target: edge.target,
      targetHandle: edge.targetHandle,
      data: tgtLegData,
    };

    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = [...state.edges.filter((e) => e.id !== edgeId), srcLeg, tgtLeg];
    // Removing this member may drop its bundle below 2 — GC dangling membership + bundles.
    const gc = gcBundles(newEdges, state.bundles);
    set({
      // Stubbing a member can dissolve its bundle — drop the now-orphan junction anchors.
      nodes: reconcileBundleJunctions(
        reconcileWaypointNodes([...state.nodes, srcStubNode, tgtStubNode], gc.edges),
        gc.edges,
      ),
      edges: gc.edges,
      bundles: gc.bundles,
    });
    if (wasBundled) get().addToast("Removed from bundle (stubbed)", "info");
    get().saveToLocalStorage();
  },

  collapseStubsForEdge: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const linkedId = edge.data?.linkedConnectionId;
    if (!linkedId) return;

    const linkedEdges = state.edges.filter((e) => e.data?.linkedConnectionId === linkedId);
    if (linkedEdges.length < 2) return;
    const srcLeg = linkedEdges.find((e) => {
      const src = state.nodes.find((n) => n.id === e.source);
      return src?.type !== "stub-label";
    });
    const tgtLeg = linkedEdges.find((e) => {
      const tgt = state.nodes.find((n) => n.id === e.target);
      return tgt?.type !== "stub-label";
    });
    if (!srcLeg || !tgtLeg) return;

    const stubIds = new Set<string>();
    for (const e of linkedEdges) {
      const src = state.nodes.find((n) => n.id === e.source);
      const tgt = state.nodes.find((n) => n.id === e.target);
      if (src?.type === "stub-label") stubIds.add(src.id);
      if (tgt?.type === "stub-label") stubIds.add(tgt.id);
    }

    // Reconstruct a single direct edge. Use srcLeg as the metadata canonical
    // (it's where cableId/label live after migration/conversion).
    const mergedData = { ...srcLeg.data! };
    delete (mergedData as Record<string, unknown>).linkedConnectionId;

    const directId = srcLeg.id.endsWith("-src") ? srcLeg.id.slice(0, -4) : `merged-${srcLeg.id}`;
    const directEdge: ConnectionEdge = {
      ...srcLeg,
      id: directId,
      source: srcLeg.source,
      sourceHandle: srcLeg.sourceHandle,
      target: tgtLeg.target,
      targetHandle: tgtLeg.targetHandle,
      data: mergedData,
    };

    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = [...state.edges.filter((e) => e.data?.linkedConnectionId !== linkedId), directEdge];
    set({
      nodes: reconcileWaypointNodes(state.nodes.filter((n) => !stubIds.has(n.id)), newEdges),
      edges: newEdges,
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
        // If the patch can affect the rendered stroke, recompute it.
        const strokeAffectingKeys = ["color", "directAttach", "signalType"] as const;
        const strokeAffected = strokeAffectingKeys.some((k) => k in patch);
        if (strokeAffected) {
          const strokeWidth = merged.directAttach ? 1 : 2;
          return {
            ...e,
            data: merged,
            style: { ...e.style, stroke: resolveEdgeStroke(merged), strokeWidth },
          };
        }
        return { ...e, data: merged };
      }),
    });
    get().saveToLocalStorage();
  },

  setManualWaypoints: (edgeId, waypoints) => {
    const state = get();
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = state.edges.map((e) =>
      e.id === edgeId
        ? { ...e, data: { ...e.data!, manualWaypoints: waypoints, autoRouteWaypoints: undefined } }
        : e,
    );
    set({
      edges: newEdges,
      nodes: reconcileWaypointNodes(state.nodes, newEdges),
    });
    get().saveToLocalStorage();
  },

  clearManualWaypoints: (edgeId) => {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const hasManual = !!edge.data?.manualWaypoints;

    // If this is a leg of a stubbed connection, "Reset Route" should also re-place its
    // stub labels: clear `placed`/`userMoved` so StubLabelNode.tryPlace re-anchors them
    // to their ports. This is the escape hatch for #182 — a stub frozen out of alignment
    // (e.g. left behind after a device move) previously couldn't be corrected because
    // Reset Route only touched edge waypoints (and bailed entirely when there were none).
    const linkedId = edge.data?.linkedConnectionId;
    const stubIdsToReset = new Set<string>();
    if (linkedId) {
      for (const n of state.nodes) {
        if (n.type !== "stub-label") continue;
        const d = n.data as import("./types").StubLabelData;
        if (d.linkedConnectionId !== linkedId) continue;
        if (d.placed === true || d.userMoved === true) stubIdsToReset.add(n.id);
      }
    }

    if (!hasManual && stubIdsToReset.size === 0) return;

    pushUndo({ nodes: state.nodes, edges: state.edges });

    const newEdges = hasManual
      ? state.edges.map((e) => {
          if (e.id !== edgeId) return e;
          const { manualWaypoints: _mw, ...restData } = e.data!;
          return { ...e, data: restData as ConnectionEdge["data"] };
        })
      : state.edges;

    let newNodes = hasManual ? reconcileWaypointNodes(state.nodes, newEdges) : state.nodes;
    if (stubIdsToReset.size > 0) {
      newNodes = newNodes.map((n) => {
        if (!stubIdsToReset.has(n.id) || n.type !== "stub-label") return n;
        const d = n.data as import("./types").StubLabelData;
        return { ...n, data: { ...d, placed: false, userMoved: false } };
      });
    }

    set({ edges: newEdges, nodes: newNodes });
    get().saveToLocalStorage();
  },

  clearAllManualWaypoints: () => {
    const state = get();
    if (!state.edges.some((e) => e.data?.manualWaypoints?.length)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const newEdges = state.edges.map((e) => {
      if (!e.data?.manualWaypoints?.length) return e;
      // Strip both the manual route and the auto-route-frozen flag so the edge re-routes fresh.
      const { manualWaypoints: _mw, autoRouteWaypoints: _ar, ...restData } = e.data;
      return { ...e, data: restData as ConnectionEdge["data"] };
    });
    set({
      edges: newEdges,
      nodes: reconcileWaypointNodes(state.nodes, newEdges),
    });
    get().saveToLocalStorage();
  },

  // ── Connection bundling ───────────────────────────────────────────────
  createBundle: (edgeIds) => {
    const state = get();
    const ids = edgeIds.filter((id) => state.edges.some((e) => e.id === id && e.data?.signalType));
    if (ids.length < 2) {
      get().addToast("Select at least 2 connections to bundle", "info");
      return;
    }
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const id = newBundleId();
    const edges = state.edges.map((e) =>
      ids.includes(e.id) ? { ...e, data: { ...e.data!, bundleId: id } } : e,
    );
    // Spawn the bundle's break-in/break-out anchors. The members are already routed, so their
    // waypoint endpoints give the exact pin Ys — the anchors land on the cables, not at the
    // (possibly very tall) device's vertical center.
    const nodes = reconcileBundleJunctions(state.nodes, edges, routedEndpointY(state.routedEdges));
    set({ edges, bundles: { ...state.bundles, [id]: { id } }, nodes });
    get().saveToLocalStorage();
  },
  dissolveBundle: (bundleId) => {
    const state = get();
    if (!state.bundles[bundleId]) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const edges = state.edges.map((e) => {
      if (e.data?.bundleId !== bundleId) return e;
      const { bundleId: _b, ...rest } = e.data!;
      return { ...e, data: rest as ConnectionEdge["data"] };
    });
    const { [bundleId]: _gone, ...bundles } = state.bundles;
    // Drop the dissolved bundle's now-orphan junction anchors.
    const nodes = reconcileBundleJunctions(state.nodes, edges);
    set({ edges, bundles, nodes });
    get().saveToLocalStorage();
  },
  addToBundle: (bundleId, edgeIds) => {
    const state = get();
    if (!state.bundles[bundleId]) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const edges = state.edges.map((e) =>
      edgeIds.includes(e.id) && e.data?.signalType ? { ...e, data: { ...e.data!, bundleId } } : e,
    );
    // Anchors already exist for a live bundle (no-op); reconcile only spawns if somehow missing.
    const nodes = reconcileBundleJunctions(state.nodes, edges, routedEndpointY(state.routedEdges));
    set({ edges, nodes });
    get().saveToLocalStorage();
  },
  removeFromBundle: (edgeIds) => {
    const state = get();
    if (!state.edges.some((e) => edgeIds.includes(e.id) && e.data?.bundleId)) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    const edges = state.edges.map((e) => {
      if (!edgeIds.includes(e.id) || !e.data?.bundleId) return e;
      const { bundleId: _b, ...rest } = e.data!;
      return { ...e, data: rest as ConnectionEdge["data"] };
    });
    // Auto-dissolve any bundle that dropped below 2 members, then drop its orphan anchors.
    const gc = gcBundles(edges, state.bundles);
    const nodes = reconcileBundleJunctions(state.nodes, gc.edges);
    set({ edges: gc.edges, bundles: gc.bundles, nodes });
    get().saveToLocalStorage();
  },
  setBundleMeta: (bundleId, patch) => {
    const state = get();
    if (!state.bundles[bundleId]) return;
    pushUndo({ nodes: state.nodes, edges: state.edges });
    set({ bundles: { ...state.bundles, [bundleId]: { ...state.bundles[bundleId], ...patch } } });
    get().saveToLocalStorage();
  },
  setBundleTrunkWaypoints: (bundleId, trunkWaypoints) =>
    get().setBundleMeta(bundleId, { trunkWaypoints }),

  computeSimpleRoutes: (rfInstance) => {
    // Simple orthogonal L-shapes — no A*, no penalties, instant.
    // Used when autoRoute is off for lag-free editing.
    const state = get();
    const results: Record<string, RoutedEdge> = {};

    // Bundle members route along one shared trunk (straight L-gather + trunk + L-fan, no
    // A*). Tally present members per bundle; a bundle is live only with ≥2 members.
    const bundleCounts = new Map<string, number>();
    for (const e of state.edges) {
      const bid = e.data?.bundleId;
      if (bid) bundleCounts.set(bid, (bundleCounts.get(bid) ?? 0) + 1);
    }
    const bundleGroups = new Map<string, BundleEndpoint[]>();

    for (const edge of state.edges) {
      const srcInternal = rfInstance.getInternalNode(edge.source);
      const tgtInternal = rfInstance.getInternalNode(edge.target);
      if (!srcInternal || !tgtInternal) continue;

      const srcBounds = srcInternal.internals.handleBounds;
      const tgtBounds = tgtInternal.internals.handleBounds;
      const srcAbs = srcInternal.internals.positionAbsolute;
      const tgtAbs = tgtInternal.internals.positionAbsolute;

      // Find the handle positions
      const srcHandle = [...(srcBounds?.source ?? []), ...(srcBounds?.target ?? [])].find((h) => h.id === edge.sourceHandle);
      const tgtHandle = [...(tgtBounds?.source ?? []), ...(tgtBounds?.target ?? [])].find((h) => h.id === edge.targetHandle);
      if (!srcHandle || !tgtHandle) continue;

      const sx = Math.round(srcAbs.x + srcHandle.x + srcHandle.width / 2);
      const sy = Math.round(srcAbs.y + srcHandle.y + srcHandle.height / 2);
      const tx = Math.round(tgtAbs.x + tgtHandle.x + tgtHandle.width / 2);
      const ty = Math.round(tgtAbs.y + tgtHandle.y + tgtHandle.height / 2);

      // Bundle members defer to the shared-trunk pass below.
      const bid = edge.data?.bundleId;
      if (bid && (bundleCounts.get(bid) ?? 0) >= 2) {
        let group = bundleGroups.get(bid);
        if (!group) { group = []; bundleGroups.set(bid, group); }
        group.push({
          edgeId: edge.id, srcX: sx, srcY: sy, tgtX: tx, tgtY: ty,
          manualWaypoints: edge.data?.manualWaypoints,
        });
        continue;
      }

      // Use manual waypoints if present (frozen from A* or user-placed), otherwise L-shape
      let simplified: { x: number; y: number }[];
      const manualWp = edge.data?.manualWaypoints;
      if (manualWp && manualWp.length > 0) {
        const raw = [{ x: sx, y: sy }, ...manualWp, { x: tx, y: ty }];
        simplified = simplifyWaypoints(orthogonalize(raw));
      } else if (Math.abs(sy - ty) < 2) {
        simplified = [{ x: sx, y: sy }, { x: tx, y: ty }];
      } else {
        const midX = Math.round((sx + tx) / 2);
        simplified = [
          { x: sx, y: sy },
          { x: midX, y: sy },
          { x: midX, y: ty },
          { x: tx, y: ty },
        ];
      }

      const svgPath = waypointsToSvgPath(simplified);

      const midPt = simplified[Math.floor(simplified.length / 2)];
      results[edge.id] = {
        edgeId: edge.id,
        svgPath,
        waypoints: simplified,
        segments: extractSegments(simplified),
        labelX: midPt.x,
        labelY: midPt.y,
        turns: "simple",
        crossingPoints: [],
      };
    }

    // Shared-trunk pass for bundles: straight L-gather → trunk → L-fan per member, plus
    // one synthetic `bundle:<id>` trunk route for the overlay layer.
    for (const [bid, members] of bundleGroups) {
      if (members.length < 2) continue;
      const meta = state.bundles[bid];
      // Break-in / break-out points: a user trunk override wins; otherwise the bundle's junction
      // nodes are authoritative (matches the A* path in edgeRouter); fall back to computeBundleTrunk.
      const { in: jin, out: jout } = bundleJunctionsFor(state.nodes, bid);
      let entry: { x: number; y: number }, exit: { x: number; y: number }, trunk: { x: number; y: number }[];
      if (meta?.trunkWaypoints && meta.trunkWaypoints.length >= 2) {
        entry = meta.trunkWaypoints[0];
        exit = meta.trunkWaypoints[meta.trunkWaypoints.length - 1];
        trunk = meta.trunkWaypoints;
      } else {
        const bt = computeBundleTrunk(members);
        entry = jin ? jin.position : bt.entry;
        exit = jout ? jout.position : bt.exit;
        trunk = [entry, exit];
      }
      for (const m of members) {
        // Comb shape, matching the A* router: gather horizontal at the port row with the
        // vertical AT the break-in column, and — critically — fan vertical AT the break-out
        // column before the horizontal into the target. (Plain orthogonalize bends
        // horizontal-first, which ran every member along the trunk row and dropped a shared
        // vertical pressed against the target device — members flattened into one
        // unselectable stack.) User waypoints on a member shape its gather/fan legs.
        const { gather, fan } = splitMemberWaypoints(m.manualWaypoints, entry, exit);
        const pre = gather.length
          ? [{ x: m.srcX, y: m.srcY }, ...gather, entry]
          : [{ x: m.srcX, y: m.srcY }, { x: entry.x, y: m.srcY }, entry];
        const post = fan.length
          ? [exit, ...fan, { x: m.tgtX, y: m.tgtY }]
          : [exit, { x: exit.x, y: m.tgtY }, { x: m.tgtX, y: m.tgtY }];
        const wp = simplifyWaypoints(orthogonalize([
          ...pre,
          ...trunk.slice(1, -1), // user-shaped trunk interior (empty for the default straight trunk)
          ...post,
        ]));
        const midPt = wp[Math.floor(wp.length / 2)];
        results[m.edgeId] = {
          edgeId: m.edgeId, svgPath: waypointsToSvgPath(wp), waypoints: wp,
          segments: extractSegments(wp), labelX: midPt.x, labelY: midPt.y,
          turns: "bundle", crossingPoints: [],
        };
      }
      const trunkWp = simplifyWaypoints(orthogonalize(trunk.map((p) => ({ x: p.x, y: p.y }))));
      const tMid = trunkWp[Math.floor(trunkWp.length / 2)] ?? entry;
      results[`bundle:${bid}`] = {
        edgeId: `bundle:${bid}`, svgPath: waypointsToSvgPath(trunkWp), waypoints: trunkWp,
        segments: extractSegments(trunkWp), labelX: tMid.x, labelY: tMid.y,
        turns: "trunk", crossingPoints: [],
      };
    }

    // Detect crossings so line hops render in manual mode too.
    const stubbedIds = new Set(state.edges.filter((e) => e.data?.stubbed).map((e) => e.id));
    const entries = Object.values(results).filter((r) => !stubbedIds.has(r.edgeId) && !r.edgeId.startsWith("bundle:"));
    const segCount = entries.reduce((n, r) => n + r.segments.length, 0);
    const overBudget = entries.length > 400 || segCount * segCount > 250_000;
    if (!overBudget) {
      const arcMap = new Map<string, CrossingPoint[]>();
      const gapMap = new Map<string, CrossingPoint[]>();
      for (const r of entries) {
        arcMap.set(r.edgeId, []);
        gapMap.set(r.edgeId, []);
      }
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          for (const sa of a.segments) {
            for (const sb of b.segments) {
              if (segmentsCross(sa, sb)) {
                const h = sa.axis === "h" ? sa : sb;
                const v = sa.axis === "v" ? sa : sb;
                const pt: CrossingPoint = { x: v.x1, y: h.y1 };
                if (sa.axis === "h") {
                  arcMap.get(a.edgeId)!.push(pt);
                  gapMap.get(b.edgeId)!.push(pt);
                } else {
                  arcMap.get(b.edgeId)!.push(pt);
                  gapMap.get(a.edgeId)!.push(pt);
                }
              }
            }
          }
        }
      }
      for (const r of entries) {
        const arcs = arcMap.get(r.edgeId)!;
        const gaps = gapMap.get(r.edgeId)!;
        if (arcs.length || gaps.length) {
          r.crossingPoints = [...arcs, ...gaps];
          r.svgPathWithHops = waypointsToSvgPathWithHops(r.waypoints, arcs, gaps);
        }
      }
    }

    set({ routedEdges: results });
  },

  recomputeRoutes: (rfInstance) => {
    const state = get();
    const hiddenSet = state.hiddenSignalTypes ? new Set(state.hiddenSignalTypes.split(",")) : null;
    let visibleEdges = hiddenSet
      ? state.edges.filter((e) => !hiddenSet.has(e.data?.signalType ?? ""))
      : state.edges;

    // --- Adapter visibility: compute hidden adapters and virtual edges ---
    const hiddenAdapterNodeIds = new Set<string>();
    const hiddenVirtualEdgeIds = new Set<string>();
    const virtualEdgeGradients: Record<string, { sourceColor: string; targetColor: string }> = {};
    // Map from virtual edge ID back to the hidden partner edge ID
    const virtualEdgeSources = new Map<string, { primaryEdgeId: string; secondaryEdgeId: string; adapterNodeId: string }>();

    for (const n of state.nodes) {
      if (n.type !== "device") continue;
      const data = n.data as DeviceData;
      if (data.deviceType !== "adapter") continue;
      // Resolve visibility
      if (data.adapterVisibility === "force-show") continue;
      if (data.adapterVisibility === "force-hide" || state.hideAdapters) {
        hiddenAdapterNodeIds.add(n.id);
      }
    }

    if (hiddenAdapterNodeIds.size > 0) {
      // For each hidden adapter, find its edge pair and create virtual edges
      const virtualEdges: ConnectionEdge[] = [];
      const replacedEdgeIds = new Set<string>();

      for (const adapterId of hiddenAdapterNodeIds) {
        // Find edges connected to this adapter
        const inboundEdge = visibleEdges.find((e) => e.target === adapterId);
        const outboundEdge = visibleEdges.find((e) => e.source === adapterId);

        if (inboundEdge && outboundEdge) {
          // Create virtual edge: source of inbound → target of outbound
          const virtualId = `virtual-${inboundEdge.id}-${outboundEdge.id}`;
          const srcSignalType = inboundEdge.data?.signalType ?? "custom";
          const tgtSignalType = outboundEdge.data?.signalType ?? "custom";

          virtualEdges.push({
            id: virtualId,
            source: inboundEdge.source,
            target: outboundEdge.target,
            sourceHandle: inboundEdge.sourceHandle,
            targetHandle: outboundEdge.targetHandle,
            data: {
              signalType: srcSignalType as SignalType,
            },
            style: inboundEdge.style,
          });

          replacedEdgeIds.add(inboundEdge.id);
          replacedEdgeIds.add(outboundEdge.id);
          hiddenVirtualEdgeIds.add(outboundEdge.id);

          virtualEdgeSources.set(virtualId, {
            primaryEdgeId: inboundEdge.id,
            secondaryEdgeId: outboundEdge.id,
            adapterNodeId: adapterId,
          });

          // If signal types differ, store gradient info for the primary edge
          if (srcSignalType !== tgtSignalType) {
            virtualEdgeGradients[inboundEdge.id] = {
              sourceColor: `var(--color-${srcSignalType})`,
              targetColor: `var(--color-${tgtSignalType})`,
            };
          }
        }
      }

      // Replace real edge pairs with virtual edges for routing
      visibleEdges = [
        ...visibleEdges.filter((e) => !replacedEdgeIds.has(e.id)),
        ...virtualEdges,
      ];
    }

    // Exclude hidden adapter nodes from obstacle computation
    const routingNodes = hiddenAdapterNodeIds.size > 0
      ? state.nodes.filter((n) => !hiddenAdapterNodeIds.has(n.id))
      : state.nodes;

    // Hand the heavy A* off to the routing worker. Build the DOM-derived handle snapshot here
    // (needs rfInstance), tag the request with a monotonic seq, stash the main-thread-only context
    // (virtual-edge remap + adapter visibility) for the matching apply step, and post. The result
    // is applied asynchronously by applyRoutingResult; stale/superseded seqs are discarded there.
    if (!routingHandlerRegistered) {
      setRoutingResultHandler(applyRoutingResult);
      routingHandlerRegistered = true;
    }
    const handles = buildHandleSnapshot(routingNodes, rfInstance);

    // Stub↔port colinearity heal: a stub handle a few px off its partner port's TRUE
    // (DOM-measured) row kinks the wire at the label. This is the only place port truth
    // exists. Corrections change nodeDigest, which re-fires routing with aligned stubs;
    // idempotent (healed stubs fall inside the dead-band next pass).
    const healedStubNodes = healStubPortAlignment(state.nodes, state.edges, handles);
    if (healedStubNodes) {
      set({ nodes: healedStubNodes });
      return;
    }

    routeSeq += 1;
    pendingRouteCtx = {
      seq: routeSeq,
      virtualEdgeSources,
      hiddenAdapterNodeIds,
      hiddenVirtualEdgeIds,
      virtualEdgeGradients,
    };
    requestRoutes({
      seq: routeSeq,
      nodes: routingNodes,
      edges: visibleEdges,
      handles,
      bundles: state.bundles,
      debug: state.debugEdges,
      routingParams: (globalThis as Record<string, unknown>).__routingParams as Record<string, number> | undefined,
    });
  },

  toggleAutoRoute: () => {
    const state = get();
    if (state.autoRouteConfirmPending) return; // Dialog already open

    if (state.autoRoute) {
      // Toggling OFF — check if we need to show the confirmation dialog
      const stash = state._edgeWaypointStash;
      if (!stash) {
        // No stash (file opened with auto-route ON) — just freeze routes, no dialog
        pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
        get().confirmAutoRouteOff(true);
        return;
      }
      const pref = localStorage.getItem("easyschematic-autoroute-pref");
      if (pref === "keep") {
        pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
        get().confirmAutoRouteOff(true);
      } else if (pref === "revert") {
        pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
        get().confirmAutoRouteOff(false);
      } else {
        // "ask" (default) — show dialog, don't push undo yet
        set({ autoRouteConfirmPending: true });
      }
    } else {
      // Toggling ON — stash current waypoint state, then clear auto-generated waypoints
      pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: state.autoRoute });
      const stash: Record<string, { manualWaypoints: { x: number; y: number }[]; autoRouteWaypoints?: boolean } | null> = {};
      for (const e of state.edges) {
        stash[e.id] = e.data?.manualWaypoints?.length
          ? { manualWaypoints: e.data.manualWaypoints, autoRouteWaypoints: e.data.autoRouteWaypoints }
          : null;
      }
      const updatedEdges = state.edges.map((e) => {
        if (!e.data?.autoRouteWaypoints) return e;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { manualWaypoints, autoRouteWaypoints, ...restData } = e.data;
        return { ...e, data: restData };
      }) as typeof state.edges;
      set({
        autoRoute: true,
        edges: updatedEdges,
        nodes: reconcileWaypointNodes(state.nodes, updatedEdges),
        _edgeWaypointStash: stash,
      });
    }
  },

  confirmAutoRouteOff: (preserve) => {
    const state = get();
    // Push undo if called from dialog (pending = true means undo wasn't pushed yet)
    if (state.autoRouteConfirmPending) {
      pushUndo({ nodes: state.nodes, edges: state.edges, autoRoute: true });
    }

    if (preserve) {
      // Keep A* routes — freeze as manual waypoints
      const updatedEdges = state.edges.map((e) => {
        const route = state.routedEdges[e.id];
        if (!route || route.waypoints.length <= 2) return e;
        if (e.data?.manualWaypoints?.length && !e.data.autoRouteWaypoints) return e;
        const interior = route.waypoints.slice(1, -1);
        if (interior.length === 0) return e;
        return {
          ...e,
          data: { ...e.data!, manualWaypoints: interior, autoRouteWaypoints: true },
        };
      }) as typeof state.edges;
      set({
        autoRoute: false,
        edges: updatedEdges,
        nodes: reconcileWaypointNodes(state.nodes, updatedEdges),
        _edgeWaypointStash: null,
        autoRouteConfirmPending: false,
      });
    } else {
      // Restore previous — use stash
      const stash = state._edgeWaypointStash;
      const updatedEdges = state.edges.map((e) => {
        if (stash && e.id in stash) {
          const saved = stash[e.id];
          if (saved === null) {
            if (!e.data) return e;
            const { manualWaypoints: _, autoRouteWaypoints: _a, ...restData } = e.data;
            return { ...e, data: restData as typeof e.data };
          }
          return { ...e, data: { ...e.data!, manualWaypoints: saved.manualWaypoints, autoRouteWaypoints: saved.autoRouteWaypoints } };
        }
        // Edge not in stash — freeze A* route
        const route = state.routedEdges[e.id];
        if (!route || route.waypoints.length <= 2) return e;
        if (e.data?.manualWaypoints?.length && !e.data.autoRouteWaypoints) return e;
        const interior = route.waypoints.slice(1, -1);
        if (interior.length === 0) return e;
        return {
          ...e,
          data: { ...e.data!, manualWaypoints: interior, autoRouteWaypoints: true },
        };
      }) as typeof state.edges;
      set({
        autoRoute: false,
        edges: updatedEdges,
        nodes: reconcileWaypointNodes(state.nodes, updatedEdges),
        _edgeWaypointStash: null,
        autoRouteConfirmPending: false,
        routedEdges: {},
      });
    }
  },

  cancelAutoRouteOff: () => {
    set({ autoRouteConfirmPending: false });
  },

  toggleDebugEdges: () => {
    set((s) => ({ debugEdges: !s.debugEdges }));
  },
  bumpRoutingParams: () => {
    set((s) => ({ routingParamVersion: s.routingParamVersion + 1 }));
  },

  setResizeGuides: (guides) => {
    set({ resizeGuides: guides });
  },
}));
