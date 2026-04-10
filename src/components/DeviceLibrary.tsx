import { type DragEvent, type ChangeEvent, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { getBundledTemplates, fetchTemplates } from "../templateApi";
import { SIGNAL_LABELS } from "../types";
import type { DeviceTemplate, CustomTemplateGroup, OwnedGearFile, OwnedGearItem, SchematicNode, DeviceData } from "../types";
import { useSchematicStore, CATEGORY_ORDER_DEFAULT } from "../store";
import { scoreTemplate } from "../templateSearch";
import DeviceCreatorPicker from "./DeviceCreatorPicker";

const APP_VERSION = __APP_VERSION__;
const BUILD_HASH = __BUILD_HASH__;

function onDragStart(event: DragEvent, template: DeviceTemplate) {
  event.dataTransfer.setData(
    "application/easyschematic-device",
    JSON.stringify(template),
  );
  event.dataTransfer.effectAllowed = "move";
}

function getUniqueSignalTypes(template: DeviceTemplate): string[] {
  const types = new Set(template.ports.map((p) => p.signalType));
  return [...types];
}

function getTemplateKey(template: DeviceTemplate): string {
  return template.id ?? template.deviceType;
}

function getInventoryMatchKey(template: Pick<DeviceTemplate, "label" | "manufacturer" | "modelNumber">): string {
  return `${template.manufacturer ?? ""}|${template.modelNumber ?? ""}|${template.label}`;
}

function matchesOwnedGearQuery(item: OwnedGearItem, query: string): boolean {
  if (!query) return true;
  return scoreTemplate(item.template, query) > 0;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-blue-600 font-semibold">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

function TemplateItem({
  template,
  query,
  onDelete,
  hasPreset,
  isFavorite,
  onToggleFavorite,
  onAddToOwned,
}: {
  template: DeviceTemplate;
  query: string;
  onDelete?: () => void;
  hasPreset?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onAddToOwned?: () => void;
}) {
  const signalText = getUniqueSignalTypes(template)
    .map((t) => SIGNAL_LABELS[t as keyof typeof SIGNAL_LABELS])
    .join(" / ");

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded cursor-grab hover:bg-[var(--color-surface-hover)] transition-colors group"
      draggable
      onDragStart={(e) => onDragStart(e, template)}
    >
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`shrink-0 text-xs cursor-pointer transition-colors ${
            isFavorite
              ? "text-amber-400"
              : "text-[var(--color-text-muted)]/30 opacity-0 group-hover:opacity-100"
          }`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      )}
      {onAddToOwned && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToOwned(); }}
          className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]/40 opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-all cursor-pointer px-1"
          title="Add to owned gear"
        >
          Inv
        </button>
      )}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-xs text-[var(--color-text-heading)] font-medium truncate flex items-center gap-1">
          <HighlightedText text={template.label} query={query} />
          {hasPreset && (
            <span className="text-[8px] text-blue-500 bg-blue-50 rounded px-1 py-px font-normal shrink-0">preset</span>
          )}
        </span>
        {template.manufacturer && (
          <span className="text-[9px] text-[var(--color-text-muted)] opacity-70 truncate">
            <HighlightedText text={template.manufacturer} query={query} />
          </span>
        )}
        <span className="text-[10px] text-[var(--color-text-muted)]">
          <HighlightedText text={signalText} query={query} />
        </span>
        {template.slots && template.slots.length > 0 && (
          <span className="text-[9px] text-[var(--color-text-muted)] opacity-60">
            {template.slots.length} slot{template.slots.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-1 transition-opacity"
          title="Delete template"
        >
          &times;
        </button>
      )}
    </div>
  );
}

