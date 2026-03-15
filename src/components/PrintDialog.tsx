import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { PAPER_SIZES } from "../printConfig";
import { exportImage } from "../exportUtils";
import { exportDxf } from "../dxfExport";
import { exportPdf } from "../pdfExport";

interface PrintDialogProps {
  onClose: () => void;
}

export default function PrintDialog({ onClose }: PrintDialogProps) {
  const reactFlowInstance = useReactFlow();

  const btnClass =
    "px-4 py-2 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors cursor-pointer w-full text-left";

  return (
    <div
      data-print-dialog
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[280px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Export
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-3 space-y-2">
          <button
            onClick={() => {
              onClose();
              exportImage(reactFlowInstance, { format: "png", pixelRatio: 4 });
            }}
            className={btnClass}
            title="Export high-resolution PNG (4x)"
          >
            <div className="font-medium">PNG</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              High-resolution raster image
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              exportImage(reactFlowInstance, { format: "svg" });
            }}
            className={btnClass}
            title="Export as SVG vector"
          >
            <div className="font-medium">SVG</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              Scalable vector graphic
            </div>
          </button>

          <button
            onClick={() => {
              exportDxf(reactFlowInstance);
              onClose();
            }}
            className={btnClass}
            title="Export as DXF for CAD"
          >
            <div className="font-medium">DXF</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              CAD format (Vectorworks, AutoCAD)
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              const state = useSchematicStore.getState();
              const paper = PAPER_SIZES.find((p) => p.id === state.printPaperId) ?? PAPER_SIZES[2];
              exportPdf(
                reactFlowInstance,
                paper,
                state.printOrientation,
                state.printScale,
                state.schematicName,
              );
            }}
            className={btnClass}
            title="Export multi-page PDF using print view settings"
          >
            <div className="font-medium">PDF</div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              Multi-page document (uses Print View settings)
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
