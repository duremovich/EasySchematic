import { useState, useEffect, useRef } from "react";
import { createSubmission, fetchTemplateSummaries, type TemplateSummary } from "../api";
import DeviceForm, { type DeviceFormData } from "../components/DeviceForm";
import { linkClick } from "../navigate";

interface Props {
  id?: string; // existing template ID for edit suggestions
  draftId?: string; // draft from main app cross-submission
  cloneId?: string; // existing template ID to clone as new device (from URL)
}

export default function SubmitPage({ id, draftId, cloneId: initialCloneId }: Props) {
  const [success, setSuccess] = useState(false);
  const [cloneId, setCloneId] = useState(initialCloneId);
  const isEdit = !!id;

  const handleSubmit = async (data: DeviceFormData) => {
    const { submitterNote, ...templateData } = data;
    await createSubmission(isEdit ? "update" : "create", templateData, id, submitterNote);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Submission received!</h2>
        <p className="text-sm text-slate-500 mb-4">
          Your {isEdit ? "edit suggestion" : "new device"} has been submitted for review. A moderator will review it shortly.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a href="/my-submissions" onClick={linkClick} className="text-sm text-blue-600 hover:text-blue-800">View my submissions</a>
          <span className="text-slate-300">|</span>
          <a href="/" onClick={linkClick} className="text-sm text-blue-600 hover:text-blue-800">Browse devices</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {isEdit ? "Suggest Edit" : "Submit New Device"}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {isEdit
          ? "Propose changes to an existing device template. A moderator will review your suggestion."
          : cloneId
          ? "Cloned from an existing device. Modify what you need and submit as a new device."
          : "Submit a new device template for the community library. A moderator will review it before it goes live."}
      </p>

      {!isEdit && <CloneSearch cloneId={cloneId} onSelect={setCloneId} />}

      <DeviceForm
        key={cloneId ?? "new"}
        id={id}
        draftId={draftId}
        cloneId={cloneId}
        onSubmit={handleSubmit}
        submitLabel="Submit for Review"
        cancelHref={isEdit ? `/device/${id}` : "/"}
      />
    </div>
  );
}

function CloneSearch({ cloneId, onSelect }: { cloneId?: string; onSelect: (id?: string) => void }) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTemplateSummaries().then(setTemplates).catch(() => {});
  }, []);

  // Resolve label for URL-based cloneId
  /* eslint-disable react-hooks/set-state-in-effect -- one-time sync of URL param + fetched data → local state */
  useEffect(() => {
    if (cloneId && templates.length > 0 && !selectedLabel) {
      const t = templates.find((t) => t.id === cloneId);
      if (t) setSelectedLabel(`${t.label}${t.manufacturer ? ` (${t.manufacturer})` : ""}`);
    }
  }, [cloneId, templates, selectedLabel]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = query.toLowerCase();
  const filtered = q
    ? templates.filter((t) =>
        t.label.toLowerCase().includes(q) ||
        (t.manufacturer?.toLowerCase().includes(q)) ||
        (t.modelNumber?.toLowerCase().includes(q)) ||
        t.deviceType.replace(/-/g, " ").includes(q)
      ).slice(0, 12)
    : [];

  if (cloneId && selectedLabel) {
    return (
      <div className="mb-6 flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
        <span className="text-sm text-blue-700 dark:text-blue-300">
          Cloning from: <strong>{selectedLabel}</strong>
        </span>
        <button
          onClick={() => { onSelect(undefined); setSelectedLabel(""); setQuery(""); }}
          className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="mb-6 relative">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Clone from existing device <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (query) setOpen(true); }}
        placeholder="Search devices to use as a starting point..."
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSelect(t.id);
                setSelectedLabel(`${t.label}${t.manufacturer ? ` (${t.manufacturer})` : ""}`);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{t.label}</span>
              {t.manufacturer && <span className="text-slate-500 dark:text-slate-400 ml-2">{t.manufacturer}</span>}
              {t.modelNumber && <span className="text-slate-400 dark:text-slate-500 ml-1">· {t.modelNumber}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
