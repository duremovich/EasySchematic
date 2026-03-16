import { useState, useEffect, useMemo } from "react";
import type { DeviceTemplate } from "../../../src/types";
import { SIGNAL_LABELS } from "../../../src/types";
import { fetchTemplates } from "../api";
import SearchBar from "../components/SearchBar";
import CategoryFilter, { CATEGORIES } from "../components/CategoryFilter";
import DeviceCard from "../components/DeviceCard";

export default function BrowsePage() {
  const [templates, setTemplates] = useState<DeviceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = templates;

    // Category filter
    if (selectedCategories.size > 0) {
      const allowedTypes = new Set<string>();
      for (const cat of CATEGORIES) {
        if (selectedCategories.has(cat.label)) {
          cat.types.forEach((t) => allowedTypes.add(t));
        }
      }
      result = result.filter((t) => allowedTypes.has(t.deviceType));
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => {
        const signalLabels = t.ports.map((p) => SIGNAL_LABELS[p.signalType]?.toLowerCase() ?? "");
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
  }, [templates, search, selectedCategories]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading devices...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} resultCount={filtered.length} totalCount={templates.length} />
      </div>
      <div className="mb-6">
        <CategoryFilter selected={selectedCategories} onChange={setSelectedCategories} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((t) => (
          <DeviceCard key={t.id} template={t} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-center text-slate-400 mt-8">No devices match your search.</p>
      )}
    </div>
  );
}
