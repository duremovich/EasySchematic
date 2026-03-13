import { useCallback, useRef, useState } from "react";
import { useSchematicStore } from "../store";
import type { SchematicFile } from "../types";
import PrintDialog from "./PrintDialog";
import AlignmentMenu from "./AlignmentMenu";

export default function Toolbar() {
  const {
    schematicName,
    setSchematicName,
    removeSelected,
    exportToJSON,
    importFromJSON,
    newSchematic,
  } = useSchematicStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(schematicName);
  const [showPrintDialog, setShowPrintDialog] = useState(false);

  const handleExport = useCallback(() => {
    const data = exportToJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportToJSON]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
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

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed) setSchematicName(trimmed);
    else setNameValue(schematicName);
    setEditingName(false);
  };

  return (
    <div className="h-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center px-3 gap-2 shrink-0">
      {/* Schematic Name */}
      {editingName ? (
        <input
          className="bg-transparent text-[var(--color-text-heading)] text-sm font-semibold outline-none border-b border-blue-500 max-w-[200px]"
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
      )}

      <div className="flex-1" />

      {/* Actions */}
      <ToolbarButton onClick={newSchematic} title="New schematic">
        New
      </ToolbarButton>
      <ToolbarButton onClick={handleExport} title="Export to JSON">
        Save
      </ToolbarButton>
      <ToolbarButton
        onClick={() => fileInputRef.current?.click()}
        title="Import from JSON"
      >
        Load
      </ToolbarButton>
      <ToolbarButton onClick={removeSelected} title="Delete selected (Del)">
        Delete
      </ToolbarButton>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <AlignmentMenu />
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <ToolbarButton onClick={() => setShowPrintDialog(true)} title="Print schematic (Ctrl+P)">
        Print
      </ToolbarButton>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />

      {showPrintDialog && (
        <PrintDialog onClose={() => setShowPrintDialog(false)} />
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2.5 py-1 text-xs rounded bg-white text-[var(--color-text)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}
