import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { SIGNAL_LABELS } from "../types";
import type { DeviceTemplate } from "../types";
import { useSchematicStore, GRID_SIZE } from "../store";
import { scoreTemplate } from "../templateSearch";

const MAX_RESULTS = 12;

type SpecialItem = { kind: "note" } | { kind: "room" } | { kind: "create" };
type ResultItem = { type: "device"; template: DeviceTemplate } | { type: "special"; item: SpecialItem; label: string; subtitle: string };

const SPECIAL_ITEMS: { item: SpecialItem; label: string; subtitle: string; keywords: string[] }[] = [
  { item: { kind: "note" }, label: "Note", subtitle: "Text annotation", keywords: ["note", "text", "annotation", "label", "comment"] },
  { item: { kind: "room" }, label: "Room", subtitle: "Grouping container", keywords: ["room", "group", "area", "zone", "container"] },
  { item: { kind: "create" }, label: "Create New Device", subtitle: "Blank or copy from existing", keywords: ["create", "new", "custom", "blank", "device", "empty"] },
];

function scoreSpecial(keywords: string[], query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let matched = 0;
  for (const word of words) {
    if (keywords.some((k) => k.includes(word))) matched++;
  }
  return matched === words.length ? 90 : 0;
}

export default function QuickAddDevice({
  position,
  onClose,
  onOpenDeviceCreator,
}: {
  position: { x: number; y: number };
  onClose: () => void;
  onOpenDeviceCreator?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [openPanel, setOpenPanel] = useState<"category" | "brand" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const addDevice = useSchematicStore((s) => s.addDevice);
  const addNote = useSchematicStore((s) => s.addNote);
  const addRoom = useSchematicStore((s) => s.addRoom);
  const reparentNode = useSchematicStore((s) => s.reparentNode);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const favoriteTemplates = useSchematicStore((s) => s.favoriteTemplates);

  const [templates, setTemplates] = useState(getBundledTemplates);
  const favoriteSet = useMemo(() => new Set(favoriteTemplates), [favoriteTemplates]);
  const allTemplates = useMemo(() => [...templates, ...customTemplates], [templates, customTemplates]);

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => {});
  }, []);

  // Cross-filtered dropdown options
  const categories = useMemo(() => {
    const source = selectedBrands.size > 0
      ? allTemplates.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer))
      : allTemplates;
    return [...new Set(source.map((t) => t.category).filter(Boolean))].sort() as string[];
  }, [allTemplates, selectedBrands]);

  const brands = useMemo(() => {
    const source = selectedCategories.size > 0
      ? allTemplates.filter((t) => t.category && selectedCategories.has(t.category))
      : allTemplates;
    return [...new Set(source.map((t) => t.manufacturer).filter(Boolean))].sort() as string[];
  }, [allTemplates, selectedCategories]);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand); else next.add(brand);
      return next;
    });
  }, []);

  const query = search.trim();
  const hasFilter = selectedCategories.size > 0 || selectedBrands.size > 0;

  const results: ResultItem[] = useMemo(() => {
    // Pre-filter templates by active filters
    const filtered = allTemplates.filter((t) => {
      if (selectedCategories.size > 0 && (!t.category || !selectedCategories.has(t.category))) return false;
      if (selectedBrands.size > 0 && (!t.manufacturer || !selectedBrands.has(t.manufacturer))) return false;
      return true;
    });

    const deviceItems: { item: ResultItem; score: number }[] = filtered.map((t) => {
      let score = query ? scoreTemplate(t, query) : 0;
      if (score > 0 && favoriteSet.has(t.id ?? t.deviceType)) score += 200;
      return { item: { type: "device" as const, template: t }, score };
    });

    // Hide special items when filters are active (they aren't devices)
    const specialItems: { item: ResultItem; score: number }[] = hasFilter
      ? []
      : SPECIAL_ITEMS.map((s) => ({
          item: { type: "special" as const, item: s.item, label: s.label, subtitle: s.subtitle },
          score: query ? scoreSpecial(s.keywords, query) : 0,
        }));

    const all = [...specialItems, ...deviceItems];

    if (!query) {
      // No query: show specials first, then favorites, then alphabetical
      const specials = specialItems.map((s) => s.item);
      const favs = deviceItems
        .filter((d) => d.item.type === "device" && favoriteSet.has(d.item.template.id ?? d.item.template.deviceType))
        .map((d) => d.item);
      const rest = deviceItems
        .filter((d) => d.item.type === "device" && !favoriteSet.has(d.item.template.id ?? d.item.template.deviceType))
        .sort((a, b) => {
          const al = a.item.type === "device" ? a.item.template.label : "";
          const bl = b.item.type === "device" ? b.item.template.label : "";
          return al.localeCompare(bl);
        })
        .map((d) => d.item);
      return [...specials, ...favs, ...rest].slice(0, MAX_RESULTS);
    }

    return all
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)
      .slice(0, MAX_RESULTS);
  }, [allTemplates, selectedCategories, selectedBrands, query, favoriteSet, hasFilter]);

  // Reset selection when results change
  /* eslint-disable react-hooks/set-state-in-effect -- resetting derived state */
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const placeDevice = useCallback(
    (template: DeviceTemplate) => {
      const w = 180;
      const portRows = Math.max(
        template.ports.filter((p) => p.direction === "input").length,
        template.ports.filter((p) => p.direction === "output").length,
      ) + template.ports.filter((p) => p.direction === "bidirectional").length;
      const h = 60 + portRows * 20;
      const centered = {
        x: Math.round((position.x - w / 2) / GRID_SIZE) * GRID_SIZE,
        y: Math.round((position.y - h / 2) / GRID_SIZE) * GRID_SIZE,
      };
      addDevice(template, centered);
      setTimeout(() => {
        const state = useSchematicStore.getState();
        const lastDevice = state.nodes.filter((n) => n.type === "device").at(-1);
        if (lastDevice) reparentNode(lastDevice.id, centered, { skipUndo: true });
      }, 0);
      onClose();
    },
    [addDevice, reparentNode, position, onClose],
  );

  const placeSpecial = useCallback(
    (item: SpecialItem) => {
      if (item.kind === "note") {
        const centered = {
          x: Math.round((position.x - 100) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((position.y - 50) / GRID_SIZE) * GRID_SIZE,
        };
        addNote(centered);
      } else if (item.kind === "room") {
        const centered = {
          x: Math.round((position.x - 200) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((position.y - 150) / GRID_SIZE) * GRID_SIZE,
        };
        addRoom("Room", centered);
      } else if (item.kind === "create") {
        onOpenDeviceCreator?.();
      }
      onClose();
    },
    [addNote, addRoom, position, onClose, onOpenDeviceCreator],
  );

  const selectResult = useCallback(
    (result: ResultItem) => {
      if (result.type === "device") placeDevice(result.template);
      else placeSpecial(result.item);
    },
    [placeDevice, placeSpecial],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) selectResult(results[selectedIndex]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="absolute bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-72 flex flex-col overflow-hidden"
        style={{ left: "50%", top: "30%", transform: "translateX(-50%)" }}
      >
        <div className="px-2 pt-2 pb-1.5">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add device, note, room..."
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
          />
        </div>
        <div className="px-2 pb-2 border-b border-[var(--color-border)]">
          <div className="flex gap-1.5">
            <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
                openPanel === "category"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : selectedCategories.size > 0
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              }`}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setOpenPanel((p) => p === "category" ? null : "category"); }}
                className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
              >
                {selectedCategories.size > 0 ? `Categories (${selectedCategories.size})` : "Categories"}
              </button>
              {selectedCategories.size > 0 && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedCategories(new Set()); }}
                  className="px-1 text-blue-400 hover:text-blue-600 text-xs shrink-0"
                >
                  &times;
                </button>
              )}
            </div>
            <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
                openPanel === "brand"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : selectedBrands.size > 0
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              }`}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setOpenPanel((p) => p === "brand" ? null : "brand"); }}
                className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
              >
                {selectedBrands.size > 0 ? `Brands (${selectedBrands.size})` : "Brands"}
              </button>
              {selectedBrands.size > 0 && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedBrands(new Set()); }}
                  className="px-1 text-blue-400 hover:text-blue-600 text-xs shrink-0"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
          {openPanel === "category" && (
            <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onMouseDown={(e) => { e.preventDefault(); toggleCategory(c); }}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    selectedCategories.has(c)
                      ? "bg-blue-500 text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {openPanel === "brand" && (
            <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
              {brands.map((m) => (
                <button
                  key={m}
                  onMouseDown={(e) => { e.preventDefault(); toggleBrand(m); }}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    selectedBrands.has(m)
                      ? "bg-blue-500 text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto">
          {results.length === 0 && (query || hasFilter) && (
            <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
              No matching devices
            </div>
          )}
          {results.map((result, i) => {
            if (result.type === "special") {
              return (
                <div
                  key={result.item.kind}
                  onMouseDown={() => selectResult(result)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    i === selectedIndex
                      ? "bg-blue-50 text-[var(--color-text-heading)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  <span className="text-[var(--color-text-muted)] text-xs shrink-0">
                    {result.item.kind === "note" ? "📝" : result.item.kind === "room" ? "▢" : "⊞"}
                  </span>
                  <div className="flex flex-col gap-0 flex-1 min-w-0">
                    <span className="text-xs font-medium truncate">{result.label}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] truncate">{result.subtitle}</span>
                  </div>
                </div>
              );
            }
            const template = result.template;
            const signals = [...new Set(template.ports.map((p) => p.signalType))]
              .map((t) => SIGNAL_LABELS[t])
              .join(" / ");
            const isFav = favoriteSet.has(template.id ?? template.deviceType);
            return (
              <div
                key={template.id ?? template.deviceType}
                onMouseDown={() => selectResult(result)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                  i === selectedIndex
                    ? "bg-blue-50 text-[var(--color-text-heading)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                {isFav && <span className="text-amber-400 text-xs shrink-0">★</span>}
                <div className="flex flex-col gap-0 flex-1 min-w-0">
                  <span className="text-xs font-medium truncate">{template.label}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] truncate">{signals}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-3 py-1.5 border-t border-[var(--color-border)] text-[9px] text-[var(--color-text-muted)] flex gap-3">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">Enter</kbd> place</span>
          <span><kbd className="font-mono">Esc</kbd> cancel</span>
        </div>
      </div>
    </div>
  );
}
