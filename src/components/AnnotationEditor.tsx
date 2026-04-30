import { useState, useEffect, useCallback } from "react";
import { useSchematicStore } from "../store";
import type { AnnotationData, AnnotationNode } from "../types";

const SHAPES: Array<{ value: AnnotationData["shape"]; label: string }> = [
  { value: "rectangle", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "circle", label: "Circle" },
  { value: "diamond", label: "Diamond" },
  { value: "triangle", label: "Triangle" },
];

const FILL_PRESETS: Array<{ rgba: string; hex: string }> = [
  { rgba: "rgba(59, 130, 246, 0.15)", hex: "#3b82f6" },
  { rgba: "rgba(239, 68, 68, 0.15)", hex: "#ef4444" },
  { rgba: "rgba(249, 115, 22, 0.15)", hex: "#f97316" },
  { rgba: "rgba(234, 179, 8, 0.15)", hex: "#eab308" },
  { rgba: "rgba(34, 197, 94, 0.15)", hex: "#22c55e" },
  { rgba: "rgba(168, 85, 247, 0.15)", hex: "#a855f7" },
  { rgba: "rgba(107, 114, 128, 0.15)", hex: "#6b7280" },
  { rgba: "", hex: "" },
];

const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32];

const BORDER_PRESETS = [
  "#3b82f6", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#a855f7", "#6b7280", "#374151",
];

function parseRgba(color: string | undefined): { hex: string; opacity: number } {
  const c = (color ?? "").trim();
  if (!c) return { hex: "#3b82f6", opacity: 15 };
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c);
  if (m) {
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
    const a = m[4] != null ? parseFloat(m[4]) : 1;
    return {
      hex: "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join(""),
      opacity: Math.round(a * 100),
    };
  }
  if (c.startsWith("#")) return { hex: c.slice(0, 7), opacity: 100 };
  return { hex: "#3b82f6", opacity: 15 };
}

function buildRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${(opacity / 100).toFixed(2)})`;
}

export default function AnnotationEditor() {
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const nodes = useSchematicStore((s) => s.nodes);
  const updateAnnotation = useSchematicStore((s) => s.updateAnnotation);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);

  const node = nodes.find(
    (n) => n.id === editingNodeId && n.type === "annotation"
  ) as AnnotationNode | undefined;

  const [label, setLabel] = useState("");
  const [shape, setShape] = useState<AnnotationData["shape"]>("rectangle");
  const [fontSize, setFontSize] = useState(12);
  const [fillHex, setFillHex] = useState("#3b82f6");
  const [fillOpacity, setFillOpacity] = useState(15);
  const [borderColor, setBorderColor] = useState("#3b82f6");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!node) return;
    const d = node.data;
    setLabel(d.label ?? "");
    setShape(d.shape ?? "rectangle");
    setFontSize(d.fontSize ?? 12);
    const parsed = parseRgba(d.color);
    setFillHex(parsed.hex);
    setFillOpacity(parsed.opacity);
    setBorderColor(d.borderColor ?? "#3b82f6");
  }, [node]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const close = useCallback(() => setEditingNodeId(null), [setEditingNodeId]);

  const handleSave = useCallback(() => {
    if (!editingNodeId) return;
    const color = fillOpacity === 0 ? undefined : buildRgba(fillHex, fillOpacity);
    updateAnnotation(editingNodeId, {
      label: label.trim() || undefined,
      shape,
      fontSize,
      color,
      borderColor,
    });
    close();
  }, [editingNodeId, label, shape, fontSize, fillHex, fillOpacity, borderColor, updateAnnotation, close]);

  if (!editingNodeId || !node) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[340px] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Annotation Properties</h2>
          <button
            onClick={close}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

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
              placeholder="Optional label"
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
              autoFocus
            />
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Font Size
            </label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </div>

          {/* Shape */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Shape
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SHAPES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setShape(s.value)}
                  className={`px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                    shape === s.value
                      ? "bg-blue-50 border-blue-400 text-blue-700"
                      : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:text-[var(--color-text-heading)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fill Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Fill Color
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILL_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (p.hex) {
                      setFillHex(p.hex);
                      if (fillOpacity === 0) setFillOpacity(15);
                    } else {
                      setFillOpacity(0);
                    }
                  }}
                  className={`w-5 h-5 rounded border cursor-pointer transition-all ${
                    (!p.hex && fillOpacity === 0) || (p.hex && fillHex === p.hex && fillOpacity > 0)
                      ? "ring-2 ring-blue-500 ring-offset-1"
                      : "hover:scale-110"
                  }`}
                  style={{
                    background: p.rgba || "repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 8px 8px",
                    borderColor: p.hex ? "transparent" : "var(--color-border)",
                  }}
                  title={p.hex || "None"}
                />
              ))}
              <input
                type="color"
                value={fillHex}
                onChange={(e) => { setFillHex(e.target.value); if (fillOpacity === 0) setFillOpacity(15); }}
                className="w-5 h-5 cursor-pointer border-0 p-0"
                title="Custom fill color"
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-text-muted)]">Opacity</span>
              <input
                type="range"
                min={0} max={100} step={5}
                value={fillOpacity}
                onChange={(e) => setFillOpacity(Number(e.target.value))}
                className="flex-1 h-1.5 cursor-pointer accent-blue-500"
              />
              <span className="text-[10px] text-[var(--color-text-muted)] w-8 text-right">{fillOpacity}%</span>
            </div>
          </div>

          {/* Border Color */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Border Color
            </label>
            <div className="flex items-center gap-1.5">
              {BORDER_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBorderColor(c)}
                  className={`w-5 h-5 rounded border cursor-pointer transition-all ${
                    borderColor === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"
                  }`}
                  style={{ background: c, borderColor: "transparent" }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-5 h-5 cursor-pointer border-0 p-0"
                title="Custom border color"
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded border border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
