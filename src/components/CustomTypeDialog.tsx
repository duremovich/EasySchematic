import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_CATEGORIES } from "../deviceTypeCategories";
import {
  CANVAS_SURFACES,
  CONNECTOR_GENDER_OPTIONS,
  MAX_TYPE_DESCRIPTION,
  MAX_TYPE_LABEL,
  MIN_CANVAS_CONTRAST,
  checkCablePrefix,
  checkSignalColor,
  emptyTypeData,
  registryTypeCandidates,
  slugifyTypeId,
  suggestCablePrefix,
  suggestSimilarTypes,
  validateCustomTypeData,
  type CustomTypeKind,
  type TypeData,
  type TypeSuggestion,
} from "../customTypes";
import { CONNECTOR_GROUP_NAMES, SIGNAL_GROUP_NAMES, connectorGroups, connectorLabel } from "../typeRegistry";
import { useTypeRegistryVersion } from "../hooks/useTypeRegistryVersion";
import { closeTypeDialog, useTypeDialogRequest, type TypeDialogRequest } from "../newTypeRequest";
import { isTypeIdTaken, newUserTypeId, registeredTypesForValidation, saveUserType, type UserTypeDef } from "../userTypes";
import { useSchematicStore } from "../store";

/**
 * The create / edit dialog for the user's own types (custom-types P5): the same fields and
 * guardrails as the devices site's mod Types page — did-you-mean across every tier while
 * typing the label, and the colour check with "Use suggested". Mounted once (App); pickers
 * and Preferences open it through `newTypeRequest`.
 */
export default function CustomTypeDialogHost() {
  const request = useTypeDialogRequest();
  if (!request) return null;
  // Keyed so each request starts from a fresh draft.
  return createPortal(<CustomTypeDialog key={`${request.kind}:${request.editing?.id ?? "new"}`} request={request} />, document.body);
}

const KIND_NOUN: Record<CustomTypeKind, string> = { signal: "signal type", connector: "connector type", device: "device type" };
const SOURCE_LABEL: Record<TypeSuggestion["source"], string> = {
  "built-in": "built-in",
  community: "community",
  user: "yours",
  document: "in this file",
};

const INPUT =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500";
const LABEL = "block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

function draftFrom(request: TypeDialogRequest): TypeData {
  const e = request.editing;
  if (!e) return { ...emptyTypeData(request.kind), ...(request.kind === "signal" ? { defaultConnector: "other" } : {}) };
  const { id: _id, label: _label, retired: _retired, ...data } = e as UserTypeDef & { retired?: boolean };
  return { ...data } as TypeData;
}

