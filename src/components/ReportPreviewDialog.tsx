import { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { TitleBlock, TitleBlockLayout, TitleBlockCell } from "../types";
import type { ReportLayout, ReportTableDef, PaperSize, TableBorderStyle } from "../reportLayout";
import {
  getVisibleColumns,
  getPageDimensions,
  REPORT_MARGIN_MM,
  PAPER_LABELS,
} from "../reportLayout";
import { renderReportPdf, type ReportTableData } from "../reportPdf";
import { useSchematicStore } from "../store";
import {
  getCoveredPositions,
  nextCellId,
  normalizeSizes,
  getFieldValue,
  getFieldLabel,
} from "../titleBlockLayout";

/**
 * Resolve a layout by combining hardcoded defaults with saved user preferences.
 * Column definitions, headers, and groupByOptions always come from code.
 * Only user selections (visibility, widths, groupBy, sort) are restored from saved data.
 */
function resolveLayout(defaults: ReportLayout, saved: ReportLayout | null): ReportLayout {
  if (!saved) return defaults;
  return {
    ...defaults,
    // Restore user's page/header/footer preferences
    headerLayout: saved.headerLayout ?? defaults.headerLayout,
    headerHeightMm: saved.headerHeightMm ?? defaults.headerHeightMm,
    footerLayout: saved.footerLayout ?? defaults.footerLayout,
    footerHeightMm: saved.footerHeightMm ?? defaults.footerHeightMm,
    orientation: saved.orientation ?? defaults.orientation,
    paperSize: saved.paperSize ?? defaults.paperSize,
    tables: defaults.tables.map((defaultTable) => {
      const savedTable = saved.tables.find((t) => t.id === defaultTable.id);
      if (!savedTable) return defaultTable;
      // Apply saved visibility and widths onto hardcoded column definitions
      const savedVis = new Map(savedTable.columns.map((c) => [c.key, c.visible]));
      const savedWidths = new Map(savedTable.columns.map((c) => [c.key, c.widthMm]));
      return {
        ...defaultTable, // id, label, columns (definitions), groupByOptions from code
        columns: defaultTable.columns.map((col) => ({
          ...col,
          visible: savedVis.has(col.key) ? savedVis.get(col.key)! : col.visible,
          widthMm: savedWidths.has(col.key) ? savedWidths.get(col.key)! : col.widthMm,
        })),
        groupBy: savedTable.groupBy,
        sortBy: savedTable.sortBy,
        sortDir: savedTable.sortDir,
        borderStyle: savedTable.borderStyle,
      };
    }),
  };
}

// ─── Page Break Computation ───
// Heights in mm — must match the PDF renderer constants in reportPdf.ts

const PDF_ROW_HEIGHT = 6;
const PDF_HEADER_HEIGHT = 7;
const PDF_TABLE_GAP = 6;

type PageItem =
  | { kind: "sectionTitle"; tableId: string; label: string }
  | { kind: "colHeaders"; tableId: string }
  | { kind: "groupHeader"; tableId: string; label: string }
  | { kind: "dataRow"; tableId: string; row: Record<string, string>; rowIndex: number; isLastRow?: boolean }
  | { kind: "gap"; heightMm: number };

interface PageDesc {
  pageNum: number;
  items: PageItem[];
}

function computePages(
  layout: ReportLayout,
  tables: ReportTableData[],
): PageDesc[] {
  const { heightMm } = getPageDimensions(layout.paperSize, layout.orientation);
  const bottomLimit = heightMm - REPORT_MARGIN_MM - layout.footerHeightMm - 2;
  const page1Top = REPORT_MARGIN_MM + layout.headerHeightMm + 4;
  const pageNTop = REPORT_MARGIN_MM;

  const pages: PageDesc[] = [];
  let currentItems: PageItem[] = [];
  let y = page1Top;

  const newPage = () => {
    pages.push({ pageNum: pages.length + 1, items: currentItems });
    currentItems = [];
    y = pageNTop;
  };

  const fits = (h: number) => y + h <= bottomLimit;

  // Flatten all table content into a linear item stream
  for (let ti = 0; ti < layout.tables.length; ti++) {
    const tableDef = layout.tables[ti];
    const td = tables.find((t) => t.id === tableDef.id);
    if (!td || getVisibleColumns(tableDef).length === 0) continue;

    // Section title + column headers need ~16mm together — don't orphan them
    const sectionBlock = PDF_HEADER_HEIGHT + PDF_HEADER_HEIGHT + 2;
    if (!fits(sectionBlock)) newPage();

    currentItems.push({ kind: "sectionTitle", tableId: tableDef.id, label: tableDef.label });
    y += PDF_HEADER_HEIGHT;

    currentItems.push({ kind: "colHeaders", tableId: tableDef.id });
    y += PDF_HEADER_HEIGHT + 2;

    const repeatTableHeader = () => {
      currentItems.push({ kind: "sectionTitle", tableId: tableDef.id, label: `${tableDef.label} (Cont'd)` });
      y += PDF_HEADER_HEIGHT;
      currentItems.push({ kind: "colHeaders", tableId: tableDef.id });
      y += PDF_HEADER_HEIGHT + 2;
    };

    const addRow = (row: Record<string, string>, rowIndex: number) => {
      if (!fits(PDF_ROW_HEIGHT)) {
        newPage();
        repeatTableHeader();
      }
      currentItems.push({ kind: "dataRow", tableId: tableDef.id, row, rowIndex });
      y += PDF_ROW_HEIGHT;
    };

    const addGroupHeader = (label: string) => {
      const groupH = PDF_ROW_HEIGHT + 2;
      // Don't orphan a group header — need room for at least one row after it
      if (!fits(groupH + PDF_ROW_HEIGHT)) {
        newPage();
        repeatTableHeader();
      }
      currentItems.push({ kind: "groupHeader", tableId: tableDef.id, label });
      y += groupH;
    };

    if (td.groupedRows && tableDef.groupBy) {
      for (const [groupLabel, rows] of td.groupedRows) {
        addGroupHeader(groupLabel);
        rows.forEach((row, i) => addRow(row, i));
      }
    } else {
      td.rows.forEach((row, i) => addRow(row, i));
    }

    // Mark the last data row of this table (for outer border bottom)
    // Check currentItems first, then previous pages
    let marked = false;
    for (let j = currentItems.length - 1; j >= 0 && !marked; j--) {
      const it = currentItems[j];
      if (it.kind === "dataRow" && it.tableId === tableDef.id) { it.isLastRow = true; marked = true; }
    }
    if (!marked) {
      for (let p = pages.length - 1; p >= 0 && !marked; p--) {
        for (let j = pages[p].items.length - 1; j >= 0 && !marked; j--) {
          const it = pages[p].items[j];
          if (it.kind === "dataRow" && it.tableId === tableDef.id) { it.isLastRow = true; marked = true; }
        }
      }
    }

    // Gap between tables
    currentItems.push({ kind: "gap", heightMm: PDF_TABLE_GAP });
    y += PDF_TABLE_GAP;
  }

  // Push final page
  if (currentItems.length > 0 || pages.length === 0) {
    pages.push({ pageNum: pages.length + 1, items: currentItems });
  }

  return pages;
}

// ─── Props ───

interface ReportPreviewDialogProps {
  reportKey: string;
  defaultLayout: ReportLayout;
  titleBlock: TitleBlock;
  getTableData: (layout: ReportLayout) => ReportTableData[];
  onClose: () => void;
  filename: string;
}

// ─── Main Component ───

function ReportPreviewDialog({
  reportKey,
  defaultLayout,
  titleBlock,
  getTableData,
  onClose,
  filename,
}: ReportPreviewDialogProps) {
  const storedLayout = useSchematicStore((s) => s.reportLayouts[reportKey]) as ReportLayout | undefined;
  const setReportLayout = useSchematicStore((s) => s.setReportLayout);
  const globalHeaderLayout = useSchematicStore((s) => s.globalReportHeaderLayout);
  const globalFooterLayout = useSchematicStore((s) => s.globalReportFooterLayout);
  const setGlobalReportHeaderLayout = useSchematicStore((s) => s.setGlobalReportHeaderLayout);
  const setGlobalReportFooterLayout = useSchematicStore((s) => s.setGlobalReportFooterLayout);

  const [layout, setLayout] = useState<ReportLayout>(() => {
    // Load saved preferences (old localStorage key or store)
    let saved: ReportLayout | null = storedLayout ?? null;
    if (!saved) {
      try {
        const raw = localStorage.getItem(reportKey);
        if (raw) {
          const parsed = JSON.parse(raw) as ReportLayout;
          localStorage.removeItem(reportKey);
          if (parsed.headerLayout) saved = parsed;
        }
      } catch { /* ignore */ }
    }
    // Resolve: hardcoded definitions + saved user preferences
    return resolveLayout(defaultLayout, saved);
  });

  const tables = getTableData(layout);

  // Persist to store (which auto-saves to localStorage + is included in file export)
  useEffect(() => {
    setReportLayout(reportKey, layout);
  }, [reportKey, layout, setReportLayout]);

  const updateTable = useCallback(
    (tableId: string, patch: Partial<ReportTableDef>) => {
      setLayout((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === tableId ? { ...t, ...patch } : t,
        ),
      }));
    },
    [],
  );

  const toggleColumn = useCallback(
    (tableId: string, colKey: string) => {
      setLayout((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.key === colKey ? { ...c, visible: !c.visible } : c,
                ),
              }
            : t,
        ),
      }));
    },
    [],
  );

  // Header layout state
  const setHeaderLayout = useCallback(
    (fn: (prev: TitleBlockLayout) => TitleBlockLayout) => {
      setLayout((prev) => ({
        ...prev,
        headerLayout: fn(prev.headerLayout),
      }));
    },
    [],
  );

  // Footer layout setter
  const setFooterLayout = useCallback(
    (fn: (prev: TitleBlockLayout) => TitleBlockLayout) => {
      setLayout((prev) => ({
        ...prev,
        footerLayout: fn(prev.footerLayout),
      }));
    },
    [],
  );

  // Effective layout: if using global header/footer, substitute them in
  const useGlobalHeader = (layout.useGlobalHeader ?? false) && globalHeaderLayout != null;
  const useGlobalFooter = (layout.useGlobalFooter ?? false) && globalFooterLayout != null;
  const effectiveHeaderLayout = useGlobalHeader ? globalHeaderLayout! : layout.headerLayout;
  const effectiveFooterLayout = useGlobalFooter ? globalFooterLayout! : layout.footerLayout;
  const effectiveLayout: ReportLayout = useMemo(() => ({
    ...layout,
    headerLayout: effectiveHeaderLayout,
    footerLayout: effectiveFooterLayout,
  }), [layout, effectiveHeaderLayout, effectiveFooterLayout]);

  const handleExportPdf = useCallback(async () => {
    await renderReportPdf(effectiveLayout, titleBlock, tables, filename);
  }, [effectiveLayout, titleBlock, tables, filename]);

  // Zoom + pagination
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(() => computePages(effectiveLayout, tables), [effectiveLayout, tables]);
  const totalPages = pages.length;
  const safePage = Math.min(currentPage, totalPages);
  // Clamp page if layout changes reduce page count
  /* eslint-disable react-hooks/set-state-in-effect -- clamping derived state */
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages));
  }, [currentPage, totalPages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Unified cell selection — tracks which grid block ("header" | "footer") and cell ID
  const [selectedGridCell, setSelectedGridCell] = useState<{ block: "header" | "footer"; cellId: string } | null>(null);

  const selectedCellData = useMemo(() => {
    if (!selectedGridCell) return null;
    const cells = selectedGridCell.block === "header" ? effectiveHeaderLayout.cells : effectiveFooterLayout.cells;
    const cell = cells.find((c) => c.id === selectedGridCell.cellId);
    if (!cell) return null;
    return { cell, block: selectedGridCell.block };
  }, [selectedGridCell, effectiveHeaderLayout.cells, effectiveFooterLayout.cells]);

  const handleSelectHeaderCell = useCallback((id: string | null) => {
    setSelectedGridCell(id ? { block: "header", cellId: id } : null);
  }, []);

  const handleSelectFooterCell = useCallback((id: string | null) => {
    setSelectedGridCell(id ? { block: "footer", cellId: id } : null);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl max-w-[1200px] w-[95vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3 shrink-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Print Preview
          </h2>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-[280px] border-r border-[var(--color-border)] overflow-y-auto p-3 shrink-0 flex flex-col gap-4">
            {/* Page section */}
            <SidebarSection title="Page">
              <div className="flex gap-1 mb-2">
                {(["portrait", "landscape"] as const).map((o) => (
                  <button
                    key={o}
                    className={`flex-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                      layout.orientation === o
                        ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                        : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                    }`}
                    onClick={() => setLayout((prev) => ({ ...prev, orientation: o }))}
                  >
                    {o === "landscape" ? "Landscape" : "Portrait"}
                  </button>
                ))}
              </div>
              <select
                value={layout.paperSize}
                onChange={(e) => setLayout((prev) => ({ ...prev, paperSize: e.target.value as PaperSize }))}
                className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-white text-[var(--color-text)] cursor-pointer"
              >
                {(Object.keys(PAPER_LABELS) as PaperSize[]).map((ps) => (
                  <option key={ps} value={ps}>{PAPER_LABELS[ps]}</option>
                ))}
              </select>
            </SidebarSection>

            {/* Header global/custom toggle */}
            <SidebarSection title="Header">
              <div className="flex gap-1">
                {(["global", "custom"] as const).map((mode) => {
                  const isActive = mode === "global" ? (layout.useGlobalHeader ?? false) : !(layout.useGlobalHeader ?? false);
                  return (
                    <button
                      key={mode}
                      className={`flex-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                        isActive
                          ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                      }`}
                      onClick={() => {
                        if (mode === "global") {
                          if (!globalHeaderLayout) setGlobalReportHeaderLayout(layout.headerLayout);
                          setLayout((prev) => ({ ...prev, useGlobalHeader: true }));
                        } else {
                          setLayout((prev) => ({ ...prev, useGlobalHeader: false }));
                        }
                      }}
                    >
                      {mode === "global" ? "Global" : "Custom"}
                    </button>
                  );
                })}
              </div>
              {(layout.useGlobalHeader ?? false) && globalHeaderLayout && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                  Click header cells in the preview to edit the shared template.
                </p>
              )}
            </SidebarSection>

            {/* Footer global/custom toggle */}
            <SidebarSection title="Footer">
              <div className="flex gap-1">
                {(["global", "custom"] as const).map((mode) => {
                  const isActive = mode === "global" ? (layout.useGlobalFooter ?? false) : !(layout.useGlobalFooter ?? false);
                  return (
                    <button
                      key={mode}
                      className={`flex-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                        isActive
                          ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                      }`}
                      onClick={() => {
                        if (mode === "global") {
                          if (!globalFooterLayout) setGlobalReportFooterLayout(layout.footerLayout);
                          setLayout((prev) => ({ ...prev, useGlobalFooter: true }));
                        } else {
                          setLayout((prev) => ({ ...prev, useGlobalFooter: false }));
                        }
                      }}
                    >
                      {mode === "global" ? "Global" : "Custom"}
                    </button>
                  );
                })}
              </div>
              {(layout.useGlobalFooter ?? false) && globalFooterLayout && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                  Click footer cells in the preview to edit the shared template.
                </p>
              )}
            </SidebarSection>

            {/* Selected cell properties — shows when a header or footer cell is clicked */}
            {selectedCellData && (
              <SidebarSection title={`Selected Cell (${selectedCellData.block})`}>
                <CellPropertiesPanel
                  cell={selectedCellData.cell}
                  updateCell={(cellId, updates) => {
                    if (selectedCellData.block === "header") {
                      if (useGlobalHeader) {
                        setGlobalReportHeaderLayout({
                          ...globalHeaderLayout!,
                          cells: globalHeaderLayout!.cells.map((c) => c.id === cellId ? { ...c, ...updates } : c),
                        });
                      } else {
                        setHeaderLayout((prev) => ({
                          ...prev,
                          cells: prev.cells.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
                        }));
                      }
                    } else {
                      if (useGlobalFooter) {
                        setGlobalReportFooterLayout({
                          ...globalFooterLayout!,
                          cells: globalFooterLayout!.cells.map((c) => c.id === cellId ? { ...c, ...updates } : c),
                        });
                      } else {
                        setFooterLayout((prev) => ({
                          ...prev,
                          cells: prev.cells.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
                        }));
                      }
                    }
                  }}
                  titleBlock={titleBlock}
                />
              </SidebarSection>
            )}

            {/* Table sections */}
            {layout.tables.map((tableDef) => (
              <SidebarSection key={tableDef.id} title={tableDef.label}>
                <div className="flex flex-col gap-1">
                  {tableDef.columns.map((col) => (
                    <Checkbox
                      key={col.key}
                      label={col.header}
                      checked={col.visible}
                      onChange={() => toggleColumn(tableDef.id, col.key)}
                    />
                  ))}
                </div>
                {tableDef.groupByOptions.length > 1 && (
                  <div className="mt-2">
                    <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                      Group by
                    </label>
                    <select
                      value={tableDef.groupBy ?? ""}
                      onChange={(e) =>
                        updateTable(tableDef.id, {
                          groupBy: e.target.value || null,
                        })
                      }
                      className="w-full mt-0.5 px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-white text-[var(--color-text)] cursor-pointer"
                    >
                      {tableDef.groupByOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mt-2">
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                    Sort by
                  </label>
                  <div className="flex gap-1 mt-0.5">
                    <select
                      value={tableDef.sortBy ?? ""}
                      onChange={(e) =>
                        updateTable(tableDef.id, { sortBy: e.target.value || null })
                      }
                      className="flex-1 px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-white text-[var(--color-text)] cursor-pointer"
                    >
                      <option value="">None</option>
                      {tableDef.columns.filter((c) => c.visible).map((col) => (
                        <option key={col.key} value={col.key}>{col.header}</option>
                      ))}
                    </select>
                    {tableDef.sortBy && (
                      <button
                        onClick={() =>
                          updateTable(tableDef.id, {
                            sortDir: tableDef.sortDir === "asc" ? "desc" : "asc",
                          })
                        }
                        className="px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                        title={tableDef.sortDir === "asc" ? "Ascending" : "Descending"}
                      >
                        {tableDef.sortDir === "asc" ? "\u2191" : "\u2193"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                    Borders
                  </label>
                  <select
                    value={tableDef.borderStyle ?? "none"}
                    onChange={(e) =>
                      updateTable(tableDef.id, { borderStyle: e.target.value as TableBorderStyle })
                    }
                    className="w-full mt-0.5 px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-white text-[var(--color-text)] cursor-pointer"
                  >
                    <option value="none">None</option>
                    <option value="horizontal">Horizontal</option>
                    <option value="grid">Grid</option>
                    <option value="outer">Outer</option>
                  </select>
                </div>
              </SidebarSection>
            ))}

            <button
              onClick={handleExportPdf}
              className="mt-auto px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors"
            >
              Export PDF
            </button>
          </div>

          {/* Preview pane */}
          <div className="flex-1 overflow-auto bg-neutral-100 flex flex-col min-h-0">
            {/* Toolbar: page nav + zoom */}
            <div className="flex items-center justify-center gap-4 py-2 shrink-0 border-b border-[var(--color-border)] bg-neutral-50">
              {/* Page navigation */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className={`px-2 py-0.5 text-xs rounded border border-[var(--color-border)] bg-white cursor-pointer ${safePage <= 1 ? "text-gray-300 cursor-default" : "text-[var(--color-text)] hover:bg-gray-100"}`}
                >
                  &#9664;
                </button>
                <span className="text-xs text-[var(--color-text-muted)] min-w-[60px] text-center">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className={`px-2 py-0.5 text-xs rounded border border-[var(--color-border)] bg-white cursor-pointer ${safePage >= totalPages ? "text-gray-300 cursor-default" : "text-[var(--color-text)] hover:bg-gray-100"}`}
                >
                  &#9654;
                </button>
              </div>

              <div className="h-4 w-px bg-[var(--color-border)]" />

              {/* Zoom */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                  className="px-2 py-0.5 text-xs rounded border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-gray-100 cursor-pointer"
                >
                  &minus;
                </button>
                <span className="text-xs text-[var(--color-text-muted)] w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                  className="px-2 py-0.5 text-xs rounded border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-gray-100 cursor-pointer"
                >
                  +
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="px-2 py-0.5 text-xs rounded border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-gray-100 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
              <PagePreview
                layout={effectiveLayout}
                titleBlock={titleBlock}
                page={pages[safePage - 1] ?? { pageNum: 1, items: [] }}
                totalPages={totalPages}
                setHeaderLayout={setHeaderLayout}
                setFooterLayout={setFooterLayout}
                setLayout={setLayout}
                onSelectHeaderCell={handleSelectHeaderCell}
                onSelectFooterCell={handleSelectFooterCell}
                zoom={zoom}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ReportPreviewDialog);

// ─── Sidebar Helpers ───

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[var(--color-text)] cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-blue-600" />
      {label}
    </label>
  );
}

// ─── Header Sidebar ───

const BUILTIN_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "showName", label: "Show Name" },
  { value: "venue", label: "Venue" },
  { value: "drawingTitle", label: "Drawing Title" },
  { value: "designer", label: "Designer" },
  { value: "engineer", label: "Engineer" },
  { value: "date", label: "Date" },
  { value: "revision", label: "Revision" },
];

const smallSelect =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500";
const smallInput =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 w-14";

function makeEmptyCell(row: number, col: number): TitleBlockCell {
  return {
    id: nextCellId(),
    row,
    col,
    rowSpan: 1,
    colSpan: 1,
    content: { type: "static", text: "" },
    fontSize: 7,
    fontWeight: "normal",
    fontFamily: "sans-serif",
    align: "left",
    color: "#1e293b",
  };
}


function CellPropertiesPanel({
  cell,
  updateCell,
  titleBlock,
}: {
  cell: TitleBlockCell;
  updateCell: (cellId: string, updates: Partial<TitleBlockCell>) => void;
  titleBlock: TitleBlock;
}) {
  return (
    <div className="border border-[var(--color-border)] rounded p-2 bg-gray-50 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold">
        Selected Cell
        {(cell.colSpan > 1 || cell.rowSpan > 1) && (
          <span className="ml-2 normal-case tracking-normal font-normal">
            ({cell.colSpan}×{cell.rowSpan})
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
          Content:
          <select
            className={smallSelect}
            value={cell.content.type}
            onChange={(e) => {
              const type = e.target.value as "field" | "static" | "logo" | "pageNumber";
              if (type === "field") updateCell(cell.id, { content: { type: "field", field: "showName" } });
              else if (type === "static") updateCell(cell.id, { content: { type: "static", text: "" } });
              else if (type === "logo") updateCell(cell.id, { content: { type: "logo" } });
              else updateCell(cell.id, { content: { type: "pageNumber" } });
            }}
          >
            <option value="field">Field</option>
            <option value="static">Static Text</option>
            <option value="logo">Logo</option>
            <option value="pageNumber">Page Number</option>
          </select>
        </label>

        {cell.content.type === "field" && (
          <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            Field:
            <select
              className={smallSelect}
              value={cell.content.field}
              onChange={(e) => updateCell(cell.id, { content: { type: "field", field: e.target.value } })}
            >
              {BUILTIN_FIELD_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
              {titleBlock.customFields?.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
        )}

        {cell.content.type === "static" && (
          <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            Text:
            <input
              type="text"
              className={smallInput + " !w-24"}
              value={cell.content.text}
              onChange={(e) => updateCell(cell.id, { content: { type: "static", text: e.target.value } })}
            />
          </label>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
          <input
            type="number"
            className={smallInput + " !w-10"}
            value={cell.fontSize}
            onChange={(e) => updateCell(cell.id, { fontSize: Math.max(5, Math.min(24, Number(e.target.value))) })}
            min={5}
            max={24}
          />
          pt
        </label>

        <button
          className={`px-1.5 py-0.5 text-[10px] rounded border cursor-pointer ${cell.fontWeight === "bold" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-[var(--color-text-muted)] border-[var(--color-border)]"}`}
          onClick={() => updateCell(cell.id, { fontWeight: cell.fontWeight === "bold" ? "normal" : "bold" })}
        >
          B
        </button>

        <div className="flex gap-0.5">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              className={`px-1.5 py-0.5 text-[10px] rounded border cursor-pointer ${cell.align === a ? "bg-blue-600 text-white border-blue-600" : "bg-white text-[var(--color-text-muted)] border-[var(--color-border)]"}`}
              onClick={() => updateCell(cell.id, { align: a })}
            >
              {a === "left" ? "L" : a === "center" ? "C" : "R"}
            </button>
          ))}
        </div>

        <input
          type="color"
          className="w-5 h-5 border border-[var(--color-border)] rounded cursor-pointer"
          value={cell.color}
          onChange={(e) => updateCell(cell.id, { color: e.target.value })}
        />
      </div>
    </div>
  );
}

// ─── Page Preview ───

const PREVIEW_MAX_HEIGHT = 600;

function PagePreview({
  layout,
  titleBlock,
  page,
  totalPages,
  setHeaderLayout,
  setFooterLayout,
  setLayout,
  onSelectHeaderCell,
  onSelectFooterCell,
  zoom,
}: {
  layout: ReportLayout;
  titleBlock: TitleBlock;
  page: PageDesc;
  totalPages: number;
  setHeaderLayout: (fn: (prev: TitleBlockLayout) => TitleBlockLayout) => void;
  setFooterLayout: (fn: (prev: TitleBlockLayout) => TitleBlockLayout) => void;
  setLayout: React.Dispatch<React.SetStateAction<ReportLayout>>;
  onSelectHeaderCell: (id: string | null) => void;
  onSelectFooterCell: (id: string | null) => void;
  zoom: number;
}) {
  const { widthMm, heightMm } = getPageDimensions(layout.paperSize, layout.orientation);
  const baseScale = PREVIEW_MAX_HEIGHT / heightMm;
  const scale = baseScale * zoom;
  const scaledW = widthMm * scale;
  const scaledH = heightMm * scale;
  const mm = (v: number) => v * scale;

  const isFirstPage = page.pageNum === 1;
  const contentTop = isFirstPage
    ? REPORT_MARGIN_MM + layout.headerHeightMm + 4
    : REPORT_MARGIN_MM;

  return (
    <div
      className="bg-white shadow-lg border border-neutral-300 relative overflow-hidden"
      style={{
        width: scaledW,
        height: scaledH,
        fontSize: mm(3),
        lineHeight: 1.3,
      }}
    >
      {/* Header — page 1 only */}
      {isFirstPage && (
        <HeaderPreviewGrid
          headerLayout={layout.headerLayout}
          headerHeightMm={layout.headerHeightMm}
          titleBlock={titleBlock}
          mm={mm}
          setGridLayout={setHeaderLayout}
          contentWidthMm={widthMm - 2 * REPORT_MARGIN_MM}
          onSelectCell={onSelectHeaderCell}
          position="top"
        />
      )}

      {/* Page content from computed items */}
      <PageContentRenderer
        items={page.items}
        layout={layout}
        mm={mm}
        contentTopMm={contentTop}
        setLayout={setLayout}
      />

      {/* Footer — every page */}
      <HeaderPreviewGrid
        headerLayout={layout.footerLayout}
        headerHeightMm={layout.footerHeightMm}
        titleBlock={titleBlock}
        mm={mm}
        setGridLayout={setFooterLayout}
        contentWidthMm={widthMm - 2 * REPORT_MARGIN_MM}
        onSelectCell={onSelectFooterCell}
        position="bottom"
        pageHeightMm={heightMm}
        pageNum={page.pageNum}
        totalPages={totalPages}
      />
    </div>
  );
}

// ─── Page Content Renderer (renders PageItems for one page) ───

function PageContentRenderer({
  items,
  layout,
  mm,
  contentTopMm,
  setLayout,
}: {
  items: PageItem[];
  layout: ReportLayout;
  mm: (v: number) => number;
  contentTopMm: number;
  setLayout: React.Dispatch<React.SetStateAction<ReportLayout>>;
}) {
  // Walk items and position them using the same Y logic as computePages
  let y = contentTopMm;
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.kind === "gap") {
      y += item.heightMm;
      continue;
    }

    const tableDef = layout.tables.find((t) => t.id === item.tableId);
    if (!tableDef) continue;
    const { widthMm: pageWidthMm } = getPageDimensions(layout.paperSize, layout.orientation);
    const contentWidthMm = pageWidthMm - 2 * REPORT_MARGIN_MM;
    const visCols = getVisibleColumns(tableDef, contentWidthMm);
    if (visCols.length === 0) continue;

    switch (item.kind) {
      case "sectionTitle":
        elements.push(
          <div
            key={`st-${i}`}
            style={{
              position: "absolute",
              left: mm(REPORT_MARGIN_MM),
              top: mm(y),
              fontWeight: 700,
              fontSize: mm(3.8),
              color: "#000",
            }}
          >
            {item.label}
          </div>,
        );
        y += PDF_HEADER_HEIGHT;
        break;

      case "colHeaders":
        elements.push(
          <PreviewColumnHeaders
            key={`ch-${i}`}
            tableDef={tableDef}
            mm={mm}
            topMm={y}
            setLayout={setLayout}
            contentWidthMm={contentWidthMm}
          />,
        );
        y += PDF_HEADER_HEIGHT + 2;
        break;

      case "groupHeader": {
        const ghBorders = tableDef.borderStyle ?? "none";
        const ghBorderLine = "1px solid #ccc";
        elements.push(
          <div
            key={`gh-${i}`}
            style={{
              position: "absolute",
              left: mm(REPORT_MARGIN_MM),
              right: mm(REPORT_MARGIN_MM),
              top: mm(y),
              height: mm(PDF_ROW_HEIGHT + 2),
              display: "flex",
              alignItems: "center",
              paddingLeft: mm(0.5),
              fontWeight: 700,
              fontSize: mm(2.8),
              background: "#e6ebf5",
              color: "#333",
              borderBottom: ghBorders === "horizontal" || ghBorders === "grid" ? ghBorderLine : undefined,
              borderLeft: ghBorders === "outer" || ghBorders === "grid" ? ghBorderLine : undefined,
              borderRight: ghBorders === "outer" || ghBorders === "grid" ? ghBorderLine : undefined,
            }}
          >
            {item.label}
          </div>,
        );
        y += PDF_ROW_HEIGHT + 2;
        break;
      }

      case "dataRow":
        elements.push(
          <PreviewDataRow
            key={`dr-${i}`}
            row={item.row}
            rowIndex={item.rowIndex}
            tableDef={tableDef}
            mm={mm}
            topMm={y}
            isLastRow={item.isLastRow}
            contentWidthMm={contentWidthMm}
          />,
        );
        y += PDF_ROW_HEIGHT;
        break;
    }
  }

  return <>{elements}</>;
}

// ─── Header Preview Grid (interactive, like title block editor) ───

function HeaderPreviewGrid({
  headerLayout,
  headerHeightMm,
  titleBlock,
  mm,
  setGridLayout,
  contentWidthMm,
  onSelectCell,
  position = "top",
  pageHeightMm,
  pageNum = 1,
  totalPages = 1,
}: {
  headerLayout: TitleBlockLayout;
  headerHeightMm: number;
  titleBlock: TitleBlock;
  mm: (v: number) => number;
  setGridLayout: (fn: (prev: TitleBlockLayout) => TitleBlockLayout) => void;
  contentWidthMm: number;
  onSelectCell: (id: string | null) => void;
  position?: "top" | "bottom";
  pageHeightMm?: number;
  pageNum?: number;
  totalPages?: number;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cellId: string } | null>(null);
  const [resizing, setResizing] = useState<{
    type: "col" | "row";
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  const covered = useMemo(() => getCoveredPositions(headerLayout.cells), [headerLayout.cells]);

  const norm = (arr: number[]) => normalizeSizes(arr);

  const updateCell = useCallback(
    (cellId: string, updates: Partial<TitleBlockCell>) => {
      setGridLayout((prev) => ({
        ...prev,
        cells: prev.cells.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
      }));
    },
    [setGridLayout],
  );

  // Grid sizing
  const gridW = mm(contentWidthMm);
  const gridH = mm(headerHeightMm);

  // Position: top for header, bottom for footer
  const topMm = position === "bottom" && pageHeightMm
    ? pageHeightMm - REPORT_MARGIN_MM - headerHeightMm
    : REPORT_MARGIN_MM;

  const gridTemplateCols = headerLayout.columns.map((w) => `${w}fr`).join(" ");
  const gridTemplateRows = headerLayout.rows.map((h) => `${h}fr`).join(" ");

  // Cumulative offsets for resize handles
  const colOffsets = useMemo(() => {
    const cols = normalizeSizes(headerLayout.columns);
    const offsets: number[] = [0];
    for (let i = 0; i < cols.length; i++) offsets.push(offsets[i] + cols[i]);
    return offsets;
  }, [headerLayout.columns]);

  const rowOffsets = useMemo(() => {
    const rows = normalizeSizes(headerLayout.rows);
    const offsets: number[] = [0];
    for (let i = 0; i < rows.length; i++) offsets.push(offsets[i] + rows[i]);
    return offsets;
  }, [headerLayout.rows]);

  // Resize handlers
  const handleResizePointerDown = useCallback((
    e: React.PointerEvent,
    type: "col" | "row",
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing({
      type,
      index,
      startPos: type === "col" ? e.clientX : e.clientY,
      startSizes: type === "col" ? [...headerLayout.columns] : [...headerLayout.rows],
    });
  }, [headerLayout.columns, headerLayout.rows]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const totalPx = resizing.type === "col" ? rect.width : rect.height;
    const delta = ((resizing.type === "col" ? e.clientX : e.clientY) - resizing.startPos) / totalPx;
    const sizes = [...resizing.startSizes];
    const i = resizing.index;
    const MIN = 0.05;
    const newA = sizes[i] + delta;
    const newB = sizes[i + 1] - delta;
    if (newA >= MIN && newB >= MIN) {
      sizes[i] = newA;
      sizes[i + 1] = newB;
      if (resizing.type === "col") {
        setGridLayout((prev) => ({ ...prev, columns: sizes }));
      } else {
        setGridLayout((prev) => ({ ...prev, rows: sizes }));
      }
    }
  }, [resizing, setGridLayout]);

  const handleResizePointerUp = useCallback(() => {
    if (!resizing) return;
    if (resizing.type === "col") {
      setGridLayout((prev) => ({ ...prev, columns: norm(prev.columns) }));
    } else {
      setGridLayout((prev) => ({ ...prev, rows: norm(prev.rows) }));
    }
    setResizing(null);
  }, [resizing, setGridLayout]);

  // Cell click
  const handleCellClick = useCallback((cellId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      });
      // When multi-selecting, report the last clicked cell
      onSelectCell(cellId);
    } else {
      setSelectedCells(new Set([cellId]));
      onSelectCell(cellId);
    }
    setContextMenu(null);
  }, [onSelectCell]);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, cellId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedCells.has(cellId)) {
      setSelectedCells(new Set([cellId]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, cellId });
  }, [selectedCells]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    const handleClick = () => setContextMenu(null);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleClick);
    };
  }, [contextMenu]);

  // Merge/unmerge
  const canMerge = useMemo(() => {
    if (selectedCells.size < 2) return false;
    const selArr = headerLayout.cells.filter((c) => selectedCells.has(c.id));
    if (selArr.length < 2) return false;
    const minR = Math.min(...selArr.map((c) => c.row));
    const maxR = Math.max(...selArr.map((c) => c.row + c.rowSpan - 1));
    const minC = Math.min(...selArr.map((c) => c.col));
    const maxC = Math.max(...selArr.map((c) => c.col + c.colSpan - 1));
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = headerLayout.cells.find((cl) => cl.row === r && cl.col === c);
        if (cell && !selectedCells.has(cell.id)) return false;
      }
    }
    return true;
  }, [selectedCells, headerLayout.cells]);

  const mergeCells = useCallback(() => {
    const selArr = headerLayout.cells.filter((c) => selectedCells.has(c.id));
    if (selArr.length < 2) return;
    const minR = Math.min(...selArr.map((c) => c.row));
    const maxR = Math.max(...selArr.map((c) => c.row + c.rowSpan - 1));
    const minC = Math.min(...selArr.map((c) => c.col));
    const maxC = Math.max(...selArr.map((c) => c.col + c.colSpan - 1));
    const topLeft = headerLayout.cells.find((c) => c.row === minR && c.col === minC);
    if (!topLeft) return;
    const removeIds = new Set(selArr.map((c) => c.id));
    removeIds.delete(topLeft.id);
    setGridLayout((prev) => ({
      ...prev,
      cells: prev.cells
        .filter((c) => !removeIds.has(c.id))
        .map((c) =>
          c.id === topLeft.id
            ? { ...c, colSpan: maxC - minC + 1, rowSpan: maxR - minR + 1 }
            : c,
        ),
    }));
    setSelectedCells(new Set([topLeft.id]));
  }, [headerLayout.cells, selectedCells, setGridLayout]);

  const unmergeCells = useCallback(() => {
    const cell = headerLayout.cells.find((c) => selectedCells.has(c.id));
    if (!cell || (cell.colSpan <= 1 && cell.rowSpan <= 1)) return;
    setGridLayout((prev) => {
      const newCells: TitleBlockCell[] = [];
      for (const c of prev.cells) {
        if (c.id === cell.id) {
          newCells.push({ ...c, colSpan: 1, rowSpan: 1 });
          for (let r = c.row; r < c.row + c.rowSpan; r++) {
            for (let col = c.col; col < c.col + c.colSpan; col++) {
              if (r === c.row && col === c.col) continue;
              newCells.push(makeEmptyCell(r, col));
            }
          }
        } else {
          newCells.push(c);
        }
      }
      return { ...prev, cells: newCells };
    });
    setSelectedCells(new Set([cell.id]));
  }, [headerLayout.cells, selectedCells, setGridLayout]);

  const insertRowAt = useCallback((rowIdx: number) => {
    setGridLayout((prev) => {
      const newRows = [...prev.rows];
      const halfH = (prev.rows[rowIdx] ?? (1 / prev.rows.length)) / 2;
      newRows.splice(rowIdx, 1, halfH, halfH);
      const cells = prev.cells.map((c) => {
        if (c.row >= rowIdx) return { ...c, row: c.row + 1 };
        if (c.row + c.rowSpan > rowIdx) return { ...c, rowSpan: c.rowSpan + 1 };
        return c;
      });
      for (let c = 0; c < prev.columns.length; c++) {
        const coveredBySpan = cells.some(
          (cell) => cell.row <= rowIdx && rowIdx < cell.row + cell.rowSpan && cell.col <= c && c < cell.col + cell.colSpan,
        );
        if (!coveredBySpan) cells.push(makeEmptyCell(rowIdx, c));
      }
      return { ...prev, rows: newRows, cells };
    });
  }, [setGridLayout]);

  const insertColumnAt = useCallback((colIdx: number) => {
    setGridLayout((prev) => {
      const newCols = [...prev.columns];
      const halfW = (prev.columns[colIdx] ?? (1 / prev.columns.length)) / 2;
      newCols.splice(colIdx, 1, halfW, halfW);
      const cells = prev.cells.map((c) => {
        if (c.col >= colIdx) return { ...c, col: c.col + 1 };
        if (c.col + c.colSpan > colIdx) return { ...c, colSpan: c.colSpan + 1 };
        return c;
      });
      for (let r = 0; r < prev.rows.length; r++) {
        const coveredBySpan = cells.some(
          (cell) => cell.col <= colIdx && colIdx < cell.col + cell.colSpan && cell.row <= r && r < cell.row + cell.rowSpan,
        );
        if (!coveredBySpan) cells.push(makeEmptyCell(r, colIdx));
      }
      return { ...prev, columns: newCols, cells };
    });
  }, [setGridLayout]);

  const deleteRow = useCallback((rowIdx: number) => {
    setGridLayout((prev) => {
      if (prev.rows.length <= 1) return prev;
      let cells = prev.cells.filter((c) => c.row !== rowIdx);
      cells = cells.map((c) => {
        if (c.row > rowIdx) return { ...c, row: c.row - 1 };
        if (c.row + c.rowSpan > rowIdx) return { ...c, rowSpan: c.rowSpan - 1 };
        return c;
      }).filter((c) => c.rowSpan > 0);
      const newRows = norm(prev.rows.filter((_, i) => i !== rowIdx));
      return { ...prev, rows: newRows, cells };
    });
    setSelectedCells(new Set());
  }, [setGridLayout]);

  const deleteColumn = useCallback((colIdx: number) => {
    setGridLayout((prev) => {
      if (prev.columns.length <= 1) return prev;
      let cells = prev.cells.filter((c) => c.col !== colIdx);
      cells = cells.map((c) => {
        if (c.col > colIdx) return { ...c, col: c.col - 1 };
        if (c.col + c.colSpan > colIdx) return { ...c, colSpan: c.colSpan - 1 };
        return c;
      }).filter((c) => c.colSpan > 0);
      const newCols = norm(prev.columns.filter((_, i) => i !== colIdx));
      return { ...prev, columns: newCols, cells };
    });
    setSelectedCells(new Set());
  }, [setGridLayout]);

  const ctxCell = contextMenu ? headerLayout.cells.find((c) => c.id === contextMenu.cellId) : null;

  // Font scaling: approximate mm to px based on preview scale
  const pxPerPt = gridW / contentWidthMm / 72 * 25.4; // mm→pt→px

  return (
    <>
      <div
        ref={gridRef}
        className="absolute select-none"
        style={{
          left: mm(REPORT_MARGIN_MM),
          top: mm(topMm),
          width: gridW,
          height: gridH,
        }}
        onPointerMove={resizing ? handleResizePointerMove : undefined}
        onPointerUp={resizing ? handleResizePointerUp : undefined}
      >
        {/* Border */}
        <div className="absolute inset-0 border border-gray-300 rounded-sm" />

        {/* CSS Grid of cells */}
        <div
          className="absolute inset-0"
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplateCols,
            gridTemplateRows: gridTemplateRows,
          }}
        >
          {headerLayout.cells.map((cell) => {
            if (covered.has(`${cell.row},${cell.col}`)) return null;
            const isSelected = selectedCells.has(cell.id);

            let displayText = "";
            let textColor = cell.color;
            let isPlaceholder = false;
            switch (cell.content.type) {
              case "field": {
                const val = getFieldValue(titleBlock, cell.content.field);
                const label = getFieldLabel(titleBlock, cell.content.field);
                if (val) {
                  displayText = `${label}: ${val}`;
                } else {
                  displayText = `[${label}]`;
                  textColor = "#9ca3af";
                  isPlaceholder = true;
                }
                break;
              }
              case "static":
                displayText = cell.content.text || "(empty)";
                if (!cell.content.text) { textColor = "#9ca3af"; isPlaceholder = true; }
                break;
              case "pageNumber":
                displayText = `Page ${pageNum} of ${totalPages}`;
                break;
              case "logo":
                break;
            }

            return (
              <div
                key={cell.id}
                className={`border border-gray-200 overflow-hidden flex items-center cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50/60 outline outline-2 outline-blue-500 -outline-offset-2 z-10"
                    : "hover:bg-blue-50/30"
                }`}
                style={{
                  gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
                  gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
                  justifyContent:
                    cell.align === "center" ? "center" : cell.align === "right" ? "flex-end" : "flex-start",
                  padding: `${mm(0.5)}px ${mm(1)}px`,
                }}
                onClick={(e) => handleCellClick(cell.id, e)}
                onContextMenu={(e) => handleContextMenu(e, cell.id)}
              >
                {cell.content.type === "logo" ? (
                  titleBlock.logo ? (
                    <img
                      src={titleBlock.logo}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <span style={{ fontSize: mm(2.5), color: "#9ca3af" }}>[Logo]</span>
                  )
                ) : (
                  <span
                    className="leading-tight truncate"
                    style={{
                      fontSize: cell.fontSize * pxPerPt,
                      fontWeight: cell.fontWeight === "bold" ? 600 : 400,
                      color: textColor,
                      fontStyle: isPlaceholder ? "italic" : "normal",
                    }}
                  >
                    {displayText}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Column resize handles */}
        {colOffsets.slice(1, -1).map((frac, i) => (
          <div
            key={`col-h-${i}`}
            className="absolute top-0 bottom-0 z-20"
            style={{
              left: `${frac * 100}%`,
              width: 8,
              marginLeft: -4,
              cursor: "col-resize",
            }}
            onPointerDown={(e) => handleResizePointerDown(e, "col", i)}
          >
            <div className="w-px h-full mx-auto opacity-0 hover:opacity-100 bg-blue-400 transition-opacity" />
          </div>
        ))}

        {/* Row resize handles */}
        {rowOffsets.slice(1, -1).map((frac, i) => (
          <div
            key={`row-h-${i}`}
            className="absolute left-0 right-0 z-20"
            style={{
              top: `${frac * 100}%`,
              height: 8,
              marginTop: -4,
              cursor: "row-resize",
            }}
            onPointerDown={(e) => handleResizePointerDown(e, "row", i)}
          >
            <div className="h-px w-full opacity-0 hover:opacity-100 bg-blue-400 transition-opacity" style={{ marginTop: 3 }} />
          </div>
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && ctxCell && (
        <div
          className="fixed z-[60] bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenuItem label="Insert Row Above" onClick={() => { insertRowAt(ctxCell.row); setContextMenu(null); }} />
          <ContextMenuItem label="Insert Row Below" onClick={() => { insertRowAt(ctxCell.row + ctxCell.rowSpan); setContextMenu(null); }} />
          <ContextMenuItem label="Insert Column Left" onClick={() => { insertColumnAt(ctxCell.col); setContextMenu(null); }} />
          <ContextMenuItem label="Insert Column Right" onClick={() => { insertColumnAt(ctxCell.col + ctxCell.colSpan); setContextMenu(null); }} />

          <div className="h-px bg-gray-200 my-1" />

          <ContextMenuItem
            label="Delete Row"
            disabled={headerLayout.rows.length <= 1}
            onClick={() => { deleteRow(ctxCell.row); setContextMenu(null); }}
          />
          <ContextMenuItem
            label="Delete Column"
            disabled={headerLayout.columns.length <= 1}
            onClick={() => { deleteColumn(ctxCell.col); setContextMenu(null); }}
          />

          <div className="h-px bg-gray-200 my-1" />

          {canMerge && (
            <ContextMenuItem
              label={`Merge ${selectedCells.size} Cells`}
              onClick={() => { mergeCells(); setContextMenu(null); }}
            />
          )}
          {(ctxCell.colSpan > 1 || ctxCell.rowSpan > 1) ? (
            <ContextMenuItem label="Unmerge" onClick={() => { unmergeCells(); setContextMenu(null); }} />
          ) : (
            <>
              <ContextMenuItem
                label="Merge with Right"
                disabled={ctxCell.col + ctxCell.colSpan >= headerLayout.columns.length}
                onClick={() => {
                  const rightCell = headerLayout.cells.find(
                    (c) => c.row === ctxCell.row && c.col === ctxCell.col + ctxCell.colSpan,
                  );
                  if (rightCell) {
                    setTimeout(() => {
                      setGridLayout((prev) => ({
                        ...prev,
                        cells: prev.cells
                          .filter((c) => c.id !== rightCell.id)
                          .map((c) =>
                            c.id === ctxCell.id
                              ? { ...c, colSpan: c.colSpan + rightCell.colSpan }
                              : c,
                          ),
                      }));
                      setSelectedCells(new Set([ctxCell.id]));
                    }, 0);
                  }
                  setContextMenu(null);
                }}
              />
              <ContextMenuItem
                label="Merge with Below"
                disabled={ctxCell.row + ctxCell.rowSpan >= headerLayout.rows.length}
                onClick={() => {
                  const belowCell = headerLayout.cells.find(
                    (c) => c.col === ctxCell.col && c.row === ctxCell.row + ctxCell.rowSpan,
                  );
                  if (belowCell) {
                    setTimeout(() => {
                      setGridLayout((prev) => ({
                        ...prev,
                        cells: prev.cells
                          .filter((c) => c.id !== belowCell.id)
                          .map((c) =>
                            c.id === ctxCell.id
                              ? { ...c, rowSpan: c.rowSpan + belowCell.rowSpan }
                              : c,
                          ),
                      }));
                      setSelectedCells(new Set([ctxCell.id]));
                    }, 0);
                  }
                  setContextMenu(null);
                }}
              />
            </>
          )}

          <div className="h-px bg-gray-200 my-1" />

          <ContextMenuSub label="Set Content">
            <ContextMenuItem
              label="Field"
              onClick={() => { updateCell(ctxCell.id, { content: { type: "field", field: "showName" } }); setContextMenu(null); }}
            />
            <ContextMenuItem
              label="Static Text"
              onClick={() => { updateCell(ctxCell.id, { content: { type: "static", text: "" } }); setContextMenu(null); }}
            />
            <ContextMenuItem
              label="Logo"
              onClick={() => { updateCell(ctxCell.id, { content: { type: "logo" } }); setContextMenu(null); }}
            />
            <ContextMenuItem
              label="Page Number"
              onClick={() => { updateCell(ctxCell.id, { content: { type: "pageNumber" } }); setContextMenu(null); }}
            />
          </ContextMenuSub>
        </div>
      )}
    </>
  );
}

// ─── Context Menu ───

function ContextMenuItem({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      className={`w-full text-left px-3 py-1 text-xs cursor-pointer ${
        disabled ? "text-gray-300 cursor-default" : "text-gray-700 hover:bg-gray-100"
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function ContextMenuSub({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center justify-between">
        {label}
        <span className="text-[10px] ml-2">&#9656;</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[140px] z-[61]">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Preview Table with Column Resize ───

// ─── Per-item preview renderers ───

function PreviewColumnHeaders({
  tableDef,
  mm,
  topMm,
  setLayout,
  contentWidthMm,
}: {
  tableDef: ReportTableDef;
  mm: (v: number) => number;
  topMm: number;
  setLayout: React.Dispatch<React.SetStateAction<ReportLayout>>;
  contentWidthMm: number;
}) {
  const visCols = getVisibleColumns(tableDef, contentWidthMm);
  const colGap = mm(1.5);

  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{
    colIndex: number;
    startX: number;
    startWidths: number[];
  } | null>(null);

  const handleColResizeDown = useCallback((e: React.PointerEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing({ colIndex, startX: e.clientX, startWidths: visCols.map((c) => c.widthMm) });
  }, [visCols]);

  const handleColResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalMm = visCols.reduce((s, c) => s + c.widthMm, 0);
    const pxPerMm = rect.width / totalMm;
    const deltaMm = (e.clientX - resizing.startX) / pxPerMm;
    const i = resizing.colIndex;
    const newA = resizing.startWidths[i] + deltaMm;
    const newB = resizing.startWidths[i + 1] - deltaMm;
    if (newA >= 8 && newB >= 8) {
      setLayout((prev) => ({
        ...prev,
        tables: prev.tables.map((t) => {
          if (t.id !== tableDef.id) return t;
          const visKeys = visCols.map((c) => c.key);
          return {
            ...t,
            columns: t.columns.map((c) => {
              const visIdx = visKeys.indexOf(c.key);
              if (visIdx === i) return { ...c, widthMm: newA };
              if (visIdx === i + 1) return { ...c, widthMm: newB };
              return c;
            }),
          };
        }),
      }));
    }
  }, [resizing, visCols, tableDef.id, setLayout]);

  const borders = tableDef.borderStyle ?? "none";
  const borderLine = "1px solid #ccc";

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: mm(REPORT_MARGIN_MM),
        right: mm(REPORT_MARGIN_MM),
        top: mm(topMm),
        height: mm(PDF_HEADER_HEIGHT),
        display: "flex",
        alignItems: "flex-end",
        background: "#f0f0f0",
        borderBottom: borders !== "none" ? borderLine : undefined,
        borderTop: borders === "outer" || borders === "grid" ? borderLine : undefined,
        borderLeft: borders === "outer" || borders === "grid" ? borderLine : undefined,
        borderRight: borders === "outer" || borders === "grid" ? borderLine : undefined,
      }}
      onPointerMove={resizing ? handleColResizeMove : undefined}
      onPointerUp={resizing ? () => setResizing(null) : undefined}
    >
      {visCols.map((col, i) => (
        <div
          key={col.key}
          style={{
            width: mm(col.widthMm),
            paddingLeft: mm(0.5),
            paddingRight: colGap,
            paddingBottom: mm(0.5),
            fontWeight: 700,
            fontSize: mm(3),
            position: "relative",
            flexShrink: 0,
            borderRight: borders === "grid" && i < visCols.length - 1 ? borderLine : undefined,
          }}
        >
          {col.header}
          {i < visCols.length - 1 && (
            <div
              style={{
                position: "absolute",
                right: -3,
                top: 0,
                bottom: 0,
                width: 6,
                cursor: "col-resize",
                zIndex: 5,
              }}
              onPointerDown={(e) => handleColResizeDown(e, i)}
            >
              <div
                className="opacity-0 hover:opacity-100 transition-opacity"
                style={{ width: 1, height: "100%", marginLeft: 3, background: "#3b82f6" }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PreviewDataRow({
  row,
  rowIndex,
  tableDef,
  mm,
  topMm,
  contentWidthMm,
  isLastRow,
}: {
  row: Record<string, string>;
  rowIndex: number;
  tableDef: ReportTableDef;
  mm: (v: number) => number;
  topMm: number;
  contentWidthMm: number;
  isLastRow?: boolean;
}) {
  const visCols = getVisibleColumns(tableDef, contentWidthMm);
  const colGap = mm(1.5);
  const isSubItem = row._isSubItem === "true";
  const borders = tableDef.borderStyle ?? "none";
  const borderLine = "1px solid #ccc";

  return (
    <div
      style={{
        position: "absolute",
        left: mm(REPORT_MARGIN_MM),
        right: mm(REPORT_MARGIN_MM),
        top: mm(topMm),
        height: mm(PDF_ROW_HEIGHT),
        display: "flex",
        alignItems: "center",
        background: rowIndex % 2 === 1 ? "#f8f8f8" : "transparent",
        borderBottom: borders === "horizontal" || borders === "grid" || (borders === "outer" && isLastRow) ? borderLine : undefined,
        borderLeft: borders === "outer" || borders === "grid" ? borderLine : undefined,
        borderRight: borders === "outer" || borders === "grid" ? borderLine : undefined,
      }}
    >
      {visCols.map((col, i) => {
        const indent = isSubItem && col.key !== "count" ? mm(4) : 0;
        return (
          <div
            key={col.key}
            style={{
              width: mm(col.widthMm),
              paddingLeft: mm(0.5) + indent,
              paddingRight: colGap,
              fontSize: mm(2.7),
              color: isSubItem ? "#888" : "#222",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexShrink: 0,
              borderRight: borders === "grid" && i < visCols.length - 1 ? borderLine : undefined,
            }}
          >
            {row[col.key] ?? ""}
          </div>
        );
      })}
    </div>
  );
}
