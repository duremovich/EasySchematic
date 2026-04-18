import { Fragment, useState, useEffect } from "react";
import { fetchModActivity, fetchModerators } from "../api";
import type { ModAction, ModeratorSummary, User } from "../api";
import { linkClick } from "../navigate";

const ACTION_COLORS: Record<string, string> = {
  approve: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reject: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  defer: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  edit: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  send_back: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "flag-delete": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "unflag-delete": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "confirm-delete": "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  note_added: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  note_edited: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  note_deleted: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const ACTION_HEADERS: Record<string, string> = {
  approve: "Approved submission",
  reject: "Rejected submission",
  defer: "Deferred submission",
  edit: "Direct moderator edit",
  send_back: "Sent back to review",
  "flag-delete": "Flagged for deletion",
  "unflag-delete": "Restored from deletion queue",
  "confirm-delete": "Permanently deleted",
  note_added: "Note added",
  note_edited: "Note edited",
  note_deleted: "Note deleted",
};

const COLUMN_COUNT = 6;

function RelativeTime({ iso }: { iso: string }) {
  // Capture "now" at mount so the component stays pure across re-renders.
  // Relative labels won't drift live — fine for an audit feed that's manually refreshed.
  const [now] = useState(() => Date.now());
  const ms = now - new Date(iso + "Z").getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return <span>just now</span>;
  if (mins < 60) return <span>{mins}m ago</span>;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return <span>{hours}h ago</span>;
  const days = Math.floor(hours / 24);
  return <span>{days}d ago</span>;
}

