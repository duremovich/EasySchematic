import { useEffect, useMemo, useState } from "react";
import { fetchCustomTypes, createCustomType, updateCustomType, deleteCustomType } from "../api";
import { formatDeviceTypeLabel } from "../../../src/deviceTypeCategories";
import {
  BUILTIN_DEVICE_TYPE_CATALOG,
  checkTypeIdAvailable,
  isCustomTypeKind,
  slugifyTypeId,
  suggestSimilarTypes,
  typeCandidates,
  validateCustomTypeData,
  MAX_TYPE_LABEL,
} from "../../../src/customTypes";
import type { CustomTypeKind, CustomTypeRecord } from "../../../src/customTypes";
import {
  builtinConnectors,
  builtinSignals,
  cablePrefix,
  connectorAccepts,
  connectorGroup,
  connectorLabel,
  defaultConnector,
  signalColor,
  signalGroup,
  signalLabel,
} from "../../../src/typeRegistry";
import { linkClick } from "../navigate";
import { useCommunityTypes } from "../hooks/useCommunityTypes";
import TypeFields from "../components/TypeFields";
import { emptyTypeData, TYPE_INPUT as INPUT, TYPE_LABEL as LABEL, type TypeData } from "../typeDrafts";

/**
 * Moderator page for community types (custom-types P1 device kind, P3 signal
 * and connector kinds). Built-ins are listed read-only; community types can be
 * created, edited, retired and — while unused — deleted.
 * Prefill via ?kind=<kind>&create=<slug>&category=<cat>&label=…&from=<submissionId>
 * (the review page's "Create this … type" shortcuts).
 */

const KIND_TITLES: Record<CustomTypeKind, { plural: string; one: string }> = {
  device: { plural: "Device types", one: "device type" },
  signal: { plural: "Signals", one: "signal type" },
  connector: { plural: "Connectors", one: "connector type" },
};

