import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore, GRID_SIZE } from "../store";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { scoreTemplate } from "../templateSearch";
import type { DeviceTemplate } from "../types";

export default function DeviceCreatorPicker({
  position: positionProp,
  onClose,
  onImport,
}: {
  position?: { x: number; y: number };
  onClose: () => void;
  onImport?: () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const createAndEditDevice = useSchematicStore((s) => s.createAndEditDevice);
  const rfInstance = useReactFlow();
  const [libraryTemplates, setLibraryTemplates] = useState<DeviceTemplate[]>(getBundledTemplates);

  useEffect(() => {
    fetchTemplates().then(setLibraryTemplates).catch(() => { /* keep bundled fallback */ });
  }, []);

  // Compute canvas position: use provided position or center of viewport
  const position = useMemo(() => {
    if (positionProp) return positionProp;
    const vp = rfInstance.getViewport();
    const container = document.querySelector(".react-flow");
    const cw = container?.clientWidth ?? window.innerWidth;
    const ch = container?.clientHeight ?? window.innerHeight;
    return {
      x: Math.round((-vp.x + cw / 2) / vp.zoom / GRID_SIZE) * GRID_SIZE,
      y: Math.round((-vp.y + ch / 2) / vp.zoom / GRID_SIZE) * GRID_SIZE,
    };
  }, [positionProp, rfInstance]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allTemplates = useMemo(
    () => [...libraryTemplates, ...customTemplates].filter((t) => t.category !== "Expansion Cards"),
    [libraryTemplates, customTemplates],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return allTemplates
      .map((t) => ({ template: t, score: scoreTemplate(t, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.template.label.localeCompare(b.template.label))
      .slice(0, 50)
      .map((r) => r.template);
  }, [allTemplates, search]);

  const createBlank = useCallback(() => {
    const blank: DeviceTemplate = {
      deviceType: "custom",
      label: "New Device",
      ports: [],
    };
    createAndEditDevice(blank, position);
    onClose();
  }, [createAndEditDevice, position, onClose]);

  const createFromTemplate = useCallback(
    (source: DeviceTemplate) => {
      // Deep clone ports so edits to the new device don't mutate the source
      const template: DeviceTemplate = {
        ...source,
        id: undefined,
        label: source.label,
        ports: source.ports.map((p) => ({ ...p })),
      };
      createAndEditDevice(template, position);
      onClose();
    },
    [createAndEditDevice, position, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && filtered.length === 0) {
      e.preventDefault();
      createBlank();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-72 flex flex-col overflow-hidden"
        style={{ left: "50%", top: "30%", transform: "translateX(-50%)" }}
      >
        <div className="px-3 pt-3 pb-1">
          <div className="text-xs font-semibold text-[var(--color-text-heading)] mb-2">
            Create New Device
          </div>
          <button
            onClick={createBlank}
            className="w-full text-left px-2.5 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-blue-400 hover:bg-blue-50 transition-colors mb-2"
          >
            <div className="text-xs font-medium text-[var(--color-text-heading)]">
              Start Blank
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              Empty device with no ports
            </div>
          </button>
          {onImport && (
            <button
              onClick={() => { onClose(); onImport(); }}
              className="w-full text-left px-2.5 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-blue-400 hover:bg-blue-50 transition-colors mb-2"
            >
              <div className="text-xs font-medium text-[var(--color-text-heading)]">
                Import from JSON or CSV
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Bulk-add devices from external data
              </div>
            </button>
          )}
        </div>

        <div className="px-3 pb-1">
          <div className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
            Or clone from library device
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the device library..."
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        <div className="max-h-48 overflow-y-auto px-3 pb-3 pt-1">
          {!search.trim() ? (
            <div className="text-[10px] text-[var(--color-text-muted)] py-2 text-center">
              Type to search {allTemplates.length} library devices
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-[10px] text-[var(--color-text-muted)] py-2 text-center">
              No matching devices
            </div>
          ) : (
            filtered.map((t) => {
              const key = t.id ?? t.deviceType;
              return (
                <button
                  key={key}
                  onClick={() => createFromTemplate(t)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-surface)] transition-colors flex items-center gap-2"
                >
                  {t.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[var(--color-text-heading)] truncate">
                      {t.label}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                      {t.manufacturer ? `${t.manufacturer} \u00b7 ` : ""}
                      {t.deviceType} \u00b7 {t.ports.length} port{t.ports.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
