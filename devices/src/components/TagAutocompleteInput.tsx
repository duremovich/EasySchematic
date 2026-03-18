import { useState, useRef, useEffect } from "react";

interface TagAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}

/** Autocomplete for comma-separated values. Suggests completions for the term currently being typed. */
export default function TagAutocompleteInput({ value, onChange, suggestions, placeholder, className }: TagAutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Parse current term (everything after the last comma)
  const parts = value.split(",");
  const currentTerm = (parts[parts.length - 1] ?? "").trimStart();
  const existingTerms = new Set(parts.slice(0, -1).map((s) => s.trim().toLowerCase()));

  const filtered = currentTerm
    ? suggestions.filter((s) =>
        s.toLowerCase().includes(currentTerm.toLowerCase()) &&
        !existingTerms.has(s.toLowerCase())
      )
    : [];

  const show = open && filtered.length > 0;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset keyboard index when input value changes
  useEffect(() => { setActiveIdx(-1); }, [value]);

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const acceptSuggestion = (term: string) => {
    const prefix = parts.slice(0, -1).join(", ");
    const next = prefix ? `${prefix}, ${term}, ` : `${term}, `;
    onChange(next);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      acceptSuggestion(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {show && (
        <ul
          ref={listRef}
          className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm"
        >
          {filtered.slice(0, 20).map((s, i) => (
            <li
              key={s}
              onMouseDown={() => acceptSuggestion(s)}
              className={`px-3 py-1.5 cursor-pointer ${
                i === activeIdx ? "bg-blue-100 text-blue-800" : "hover:bg-slate-50"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