function CategorySection({
  label,
  templates,
  query,
  defaultOpen,
  onDelete,
  presetIds,
  favoriteSet,
  onToggleFavorite,
  onAddToOwned,
  categoryIndex,
  onCategoryReorder,
}: {
  label: string;
  templates: DeviceTemplate[];
  query: string;
  defaultOpen: boolean;
  onDelete?: (deviceType: string) => void;
  presetIds?: Set<string>;
  favoriteSet?: Set<string>;
  onToggleFavorite?: (key: string) => void;
  onAddToOwned?: (template: DeviceTemplate) => void;
  categoryIndex?: number;
  onCategoryReorder?: (category: string, targetIndex: number) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [dropLine, setDropLine] = useState<"above" | "below" | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const isOpen = query ? true : open;
  const isDraggable = categoryIndex !== undefined && onCategoryReorder && !query;

  if (templates.length === 0) return null;

  return (
    <div className="relative">
      {dropLine === "above" && <div className="absolute top-0 left-1 right-1 h-0.5 bg-blue-500 rounded-full z-10" />}
      <div
        ref={headerRef}
        draggable={!!isDraggable}
        onDragStart={isDraggable ? (e) => {
          e.dataTransfer.setData("application/easyschematic-category-reorder", label);
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onDragOver={isDraggable ? (e) => {
          if (!e.dataTransfer.types.includes("application/easyschematic-category-reorder")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = headerRef.current!.getBoundingClientRect();
          setDropLine(e.clientY < rect.top + rect.height / 2 ? "above" : "below");
        } : undefined}
        onDragLeave={isDraggable ? () => setDropLine(null) : undefined}
        onDrop={isDraggable ? (e) => {
          if (!e.dataTransfer.types.includes("application/easyschematic-category-reorder")) return;
          e.preventDefault();
          const cat = e.dataTransfer.getData("application/easyschematic-category-reorder");
          if (cat !== label) {
            const targetIdx = dropLine === "above" ? categoryIndex! : categoryIndex! + 1;
            onCategoryReorder!(cat, targetIdx);
          }
          setDropLine(null);
        } : undefined}
      >
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 w-full px-1 mb-0.5 cursor-pointer group/cat ${isDraggable ? "active:cursor-grabbing" : ""}`}
        >
          <span
            className={`text-[9px] text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] group-hover/cat:text-[var(--color-text)] transition-colors">
            {label}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-auto opacity-60">
            {templates.length}
          </span>
        </button>
      </div>
      {isOpen && (
        <div>
          {templates.map((template) => {
            const key = template.id ?? template.deviceType;
            return (
              <TemplateItem
                key={key}
                template={template}
                query={query}
                onDelete={onDelete ? () => onDelete(template.deviceType) : undefined}
                hasPreset={!!(template.id && presetIds?.has(template.id))}
                isFavorite={favoriteSet?.has(key)}
                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(key) : undefined}
                onAddToOwned={onAddToOwned ? () => onAddToOwned(template) : undefined}
              />
            );
          })}
        </div>
      )}
      {dropLine === "below" && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-500 rounded-full z-10" />}
    </div>
  );
}

/* ─── Draggable custom template item ─── */
function DraggableTemplateItem({
  template,
  query,
  onDelete,
  isFavorite,
  onToggleFavorite,
  onAddToOwned,
  index,
  onReorder,
}: {
  template: DeviceTemplate;
  query: string;
  onDelete: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onAddToOwned?: () => void;
  index: number;
  onReorder: (deviceType: string, targetIndex: number) => void;
}) {
  const [dropLine, setDropLine] = useState<"above" | "below" | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const signalText = getUniqueSignalTypes(template)
    .map((t) => SIGNAL_LABELS[t as keyof typeof SIGNAL_LABELS])
    .join(" / ");

  return (
    <div
      ref={rowRef}
      className="relative"
      onDragOver={(e) => {
        const types = Array.from(e.dataTransfer.types);
        if (!types.includes("application/easyschematic-template-reorder")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = rowRef.current!.getBoundingClientRect();
        setDropLine(e.clientY < rect.top + rect.height / 2 ? "above" : "below");
      }}
      onDragLeave={() => setDropLine(null)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("application/easyschematic-template-reorder")) return;
        e.preventDefault();
        const dt = e.dataTransfer.getData("application/easyschematic-template-reorder");
        const targetIdx = dropLine === "above" ? index : index + 1;
        onReorder(dt, targetIdx);
        setDropLine(null);
      }}
    >
      {dropLine === "above" && <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />}
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded cursor-grab hover:bg-[var(--color-surface-hover)] transition-colors group"
        draggable
        onDragStart={(e) => {
          // Set both MIME types: reorder for the panel, device for canvas drops
          e.dataTransfer.setData("application/easyschematic-template-reorder", template.id ?? template.deviceType);
          e.dataTransfer.setData("application/easyschematic-device", JSON.stringify(template));
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        {/* Drag handle */}
        <span className="text-[10px] text-[var(--color-text-muted)]/40 opacity-0 group-hover:opacity-100 cursor-grab select-none shrink-0 leading-none" title="Drag to reorder">⠿</span>
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`shrink-0 text-xs cursor-pointer transition-colors ${
              isFavorite
                ? "text-amber-400"
                : "text-[var(--color-text-muted)]/30 opacity-0 group-hover:opacity-100"
            }`}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        )}
        {onAddToOwned && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToOwned(); }}
            className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]/40 opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-all cursor-pointer px-1"
            title="Add to owned gear"
          >
            Inv
          </button>
        )}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-xs text-[var(--color-text-heading)] font-medium truncate">
            <HighlightedText text={template.label} query={query} />
          </span>
          {template.manufacturer && (
            <span className="text-[9px] text-[var(--color-text-muted)] opacity-70 truncate">
              <HighlightedText text={template.manufacturer} query={query} />
            </span>
          )}
          <span className="text-[10px] text-[var(--color-text-muted)]">
            <HighlightedText text={signalText} query={query} />
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-1 transition-opacity"
          title="Delete template"
        >
          &times;
        </button>
      </div>
      {dropLine === "below" && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />}
    </div>
  );
}

