import { type DragEvent, useState, useMemo, useEffect } from "react";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { SIGNAL_LABELS } from "../types";
import type { DeviceTemplate } from "../types";
import { useSchematicStore } from "../store";
import { scoreTemplate } from "../templateSearch";
import RouterCreator from "./RouterCreator";

const APP_VERSION = __APP_VERSION__;
const BUILD_HASH = __BUILD_HASH__;

/** Preferred display order for categories — unlisted categories sort alphabetically at the end */
const CATEGORY_ORDER: string[] = [
  "Sources",
  "Peripherals",
  "Switching",
  "Processing",
  "Distribution",
  "Monitoring",
  "Projection",
  "Recording",
  "Mixing Consoles",
  "Audio",
  "Speakers & Amps",
  "Networking",
  "KVM / Extenders",
  "Wireless",
  "LED Video",
  "Media Servers",
  "Lighting",
  "Control",
  "Infrastructure",
  "Cable Accessories",
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
  hasPreset,
  isFavorite,
  onToggleFavorite,
}: {
  template: DeviceTemplate;
  query: string;
  onDelete?: () => void;
  hasPreset?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
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
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`shrink-0 text-xs cursor-pointer transition-colors ${
            isFavorite
              ? "text-amber-400"
              : "text-[var(--color-text-muted)]/30 opacity-0 group-hover:opacity-100"
          }`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      )}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-xs text-[var(--color-text-heading)] font-medium truncate flex items-center gap-1">
          <HighlightedText text={template.label} query={query} />
          {hasPreset && (
            <span className="text-[8px] text-blue-500 bg-blue-50 rounded px-1 py-px font-normal shrink-0">preset</span>
          )}
        </span>
        {template.manufacturer && (
          <span className="text-[9px] text-[var(--color-text-muted)] opacity-70 truncate">
            <HighlightedText text={template.manufacturer} query={query} />
          </span>
        )}
        <span className="text-[10px] text-[var(--color-text-muted)]">
          <HighlightedText text={signalText} query={query} />
        </span>
        {template.slots && template.slots.length > 0 && (
          <span className="text-[9px] text-[var(--color-text-muted)] opacity-60">
            {template.slots.length} slot{template.slots.length !== 1 ? "s" : ""}
          </span>
        )}
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
  presetIds,
  favoriteSet,
  onToggleFavorite,
}: {
  label: string;
  templates: DeviceTemplate[];
  query: string;
  defaultOpen: boolean;
  onDelete?: (deviceType: string) => void;
  presetIds?: Set<string>;
  favoriteSet?: Set<string>;
  onToggleFavorite?: (key: string) => void;
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
          {templates.map((template) => {
            const key = template.id ?? template.deviceType;
            return (
              <TemplateItem
                key={key}
                template={template}
                query={query}
                onDelete={onDelete ? () => onDelete(template.deviceType) : undefined}
                hasPreset={!!(template.id && presetIds?.has(template.id))}
                isFavorite={favoriteSet?.has(key)}
                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(key) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DeviceLibrary() {
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const removeCustomTemplate = useSchematicStore((s) => s.removeCustomTemplate);
  const templatePresets = useSchematicStore((s) => s.templatePresets);
  const favoriteTemplates = useSchematicStore((s) => s.favoriteTemplates);
  const toggleFavoriteTemplate = useSchematicStore((s) => s.toggleFavoriteTemplate);
  const [search, setSearch] = useState("");
  const [showRouterCreator, setShowRouterCreator] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [templates, setTemplates] = useState(getBundledTemplates);

  const presetIds = useMemo(() => new Set(Object.keys(templatePresets)), [templatePresets]);
  const favoriteSet = useMemo(() => new Set(favoriteTemplates), [favoriteTemplates]);

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => console.warn("Using bundled device library (API unavailable)"));
  }, []);

  const query = search.trim();

  const filteredCustom = useMemo(
    () =>
      query
        ? customTemplates.filter((t) => scoreTemplate(t, query) > 0)
        : customTemplates,
    [customTemplates, query],
  );

  // When searching, produce a flat ranked list; when browsing, keep categories
  const rankedResults = useMemo(() => {
    if (!query) return null;
    const all = [...templates, ...customTemplates].filter((t) => t.category !== "Expansion Cards");
    const scored = all
      .map((t) => {
        let score = scoreTemplate(t, query);
        // Boost favorites to the top of results
        if (score > 0 && favoriteSet.has(t.id ?? t.deviceType)) score += 200;
        return { template: t, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.template.label.localeCompare(b.template.label));
    return scored.map((r) => r.template);
  }, [templates, customTemplates, query, favoriteSet]);

  // Favorites section: resolve template keys to actual template objects
  const favoritesList = useMemo(() => {
    if (favoriteTemplates.length === 0) return [];
    const all = [...templates, ...customTemplates];
    const byKey = new Map<string, DeviceTemplate>();
    for (const t of all) byKey.set(t.id ?? t.deviceType, t);
    return favoriteTemplates.map((k) => byKey.get(k)).filter((t): t is DeviceTemplate => !!t);
  }, [templates, customTemplates, favoriteTemplates]);

  const filteredCategories = useMemo(() => {
    const groups = new Map<string, DeviceTemplate[]>();
    for (const t of templates) {
      // Expansion cards are only selectable via the slot picker, not the library
      if (t.category === "Expansion Cards") continue;
      const cat = t.category ?? "Other";
      const arr = groups.get(cat);
      if (arr) arr.push(t);
      else groups.set(cat, [t]);
    }
    // Sort each group alphabetically
    for (const arr of groups.values()) arr.sort((a, b) => a.label.localeCompare(b.label));
    // Sort categories by CATEGORY_ORDER, unknown ones alphabetically at end
    const orderIndex = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const ai = orderIndex.get(a) ?? 9999;
        const bi = orderIndex.get(b) ?? 9999;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
      })
      .map(([label, tmpls]) => ({ label, templates: tmpls }));
  }, [templates]);

  const totalResults = rankedResults?.length ??
    (filteredCustom.length + filteredCategories.reduce((sum, c) => sum + c.templates.length, 0));

  if (collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col items-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="Show device library"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        <div className="writing-mode-vertical text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          Devices
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          Devices
        </h2>
        <button
          onClick={() => setCollapsed(true)}
          className="cursor-pointer hover:bg-[var(--color-surface-hover)] rounded p-0.5 transition-colors"
          title="Collapse device library"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
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

      {showRouterCreator && <RouterCreator onClose={() => setShowRouterCreator(false)} />}

      {/* Device list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Note draggable */}
        {(!query || "note".includes(query.toLowerCase())) && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/easyschematic-note", "1");
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-amber-300/60 bg-amber-50 hover:bg-amber-100/60 cursor-grab active:cursor-grabbing transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M3 2h7l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
              <path d="M10 2v4h4" />
              <line x1="5" y1="8" x2="11" y2="8" />
              <line x1="5" y1="11" x2="9" y2="11" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Note</span>
          </div>
        )}

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

        {/* Quick Create Router */}
        {(!query || "router".includes(query.toLowerCase())) && (
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
        )}

        {query && rankedResults ? (
          <>
            {rankedResults.length > 0 ? (
              <div>
                {rankedResults.map((template) => {
                  const key = template.id ?? template.deviceType;
                  return (
                    <TemplateItem
                      key={key}
                      template={template}
                      query={query}
                      onDelete={customTemplates.includes(template) ? () => removeCustomTemplate(template.deviceType) : undefined}
                      hasPreset={!!(template.id && presetIds.has(template.id))}
                      isFavorite={favoriteSet.has(key)}
                      onToggleFavorite={() => toggleFavoriteTemplate(key)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
                No devices match &ldquo;{query}&rdquo;
              </div>
            )}
          </>
        ) : (
          <>
            {favoritesList.length > 0 && (
              <CategorySection
                label="Favorites"
                templates={favoritesList}
                query={query}
                defaultOpen={true}
                presetIds={presetIds}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
              />
            )}

            {customTemplates.length > 0 && (
              <CategorySection
                label="User Templates"
                templates={filteredCustom}
                query={query}
                defaultOpen={false}
                onDelete={removeCustomTemplate}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
              />
            )}

            {filteredCategories.map((cat) => (
              <CategorySection
                key={cat.label}
                label={cat.label}
                templates={cat.templates}
                query={query}
                defaultOpen={false}
                presetIds={presetIds}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
              />
            ))}
          </>
        )}
      </div>

      {/* Version */}
      <div className="px-3 py-1.5 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]">
        v{APP_VERSION} ({BUILD_HASH})
      </div>
    </div>
  );
}
