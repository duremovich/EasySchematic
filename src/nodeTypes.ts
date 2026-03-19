import type { NodeTypes, EdgeTypes } from "@xyflow/react";
import DeviceNodeComponent from "./components/DeviceNode";
import RoomNodeComponent from "./components/RoomNode";
import NoteNodeComponent from "./components/NoteNode";
import AnnotationNodeComponent from "./components/AnnotationNode";
import OffsetEdgeComponent from "./components/OffsetEdge";

export const nodeTypes: NodeTypes = {
  device: DeviceNodeComponent,
  room: RoomNodeComponent,
  note: NoteNodeComponent,
  annotation: AnnotationNodeComponent,
};

export const edgeTypes: EdgeTypes = {
  smoothstep: OffsetEdgeComponent,
};
