import { useState, useRef, useEffect } from "react";
import { useSchematicStore } from "../store";
import type { AlignOperation } from "../alignUtils";

interface OpDef {
  op: AlignOperation;
  label: string;
  icon: React.ReactNode;
}

const alignOps: OpDef[] = [
  {
    op: "left",
    label: "Left",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="1" y="1" width="2" height="14" />
        <rect x="5" y="3" width="8" height="4" opacity={0.6} />
        <rect x="5" y="9" width="5" height="4" opacity={0.6} />
      </svg>
    ),
  },
  {
    op: "center-h",
    label: "Center",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="7" y="1" width="2" height="14" />
        <rect x="3" y="3" width="10" height="4" opacity={0.6} />
        <rect x="4" y="9" width="8" height="4" opacity={0.6} />
      </svg>
    ),
  },
  {
    op: "right",
    label: "Right",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="13" y="1" width="2" height="14" />
        <rect x="3" y="3" width="8" height="4" opacity={0.6} />
        <rect x="6" y="9" width="5" height="4" opacity={0.6} />
      </svg>
    ),
  },
  {
    op: "top",
    label: "Top",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="1" y="1" width="14" height="2" />
        <rect x="2" y="5" width="4" height="8" opacity={0.6} />
        <rect x="8" y="5" width="4" height="5" opacity={0.6} />
      </svg>
    ),
  },
  {
    op: "middle-v",
    label: "Middle",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="1" y="7" width="14" height="2" />
        <rect x="2" y="2" width="4" height="12" opacity={0.6} />
        <rect x="8" y="4" width="4" height="8" opacity={0.6} />
      </svg>
    ),
  },
  {
    op: "bottom",
    label: "Bottom",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="1" y="13" width="14" height="2" />
        <rect x="2" y="3" width="4" height="8" opacity={0.6} />
        <rect x="8" y="6" width="4" height="5" opacity={0.6} />
      </svg>
    ),
  },
];

const distributeOps: OpDef[] = [
  {
    op: "distribute-h",
    label: "Horizontally",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="1" y="1" width="1.5" height="14" />
        <rect x="13.5" y="1" width="1.5" height="14" />
        <rect x="4" y="4" width="3" height="8" opacity={0.6} />
        <rect x="9" y="4" width="3" height="8" opacity={0.6} />
      </svg>
    ),
  },
  {
    op: "distribute-v",
    label: "Vertically",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <rect x="1" y="1" width="14" height="1.5" />
        <rect x="1" y="13.5" width="14" height="1.5" />
        <rect x="4" y="4" width="8" height="3" opacity={0.6} />
        <rect x="4" y="9" width="8" height="3" opacity={0.6} />
      </svg>
    ),
  },
];

function OpButton({
  op,
  label,
  icon,
  disabled,
  onClick,
}: OpDef & { disabled: boolean; onClick: (op: AlignOperation) => void }) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={() => onClick(op)}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer w-full text-left"
    >
      {icon}
      <span className="text-xs text-[var(--color-text)]">{label}</span>
    </button>
  );
}

export default function AlignmentMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alignSelectedNodes = useSchematicStore((s) => s.alignSelectedNodes);
  const selectedCount = useSchematicStore(
    (s) => s.nodes.filter((n) => n.selected).length,
  );

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleClick = (op: AlignOperation) => {
    alignSelectedNodes(op);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Align & Distribute"
        className="px-2.5 py-1 text-xs rounded bg-white text-[var(--color-text)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors cursor-pointer"
      >
        Align
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg p-1.5 z-50 w-44">
          <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide px-2 py-1">
            Align
          </div>
          <div className="grid grid-cols-2">
            {alignOps.map((o) => (
              <OpButton
                key={o.op}
                {...o}
                disabled={selectedCount < 2}
                onClick={handleClick}
              />
            ))}
          </div>
          <div className="h-px bg-[var(--color-border)] my-1" />
          <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide px-2 py-1">
            Distribute
          </div>
          <div className="grid grid-cols-2">
            {distributeOps.map((o) => (
              <OpButton
                key={o.op}
                {...o}
                disabled={selectedCount < 3}
                onClick={handleClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
