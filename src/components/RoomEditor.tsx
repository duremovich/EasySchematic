import { useState, useCallback, useEffect } from "react";
import { useSchematicStore } from "../store";
import type { RoomData, RoomNode } from "../types";

const BORDER_STYLES: { value: RoomData["borderStyle"]; label: string }[] = [
  { value: "dashed", label: "Dashed" },
  { value: "solid", label: "Solid" },
  { value: "dotted", label: "Dotted" },
];

const LABEL_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24];

const PRESET_COLORS = [
  "", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

export default function RoomEditor() {
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const nodes = useSchematicStore((s) => s.nodes);
  const updateRoom = useSchematicStore((s) => s.updateRoom);
  const toggleRoomLock = useSchematicStore((s) => s.toggleRoomLock);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);

  const node = nodes.find((n) => n.id === editingNodeId && n.type === "room") as RoomNode | undefined;

  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [borderStyle, setBorderStyle] = useState<RoomData["borderStyle"]>("dashed");
  const [labelSize, setLabelSize] = useState(12);
  const [locked, setLocked] = useState(false);
  const [isEquipmentRack, setIsEquipmentRack] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing props to local editor state */
  useEffect(() => {
    if (!node) return;
    setLabel(node.data.label);
    setColor(node.data.color ?? "");
    setBorderColor(node.data.borderColor ?? "");
    setBorderStyle(node.data.borderStyle ?? "dashed");
    setLabelSize(node.data.labelSize ?? 12);
    setLocked(node.data.locked ?? false);
    setIsEquipmentRack(node.data.isEquipmentRack ?? false);
  }, [node]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const close = useCallback(() => setEditingNodeId(null), [setEditingNodeId]);

  const handleSave = useCallback(() => {
    if (!editingNodeId) return;
    const data: RoomData = {
      label: label.trim() || "Room",
      ...(color ? { color } : {}),
      ...(borderColor ? { borderColor } : {}),
      ...(borderStyle && borderStyle !== "dashed" ? { borderStyle } : {}),
      ...(labelSize !== 12 ? { labelSize } : {}),
      ...(isEquipmentRack ? { isEquipmentRack: true } : {}),
    };
    updateRoom(editingNodeId, data);
    close();
  }, [editingNodeId, label, color, borderColor, borderStyle, labelSize, updateRoom, close]);

  if (!editingNodeId || !node) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[360px] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Room Properties</h2>
          <button
            onClick={close}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Label */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Label
            </label>
            <input
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Room name"
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
              autoFocus
            />
          </div>

          {/* Lock */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Position Lock
            </label>
            <button
              onClick={() => {
                if (!editingNodeId) return;
                toggleRoomLock(editingNodeId);
                setLocked(!locked);
              }}
              className={`px-3 py-1 text-xs rounded border cursor-pointer transition-colors ${
                locked
                  ? "bg-blue-50 border-blue-400 text-blue-700"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:text-[var(--color-text-heading)]"
              }`}
            >
              {locked ? "Locked" : "Unlocked"}
            </button>
          </div>

          {/* Equipment Rack — only for nested rooms */}
          {node.parentId && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Equipment Rack
              </label>
              <button
                onClick={() => setIsEquipmentRack(!isEquipmentRack)}
                className={`px-3 py-1 text-xs rounded border cursor-pointer transition-colors ${
                  isEquipmentRack
                    ? "bg-blue-50 border-blue-400 text-blue-700"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:text-[var(--color-text-heading)]"
                }`}
              >
                {isEquipmentRack ? "Yes" : "No"}
              </button>
            </div>
          )}

          {/* Label Size */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Label Size
            </label>
            <select
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
              value={labelSize}
              onChange={(e) => setLabelSize(Number(e.target.value))}
            >
              {LABEL_SIZES.map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </div>

          {/* Background Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Background Color
            </label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c || "none"}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded border cursor-pointer transition-all ${
                    color === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"
                  }`}
                  style={{ background: c || "white", borderColor: c ? "transparent" : "var(--color-border)" }}
                  title={c || "None"}
                />
              ))}
              <input
                type="color"
                value={color || "#ffffff"}
                onChange={(e) => setColor(e.target.value)}
                className="w-5 h-5 cursor-pointer border-0 p-0"
                title="Custom color"
              />
            </div>
          </div>

          {/* Border Style */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Border Style
            </label>
            <div className="flex items-center gap-2">
              {BORDER_STYLES.map((bs) => (
                <button
                  key={bs.value}
                  onClick={() => setBorderStyle(bs.value)}
                  className={`px-3 py-1 text-xs rounded border cursor-pointer transition-colors ${
                    borderStyle === bs.value
                      ? "bg-blue-50 border-blue-400 text-blue-700"
                      : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:text-[var(--color-text-heading)]"
                  }`}
                >
                  {bs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Border Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Border Color
            </label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c || "none"}
                  onClick={() => setBorderColor(c)}
                  className={`w-5 h-5 rounded border cursor-pointer transition-all ${
                    borderColor === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"
                  }`}
                  style={{ background: c || "#d4d4d4", borderColor: c ? "transparent" : "var(--color-border)" }}
                  title={c || "Default"}
                />
              ))}
              <input
                type="color"
                value={borderColor || "#d4d4d4"}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-5 h-5 cursor-pointer border-0 p-0"
                title="Custom color"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
