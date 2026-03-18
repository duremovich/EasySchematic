import { useState, useCallback, useRef, useEffect } from "react";
import type { CellAddress, SpreadsheetColumn, FillSeriesConfig } from "./types";
import { FILL_SERIES_CONFIGS } from "./fillSeries";

function cellKey(rowIndex: number, columnId: string): string {
  return `${rowIndex}:${columnId}`;
}

function parseCellKey(key: string): CellAddress {
  const sep = key.indexOf(":");
  return { rowIndex: Number(key.slice(0, sep)), columnId: key.slice(sep + 1) };
}

export interface FillSeriesRequest {
  config: FillSeriesConfig;
  startValue: string;
  cellCount: number;
  columnId: string;
  /** Row indices in visual order */
  rowIndices: number[];
}

interface Options<TRow> {
  rowCount: number;
  columns: SpreadsheetColumn<TRow>[];
  isCellEditable: (rowIndex: number, columnId: string) => boolean;
  getCellValue: (rowIndex: number, columnId: string) => string;
  onCellChange: (rowIndex: number, columnId: string, value: string) => void;
  onBatchChange: (changes: { rowIndex: number; columnId: string; value: string }[]) => void;
}

export function useSpreadsheetSelection<TRow>(options: Options<TRow>) {
  const { rowCount, columns, isCellEditable, getCellValue, onCellChange, onBatchChange } = options;

  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [anchorCell, setAnchorCell] = useState<CellAddress | null>(null);
  const [editingCell, setEditingCell] = useState<CellAddress | null>(null);
  const [editValue, setEditValue] = useState("");
  const [fillSeriesRequest, setFillSeriesRequest] = useState<FillSeriesRequest | null>(null);

  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedCells(new Set());
    setSelectedColumn(null);
    setAnchorCell(null);
    setEditingCell(null);
    setEditValue("");
  }, []);

  // Clear selection when row count changes (sort/filter)
  const prevRowCount = useRef(rowCount);
  /* eslint-disable react-hooks/set-state-in-effect -- resetting on row count change */
  useEffect(() => {
    if (prevRowCount.current !== rowCount) {
      prevRowCount.current = rowCount;
      clearSelection();
    }
  }, [rowCount, clearSelection]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectRange = useCallback(
    (colId: string, from: number, to: number): Set<string> => {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const next = new Set<string>();
      for (let i = lo; i <= hi; i++) {
        if (isCellEditable(i, colId)) {
          next.add(cellKey(i, colId));
        }
      }
      return next;
    },
    [isCellEditable],
  );

  const handleCellMouseDown = useCallback(
    (rowIndex: number, columnId: string, e: React.MouseEvent) => {
      if (!isCellEditable(rowIndex, columnId)) return;
      // Don't interfere with editing cell clicks
      if (editingCell && editingCell.rowIndex === rowIndex && editingCell.columnId === columnId) return;

      // Cancel any current edit without committing
      if (editingCell) {
        setEditingCell(null);
        setEditValue("");
      }

      const key = cellKey(rowIndex, columnId);

      if (e.shiftKey && anchorCell && anchorCell.columnId === columnId) {
        // Range select from anchor
        const range = selectRange(columnId, anchorCell.rowIndex, rowIndex);
        setSelectedCells(range);
      } else if ((e.ctrlKey || e.metaKey) && selectedColumn === columnId) {
        // Toggle individual cell in same column
        setSelectedCells((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        setAnchorCell({ rowIndex, columnId });
      } else {
        // Single select (new column or plain click)
        const next = new Set<string>();
        next.add(key);
        setSelectedCells(next);
        setSelectedColumn(columnId);
        setAnchorCell({ rowIndex, columnId });

        // Start drag tracking
        isDragging.current = true;
      }

      // Focus container for keyboard events
      containerRef.current?.focus();
      e.preventDefault();
    },
    [isCellEditable, editingCell, anchorCell, selectedColumn, selectRange],
  );

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, columnId: string) => {
      if (!isDragging.current || !anchorCell || anchorCell.columnId !== columnId) return;
      const range = selectRange(columnId, anchorCell.rowIndex, rowIndex);
      setSelectedCells(range);
    },
    [anchorCell, selectRange],
  );

  // Global mouseup to stop dragging
  useEffect(() => {
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const enterEditMode = useCallback(
    (rowIndex: number, columnId: string, initialValue?: string) => {
      if (!isCellEditable(rowIndex, columnId)) return;
      const val = initialValue ?? getCellValue(rowIndex, columnId);
      setEditingCell({ rowIndex, columnId });
      setEditValue(val);
    },
    [isCellEditable, getCellValue],
  );

  const handleCellDoubleClick = useCallback(
    (rowIndex: number, columnId: string) => {
      if (!isCellEditable(rowIndex, columnId)) return;
      enterEditMode(rowIndex, columnId);
    },
    [isCellEditable, enterEditMode],
  );

  const commitEdit = useCallback(
    (value: string) => {
      if (!editingCell) return;

      const selectedCount = selectedCells.size;
      const col = columns.find((c) => c.id === editingCell.columnId);

      if (selectedCount > 1 && col?.fillType && FILL_SERIES_CONFIGS[col.fillType]) {
        // Multi-selection with fill series support: trigger fill series dialog
        const config = FILL_SERIES_CONFIGS[col.fillType];
        // Get selected row indices sorted
        const rowIndices = Array.from(selectedCells)
          .map(parseCellKey)
          .filter((a) => a.columnId === editingCell.columnId)
          .map((a) => a.rowIndex)
          .sort((a, b) => a - b);

        setEditingCell(null);
        setEditValue("");
        setFillSeriesRequest({
          config,
          startValue: value,
          cellCount: rowIndices.length,
          columnId: editingCell.columnId,
          rowIndices,
        });
      } else if (selectedCount > 1) {
        // Multi-selection without fill series: apply same value to all selected cells
        const changes = Array.from(selectedCells)
          .map(parseCellKey)
          .map((addr) => ({ rowIndex: addr.rowIndex, columnId: addr.columnId, value }));
        onBatchChange(changes);
        setEditingCell(null);
        setEditValue("");
      } else {
        // Single cell: commit directly
        onCellChange(editingCell.rowIndex, editingCell.columnId, value);
        setEditingCell(null);
        setEditValue("");
      }
    },
    [editingCell, selectedCells, columns, onCellChange, onBatchChange],
  );

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
    containerRef.current?.focus();
  }, []);

  const applyFillSeries = useCallback(
    (values: string[]) => {
      if (!fillSeriesRequest) return;
      const changes = fillSeriesRequest.rowIndices.map((rowIndex, i) => ({
        rowIndex,
        columnId: fillSeriesRequest.columnId,
        value: values[i],
      }));
      onBatchChange(changes);
      setFillSeriesRequest(null);
      clearSelection();
    },
    [fillSeriesRequest, onBatchChange, clearSelection],
  );

  const dismissFillSeries = useCallback(() => {
    setFillSeriesRequest(null);
  }, []);

  // Handle keyboard on the container
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't handle if we're in edit mode (editor handles its own keys)
      if (editingCell) return;

      if (selectedCells.size === 0) return;

      // Get the "active" cell (anchor or first selected)
      const activeCell = anchorCell ?? parseCellKey(Array.from(selectedCells)[0]);

      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const changes = Array.from(selectedCells).map((k) => {
          const addr = parseCellKey(k);
          return { rowIndex: addr.rowIndex, columnId: addr.columnId, value: "" };
        });
        onBatchChange(changes);
        return;
      }

      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        enterEditMode(activeCell.rowIndex, activeCell.columnId);
        return;
      }

      // Arrow key navigation
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const nextRow = activeCell.rowIndex + dir;
        if (nextRow >= 0 && nextRow < rowCount && isCellEditable(nextRow, activeCell.columnId)) {
          if (e.shiftKey) {
            // Extend selection
            const range = selectRange(activeCell.columnId, anchorCell?.rowIndex ?? activeCell.rowIndex, nextRow);
            setSelectedCells(range);
          } else {
            const next = new Set<string>();
            next.add(cellKey(nextRow, activeCell.columnId));
            setSelectedCells(next);
            setAnchorCell({ rowIndex: nextRow, columnId: activeCell.columnId });
          }
        }
        return;
      }

      // Printable character → enter edit mode with that char
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        enterEditMode(activeCell.rowIndex, activeCell.columnId, e.key);
        return;
      }
    },
    [editingCell, selectedCells, anchorCell, clearSelection, enterEditMode, onBatchChange, rowCount, isCellEditable, selectRange],
  );

  // Returns props for each table cell
  const getCellProps = useCallback(
    (rowIndex: number, columnId: string) => {
      const key = cellKey(rowIndex, columnId);
      const isSelected = selectedCells.has(key);
      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === columnId;
      const editable = isCellEditable(rowIndex, columnId);

      return {
        isSelected,
        isEditing,
        editable,
        onMouseDown: (e: React.MouseEvent) => handleCellMouseDown(rowIndex, columnId, e),
        onMouseEnter: () => handleCellMouseEnter(rowIndex, columnId),
        onDoubleClick: () => handleCellDoubleClick(rowIndex, columnId),
      };
    },
    [selectedCells, editingCell, isCellEditable, handleCellMouseDown, handleCellMouseEnter, handleCellDoubleClick],
  );

  const getContainerProps = useCallback(() => ({
    ref: containerRef,
    tabIndex: 0,
    onKeyDown: handleContainerKeyDown,
    style: { outline: "none" } as React.CSSProperties,
  }), [handleContainerKeyDown]);

  return {
    selectedCells,
    selectedColumn,
    editingCell,
    editValue,
    setEditValue,
    fillSeriesRequest,
    getCellProps,
    getContainerProps,
    commitEdit,
    cancelEdit,
    clearSelection,
    applyFillSeries,
    dismissFillSeries,
  };
}