export default function AdminActivityPage({ currentUser }: { currentUser?: User | null } = {}) {
  const isAdmin = currentUser?.role === "admin";
  const [actions, setActions] = useState<ModAction[]>([]);
  const [moderators, setModerators] = useState<ModeratorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMod, setSelectedMod] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchModerators()
      .then(setModerators)
      .catch(() => {});
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-filter-change pattern; loading/error state is local to this fetch */
  useEffect(() => {
    setLoading(true);
    setError("");
    fetchModActivity({
      moderatorId: selectedMod || undefined,
      action: selectedAction || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((data) => { setActions(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [selectedMod, selectedAction, page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resetFilters = () => {
    setSelectedMod("");
    setSelectedAction("");
    setPage(0);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Moderator Activity</h1>
        {isAdmin && (
          <a href="/admin/users" onClick={linkClick} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Manage Users
          </a>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={selectedMod}
          onChange={(e) => { setSelectedMod(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All moderators</option>
          {moderators.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || "Moderator"} ({m.role})
            </option>
          ))}
        </select>

        <select
          value={selectedAction}
          onChange={(e) => { setSelectedAction(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          <option value="approve">Approvals</option>
          <option value="reject">Rejections</option>
          <option value="defer">Deferrals</option>
          <option value="edit">Direct edits</option>
          <option value="send_back">Sent back to review</option>
          <option value="flag-delete">Flagged for deletion</option>
          <option value="unflag-delete">Restored from deletion</option>
          <option value="confirm-delete">Hard-deleted</option>
        </select>

        {(selectedMod || selectedAction) && (
          <button
            onClick={resetFilters}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="p-4 text-center text-red-600 dark:text-red-400">{error}</div>}
      {loading && <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading...</div>}

      {!loading && !error && actions.length === 0 && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No moderator activity {selectedMod || selectedAction ? "matching these filters" : "yet"}.
        </div>
      )}

      {!loading && !error && actions.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">When</th>
                  <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Moderator</th>
                  <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Action</th>
                  <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Device</th>
                  <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Note</th>
                  <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400"></th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => {
                  const deviceLabel = getDeviceLabel(a);
                  const hasDetails = a.before_data || a.after_data || a.submission_data_override || a.submission_data;
                  const isExpanded = expandedId === a.id;

                  return (
                    <Fragment key={a.id}>
                      <tr className={`border-b border-slate-100 dark:border-slate-800 align-top ${isExpanded ? "bg-slate-50 dark:bg-slate-800/50" : ""}`}>
                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          <RelativeTime iso={a.created_at} />
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {new Date(a.created_at + "Z").toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-200">
                          {a.moderator_name || "Moderator"}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[a.action] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                            {a.action}
                          </span>
                          {a.submission_action && (
                            <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                              ({a.submission_action})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-200 max-w-[200px] truncate">
                          {deviceLabel}
                        </td>
                        <td className="py-2 px-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                          {a.note || "—"}
                        </td>
                        <td className="py-2 px-3">
                          {hasDetails && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : a.id)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                            >
                              {isExpanded ? "Hide" : "Details"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <td colSpan={COLUMN_COUNT} className="p-0">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                              <DetailPanel action={a} onClose={() => setExpandedId(null)} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Page {page + 1}{actions.length < PAGE_SIZE ? " (last)" : ""}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={actions.length < PAGE_SIZE}
              className="text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Detail panel ====================

function DetailPanel({ action, onClose }: { action: ModAction; onClose: () => void }) {
  const header = ACTION_HEADERS[action.action] ?? action.action;
  const before = tryParse(action.before_data);
  const after = tryParse(action.after_data);
  const override = tryParse(action.submission_data_override);
  const submission = tryParse(action.submission_data);

  const body = (() => {
    // Explicit update diff: both sides present
    if (before && after) {
      return <DiffSummary before={before} after={after} />;
    }

    // Reject / defer on a create submission → show what the user proposed
    if ((action.action === "reject" || action.action === "defer") && submission) {
      return (
        <>
          {action.note && <NoteBlock label="Reviewer note" note={action.note} />}
          <LabeledBlock label="Submitted proposal">
            <TemplateSummaryCard data={submission} />
          </LabeledBlock>
        </>
      );
    }

    // Approve create → show the newly-created template
    if (action.action === "approve" && after) {
      return <TemplateSummaryCard data={after} />;
    }

    // Flag / confirm-delete / send-back → show the snapshotted template
    if (before) {
      return (
        <>
          {action.note && <NoteBlock label={noteLabel(action.action)} note={action.note} />}
          <TemplateSummaryCard data={before} />
        </>
      );
    }

    if (action.note) {
      return <NoteBlock label="Note" note={action.note} />;
    }

    return <div className="text-xs text-slate-400 dark:text-slate-500">No additional details captured for this action.</div>;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {header} · {action.moderator_name || "Moderator"}
        </h3>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Close
        </button>
      </div>

      {override && action.action === "approve" && (
        <LabeledBlock label="Moderator edits applied before approve">
          <pre className="text-xs bg-white dark:bg-slate-900 p-2 rounded overflow-x-auto max-h-32 text-slate-700 dark:text-slate-300">
            {JSON.stringify(override, null, 2)}
          </pre>
        </LabeledBlock>
      )}

      {body}
    </div>
  );
}

function NoteBlock({ label, note }: { label: string; note: string }) {
  return (
    <div className="mb-3 p-3 rounded border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
      <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">{label}</div>
      <div className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{note}</div>
    </div>
  );
}

function LabeledBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</h4>
      {children}
    </div>
  );
}

function noteLabel(action: string): string {
  switch (action) {
    case "flag-delete": return "Flag reason";
    case "confirm-delete": return "Flag reason (carried from original flag)";
    case "send_back": return "Sent-back reason";
    case "reject": return "Rejection note";
    case "defer": return "Defer reason";
    default: return "Note";
  }
}

// ==================== Template summary card ====================

type TemplateLike = Record<string, unknown>;

function TemplateSummaryCard({ data }: { data: TemplateLike }) {
  const [showPorts, setShowPorts] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const label = (data.label as string) || "(unnamed device)";
  const manufacturer = data.manufacturer as string | undefined;
  const modelNumber = data.modelNumber as string | undefined;
  const deviceType = data.deviceType as string | undefined;
  const ports = Array.isArray(data.ports) ? (data.ports as PortLike[]) : [];
  const slots = Array.isArray(data.slots) ? (data.slots as unknown[]) : [];
  const powerDrawW = data.powerDrawW as number | undefined;
  const powerCapacityW = data.powerCapacityW as number | undefined;
  const voltage = data.voltage as string | undefined;
  const poeBudgetW = data.poeBudgetW as number | undefined;
  const poeDrawW = data.poeDrawW as number | undefined;
  const heightMm = data.heightMm as number | undefined;
  const widthMm = data.widthMm as number | undefined;
  const depthMm = data.depthMm as number | undefined;
  const weightKg = data.weightKg as number | undefined;
  const searchTerms = Array.isArray(data.searchTerms) ? (data.searchTerms as string[]) : undefined;
  const referenceUrl = data.referenceUrl as string | undefined;
  const isVenueProvided = !!data.isVenueProvided;
  const flaggedForDeletion = !!data.flaggedForDeletion;

  const chips: string[] = [];
  if (deviceType) chips.push(deviceType.replace(/-/g, " "));
  chips.push(`${ports.length} port${ports.length === 1 ? "" : "s"}`);
  if (slots.length) chips.push(`${slots.length} slot${slots.length === 1 ? "" : "s"}`);
  if (powerDrawW != null) chips.push(`${powerDrawW}W draw`);
  if (powerCapacityW != null) chips.push(`${powerCapacityW}W capacity`);
  if (voltage) chips.push(voltage);
  if (poeBudgetW != null) chips.push(`PoE ${poeBudgetW}W src`);
  if (poeDrawW != null) chips.push(`PoE ${poeDrawW}W draw`);
  const dims = formatDimensions(widthMm, depthMm, heightMm);
  if (dims) chips.push(dims);
  if (weightKg != null) chips.push(`${weightKg} kg`);

  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2">
        {manufacturer && <span>{manufacturer}</span>}
        {modelNumber && <span>· {modelNumber}</span>}
        {referenceUrl && (
          <a href={referenceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            Spec sheet ↗
          </a>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {chips.map((c, i) => (
          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
            {c}
          </span>
        ))}
        {isVenueProvided && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[11px]">Venue provided</span>
        )}
        {flaggedForDeletion && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[11px]">Flagged for deletion</span>
        )}
      </div>

      {searchTerms && searchTerms.length > 0 && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="mr-1">Search terms:</span>
          {searchTerms.map((t, i) => (
            <span key={i} className="inline-block mr-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px]">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-3">
        {ports.length > 0 && (
          <button
            onClick={() => setShowPorts(!showPorts)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showPorts ? "▾ Hide ports" : `▸ Show ports (${ports.length})`}
          </button>
        )}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
        >
          {showRaw ? "▾ Hide raw JSON" : "▸ Raw JSON"}
        </button>
      </div>

      {showPorts && <PortList ports={ports} />}

      {showRaw && (
        <pre className="mt-2 text-[11px] bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-x-auto max-h-64 text-slate-700 dark:text-slate-300">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

type PortLike = {
  id?: string;
  label?: string;
  direction?: string;
  signalType?: string;
  connectorType?: string;
  section?: string;
};

function PortList({ ports }: { ports: PortLike[] }) {
  const grouped = {
    input: ports.filter((p) => p.direction === "input"),
    output: ports.filter((p) => p.direction === "output"),
    bidirectional: ports.filter((p) => p.direction === "bidirectional"),
  };
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
      <PortGroup title="Inputs" ports={grouped.input} />
      <PortGroup title="Outputs" ports={grouped.output} />
      <PortGroup title="Bidirectional" ports={grouped.bidirectional} />
    </div>
  );
}

function PortGroup({ title, ports }: { title: string; ports: PortLike[] }) {
  if (!ports.length) return null;
  return (
    <div>
      <div className="font-medium text-slate-500 dark:text-slate-400 mb-1">{title} ({ports.length})</div>
      <ul className="space-y-0.5">
        {ports.map((p, i) => (
          <li key={p.id || i} className="text-slate-700 dark:text-slate-300 truncate">
            {p.label || "(unlabeled)"}
            {p.signalType && <span className="text-slate-400 dark:text-slate-500"> · {p.signalType}</span>}
            {p.connectorType && <span className="text-slate-400 dark:text-slate-500"> · {p.connectorType}</span>}
            {p.section && <span className="text-slate-400 dark:text-slate-500"> · §{p.section}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ==================== Diff summary ====================

// Fields to hide from the diff entirely (bookkeeping, non-semantic).
const DIFF_IGNORE_KEYS = new Set(["id", "version", "updated_at", "created_at"]);

// Human labels for known fields (falls back to the raw key).
const FIELD_LABELS: Record<string, string> = {
  label: "Label",
  deviceType: "Device type",
  manufacturer: "Manufacturer",
  modelNumber: "Model number",
  referenceUrl: "Reference URL",
  color: "Color",
  category: "Category",
  powerDrawW: "Power draw (W)",
  powerCapacityW: "Power capacity (W)",
  voltage: "Voltage",
  poeBudgetW: "PoE source budget (W)",
  poeDrawW: "PoE draw (W)",
  heightMm: "Height (mm)",
  widthMm: "Width (mm)",
  depthMm: "Depth (mm)",
  weightKg: "Weight (kg)",
  slotFamily: "Slot family",
  hostname: "Hostname",
  isVenueProvided: "Venue provided",
  searchTerms: "Search terms",
  ports: "Ports",
  slots: "Slots",
};

function DiffSummary({ before, after }: { before: TemplateLike; after: TemplateLike }) {
  const [showDetails, setShowDetails] = useState(false);
  const { summary, changes } = summarizeDiff(before, after);

  if (changes.length === 0) {
    return <div className="text-xs text-slate-400 dark:text-slate-500">No field changes captured.</div>;
  }

  return (
    <div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{summary}</div>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        {showDetails ? "▾ Hide all changed fields" : `▸ Show all changed fields (${changes.length})`}
      </button>
      {showDetails && (
        <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-700 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {changes.map((c) => (
            <div key={c.key} className="p-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{FIELD_LABELS[c.key] ?? c.key}</div>
              {renderFieldChange(c)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type FieldChange = {
  key: string;
  before: unknown;
  after: unknown;
  portAdds?: PortLike[];
  portRemoves?: PortLike[];
  portChanges?: { beforePort: PortLike; afterPort: PortLike }[];
};

function summarizeDiff(before: TemplateLike, after: TemplateLike): { summary: string; changes: FieldChange[] } {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)].filter((k) => !DIFF_IGNORE_KEYS.has(k)));
  const changes: FieldChange[] = [];

  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;

    if (key === "ports" && Array.isArray(b) && Array.isArray(a)) {
      const diff = diffPorts(b as PortLike[], a as PortLike[]);
      changes.push({ key, before: b, after: a, ...diff });
    } else {
      changes.push({ key, before: b, after: a });
    }
  }

  const phrases: string[] = [];
  for (const c of changes) {
    if (c.key === "ports" && (c.portAdds || c.portRemoves || c.portChanges)) {
      const parts: string[] = [];
      if (c.portAdds?.length) parts.push(`${c.portAdds.length} added`);
      if (c.portRemoves?.length) parts.push(`${c.portRemoves.length} removed`);
      if (c.portChanges?.length) parts.push(`${c.portChanges.length} changed`);
      if (parts.length) phrases.push(`ports (${parts.join(", ")})`);
    } else if (c.before === undefined || c.before === null || c.before === "") {
      phrases.push(`${(FIELD_LABELS[c.key] ?? c.key).toLowerCase()} set`);
    } else if (c.after === undefined || c.after === null || c.after === "") {
      phrases.push(`${(FIELD_LABELS[c.key] ?? c.key).toLowerCase()} cleared`);
    } else if (typeof c.before === "number" && typeof c.after === "number") {
      phrases.push(`${(FIELD_LABELS[c.key] ?? c.key).toLowerCase()} ${c.before}→${c.after}`);
    } else {
      phrases.push(`${(FIELD_LABELS[c.key] ?? c.key).toLowerCase()} changed`);
    }
  }

  const summary = phrases.length === 0
    ? "No field changes captured."
    : capitalize(phrases.join(", "));

  return { summary, changes };
}

function diffPorts(before: PortLike[], after: PortLike[]): { portAdds: PortLike[]; portRemoves: PortLike[]; portChanges: { beforePort: PortLike; afterPort: PortLike }[] } {
  const beforeById = new Map(before.filter((p) => p.id).map((p) => [p.id as string, p]));
  const afterById = new Map(after.filter((p) => p.id).map((p) => [p.id as string, p]));

  const portAdds: PortLike[] = [];
  const portRemoves: PortLike[] = [];
  const portChanges: { beforePort: PortLike; afterPort: PortLike }[] = [];

  for (const [id, p] of afterById) {
    const b = beforeById.get(id);
    if (!b) portAdds.push(p);
    else if (JSON.stringify(b) !== JSON.stringify(p)) portChanges.push({ beforePort: b, afterPort: p });
  }
  for (const [id, p] of beforeById) {
    if (!afterById.has(id)) portRemoves.push(p);
  }

  return { portAdds, portRemoves, portChanges };
}

function renderFieldChange(c: FieldChange) {
  if (c.key === "ports" && (c.portAdds || c.portRemoves || c.portChanges)) {
    return (
      <div className="mt-1 space-y-1 text-xs">
        {c.portAdds?.map((p, i) => (
          <div key={`a-${i}`} className="text-green-700 dark:text-green-400">+ {portSummary(p)}</div>
        ))}
        {c.portRemoves?.map((p, i) => (
          <div key={`r-${i}`} className="text-red-700 dark:text-red-400">− {portSummary(p)}</div>
        ))}
        {c.portChanges?.map((pc, i) => (
          <div key={`c-${i}`} className="text-slate-600 dark:text-slate-300">
            ~ {portSummary(pc.afterPort)}
            <span className="ml-1 text-slate-400 dark:text-slate-500">(was: {portSummary(pc.beforePort)})</span>
          </div>
        ))}
      </div>
    );
  }

  if (c.key === "searchTerms" && Array.isArray(c.before) && Array.isArray(c.after)) {
    return (
      <div className="mt-1 text-xs text-slate-700 dark:text-slate-300">
        <span className="text-red-700 dark:text-red-400">{(c.before as string[]).join(", ") || "(none)"}</span>
        <span className="mx-2 text-slate-400">→</span>
        <span className="text-green-700 dark:text-green-400">{(c.after as string[]).join(", ") || "(none)"}</span>
      </div>
    );
  }

  return (
    <div className="mt-1 text-xs text-slate-700 dark:text-slate-300 flex items-baseline gap-2 flex-wrap">
      <span className="text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1 rounded">{formatValue(c.before)}</span>
      <span className="text-slate-400">→</span>
      <span className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1 rounded">{formatValue(c.after)}</span>
    </div>
  );
}

function portSummary(p: PortLike): string {
  const parts = [p.label || "(unlabeled)"];
  if (p.direction) parts.push(p.direction);
  if (p.signalType) parts.push(p.signalType);
  if (p.connectorType) parts.push(p.connectorType);
  return parts.join(" · ");
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (v === "") return "(empty)";
  if (typeof v === "string") return `"${v.length > 60 ? v.slice(0, 57) + "..." : v}"`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function formatDimensions(w?: number, d?: number, h?: number): string | null {
  const parts: string[] = [];
  if (w != null) parts.push(`${w}W`);
  if (d != null) parts.push(`${d}D`);
  if (h != null) parts.push(`${h}H`);
  return parts.length ? parts.join("×") + "mm" : null;
}

function tryParse(s: string | null): TemplateLike | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function getDeviceLabel(a: ModAction): string {
  const sources = [a.after_data, a.before_data, a.submission_data];
  for (const src of sources) {
    const parsed = tryParse(src);
    const label = parsed && typeof parsed.label === "string" ? parsed.label : null;
    if (label) return label;
  }
  return a.template_id ? `Template ${a.template_id.slice(0, 8)}...` : "—";
}
