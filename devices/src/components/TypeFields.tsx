import { ALL_CATEGORIES } from "../../../src/deviceTypeCategories";
import {
  CANVAS_SURFACES,
  CONNECTOR_GENDER_OPTIONS,
  MIN_CANVAS_CONTRAST,
  checkCablePrefix,
  checkSignalColor,
  MAX_TYPE_DESCRIPTION,
  MAX_TYPE_LABEL,
} from "../../../src/customTypes";
import type { CustomTypeKind, CustomTypeRecord } from "../../../src/customTypes";
import { CONNECTOR_GROUP_NAMES, SIGNAL_GROUP_NAMES, connectorLabel } from "../../../src/typeRegistry";
import type { ConnectorType } from "../../../src/types";
import SearchableSelect from "./SearchableSelect";
import { TYPE_INPUT, TYPE_LABEL, type TypeData } from "../typeDrafts";
import { usePortPickerGroups } from "../hooks/useCommunityTypes";

/**
 * The kind-specific fields of a community type (custom-types P3), shared by the
 * Types page's create form and its edit rows. `data` is the draft `data` object
 * the API stores; validation runs in the caller through the shared validator.
 */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export default function TypeFields({ kind, data, onChange, records, selfId }: {
  kind: CustomTypeKind;
  data: TypeData;
  onChange: (data: TypeData) => void;
  /** Every stored community type (for prefix uniqueness and connector lists). */
  records: readonly CustomTypeRecord[];
  /** The type's own id: excluded from its mating lists and its own prefix check. */
  selfId: string;
}) {
  const set = (patch: TypeData) => onChange({ ...data, ...patch });
  const { connectors } = usePortPickerGroups();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {kind === "device" && (
        <label>
          <span className={TYPE_LABEL}>Category *</span>
          <select value={str(data.category)} onChange={(e) => set({ category: e.target.value })} className={TYPE_INPUT}>
            <option value="">Select category</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}

      {kind === "signal" && (
        <>
          <div className="sm:col-span-2">
            <ColorField value={str(data.color)} onChange={(color) => set({ color })} />
          </div>
          <GroupSelect names={SIGNAL_GROUP_NAMES} value={str(data.group)} onChange={(group) => set({ group })} />
          <div>
            <span className={TYPE_LABEL}>Default connector *</span>
            <SearchableSelect<ConnectorType>
              value={str(data.defaultConnector) as ConnectorType}
              onChange={(v) => set({ defaultConnector: v })}
              groups={connectors}
              labels={connectorLabel}
              placeholder="Select connector"
              className={TYPE_INPUT}
            />
          </div>
          <label>
            <span className={TYPE_LABEL}>Cable name *</span>
            <input value={str(data.cable)} maxLength={MAX_TYPE_LABEL} onChange={(e) => set({ cable: e.target.value })} placeholder="e.g. Ethernet" className={TYPE_INPUT} />
          </label>
          <label>
            <span className={TYPE_LABEL}>Cable-ID prefix * <span className="font-normal text-slate-400">(2–4 capitals)</span></span>
            <input
              value={str(data.cablePrefix)}
              maxLength={4}
              onChange={(e) => set({ cablePrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
              placeholder="e.g. WC"
              className={`${TYPE_INPUT} font-mono`}
            />
            {str(data.cablePrefix) && (() => {
              const err = checkCablePrefix(data.cablePrefix, records, selfId || undefined);
              return err ? <span className="text-xs text-red-600 dark:text-red-400 mt-1 block">{err}</span> : null;
            })()}
          </label>
        </>
      )}

      {kind === "connector" && (
        <>
          <GroupSelect names={CONNECTOR_GROUP_NAMES} value={str(data.group)} onChange={(group) => set({ group })} />
          <label>
            <span className={TYPE_LABEL}>Device-side gender *</span>
            <select value={str(data.gender) || "none"} onChange={(e) => set({ gender: e.target.value })} className={TYPE_INPUT}>
              {CONNECTOR_GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g === "none" ? "None (genderless)" : g[0].toUpperCase() + g.slice(1)}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={TYPE_LABEL}>Cable name *</span>
            <input value={str(data.cable)} maxLength={MAX_TYPE_LABEL} onChange={(e) => set({ cable: e.target.value })} placeholder="e.g. WECO 3-pin" className={TYPE_INPUT} />
          </label>
          <ConnectorListField
            label="Mates with"
            hint="Connectors it plugs into directly, like EtherCON taking RJ45. It always mates with itself."
            value={list(data.matesWith)}
            onChange={(matesWith) => set({ matesWith })}
            exclude={[selfId, ...list(data.adaptsTo)]}
            groups={connectors}
          />
          <ConnectorListField
            label="Adapts to"
            hint={'Connectors it reaches through an adapter cable, like HD-BNC to BNC. The cable schedule calls those runs "A to B Adapter".'}
            value={list(data.adaptsTo)}
            onChange={(adaptsTo) => set({ adaptsTo })}
            exclude={[selfId, ...list(data.matesWith)]}
            groups={connectors}
          />
        </>
      )}

      <label className="sm:col-span-2">
        <span className={TYPE_LABEL}>Description</span>
        <input
          value={str(data.description)}
          maxLength={MAX_TYPE_DESCRIPTION}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={kind === "device" ? "Optional: what belongs under this type" : "Optional: what it's for, where it shows up"}
          className={TYPE_INPUT}
        />
      </label>
    </div>
  );
}

function GroupSelect({ names, value, onChange }: { names: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className={TYPE_LABEL}>Group *</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={TYPE_INPUT}>
        <option value="">Select group</option>
        {names.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    </label>
  );
}

/** Guardrail 2, live: contrast on both canvases, the DXF ACI check, and a one-click fix. */
export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const check = checkSignalColor(value);
  const hex = check.hex ?? "#71717a";
  const ok = "text-green-700 dark:text-green-400";
  const bad = "text-red-600 dark:text-red-400";
  const sample = (bg: string, contrast: number, name: string) => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700" style={{ background: bg }}>
      <svg width="56" height="12" aria-hidden><line x1="0" y1="6" x2="56" y2="6" stroke={hex} strokeWidth="2.5" /></svg>
      <span className={`text-xs font-medium ${contrast >= MIN_CANVAS_CONTRAST ? "text-green-600" : "text-red-500"}`}>
        {name} {contrast.toFixed(2)}:1
      </span>
    </div>
  );
  return (
    <div data-testid="color-field">
      <span className={TYPE_LABEL}>Colour * <span className="font-normal text-slate-400">(must read on both canvases, at least {MIN_CANVAS_CONTRAST}:1)</span></span>
      <div className="flex flex-wrap items-center gap-3">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded border border-slate-300 dark:border-slate-600 bg-transparent cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="#2563eb" className={`${TYPE_INPUT} font-mono max-w-[120px]`} />
        {check.hex && sample(CANVAS_SURFACES.light, check.contrastLight, "Light")}
        {check.hex && sample(CANVAS_SURFACES.dark, check.contrastDark, "Dark")}
        {check.hex && <span className={`text-xs ${check.aci === 8 ? bad : ok}`}>DXF ACI {check.aci}</span>}
      </div>
      {!check.ok && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400" data-testid="color-problems">
          {check.hex ? `${check.hex} is ${check.problems.join(" and ")}.` : check.problems[0]}
          {check.suggestion && (
            <button
              type="button"
              onClick={() => onChange(check.suggestion!)}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="w-3 h-3 rounded-full" style={{ background: check.suggestion }} />
              Use suggested {check.suggestion}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Multi-select over built-in + community connectors, shown as removable chips. */
function ConnectorListField({ label, hint, value, onChange, exclude, groups }: {
  label: string;
  hint: string;
  value: string[];
  onChange: (v: string[]) => void;
  exclude: string[];
  groups: Record<string, ConnectorType[]>;
}) {
  const hidden = new Set([...exclude, ...value]);
  const options = Object.fromEntries(
    Object.entries(groups).map(([g, ids]) => [g, ids.filter((id) => !hidden.has(id))]).filter(([, ids]) => ids.length),
  ) as Record<string, ConnectorType[]>;
  return (
    <div>
      <span className={TYPE_LABEL}>{label}</span>
      <div className="flex flex-wrap gap-1 mb-1.5 min-h-[1.5rem]">
        {value.length === 0 && <span className="text-xs text-slate-400">None</span>}
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">
            {connectorLabel(id)} <code className="text-[10px] text-slate-400">{id}</code>
            <button type="button" aria-label={`Remove ${id}`} onClick={() => onChange(value.filter((v) => v !== id))} className="text-slate-400 hover:text-red-600">×</button>
          </span>
        ))}
      </div>
      <SearchableSelect<ConnectorType>
        value=""
        onChange={(v) => onChange([...value, v])}
        groups={options}
        labels={connectorLabel}
        placeholder="Add connector…"
        className={TYPE_INPUT}
      />
      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">{hint}</span>
    </div>
  );
}
