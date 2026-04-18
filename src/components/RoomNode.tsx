import { memo, useState, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { RoomNode as RoomNodeType, SchematicNode } from "../types";
import { useSchematicStore } from "../store";
import { computeResizeSnap } from "../snapUtils";

function RackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="5" rx="1" />
      <rect x="2" y="9" width="20" height="5" rx="1" />
      <rect x="2" y="16" width="20" height="5" rx="1" />
      <line x1="6" y1="4.5" x2="6" y2="4.5" strokeWidth="3" />
      <line x1="6" y1="11.5" x2="6" y2="11.5" strokeWidth="3" />
      <line x1="6" y1="18.5" x2="6" y2="18.5" strokeWidth="3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function RoomNodeComponent({ id, data, selected }: NodeProps<RoomNodeType>) {
  const updateRoomLabel = useSchematicStore((s) => s.updateRoomLabel);
  const toggleRoomLock = useSchematicStore((s) => s.toggleRoomLock);
  const setResizeGuides = useSchematicStore((s) => s.setResizeGuides);
  const onRoomResizeEnd = useSchematicStore((s) => s.onRoomResizeEnd);
  const isSubroom = useSchematicStore((s) => !!s.nodes.find((n) => n.id === id)?.parentId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.label);

  const locked = data.locked ?? false;

  const handleResize = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number; direction: number[] }) => {
      const state = useSchematicStore.getState();
      const snap = computeResizeSnap(id, params, params.direction, state.nodes as SchematicNode[]);
      setResizeGuides(snap.guides);

      // If snap adjusted the position/size, override what React Flow set
      if (snap.x !== params.x || snap.y !== params.y || snap.width !== params.width || snap.height !== params.height) {
        const updated = state.nodes.map((n) =>
          n.id === id
            ? { ...n, position: { x: snap.x, y: snap.y }, style: { ...n.style, width: snap.width, height: snap.height } }
            : n,
        );
        useSchematicStore.setState({ nodes: updated as SchematicNode[] });
      }
    },
    [id, setResizeGuides],
  );

  const handleResizeEnd = useCallback(() => {
    setResizeGuides([]);
    onRoomResizeEnd(id);
  }, [id, setResizeGuides, onRoomResizeEnd]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== data.label) updateRoomLabel(id, trimmed);
    else setValue(data.label);
    setEditing(false);
  };

  const isRack = data.isEquipmentRack ?? false;
  const borderStyleVal = isRack ? "solid" : (data.borderStyle ?? (isSubroom ? "solid" : "dashed"));
  const borderColorVal = selected ? undefined : data.borderColor;
  const bgColor = data.color;
  // Subrooms use a slightly more opaque background so they read as distinct zones
  const bgAlpha = isSubroom ? "33" : "1a"; // 20% vs 10% opacity
  const fontSize = data.labelSize ?? 12;

  return (
    <>
      <NodeResizer
        isVisible={selected && !locked}
        minWidth={200}
        minHeight={150}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
        lineStyle={{ borderColor: "var(--color-border)" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-border)" }}
      />
      <div
        className={`w-full h-full rounded-lg border-2 ${
          selected ? "border-blue-400" : ""
        }`}
        style={{
          pointerEvents: "none",
          borderStyle: borderStyleVal,
          ...(!selected ? { borderColor: borderColorVal || (isRack ? "#6b7280" : "var(--color-border)") } : {}),
          backgroundColor: bgColor
            ? `${bgColor}${bgAlpha}`
            : isRack
            ? "rgba(55,65,81,0.12)"
            : selected
            ? "rgba(239,246,255,0.3)"
            : "rgba(var(--color-surface-rgb, 245,245,245),0.3)",
        }}
      >
        <div
          className="absolute top-0 left-0 px-2 py-1"
          style={{ pointerEvents: "auto" }}
          onContextMenu={(e) => {
            if (!locked) return; // unlocked rooms use React Flow's onNodeContextMenu
            e.preventDefault();
            e.stopPropagation();
            useSchematicStore.setState({
              roomContextMenu: { nodeId: id, screenX: e.clientX, screenY: e.clientY },
            });
          }}
        >
          {editing ? (
            <input
              className="font-semibold text-[var(--color-text-muted)] bg-white border border-[var(--color-border)] rounded px-1 outline-none"
              style={{ fontSize }}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setValue(data.label); setEditing(false); }
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="font-semibold uppercase tracking-wide cursor-text select-none flex items-center gap-1"
              style={{ fontSize, color: borderColorVal || (isRack ? "#374151" : "var(--color-text-muted)") }}
              onDoubleClick={() => { setValue(data.label); setEditing(true); }}
            >
              {isRack && <RackIcon />}
              {data.label}
            </span>
          )}
        </div>
        {/* Lock toggle — top-right corner */}
        <div
          className="absolute top-0 right-0 px-1.5 py-1 transition-opacity"
          style={{
            pointerEvents: "auto",
            opacity: locked ? 1 : selected ? 0.6 : 0,
          }}
          onContextMenu={(e) => {
            if (!locked) return;
            e.preventDefault();
            e.stopPropagation();
            useSchematicStore.setState({
              roomContextMenu: { nodeId: id, screenX: e.clientX, screenY: e.clientY },
            });
          }}
        >
          <button
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleRoomLock(id);
            }}
            title={locked ? "Unlock room" : "Lock room"}
          >
            {locked ? <LockIcon /> : <UnlockIcon />}
          </button>
        </div>
      </div>
    </>
  );
}

export default memo(RoomNodeComponent);
