import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useSchematicStore } from "../store";
import type { TitleBlock, TitleBlockLayout, TitleBlockCell } from "../types";
import { getCoveredPositions, nextCellId, createDefaultLayout, getFieldValue, getFieldLabel } from "../titleBlockLayout";

interface TitleBlockDialogProps {
  onClose: () => void;
}

const MAX_LOGO_W = 400;
const MAX_LOGO_H = 200;

function resizeImage(dataUrl: string, isSvg = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // SVGs may report 0×0 — use a sensible default rasterization size
      let w = img.width || (isSvg ? MAX_LOGO_W : 0);
      let h = img.height || (isSvg ? MAX_LOGO_H : 0);
      if (w === 0 || h === 0) { resolve(dataUrl); return; }
      const scale = Math.min(1, MAX_LOGO_W / w, MAX_LOGO_H / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const TB_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "company", label: "Company", placeholder: "e.g. Acme Broadcasting" },
  { key: "showName", label: "Show / Project", placeholder: "e.g. Morning News Live" },
  { key: "venue", label: "Venue / Location", placeholder: "e.g. Studio A, Building 2" },
  { key: "drawingTitle", label: "Drawing Title", placeholder: "e.g. Main Studio Signal Flow" },
  { key: "designer", label: "Designer", placeholder: "Name" },
  { key: "engineer", label: "Engineer", placeholder: "Name" },
  { key: "date", label: "Date", placeholder: "e.g. 2026-03-15" },
  { key: "revision", label: "Revision", placeholder: "e.g. Rev A" },
];

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

export default function TitleBlockDialog({ onClose }: TitleBlockDialogProps) {
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const setTitleBlock = useSchematicStore((s) => s.setTitleBlock);
  const titleBlockLayout = useSchematicStore((s) => s.titleBlockLayout);
  const setTitleBlockLayout = useSchematicStore((s) => s.setTitleBlockLayout);

  // Snapshot originals for cancel/restore
  const [originalTb] = useState<TitleBlock>(() => ({ ...titleBlock }));
  const [originalLayout] = useState<TitleBlockLayout>(() => structuredClone(titleBlockLayout));

  const [tbDraft, setTbDraft] = useState<TitleBlock>({ ...titleBlock });
  const [draft, setDraft] = useState<TitleBlockLayout>(structuredClone(titleBlockLayout));
  const [activeTab, setActiveTab] = useState<"data" | "layout">("data");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live-preview: push draft changes to the store so the page view updates in real-time
  useEffect(() => {
    setTitleBlock(tbDraft);
  }, [tbDraft, setTitleBlock]);

  useEffect(() => {
    setTitleBlockLayout(draft);
  }, [draft, setTitleBlockLayout]);

  const handleSave = () => {
    // Already synced via effects — just close
    onClose();
  };

  const handleCancel = () => {
    // Restore originals
    setTitleBlock(originalTb);
    setTitleBlockLayout(originalLayout);
    onClose();
  };

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const resized = await resizeImage(dataUrl, file.type === "image/svg+xml");
      setTbDraft((prev) => ({ ...prev, logo: resized }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const handleRemoveLogo = useCallback(() => {
    setTbDraft((prev) => ({ ...prev, logo: "" }));
  }, []);

  const updateTbField = (field: string, value: string) => {
    setTbDraft((prev) => ({ ...prev, [field]: value }));
  };

  const addCustomField = useCallback(() => {
    setTbDraft((prev) => ({
      ...prev,
      customFields: [
        ...prev.customFields,
        { id: `custom-${Date.now()}`, label: "New Field", value: "" },
      ],
    }));
  }, []);

  const updateCustomField = useCallback((id: string, value: string) => {
    setTbDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f) =>
        f.id === id ? { ...f, value } : f,
      ),
    }));
  }, []);

  const updateCustomFieldLabel = useCallback((id: string, label: string) => {
    setTbDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f) =>
        f.id === id ? { ...f, label } : f,
      ),
    }));
  }, []);

  const removeCustomField = useCallback((id: string) => {
    setTbDraft((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== id),
    }));
  }, []);

  const inputClass =
    "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleCancel}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[620px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            Title Block Editor
          </h2>
          <button
            onClick={handleCancel}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] shrink-0">
          <button
            className={`px-4 py-2 text-xs font-medium cursor-pointer ${activeTab === "data" ? "text-blue-600 border-b-2 border-blue-600" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)]"}`}
            onClick={() => setActiveTab("data")}
          >
            Data & Logo
          </button>
          <button
            className={`px-4 py-2 text-xs font-medium cursor-pointer ${activeTab === "layout" ? "text-blue-600 border-b-2 border-blue-600" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)]"}`}
            onClick={() => setActiveTab("layout")}
          >
            Layout
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "data" ? (
            <DataTab
              draft={tbDraft}
              updateField={updateTbField}
              addCustomField={addCustomField}
              updateCustomField={updateCustomField}
              updateCustomFieldLabel={updateCustomFieldLabel}
              removeCustomField={removeCustomField}
              handleUpload={handleUpload}
              handleRemoveLogo={handleRemoveLogo}
              fileInputRef={fileInputRef}
              handleFileChange={handleFileChange}
              inputClass={inputClass}
            />
          ) : (
            <LayoutTab
              draft={draft}
              setDraft={setDraft}
              tbDraft={tbDraft}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2 shrink-0">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

    </div>
  );
}

