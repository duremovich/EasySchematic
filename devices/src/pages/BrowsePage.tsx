import { useState, useEffect, useMemo, useCallback } from "react";
import { SIGNAL_LABELS } from "../../../src/types";
import type { SignalType } from "../../../src/types";
import { fetchTemplateSummaries } from "../api";
import type { TemplateSummary } from "../api";
import SearchBar from "../components/SearchBar";
import CategoryFilter from "../components/CategoryFilter";
import DeviceCard from "../components/DeviceCard";

function SkeletonCard() {
  return (
    <div className="block p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-100 dark:bg-slate-700/60 rounded w-1/2 mt-1" />
        </div>
        <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
      </div>
      <div className="mt-3 flex gap-1">
        <div className="h-5 bg-slate-100 dark:bg-slate-700/60 rounded w-12" />
        <div className="h-5 bg-slate-100 dark:bg-slate-700/60 rounded w-16" />
      </div>
      <div className="h-3 bg-slate-100 dark:bg-slate-700/60 rounded w-16 mt-2" />
    </div>
  );
}

export default function BrowsePage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<Set<string>>(new Set());
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);

  useEffect(() => {
    fetchTemplateSummaries()
      .then(setTemplates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const matchesSignalFilter = useCallback(
    (t: TemplateSummary) => selectedSignalTypes.size === 0 || t.signalTypes.some((st) => selectedSignalTypes.has(st)),
    [selectedSignalTypes],
  );

  // Cross-filtered: categories narrowed by selected brands + signals
  const categories = useMemo(() => {
    let source = templates;
    if (selectedBrands.size > 0) source = source.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    if (selectedSignalTypes.size > 0) source = source.filter(matchesSignalFilter);
    return [...new Set(source.map((t) => t.category).filter(Boolean))].sort() as string[];
  }, [templates, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  // Cross-filtered: brands narrowed by selected categories + signals
  const brandList = useMemo(() => {
    let source = templates;
    if (selectedCategories.size > 0) source = source.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedSignalTypes.size > 0) source = source.filter(matchesSignalFilter);
    return [...new Set(source.map((t) => t.manufacturer).filter(Boolean))].sort() as string[];
  }, [templates, selectedCategories, selectedSignalTypes, matchesSignalFilter]);

  // Cross-filtered: signals narrowed by selected categories + brands
  const signalTypeList = useMemo(() => {
    let source = templates;
    if (selectedCategories.size > 0) source = source.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedBrands.size > 0) source = source.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    const types = new Set<string>();
    for (const t of source) for (const st of t.signalTypes) types.add(st);
    return [...types].sort((a, b) => (SIGNAL_LABELS[a as SignalType] ?? a).localeCompare(SIGNAL_LABELS[b as SignalType] ?? b));
  }, [templates, selectedCategories, selectedBrands]);

  // Map signal type values to labels for CategoryFilter display
  const signalLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const st of signalTypeList) map.set(SIGNAL_LABELS[st as SignalType] ?? st, st);
    return map;
  }, [signalTypeList]);
  const signalLabels = useMemo(() => signalTypeList.map((st) => SIGNAL_LABELS[st as SignalType] ?? st), [signalTypeList]);
  const selectedSignalLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const st of selectedSignalTypes) labels.add(SIGNAL_LABELS[st as SignalType] ?? st);
    return labels;
  }, [selectedSignalTypes]);
  const onSignalLabelChange = (labels: Set<string>) => {
    const types = new Set<string>();
    for (const label of labels) { const st = signalLabelMap.get(label); if (st) types.add(st); }
    setSelectedSignalTypes(types);
  };

  const filtered = useMemo(() => {
    let result = templates;

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter((t) => t.category && selectedCategories.has(t.category));
    }

    // Brand filter
    if (selectedBrands.size > 0) {
      result = result.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    }

    // Signal type filter
    if (selectedSignalTypes.size > 0) {
      result = result.filter(matchesSignalFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => {
        const signalLabels = t.signalTypes.map((s) => SIGNAL_LABELS[s]?.toLowerCase() ?? "");
        return (
          t.label.toLowerCase().includes(q) ||
          t.deviceType.toLowerCase().includes(q) ||
          (t.manufacturer?.toLowerCase().includes(q) ?? false) ||
          (t.modelNumber?.toLowerCase().includes(q) ?? false) ||
          (t.searchTerms?.some((s) => s.toLowerCase().includes(q)) ?? false) ||
          signalLabels.some((s) => s.includes(q))
        );
      });
    }

    return result;
  }, [templates, search, selectedCategories, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} resultCount={filtered.length} totalCount={templates.length} />
      </div>
      <div className="mb-4">
        <button
          onClick={() => setCategoriesOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${categoriesOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Category{selectedCategories.size > 0 && ` (${selectedCategories.size})`}
        </button>
        {categoriesOpen && <CategoryFilter categories={categories} selected={selectedCategories} onChange={setSelectedCategories} />}
      </div>
      <div className="mb-4">
        <button
          onClick={() => setBrandsOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${brandsOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Brand{selectedBrands.size > 0 && ` (${selectedBrands.size})`}
        </button>
        {brandsOpen && <CategoryFilter categories={brandList} selected={selectedBrands} onChange={setSelectedBrands} />}
      </div>
      <div className="mb-6">
        <button
          onClick={() => setSignalsOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${signalsOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Signal{selectedSignalTypes.size > 0 && ` (${selectedSignalTypes.size})`}
        </button>
        {signalsOpen && <CategoryFilter categories={signalLabels} selected={selectedSignalLabels} onChange={onSignalLabelChange} />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 12 }, (_, i) => <SkeletonCard key={i} />)
          : filtered.map((t) => (
              <DeviceCard key={t.id} template={t} />
            ))}
      </div>
      {!loading && filtered.length === 0 && (
        <p className="text-center text-slate-400 dark:text-slate-500 mt-8">No devices match your search.</p>
      )}
    </div>
  );
}
