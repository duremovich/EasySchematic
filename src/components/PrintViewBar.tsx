import { memo, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { PAPER_SIZES } from "../printConfig";
import { computePageGrid } from "../printPageGrid";
import { exportPdf } from "../pdfExport";

function PrintViewBar() {
  const rfInstance = useReactFlow();

  const printPaperId = useSchematicStore((s) => s.printPaperId);
  const printOrientation = useSchematicStore((s) => s.printOrientation);
  const printScale = useSchematicStore((s) => s.printScale);
  const schematicName = useSchematicStore((s) => s.schematicName);
  // Subscribe to node positions so page count updates when nodes move
  useSchematicStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)},${n.measured?.width ?? 0},${n.measured?.height ?? 0}`).join("|"),
  );
  const setPrintView = useSchematicStore((s) => s.setPrintView);
  const setPrintPaperId = useSchematicStore((s) => s.setPrintPaperId);
  const setPrintOrientation = useSchematicStore((s) => s.setPrintOrientation);
  const setPrintScale = useSchematicStore((s) => s.setPrintScale);

  const paperSize = PAPER_SIZES.find((p) => p.id === printPaperId) ?? PAPER_SIZES[2];
  const nodes = rfInstance.getNodes();
  const pages = computePageGrid(paperSize, printOrientation, printScale, nodes);

  const handleExportPdf = useCallback(async () => {
    await exportPdf(rfInstance, paperSize, printOrientation, printScale, schematicName);
  }, [rfInstance, paperSize, printOrientation, printScale, schematicName]);

  // Group paper sizes by category
  const categories = new Map<string, typeof PAPER_SIZES>();
  for (const ps of PAPER_SIZES) {
    const group = categories.get(ps.category) ?? [];
    group.push(ps);
    categories.set(ps.category, group);
  }

  return (
    <div className="h-10 bg-blue-50 border-b border-blue-200 flex items-center px-3 gap-3 shrink-0" data-print-hide>
      {/* Paper size */}
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        Paper
        <select
          className="text-xs bg-white border border-gray-300 rounded px-1.5 py-0.5 text-gray-800"
          value={printPaperId}
          onChange={(e) => setPrintPaperId(e.target.value)}
        >
          {[...categories.entries()].map(([category, sizes]) => (
            <optgroup key={category} label={category}>
              {sizes.map((ps) => (
                <option key={ps.id} value={ps.id}>
                  {ps.label} ({ps.widthIn}&times;{ps.heightIn}&quot;)
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {/* Orientation */}
      <div className="flex items-center gap-1 text-xs">
        <button
          className={`px-2 py-0.5 rounded border text-xs cursor-pointer ${
            printOrientation === "landscape"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
          onClick={() => setPrintOrientation("landscape")}
        >
          Landscape
        </button>
        <button
          className={`px-2 py-0.5 rounded border text-xs cursor-pointer ${
            printOrientation === "portrait"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
          onClick={() => setPrintOrientation("portrait")}
        >
          Portrait
        </button>
      </div>

      {/* Scale */}
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        Scale
        <input
          type="range"
          min={0.25}
          max={2}
          step={0.05}
          value={printScale}
          onChange={(e) => setPrintScale(Number(e.target.value))}
          className="w-20 h-1 accent-blue-600"
        />
        <span className="text-xs text-gray-800 w-8 text-right font-mono">
          {Math.round(printScale * 100)}%
        </span>
      </label>

      {/* Page count */}
      <span className="text-xs text-gray-500">
        {pages.length} page{pages.length !== 1 ? "s" : ""}
      </span>

      <div className="flex-1" />

      {/* Export PDF */}
      <button
        className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 font-medium cursor-pointer"
        onClick={handleExportPdf}
      >
        Export PDF
      </button>

      {/* Exit */}
      <button
        className="px-2.5 py-1 text-xs rounded bg-white text-gray-600 hover:bg-gray-50 border border-gray-300 cursor-pointer"
        onClick={() => setPrintView(false)}
      >
        Exit Print View
      </button>

    </div>
  );
}

export default memo(PrintViewBar);