/* ─── Data Tab ─────────────────────────────────────────── */

function DataTab({
  draft,
  updateField,
  addCustomField,
  updateCustomField,
  updateCustomFieldLabel,
  removeCustomField,
  handleUpload,
  handleRemoveLogo,
  fileInputRef: _fileInputRef,
  handleFileChange: _handleFileChange,
  inputClass,
}: {
  draft: TitleBlock;
  updateField: (key: string, value: string) => void;
  addCustomField: () => void;
  updateCustomField: (id: string, value: string) => void;
  updateCustomFieldLabel: (id: string, label: string) => void;
  removeCustomField: (id: string) => void;
  handleUpload: () => void;
  handleRemoveLogo: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputClass: string;
}) {
  return (
    <div className="p-4 flex gap-4">
      {/* Logo */}
      <div className="w-[140px] shrink-0 flex flex-col items-center gap-2">
        <div className="w-[140px] h-[90px] border border-dashed border-[var(--color-border)] rounded flex items-center justify-center bg-gray-50 overflow-hidden">
          {draft.logo ? (
            <img src={draft.logo} alt="Logo preview" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">No Logo</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleUpload}
            className="px-2 py-1 text-[10px] rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Upload
          </button>
          {draft.logo && (
            <button
              onClick={handleRemoveLogo}
              className="px-2 py-1 text-[10px] rounded bg-[var(--color-surface)] text-red-500 hover:text-red-700 border border-[var(--color-border)] transition-colors cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 space-y-2">
        {TB_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
              {label}
            </label>
            <input
              className={inputClass}
              value={(draft as unknown as Record<string, string>)[key] ?? ""}
              onChange={(e) => updateField(key, e.target.value)}
              placeholder={placeholder}
            />
          </div>
        ))}

        {/* Custom fields */}
        {draft.customFields?.map((cf) => (
          <div key={cf.id}>
            <div className="flex items-center gap-1 mb-0.5">
              <input
                className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] bg-transparent border-b border-transparent focus:border-blue-400 outline-none flex-1"
                value={cf.label}
                onChange={(e) => updateCustomFieldLabel(cf.id, e.target.value)}
                placeholder="Field name"
              />
              <button
                onClick={() => removeCustomField(cf.id)}
                className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer px-1"
                title="Remove field"
              >
                &times;
              </button>
            </div>
            <input
              className={inputClass}
              value={cf.value}
              onChange={(e) => updateCustomField(cf.id, e.target.value)}
              placeholder="Value"
            />
          </div>
        ))}

        <button
          onClick={addCustomField}
          className="w-full mt-1 px-2 py-1 text-[10px] rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:border-[var(--color-text-muted)] transition-colors cursor-pointer"
        >
          + Add Custom Field
        </button>
      </div>
    </div>
  );
}

/* ─── Layout Tab (Interactive Grid Editor) ─────────────── */

const smallInput =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 w-14";
const smallSelect =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500";

const FONT_MAP: Record<string, string> = {
  "sans-serif": "'Inter', system-ui, sans-serif",
  "serif": "Georgia, serif",
  "monospace": "'Courier New', monospace",
};

function LayoutTab({
  draft,
  setDraft,
  tbDraft,
}: {
  draft: TitleBlockLayout;
  setDraft: React.Dispatch<React.SetStateAction<TitleBlockLayout>>;
  tbDraft: TitleBlock;
}) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cellId: string } | null>(null);
  const [resizing, setResizing] = useState<{
    type: "col" | "row";
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);
  const [dragSelect, setDragSelect] = useState<{
    startCellId: string;
    currentCellId: string;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const covered = useMemo(() => getCoveredPositions(draft.cells), [draft.cells]);

  // --- Helpers ---

  const updateCell = useCallback((cellId: string, updates: Partial<TitleBlockCell>) => {
    setDraft((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
    }));
  }, [setDraft]);

  const norm = (arr: number[]): number[] => {
    const sum = arr.reduce((a, b) => a + b, 0);
    if (sum === 0) return arr.map(() => 1 / arr.length);
    return arr.map((v) => v / sum);
  };

  const addRow = useCallback(() => {
    setDraft((prev) => {
      const newRows = norm([...prev.rows, prev.rows[prev.rows.length - 1] ?? 1]);
      const rowIdx = prev.rows.length;
      const newCells = [...prev.cells];
      // Check which columns are NOT covered by a rowSpan from above
      for (let c = 0; c < prev.columns.length; c++) {
        const coveredBySpan = prev.cells.some(
          (cell) => cell.row + cell.rowSpan > rowIdx && cell.col <= c && c < cell.col + cell.colSpan,
        );
        if (!coveredBySpan) {
          newCells.push(makeEmptyCell(rowIdx, c));
        }
      }
      return { ...prev, rows: newRows, cells: newCells };
    });
  }, [setDraft]);

  const addColumn = useCallback(() => {
    setDraft((prev) => {
      const newCols = norm([...prev.columns, prev.columns[prev.columns.length - 1] ?? 1]);
      const colIdx = prev.columns.length;
      const newCells = [...prev.cells];
      for (let r = 0; r < prev.rows.length; r++) {
        const coveredBySpan = prev.cells.some(
          (cell) => cell.col + cell.colSpan > colIdx && cell.row <= r && r < cell.row + cell.rowSpan,
        );
        if (!coveredBySpan) {
          newCells.push(makeEmptyCell(r, colIdx));
        }
      }
      return { ...prev, columns: newCols, cells: newCells };
    });
  }, [setDraft]);

  const deleteRow = useCallback((rowIdx: number) => {
    setDraft((prev) => {
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
  }, [setDraft]);

  const deleteColumn = useCallback((colIdx: number) => {
    setDraft((prev) => {
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
  }, [setDraft]);

  const insertRowAt = useCallback((rowIdx: number) => {
    setDraft((prev) => {
      const newRows = [...prev.rows];
      // Split the row at rowIdx: halve it and insert a copy
      const halfH = (prev.rows[rowIdx] ?? (1 / prev.rows.length)) / 2;
      newRows.splice(rowIdx, 1, halfH, halfH);
      // Shift cells below down by 1, expand rowSpans that cross the boundary
      let cells = prev.cells.map((c) => {
        if (c.row >= rowIdx) return { ...c, row: c.row + 1 };
        if (c.row + c.rowSpan > rowIdx) return { ...c, rowSpan: c.rowSpan + 1 };
        return c;
      });
      // Add empty cells for the new row where no span covers it
      for (let c = 0; c < prev.columns.length; c++) {
        const coveredBySpan = cells.some(
          (cell) => cell.row <= rowIdx && rowIdx < cell.row + cell.rowSpan && cell.col <= c && c < cell.col + cell.colSpan,
        );
        if (!coveredBySpan) {
          cells.push(makeEmptyCell(rowIdx, c));
        }
      }
      return { ...prev, rows: newRows, cells };
    });
  }, [setDraft]);

  const insertColumnAt = useCallback((colIdx: number) => {
    setDraft((prev) => {
      const newCols = [...prev.columns];
      const halfW = (prev.columns[colIdx] ?? (1 / prev.columns.length)) / 2;
      newCols.splice(colIdx, 1, halfW, halfW);
      let cells = prev.cells.map((c) => {
        if (c.col >= colIdx) return { ...c, col: c.col + 1 };
        if (c.col + c.colSpan > colIdx) return { ...c, colSpan: c.colSpan + 1 };
        return c;
      });
      for (let r = 0; r < prev.rows.length; r++) {
        const coveredBySpan = cells.some(
          (cell) => cell.col <= colIdx && colIdx < cell.col + cell.colSpan && cell.row <= r && r < cell.row + cell.rowSpan,
        );
        if (!coveredBySpan) {
          cells.push(makeEmptyCell(r, colIdx));
        }
      }
      return { ...prev, columns: newCols, cells };
    });
  }, [setDraft]);

  // --- Merge / Unmerge ---

  const canMerge = useMemo(() => {
    if (selectedCells.size < 2) return false;
    const selArr = draft.cells.filter((c) => selectedCells.has(c.id));
    if (selArr.length < 2) return false;
    const minR = Math.min(...selArr.map((c) => c.row));
    const maxR = Math.max(...selArr.map((c) => c.row + c.rowSpan - 1));
    const minC = Math.min(...selArr.map((c) => c.col));
    const maxC = Math.max(...selArr.map((c) => c.col + c.colSpan - 1));
    // Every cell in the rect must be selected
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = draft.cells.find((cl) => cl.row === r && cl.col === c);
        if (cell && !selectedCells.has(cell.id)) return false;
      }
    }
    return true;
  }, [selectedCells, draft.cells]);

  const mergeCells = useCallback(() => {
    const selArr = draft.cells.filter((c) => selectedCells.has(c.id));
    if (selArr.length < 2) return;
    const minR = Math.min(...selArr.map((c) => c.row));
    const maxR = Math.max(...selArr.map((c) => c.row + c.rowSpan - 1));
    const minC = Math.min(...selArr.map((c) => c.col));
    const maxC = Math.max(...selArr.map((c) => c.col + c.colSpan - 1));
    const topLeft = draft.cells.find((c) => c.row === minR && c.col === minC);
    if (!topLeft) return;
    const removeIds = new Set(selArr.map((c) => c.id));
    removeIds.delete(topLeft.id);
    setDraft((prev) => ({
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
  }, [draft.cells, selectedCells, setDraft]);

  const canUnmerge = useMemo(() => {
    if (selectedCells.size !== 1) return false;
    const cell = draft.cells.find((c) => selectedCells.has(c.id));
    return cell ? cell.colSpan > 1 || cell.rowSpan > 1 : false;
  }, [selectedCells, draft.cells]);

  const unmergeCells = useCallback(() => {
    const cell = draft.cells.find((c) => selectedCells.has(c.id));
    if (!cell) return;
    setDraft((prev) => {
      const newCells: TitleBlockCell[] = [];
      for (const c of prev.cells) {
        if (c.id === cell.id) {
          newCells.push({ ...c, colSpan: 1, rowSpan: 1 });
          for (let r = c.row; r < c.row + c.rowSpan; r++) {
            for (let col = c.col; col < c.col + c.colSpan; col++) {
              if (r === c.row && col === c.col) continue;
              newCells.push({
                id: nextCellId(),
                row: r,
                col,
                rowSpan: 1,
                colSpan: 1,
                content: { type: "static", text: "" },
                fontSize: c.fontSize,
                fontWeight: c.fontWeight,
                fontFamily: c.fontFamily,
                align: c.align,
                color: c.color,
              });
            }
          }
        } else {
          newCells.push(c);
        }
      }
      return { ...prev, cells: newCells };
    });
    setSelectedCells(new Set([cell.id]));
  }, [draft.cells, selectedCells, setDraft]);

  const resetLayout = useCallback(() => {
    setDraft(createDefaultLayout());
    setSelectedCells(new Set());
  }, [setDraft]);

  // --- Resize handlers ---

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
      startSizes: type === "col" ? [...draft.columns] : [...draft.rows],
    });
  }, [draft.columns, draft.rows]);

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
        setDraft((prev) => ({ ...prev, columns: sizes }));
      } else {
        setDraft((prev) => ({ ...prev, rows: sizes }));
      }
    }
  }, [resizing, setDraft]);

  const handleResizePointerUp = useCallback(() => {
    if (!resizing) return;
    // Normalize on release
    if (resizing.type === "col") {
      setDraft((prev) => ({ ...prev, columns: norm(prev.columns) }));
    } else {
      setDraft((prev) => ({ ...prev, rows: norm(prev.rows) }));
    }
    setResizing(null);
  }, [resizing, setDraft]);

  // --- Drag-to-select helpers ---

  const getCellsInRect = useCallback((idA: string, idB: string): Set<string> => {
    const a = draft.cells.find((c) => c.id === idA);
    const b = draft.cells.find((c) => c.id === idB);
    if (!a || !b) return new Set([idA, idB].filter(Boolean));
    // Bounding rectangle of both anchor cells (including their spans)
    const minR = Math.min(a.row, b.row);
    const maxR = Math.max(a.row + a.rowSpan - 1, b.row + b.rowSpan - 1);
    const minC = Math.min(a.col, b.col);
    const maxC = Math.max(a.col + a.colSpan - 1, b.col + b.colSpan - 1);
    const ids = new Set<string>();
    for (const c of draft.cells) {
      // Cell overlaps the rectangle if any part of it is inside
      const cellMaxR = c.row + c.rowSpan - 1;
      const cellMaxC = c.col + c.colSpan - 1;
      if (c.row <= maxR && cellMaxR >= minR && c.col <= maxC && cellMaxC >= minC) {
        ids.add(c.id);
      }
    }
    return ids;
  }, [draft.cells]);

  // Update selection live during drag
  useEffect(() => {
    if (!dragSelect) return;
    const ids = getCellsInRect(dragSelect.startCellId, dragSelect.currentCellId);
    setSelectedCells(ids);
  }, [dragSelect, getCellsInRect]);

  // --- Cell pointer events (drag-to-select) ---

  const handleCellPointerDown = useCallback((cellId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return; // left-click only
    e.preventDefault();
    if (e.shiftKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      });
    } else {
      setDragSelect({ startCellId: cellId, currentCellId: cellId });
      setSelectedCells(new Set([cellId]));
    }
    setContextMenu(null);
  }, []);

  const handleCellPointerEnter = useCallback((cellId: string) => {
    if (!dragSelect) return;
    setDragSelect((prev) => prev ? { ...prev, currentCellId: cellId } : null);
  }, [dragSelect]);

  const handleGridPointerUp = useCallback(() => {
    if (dragSelect) {
      setDragSelect(null);
    }
  }, [dragSelect]);

  // --- Context menu ---

  const handleContextMenu = useCallback((e: React.MouseEvent, cellId: string) => {
    e.preventDefault();
    // Also select the cell if not already selected
    if (!selectedCells.has(cellId)) {
      setSelectedCells(new Set([cellId]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, cellId });
  }, [selectedCells]);

  // End drag-select if pointer released anywhere
  useEffect(() => {
    if (!dragSelect) return;
    const handleUp = () => setDragSelect(null);
    document.addEventListener("pointerup", handleUp);
    return () => document.removeEventListener("pointerup", handleUp);
  }, [dragSelect]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const handleClick = () => setContextMenu(null);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleClick);
    };
  }, [contextMenu]);

  // --- Compute grid CSS ---

  const gridTemplateCols = draft.columns.map((w) => `${w}fr`).join(" ");
  const gridTemplateRows = draft.rows.map((h) => `${h}fr`).join(" ");

  // Aspect ratio: we want a comfortable editing size
  const gridW = 540;
  const aspect = draft.heightIn / draft.widthIn;
  const gridH = Math.max(80, Math.min(300, gridW * aspect));

  // Match page view font scaling: gridW pixels = widthIn inches, 72 points/inch
  const editorPxPerPt = gridW / draft.widthIn / 72;

  // Cumulative offsets for resize handles
  const colOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < draft.columns.length; i++) {
      offsets.push(offsets[i] + draft.columns[i]);
    }
    return offsets;
  }, [draft.columns]);

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < draft.rows.length; i++) {
      offsets.push(offsets[i] + draft.rows[i]);
    }
    return offsets;
  }, [draft.rows]);

  // Get the selected cell for properties panel
  const selectedCell = useMemo(() => {
    if (selectedCells.size !== 1) return null;
    const id = [...selectedCells][0];
    return draft.cells.find((c) => c.id === id) ?? null;
  }, [selectedCells, draft.cells]);

  // Context menu cell
  const ctxCell = contextMenu ? draft.cells.find((c) => c.id === contextMenu.cellId) : null;

  return (
    <div className="p-4 space-y-3">
      {/* Toolbar row: size + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Width:
          <input
            type="number"
            className={smallInput}
            value={draft.widthIn}
            onChange={(e) => setDraft((p) => ({ ...p, widthIn: Math.max(1, Math.min(16, Number(e.target.value))) }))}
            min={1}
            max={16}
            step={0.25}
          />
          <span className="text-[10px]">in</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Height:
          <input
            type="number"
            className={smallInput}
            value={draft.heightIn}
            onChange={(e) => setDraft((p) => ({ ...p, heightIn: Math.max(0.3, Math.min(4, Number(e.target.value))) }))}
            min={0.3}
            max={4}
            step={0.1}
          />
          <span className="text-[10px]">in</span>
        </label>

        <div className="h-4 w-px bg-[var(--color-border)]" />

        <button onClick={addRow} className="px-2 py-0.5 text-[10px] rounded border border-[var(--color-border)] text-[var(--color-text)] hover:bg-gray-100 cursor-pointer">
          + Row
        </button>
        <button onClick={addColumn} className="px-2 py-0.5 text-[10px] rounded border border-[var(--color-border)] text-[var(--color-text)] hover:bg-gray-100 cursor-pointer">
          + Column
        </button>

        <button
          onClick={mergeCells}
          disabled={!canMerge}
          className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${canMerge ? "border-blue-400 text-blue-600 hover:bg-blue-50" : "border-[var(--color-border)] text-[var(--color-text-muted)] opacity-40 cursor-default"}`}
        >
          Merge
        </button>
        <button
          onClick={unmergeCells}
          disabled={!canUnmerge}
          className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${canUnmerge ? "border-blue-400 text-blue-600 hover:bg-blue-50" : "border-[var(--color-border)] text-[var(--color-text-muted)] opacity-40 cursor-default"}`}
        >
          Unmerge
        </button>

        <button
          onClick={resetLayout}
          className="px-2 py-0.5 text-[10px] rounded border border-[var(--color-border)] text-red-500 hover:bg-red-50 cursor-pointer ml-auto"
        >
          Reset Default
        </button>
      </div>

      {/* Interactive Grid */}
      <div
        ref={gridRef}
        className="relative border border-gray-800 bg-white select-none"
        style={{ width: gridW, height: gridH }}
        onPointerMove={resizing ? handleResizePointerMove : undefined}
        onPointerUp={resizing ? handleResizePointerUp : handleGridPointerUp}
      >
        {/* CSS Grid of cells */}
        <div
          className="absolute inset-0"
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplateCols,
            gridTemplateRows: gridTemplateRows,
          }}
        >
          {draft.cells.map((cell) => {
            // Skip covered positions (they're spanned into by another cell)
            if (covered.has(`${cell.row},${cell.col}`)) return null;

            const isSelected = selectedCells.has(cell.id);

            // Compute displayed text
            let displayText = "";
            let textColor = cell.color;
            let isPlaceholder = false;
            switch (cell.content.type) {
              case "field": {
                const val = getFieldValue(tbDraft, cell.content.field);
                displayText = val || getFieldLabel(tbDraft, cell.content.field);
                if (!val) { textColor = "#9ca3af"; isPlaceholder = true; }
                break;
              }
              case "static":
                displayText = cell.content.text || "(empty)";
                if (!cell.content.text) { textColor = "#9ca3af"; isPlaceholder = true; }
                break;
              case "pageNumber":
                displayText = "Page 1 / 1";
                break;
              case "logo":
                break;
            }

            return (
              <div
                key={cell.id}
                className={`border border-gray-300 overflow-hidden flex items-center cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50 outline outline-2 outline-blue-500 -outline-offset-2 z-10"
                    : "hover:bg-gray-50"
                }`}
                style={{
                  gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
                  gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
                  justifyContent:
                    cell.align === "center" ? "center" : cell.align === "right" ? "flex-end" : "flex-start",
                  padding: "2px 4px",
                }}
                onPointerDown={(e) => handleCellPointerDown(cell.id, e)}
                onPointerEnter={() => handleCellPointerEnter(cell.id)}
                onContextMenu={(e) => handleContextMenu(e, cell.id)}
              >
                {cell.content.type === "logo" ? (
                  tbDraft.logo ? (
                    <img
                      src={tbDraft.logo}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">[Logo]</span>
                  )
                ) : (
                  <span
                    className="leading-tight truncate"
                    style={{
                      fontSize: cell.fontSize * editorPxPerPt,
                      fontFamily: FONT_MAP[cell.fontFamily] ?? "system-ui, sans-serif",
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
            key={`col-handle-${i}`}
            className="absolute top-0 bottom-0 z-20"
            style={{
              left: `${frac * 100}%`,
              width: 8,
              marginLeft: -4,
              cursor: "col-resize",
            }}
            onPointerDown={(e) => handleResizePointerDown(e, "col", i)}
          >
            {/* Visual indicator on hover */}
            <div className="w-px h-full mx-auto opacity-0 hover:opacity-100 bg-blue-400 transition-opacity" />
          </div>
        ))}

        {/* Row resize handles */}
        {rowOffsets.slice(1, -1).map((frac, i) => (
          <div
            key={`row-handle-${i}`}
            className="absolute left-0 right-0 z-20"
            style={{
              top: `${frac * 100}%`,
              height: 8,
              marginTop: -4,
              cursor: "row-resize",
            }}
            onPointerDown={(e) => handleResizePointerDown(e, "row", i)}
          >
            <div className="h-px w-full my-auto opacity-0 hover:opacity-100 bg-blue-400 transition-opacity" style={{ marginTop: 3 }} />
          </div>
        ))}
      </div>

      <div className="text-[10px] text-[var(--color-text-muted)]">
        Click and drag to select cells. Shift+click to toggle. Drag borders to resize. Right-click for more options.
      </div>

      {/* Context Menu */}
      {contextMenu && ctxCell && (
        <div
          className="fixed z-[60] bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenuItem
            label="Insert Row Above"
            onClick={() => { insertRowAt(ctxCell.row); setContextMenu(null); }}
          />
          <ContextMenuItem
            label="Insert Row Below"
            onClick={() => { insertRowAt(ctxCell.row + ctxCell.rowSpan); setContextMenu(null); }}
          />
          <ContextMenuItem
            label="Insert Column Left"
            onClick={() => { insertColumnAt(ctxCell.col); setContextMenu(null); }}
          />
          <ContextMenuItem
            label="Insert Column Right"
            onClick={() => { insertColumnAt(ctxCell.col + ctxCell.colSpan); setContextMenu(null); }}
          />

          <div className="h-px bg-gray-200 my-1" />

          <ContextMenuItem
            label="Delete Row"
            disabled={draft.rows.length <= 1}
            onClick={() => { deleteRow(ctxCell.row); setContextMenu(null); }}
          />
          <ContextMenuItem
            label="Delete Column"
            disabled={draft.columns.length <= 1}
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
            <ContextMenuItem
              label="Unmerge"
              onClick={() => { unmergeCells(); setContextMenu(null); }}
            />
          ) : (
            <>
              <ContextMenuItem
                label="Merge with Right"
                disabled={ctxCell.col + ctxCell.colSpan >= draft.columns.length}
                onClick={() => {
                  // Find the cell to the right and select both, then merge
                  const rightCell = draft.cells.find(
                    (c) => c.row === ctxCell.row && c.col === ctxCell.col + ctxCell.colSpan,
                  );
                  if (rightCell) {
                    setSelectedCells(new Set([ctxCell.id, rightCell.id]));
                    // Need to defer merge to after state update
                    setTimeout(() => {
                      setDraft((prev) => {
                        const removeIds = new Set([rightCell.id]);
                        return {
                          ...prev,
                          cells: prev.cells
                            .filter((c) => !removeIds.has(c.id))
                            .map((c) =>
                              c.id === ctxCell.id
                                ? { ...c, colSpan: c.colSpan + rightCell.colSpan }
                                : c,
                            ),
                        };
                      });
                      setSelectedCells(new Set([ctxCell.id]));
                    }, 0);
                  }
                  setContextMenu(null);
                }}
              />
              <ContextMenuItem
                label="Merge with Below"
                disabled={ctxCell.row + ctxCell.rowSpan >= draft.rows.length}
                onClick={() => {
                  const belowCell = draft.cells.find(
                    (c) => c.col === ctxCell.col && c.row === ctxCell.row + ctxCell.rowSpan,
                  );
                  if (belowCell) {
                    setTimeout(() => {
                      setDraft((prev) => {
                        const removeIds = new Set([belowCell.id]);
                        return {
                          ...prev,
                          cells: prev.cells
                            .filter((c) => !removeIds.has(c.id))
                            .map((c) =>
                              c.id === ctxCell.id
                                ? { ...c, rowSpan: c.rowSpan + belowCell.rowSpan }
                                : c,
                            ),
                        };
                      });
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

      {/* Cell Properties Panel */}
      {selectedCell && (
        <CellPropertiesPanel cell={selectedCell} updateCell={updateCell} tbDraft={tbDraft} />
      )}
    </div>
  );
}

/* ─── Context Menu Items ───────────────────────────────── */

function ContextMenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`w-full text-left px-3 py-1 text-xs cursor-pointer ${
        disabled
          ? "text-gray-300 cursor-default"
          : "text-gray-700 hover:bg-gray-100"
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

/* ─── Cell Properties Panel ────────────────────────────── */

function CellPropertiesPanel({
  cell,
  updateCell,
  tbDraft,
}: {
  cell: TitleBlockCell;
  updateCell: (cellId: string, updates: Partial<TitleBlockCell>) => void;
  tbDraft: TitleBlock;
}) {
  return (
    <div className="border border-[var(--color-border)] rounded p-2 bg-gray-50 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold">
        Selected Cell
        {(cell.colSpan > 1 || cell.rowSpan > 1) && (
          <span className="ml-2 normal-case tracking-normal font-normal">
            ({cell.colSpan} col{cell.colSpan > 1 ? "s" : ""} &times; {cell.rowSpan} row{cell.rowSpan > 1 ? "s" : ""})
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Content type */}
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
              {tbDraft.customFields?.map((f) => (
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
              className={smallInput + " !w-28"}
              value={cell.content.text}
              onChange={(e) => updateCell(cell.id, { content: { type: "static", text: e.target.value } })}
            />
          </label>
        )}

        <div className="h-4 w-px bg-[var(--color-border)]" />

        {/* Font */}
        <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
          Font:
          <select
            className={smallSelect}
            value={cell.fontFamily}
            onChange={(e) => updateCell(cell.id, { fontFamily: e.target.value as TitleBlockCell["fontFamily"] })}
          >
            <option value="sans-serif">Sans</option>
            <option value="serif">Serif</option>
            <option value="monospace">Mono</option>
          </select>
        </label>

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

        <div className="h-4 w-px bg-[var(--color-border)]" />

        {/* Alignment */}
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

        {/* Color */}
        <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
          <input
            type="color"
            className="w-5 h-5 border border-[var(--color-border)] rounded cursor-pointer"
            value={cell.color}
            onChange={(e) => updateCell(cell.id, { color: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