function CustomTypeDialog({ request }: { request: TypeDialogRequest }) {
  const { kind, editing, onDone } = request;
  useTypeRegistryVersion();
  const [label, setLabel] = useState(editing?.label ?? request.initialLabel ?? "");
  const [data, setData] = useState<TypeData>(() => draftFrom(request));
  const set = (patch: TypeData) => setData((d) => ({ ...d, ...patch }));

  const existing = registeredTypesForValidation();
  const selfId = editing?.id ?? "";
  const trimmed = label.trim();
  const prefixFree = (p: string) => checkCablePrefix(p, existing, selfId || undefined) === null;
  const suggestedPrefix = kind === "signal" && !str(data.cablePrefix) ? suggestCablePrefix(trimmed, prefixFree) : "";

  // Blank cable name / prefix take the label and the suggested prefix, so the quick path
  // is a label, a colour and a group.
  const effective: TypeData =
    kind === "signal"
      ? { ...data, cable: str(data.cable).trim() || trimmed, cablePrefix: str(data.cablePrefix) || suggestedPrefix }
      : kind === "connector"
        ? { ...data, cable: str(data.cable).trim() || trimmed }
        : data;
  const previous = editing ? (draftFrom(request) as Record<string, unknown>) : undefined;
  const result = validateCustomTypeData(kind, effective, { selfId, existing, previous });
  const labelError = !trimmed ? "Label is required" : trimmed.length > MAX_TYPE_LABEL ? `Label must be ${MAX_TYPE_LABEL} characters or fewer` : null;
  const error = labelError ?? (result.ok ? null : result.error);
  // The colour field spells out its own problem and fix; the footer just points at it.
  const colourFails = kind === "signal" && !checkSignalColor(effective.color).ok;
  const footer = labelError ?? (colourFails ? "Pick a colour that passes (above)." : error);

  // Guardrail 1, inline: what already covers this, in any tier.
  const suggestions = useMemo(() => {
    if (trimmed.length < 2) return [];
    return suggestSimilarTypes([trimmed, slugifyTypeId(trimmed)], registryTypeCandidates(kind), { limit: 4, includeRetired: false })
      .filter((s) => s.id !== selfId);
  }, [trimmed, kind, selfId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeTypeDialog();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const save = () => {
    if (error || !result.ok) return;
    const id = editing?.id ?? newUserTypeId(trimmed, isTypeIdTaken);
    const def = { id, label: trimmed, ...result.data, ...(editing?.retired ? { retired: true } : {}) } as UserTypeDef;
    saveUserType(kind, def);
    // The open file may carry its own copy of this type (it wins in the document); an edit
    // made here is meant for what's on screen, so it updates that copy too.
    if (editing) useSchematicStore.getState().updateDocumentType(kind, def);
    closeTypeDialog();
    onDone?.(id);
  };

  const pickExisting = (id: string) => {
    closeTypeDialog();
    onDone?.(id);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeTypeDialog(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
      }}
      data-testid="custom-type-dialog"
    >
      <div className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[460px] flex flex-col max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--color-text-heading)]">
            {editing ? `Edit ${KIND_NOUN[kind]}` : `New ${KIND_NOUN[kind]}`}
          </span>
          <button onClick={closeTypeDialog} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer">
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          <label className="block">
            <span className={LABEL}>Name *</span>
            <input
              autoFocus
              className={INPUT}
              value={label}
              maxLength={MAX_TYPE_LABEL}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === "signal" ? "e.g. Show Comms" : kind === "connector" ? "e.g. WECO 3-pin" : "e.g. Comms Base Station"}
              data-testid="custom-type-label"
            />
          </label>

          {suggestions.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs" data-testid="did-you-mean">
              <div className="text-[var(--color-text)] mb-1">Did you mean one of these?</div>
              <ul className="space-y-0.5">
                {suggestions.map((s) => (
                  <li key={`${s.source}:${s.id}`} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--color-text-heading)]">
                      {s.label}
                      <span className="text-[var(--color-text-muted)]"> · {SOURCE_LABEL[s.source]}{s.category || s.group ? ` · ${s.category ?? s.group}` : ""}</span>
                    </span>
                    {onDone && !editing && (
                      <button type="button" onClick={() => pickExisting(s.id)} className="text-blue-600 hover:underline cursor-pointer shrink-0">
                        Use this
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <KindFields kind={kind} data={data} set={set} selfId={selfId} label={trimmed} suggestedPrefix={suggestedPrefix} />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--color-border)] shrink-0">
          <span className="text-[11px] text-red-600 min-h-[1em]" data-testid="custom-type-error">{footer && (label || editing) ? footer : ""}</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={closeTypeDialog} className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!!error}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              data-testid="custom-type-save"
            >
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KindFields({ kind, data, set, selfId, label, suggestedPrefix }: {
  kind: CustomTypeKind;
  data: TypeData;
  set: (patch: TypeData) => void;
  selfId: string;
  label: string;
  suggestedPrefix: string;
}) {
  const groups = connectorGroups();
  return (
    <div className="grid grid-cols-2 gap-3">
      {kind === "device" && (
        <label className="col-span-2">
          <span className={LABEL}>Category *</span>
          <select className={INPUT} value={str(data.category)} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Select category</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}

      {kind === "signal" && (
        <>
          <div className="col-span-2">
            <ColorField value={str(data.color)} onChange={(color) => set({ color })} />
          </div>
          <GroupSelect names={SIGNAL_GROUP_NAMES} value={str(data.group)} onChange={(group) => set({ group })} />
          <label>
            <span className={LABEL}>Default connector *</span>
            <select className={INPUT} value={str(data.defaultConnector)} onChange={(e) => set({ defaultConnector: e.target.value })} data-testid="custom-type-default-connector">
              {Object.entries(groups).map(([g, ids]) => (
                <optgroup key={g} label={g}>
                  {ids.map((id) => <option key={id} value={id}>{connectorLabel(id)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Cable name</span>
            <input className={INPUT} value={str(data.cable)} maxLength={MAX_TYPE_LABEL} onChange={(e) => set({ cable: e.target.value })} placeholder={label || "e.g. Comms"} />
          </label>
          <label>
            <span className={LABEL}>Cable-ID prefix <span className="normal-case tracking-normal">(2–4 capitals)</span></span>
            <input
              className={`${INPUT} font-mono`}
              value={str(data.cablePrefix)}
              maxLength={4}
              onChange={(e) => set({ cablePrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
              placeholder={suggestedPrefix || "e.g. SC"}
            />
          </label>
        </>
      )}

      {kind === "connector" && (
        <>
          <GroupSelect names={CONNECTOR_GROUP_NAMES} value={str(data.group)} onChange={(group) => set({ group })} />
          <label>
            <span className={LABEL}>Device-side gender</span>
            <select className={INPUT} value={str(data.gender) || "none"} onChange={(e) => set({ gender: e.target.value })}>
              {CONNECTOR_GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g === "none" ? "None (genderless)" : g[0].toUpperCase() + g.slice(1)}</option>)}
            </select>
          </label>
          <label className="col-span-2">
            <span className={LABEL}>Cable name</span>
            <input className={INPUT} value={str(data.cable)} maxLength={MAX_TYPE_LABEL} onChange={(e) => set({ cable: e.target.value })} placeholder={label || "e.g. WECO 3-pin"} />
          </label>
          <ConnectorListField
            label="Mates with"
            hint="Connectors it plugs into directly, like EtherCON taking RJ45. It always mates with its own kind."
            value={list(data.matesWith)}
            onChange={(matesWith) => set({ matesWith })}
            exclude={[selfId, ...list(data.adaptsTo)]}
            groups={groups}
            testId="custom-type-mates-with"
          />
          <ConnectorListField
            label="Adapts to"
            hint={'Connectors it reaches through an adapter cable, like HD-BNC to BNC. The cable schedule calls those runs "A to B Adapter".'}
            value={list(data.adaptsTo)}
            onChange={(adaptsTo) => set({ adaptsTo })}
            exclude={[selfId, ...list(data.matesWith)]}
            groups={groups}
            testId="custom-type-adapts-to"
          />
        </>
      )}

      <label className="col-span-2">
        <span className={LABEL}>Description</span>
        <input
          className={INPUT}
          value={str(data.description)}
          maxLength={MAX_TYPE_DESCRIPTION}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Optional: what it's for"
        />
      </label>
    </div>
  );
}

function GroupSelect({ names, value, onChange }: { names: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className={LABEL}>Group *</span>
      <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} data-testid="custom-type-group">
        <option value="">Select group</option>
        {names.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    </label>
  );
}

/** Guardrail 2, live: contrast on both canvases, the DXF layer colour, and a one-click fix. */
function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const check = checkSignalColor(value);
  const hex = check.hex ?? "#71717a";
  const sample = (bg: string, contrast: number, name: string) => (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--color-border)]" style={{ background: bg }}>
      <svg width="36" height="10" aria-hidden><line x1="0" y1="5" x2="36" y2="5" stroke={hex} strokeWidth="2.5" /></svg>
      <span className={`text-[10px] font-medium ${contrast >= MIN_CANVAS_CONTRAST ? "text-green-600" : "text-red-500"}`}>
        {name} {contrast.toFixed(1)}:1
      </span>
    </div>
  );
  return (
    <div data-testid="color-field">
      <span className={LABEL}>Colour * <span className="normal-case tracking-normal">(must read on light and dark canvas)</span></span>
      <div className="flex flex-wrap items-center gap-2">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 rounded border border-[var(--color-border)] bg-transparent cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="#2563eb" className={`${INPUT} font-mono !w-[84px]`} data-testid="custom-type-color" />
        {check.hex && sample(CANVAS_SURFACES.light, check.contrastLight, "Light")}
        {check.hex && sample(CANVAS_SURFACES.dark, check.contrastDark, "Dark")}
      </div>
      {!check.ok && (
        <div className="mt-1.5 text-[11px] text-red-600" data-testid="color-problems">
          {check.hex ? `${check.hex} is ${check.problems.join(" and ")}.` : check.problems[0]}
          {check.suggestion && (
            <button
              type="button"
              onClick={() => onChange(check.suggestion!)}
              className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface)] cursor-pointer"
              data-testid="use-suggested-color"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: check.suggestion }} />
              Use suggested {check.suggestion}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Multi-select over every connector the app knows (built-in, community, yours), as chips. */
function ConnectorListField({ label, hint, value, onChange, exclude, groups, testId }: {
  label: string;
  hint: string;
  value: string[];
  onChange: (v: string[]) => void;
  exclude: string[];
  groups: Record<string, string[]>;
  testId: string;
}) {
  const hidden = new Set([...exclude, ...value]);
  return (
    <div className="col-span-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-wrap gap-1 mb-1 min-h-[1.25rem]">
        {value.length === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">None</span>}
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-text)]">
            {connectorLabel(id)}
            <button type="button" aria-label={`Remove ${connectorLabel(id)}`} onClick={() => onChange(value.filter((v) => v !== id))} className="text-[var(--color-text-muted)] hover:text-red-600 cursor-pointer">×</button>
          </span>
        ))}
      </div>
      <select className={INPUT} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} data-testid={testId}>
        <option value="">Add connector…</option>
        {Object.entries(groups).map(([g, ids]) => {
          const shown = ids.filter((id) => !hidden.has(id));
          return shown.length ? (
            <optgroup key={g} label={g}>
              {shown.map((id) => <option key={id} value={id}>{connectorLabel(id)}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
      <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5 block">{hint}</span>
    </div>
  );
}
