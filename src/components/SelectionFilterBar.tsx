import { useState, useMemo } from "react";
import { useSchematicStore } from "../store";
import type { SchematicNode, ConnectionEdge, DeviceNode } from "../types";
import BulkConnectionEditPanel from "./BulkConnectionEditPanel";
import BulkDeviceEditPanel from "./BulkDeviceEditPanel";

type EntityKind = "device" | "room" | "stub-label" | "note" | "annotation" | "waypoint" | "edge";

const KIND_LABELS: Record<EntityKind, { singular: string; plural: string }> = {
  device: { singular: "device", plural: "devices" },
  room: { singular: "room", plural: "rooms" },
  "stub-label": { singular: "stub", plural: "stubs" },
  note: { singular: "note", plural: "notes" },
  annotation: { singular: "annotation", plural: "annotations" },
  waypoint: { singular: "waypoint", plural: "waypoints" },
  edge: { singular: "connection", plural: "connections" },
};

const KIND_ORDER: EntityKind[] = ["device", "room", "edge", "waypoint", "stub-label", "note", "annotation"];

function classifyNode(n: SchematicNode): EntityKind | null {
  switch (n.type) {
    case "device": return "device";
    case "room": return "room";
    case "stub-label": return "stub-label";
    case "note": return "note";
    case "annotation": return "annotation";
    case "waypoint": return "waypoint";
    default: return null;
  }
}

export default function SelectionFilterBar() {
  // Serialize selection into a stable string so the selector minimizes re-renders
  const selectionKey = useSchematicStore((s) => {
    let nodeBits = "";
    for (const n of s.nodes) if (n.selected) nodeBits += `${n.id}:${n.type};`;
    let edgeBits = "";
    for (const e of s.edges) if (e.selected) edgeBits += `${e.id};`;
    return `${nodeBits}|${edgeBits}`;
  });

  const counts = useMemo(() => {
    const out: Partial<Record<EntityKind, number>> = {};
    const state = useSchematicStore.getState();
    for (const n of state.nodes) {
      if (!n.selected) continue;
      const k = classifyNode(n);
      if (!k) continue;
      out[k] = (out[k] ?? 0) + 1;
    }
    let edgeCount = 0;
    for (const e of state.edges) if (e.selected) edgeCount++;
    if (edgeCount > 0) out.edge = edgeCount;
    return out;
    // selectionKey is the invalidation signal for this getState() snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  const edgeCount = counts.edge ?? 0;
  const presentKinds = KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0);
  const totalSelected = presentKinds.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  const selectedDevices = useSchematicStore.getState().nodes
    .filter((node): node is DeviceNode => !!node.selected && node.type === "device");
  const multiDeviceSelection = selectedDevices.length >= 2;
  const edgeOnlySelection = edgeCount >= 2 && totalSelected === edgeCount;

  const [connectionPanelOpen, setConnectionPanelOpen] = useState(false);
  const [devicePanelOpen, setDevicePanelOpen] = useState(false);

  // Show bar whenever 2+ entities are selected, or the edit panel is pinned open
  if (totalSelected < 2 && !connectionPanelOpen && !devicePanelOpen) return null;

  const apply = (kind: EntityKind, mode: "deselect" | "solo") => {
    const state = useSchematicStore.getState();
    const matchesNode = (n: SchematicNode) => classifyNode(n) === kind;
    const matchesEdge = (_e: ConnectionEdge) => kind === "edge";

    const newNodes = state.nodes.map((n) => {
      if (!n.selected) return n;
      const isMatch = matchesNode(n);
      const keep = mode === "deselect" ? !isMatch : isMatch;
      return keep ? n : { ...n, selected: false };
    });
    const newEdges = state.edges.map((e) => {
      if (!e.selected) return e;
      const isMatch = matchesEdge(e);
      const keep = mode === "deselect" ? !isMatch : isMatch;
      return keep ? e : { ...e, selected: false };
    });
    useSchematicStore.setState({ nodes: newNodes, edges: newEdges });
  };

  const clearAll = () => {
    const state = useSchematicStore.getState();
    useSchematicStore.setState({
      nodes: state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      edges: state.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    });
    setConnectionPanelOpen(false);
    setDevicePanelOpen(false);
  };

  return (
    <>
      {connectionPanelOpen && <BulkConnectionEditPanel onClose={() => setConnectionPanelOpen(false)} />}
      {devicePanelOpen && <BulkDeviceEditPanel onClose={() => setDevicePanelOpen(false)} />}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-1.5 px-2 py-1.5 bg-white border border-[var(--color-border)] rounded-lg shadow-lg"
        data-print-hide
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] px-1">
          {totalSelected} selected
        </span>
        {presentKinds.map((kind) => {
            const count = counts[kind] ?? 0;
            const labels = KIND_LABELS[kind];
            const label = count === 1 ? labels.singular : labels.plural;
            return (
              <button
                key={kind}
                title={`Click to keep only ${labels.plural}. ${navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}+click to deselect ${labels.plural}.`}
                className="px-2 py-0.5 text-[11px] rounded bg-[var(--color-surface-hover)] hover:bg-blue-50 hover:text-blue-700 border border-[var(--color-border)] transition-colors cursor-pointer"
                onClick={(e) => {
                  const deselect = e.metaKey || e.ctrlKey;
                  apply(kind, deselect ? "deselect" : "solo");
                }}
              >
                {count} {label}
              </button>
            );
          })}
        {(multiDeviceSelection || devicePanelOpen) && (
          <button
            title="Edit shared properties of selected devices"
            className={`px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer ${
              devicePanelOpen
                ? "bg-blue-600 text-white border-blue-600"
                : "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
            }`}
            onClick={() => {
              setDevicePanelOpen((v) => !v);
              setConnectionPanelOpen(false);
            }}
          >
            {selectedDevices.length >= 2 ? `Edit ${selectedDevices.length} devices…` : "Edit devices…"}
          </button>
        )}
        {(edgeOnlySelection || connectionPanelOpen) && (
          <button
            title="Edit properties of selected connections"
            className={`px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer ${
              connectionPanelOpen
                ? "bg-blue-600 text-white border-blue-600"
                : "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
            }`}
            onClick={() => {
              setConnectionPanelOpen((v) => !v);
              setDevicePanelOpen(false);
            }}
          >
            {edgeCount >= 2 ? `Edit ${edgeCount}…` : "Edit connections…"}
          </button>
        )}
        {totalSelected > 0 && (
          <button
            title="Clear selection (Esc)"
            className="px-2 py-0.5 text-[11px] rounded text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            onClick={clearAll}
          >
            ✕ Clear
          </button>
        )}
      </div>
    </>
  );
}
