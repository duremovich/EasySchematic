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
import type { ConnectionEdge, DeviceTemplate, SchematicNode } from "./types";

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
  const { screenToFlowPosition } = rfInstance;

  // Space-held state for pan-on-drag (Vectorworks-style)
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Edge reconnection state (React Flow's reconnection path)
  const reconnectingRef = useRef(false);

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
      onConnect={onConnect}
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
      edgesReconnectable
      reconnectRadius={25}
      defaultEdgeOptions={{ type: "smoothstep" }}
      connectionLineType={ConnectionLineType.SmoothStep}
      snapToGrid
      snapGrid={[GRID_SIZE, GRID_SIZE]}
    >
      <SnapGuides guides={snapGuides} />
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
