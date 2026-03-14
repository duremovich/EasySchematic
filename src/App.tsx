import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
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
import DeviceNodeComponent from "./components/DeviceNode";
import RoomNodeComponent from "./components/RoomNode";
import NoteNodeComponent from "./components/NoteNode";
import OffsetEdgeComponent from "./components/OffsetEdge";
import SnapGuides from "./components/SnapGuides";
import DeviceLibrary from "./components/DeviceLibrary";
import DeviceEditor from "./components/DeviceEditor";
import Toolbar from "./components/Toolbar";
import { computeSnap, enforceMinSpacing, type GuideLine } from "./snapUtils";
import type { DeviceTemplate, SchematicNode } from "./types";

const nodeTypes: NodeTypes = {
  device: DeviceNodeComponent,
  room: RoomNodeComponent,
  note: NoteNodeComponent,
};

const edgeTypes: EdgeTypes = {
  smoothstep: OffsetEdgeComponent,
};

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
  const nodeCount = useSchematicStore((s) => s.nodes.length);
  const edgeCount = useSchematicStore((s) => s.edges.length);
  // Digest of node positions + sizes to detect moves
  const nodeDigest = useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );
  // Digest of edge connectivity
  const edgeDigest = useSchematicStore((s) =>
    s.edges.map((e) => `${e.id}:${e.source}:${e.sourceHandle}:${e.target}:${e.targetHandle}`).join("|"),
  );

  useEffect(() => {
    if (isDragging) return;
    if (nodeCount === 0 && edgeCount === 0) return;
    // Small delay to let React Flow measure handles after changes
    const timer = setTimeout(() => {
      useSchematicStore.getState().recomputeRoutes(rfInstance);
    }, 50);
    return () => clearTimeout(timer);
  }, [isDragging, nodeDigest, edgeDigest, nodeCount, edgeCount, rfInstance]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        clearClickConnect();
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
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [removeSelected, copySelected, pasteClipboard, undo, redo]);

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

  // Click-to-connect: show preview line between first click and mouse
  const clearClickConnect = useCallback(() => {
    clickConnectFromRef.current = null;
    clickConnectCleanupRef.current?.();
    clickConnectCleanupRef.current = null;
    isClickConnectMode.current = false;
    setConnectPreview(null);
  }, []);

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
  const onConnectEnd = useCallback(() => {
    if (!isClickConnectMode.current) {
      clearClickConnect();
    }
  }, [clearClickConnect]);

  // Clicking empty space cancels click-to-connect
  const onPaneClick = useCallback(() => {
    if (isClickConnectMode.current) {
      clearClickConnect();
      // Also clear React Flow's internal click-connect state
      rfStore.setState({ connectionClickStartHandle: null });
    }
  }, [clearClickConnect, rfStore]);

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
    <ReactFlow
      nodes={nodes}
      edges={edges}
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
          onPaneClick();
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

        clearClickConnect();
        rfStore.setState({ connectionClickStartHandle: null });
        if (!connected) {
          // No valid handle found — just cancel silently
        }
      }}
      onReconnectStart={onReconnectStart}
      onReconnect={onReconnect}
      onReconnectEnd={onReconnectEnd}
      isValidConnection={isValidConnection as never}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onDragOver={onDragOver}
      onDrop={onDrop}
      selectionOnDrag={!spaceHeld}
      panOnDrag={spaceHeld ? [0] : [1]}
      fitView
      minZoom={minZoom}
      elevateNodesOnSelect={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode="Shift"
      proOptions={{ hideAttribution: true }}
      connectOnClick
      edgesReconnectable
      reconnectRadius={25}
      defaultEdgeOptions={{ type: "smoothstep" }}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionLineStyle={{ opacity: 0 }}
      snapToGrid
      snapGrid={[GRID_SIZE, GRID_SIZE]}
    >
      <SnapGuides guides={snapGuides} />
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
      <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#d4d4d4" />
      <Controls position="bottom-right" />
      <MiniMap
        position="bottom-left"
        pannable
        zoomable
        nodeColor={(node) => node.type === "room" ? "#e5e7eb" : "#3b82f6"}
      />
    </ReactFlow>
  );
}

function PrintTitleBlock() {
  const schematicName = useSchematicStore((s) => s.schematicName);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="print-title-block hidden justify-between items-end px-4 py-2 border-b-[3px] border-double border-gray-800">
      <div>
        <div className="text-lg font-bold text-gray-900">{schematicName}</div>
        <div className="text-xs text-gray-500">AV Signal Flow Diagram</div>
      </div>
      <div className="text-[10px] text-gray-400 text-right leading-relaxed">
        <div>{today}</div>
        <div>EasySchematic</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="flex flex-col h-full">
      <div data-print-hide>
        <Toolbar />
      </div>
      <PrintTitleBlock />
      <div className="flex flex-1 overflow-hidden">
        <div data-print-hide>
          <DeviceLibrary />
        </div>
        <div className="flex-1">
          <SchematicCanvas />
        </div>
      </div>
      <DeviceEditor />
    </div>
  );
}
