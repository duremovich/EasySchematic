import { useEffect, useMemo, useState } from "react";
import { fetchCustomTypes, createCustomType, updateCustomType, deleteCustomType } from "../api";
import { ALL_CATEGORIES, formatDeviceTypeLabel } from "../../../src/deviceTypeCategories";
import {
  BUILTIN_DEVICE_TYPE_CATALOG,
  checkTypeIdAvailable,
  deviceTypeCandidates,
  slugifyTypeId,
  suggestSimilarTypes,
  MAX_TYPE_LABEL,
} from "../../../src/customTypes";
import type { CustomTypeRecord } from "../../../src/customTypes";
import { linkClick } from "../navigate";

/**
 * Moderator page for community device types (custom-types P1). Built-ins are
 * listed read-only; community types can be created, edited, retired and —
 * while unused — deleted. Prefill via ?create=<slug>&category=<cat>&label=…&from=<submissionId>
 * (the review page's "Create this device type" shortcut).
 */

const INPUT = "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

export default function AdminTypesPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const fromSubmission = params.get("from") || "";
  const prefillId = params.get("create") ? slugifyTypeId(params.get("create")!) : "";

  const [records, setRecords] = useState<CustomTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = () =>
    fetchCustomTypes("device")
      .then((r) => { setRecords(r); setLoadError(""); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load types"))
      .finally(() => setLoading(false));

  useEffect(() => { void reload(); }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Device types</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Add a device type here when a submission needs one that doesn't exist yet, then approve the submission.
        No deploy needed. Signal and connector types still need a code change, so defer those.
      </p>

      {fromSubmission && (
        <div className="mb-4 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-900 dark:text-blue-200">
          Creating a type for a submission.{" "}
          <a href={`/review/${fromSubmission}`} onClick={linkClick} className="font-medium underline">Back to the submission</a>
        </div>
      )}

      <CreateForm
        records={records}
        initialId={prefillId}
        initialLabel={params.get("label") || (prefillId ? formatDeviceTypeLabel(prefillId) : "")}
        initialCategory={params.get("category") || ""}
        fromSubmission={fromSubmission}
        onCreated={() => void reload()}
      />

      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-10 mb-3">Community device types</h2>
      {loading && <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
      {loadError && <div className="text-sm text-red-600 dark:text-red-400">{loadError}</div>}
      {!loading && !loadError && records.length === 0 && (
        <div className="text-sm text-slate-500 dark:text-slate-400">None yet.</div>
      )}
      {records.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2 px-3 font-medium">Id</th>
                <th className="py-2 px-3 font-medium">Label</th>
                <th className="py-2 px-3 font-medium">Category</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Added by</th>
                <th className="py-2 px-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => <CommunityRow key={r.id} record={r} onChanged={() => void reload()} />)}
            </tbody>
          </table>
        </div>
      )}

      <BuiltinList />
    </div>
  );
}

function CreateForm({ records, initialId, initialLabel, initialCategory, fromSubmission, onCreated }: {
  records: CustomTypeRecord[];
  initialId: string;
  initialLabel: string;
  initialCategory: string;
  fromSubmission: string;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [id, setId] = useState(initialId || slugifyTypeId(initialLabel));
  // The id follows the label until the moderator edits it by hand (or it was prefilled).
  const [idTouched, setIdTouched] = useState(!!initialId);
  const [category, setCategory] = useState(ALL_CATEGORIES.includes(initialCategory) ? initialCategory : "");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState(fromSubmission ? `Submission ${fromSubmission}` : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CustomTypeRecord | null>(null);

  const candidates = useMemo(() => deviceTypeCandidates(records), [records]);
  const suggestions = useMemo(
    () => (label.trim() || id.trim() ? suggestSimilarTypes([label, id], candidates) : []),
    [label, id, candidates],
  );
  const idError = id ? checkTypeIdAvailable("device", id, records) : null;
  const canSave = !!label.trim() && !!id && !idError && !!category && !!reason.trim() && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const rec = await createCustomType({
        kind: "device",
        id,
        label: label.trim(),
        data: description.trim() ? { category, description: description.trim() } : { category },
        reasonOrUrl: reason.trim(),
      });
      setCreated(rec);
      setLabel(""); setId(""); setIdTouched(false); setDescription(""); setReason("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create type");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">New device type</h2>
      {created && (
        <div className="mb-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-sm text-green-900 dark:text-green-200">
          Created <code>{created.id}</code>. It is pickable on the submit form now.
          {fromSubmission && (
            <> <a href={`/review/${fromSubmission}`} onClick={linkClick} className="font-medium underline">Back to the submission to approve it</a></>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label>
          <span className={LABEL}>Label *</span>
          <input
            value={label}
            maxLength={MAX_TYPE_LABEL}
            onChange={(e) => { setLabel(e.target.value); if (!idTouched) setId(slugifyTypeId(e.target.value)); }}
            placeholder="e.g. Wireless DMX Node"
            className={INPUT}
          />
        </label>
        <label>
          <span className={LABEL}>Id * <span className="font-normal text-slate-400">(permanent once created)</span></span>
          <input
            value={id}
            onChange={(e) => { setId(e.target.value.toLowerCase()); setIdTouched(true); }}
            placeholder="wireless-dmx-node"
            className={`${INPUT} font-mono`}
          />
          {idError && <span className="text-xs text-red-600 dark:text-red-400 mt-1 block">{idError}</span>}
        </label>
        <label>
          <span className={LABEL}>Category *</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
            <option value="">Select category</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span className={LABEL}>Reason or reference URL *</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it's needed, or a product link" className={INPUT} />
        </label>
        <label className="sm:col-span-2">
          <span className={LABEL}>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional: what belongs under this type" className={INPUT} />
        </label>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20" data-testid="did-you-mean">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Did you mean an existing type?</div>
          <ul className="text-sm text-amber-900 dark:text-amber-100 space-y-0.5">
            {suggestions.map((s) => (
              <li key={`${s.source}:${s.id}`}>
                <code className="text-xs">{s.id}</code> {s.label}
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  {" "}· {s.source}{s.category ? ` · ${s.category}` : ""}{s.retired ? " · retired" : ""}
                  {s.matched !== s.id && s.matched !== s.label ? ` · matched “${s.matched}”` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">If one fits, edit the submission to use it instead of adding a near-duplicate.</div>
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
      <div className="mt-4">
        <button type="submit" disabled={!canSave} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "Creating…" : "Create device type"}
        </button>
      </div>
    </form>
  );
}

function CommunityRow({ record, onChanged }: { record: CustomTypeRecord; onChanged: () => void }) {
  const category = typeof record.data.category === "string" ? record.data.category : "";
  const description = typeof record.data.description === "string" ? record.data.description : "";
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(record.label);
  const [cat, setCat] = useState(category);
  const [desc, setDesc] = useState(description);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retired = record.status === "retired";

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
          {editing ? <input value={label} maxLength={MAX_TYPE_LABEL} onChange={(e) => setLabel(e.target.value)} className={INPUT} /> : record.label}
          {!editing && description && <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>}
          {editing && <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className={`${INPUT} mt-1`} />}
        </td>
        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
          {editing ? (
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={INPUT}>
              {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : category}
        </td>
        <td className="py-2 px-3 text-xs">
          <span className={retired ? "text-slate-500" : "text-green-700 dark:text-green-400"}>{record.status}</span>
        </td>
        <td className="py-2 px-3 text-xs text-slate-500 dark:text-slate-400">
          {record.createdByName || "—"}
          {record.reasonOrUrl && <div className="max-w-[180px] truncate" title={record.reasonOrUrl}>{record.reasonOrUrl}</div>}
        </td>
        <td className="py-2 px-3 whitespace-nowrap space-x-1">
          {editing ? (
            <>
              <button className={btn} disabled={busy} onClick={() => run(() => updateCustomType("device", record.id, { label, data: { category: cat, description: desc } }))}>Save</button>
              <button className={btn} disabled={busy} onClick={() => { setEditing(false); setLabel(record.label); setCat(category); setDesc(description); }}>Cancel</button>
            </>
          ) : confirmDelete ? (
            <>
              <button className={`${btn} text-red-700 dark:text-red-400`} disabled={busy} onClick={() => run(() => deleteCustomType("device", record.id))}>Confirm delete</button>
              <button className={btn} disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className={btn} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
              <button className={btn} disabled={busy} onClick={() => run(() => updateCustomType("device", record.id, { status: retired ? "active" : "retired" }))}>
                {retired ? "Unretire" : "Retire"}
              </button>
              <button className={btn} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
            </>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{error}</td>
        </tr>
      )}
    </>
  );
}

function BuiltinList() {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.entries(BUILTIN_DEVICE_TYPE_CATALOG.toCategory)
      .map(([id, category]) => ({ id, category, label: BUILTIN_DEVICE_TYPE_CATALOG.labels[id] ?? id }))
      .filter((r) => !needle || r.id.includes(needle) || r.label.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle))
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }, [q]);
  return (
    <details className="mt-10">
      <summary className="cursor-pointer text-lg font-semibold text-slate-800 dark:text-slate-200">
        Built-in device types <span className="text-sm font-normal text-slate-500">({Object.keys(BUILTIN_DEVICE_TYPE_CATALOG.toCategory).length}, read-only)</span>
      </summary>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className={`${INPUT} mt-3 mb-2 max-w-xs`} />
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 px-3 font-mono text-xs text-slate-600 dark:text-slate-400">{r.id}</td>
              <td className="py-1 px-3 text-slate-800 dark:text-slate-200">{r.label}</td>
              <td className="py-1 px-3 text-slate-500 dark:text-slate-400">{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
