import { useState, useEffect } from "react";
import { fetchContributors, fetchContributorTemplates } from "../api";
import type { Contributor, ContributorTemplate } from "../api";
import { linkClick } from "../navigate";

export default function ContributorsPage() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, ContributorTemplate[]>>({});
  const [loadingTemplates, setLoadingTemplates] = useState<string | null>(null);

  useEffect(() => {
    fetchContributors()
      .then(setContributors)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!templates[id]) {
      setLoadingTemplates(id);
      try {
        const data = await fetchContributorTemplates(id);
        setTemplates((prev) => ({ ...prev, [id]: data }));
      } catch {
        // silently fail — the row just won't show devices
      } finally {
        setLoadingTemplates(null);
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Contributors</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        The people building the EasySchematic device library.
      </p>

      {contributors.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <p className="mb-2">No contributions yet.</p>
          <a href="/submit" onClick={linkClick} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">Be the first!</a>
        </div>
      ) : (
        <div className="space-y-2">
          {contributors.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <button
                onClick={() => toggleExpand(c.id)}
                className="flex items-center gap-4 p-4 w-full text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded-lg"
              >
                <div className="flex-shrink-0 w-8 text-center">
                  {i === 0 ? (
                    <span className="text-xl">&#x1F947;</span>
                  ) : i === 1 ? (
                    <span className="text-xl">&#x1F948;</span>
                  ) : i === 2 ? (
                    <span className="text-xl">&#x1F949;</span>
                  ) : (
                    <span className="text-sm font-bold text-slate-400 dark:text-slate-500">#{i + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{c.approvedCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {c.createdCount > 0 && c.editedCount > 0
                      ? `${c.createdCount} submitted · ${c.editedCount} edited`
                      : c.editedCount > 0
                        ? `${c.editedCount} edited`
                        : `${c.createdCount} submitted`}
                  </p>
                </div>
                <svg
                  className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedId === c.id ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedId === c.id && (
                <div className="px-4 pb-4 pt-0">
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                    {loadingTemplates === c.id ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Loading devices...</p>
                    ) : templates[c.id]?.length ? (
                      <ul className="space-y-1">
                        {templates[c.id].map((t) => (
                          <li key={t.id}>
                            <a
                              href={`/device/${t.id}`}
                              onClick={linkClick}
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                            >
                              {t.label}
                            </a>
                            {t.contribution === "edited" && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">edited</span>
                            )}
                            {t.contribution === "both" && (
                              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">created + edited</span>
                            )}
                            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 capitalize">{t.category}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">No devices found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
