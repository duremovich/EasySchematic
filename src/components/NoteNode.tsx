import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { NoteNode as NoteNodeType } from "../types";
import { useSchematicStore } from "../store";
import { sanitizeNoteHtml } from "../sanitizeHtml";

const FORMATS = [
  { cmd: "bold", label: "B", style: "font-bold" },
  { cmd: "italic", label: "I", style: "italic" },
  { cmd: "underline", label: "U", style: "underline" },
] as const;

const SIZES = [
  { label: "S", size: "2" },
  { label: "M", size: "3" },
  { label: "L", size: "5" },
] as const;

function NoteNodeComponent({ id, data, selected }: NodeProps<NoteNodeType>) {
  const updateNoteHtml = useSchematicStore((s) => s.updateNoteHtml);
  const pushSnapshot = useSchematicStore((s) => s.pushSnapshot);
  const [editing, setEditing] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const snapshotPushed = useRef(false);

  // Populate on mount + sync external data changes when not editing
  useEffect(() => {
    if (editorRef.current && !editing) {
      editorRef.current.innerHTML = sanitizeNoteHtml(data.html);
    }
  }, [data.html, editing]);

  const startEditing = useCallback(() => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(el);
        sel.collapseToEnd();
      }
    });
  }, []);

  const commit = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    if (html !== data.html) {
      updateNoteHtml(id, html);
    }
    setEditing(false);
    snapshotPushed.current = false;
  }, [id, data.html, updateNoteHtml]);

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      if (containerRef.current?.contains(e.relatedTarget as Node)) return;
      commit();
    },
    [commit],
  );

  const onInput = useCallback(() => {
    if (!snapshotPushed.current) {
      pushSnapshot();
      snapshotPushed.current = true;
    }
  }, [pushSnapshot]);

  const refreshFormats = useCallback(() => {
    const active = new Set<string>();
    for (const { cmd } of FORMATS) {
      if (document.queryCommandState(cmd)) active.add(cmd);
    }
    setActiveFormats(active);
  }, []);

  // Listen for selection changes to update active format buttons
  useEffect(() => {
    if (!editing) return;
    const handler = () => {
      // Only update if selection is inside our editor
      const sel = window.getSelection();
      if (sel && editorRef.current?.contains(sel.anchorNode)) {
        refreshFormats();
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [editing, refreshFormats]);

  const execCmd = useCallback((cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    refreshFormats();
  }, [refreshFormats]);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={60}
        lineStyle={{ borderColor: "var(--color-border)" }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-border)" }}
      />
      {/* nodrag + nowheel on the whole container when editing so React Flow doesn't intercept */}
      <div
        ref={containerRef}
        className={`w-full h-full rounded border bg-amber-50 flex flex-col ${
          editing ? "nodrag nowheel" : ""
        } ${
          selected ? "border-amber-400 shadow-md shadow-amber-200/40" : "border-amber-300/60"
        }`}
      >
        {/* Formatting toolbar — visible only when editing */}
        {editing && (
          <div
            className="flex items-center gap-0.5 px-1.5 py-0.5 border-b border-amber-300/40 bg-amber-100/60 rounded-t"
            onMouseDown={(e) => e.preventDefault()}
          >
            {FORMATS.map(({ cmd, label, style }) => (
              <button
                key={cmd}
                onMouseDown={(e) => {
                  e.preventDefault();
                  execCmd(cmd);
                }}
                className={`w-5 h-5 flex items-center justify-center rounded text-[10px] ${style} transition-colors ${
                  activeFormats.has(cmd)
                    ? "bg-amber-300/80 text-amber-950"
                    : "text-amber-800 hover:bg-amber-200/60"
                }`}
                title={cmd}
              >
                {label}
              </button>
            ))}
            <div className="w-px h-3 bg-amber-300/60 mx-0.5" />
            {SIZES.map(({ label, size }) => (
              <button
                key={size}
                onMouseDown={(e) => {
                  e.preventDefault();
                  execCmd("fontSize", size);
                }}
                className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-amber-800 hover:bg-amber-200/60 transition-colors"
                title={`Size ${label}`}
              >
                {label}
              </button>
            ))}
            <div className="w-px h-3 bg-amber-300/60 mx-0.5" />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                execCmd("insertUnorderedList");
              }}
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-amber-800 hover:bg-amber-200/60 transition-colors"
              title="Bullet list"
            >
              &bull;
            </button>
          </div>
        )}
        {/* Editable content area */}
        <div
          ref={editorRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onDoubleClick={!editing ? startEditing : undefined}
          onBlur={handleBlur}
          onInput={onInput}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              execCmd(e.shiftKey ? "outdent" : "indent");
            }
          }}
          className={`flex-1 px-2 py-1 text-[11px] text-amber-950 outline-none overflow-auto whitespace-pre-wrap break-words ${
            editing ? "cursor-text" : "cursor-default select-none"
          }`}
          style={{ minHeight: 0 }}
        />
      </div>
    </>
  );
}

export default memo(NoteNodeComponent);
