import { useCallback, useRef, useState } from "react";
import { useSchematicStore } from "../store";

export default function PageTabs() {
  const pages = useSchematicStore((s) => s.pages);
  const activePage = useSchematicStore((s) => s.activePage);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);
  const removeRackPage = useSchematicStore((s) => s.removeRackPage);
  const renameRackPage = useSchematicStore((s) => s.renameRackPage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((pageId: string, currentLabel: string) => {
    setEditingId(pageId);
    setEditValue(currentLabel);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameRackPage(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, renameRackPage]);

  const handleAdd = useCallback(() => {
    const index = pages.length + 1;
    addRackPage(`Rack Page ${index}`);
  }, [pages.length, addRackPage]);

  const handleContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    const label = pages.find((p) => p.id === pageId)?.label ?? "";
    if (confirm(`Delete rack page "${label}"? This will remove all racks and placements on this page.`)) {
      removeRackPage(pageId);
    }
  }, [pages, removeRackPage]);

  const tabClass = (isActive: boolean) =>
    `px-3 py-1 rounded-t border border-b-0 whitespace-nowrap transition-colors ${
      isActive
        ? "bg-white border-neutral-300 font-semibold text-neutral-900"
        : "bg-neutral-200 border-transparent text-neutral-600 hover:bg-neutral-50"
    }`;

  return (
    <div
      data-print-hide
      className="flex items-center gap-0.5 bg-neutral-100 border-b border-neutral-300 px-2 py-0 text-xs select-none overflow-x-auto"
      style={{ minHeight: 28 }}
    >
      {/* Schematic tab */}
      <button className={tabClass(activePage === "schematic")} onClick={() => setActivePage("schematic")}>
        Schematic
      </button>

      {/* Rack page tabs */}
      {pages.map((page) => (
        <button
          key={page.id}
          className={tabClass(activePage === page.id)}
          onClick={() => setActivePage(page.id)}
          onDoubleClick={() => startRename(page.id, page.label)}
          onContextMenu={(e) => handleContextMenu(e, page.id)}
          title="Double-click to rename, right-click to delete"
        >
          {editingId === page.id ? (
            <input
              ref={inputRef}
              className="bg-white border border-blue-400 rounded px-1 py-0 text-xs w-24 outline-none"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            page.label
          )}
        </button>
      ))}

      {/* Add page button */}
      <button
        className="px-2 py-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded"
        onClick={handleAdd}
        title="Add rack elevation page"
      >
        +
      </button>
    </div>
  );
}