/* ─── Group sub-section header ─── */
function GroupHeader({
  group,
  count,
  groupIndex,
  onToggle,
  onRename,
  onRemove,
  onTemplateDrop,
  onGroupReorder,
}: {
  group: CustomTemplateGroup;
  count: number;
  groupIndex: number;
  onToggle: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
  onTemplateDrop: (deviceType: string) => void;
  onGroupReorder: (groupId: string, targetIndex: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(group.label);
  const [dragOver, setDragOver] = useState(false);
  const [groupDropLine, setGroupDropLine] = useState<"above" | "below" | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1 mb-0.5">
        <span className="text-[9px] text-[var(--color-text-muted)]">▶</span>
        <input
          ref={inputRef}
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editLabel.trim()) {
              onRename(editLabel.trim());
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => {
            if (editLabel.trim() && editLabel.trim() !== group.label) onRename(editLabel.trim());
            setEditing(false);
          }}
          className="flex-1 min-w-0 bg-white border border-blue-400 rounded px-1 py-0 text-[10px] uppercase tracking-wider text-[var(--color-text)] outline-none"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div ref={rowRef} className="relative">
      {groupDropLine === "above" && <div className="absolute top-0 left-1 right-1 h-0.5 bg-blue-500 rounded-full z-10" />}
      <div
        className={`flex items-center gap-1 w-full px-1 mb-0.5 group/grp rounded transition-colors ${dragOver ? "bg-blue-100/60" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/easyschematic-group-reorder", group.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types);
          if (types.includes("application/easyschematic-template-reorder")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOver(true);
          } else if (types.includes("application/easyschematic-group-reorder")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = rowRef.current!.getBoundingClientRect();
            setGroupDropLine(e.clientY < rect.top + rect.height / 2 ? "above" : "below");
          }
        }}
        onDragLeave={() => { setDragOver(false); setGroupDropLine(null); }}
        onDrop={(e) => {
          const types = Array.from(e.dataTransfer.types);
          if (types.includes("application/easyschematic-template-reorder")) {
            e.preventDefault();
            const dt = e.dataTransfer.getData("application/easyschematic-template-reorder");
            onTemplateDrop(dt);
            setDragOver(false);
          } else if (types.includes("application/easyschematic-group-reorder")) {
            e.preventDefault();
            const gid = e.dataTransfer.getData("application/easyschematic-group-reorder");
            if (gid !== group.id) {
              const targetIdx = groupDropLine === "above" ? groupIndex : groupIndex + 1;
              onGroupReorder(gid, targetIdx);
            }
            setGroupDropLine(null);
          }
        }}
      >
        <button onClick={onToggle} className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer">
          <span className={`text-[9px] text-[var(--color-text-muted)] transition-transform ${!group.collapsed ? "rotate-90" : ""}`}>▶</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] group-hover/grp:text-[var(--color-text)] transition-colors truncate">
            {group.label}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-auto opacity-60 shrink-0">{count}</span>
        </button>
        <div className="opacity-0 group-hover/grp:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditLabel(group.label); setEditing(true); }}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-[10px] cursor-pointer px-0.5"
            title="Rename group"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-0.5"
            title="Delete group"
          >
            &times;
          </button>
        </div>
      </div>
      {groupDropLine === "below" && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-500 rounded-full z-10" />}
    </div>
  );
}

/* ─── Ungrouped drop target header ─── */
function UngroupedHeader({
  count,
  open,
  onToggle,
  onTemplateDrop,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  onTemplateDrop: (deviceType: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1 w-full px-1 mb-0.5 cursor-pointer group/cat rounded transition-colors ${dragOver ? "bg-blue-100/60" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/easyschematic-template-reorder")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("application/easyschematic-template-reorder")) {
          e.preventDefault();
          const dt = e.dataTransfer.getData("application/easyschematic-template-reorder");
          onTemplateDrop(dt);
          setDragOver(false);
        }
      }}
    >
      <span className={`text-[9px] text-[var(--color-text-muted)] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] group-hover/cat:text-[var(--color-text)] transition-colors">
        Ungrouped
      </span>
      <span className="text-[10px] text-[var(--color-text-muted)] ml-auto opacity-60">{count}</span>
    </button>
  );
}

