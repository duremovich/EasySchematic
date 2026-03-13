import { useState, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  PAPER_SIZES,
  type Orientation,
} from "../printConfig";
import { executePrint, getPrintableArea } from "../printUtils";
import { exportImage } from "../exportUtils";
import { exportDxf } from "../dxfExport";

interface PrintDialogProps {
  onClose: () => void;
}

const categories = [...new Set(PAPER_SIZES.map((p) => p.category))];

export default function PrintDialog({ onClose }: PrintDialogProps) {
  const reactFlowInstance = useReactFlow();

  const [paperId, setPaperId] = useState("tabloid");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scalePercent, setScalePercent] = useState(100);

  const paper = PAPER_SIZES.find((p) => p.id === paperId)!;
  const scale = scalePercent / 100;

  const { pageW, pageH, printableW, printableH } = useMemo(
    () => getPrintableArea(paper, orientation),
    [paper, orientation],
  );

  const nodes = reactFlowInstance.getNodes();
  const diagramBounds = useMemo(() => {
    if (nodes.length === 0) return null;
    return reactFlowInstance.getNodesBounds(nodes);
  }, [nodes, reactFlowInstance]);

  const effectiveZoom = useMemo(() => {
    if (!diagramBounds) return scale;
    const pw = printableW * 96;
    const ph = printableH * 96;
    const padding = 0.05;
    const padW = pw * (1 - 2 * padding);
    const padH = ph * (1 - 2 * padding);
    const fitZoom = Math.min(
      padW / diagramBounds.width,
      padH / diagramBounds.height,
    );
    return Math.min(fitZoom, scale);
  }, [diagramBounds, printableW, printableH, scale]);

  const handlePrint = () => {
    onClose();
    // Small delay so the dialog unmounts before print
    requestAnimationFrame(() => {
      executePrint(reactFlowInstance, paper, orientation, scale);
    });
  };

  return (
    <div
      data-print-dialog
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[420px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Print Settings
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Paper Size */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Paper Size
            </label>
            <select
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
            >
              {categories.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {PAPER_SIZES.filter((p) => p.category === cat).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.widthIn}&times;{p.heightIn}&quot;)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Orientation */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Orientation
            </label>
            <div className="flex gap-3">
              {(["landscape", "portrait"] as const).map((o) => (
                <label
                  key={o}
                  className="flex items-center gap-1.5 text-xs text-[var(--color-text)] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="orientation"
                    value={o}
                    checked={orientation === o}
                    onChange={() => setOrientation(o)}
                    className="cursor-pointer"
                  />
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </label>
              ))}
            </div>
          </div>

          {/* Scale */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Scale: {scalePercent}%
            </label>
            <input
              type="range"
              min={25}
              max={200}
              step={5}
              value={scalePercent}
              onChange={(e) => setScalePercent(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
              <span>25%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>

          {/* Info Panel */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded p-3 text-[11px] text-[var(--color-text)] space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">
                Page size
              </span>
              <span>
                {pageW}&times;{pageH}&quot;
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">
                Printable area
              </span>
              <span>
                {printableW.toFixed(1)}&times;{printableH.toFixed(1)}&quot;
              </span>
            </div>
            {diagramBounds && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">
                  Diagram bounds
                </span>
                <span>
                  {Math.round(diagramBounds.width)}&times;
                  {Math.round(diagramBounds.height)}px
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">
                Effective zoom
              </span>
              <span>{(effectiveZoom * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => {
                onClose();
                exportImage(reactFlowInstance, { format: "png", pixelRatio: 4 });
              }}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Export high-resolution PNG (4x)"
            >
              Export PNG
            </button>
            <button
              onClick={() => {
                onClose();
                exportImage(reactFlowInstance, { format: "svg" });
              }}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Export as SVG (vector)"
            >
              Export SVG
            </button>
            <button
              onClick={() => {
                exportDxf(reactFlowInstance);
                onClose();
              }}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Export as DXF for CAD (Vectorworks, AutoCAD)"
            >
              Export DXF
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
            >
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
