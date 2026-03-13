import { type DragEvent, useState, useMemo } from "react";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import { SIGNAL_LABELS } from "../types";
import type { DeviceTemplate } from "../types";
import { useSchematicStore } from "../store";
import RouterCreator from "./RouterCreator";

const APP_VERSION = __APP_VERSION__;

const CATEGORIES: { label: string; types: string[] }[] = [
  { label: "Sources", types: ["camera", "ptz-camera", "graphics", "computer"] },
  { label: "Peripherals", types: ["mouse", "keyboard"] },
  { label: "Switching", types: ["switcher", "router"] },
  { label: "Processing", types: ["converter", "adapter", "frame-sync", "multiviewer"] },
  { label: "Distribution", types: ["da", "video-wall-controller"] },
  { label: "Monitoring", types: ["monitor", "tv"] },
  { label: "Projection", types: ["projector"] },
  { label: "Recording", types: ["recorder"] },
  { label: "Audio", types: ["audio-mixer"] },
  { label: "Networking", types: ["ndi-encoder", "ndi-decoder", "network-switch"] },
];

function onDragStart(event: DragEvent, template: DeviceTemplate) {
  event.dataTransfer.setData(
    "application/easyschematic-device",
    JSON.stringify(template),
  );
  event.dataTransfer.effectAllowed = "move";
}

function getUniqueSignalTypes(template: DeviceTemplate): string[] {
  const types = new Set(template.ports.map((p) => p.signalType));
  return [...types];
}

function templateMatchesSearch(template: DeviceTemplate, query: string): boolean {
  const q = query.toLowerCase();
  if (template.label.toLowerCase().includes(q)) return true;
  if (template.deviceType.toLowerCase().includes(q)) return true;
  if (template.searchTerms?.some((t) => t.toLowerCase().includes(q))) return true;
  for (const port of template.ports) {
    if (port.signalType.toLowerCase().includes(q)) return true;
    if (SIGNAL_LABELS[port.signalType].toLowerCase().includes(q)) return true;
    if (port.label.toLowerCase().includes(q)) return true;
  }
  return false;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-blue-600 font-semibold">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

function TemplateItem({
  template,
  query,
  onDelete,
}: {
  template: DeviceTemplate;
  query: string;
  onDelete?: () => void;
}) {
  const signalText = getUniqueSignalTypes(template)
    .map((t) => SIGNAL_LABELS[t as keyof typeof SIGNAL_LABELS])
    .join(" / ");

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded cursor-grab hover:bg-[var(--color-surface-hover)] transition-colors group"
      draggable
      onDragStart={(e) => onDragStart(e, template)}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-xs text-[var(--color-text-heading)] font-medium truncate">
          <HighlightedText text={template.label} query={query} />
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          <HighlightedText text={signalText} query={query} />
        </span>
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-1 transition-opacity"
          title="Delete template"
        >
          &times;
        </button>
      )}
    </div>
  );
}

function CategorySection({
  label,
  templates,
  query,
  defaultOpen,
  onDelete,
}: {
  label: string;
  templates: DeviceTemplate[];
  query: string;
  defaultOpen: boolean;
  onDelete?: (deviceType: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = query ? true : open;

  if (templates.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-full px-1 mb-0.5 cursor-pointer group/cat"
      >
        <span
          className={`text-[9px] text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] group-hover/cat:text-[var(--color-text)] transition-colors">
          {label}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] ml-auto opacity-60">
          {templates.length}
        </span>
      </button>
      {isOpen && (
        <div>
          {templates.map((template) => (
            <TemplateItem
              key={template.deviceType}
              template={template}
              query={query}
              onDelete={onDelete ? () => onDelete(template.deviceType) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeviceLibrary() {
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const removeCustomTemplate = useSchematicStore((s) => s.removeCustomTemplate);
  const [search, setSearch] = useState("");
  const [showRouterCreator, setShowRouterCreator] = useState(false);

  const query = search.trim();

  const filteredCustom = useMemo(
    () =>
      query
        ? customTemplates.filter((t) => templateMatchesSearch(t, query))
        : customTemplates,
    [customTemplates, query],
  );

  const filteredCategories = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const all = DEVICE_TEMPLATES.filter((t) =>
          cat.types.includes(t.deviceType),
        );
        const filtered = query
          ? all.filter((t) => templateMatchesSearch(t, query))
          : all;
        return { ...cat, templates: filtered };
      }),
    [query],
  );

  const totalResults = filteredCustom.length +
    filteredCategories.reduce((sum, c) => sum + c.templates.length, 0);

  return (
    <div className="w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          Devices
        </h2>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-[var(--color-border)]">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices..."
            className="w-full bg-white border border-[var(--color-border)] rounded pl-7 pr-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm cursor-pointer"
            >
              &times;
            </button>
          )}
        </div>
        {query && (
          <div className="text-[10px] text-[var(--color-text-muted)] mt-1 px-0.5">
            {totalResults} result{totalResults !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Quick Create */}
      <div className="px-2 py-1.5 border-b border-[var(--color-border)]">
        <button
          onClick={() => setShowRouterCreator(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-blue-400/50 bg-blue-50/50 hover:bg-blue-50 text-xs text-blue-600 hover:text-blue-700 cursor-pointer transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="1" y="3" width="14" height="10" rx="1.5" />
            <line x1="1" y1="8" x2="15" y2="8" />
            <line x1="5.5" y1="3" x2="5.5" y2="13" />
          </svg>
          Quick Create Router
        </button>
      </div>

      {showRouterCreator && <RouterCreator onClose={() => setShowRouterCreator(false)} />}

      {/* Device list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Room draggable */}
        {(!query || "room".includes(query.toLowerCase())) && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/easyschematic-room",
                JSON.stringify({ label: "Room" }),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-hover)] cursor-grab active:cursor-grabbing transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" strokeDasharray="3 2" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Room</span>
          </div>
        )}

        {(query ? filteredCustom.length > 0 : customTemplates.length > 0) && (
          <CategorySection
            label="Custom"
            templates={filteredCustom}
            query={query}
            defaultOpen={false}
            onDelete={removeCustomTemplate}
          />
        )}

        {filteredCategories.map((cat) => (
          <CategorySection
            key={cat.label}
            label={cat.label}
            templates={cat.templates}
            query={query}
            defaultOpen={false}
          />
        ))}

        {query && totalResults === 0 && (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
            No devices match "{query}"
          </div>
        )}
      </div>

      {/* Version */}
      <div className="px-3 py-1.5 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]">
        v{APP_VERSION}
      </div>
    </div>
  );
}
