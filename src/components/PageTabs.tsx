import { useCallback, useEffect, useRef, useState } from "react";
import { useSchematicStore } from "../store";

interface ContextMenuState {
  pageId: string;
  x: number;
  y: number;
}

export default function PageTabs() {
  const pages = useSchematicStore((s) => s.pages);
  const activePage = useSchematicStore((s) => s.activePage);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);
  const removeRackPage = useSchematicStore((s) => s.removeRackPage);
  const renameRackPage = useSchematicStore((s) => s.renameRackPage);
  const addPrintSheetPage = useSchematicStore((s) => s.addPrintSheetPage);
  const removePrintSheetPage = useSchematicStore((s) => s.removePrintSheetPage);
  const renamePrintSheetPage = useSchematicStore((s) => s.renamePrintSheetPage);
  const duplicateRackPage = useSchematicStore((s) => s.duplicateRackPage);
  const duplicatePrintSheetPage = useSchematicStore((s) => s.duplicatePrintSheetPage);
  const addPatchPanelPage = useSchematicStore((s) => s.addPatchPanelPage);
  const removePatchPanelPage = useSchematicStore((s) => s.removePatchPanelPage);
  const renamePatchPanelPage = useSchematicStore((s) => s.renamePatchPanelPage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const startRename = useCallback((pageId: string, currentLabel: string) => {
    setContextMenu(null);
    setEditingId(pageId);
    setEditValue(currentLabel);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingId || !editValue.trim()) { setEditingId(null); return; }
    const page = pages.find((p) => p.id === editingId);
    if (!page) { setEditingId(null); return; }
    if (page.type === "print-sheet") renamePrintSheetPage(editingId, editValue.trim());
    else if (page.type === "patch-panel") renamePatchPanelPage(editingId, editValue.trim());
    else renameRackPage(editingId, editValue.trim());
    setEditingId(null);
  }, [editingId, editValue, pages, renameRackPage, renamePrintSheetPage, renamePatchPanelPage]);

  const handleContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ pageId, x: e.clientX, y: e.clientY });
  }, []);

  const menuPage = contextMenu ? pages.find((p) => p.id === contextMenu.pageId) : null;
  const isPrintSheet = menuPage?.type === "print-sheet";
  const isPatchBay = menuPage?.type === "patch-panel";

  const handleRename = () => {
    if (!menuPage) return;
    startRename(menuPage.id, menuPage.label);
  };

  const handleDuplicate = () => {
    if (!menuPage || menuPage.type === "patch-panel") return;
    setContextMenu(null);
    if (menuPage.type === "print-sheet") duplicatePrintSheetPage(menuPage.id);
    else duplicateRackPage(menuPage.id);
  };

  const handleDelete = () => {
    if (!menuPage) return;
    setContextMenu(null);
    if (menuPage.type === "print-sheet") {
      if (confirm(`Delete print sheet "${menuPage.label}"?`)) removePrintSheetPage(menuPage.id);
    } else if (menuPage.type === "patch-panel") {
      if (confirm(`Delete patch bay page "${menuPage.label}"? Panels and patch assignments are kept — only the tab is removed.`)) {
        removePatchPanelPage(menuPage.id);
      }
    } else {
      if (confirm(`Delete rack page "${menuPage.label}"? This will remove all racks and placements on this page.`)) {
        removeRackPage(menuPage.id);
      }
    }
  };

  type TabVariant = "rack" | "print" | "patch";
  const tabClass = (isActive: boolean, variant: TabVariant = "rack") =>
    `px-3 py-1 rounded-t border border-b-0 whitespace-nowrap transition-colors ${
      isActive
        ? variant === "print"
          ? "bg-white border-violet-400 font-semibold text-violet-900"
          : variant === "patch"
            ? "bg-white border-sky-400 font-semibold text-sky-900"
            : "bg-white border-neutral-300 font-semibold text-neutral-900"
        : variant === "print"
          ? "bg-violet-50 border-transparent text-violet-600 hover:bg-violet-100"
          : variant === "patch"
            ? "bg-sky-50 border-transparent text-sky-600 hover:bg-sky-100"
            : "bg-neutral-200 border-transparent text-neutral-600 hover:bg-neutral-50"
    }`;

  return (
    <>
      <div
        data-print-hide
        className="flex items-center gap-0.5 bg-neutral-100 border-b border-neutral-300 px-2 py-0 text-xs select-none overflow-x-auto"
        style={{ minHeight: 28 }}
      >
        {/* Schematic tab */}
        <button className={tabClass(activePage === "schematic")} onClick={() => setActivePage("schematic")}>
          Schematic
        </button>

        {/* Page tabs */}
        {pages.map((page) => {
          const variant: TabVariant =
            page.type === "print-sheet" ? "print" : page.type === "patch-panel" ? "patch" : "rack";
          const isPrint = page.type === "print-sheet";
          return (
            <button
              key={page.id}
              className={tabClass(activePage === page.id, variant)}
              onClick={() => setActivePage(page.id)}
              onDoubleClick={() => startRename(page.id, page.label)}
              onContextMenu={(e) => handleContextMenu(e, page.id)}
              title="Double-click to rename, right-click for options"
            >
              {editingId === page.id ? (
                <input
                  ref={inputRef}
                  className="bg-white border border-blue-400 rounded px-1 py-0 text-xs w-24 outline-none"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>{isPrint ? "📄 " : page.type === "patch-panel" ? "🔌 " : ""}{page.label}</>
              )}
            </button>
          );
        })}

        {/* Add rack page */}
        <button
          className="px-2 py-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded"
          onClick={() => addRackPage(`Rack Page ${pages.filter((p) => p.type === "rack-elevation").length + 1}`)}
          title="Add rack elevation page"
        >
          +
        </button>

        {/* Add print sheet */}
        <button
          className="px-2 py-1 text-violet-400 hover:text-violet-700 hover:bg-violet-100 rounded"
          onClick={() => addPrintSheetPage()}
          title="Add print sheet"
        >
          📄+
        </button>

        {/* Add patch bay page (single instance — hidden once it exists) */}
        {!pages.some((p) => p.type === "patch-panel") && (
          <button
            className="px-2 py-1 text-sky-400 hover:text-sky-700 hover:bg-sky-100 rounded"
            onClick={() => addPatchPanelPage()}
            title="Add patch bay page"
          >
            🔌+
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && menuPage && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[140px] text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-400 border-b border-neutral-100 mb-1 truncate">
            {isPrintSheet ? "📄 " : isPatchBay ? "🔌 " : ""}{menuPage.label}
          </div>
          <button
            className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
            onClick={handleRename}
          >
            Rename
          </button>
          {!isPatchBay && (
            <button
              className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
              onClick={handleDuplicate}
            >
              Duplicate
            </button>
          )}
          <div className="border-t border-gray-100 my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
