import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  useReactFlow,
  useStoreApi,
  useViewport,
  reconnectEdge,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import { useSchematicStore, GRID_SIZE, setReconnectingEdgeId } from "./store";
import { nodeTypes, edgeTypes } from "./nodeTypes";
import SnapGuides from "./components/SnapGuides";
import PageBoundaryOverlay from "./components/PageBoundaryOverlay";
import PrintViewBar from "./components/PrintViewBar";
import DeviceLibrary from "./components/DeviceLibrary";
import DeviceEditor from "./components/DeviceEditor";
import SignalColorPanel from "./components/SignalColorPanel";
import ShowInfoPanel from "./components/ShowInfoPanel";
import ViewOptionsPanel from "./components/ViewOptionsPanel";
import MenuBar from "./components/MenuBar";
import EdgeContextMenu from "./components/EdgeContextMenu";
import IncompatibleConnectionDialog from "./components/IncompatibleConnectionDialog";
import MobileGate from "./components/MobileGate";
import PendingSubmissionBanner from "./components/PendingSubmissionBanner";
import RoomContextMenu from "./components/RoomContextMenu";
import RoomEditor from "./components/RoomEditor";
import QuickAddDevice from "./components/QuickAddDevice";
import RouterCreator from "./components/RouterCreator";
import { computeSnap, enforceMinSpacing, type GuideLine } from "./snapUtils";
import type { DeviceTemplate, SchematicFile, SchematicNode } from "./types";
import { loadSharedSchematic } from "./templateApi";

