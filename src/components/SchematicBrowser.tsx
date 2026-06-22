import { useEffect, useState } from "react";
import {
  deleteCloudSchematic,
  renameCloudSchematic,
  toggleSchematicSharing,
  setSchematicAsTemplate,
  clearSchematicTemplate,
  type CloudSchematic,
} from "../templateApi";
import { useSchematicStore } from "../store";
import { listSchematics, loadSchematic } from "../cloudSync";
import type { CachedSchematic } from "../cloudCache";
import type { SchematicFile } from "../types";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SchematicBrowser({ onClose }: { onClose: () => void }) {
  const [schematics, setSchematics] = useState<CachedSchematic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isOnline = useSchematicStore((s) => s.isOnline);

  useEffect(() => {
    let cancelled = false;

    void listSchematics()
      .then((list) => {
        if (!cancelled) setSchematics(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load schematics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpen = async (s: CachedSchematic) => {
    try {
      const data = await loadSchematic(s.id);
      useSchematicStore.getState().importFromJSON(data as SchematicFile);
      useSchematicStore.getState().setCloudSchematicId(s.id);
      useSchematicStore.getState().setCloudSavedAt(s.updated_at);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open schematic");
    }
  };

  const handleDelete = async (s: CloudSchematic) => {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    try {
      await deleteCloudSchematic(s.id);
      // If we just deleted the currently-open cloud schematic, clear the ID
      if (useSchematicStore.getState().cloudSchematicId === s.id) {
        useSchematicStore.getState().setCloudSchematicId(null);
        useSchematicStore.getState().setCloudSavedAt(null);
      }
      setSchematics((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleRename = async (s: CloudSchematic) => {
    const name = renameValue.trim();
    if (!name || name === s.name) {
      setRenamingId(null);
      return;
    }
    try {
      const updated = await renameCloudSchematic(s.id, name);
      setSchematics((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...updated } : x)));
      setRenamingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename");
    }
  };

  const handleShare = async (s: CloudSchematic) => {
    try {
      const updated = await toggleSchematicSharing(s.id, !s.shared);
      setSchematics((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle sharing");
    }
  };

  const handleToggleTemplate = async (s: CachedSchematic) => {
    try {
      if (s.is_template) {
        await clearSchematicTemplate();
        setSchematics((prev) => prev.map((x) => ({ ...x, is_template: x.id === s.id ? 0 : x.is_template })));
      } else {
        await setSchematicAsTemplate(s.id);
        setSchematics((prev) => prev.map((x) => ({ ...x, is_template: x.id === s.id ? 1 : 0 })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update template");
    }
  };

  const copyShareLink = (s: CloudSchematic) => {
    if (!s.share_token) return;
    const url = `${window.location.origin}/s/${s.share_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const canOpen = (s: CachedSchematic) => isOnline || s.data != null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-heading)" }}>
              My Schematics
            </h2>
            {!loading && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text-muted)" }}>
                {schematics.length} / 10
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {/* Offline banner */}
          {!isOnline && (
            <div className="mb-3 px-3 py-2 rounded text-xs bg-amber-50 text-amber-800 border border-amber-200">
              You're offline — showing cached schematics. Changes will sync when you reconnect.
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 mb-3">{error}</p>
          )}

          {loading ? (
            <p className="text-xs py-8 text-center" style={{ color: "var(--color-text-muted)" }}>Loading...</p>
          ) : schematics.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
              {isOnline
                ? "No saved schematics yet. Use File → Save to Cloud to save your first schematic."
                : "No cached schematics available offline."
              }
            </p>
          ) : (
            <div className="space-y-1">
              {schematics.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[var(--color-surface-hover)] transition-colors group"
                >
                  {/* Name / inline rename */}
                  <div className="flex-1 min-w-0">
                    {renamingId === s.id ? (
                      <input
                        className="bg-transparent text-xs font-medium outline-none border-b border-blue-500 w-full"
                        style={{ color: "var(--color-text-heading)" }}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRename(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(s);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <p className="text-xs font-medium truncate" style={{ color: "var(--color-text-heading)" }}>
                        {s.name}
                      </p>
                    )}
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {formatDate(s.updated_at)}{s.size_bytes ? ` · ${formatSize(s.size_bytes)}` : ""}
                      {s.shared ? " · Shared" : ""}
                      {s.is_template ? " · New File Template" : ""}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleOpen(s)}
                      disabled={!canOpen(s)}
                      title={canOpen(s) ? undefined : "Not cached — open when online"}
                      className="px-2 py-1 text-[10px] rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}
                      disabled={!isOnline}
                      title={isOnline ? "Rename" : "Requires internet connection"}
                      className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleShare(s)}
                      disabled={!isOnline}
                      title={isOnline ? (s.shared ? "Disable sharing" : "Enable sharing") : "Requires internet connection"}
                      className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke={s.shared ? "#3b82f6" : "currentColor"} strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </button>
                    {s.shared && s.share_token && (
                      <button
                        onClick={() => copyShareLink(s)}
                        title="Copy share link"
                        className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke={copiedId === s.id ? "#22c55e" : "currentColor"} strokeWidth={2}>
                          {copiedId === s.id ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          )}
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleTemplate(s)}
                      disabled={!isOnline}
                      title={isOnline ? (s.is_template ? "Remove as New File Template" : "Set as New File Template") : "Requires internet connection"}
                      className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill={s.is_template ? "#eab308" : "none"} viewBox="0 0 24 24" stroke={s.is_template ? "#eab308" : "currentColor"} strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={!isOnline}
                      title={isOnline ? "Delete" : "Requires internet connection"}
                      className="p-1 rounded hover:bg-red-50 text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex justify-end border-t shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded transition-colors cursor-pointer"
            style={{
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
