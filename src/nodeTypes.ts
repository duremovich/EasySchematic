import type { NodeTypes, EdgeTypes } from "@xyflow/react";
import DeviceNodeComponent from "./components/DeviceNode";
import RoomNodeComponent from "./components/RoomNode";
import NoteNodeComponent from "./components/NoteNode";
import OffsetEdgeComponent from "./components/OffsetEdge";

export const nodeTypes: NodeTypes = {
  device: DeviceNodeComponent,
  room: RoomNodeComponent,
  note: NoteNodeComponent,
};

export const edgeTypes: EdgeTypes = {
  smoothstep: OffsetEdgeComponent,
};