/** Darkens the canvas area left of x=0 and above y=0, marking the printable origin. */
function CanvasOriginOverlay() {
  const { x: vx, y: vy, zoom } = useViewport();
  const FAR = 1e6;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <svg
        style={{
          position: "absolute",
          overflow: "visible",
          width: 1,
          height: 1,
          transform: `translate(${vx}px, ${vy}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Everything left of x=0 */}
        <rect x={-FAR} y={-FAR} width={FAR} height={2 * FAR} fill="#e5e5e5" />
        {/* Everything above y=0 (only the positive-x portion, avoid double-fill) */}
        <rect x={0} y={-FAR} width={FAR} height={FAR} fill="#e5e5e5" />
      </svg>
    </div>
  );
}

/** Combines drag snap guides (local state) with resize snap guides (store state). */
function ResizeSnapGuides({ dragGuides }: { dragGuides: GuideLine[] }) {
  const resizeGuides = useSchematicStore((s) => s.resizeGuides);
  const combined = dragGuides.length > 0 || resizeGuides.length > 0
    ? [...dragGuides, ...resizeGuides]
    : [];
  return <SnapGuides guides={combined} />;
}

function SchematicCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    addDevice,
    addRoom,
    addNote,
    removeSelected,
    copySelected,
    pasteClipboard,
    pushSnapshot,
    reparentNode,
    undo,
    redo,
    loadFromLocalStorage,
  } = useSchematicStore();

  const rfInstance = useReactFlow();
  const rfStore = useStoreApi();
  const { screenToFlowPosition } = rfInstance;

  // Space-held state for pan-on-drag (Vectorworks-style)
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Mobile detection for touch-friendly interaction
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Track physical Ctrl key to distinguish real Ctrl+scroll from trackpad pinch
  const ctrlHeldRef = useRef(false);

  // Sticky trackpad detection: once a trackpad gesture is detected, treat all
  // subsequent wheel events as trackpad until 400ms of silence (gesture end).
  const trackpadActiveRef = useRef(false);
  const trackpadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Edge reconnection state (React Flow's reconnection path)
  const reconnectingRef = useRef(false);

  // Click-to-connect preview line state
  const clickConnectFromRef = useRef<{
    x: number; y: number; fromSource: boolean;
    nodeId: string; handleId: string | null;
  } | null>(null);
  const clickConnectCleanupRef = useRef<(() => void) | null>(null);
  const isClickConnectMode = useRef(false);
  const [connectPreview, setConnectPreview] = useState<{
    fromX: number; fromY: number; toX: number; toY: number; fromSource: boolean;
    snapped: boolean; valid: boolean;
  } | null>(null);

  // Quick-add device dialog state
  const [quickAddPos, setQuickAddPos] = useState<{ x: number; y: number } | null>(null);
  const [showRouterCreator, setShowRouterCreator] = useState(false);
  const routerCreatorPosRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const lastPaneClickRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  // Viewport transform for rendering flow-space overlays
  const { x: vx, y: vy, zoom } = useViewport();

  // Snap guide lines shown during drag
  const [snapGuides, setSnapGuides] = useState<GuideLine[]>([]);

  // Load saved state on mount
  useEffect(() => {
    loadFromLocalStorage();
  }, [loadFromLocalStorage]);

  // Recompute edge routes when nodes/edges change (but not during drag)
  const isDragging = useSchematicStore((s) => s.isDragging);
  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const printView = useSchematicStore((s) => s.printView);
  const hiddenSignalTypesStr = useSchematicStore((s) => s.hiddenSignalTypes);
  const nodeCount = useSchematicStore((s) => s.nodes.length);
  const edgeCount = useSchematicStore((s) => s.edges.length);
  // Digest of node positions + sizes to detect moves
  const nodeDigest = useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );
  // Digest of edge connectivity
  const edgeDigest = useSchematicStore((s) =>
    s.edges.map((e) => `${e.id}:${e.source}:${e.sourceHandle}:${e.target}:${e.targetHandle}:${e.data?.manualWaypoints?.length ?? 0}`).join("|"),
  );

  // Filter out edges whose signal type is hidden (presentation-only — store edges stay complete)
  const visibleEdges = useMemo(() => {
    if (!hiddenSignalTypesStr) return edges;
    const hidden = new Set(hiddenSignalTypesStr.split(","));
    return edges.filter((e) => !hidden.has(e.data?.signalType ?? ""));
  }, [edges, hiddenSignalTypesStr]);

  useEffect(() => {
    if (isDragging) return;
    if (nodeCount === 0 && edgeCount === 0) return;
    // Small delay to let React Flow measure handles after changes
    const timer = setTimeout(() => {
      useSchematicStore.getState().recomputeRoutes(rfInstance);
    }, 50);
    return () => clearTimeout(timer);
  }, [isDragging, nodeDigest, edgeDigest, nodeCount, edgeCount, rfInstance, hiddenSignalTypesStr]);

  // Recompute cable ID map when edges/nodes/naming change
  const cableNamingScheme = useSchematicStore((s) => s.cableNamingScheme);
  const cableIdDigest = useSchematicStore((s) =>
    s.edges.map((e) => `${e.id}:${e.data?.signalType ?? ""}:${e.data?.cableId ?? ""}`).join("|"),
  );
  const labelDigest = useSchematicStore((s) =>
    s.nodes.filter((n) => n.type === "device").map((n) => `${n.id}:${(n.data as { label?: string }).label ?? ""}`).join("|"),
  );
  useEffect(() => {
    useSchematicStore.getState().recomputeCableIds();
  }, [cableIdDigest, labelDigest, cableNamingScheme, nodeCount, edgeCount]);

  // Custom wheel handler for configurable scroll/zoom/pan (#19)
  useEffect(() => {
    // Find the React Flow viewport element
    const el = document.querySelector(".react-flow") as HTMLElement | null;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Don't interfere with scrolling inside overlays (dialogs, panels, etc.)
      const target = e.target as HTMLElement;
      if (target.closest("[data-allow-scroll]")) return;

      e.preventDefault();
      e.stopPropagation();

      const cfg = useSchematicStore.getState().scrollConfig;

      // Detect trackpad from gesture evidence: any deltaX or synthetic ctrlKey (pinch)
      if (cfg.trackpadEnabled) {
        if (e.deltaX !== 0 || (e.ctrlKey && !ctrlHeldRef.current)) {
          trackpadActiveRef.current = true;
        }
        // Reset trackpad mode after gesture ends (no wheel events for 400ms)
        clearTimeout(trackpadTimerRef.current);
        trackpadTimerRef.current = setTimeout(() => { trackpadActiveRef.current = false; }, 400);
      }

      let vp: { x: number; y: number; zoom: number };
      try { vp = rfInstance.getViewport(); } catch { return; }

      // Trackpad pinch-to-zoom: browser synthesizes ctrlKey on pinch gestures.
      // If ctrlKey is set but the physical key isn't held, it's a pinch — always zoom.
      if (cfg.trackpadEnabled && e.ctrlKey && !ctrlHeldRef.current) {
        const factor = 1 - e.deltaY * 0.01 * cfg.zoomSpeed;
        const newZoom = Math.min(8, Math.max(0.05, vp.zoom * factor));
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const ratio = newZoom / vp.zoom;
        rfInstance.setViewport({
          x: sx - (sx - vp.x) * ratio,
          y: sy - (sy - vp.y) * ratio,
          zoom: newZoom,
        });
        return;
      }

      // Trackpad scroll: once trackpad mode is detected, pan both axes for all
      // unmodified events (including pure-vertical scrolls that lack deltaX).
      if (!e.ctrlKey && !e.shiftKey && trackpadActiveRef.current) {
        rfInstance.setViewport({
          x: vp.x - e.deltaX * cfg.panSpeed,
          y: vp.y - e.deltaY * cfg.panSpeed,
          zoom: vp.zoom,
        });
        return;
      }

      // Standard mouse wheel: use ScrollConfig
      const action = e.ctrlKey ? cfg.ctrlScroll : e.shiftKey ? cfg.shiftScroll : cfg.scroll;
      const delta = e.deltaY;

      if (action === "zoom") {
        const factor = 1 - delta * 0.001 * cfg.zoomSpeed;
        const newZoom = Math.min(8, Math.max(0.05, vp.zoom * factor));
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const ratio = newZoom / vp.zoom;
        rfInstance.setViewport({
          x: sx - (sx - vp.x) * ratio,
          y: sy - (sy - vp.y) * ratio,
          zoom: newZoom,
        });
      } else if (action === "pan-x") {
        rfInstance.setViewport({ x: vp.x - delta * cfg.panSpeed, y: vp.y, zoom: vp.zoom });
      } else {
        rfInstance.setViewport({ x: vp.x, y: vp.y - delta * cfg.panSpeed, zoom: vp.zoom });
      }
    };
    el.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", handler, { capture: true });
      clearTimeout(trackpadTimerRef.current);
    };
  }, [rfInstance]);

  // Click-to-connect: show preview line between first click and mouse
  const clearClickConnect = useCallback(() => {
    clickConnectFromRef.current = null;
    clickConnectCleanupRef.current?.();
    clickConnectCleanupRef.current = null;
    isClickConnectMode.current = false;
    setConnectPreview(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") { ctrlHeldRef.current = true; }

      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        clearClickConnect();
        setQuickAddPos(null);
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        removeSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        copySelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        useSchematicStore.getState().toggleDebugEdges();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("easyschematic:save"));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("easyschematic:open"));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        useSchematicStore.getState().selectAll();
      } else if (e.key === "F9") {
        e.preventDefault();
        const s = useSchematicStore.getState();
        s.setPrintView(!s.printView);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") { ctrlHeldRef.current = false; }
      if (e.key === " ") setSpaceHeld(false);
    };
    const handleBlur = () => { ctrlHeldRef.current = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [removeSelected, copySelected, pasteClipboard, undo, redo, clearClickConnect]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      // Handle note drops
      const noteData = event.dataTransfer.getData("application/easyschematic-note");
      if (noteData) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addNote(position);
        return;
      }

      // Handle room drops
      const roomData = event.dataTransfer.getData("application/easyschematic-room");
      if (roomData) {
        const { label } = JSON.parse(roomData) as { label: string };
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addRoom(label, position);
        return;
      }

      // Handle device drops
      const raw = event.dataTransfer.getData("application/easyschematic-device");
      if (!raw) return;

      const template = JSON.parse(raw) as DeviceTemplate;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addDevice(template, position);

      // After adding, check if dropped onto a room
      // Use setTimeout so the node exists in the store first
      setTimeout(() => {
        const state = useSchematicStore.getState();
        const lastDevice = state.nodes.filter((n) => n.type === "device").at(-1);
        if (lastDevice) {
          reparentNode(lastDevice.id, position);
        }
      }, 0);
    },
    [screenToFlowPosition, addDevice, addRoom, addNote, reparentNode],
  );

  // Reconnection via React Flow's reconnection path (connected handle drags)
  const onReconnectStart = useCallback((_event: React.MouseEvent, edge: Edge) => {
    reconnectingRef.current = true;
    setReconnectingEdgeId(edge.id);
    pushSnapshot();
  }, [pushSnapshot]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectingRef.current = false;
      const state = useSchematicStore.getState();
      const updated = reconnectEdge(oldEdge, newConnection, state.edges);
      useSchematicStore.setState({ edges: updated as typeof state.edges });
      useSchematicStore.getState().saveToLocalStorage();
    },
    [],
  );

  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      setReconnectingEdgeId(null);
      // If the edge wasn't reconnected, delete it (disconnect)
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        const state = useSchematicStore.getState();
        useSchematicStore.setState({
          edges: state.edges.filter((e) => e.id !== edge.id),
        });
        useSchematicStore.getState().saveToLocalStorage();
      }
    },
    [],
  );

  // Shared helper: start preview line tracking from a handle
  const startPreviewTracking = useCallback(
    (event: MouseEvent | TouchEvent, nodeId: string, handleId: string | null, handleType: string) => {
      const fromSource = handleType === "source";

      // Get exact handle position from React Flow internals (flow space)
      const internal = rfInstance.getInternalNode(nodeId);
      const bounds = internal?.internals.handleBounds;
      const handleList = fromSource ? bounds?.source : bounds?.target;
      const handle = handleList?.find((h) => h.id === handleId);
      let pos: { x: number; y: number };
      if (internal && handle) {
        pos = {
          x: internal.internals.positionAbsolute.x + handle.x + handle.width / 2,
          y: internal.internals.positionAbsolute.y + handle.y + handle.height / 2,
        };
      } else {
        const el = event.target as HTMLElement;
        const rect = el.getBoundingClientRect();
        pos = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
      clickConnectFromRef.current = { ...pos, fromSource, nodeId, handleId };

      // Convert screen mouse coords to flow space using the ReactFlow container's position
      const containerRect = document.querySelector('.react-flow')?.getBoundingClientRect();
      const toFlowCoords = (clientX: number, clientY: number) => {
        const rx = clientX - (containerRect?.left ?? 0);
        const ry = clientY - (containerRect?.top ?? 0);
        const { x: vpx, y: vpy, zoom: vpz } = rfInstance.getViewport();
        return { x: (rx - vpx) / vpz, y: (ry - vpy) / vpz };
      };

      // Show preview immediately
      const clientX = "clientX" in event ? event.clientX : event.touches[0].clientX;
      const clientY = "clientY" in event ? event.clientY : event.touches[0].clientY;
      const mouseFlow = toFlowCoords(clientX, clientY);
      setConnectPreview({
        fromX: pos.x, fromY: pos.y,
        toX: mouseFlow.x, toY: mouseFlow.y,
        fromSource, snapped: false, valid: true,
      });

      // Snap detection
      const from = { ...pos, fromSource };
      const SNAP_RADIUS = 30;
      const sourceNodeId = nodeId;
      const sourceHandleId = handleId;

      const findSnapTarget = (mouseX: number, mouseY: number) => {
        const state = useSchematicStore.getState();
        const targetType = fromSource ? "target" : "source";
        let best: { x: number; y: number; dist: number; nodeId: string; handleId: string } | null = null;

        for (const node of state.nodes) {
          if (node.type !== "device") continue;
          const intNode = rfInstance.getInternalNode(node.id);
          if (!intNode) continue;
          const hBounds = intNode.internals.handleBounds;
          const handles = targetType === "target" ? hBounds?.target : hBounds?.source;
          if (!handles) continue;
          const absX = intNode.internals.positionAbsolute.x;
          const absY = intNode.internals.positionAbsolute.y;

          for (const h of handles) {
            if (!h.id) continue;
            if (node.id === sourceNodeId && h.id === sourceHandleId) continue;
            const hx = absX + h.x + h.width / 2;
            const hy = absY + h.y + h.height / 2;
            const dx = hx - mouseX;
            const dy = hy - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < SNAP_RADIUS && (!best || dist < best.dist)) {
              best = { x: hx, y: hy, dist, nodeId: node.id, handleId: h.id };
            }
          }
        }
        if (!best) return null;

        const connection = fromSource
          ? { source: sourceNodeId, sourceHandle: sourceHandleId, target: best.nodeId, targetHandle: best.handleId }
          : { source: best.nodeId, sourceHandle: best.handleId, target: sourceNodeId, targetHandle: sourceHandleId };
        const valid = useSchematicStore.getState().isValidConnection(connection as Connection);
        return { x: best.x, y: best.y, valid };
      };

      const onMove = (e: MouseEvent) => {
        const mouse = toFlowCoords(e.clientX, e.clientY);
        const snap = findSnapTarget(mouse.x, mouse.y);
        setConnectPreview({
          fromX: from.x, fromY: from.y,
          toX: snap ? snap.x : mouse.x, toY: snap ? snap.y : mouse.y,
          fromSource: from.fromSource,
          snapped: !!snap,
          valid: snap ? snap.valid : true,
        });
      };
      window.addEventListener("mousemove", onMove);
      clickConnectCleanupRef.current = () => {
        window.removeEventListener("mousemove", onMove);
      };
    },
    [rfInstance, screenToFlowPosition],
  );

  // Click-to-connect: first click on a handle
  const onClickConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
      if (!params.nodeId || !params.handleType) return;
      isClickConnectMode.current = true;
      startPreviewTracking(event, params.nodeId, params.handleId, params.handleType);
    },
    [startPreviewTracking],
  );

  // Click-to-connect: second click completes or cancels
  const onClickConnectEnd = useCallback(
    (_event?: MouseEvent | TouchEvent) => {
      clearClickConnect();
    },
    [clearClickConnect],
  );

  // Drag-to-connect: show preview on drag start
  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: "source" | "target" | null }) => {
      if (!params.nodeId || !params.handleType) return;
      startPreviewTracking(event, params.nodeId, params.handleId, params.handleType);
    },
    [startPreviewTracking],
  );

  // Drag-to-connect: clear preview on drag end (but not if in click-connect mode)
  // Also detect drops on incompatible handles → show adapter dialog
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (!isClickConnectMode.current) {
      // Before clearing, check if user dropped on an incompatible handle
      const from = clickConnectFromRef.current;
      if (from) {
        const clientX = "clientX" in event ? event.clientX : event.changedTouches?.[0]?.clientX;
        const clientY = "clientY" in event ? event.clientY : event.changedTouches?.[0]?.clientY;
        if (clientX !== undefined && clientY !== undefined) {
          const el = document.elementFromPoint(clientX, clientY);
          const handleEl = el?.closest(".react-flow__handle") as HTMLElement | null;
          if (handleEl) {
            const targetNodeEl = handleEl.closest(".react-flow__node");
            const targetNodeId = targetNodeEl?.getAttribute("data-id");
            const targetHandleId = handleEl.getAttribute("data-handleid");
            if (targetNodeId && targetHandleId && targetNodeId !== from.nodeId) {
              const connection = from.fromSource
                ? { source: from.nodeId, sourceHandle: from.handleId, target: targetNodeId, targetHandle: targetHandleId }
                : { source: targetNodeId, sourceHandle: targetHandleId, target: from.nodeId, targetHandle: from.handleId };
              const state = useSchematicStore.getState();
              if (!state.isValidConnection(connection as Connection)) {
                // Trigger the signal-type mismatch check in onConnect
                state.onConnect(connection as Connection);
              }
            }
          }
        }
      }
      clearClickConnect();
    }
  }, [clearClickConnect]);

  // Clicking empty space cancels click-to-connect; double-click opens quick-add
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (isClickConnectMode.current) {
        clearClickConnect();
        rfStore.setState({ connectionClickStartHandle: null });
        return;
      }

      // Double-click detection
      const now = Date.now();
      const last = lastPaneClickRef.current;
      if (
        now - last.time < 400 &&
        Math.abs(event.clientX - last.x) < 10 &&
        Math.abs(event.clientY - last.y) < 10
      ) {
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setQuickAddPos(pos);
        lastPaneClickRef.current = { time: 0, x: 0, y: 0 };
        return;
      }
      lastPaneClickRef.current = { time: now, x: event.clientX, y: event.clientY };
    },
    [clearClickConnect, rfStore, screenToFlowPosition],
  );

  const onNodeDragStart = useCallback(() => {
    pushSnapshot();
    useSchematicStore.setState({ isDragging: true });
  }, [pushSnapshot]);

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      const state = useSchematicStore.getState();
      const snap = computeSnap(draggedNode as SchematicNode, state.nodes);
      setSnapGuides(snap.guides);

      // Apply snapped position if it differs
      if (snap.x !== draggedNode.position.x || snap.y !== draggedNode.position.y) {
        const updated = state.nodes.map((n) =>
          n.id === draggedNode.id ? { ...n, position: { x: snap.x, y: snap.y } } : n,
        );
        useSchematicStore.setState({ nodes: updated as SchematicNode[] });
      }
    },
    [],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      setSnapGuides([]);

      // Apply final snap so the node lands on the aligned position
      const state = useSchematicStore.getState();
      const snap = computeSnap(draggedNode as SchematicNode, state.nodes);
      let finalX = snap.x;
      let finalY = snap.y;

      // Enforce minimum spacing so stubs don't land inside neighbor obstacle rects
      const snappedNode = { ...draggedNode, position: { x: finalX, y: finalY } } as SchematicNode;
      const spacing = enforceMinSpacing(snappedNode, state.nodes);
      if (spacing) {
        finalX = spacing.x;
        finalY = spacing.y;
      }

      if (finalX !== draggedNode.position.x || finalY !== draggedNode.position.y) {
        const updated = state.nodes.map((n) =>
          n.id === draggedNode.id ? { ...n, position: { x: finalX, y: finalY } } : n,
        );
        useSchematicStore.setState({ nodes: updated as SchematicNode[], isDragging: false });
      } else {
        useSchematicStore.setState({ isDragging: false });
      }

      if (draggedNode.type === "room") return;
      // Compute absolute position for reparenting check
      let absX = finalX;
      let absY = finalY;
      if (draggedNode.parentId) {
        const parent = state.nodes.find((n) => n.id === draggedNode.parentId);
        if (parent) {
          absX += parent.position.x;
          absY += parent.position.y;
        }
      }
      reparentNode(draggedNode.id, { x: absX, y: absY });
    },
    [reparentNode],
  );

  // Dynamic minZoom: allow zooming out just enough to see all nodes, with padding
  const minZoom = useMemo(() => {
    if (nodes.length === 0) return 0.1;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const n of nodes) {
      const w = n.measured?.width ?? 180;
      const h = n.measured?.height ?? 60;
      left = Math.min(left, n.position.x);
      top = Math.min(top, n.position.y);
      right = Math.max(right, n.position.x + w);
      bottom = Math.max(bottom, n.position.y + h);
    }
    const pad = 100;
    const contentW = right - left + pad * 2;
    const contentH = bottom - top + pad * 2;
    // Use window size as viewport approximation
    const zoomX = window.innerWidth / contentW;
    const zoomY = window.innerHeight / contentH;
    return Math.max(0.05, Math.min(zoomX, zoomY) * 0.9);
  }, [nodes]);

  return (
    <>
    <ReactFlow
      nodes={nodes}
      edges={visibleEdges}
      onNodesChange={onNodesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onEdgesChange={onEdgesChange}
      onConnect={(connection) => {
        onConnect(connection);
        clearClickConnect();
      }}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      onClickConnectStart={onClickConnectStart}
      onClickConnectEnd={onClickConnectEnd}
      onPaneClick={onPaneClick}
      onNodeClick={(event, node) => {
        if (!isClickConnectMode.current) return;
        // If clicking a handle, let the normal click-connect flow handle it
        const target = event.target as HTMLElement;
        if (target.closest('.react-flow__handle')) return;

        const from = clickConnectFromRef.current;
        if (!from || node.type !== 'device') {
          onPaneClick(event);
          return;
        }

        // Find first available compatible handle on the clicked device
        const state = useSchematicStore.getState();
        const intNode = rfInstance.getInternalNode(node.id);
        const hBounds = intNode?.internals.handleBounds;
        const targetHandles = from.fromSource ? hBounds?.target : hBounds?.source;

        let connected = false;
        for (const h of targetHandles ?? []) {
          if (!h.id) continue;
          const connection = from.fromSource
            ? { source: from.nodeId, sourceHandle: from.handleId, target: node.id, targetHandle: h.id }
            : { source: node.id, sourceHandle: h.id, target: from.nodeId, targetHandle: from.handleId };
          if (state.isValidConnection(connection as Connection)) {
            onConnect(connection as Connection);
            connected = true;
            break;
          }
        }

        if (!connected) {
          // No compatible handle — try triggering incompatible dialog on first signal-type mismatch
          for (const h of targetHandles ?? []) {
            if (!h.id) continue;
            const conn = from.fromSource
              ? { source: from.nodeId, sourceHandle: from.handleId, target: node.id, targetHandle: h.id }
              : { source: node.id, sourceHandle: h.id, target: from.nodeId, targetHandle: from.handleId };
            // onConnect will detect signal-type mismatch and show dialog
            state.onConnect(conn as Connection);
            if (useSchematicStore.getState().pendingIncompatibleConnection) break;
          }
        }

        clearClickConnect();
        rfStore.setState({ connectionClickStartHandle: null });
      }}
      onNodeDoubleClick={(event, node) => {
        if (node.type !== "room") return;
        // If double-click landed on the label, let the label's own handler deal with it
        const target = event.target as HTMLElement;
        if (target.closest("span, input")) return;
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setQuickAddPos(pos);
      }}
      onNodeContextMenu={(event, node) => {
        if (node.type !== "room") return;
        event.preventDefault();
        useSchematicStore.setState({
          roomContextMenu: { nodeId: node.id, screenX: event.clientX, screenY: event.clientY },
        });
      }}
      onReconnectStart={onReconnectStart}
      onReconnect={onReconnect}
      onReconnectEnd={onReconnectEnd}
      isValidConnection={isValidConnection as never}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onDragOver={onDragOver}
      onDrop={onDrop}
      selectionOnDrag={isMobile ? false : !spaceHeld}
      panOnDrag={isMobile ? [0] : (spaceHeld ? [0] : [1])}
      fitView
      minZoom={minZoom}
      elevateNodesOnSelect={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode="Shift"
      proOptions={{ hideAttribution: true }}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      connectOnClick
      edgesReconnectable
      reconnectRadius={25}
      defaultEdgeOptions={{ type: "smoothstep" }}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionLineStyle={{ opacity: 0 }}
      snapToGrid
      snapGrid={[GRID_SIZE, GRID_SIZE]}
      nodeExtent={printView ? [[0, 0], [Infinity, Infinity]] : undefined}
      onEdgeContextMenu={(event, edge) => {
        event.preventDefault();
        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        useSchematicStore.setState({
          edgeContextMenu: {
            edgeId: edge.id,
            screenX: event.clientX,
            screenY: event.clientY,
            flowX: flowPos.x,
            flowY: flowPos.y,
          },
        });
      }}
    >
      <ResizeSnapGuides dragGuides={snapGuides} />
      {printView && <PageBoundaryOverlay />}
      {connectPreview && (() => {
        const { fromX, fromY, toX, toY, fromSource, snapped, valid } = connectPreview;
        const dx = Math.abs(toX - fromX);
        const ctrl = Math.max(dx * 0.5, 50);
        const c1x = fromSource ? fromX + ctrl : fromX - ctrl;
        const c2x = fromSource ? toX - ctrl : toX + ctrl;
        const d = `M ${fromX} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${toX} ${toY}`;
        const color = snapped ? (valid ? "#22c55e" : "#ef4444") : "#b1b1b7";
        return (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1000 }}>
            <svg style={{
              position: "absolute", overflow: "visible", width: 1, height: 1,
              transform: `translate(${vx}px, ${vy}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}>
              <path d={d} stroke={color} strokeWidth={2 / zoom} fill="none" />
              {snapped && (
                <circle cx={toX} cy={toY} r={4 / zoom} fill={color} opacity={0.6} />
              )}
            </svg>
          </div>
        );
      })()}
      {debugEdges && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex gap-2">
          <button
            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded shadow-lg hover:bg-blue-700 font-mono"
            onClick={() => {
              const report = (window as unknown as Record<string, unknown>).__routingReport;
              if (report) {
                navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
                  console.log("📋 Routing report copied to clipboard");
                });
              } else {
                console.log("No routing report — move a node to trigger routing");
              }
            }}
          >
            📋 Copy Routing Report
          </button>
        </div>
      )}
      {!printView && <CanvasOriginOverlay />}
      <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#d4d4d4" />
      <Controls position="bottom-right" />
      <MiniMap
        position="bottom-left"
        pannable
        zoomable
        nodeColor={(node) => node.type === "room" ? "#e5e7eb" : "#3b82f6"}
      />
    </ReactFlow>
    {quickAddPos && (
      <QuickAddDevice
        position={quickAddPos}
        onClose={() => setQuickAddPos(null)}
        onOpenRouterCreator={() => { routerCreatorPosRef.current = quickAddPos ?? undefined; setShowRouterCreator(true); }}
      />
    )}
    {/* eslint-disable-next-line react-hooks/refs -- ref read is intentional; value is set before render */}
    {showRouterCreator && <RouterCreator position={routerCreatorPosRef.current} onClose={() => { setShowRouterCreator(false); routerCreatorPosRef.current = undefined; }} />}
    </>
  );
}

