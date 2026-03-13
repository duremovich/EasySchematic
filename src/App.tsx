import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
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
  type OnConnectStart,
} from "@xyflow/react";
import { useSchematicStore } from "./store";
import DeviceNodeComponent from "./components/DeviceNode";
import RoomNodeComponent from "./components/RoomNode";
import OffsetEdgeComponent from "./components/OffsetEdge";
import SnapGuides from "./components/SnapGuides";
import DeviceLibrary from "./components/DeviceLibrary";
import DeviceEditor from "./components/DeviceEditor";
import Toolbar from "./components/Toolbar";
import { computeSnap, type GuideLine } from "./snapUtils";
import type { ConnectionEdge, DeviceTemplate, SchematicNode } from "./types";

const nodeTypes: NodeTypes = {
  device: DeviceNodeComponent,
  room: RoomNodeComponent,
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
    removeSelected,
    copySelected,
    pasteClipboard,
    pushSnapshot,
    setPendingUndoSnapshot,
    clearPendingUndoSnapshot,
    reparentNode,
    undo,
    redo,
    loadFromLocalStorage,
  } = useSchematicStore();

  const { screenToFlowPosition } = useReactFlow();

  // Space-held state for pan-on-drag (Vectorworks-style)
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Edge reconnection state (edge-anchor based)
  const reconnectingRef = useRef(false);

  // Handle-based reconnection: tracks edge removed when dragging from a connected handle
  const disconnectedEdgeRef = useRef<ConnectionEdge | null>(null);

  // Snap guide lines shown during drag
  const [snapGuides, setSnapGuides] = useState<GuideLine[]>([]);

  // Load saved state on mount
  useEffect(() => {
    loadFromLocalStorage();
  }, [loadFromLocalStorage]);

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
    [screenToFlowPosition, addDevice, addRoom, reparentNode],
  );

  const onReconnectStart = useCallback(() => {
    reconnectingRef.current = true;
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
      // If the edge wasn't reconnected, delete it
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

  // When dragging from a connected handle, remove the old edge first
  const handleConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      if (!params.nodeId || !params.handleId) return;
      const state = useSchematicStore.getState();

      const existingEdge = state.edges.find((e) => {
        if (params.handleType === "source") {
          return e.source === params.nodeId && e.sourceHandle === params.handleId;
        }
        return e.target === params.nodeId && e.targetHandle === params.handleId;
      });

      if (existingEdge) {
        // Save pre-disconnect state so the next onConnect undo captures it
        setPendingUndoSnapshot();
        disconnectedEdgeRef.current = existingEdge;
        useSchematicStore.setState({
          edges: state.edges.filter((e) => e.id !== existingEdge.id),
        });
      } else {
        disconnectedEdgeRef.current = null;
      }
    },
    [setPendingUndoSnapshot],
  );

  const handleConnectEnd = useCallback(() => {
    if (!disconnectedEdgeRef.current) return;
    const state = useSchematicStore.getState();
    const old = disconnectedEdgeRef.current;

    // Check if onConnect created a new edge on the same handle
    const reconnected = state.edges.some(
      (e) =>
        (e.source === old.source && e.sourceHandle === old.sourceHandle && e.id !== old.id) ||
        (e.target === old.target && e.targetHandle === old.targetHandle && e.id !== old.id),
    );

    if (!reconnected) {
      // No new connection — restore the old edge
      useSchematicStore.setState({
        edges: [...state.edges, disconnectedEdgeRef.current],
      });
      clearPendingUndoSnapshot();
    }

    disconnectedEdgeRef.current = null;
  }, [clearPendingUndoSnapshot]);

  const onNodeDragStart = useCallback(() => {
    pushSnapshot();
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
      if (snap.x !== draggedNode.position.x || snap.y !== draggedNode.position.y) {
        const updated = state.nodes.map((n) =>
          n.id === draggedNode.id ? { ...n, position: { x: snap.x, y: snap.y } } : n,
        );
        useSchematicStore.setState({ nodes: updated as SchematicNode[] });
      }

      if (draggedNode.type === "room") return;
      // Compute absolute position for reparenting check
      let absX = snap.x;
      let absY = snap.y;
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
      onConnectStart={handleConnectStart}
      onConnectEnd={handleConnectEnd}
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
      elevateNodesOnSelect={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode="Shift"
      proOptions={{ hideAttribution: true }}
      edgesReconnectable
      reconnectRadius={20}
      defaultEdgeOptions={{ type: "smoothstep" }}
      connectionLineType={ConnectionLineType.SmoothStep}
    >
      <SnapGuides guides={snapGuides} />
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d4d4" />
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