/* ─── Custom Templates Section (replaces flat "User Templates") ─── */
function CustomTemplatesSection({
  customTemplates,
  query,
  favoriteSet,
  onAddToOwned,
}: {
  customTemplates: DeviceTemplate[];
  query: string;
  favoriteSet: Set<string>;
  onAddToOwned?: (template: DeviceTemplate) => void;
}) {
  const groups = useSchematicStore((s) => s.customTemplateGroups);
  const order = useSchematicStore((s) => s.customTemplateOrder);
  const assignments = useSchematicStore((s) => s.customTemplateGroupAssignments);
  const removeCustomTemplate = useSchematicStore((s) => s.removeCustomTemplate);
  const toggleFavoriteTemplate = useSchematicStore((s) => s.toggleFavoriteTemplate);
  const reorderCustomTemplate = useSchematicStore((s) => s.reorderCustomTemplate);
  const moveCustomTemplateToGroup = useSchematicStore((s) => s.moveCustomTemplateToGroup);
  const addCustomTemplateGroup = useSchematicStore((s) => s.addCustomTemplateGroup);
  const removeCustomTemplateGroup = useSchematicStore((s) => s.removeCustomTemplateGroup);
  const renameCustomTemplateGroup = useSchematicStore((s) => s.renameCustomTemplateGroup);
  const reorderCustomTemplateGroup = useSchematicStore((s) => s.reorderCustomTemplateGroup);
  const toggleCustomGroupCollapsed = useSchematicStore((s) => s.toggleCustomGroupCollapsed);

  const [sectionOpen, setSectionOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [ungroupedOpen, setUngroupedOpen] = useState(true);
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingGroup) newGroupInputRef.current?.focus();
  }, [creatingGroup]);

  // Build ordered view: for each group, collect assigned templates in order; then ungrouped
  const groupedView = useMemo(() => {
    const byKey = new Map<string, DeviceTemplate>();
    for (const t of customTemplates) byKey.set(t.id ?? t.deviceType, t);

    // Build ordered list of template keys, appending any not in order array
    const orderedSet = new Set(order);
    const fullOrder = [...order, ...customTemplates.filter((t) => !orderedSet.has(t.id ?? t.deviceType)).map((t) => t.id ?? t.deviceType)];

    const sections: { group: CustomTemplateGroup | null; templates: DeviceTemplate[] }[] = [];

    for (const g of groups) {
      const templates = fullOrder
        .filter((dt) => assignments[dt] === g.id)
        .map((dt) => byKey.get(dt))
        .filter((t): t is DeviceTemplate => !!t);
      sections.push({ group: g, templates });
    }

    // Ungrouped
    const assignedSet = new Set(Object.keys(assignments));
    const ungrouped = fullOrder
      .filter((dt) => !assignedSet.has(dt))
      .map((dt) => byKey.get(dt))
      .filter((t): t is DeviceTemplate => !!t);
    sections.push({ group: null, templates: ungrouped });

    return sections;
  }, [customTemplates, groups, order, assignments]);

  const handleReorder = useCallback((deviceType: string, targetIndexInSection: number, sectionIdx: number) => {
    // Convert section-local index to global order index
    let globalIdx = 0;
    for (let s = 0; s < sectionIdx; s++) {
      globalIdx += groupedView[s].templates.length;
    }
    globalIdx += targetIndexInSection;

    // Also move to the target group
    const targetGroup = groupedView[sectionIdx].group;
    const currentGroup = assignments[deviceType];
    if ((targetGroup?.id ?? null) !== (currentGroup ?? null)) {
      moveCustomTemplateToGroup(deviceType, targetGroup?.id ?? null);
    }

    reorderCustomTemplate(deviceType, globalIdx);
  }, [groupedView, assignments, moveCustomTemplateToGroup, reorderCustomTemplate]);

  if (customTemplates.length === 0 && groups.length === 0) return null;

  const isOpen = query ? true : sectionOpen;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-1 px-1 mb-0.5 group/cat">
        <button onClick={() => setSectionOpen(!sectionOpen)} className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer">
          <span className={`text-[9px] text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] group-hover/cat:text-[var(--color-text)] transition-colors">
            User Templates
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-auto opacity-60">{customTemplates.length}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setCreatingGroup(true); setNewGroupLabel(""); }}
          className="opacity-0 group-hover/cat:opacity-100 text-[var(--color-text-muted)] hover:text-blue-500 text-sm cursor-pointer px-0.5 transition-opacity"
          title="New group"
        >
          +
        </button>
      </div>

      {isOpen && (
        <div className="ml-2">
          {/* New group inline input */}
          {creatingGroup && (
            <div className="flex items-center gap-1 px-1 mb-1">
              <span className="text-[9px] text-[var(--color-text-muted)]">▶</span>
              <input
                ref={newGroupInputRef}
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupLabel.trim()) {
                    addCustomTemplateGroup(newGroupLabel.trim());
                    setCreatingGroup(false);
                    setNewGroupLabel("");
                  }
                  if (e.key === "Escape") { setCreatingGroup(false); setNewGroupLabel(""); }
                }}
                onBlur={() => {
                  if (newGroupLabel.trim()) addCustomTemplateGroup(newGroupLabel.trim());
                  setCreatingGroup(false);
                  setNewGroupLabel("");
                }}
                placeholder="Group name..."
                className="flex-1 min-w-0 bg-white border border-blue-400 rounded px-1 py-0 text-[10px] uppercase tracking-wider text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] placeholder:normal-case"
                autoFocus
              />
            </div>
          )}

          {groupedView.map((section, sectionIdx) => {
            const isUngrouped = section.group === null;

            // If there are no groups at all, skip the ungrouped header and just show templates flat
            const showFlat = isUngrouped && groups.length === 0;

            if (showFlat) {
              return (
                <div key="ungrouped">
                  {section.templates.map((t, i) => {
                    const key = t.id ?? t.deviceType;
                    return (
                      <DraggableTemplateItem
                        key={key}
                        template={t}
                        query={query}
                        onDelete={() => removeCustomTemplate(t.id ?? t.deviceType)}
                        isFavorite={favoriteSet.has(key)}
                        onToggleFavorite={() => toggleFavoriteTemplate(key)}
                        onAddToOwned={onAddToOwned ? () => onAddToOwned(t) : undefined}
                        index={i}
                        onReorder={(dt, targetIdx) => handleReorder(dt, targetIdx, sectionIdx)}
                      />
                    );
                  })}
                </div>
              );
            }

            if (isUngrouped) {
              return (
                <div key="ungrouped">
                  <UngroupedHeader
                    count={section.templates.length}
                    open={ungroupedOpen}
                    onToggle={() => setUngroupedOpen(!ungroupedOpen)}
                    onTemplateDrop={(dt) => moveCustomTemplateToGroup(dt, null)}
                  />
                  {ungroupedOpen && (
                    <div className="ml-2">
                      {section.templates.map((t, i) => {
                        const key = t.id ?? t.deviceType;
                        return (
                          <DraggableTemplateItem
                            key={key}
                            template={t}
                            query={query}
                            onDelete={() => removeCustomTemplate(t.id ?? t.deviceType)}
                            isFavorite={favoriteSet.has(key)}
                            onToggleFavorite={() => toggleFavoriteTemplate(key)}
                            onAddToOwned={onAddToOwned ? () => onAddToOwned(t) : undefined}
                            index={i}
                            onReorder={(dt, targetIdx) => handleReorder(dt, targetIdx, sectionIdx)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const g = section.group!;
            return (
              <div key={g.id}>
                <GroupHeader
                  group={g}
                  count={section.templates.length}
                  groupIndex={groups.indexOf(g)}
                  onToggle={() => toggleCustomGroupCollapsed(g.id)}
                  onRename={(label) => renameCustomTemplateGroup(g.id, label)}
                  onRemove={() => removeCustomTemplateGroup(g.id)}
                  onTemplateDrop={(dt) => moveCustomTemplateToGroup(dt, g.id)}
                  onGroupReorder={(gid, targetIdx) => reorderCustomTemplateGroup(gid, targetIdx)}
                />
                {!g.collapsed && (
                  <div className="ml-2">
                    {section.templates.map((t, i) => {
                      const key = t.id ?? t.deviceType;
                      return (
                        <DraggableTemplateItem
                          key={key}
                          template={t}
                          query={query}
                          onDelete={() => removeCustomTemplate(t.id ?? t.deviceType)}
                          isFavorite={favoriteSet.has(key)}
                          onToggleFavorite={() => toggleFavoriteTemplate(key)}
                          onAddToOwned={onAddToOwned ? () => onAddToOwned(t) : undefined}
                          index={i}
                          onReorder={(dt, targetIdx) => handleReorder(dt, targetIdx, sectionIdx)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getUsedInventoryCounts(nodes: SchematicNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    const key = `${data.manufacturer ?? ""}|${data.modelNumber ?? ""}|${data.model ?? data.baseLabel ?? data.label}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function OwnedGearTab({ query }: { query: string }) {
  const ownedGear = useSchematicStore((s) => s.ownedGear);
  const setOwnedGear = useSchematicStore((s) => s.setOwnedGear);
  const updateOwnedGearQuantity = useSchematicStore((s) => s.updateOwnedGearQuantity);
  const removeOwnedGear = useSchematicStore((s) => s.removeOwnedGear);
  const nodes = useSchematicStore((s) => s.nodes);
  const schematicName = useSchematicStore((s) => s.schematicName);
  const addToast = useSchematicStore((s) => s.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usedCounts = useMemo(() => getUsedInventoryCounts(nodes), [nodes]);

  const filteredOwnedGear = useMemo(() => {
    const items = ownedGear.filter((item) => matchesOwnedGearQuery(item, query));
    return [...items].sort((a, b) => {
      const aMissing = Math.max((usedCounts.get(getInventoryMatchKey(a.template)) ?? 0) - a.quantity, 0);
      const bMissing = Math.max((usedCounts.get(getInventoryMatchKey(b.template)) ?? 0) - b.quantity, 0);
      return bMissing - aMissing || a.template.label.localeCompare(b.template.label);
    });
  }, [ownedGear, query, usedCounts]);

  const totals = useMemo(() => {
    return ownedGear.reduce((acc, item) => {
      const used = usedCounts.get(getInventoryMatchKey(item.template)) ?? 0;
      acc.owned += item.quantity;
      acc.used += used;
      acc.missing += Math.max(used - item.quantity, 0);
      return acc;
    }, { owned: 0, used: 0, missing: 0 });
  }, [ownedGear, usedCounts]);

  const exportOwnedGear = useCallback(() => {
    const payload: OwnedGearFile = { version: 1, ownedGear };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "") || "owned-gear"}.owned-gear.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [ownedGear, schematicName]);

  const importOwnedGear = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as OwnedGearFile | OwnedGearItem[];
      const incoming = Array.isArray(parsed) ? parsed : parsed.ownedGear;
      if (!Array.isArray(incoming)) throw new Error("Invalid owned gear file");
      const normalized = incoming
        .filter((item): item is OwnedGearItem => !!item?.template && typeof item.template.label === "string")
        .map((item) => ({
          template: item.template,
          quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
        }));
      setOwnedGear(normalized);
      addToast(`Loaded ${normalized.length} owned gear item${normalized.length === 1 ? "" : "s"}`, "success");
    } catch {
      addToast("Couldn't load owned gear JSON", "error");
    }
  }, [setOwnedGear, addToast]);

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={importOwnedGear}
      />
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={exportOwnedGear}
            disabled={ownedGear.length === 0}
            className="flex-1 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
          >
            Import JSON
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="rounded bg-white px-1 py-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">Owned</div>
            <div className="text-xs font-semibold text-[var(--color-text-heading)]">{totals.owned}</div>
          </div>
          <div className="rounded bg-white px-1 py-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">Used</div>
            <div className="text-xs font-semibold text-[var(--color-text-heading)]">{totals.used}</div>
          </div>
          <div className="rounded bg-white px-1 py-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">To Buy</div>
            <div className={`text-xs font-semibold ${totals.missing > 0 ? "text-amber-600" : "text-emerald-600"}`}>{totals.missing}</div>
          </div>
        </div>
      </div>

      {filteredOwnedGear.length === 0 ? (
        <div className="text-xs text-[var(--color-text-muted)] text-center py-6 px-3">
          {ownedGear.length === 0
            ? "No owned gear yet. Add items from the Devices tab, or import a JSON inventory."
            : `No owned gear matches “${query}”.`}
        </div>
      ) : (
        filteredOwnedGear.map((item) => {
          const key = getTemplateKey(item.template);
          const used = usedCounts.get(getInventoryMatchKey(item.template)) ?? 0;
          const missing = Math.max(used - item.quantity, 0);
          const spare = Math.max(item.quantity - used, 0);
          return (
            <div
              key={key}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 space-y-1.5 cursor-grab"
              draggable
              onDragStart={(e) => onDragStart(e, item.template)}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--color-text-heading)] truncate">
                    <HighlightedText text={item.template.label} query={query} />
                  </div>
                  {item.template.manufacturer && (
                    <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                      <HighlightedText text={item.template.manufacturer} query={query} />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeOwnedGear(key)}
                  className="text-red-400/70 hover:text-red-500 text-sm leading-none cursor-pointer px-1"
                  title="Remove from owned gear"
                >
                  &times;
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateOwnedGearQuantity(key, item.quantity - 1)}
                  className="w-6 h-6 rounded border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                  title="Decrease quantity"
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(e) => updateOwnedGearQuantity(key, Number.parseInt(e.target.value || "0", 10))}
                  className="w-14 rounded border border-[var(--color-border)] bg-white px-1 py-1 text-xs text-center text-[var(--color-text)] outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => updateOwnedGearQuantity(key, item.quantity + 1)}
                  className="w-6 h-6 rounded border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                  title="Increase quantity"
                >
                  +
                </button>
                <div className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                  Used {used}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="rounded bg-white px-1.5 py-0.5 text-[var(--color-text-muted)]">Owned {item.quantity}</span>
                {missing > 0 ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Buy {missing}</span>
                ) : (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Spare {spare}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function DeviceLibrary() {
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const ownedGear = useSchematicStore((s) => s.ownedGear);
  const removeCustomTemplate = useSchematicStore((s) => s.removeCustomTemplate);
  const addOwnedGear = useSchematicStore((s) => s.addOwnedGear);
  const templatePresets = useSchematicStore((s) => s.templatePresets);
  const favoriteTemplates = useSchematicStore((s) => s.favoriteTemplates);
  const toggleFavoriteTemplate = useSchematicStore((s) => s.toggleFavoriteTemplate);
  const categoryOrder = useSchematicStore((s) => s.categoryOrder);
  const reorderCategory = useSchematicStore((s) => s.reorderCategory);
  const showOwnedGearPane = useSchematicStore((s) => s.showOwnedGearPane);
  const libraryActiveTab = useSchematicStore((s) => s.libraryActiveTab);
  const setLibraryActiveTab = useSchematicStore((s) => s.setLibraryActiveTab);
  const [search, setSearch] = useState("");
  const [showDeviceCreator, setShowDeviceCreator] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [templates, setTemplates] = useState(getBundledTemplates);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<Set<string>>(new Set());
  const [filterPanel, setFilterPanel] = useState<"category" | "brand" | "signal" | null>(null);

  const presetIds = useMemo(() => new Set(Object.keys(templatePresets)), [templatePresets]);
  const favoriteSet = useMemo(() => new Set(favoriteTemplates), [favoriteTemplates]);

  // Non-expansion templates for filter option derivation
  const libraryTemplates = useMemo(
    () => templates.filter((t) => t.category !== "Expansion Cards"),
    [templates],
  );

  const matchesSignalFilter = useCallback((t: DeviceTemplate) => {
    if (selectedSignalTypes.size === 0) return true;
    return t.ports.some((p) => selectedSignalTypes.has(p.signalType));
  }, [selectedSignalTypes]);

  // Cross-filtered dropdown options
  const categoryOptions = useMemo(() => {
    let source = libraryTemplates;
    if (selectedBrands.size > 0) source = source.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    if (selectedSignalTypes.size > 0) source = source.filter(matchesSignalFilter);
    return [...new Set(source.map((t) => t.category).filter(Boolean))].sort() as string[];
  }, [libraryTemplates, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  const brandOptions = useMemo(() => {
    let source = libraryTemplates;
    if (selectedCategories.size > 0) source = source.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedSignalTypes.size > 0) source = source.filter(matchesSignalFilter);
    return [...new Set(source.map((t) => t.manufacturer).filter(Boolean))].sort() as string[];
  }, [libraryTemplates, selectedCategories, selectedSignalTypes, matchesSignalFilter]);

  const signalTypeOptions = useMemo(() => {
    let source = libraryTemplates;
    if (selectedCategories.size > 0) source = source.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedBrands.size > 0) source = source.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    const types = new Set<string>();
    for (const t of source) for (const p of t.ports) types.add(p.signalType);
    return [...types].sort((a, b) => (SIGNAL_LABELS[a as keyof typeof SIGNAL_LABELS] ?? a).localeCompare(SIGNAL_LABELS[b as keyof typeof SIGNAL_LABELS] ?? b));
  }, [libraryTemplates, selectedCategories, selectedBrands]);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand); else next.add(brand);
      return next;
    });
  }, []);

  const toggleSignalType = useCallback((st: string) => {
    setSelectedSignalTypes((prev) => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st); else next.add(st);
      return next;
    });
  }, []);

  const hasFilter = selectedCategories.size > 0 || selectedBrands.size > 0 || selectedSignalTypes.size > 0;

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => console.warn("Using bundled device library (API unavailable)"));
  }, []);

  const handleAddToOwned = useCallback((template: DeviceTemplate) => {
    addOwnedGear(template, 1);
  }, [addOwnedGear]);

  const query = search.trim();

  const filteredCustom = useMemo(() => {
    let result = customTemplates;
    if (selectedCategories.size > 0) result = result.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedBrands.size > 0) result = result.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    if (selectedSignalTypes.size > 0) result = result.filter(matchesSignalFilter);
    if (query) result = result.filter((t) => scoreTemplate(t, query) > 0);
    return result;
  }, [customTemplates, query, selectedCategories, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  // When searching, produce a flat ranked list; when browsing, keep categories
  const rankedResults = useMemo(() => {
    if (!query) return null;
    let all = [...templates, ...customTemplates].filter((t) => t.category !== "Expansion Cards");
    if (selectedCategories.size > 0) all = all.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedBrands.size > 0) all = all.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    if (selectedSignalTypes.size > 0) all = all.filter(matchesSignalFilter);
    const scored = all
      .map((t) => {
        let score = scoreTemplate(t, query);
        // Boost favorites to the top of results
        if (score > 0 && favoriteSet.has(t.id ?? t.deviceType)) score += 200;
        return { template: t, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.template.label.localeCompare(b.template.label));
    return scored.map((r) => r.template);
  }, [templates, customTemplates, query, favoriteSet, selectedCategories, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  // Favorites section: resolve template keys to actual template objects
  const favoritesList = useMemo(() => {
    if (favoriteTemplates.length === 0) return [];
    const all = [...templates, ...customTemplates];
    const byKey = new Map<string, DeviceTemplate>();
    for (const t of all) byKey.set(t.id ?? t.deviceType, t);
    let favs = favoriteTemplates.map((k) => byKey.get(k)).filter((t): t is DeviceTemplate => !!t);
    if (selectedCategories.size > 0) favs = favs.filter((t) => t.category && selectedCategories.has(t.category));
    if (selectedBrands.size > 0) favs = favs.filter((t) => t.manufacturer && selectedBrands.has(t.manufacturer));
    if (selectedSignalTypes.size > 0) favs = favs.filter(matchesSignalFilter);
    return favs;
  }, [templates, customTemplates, favoriteTemplates, selectedCategories, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  const filteredCategories = useMemo(() => {
    const groups = new Map<string, DeviceTemplate[]>();
    for (const t of templates) {
      // Expansion cards are only selectable via the slot picker, not the library
      if (t.category === "Expansion Cards") continue;
      // Apply active filters
      if (selectedCategories.size > 0 && (!t.category || !selectedCategories.has(t.category))) continue;
      if (selectedBrands.size > 0 && (!t.manufacturer || !selectedBrands.has(t.manufacturer))) continue;
      if (selectedSignalTypes.size > 0 && !matchesSignalFilter(t)) continue;
      const cat = t.category ?? "Other";
      const arr = groups.get(cat);
      if (arr) arr.push(t);
      else groups.set(cat, [t]);
    }
    // Sort each group alphabetically
    for (const arr of groups.values()) arr.sort((a, b) => a.label.localeCompare(b.label));
    // Sort categories by user's custom order (or default), unknown ones alphabetically at end
    const effectiveOrder = categoryOrder ?? CATEGORY_ORDER_DEFAULT;
    const orderIndex = new Map(effectiveOrder.map((c, i) => [c, i]));
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const ai = orderIndex.get(a) ?? 9999;
        const bi = orderIndex.get(b) ?? 9999;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
      })
      .map(([label, tmpls]) => ({ label, templates: tmpls }));
  }, [templates, categoryOrder, selectedCategories, selectedBrands, selectedSignalTypes, matchesSignalFilter]);

  const totalResults = rankedResults?.length ??
    (filteredCustom.length + filteredCategories.reduce((sum, c) => sum + c.templates.length, 0));
  const ownedResults = useMemo(
    () => ownedGear.filter((item) => matchesOwnedGearQuery(item, query)).length,
    [ownedGear, query],
  );

  if (collapsed) {
    return (
      <div className="w-8 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col items-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="py-3 cursor-pointer hover:bg-[var(--color-surface-hover)] w-full flex justify-center transition-colors"
          title="Show device library"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        <div className="writing-mode-vertical text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mt-2 select-none"
          style={{ writingMode: "vertical-rl" }}
        >
          {showOwnedGearPane ? "Library" : "Devices"}
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[var(--color-text-heading)] uppercase tracking-wider">
          {showOwnedGearPane ? "Library" : "Devices"}
        </h2>
        <button
          onClick={() => setCollapsed(true)}
          className="cursor-pointer hover:bg-[var(--color-surface-hover)] rounded p-0.5 transition-colors"
          title="Collapse device library"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
      </div>

      {showOwnedGearPane && (
        <div className="px-2 py-1.5 border-b border-[var(--color-border)] flex gap-1">
          <button
            onClick={() => setLibraryActiveTab("devices")}
            className={`flex-1 rounded px-2 py-1 text-[10px] transition-colors cursor-pointer ${
              libraryActiveTab === "devices"
                ? "bg-blue-100 text-blue-700 font-semibold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Devices
          </button>
          <button
            onClick={() => setLibraryActiveTab("owned")}
            className={`flex-1 rounded px-2 py-1 text-[10px] transition-colors cursor-pointer ${
              libraryActiveTab === "owned"
                ? "bg-blue-100 text-blue-700 font-semibold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            Owned Gear
          </button>
        </div>
      )}

      {/* Search */}
      <div className="px-2 pt-2 pb-1.5">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={libraryActiveTab === "owned" ? "Search owned gear..." : "Search devices..."}
            className="w-full bg-white border border-[var(--color-border)] rounded pl-7 pr-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm cursor-pointer"
            >
              &times;
            </button>
          )}
        </div>
        {query && (
          <div className="text-[10px] text-[var(--color-text-muted)] mt-1 px-0.5">
            {(libraryActiveTab === "owned" ? ownedResults : totalResults)} result{(libraryActiveTab === "owned" ? ownedResults : totalResults) !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Filters */}
      {libraryActiveTab === "devices" && (
      <div className="px-2 pb-2 border-b border-[var(--color-border)]">
        <div className="flex gap-1.5">
          <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
              filterPanel === "category"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : selectedCategories.size > 0
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text)]"
            }`}>
            <button
              onMouseDown={(e) => { e.preventDefault(); setFilterPanel((p) => p === "category" ? null : "category"); }}
              className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
            >
              {selectedCategories.size > 0 ? `Categories (${selectedCategories.size})` : "Categories"}
            </button>
            {selectedCategories.size > 0 && (
              <button
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedCategories(new Set()); }}
                className="px-1 text-blue-400 hover:text-blue-600 text-xs shrink-0"
              >
                &times;
              </button>
            )}
          </div>
          <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
              filterPanel === "brand"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : selectedBrands.size > 0
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text)]"
            }`}>
            <button
              onMouseDown={(e) => { e.preventDefault(); setFilterPanel((p) => p === "brand" ? null : "brand"); }}
              className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
            >
              {selectedBrands.size > 0 ? `Brands (${selectedBrands.size})` : "Brands"}
            </button>
            {selectedBrands.size > 0 && (
              <button
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedBrands(new Set()); }}
                className="px-1 text-blue-400 hover:text-blue-600 text-xs shrink-0"
              >
                &times;
              </button>
            )}
          </div>
          <div className={`flex-1 min-w-0 flex items-center rounded border transition-colors ${
              filterPanel === "signal"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : selectedSignalTypes.size > 0
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text)]"
            }`}>
            <button
              onMouseDown={(e) => { e.preventDefault(); setFilterPanel((p) => p === "signal" ? null : "signal"); }}
              className="flex-1 min-w-0 px-1.5 py-1 text-[10px] text-left truncate"
            >
              {selectedSignalTypes.size > 0 ? `Signals (${selectedSignalTypes.size})` : "Signals"}
            </button>
            {selectedSignalTypes.size > 0 && (
              <button
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedSignalTypes(new Set()); }}
                className="px-1 text-blue-400 hover:text-blue-600 text-xs shrink-0"
              >
                &times;
              </button>
            )}
          </div>
        </div>
        {filterPanel === "category" && (
          <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
            {categoryOptions.map((c) => (
              <button
                key={c}
                onMouseDown={(e) => { e.preventDefault(); toggleCategory(c); }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  selectedCategories.has(c)
                    ? "bg-blue-500 text-white"
                    : "bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {filterPanel === "brand" && (
          <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
            {brandOptions.map((m) => (
              <button
                key={m}
                onMouseDown={(e) => { e.preventDefault(); toggleBrand(m); }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  selectedBrands.has(m)
                    ? "bg-blue-500 text-white"
                    : "bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
        {filterPanel === "signal" && (
          <div className="mt-1.5 max-h-28 overflow-y-auto flex flex-wrap gap-1">
            {signalTypeOptions.map((st) => (
              <button
                key={st}
                onMouseDown={(e) => { e.preventDefault(); toggleSignalType(st); }}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  selectedSignalTypes.has(st)
                    ? "bg-blue-500 text-white"
                    : "bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                {SIGNAL_LABELS[st as keyof typeof SIGNAL_LABELS] ?? st}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {showDeviceCreator && <DeviceCreatorPicker onClose={() => setShowDeviceCreator(false)} />}

      {libraryActiveTab === "owned" ? (
        <OwnedGearTab query={query} />
      ) : (
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Note draggable */}
        {!hasFilter && (!query || "note".includes(query.toLowerCase())) && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/easyschematic-note", "1");
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 cursor-grab active:cursor-grabbing transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M3 2h7l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
              <path d="M10 2v4h4" />
              <line x1="5" y1="8" x2="11" y2="8" />
              <line x1="5" y1="11" x2="9" y2="11" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Note</span>
          </div>
        )}

        {/* Room draggable */}
        {!hasFilter && (!query || "room".includes(query.toLowerCase())) && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/easyschematic-room",
                JSON.stringify({ label: "Room" }),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-hover)] cursor-grab active:cursor-grabbing transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" strokeDasharray="3 2" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Room</span>
          </div>
        )}

        {/* Create New Device */}
        {!hasFilter && (!query || "create new device".includes(query.toLowerCase())) && (
          <button
            onClick={() => setShowDeviceCreator(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-blue-400/50 bg-blue-500/10 hover:bg-blue-500/15 text-xs text-blue-600 hover:text-blue-700 cursor-pointer transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <line x1="8" y1="5" x2="8" y2="11" />
              <line x1="5" y1="8" x2="11" y2="8" />
            </svg>
            Create New Device
          </button>
        )}

        {query && rankedResults ? (
          <>
            {rankedResults.length > 0 ? (
              <div>
                {rankedResults.map((template) => {
                  const key = template.id ?? template.deviceType;
                  return (
                    <TemplateItem
                      key={key}
                      template={template}
                      query={query}
                      onDelete={customTemplates.includes(template) ? () => removeCustomTemplate(template.id ?? template.deviceType) : undefined}
                      hasPreset={!!(template.id && presetIds.has(template.id))}
                      isFavorite={favoriteSet.has(key)}
                      onToggleFavorite={() => toggleFavoriteTemplate(key)}
                      onAddToOwned={() => handleAddToOwned(template)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
                No devices match &ldquo;{query}&rdquo;
              </div>
            )}
          </>
        ) : (
          <>
            {favoritesList.length > 0 && (
              <CategorySection
                label="Favorites"
                templates={favoritesList}
                query={query}
                defaultOpen={true}
                presetIds={presetIds}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
                onAddToOwned={handleAddToOwned}
              />
            )}

            <CustomTemplatesSection
              customTemplates={customTemplates}
              query={query}
              favoriteSet={favoriteSet}
              onAddToOwned={handleAddToOwned}
            />

            {filteredCategories.map((cat, i) => (
              <CategorySection
                key={cat.label}
                label={cat.label}
                templates={cat.templates}
                query={query}
                defaultOpen={false}
                presetIds={presetIds}
                favoriteSet={favoriteSet}
                onToggleFavorite={toggleFavoriteTemplate}
                onAddToOwned={handleAddToOwned}
                categoryIndex={i}
                onCategoryReorder={reorderCategory}
              />
            ))}
          </>
        )}
      </div>
      )}

      {/* Version */}
      <div className="px-3 py-1.5 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]">
        v{APP_VERSION} ({BUILD_HASH})
      </div>
    </div>
  );
}