function PrintTitleBlock() {
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const showLine = [titleBlock.company, titleBlock.showName, titleBlock.venue].filter(Boolean).join(" — ");

  return (
    <div className="print-title-block hidden justify-between items-end px-4 py-2 border-b-[3px] border-double border-gray-800">
      <div>
        <div className="text-lg font-bold text-gray-900">{titleBlock.drawingTitle || titleBlock.showName || "Untitled"}</div>
        {showLine && <div className="text-xs text-gray-500">{showLine}</div>}
      </div>
      <div className="text-[10px] text-gray-400 text-right leading-relaxed">
        <div>{titleBlock.designer && `Designer: ${titleBlock.designer}`}</div>
        <div>{titleBlock.date || today}</div>
        <div>EasySchematic</div>
      </div>
    </div>
  );
}

function DemoBanner() {
  const isDemo = useSchematicStore((s) => s.isDemo);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("easyschematic-demo-dismissed") === "1",
  );

  if (!isDemo || dismissed) return null;

  return (
    <div className="bg-slate-700 text-slate-200 text-sm px-4 py-2 flex items-center justify-between gap-4" data-print-hide>
      <span>
        You&apos;re viewing a demo schematic. Start fresh with{" "}
        <strong>File &gt; New</strong>, or explore to see what EasySchematic can do.
      </span>
      <button
        className="text-slate-400 hover:text-white shrink-0"
        onClick={() => {
          setDismissed(true);
          localStorage.setItem("easyschematic-demo-dismissed", "1");
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function App() {
  const printView = useSchematicStore((s) => s.printView);

  // Handle /s/{token} URLs for shared schematics
  useEffect(() => {
    const match = window.location.pathname.match(/^\/s\/([a-f0-9-]+)$/);
    if (match) {
      loadSharedSchematic(match[1]).then((data) => {
        useSchematicStore.getState().importFromJSON(data as SchematicFile);
        window.history.replaceState(null, "", "/");
      }).catch(() => {
        // Invalid or expired share link — just load normally
        window.history.replaceState(null, "", "/");
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div data-print-hide>
        <MenuBar />
      </div>
      <DemoBanner />
      <PendingSubmissionBanner />
      {printView && <PrintViewBar />}
      <PrintTitleBlock />
      <div className="flex flex-1 overflow-hidden">
        <div data-print-hide data-mobile-hide>
          <DeviceLibrary />
        </div>
        <div className="flex-1">
          <SchematicCanvas />
        </div>
        <div data-print-hide className="hidden md:flex">
          <ViewOptionsPanel />
          <ShowInfoPanel />
          <SignalColorPanel />
        </div>
      </div>
      <DeviceEditor />
      <RoomEditor />
      <EdgeContextMenu />
      <RoomContextMenu />
      <IncompatibleConnectionDialog />
      <MobileGate />
    </div>
  );
}
