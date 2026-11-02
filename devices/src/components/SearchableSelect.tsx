import { useState, useRef, useEffect, useCallback, useMemo } from "react";

interface SearchableSelectProps<T extends string> {
  value: T | "";
  onChange: (value: T) => void;
  /** Flat list of options (no grouping) */
  options?: T[];
  /** Grouped options: group label → values */
  groups?: Record<string, T[]>;
  /** Display labels for values: a map, or a lookup such as `signalLabel` */
  labels: Record<string, string> | ((value: T) => string);
  className?: string;
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Value to highlight as recommended (shown first with badge) */
  recommended?: T;
  /** Label for the recommended badge */
  recommendedLabel?: string;
  /** When set, adds a special last option for custom input */
  allowOther?: {
    label: string;
    onSelect: (searchQuery: string) => void;
  };
}

function labelFor<T extends string>(labels: SearchableSelectProps<T>["labels"], v: T): string {
  return typeof labels === "function" ? labels(v) : (labels[v] ?? v);
}

interface FlatOption<T> {
  value: T;
  label: string;
  group?: string;
  isRecommended?: boolean;
}

export default function SearchableSelect<T extends string>({
  value,
  onChange,
  options,
  groups,
  labels,
  className,
  placeholder = "Select...",
  recommended,
  recommendedLabel,
  allowOther,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build flat option list from groups or options
  const allOptions = useMemo((): FlatOption<T>[] => {
    const result: FlatOption<T>[] = [];
    if (groups) {
      for (const [group, vals] of Object.entries(groups)) {
        for (const v of vals) {
          result.push({ value: v as T, label: labelFor(labels, v as T), group });
        }
      }
    } else if (options) {
      for (const v of options) {
        result.push({ value: v as T, label: labelFor(labels, v) });
      }
    }
    return result;
  }, [groups, options, labels]);

  // Filter by search query
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.group?.toLowerCase().includes(q) ?? false),
    );
  }, [allOptions, query]);

  // Build display list: recommended first, then grouped
  const displayItems = useMemo(() => {
    const items: (FlatOption<T> | { type: "header"; label: string } | { type: "other" })[] = [];

    // Recommended item first
    if (recommended && !query) {
      const rec = allOptions.find((o) => o.value === recommended);
      if (rec) {
        items.push({ ...rec, isRecommended: true });
      }
    }

    const addedRecommended = recommended && !query;
    const hasGroups = filtered.some((o) => o.group);

    if (hasGroups) {
      const groupOrder: string[] = [];
      const groupMap = new Map<string, FlatOption<T>[]>();
      for (const o of filtered) {
        const g = o.group ?? "Other";
        if (addedRecommended && o.value === recommended) continue;
        if (!groupMap.has(g)) {
          groupOrder.push(g);
          groupMap.set(g, []);
        }
        groupMap.get(g)!.push(o);
      }
      for (const g of groupOrder) {
        items.push({ type: "header" as const, label: g });
        items.push(...groupMap.get(g)!);
      }
    } else {
      for (const o of filtered) {
        if (addedRecommended && o.value === recommended) continue;
        items.push(o);
      }
    }

    if (allowOther) {
      items.push({ type: "other" as const });
    }

    return items;
  }, [filtered, recommended, query, allOptions, allowOther]);

  // Only selectable items (not headers)
  const selectableIndices = useMemo(
    () => displayItems.map((item, i) => ("type" in item && item.type === "header" ? -1 : i)).filter((i) => i >= 0),
    [displayItems],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(-1);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  // Focus search input when opening
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { close(); return; }
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => {
        const curPos = selectableIndices.indexOf(prev);
        const next = curPos + 1;
        return next < selectableIndices.length ? selectableIndices[next] : prev;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => {
        const curPos = selectableIndices.indexOf(prev);
        const next = curPos - 1;
        return next >= 0 ? selectableIndices[next] : prev;
      });
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      const item = displayItems[activeIdx];
      if (item && !("type" in item)) {
        onChange(item.value);
        close();
      } else if (item && "type" in item && item.type === "other" && allowOther) {
        allowOther.onSelect(query);
        close();
      }
    }
  };

  const displayLabel = value ? labelFor(labels, value) : "";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className={`text-left truncate ${className ?? "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"}`}
      >
        {displayLabel || <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden" style={{ minWidth: "200px" }}>
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div ref={listRef} className="max-h-64 overflow-y-auto">
            {displayItems.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500 italic">No matches</div>
            )}
            {displayItems.map((item, i) => {
              if ("type" in item && item.type === "header") {
                return (
                  <div key={`h-${item.label}`} className="px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 sticky top-0">
                    {item.label}
                  </div>
                );
              }
              if ("type" in item && item.type === "other") {
                return (
                  <div
                    key="__other__"
                    onMouseDown={(e) => { e.preventDefault(); allowOther!.onSelect(query); close(); }}
                    className={`px-3 py-1.5 cursor-pointer text-sm border-t border-slate-100 dark:border-slate-700 ${
                      i === activeIdx
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
                        : "text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    }`}
                  >
                    {allowOther!.label}
                  </div>
                );
              }
              const opt = item as FlatOption<T>;
              const isActive = i === activeIdx;
              const isSelected = opt.value === value;
              return (
                <div
                  key={`${opt.group ?? ""}-${opt.value}`}
                  onMouseDown={(e) => { e.preventDefault(); onChange(opt.value); close(); }}
                  className={`px-3 py-1.5 cursor-pointer text-sm flex items-center gap-2 ${
                    isActive ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200" :
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium" :
                    "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className="truncate flex-1">{opt.label}</span>
                  {opt.isRecommended && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                      {recommendedLabel ?? "Default"}
                    </span>
                  )}
                  {isSelected && !opt.isRecommended && (
                    <span className="shrink-0 text-blue-500 dark:text-blue-400">&#10003;</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
