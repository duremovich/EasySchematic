import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { exportImage } from "../exportUtils";
import { exportDxf } from "../dxfExport";
import { exportPdf } from "../pdfExport";
import { exportTemplatesToFile, readTemplateFile } from "../templateExport";
import { PAPER_SIZES } from "../printConfig";
import type { SchematicFile, SchematicNode, AnnotationData } from "../types";
import ReportsDialog, { type ReportsTab } from "./ReportsDialog";
import TitleBlockDialog from "./TitleBlockDialog";
import AboutDialog from "./AboutDialog";
import PreferencesDialog from "./PreferencesDialog";
import AlignmentMenu from "./AlignmentMenu";
import UserMenuButton from "./UserMenuButton";
import SchematicBrowser from "./SchematicBrowser";
import LoginDialog from "./LoginDialog";
import { checkSession, saveSchematicToCloud, updateSchematicInCloud } from "../templateApi";
import ViewOptionsPanel from "./ViewOptionsPanel";
import ShowInfoPanel from "./ShowInfoPanel";
import SignalColorPanel from "./SignalColorPanel";

// ─── Menu data types ─────────────────────────────────────────────

interface MenuItemDef {
  type: "item";
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

interface MenuSeparatorDef {
  type: "separator";
}

type MenuEntry = MenuItemDef | MenuSeparatorDef;

// ─── Sub-components ──────────────────────────────────────────────

function MenuSeparator() {
  return <div className="h-px bg-[var(--color-border)] my-1" />;
}

function MenuItem({
  label,
  shortcut,
  checked,
  disabled,
  title,
  onClick,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-left gap-2"
    >
      <span className="w-4 text-center shrink-0 text-[10px]">
        {checked != null ? (checked ? "✓" : "") : ""}
      </span>
      <span className="flex-1 text-[var(--color-text)]">{label}</span>
      {shortcut && (
        <span className="text-[var(--color-text-muted)] text-[10px] ml-4 whitespace-nowrap">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuDropdown({ items, onClose }: { items: MenuEntry[]; onClose: () => void }) {
  return (
    <div className="absolute top-full left-0 mt-0.5 min-w-[220px] bg-white border border-[var(--color-border)] rounded-lg shadow-lg p-1 z-50">
      {items.map((entry, i) => {
        if (entry.type === "separator") return <MenuSeparator key={i} />;
        return (
          <MenuItem
            key={i}
            label={entry.label}
            shortcut={entry.shortcut}
            checked={entry.checked}
            disabled={entry.disabled}
            title={entry.title}
            onClick={() => {
              entry.onClick();
              onClose();
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Main MenuBar ────────────────────────────────────────────────

export default function MenuBar() {
  const {
    schematicName,
    setSchematicName,
    exportToJSON,
    importFromJSON,
    newSchematic,
    undo,
    redo,
  } = useSchematicStore();

  const printView = useSchematicStore((s) => s.printView);
  const undoSize = useSchematicStore((s) => s.undoSize);
  const redoSize = useSchematicStore((s) => s.redoSize);

  const reactFlowInstance = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [activeMobilePanel, setActiveMobilePanel] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(schematicName);
  const [reportsTab, setReportsTab] = useState<ReportsTab | null>(null);
  const [showTitleBlockDialog, setShowTitleBlockDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSchematicBrowser, setShowSchematicBrowser] = useState(false);
  const [showCloudLogin, setShowCloudLogin] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check login state on mount
  useEffect(() => {
    checkSession().then((u) => setIsLoggedIn(!!u));
  }, []);

  const cloudSchematicId = useSchematicStore((s) => s.cloudSchematicId);
  const cloudSavedAt = useSchematicStore((s) => s.cloudSavedAt);

  // Keep nameValue in sync when schematicName changes externally
  useEffect(() => {
    if (!editingName) setNameValue(schematicName);
  }, [schematicName, editingName]);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  // Close mobile menu/panel on Escape + lock body scroll
  useEffect(() => {
    if (!mobileMenuOpen && !activeMobilePanel) return;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        setActiveMobilePanel(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileMenuOpen, activeMobilePanel]);

  // ─── File actions ──────────────────────────────────────

  const handleSave = useCallback(() => {
    const data = exportToJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportToJSON]);

  const handleOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert("File is too large (max 10 MB). Please use a smaller schematic file.");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as SchematicFile;
          importFromJSON(data);
        } catch {
          alert("Invalid schematic file.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [importFromJSON],
  );

  const handleSaveArchive = useCallback(() => {
    const templates = useSchematicStore.getState().exportCustomTemplates();
    if (templates.length === 0) {
      alert("No custom device templates to export.");
      return;
    }
    exportTemplatesToFile(templates);
  }, []);

  const handleOpenArchive = useCallback(() => {
    archiveInputRef.current?.click();
  }, []);

  const handleImportArchive = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const templates = await readTemplateFile(file);
        useSchematicStore.getState().importCustomTemplates(templates);
        alert(`Imported ${templates.length} device template${templates.length === 1 ? "" : "s"}.`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Invalid device archive file.");
      }
      e.target.value = "";
    },
    [],
  );

  const handleCloudSave = useCallback(async () => {
    const session = await checkSession();
    if (!session) {
      setShowCloudLogin(true);
      return;
    }
    setCloudSaving(true);
    try {
      const data = exportToJSON();
      const store = useSchematicStore.getState();
      if (store.cloudSchematicId) {
        const result = await updateSchematicInCloud(store.cloudSchematicId, data);
        store.setCloudSavedAt(result.updated_at);
      } else {
        const result = await saveSchematicToCloud(data);
        store.setCloudSchematicId(result.id);
        store.setCloudSavedAt(result.updated_at);
      }
      setIsLoggedIn(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save to cloud");
    } finally {
      setCloudSaving(false);
    }
  }, [exportToJSON]);

  // Listen for keyboard shortcut events from App.tsx
  useEffect(() => {
    const onSave = () => {
      handleSave();
      // Also save to cloud in parallel if cloud-backed
      const store = useSchematicStore.getState();
      if (store.cloudSchematicId) {
        checkSession().then((session) => {
          if (!session) return;
          const data = store.exportToJSON();
          updateSchematicInCloud(store.cloudSchematicId!, data)
            .then((result) => store.setCloudSavedAt(result.updated_at))
            .catch(() => {}); // fire-and-forget
        });
      }
    };
    const onOpen = () => handleOpen();
    window.addEventListener("easyschematic:save", onSave);
    window.addEventListener("easyschematic:open", onOpen);
    return () => {
      window.removeEventListener("easyschematic:save", onSave);
      window.removeEventListener("easyschematic:open", onOpen);
    };
  }, [handleSave, handleOpen]);

  // ─── Export helpers ────────────────────────────────────

  const doExportPng = () => exportImage(reactFlowInstance, { format: "png", pixelRatio: 4 });
  const doExportSvg = () => exportImage(reactFlowInstance, { format: "svg" });
  const doExportDxf = () => exportDxf(reactFlowInstance);
  const doExportPdf = () => {
    const state = useSchematicStore.getState();
    const paper = PAPER_SIZES.find((p) => p.id === state.printPaperId) ?? PAPER_SIZES[2];
    exportPdf(
      reactFlowInstance,
      paper,
      state.printOrientation,
      state.printScale,
      state.titleBlock,
      state.titleBlockLayout,
    );
  };

  // ─── Name editing ──────────────────────────────────────

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed) setSchematicName(trimmed);
    else setNameValue(schematicName);
    setEditingName(false);
  };

  // ─── Menu definitions ─────────────────────────────────

  const addAnnotation = useCallback((shape: AnnotationData["shape"]) => {
    const state = useSchematicStore.getState();
    state.pushSnapshot();
    const viewport = reactFlowInstance.getViewport();
    // Place annotation in the center of the current viewport
    const x = (-viewport.x + window.innerWidth / 2) / viewport.zoom - 100;
    const y = (-viewport.y + window.innerHeight / 2) / viewport.zoom - 50;
    const newNode: SchematicNode = {
      id: `annotation-${Date.now()}`,
      type: "annotation",
      position: { x, y },
      data: { shape, color: "rgba(59, 130, 246, 0.1)", borderColor: "#3b82f6" } as AnnotationData,
      style: { width: 200, height: 100 },
    };
    useSchematicStore.setState({ nodes: [...state.nodes, newNode] });
    state.saveToLocalStorage();
  }, [reactFlowInstance]);

  const closeMenu = () => setOpenMenu(null);

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { type: "item", label: "New", onClick: newSchematic },
      { type: "separator" },
      { type: "item", label: "Save Schematic", shortcut: "Ctrl+S", onClick: handleSave },
      { type: "item", label: "Open Schematic...", shortcut: "Ctrl+O", onClick: handleOpen },
      { type: "separator" },
      { type: "item", label: cloudSaving ? "Saving..." : "Save to Cloud", disabled: cloudSaving, onClick: handleCloudSave },
      { type: "item", label: "My Schematics...", disabled: !isLoggedIn, title: isLoggedIn ? undefined : "Must be logged in", onClick: () => setShowSchematicBrowser(true) },
      { type: "separator" },
      { type: "item", label: "Save Device Archive", onClick: handleSaveArchive },
      { type: "item", label: "Import Device Archive...", onClick: handleOpenArchive },
      { type: "separator" },
      { type: "item", label: "Preferences...", onClick: () => setShowPreferences(true) },
    ],
    Edit: [
      { type: "item", label: "Undo", shortcut: "Ctrl+Z", disabled: undoSize === 0, onClick: undo },
      { type: "item", label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: redoSize === 0, onClick: redo },
      { type: "separator" },
      { type: "item", label: "Copy", shortcut: "Ctrl+C", onClick: () => useSchematicStore.getState().copySelected() },
      { type: "item", label: "Paste", shortcut: "Ctrl+V", onClick: () => useSchematicStore.getState().pasteClipboard() },
      { type: "item", label: "Delete", shortcut: "Del", onClick: () => useSchematicStore.getState().removeSelected() },
      { type: "separator" },
      { type: "item", label: "Select All", shortcut: "Ctrl+A", onClick: () => useSchematicStore.getState().selectAll() },
    ],
    Insert: [
      { type: "item", label: "Add Rectangle", onClick: () => addAnnotation("rectangle") },
      { type: "item", label: "Add Ellipse", onClick: () => addAnnotation("ellipse") },
    ],
    View: [
      {
        type: "item",
        label: "Print View",
        shortcut: "F9",
        checked: printView,
        onClick: () => useSchematicStore.getState().setPrintView(!printView),
      },
      {
        type: "item",
        label: "Hide Unconnected Ports",
        checked: useSchematicStore.getState().hideUnconnectedPorts,
        onClick: () => {
          const s = useSchematicStore.getState();
          s.setHideUnconnectedPorts(!s.hideUnconnectedPorts);
        },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Debug Edges",
        shortcut: "Ctrl+B",
        checked: useSchematicStore.getState().debugEdges,
        onClick: () => useSchematicStore.getState().toggleDebugEdges(),
      },
    ],
    Export: [
      { type: "item", label: "Export as PNG", onClick: doExportPng },
      { type: "item", label: "Export as SVG", onClick: doExportSvg },
      { type: "item", label: "Export as DXF", onClick: doExportDxf },
      { type: "item", label: "Export as PDF", onClick: doExportPdf },
      { type: "separator" },
      { type: "item", label: "Title Block...", onClick: () => setShowTitleBlockDialog(true) },
    ],
    Reports: [
      { type: "item", label: "Network Report...", onClick: () => setReportsTab("network") },
      { type: "item", label: "Device List...", onClick: () => setReportsTab("devices") },
      { type: "item", label: "Pack List...", onClick: () => setReportsTab("packList") },
      { type: "item", label: "Cable Schedule...", onClick: () => setReportsTab("cableSchedule") },
      { type: "item", label: "Power Report...", onClick: () => setReportsTab("power") },
    ],
    Help: [
      {
        type: "item",
        label: "Documentation \u2197",
        onClick: () => window.open("https://docs.easyschematic.live", "_blank", "noopener,noreferrer"),
      },
      {
        type: "item",
        label: "Device Database \u2197",
        onClick: () => window.open("https://devices.easyschematic.live", "_blank", "noopener,noreferrer"),
      },
      { type: "separator" },
      {
        type: "item",
        label: "About EasySchematic",
        onClick: () => setShowAboutDialog(true),
      },
    ],
  };

  const menuNames = Object.keys(menus);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setOpenSection(null);
  };

  const MobileAccordionSection = ({ name, items }: { name: string; items: MenuEntry[] }) => {
    const isOpen = openSection === name;
    return (
      <div className="border-b border-[var(--color-border)]">
        <button
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={() => setOpenSection(isOpen ? null : name)}
        >
          {name}
          <svg
            className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="pb-2 px-2">
            {items.map((entry, i) => {
              if (entry.type === "separator") return <div key={i} className="h-px bg-[var(--color-border)] my-1 mx-2" />;
              return (
                <button
                  key={i}
                  disabled={entry.disabled}
                  onClick={() => {
                    entry.onClick();
                    closeMobileMenu();
                  }}
                  className="flex items-center w-full px-4 py-2.5 text-sm rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-left gap-3"
                >
                  <span className="w-5 text-center shrink-0 text-xs">
                    {entry.checked != null ? (entry.checked ? "\u2713" : "") : ""}
                  </span>
                  <span className="flex-1 text-[var(--color-text)]">{entry.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={menuBarRef}>
      {/* Desktop menu bar */}
      <div className="hidden md:flex h-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] items-center px-1 shrink-0 select-none">
        {/* Left: logo + brand + menus */}
        <div className="flex items-center">
          <div className="flex items-center gap-2 px-3 shrink-0">
            <img src="/favicon.svg" alt="" className="w-5 h-5" />
            <span className="text-xs font-semibold text-[var(--color-text-heading)] tracking-tight">
              EasySchematic
            </span>
          </div>
          <div className="w-px h-5 bg-[var(--color-border)]" />
          {menuNames.map((name) => (
            <div key={name} className="relative">
              <button
                className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                  openMenu === name
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-heading)]"
                }`}
                onClick={() => setOpenMenu(openMenu === name ? null : name)}
                onMouseEnter={() => {
                  if (openMenu && openMenu !== name) setOpenMenu(name);
                }}
              >
                {name}
              </button>
              {openMenu === name && (
                <MenuDropdown items={menus[name]} onClose={closeMenu} />
              )}
            </div>
          ))}
        </div>

        {/* Center: schematic name */}
        <div className="flex-1 flex justify-center">
          {editingName ? (
            <input
              className="bg-transparent text-[var(--color-text-heading)] text-sm font-semibold outline-none border-b border-blue-500 max-w-[200px] text-center"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className="text-sm font-semibold text-[var(--color-text-heading)] cursor-pointer hover:text-blue-600 transition-colors"
                onDoubleClick={() => {
                  setNameValue(schematicName);
                  setEditingName(true);
                }}
                title="Double-click to rename"
              >
                {schematicName}
              </span>
              {cloudSchematicId && (
                <span
                  title={cloudSavedAt ? `Cloud saved: ${new Date(cloudSavedAt + "Z").toLocaleString()}` : "Cloud-backed schematic"}
                >
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </span>
              )}
            </span>
          )}
        </div>

        {/* Right: undo/redo + alignment */}
        <div className="flex items-center gap-1">
          <button
            title="Undo (Ctrl+Z)"
            disabled={undoSize === 0}
            onClick={undo}
            className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-[var(--color-text)]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h7a3 3 0 0 1 0 6H9" />
              <path d="M6 4 3 7l3 3" />
            </svg>
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            disabled={redoSize === 0}
            onClick={redo}
            className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-[var(--color-text)]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 7H6a3 3 0 0 0 0 6h1" />
              <path d="M10 4l3 3-3 3" />
            </svg>
          </button>
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <AlignmentMenu />
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <UserMenuButton />
        </div>
      </div>

      {/* Mobile header bar */}
      <div className="flex md:hidden h-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] items-center px-3 shrink-0 select-none justify-between">
        <img src="/favicon.svg" alt="" className="w-5 h-5" />
        <span className="text-sm font-semibold text-[var(--color-text-heading)] truncate mx-3 flex-1 text-center">
          {schematicName}
        </span>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text)]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] bg-[var(--color-surface)] flex flex-col">
          {/* Overlay header: undo/redo + close */}
          <div className="flex items-center justify-between px-3 h-12 border-b border-[var(--color-border)] shrink-0">
            <div className="flex items-center gap-2">
              <button
                disabled={undoSize === 0}
                onClick={undo}
                className="p-2 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--color-text)]"
              >
                <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h7a3 3 0 0 1 0 6H9" />
                  <path d="M6 4 3 7l3 3" />
                </svg>
              </button>
              <button
                disabled={redoSize === 0}
                onClick={redo}
                className="p-2 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--color-text)]"
              >
                <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 7H6a3 3 0 0 0 0 6h1" />
                  <path d="M10 4l3 3-3 3" />
                </svg>
              </button>
            </div>
            <span className="text-sm font-semibold text-[var(--color-text-heading)]">Menu</span>
            <button
              onClick={closeMobileMenu}
              className="p-2 rounded hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text)]"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable menu sections */}
          <div className="flex-1 overflow-y-auto">
            {menuNames.map((name) => (
              <MobileAccordionSection key={name} name={name} items={menus[name]} />
            ))}

            {/* Panels section */}
            <div className="border-b border-[var(--color-border)]">
              <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Panels
              </div>
              {[
                { key: "viewOptions", label: "View Options" },
                { key: "showInfo", label: "Show Info" },
                { key: "signalColors", label: "Signal Colors" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    closeMobileMenu();
                    setActiveMobilePanel(key);
                  }}
                  className="flex items-center w-full px-8 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors text-left"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer: user section */}
          <div className="border-t border-[var(--color-border)] px-4 py-3 shrink-0">
            <UserMenuButton />
          </div>
        </div>
      )}

      {/* Mobile panel overlay */}
      {activeMobilePanel && (
        <div className="fixed inset-0 z-[100] bg-[var(--color-surface)] flex flex-col md:hidden">
          {activeMobilePanel === "viewOptions" && (
            <ViewOptionsPanel mobile onClose={() => setActiveMobilePanel(null)} />
          )}
          {activeMobilePanel === "showInfo" && (
            <ShowInfoPanel mobile onClose={() => setActiveMobilePanel(null)} />
          )}
          {activeMobilePanel === "signalColors" && (
            <SignalColorPanel mobile onClose={() => setActiveMobilePanel(null)} />
          )}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
      <input
        ref={archiveInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportArchive}
      />

      {reportsTab && (
        <ReportsDialog initialTab={reportsTab} onClose={() => setReportsTab(null)} />
      )}
      {showTitleBlockDialog && (
        <TitleBlockDialog onClose={() => setShowTitleBlockDialog(false)} />
      )}
      {showAboutDialog && (
        <AboutDialog onClose={() => setShowAboutDialog(false)} />
      )}
      {showPreferences && (
        <PreferencesDialog onClose={() => setShowPreferences(false)} />
      )}
      {showSchematicBrowser && (
        <SchematicBrowser onClose={() => setShowSchematicBrowser(false)} />
      )}
      <LoginDialog open={showCloudLogin} onClose={() => setShowCloudLogin(false)} />
    </div>
  );
}
