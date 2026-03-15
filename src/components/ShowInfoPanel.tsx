import { useState, useCallback, useEffect } from "react";
import { useSchematicStore } from "../store";
import type { TitleBlock } from "../types";

const FIELDS: { key: keyof TitleBlock; label: string; placeholder: string }[] = [
  { key: "showName", label: "Show / Project", placeholder: "e.g. Morning News Live" },
  { key: "venue", label: "Venue / Location", placeholder: "e.g. Studio A, Building 2" },
  { key: "designer", label: "Designer", placeholder: "Name" },
  { key: "engineer", label: "Engineer", placeholder: "Name" },
  { key: "date", label: "Date", placeholder: "e.g. 2026-03-15" },
  { key: "drawingTitle", label: "Drawing Title", placeholder: "e.g. Main Studio Signal Flow" },
];

export default function ShowInfoPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const titleBlock = useSchematicStore((s) => s.titleBlock);
  const setTitleBlock = useSchematicStore((s) => s.setTitleBlock);

  const handleBlur = useCallback(
    (key: keyof TitleBlock, value: string) => {
      if (value !== titleBlock[key]) {
        setTitleBlock({ ...titleBlock, [key]: value });
      }
    },
    [titleBlock, setTitleBlock],
  );

  if (collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col items-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="Show info"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
        <div
          className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          Show Info
        </div>
      </div>
    );
  }

  return (
    <div className="w-48 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          Show Info
        </h2>
        <button
          onClick={() => setCollapsed(true)}
          className="cursor-pointer hover:bg-[var(--color-surface-hover)] rounded p-0.5 transition-colors"
          title="Collapse"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <FieldInput
            key={key}
            label={label}
            placeholder={placeholder}
            value={titleBlock[key]}
            onBlur={(v) => handleBlur(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  label,
  placeholder,
  value,
  onBlur,
}: {
  label: string;
  placeholder: string;
  value: string;
  onBlur: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Sync draft when store value changes externally (e.g. import)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
        {label}
      </label>
      <input
        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onBlur(draft)}
        placeholder={placeholder}
      />
    </div>
  );
}