export default function AdminTypesPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [kind, setKind] = useState<CustomTypeKind>(() => {
    const k = params.get("kind");
    return isCustomTypeKind(k) ? k : "device";
  });
  const fromSubmission = params.get("from") || "";
  // The prefill only applies to the kind it was made for.
  const prefillKind = isCustomTypeKind(params.get("kind")) ? params.get("kind") : "device";
  const prefillId = params.get("create") && prefillKind === kind ? slugifyTypeId(params.get("create")!) : "";

  const [records, setRecords] = useState<CustomTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useCommunityTypes(); // keeps the registry (connector labels in the pickers) current

  const reload = () =>
    fetchCustomTypes()
      .then((r) => { setRecords(r); setLoadError(""); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load types"))
      .finally(() => setLoading(false));

  useEffect(() => { void reload(); }, []);

  const switchKind = (k: CustomTypeKind) => {
    setKind(k);
    const url = new URL(window.location.href);
    url.search = k === "device" ? "" : `?kind=${k}`;
    window.history.replaceState(null, "", url);
  };

  const ofKind = records.filter((r) => r.kind === kind);
  const title = KIND_TITLES[kind];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Types</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Add a device type, signal or connector here when a submission needs one that doesn't exist yet, then approve
        the submission. No deploy needed. Community types are plain data: a new signal connects only to itself, and a
        new connector mates with what you list.
      </p>

      <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-700" role="tablist">
        {(Object.keys(KIND_TITLES) as CustomTypeKind[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === kind}
            onClick={() => switchKind(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${k === kind ? "border-blue-600 text-blue-700 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
          >
            {KIND_TITLES[k].plural}
          </button>
        ))}
      </div>

      {fromSubmission && (
        <div className="mb-4 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-900 dark:text-blue-200">
          Creating a type for a submission.{" "}
          <a href={`/review/${fromSubmission}`} onClick={linkClick} className="font-medium underline">Back to the submission</a>
        </div>
      )}

      <CreateForm
        key={kind}
        kind={kind}
        records={records}
        initialId={prefillId}
        initialLabel={prefillId ? params.get("label") || formatDeviceTypeLabel(prefillId) : ""}
        initialCategory={prefillId ? params.get("category") || "" : ""}
        fromSubmission={fromSubmission}
        onCreated={() => void reload()}
      />

      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-10 mb-3">Community {title.plural.toLowerCase()}</h2>
      {loading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
      {loadError && <div className="text-sm text-red-600 dark:text-red-400">{loadError}</div>}
      {!loading && !loadError && ofKind.length === 0 && (
        <div className="text-sm text-slate-500 dark:text-slate-400">None yet.</div>
      )}
      {ofKind.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="community-types">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2 px-3 font-medium">Id</th>
                <th className="py-2 px-3 font-medium">Label</th>
                <th className="py-2 px-3 font-medium">{kind === "device" ? "Category" : "Details"}</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Added by</th>
                <th className="py-2 px-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {ofKind.map((r) => <CommunityRow key={r.id} record={r} records={records} onChanged={() => void reload()} />)}
            </tbody>
          </table>
        </div>
      )}

      <BuiltinList kind={kind} />
    </div>
  );
}

function CreateForm({ kind, records, initialId, initialLabel, initialCategory, fromSubmission, onCreated }: {
  kind: CustomTypeKind;
  records: CustomTypeRecord[];
  initialId: string;
  initialLabel: string;
  initialCategory: string;
  fromSubmission: string;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [id, setId] = useState(initialId || slugifyTypeId(initialLabel));
  // The id (and a signal or connector's cable name) follow the label until edited by hand.
  const [idTouched, setIdTouched] = useState(!!initialId);
  const [data, setData] = useState<TypeData>(() => ({ ...emptyTypeData(kind, initialCategory), ...(kind !== "device" && initialLabel ? { cable: initialLabel } : {}) }));
  const [cableTouched, setCableTouched] = useState(false);
  const [reason, setReason] = useState(fromSubmission ? `Submission ${fromSubmission}` : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CustomTypeRecord | null>(null);
  const one = KIND_TITLES[kind].one;

  const candidates = useMemo(() => typeCandidates(kind, records), [kind, records]);
  const suggestions = useMemo(
    () => (label.trim() || id.trim() ? suggestSimilarTypes([label, id], candidates) : []),
    [label, id, candidates],
  );
  const idError = id ? checkTypeIdAvailable(kind, id, records) : null;
  const dataCheck = validateCustomTypeData(kind, data, { selfId: id, existing: records });
  const canSave = !!label.trim() && !!id && !idError && dataCheck.ok && !!reason.trim() && !saving;

  const onLabel = (v: string) => {
    setLabel(v);
    if (!idTouched) setId(slugifyTypeId(v));
    if (kind !== "device" && !cableTouched) setData((d) => ({ ...d, cable: v }));
  };
  const onData = (next: TypeData) => {
    if (next.cable !== data.cable) setCableTouched(true);
    setData(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !dataCheck.ok) return;
    setSaving(true);
    setError("");
    try {
      const rec = await createCustomType({ kind, id, label: label.trim(), data: dataCheck.data, reasonOrUrl: reason.trim() });
      setCreated(rec);
      setLabel(""); setId(""); setIdTouched(false); setCableTouched(false); setReason("");
      setData(emptyTypeData(kind));
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create type");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900" data-testid="create-type">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">New {one}</h2>
      {created && (
        <div className="mb-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-sm text-green-900 dark:text-green-200">
          Created <code>{created.id}</code>. It is pickable on the submit form now.
          {fromSubmission && (
            <> <a href={`/review/${fromSubmission}`} onClick={linkClick} className="font-medium underline">Back to the submission to approve it</a></>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <label>
          <span className={LABEL}>Label *</span>
          <input
            value={label}
            maxLength={MAX_TYPE_LABEL}
            onChange={(e) => onLabel(e.target.value)}
            placeholder={kind === "device" ? "e.g. Wireless DMX Node" : kind === "signal" ? "e.g. Yamaha DCP" : "e.g. WECO 3-pin"}
            className={INPUT}
          />
        </label>
        <label>
          <span className={LABEL}>Id * <span className="font-normal text-slate-400">(permanent once created)</span></span>
          <input
            value={id}
            onChange={(e) => { setId(e.target.value.toLowerCase()); setIdTouched(true); }}
            placeholder={kind === "device" ? "wireless-dmx-node" : kind === "signal" ? "dcp" : "weco-3"}
            className={`${INPUT} font-mono`}
          />
          {idError && <span className="text-xs text-red-600 dark:text-red-400 mt-1 block">{idError}</span>}
        </label>
      </div>

      <TypeFields kind={kind} data={data} onChange={onData} records={records} selfId={id} />

      <label className="block mt-4">
        <span className={LABEL}>Reason or reference URL *</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it's needed, or a product link" className={INPUT} />
      </label>

      {suggestions.length > 0 && <DidYouMean suggestions={suggestions} />}

      {!dataCheck.ok && <div className="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="data-check">To create it: {dataCheck.error}</div>}
      {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
      <div className="mt-4">
        <button type="submit" disabled={!canSave} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "Creating…" : `Create ${one}`}
        </button>
      </div>
    </form>
  );
}

function DidYouMean({ suggestions }: { suggestions: ReturnType<typeof suggestSimilarTypes> }) {
  return (
    <div className="mt-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20" data-testid="did-you-mean">
      <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Did you mean an existing type?</div>
      <ul className="text-sm text-amber-900 dark:text-amber-100 space-y-0.5">
        {suggestions.map((s) => (
          <li key={`${s.source}:${s.id}`}>
            <code className="text-xs">{s.id}</code> {s.label}
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {" "}· {s.source}{s.category || s.group ? ` · ${s.category ?? s.group}` : ""}{s.retired ? " · retired" : ""}
              {s.matched !== s.id && s.matched !== s.label ? ` · matched “${s.matched}”` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">If one fits, edit the submission to use it instead of adding a near-duplicate.</div>
    </div>
  );
}

/** One-line summary of a community type's data, for its table row. */
function Details({ record }: { record: CustomTypeRecord }) {
  const d = record.data;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  if (record.kind === "device") return <>{s(d.category)}</>;
  if (record.kind === "signal") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 text-xs">
        <span className="w-3 h-3 rounded-full inline-block" style={{ background: s(d.color) }} title={s(d.color)} />
        {s(d.group)} · prefix <code>{s(d.cablePrefix)}</code> · {connectorLabel(s(d.defaultConnector))}
      </span>
    );
  }
  const mates = ids(d.matesWith), adapts = ids(d.adaptsTo);
  return (
    <span className="text-xs">
      {s(d.group)} · {s(d.gender) || "none"}
      {mates.length > 0 && <> · mates {mates.map(connectorLabel).join(", ")}</>}
      {adapts.length > 0 && <> · adapts to {adapts.map(connectorLabel).join(", ")}</>}
    </span>
  );
}

function CommunityRow({ record, records, onChanged }: { record: CustomTypeRecord; records: CustomTypeRecord[]; onChanged: () => void }) {
  const description = typeof record.data.description === "string" ? record.data.description : "";
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(record.label);
  const [data, setData] = useState<TypeData>(record.data);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retired = record.status === "retired";
  const check = validateCustomTypeData(record.kind, data, { selfId: record.id, existing: records, previous: record.data });

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(false);
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const btn = "text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50";

  return (
    <>
      <tr className={`border-b border-slate-100 dark:border-slate-800 align-top ${retired ? "opacity-60" : ""}`}>
        <td className="py-2 px-3 font-mono text-xs text-slate-700 dark:text-slate-300">{record.id}</td>
        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
          {record.label}
          {description && <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>}
        </td>
        <td className="py-2 px-3 text-slate-700 dark:text-slate-300"><Details record={record} /></td>
        <td className="py-2 px-3 text-xs">
          <span className={retired ? "text-slate-500" : "text-green-700 dark:text-green-400"}>{record.status}</span>
        </td>
        <td className="py-2 px-3 text-xs text-slate-500 dark:text-slate-400">
          {record.createdByName || "—"}
          {record.reasonOrUrl && <div className="max-w-[180px] truncate" title={record.reasonOrUrl}>{record.reasonOrUrl}</div>}
        </td>
        <td className="py-2 px-3 whitespace-nowrap space-x-1">
          {editing ? null : confirmDelete ? (
            <>
              <button className={`${btn} text-red-700 dark:text-red-400`} disabled={busy} onClick={() => run(() => deleteCustomType(record.kind, record.id))}>Confirm delete</button>
              <button className={btn} disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className={btn} disabled={busy} onClick={() => { setLabel(record.label); setData(record.data); setEditing(true); }}>Edit</button>
              <button className={btn} disabled={busy} onClick={() => run(() => updateCustomType(record.kind, record.id, { status: retired ? "active" : "retired" }))}>
                {retired ? "Unretire" : "Retire"}
              </button>
              <button className={btn} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
            </>
          )}
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <td colSpan={6} className="px-3 py-3 bg-slate-50 dark:bg-slate-800/40">
            <label className="block mb-4 max-w-md">
              <span className={LABEL}>Label</span>
              <input value={label} maxLength={MAX_TYPE_LABEL} onChange={(e) => setLabel(e.target.value)} className={INPUT} />
            </label>
            <TypeFields kind={record.kind} data={data} onChange={setData} records={records} selfId={record.id} />
            {!check.ok && <div className="mt-3 text-xs text-red-600 dark:text-red-400">{check.error}</div>}
            <div className="mt-3 space-x-1">
              <button className={btn} disabled={busy || !check.ok || !label.trim()} onClick={() => check.ok && run(() => updateCustomType(record.kind, record.id, { label, data: { description: "", ...check.data } }))}>Save</button>
              <button className={btn} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={6} className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{error}</td>
        </tr>
      )}
    </>
  );
}

function BuiltinList({ kind }: { kind: CustomTypeKind }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => {
    if (kind === "device") {
      return Object.entries(BUILTIN_DEVICE_TYPE_CATALOG.toCategory)
        .map(([id, category]) => ({ id, label: BUILTIN_DEVICE_TYPE_CATALOG.labels[id] ?? id, group: category, detail: "", color: "" }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    }
    if (kind === "signal") {
      return builtinSignals().map((id) => ({
        id,
        label: signalLabel(id),
        group: signalGroup(id),
        detail: `prefix ${cablePrefix(id)} · ${connectorLabel(defaultConnector(id))}`,
        color: signalColor(id),
      }));
    }
    return builtinConnectors().map((id) => {
      const acc = connectorAccepts(id);
      const detail = [
        acc.native?.length ? `mates ${acc.native.map(connectorLabel).join(", ")}` : "",
        acc.adapter?.length ? `adapts to ${acc.adapter.map(connectorLabel).join(", ")}` : "",
      ].filter(Boolean).join(" · ");
      return { id, label: connectorLabel(id), group: connectorGroup(id), detail, color: "" };
    });
  }, [kind]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => !needle || r.id.includes(needle) || r.label.toLowerCase().includes(needle) || r.group.toLowerCase().includes(needle));
  }, [all, q]);
  return (
    <details className="mt-10" data-testid="builtin-types">
      <summary className="cursor-pointer text-lg font-semibold text-slate-800 dark:text-slate-200">
        Built-in {KIND_TITLES[kind].plural.toLowerCase()} <span className="text-sm font-normal text-slate-500">({all.length}, read-only)</span>
      </summary>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className={`${INPUT} mt-3 mb-2 max-w-xs`} />
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 px-3 font-mono text-xs text-slate-600 dark:text-slate-400">{r.id}</td>
              <td className="py-1 px-3 text-slate-800 dark:text-slate-200">
                {r.color && <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5 align-middle" style={{ background: r.color }} />}
                {r.label}
              </td>
              <td className="py-1 px-3 text-slate-500 dark:text-slate-400">{r.group}</td>
              <td className="py-1 px-3 text-xs text-slate-500 dark:text-slate-400">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
