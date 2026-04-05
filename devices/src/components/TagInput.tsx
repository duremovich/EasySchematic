import { useState, useRef, useEffect } from "react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  /** Auto-suggested tags shown as clickable chips above the input */
  autoSuggestions?: string[];
  placeholder?: string;
  maxTags?: number;
}

export default function TagInput({ tags, onChange, suggestions = [], autoSuggestions = [], placeholder = "Add a tag...", maxTags = 20 }: TagInputProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const tagsLower = new Set(tags.map((t) => t.toLowerCase()));

  // Filter suggestions by current input text, excluding already-added tags
  const filtered = input.trim()
    ? suggestions
        .filter((s) => s.toLowerCase().includes(input.toLowerCase()) && !tagsLower.has(s.toLowerCase()))
        .slice(0, 15)
    : [];

  // Auto-suggestions not yet added
  const availableAuto = autoSuggestions.filter((s) => !tagsLower.has(s.toLowerCase()));

  const show = open && filtered.length > 0;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset keyboard index when input value changes
  useEffect(() => { setActiveIdx(-1); }, [input]);

  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || tagsLower.has(trimmed) || tags.length >= maxTags) return;
    onChange([...tags, trimmed]);
    setInput("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (show && activeIdx >= 0) {
        e.preventDefault();
        addTag(filtered[activeIdx]);
      } else if (input.trim()) {
        e.preventDefault();
        addTag(input);
      }
      return;
    }
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef}>
      {/* Auto-suggestion chips */}
      {availableAuto.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          <span className="text-xs text-slate-400 self-center mr-1">Suggested:</span>
          {availableAuto.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
            >
              <span>+</span> {s}
            </button>
          ))}
        </div>
      )}

      {/* Tag bubbles + input */}
      <div
        className="flex flex-wrap gap-1.5 items-center px-2 py-1.5 rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 min-h-[38px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 border border-blue-200"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="text-blue-400 hover:text-blue-600 leading-none cursor-pointer"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value.replace(",", "")); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] px-1 py-0.5 text-sm outline-none bg-transparent"
        />
      </div>

      {/* Autocomplete dropdown */}
      {show && (
        <div className="relative">
          <ul
            ref={listRef}
            className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm"
          >
            {filtered.map((s, i) => (
              <li
                key={s}
                onMouseDown={() => addTag(s)}
                className={`px-3 py-1.5 cursor-pointer ${
                  i === activeIdx ? "bg-blue-100 text-blue-800" : "hover:bg-slate-50"
                }`}
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tags.length > 0 && (
        <span className="text-xs text-slate-400 mt-1 block">{tags.length}/{maxTags} tags</span>
      )}
    </div>
  );
}
