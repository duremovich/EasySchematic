interface CategoryFilterProps {
  categories: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  const toggle = (label: string) => {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange(new Set())}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
          selected.size === 0
            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => toggle(cat)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            selected.has(cat)
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
