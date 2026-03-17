import { memo, useState, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { RoomNode as RoomNodeType, SchematicNode } from "../types";
import { useSchematicStore, GRID_SIZE } from "../store";
import { computeResizeSnap } from "../snapUtils";

function RoomNodeComponent({ id, data, selected }: NodeProps<RoomNodeType>) {
  const updateRoomLabel = useSchematicStore((s) => s.updateRoomLabel);
  const setResizeGuides = useSchematicStore((s) => s.setResizeGuides);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.label);

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
  }, [setResizeGuides]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== data.label) updateRoomLabel(id, trimmed);
    else setValue(data.label);
    setEditing(false);
  };

  const borderStyleVal = data.borderStyle ?? "dashed";
  const borderColorVal = selected ? undefined : data.borderColor;
  const bgColor = data.color;
  const fontSize = data.labelSize ?? 12;

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
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
          ...(!selected ? { borderColor: borderColorVal || "var(--color-border)" } : {}),
          backgroundColor: bgColor ? `${bgColor}1a` : selected ? "rgba(239,246,255,0.3)" : "rgba(var(--color-surface-rgb, 245,245,245),0.3)",
        }}
      >
        <div
          className="absolute top-0 left-0 px-2 py-1"
          style={{ pointerEvents: "auto" }}
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
              className="font-semibold uppercase tracking-wide cursor-text select-none"
              style={{ fontSize, color: borderColorVal || "var(--color-text-muted)" }}
              onDoubleClick={() => { setValue(data.label); setEditing(true); }}
            >
              {data.label}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(RoomNodeComponent);
