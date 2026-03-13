import { memo, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { RoomNode as RoomNodeType } from "../types";
import { useSchematicStore } from "../store";

function RoomNodeComponent({ id, data, selected }: NodeProps<RoomNodeType>) {
  const updateRoomLabel = useSchematicStore((s) => s.updateRoomLabel);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.label);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== data.label) updateRoomLabel(id, trimmed);
    else setValue(data.label);
    setEditing(false);
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineStyle={{ borderColor: "var(--color-border)" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-border)" }}
      />
      <div
        className={`w-full h-full rounded-lg border-2 border-dashed ${
          selected ? "border-blue-400 bg-blue-50/30" : "border-[var(--color-border)] bg-[var(--color-surface)]/30"
        }`}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="absolute top-0 left-0 px-2 py-1"
          style={{ pointerEvents: "auto" }}
        >
          {editing ? (
            <input
              className="text-xs font-semibold text-[var(--color-text-muted)] bg-white border border-[var(--color-border)] rounded px-1 outline-none"
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
              className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide cursor-text select-none"
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
