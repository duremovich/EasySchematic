import { useState, useEffect } from "react";
import type { DeviceTemplate, SlotDefinition } from "../../../src/types";
import { CONNECTOR_LABELS } from "../../../src/types";
import {
  fetchTemplate,
  fetchTemplates,
  fetchTemplateAdmin,
  addTemplateNote,
  editTemplateNote,
  deleteTemplateNote,
  sendBackTemplate,
  flagForDeletion,
  unflagDeletion,
  deleteTemplate,
  getAdminToken,
} from "../api";
import type { User, TemplateAdminView, TemplateNote } from "../api";
import SignalBadge from "../components/SignalBadge";
import { linkClick, navigateTo } from "../navigate";

type TemplateWithAttribution = DeviceTemplate & {
  submittedBy?: { name: string };
  lastEditedBy?: { name: string };
  needsReview?: boolean;
};

export default function DeviceDetailPage({ id, currentUser }: { id: string; currentUser?: User | null }) {
  const [template, setTemplate] = useState<TemplateWithAttribution | null>(null);
  const [allTemplates, setAllTemplates] = useState<DeviceTemplate[]>([]);
  const [adminView, setAdminView] = useState<TemplateAdminView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isMod = currentUser?.role === "moderator" || currentUser?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    fetchTemplate(id)
      .then((data) => { if (!cancelled) setTemplate(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetchTemplates().then((t) => { if (!cancelled) setAllTemplates(t); }).catch(() => {});
    if (isMod) {
      fetchTemplateAdmin(id)
        .then((view) => { if (!cancelled) setAdminView(view); })
        .catch(() => {}); // non-fatal — public view still renders
    }
    return () => { cancelled = true; };
  }, [id, isMod]);

  if (loading) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!template) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Not found</div>;

  const inputs = template.ports.filter((p) => p.direction === "input");
  const outputs = template.ports.filter((p) => p.direction === "output");
  const bidi = template.ports.filter((p) => p.direction === "bidirectional");
  const hasAdmin = !!getAdminToken() || isMod;
  const needsReview = template.needsReview || adminView?.needsReview;

  const renderPortTable = (ports: typeof template.ports, title: string) => {
    if (ports.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">{title}</h3>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-slate-500 dark:text-slate-400">Label</th>
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-slate-500 dark:text-slate-400">Signal</th>
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-slate-500 dark:text-slate-400">Connector</th>
              <th className="text-left py-2 px-2 sm:px-3 font-medium text-slate-500 dark:text-slate-400">Section</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((port) => (
              <tr key={port.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 px-2 sm:px-3">{port.label}</td>
                <td className="py-2 px-2 sm:px-3"><SignalBadge signalType={port.signalType} /></td>
                <td className="py-2 px-2 sm:px-3 text-slate-600 dark:text-slate-400">{port.connectorType ? CONNECTOR_LABELS[port.connectorType] ?? port.connectorType : "\u2014"}</td>
                <td className="py-2 px-2 sm:px-3 text-slate-600 dark:text-slate-400">{port.section ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="mb-4">
        <a href="/" onClick={linkClick} className="text-sm text-blue-600 hover:text-blue-800">&larr; All Devices</a>
      </div>
      {needsReview && (
        <div className="mb-4 border border-amber-300 dark:border-amber-700 rounded-lg p-3 bg-amber-50 dark:bg-amber-900/30 text-sm text-amber-800 dark:text-amber-200">
          <strong>Under review:</strong> A moderator flagged this device for re-review — specs may be inaccurate.
          {adminView?.needsReviewReason && (
            <span className="ml-1 text-amber-700 dark:text-amber-300">Reason: {adminView.needsReviewReason}</span>
          )}
        </div>
      )}
      {adminView?.flaggedForDeletion && (
        <DeletionFlagBanner
          view={adminView}
          templateId={id}
          isAdmin={currentUser?.role === "admin"}
          onChange={setAdminView}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{template.label}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
            {template.manufacturer && <span>{template.manufacturer}</span>}
            {template.modelNumber && <span>Model: {template.modelNumber}</span>}
            <span className="capitalize">{template.deviceType.replace(/-/g, " ")}</span>
            {template.hostname && <span>Hostname: {template.hostname}</span>}
            {template.isVenueProvided && <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">Venue Provided</span>}
          </div>
          {template.referenceUrl && (
            <a href={template.referenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800">
              Manufacturer Page <span aria-hidden="true">{"\u2197"}</span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {template.color && (
            <span className="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-600" style={{ backgroundColor: template.color }} />
          )}
          <a
            href={`/submit?clone=${template.id}`}
            onClick={linkClick}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Clone as New
          </a>
          <a
            href={`/submit/${template.id}`}
            onClick={linkClick}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Suggest Edit
          </a>
          {hasAdmin && (
            <a
              href={`/admin/edit/${template.id}`}
              onClick={linkClick}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
            >
              Edit
            </a>
          )}
        </div>
      </div>

      {(template.powerDrawW != null || template.powerCapacityW != null || template.voltage || template.poeBudgetW != null || template.poeDrawW != null) && (
        <div className="mb-6 flex flex-wrap gap-4">
          {template.powerDrawW != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Power Draw</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.powerDrawW}W</div>
            </div>
          )}
          {template.powerCapacityW != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Capacity</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.powerCapacityW}W</div>
            </div>
          )}
          {template.voltage && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Voltage</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.voltage}</div>
            </div>
          )}
          {template.poeBudgetW != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">PoE Budget</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.poeBudgetW}W</div>
            </div>
          )}
          {template.poeDrawW != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">PoE Draw</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.poeDrawW}W</div>
            </div>
          )}
        </div>
      )}

      {(template.heightMm != null || template.widthMm != null || template.depthMm != null || template.weightKg != null) && (
        <div className="mb-6 flex flex-wrap gap-4">
          {template.heightMm != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Height</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.heightMm} mm</div>
            </div>
          )}
          {template.widthMm != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Width</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.widthMm} mm</div>
            </div>
          )}
          {template.depthMm != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Depth</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.depthMm} mm</div>
            </div>
          )}
          {template.weightKg != null && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Weight</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.weightKg} kg</div>
            </div>
          )}
        </div>
      )}

      {template.searchTerms && template.searchTerms.length > 0 && (
        <div className="mb-6">
          <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">Search Terms</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {template.searchTerms.map((term, i) => (
              <span key={i} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">{term}</span>
            ))}
          </div>
        </div>
      )}

      {renderPortTable(inputs, "Inputs")}
      {renderPortTable(outputs, "Outputs")}
      {renderPortTable(bidi, "Bidirectional")}

      {template.slots && template.slots.length > 0 && (
        <SlotsSection slots={template.slots} allTemplates={allTemplates} />
      )}

      {(template.submittedBy || template.lastEditedBy) && (
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500">
          {template.submittedBy && (
            <>Submitted by <span className="text-slate-500 dark:text-slate-400">{template.submittedBy.name}</span></>
          )}
          {template.submittedBy && template.lastEditedBy && " · "}
          {template.lastEditedBy && (
            <>Last edited by <span className="text-slate-500 dark:text-slate-400">{template.lastEditedBy.name}</span></>
          )}
        </div>
      )}

      {isMod && adminView && (
        <ModeratorPanel
          view={adminView}
          onChange={setAdminView}
          templateId={id}
        />
      )}
    </div>
  );
}

function ModeratorPanel({
  view,
  onChange,
  templateId,
}: {
  view: TemplateAdminView;
  onChange: (v: TemplateAdminView) => void;
  templateId: string;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [sendBackReason, setSendBackReason] = useState("");
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [showFlag, setShowFlag] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [actionError, setActionError] = useState("");

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body) return;
    setAdding(true);
    setActionError("");
    try {
      const note = await addTemplateNote(templateId, body);
      onChange({ ...view, modNotes: [note, ...view.modNotes] });
      setDraft("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setAdding(false);
    }
  };

  const handleStartEdit = (note: TemplateNote) => {
    setEditingNoteId(note.id);
    setEditingDraft(note.body);
  };

  const handleSaveEdit = async (noteId: string) => {
    const body = editingDraft.trim();
    if (!body) return;
    setActionError("");
    try {
      await editTemplateNote(templateId, noteId, body);
      onChange({
        ...view,
        modNotes: view.modNotes.map((n) => (n.id === noteId ? { ...n, body, updatedAt: new Date().toISOString() } : n)),
      });
      setEditingNoteId(null);
      setEditingDraft("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save note");
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    setActionError("");
    try {
      await deleteTemplateNote(templateId, noteId);
      onChange({ ...view, modNotes: view.modNotes.filter((n) => n.id !== noteId) });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete note");
    }
  };

  const handleSendBack = async () => {
    const reason = sendBackReason.trim();
    if (!reason) return;
    setSendingBack(true);
    setActionError("");
    try {
      await sendBackTemplate(templateId, reason);
      onChange({ ...view, needsReview: true, needsReviewReason: reason });
      setSendBackReason("");
      setShowSendBack(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to send back");
    } finally {
      setSendingBack(false);
    }
  };

  const handleFlag = async () => {
    const reason = flagReason.trim();
    if (!reason) return;
    setFlagging(true);
    setActionError("");
    try {
      await flagForDeletion(templateId, reason);
      onChange({
        ...view,
        flaggedForDeletion: true,
        flaggedForDeletionReason: reason,
        flaggedForDeletionAt: new Date().toISOString(),
        // flaggedBy enrichment comes from the next /admin fetch; UI will render a placeholder until then
      });
      setFlagReason("");
      setShowFlag(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to flag for deletion");
    } finally {
      setFlagging(false);
    }
  };

  return (
    <div className="mt-8 pt-4 border-t-2 border-yellow-300 dark:border-yellow-700">
      <h2 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider mb-3">Moderator Panel</h2>

      {actionError && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
          {actionError}
        </div>
      )}

      {/* Approval metadata */}
      <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Approval</div>
        {view.approvedAt ? (
          <div className="text-slate-700 dark:text-slate-300">
            Approved {formatDate(view.approvedAt)}
            {view.approvedBy ? <> by <span className="font-medium">{view.approvedBy.name}</span></> : null}
            {view.approvedSchemaVersion ? (
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">(schema v{view.approvedSchemaVersion})</span>
            ) : null}
          </div>
        ) : (
          <div className="text-slate-500 dark:text-slate-400">No approval record.</div>
        )}
        {view.needsReview && (
          <div className="mt-1 text-amber-700 dark:text-amber-300">
            Flagged for re-review{view.needsReviewReason ? `: ${view.needsReviewReason}` : ""}
          </div>
        )}
      </div>

      {/* Internal notes */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Internal Notes ({view.modNotes.length})</div>
        </div>
        <div className="space-y-2 mb-3">
          {view.modNotes.map((note) => (
            <div key={note.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
              {editingNoteId === note.id ? (
                <div>
                  <textarea
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleSaveEdit(note.id)}
                      className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingNoteId(null); setEditingDraft(""); }}
                      className="px-3 py-1 rounded text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.body}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      {note.authorName} · {formatDate(note.createdAt)}
                      {note.updatedAt !== note.createdAt ? " (edited)" : ""}
                    </span>
                    <span className="flex gap-2">
                      <button onClick={() => handleStartEdit(note)} className="hover:text-slate-600 dark:hover:text-slate-300">Edit</button>
                      <button onClick={() => handleDelete(note.id)} className="hover:text-red-600">Delete</button>
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
          {view.modNotes.length === 0 && (
            <div className="text-sm text-slate-400 dark:text-slate-500 italic">No notes yet.</div>
          )}
        </div>
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an internal note — visible only to moderators."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleAdd}
              disabled={adding || !draft.trim()}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding..." : "Add note"}
            </button>
          </div>
        </div>
      </div>

      {/* Recent mod history */}
      {view.modHistory.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Recent Moderator Activity</div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            {view.modHistory.slice(0, 10).map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-slate-400 dark:text-slate-500">{formatDate(h.createdAt)}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{h.moderatorName}</span>
                <span className="text-slate-500 dark:text-slate-400">{h.action}</span>
                {h.note && <span className="text-slate-500 dark:text-slate-400 italic truncate">— {h.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Send back to review + Flag for deletion */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
        {showSendBack ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Why is this device being sent back to review?
            </label>
            <textarea
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="e.g. User reported that the power draw is wrong; manufacturer page now shows 45W not 30W."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSendBack}
                disabled={sendingBack || !sendBackReason.trim()}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {sendingBack ? "Sending..." : "Confirm — Send to Review"}
              </button>
              <button
                onClick={() => { setShowSendBack(false); setSendBackReason(""); }}
                className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : showFlag ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Why should this device be deleted?
            </label>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g. Duplicate of BMD UltraStudio HD Mini (id abc123), no salvageable fields to merge."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Flagging hides the device from the public library immediately. An admin will then permanently delete it or restore it.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleFlag}
                disabled={flagging || !flagReason.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {flagging ? "Flagging..." : "Confirm — Flag for Deletion"}
              </button>
              <button
                onClick={() => { setShowFlag(false); setFlagReason(""); }}
                className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSendBack(true)}
              disabled={view.needsReview}
              className="px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {view.needsReview ? "Already under review" : "Send back to review"}
            </button>
            <button
              onClick={() => setShowFlag(true)}
              disabled={view.flaggedForDeletion}
              className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {view.flaggedForDeletion ? "Already flagged for deletion" : "Flag for deletion"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function DeletionFlagBanner({
  view,
  templateId,
  isAdmin,
  onChange,
}: {
  view: TemplateAdminView;
  templateId: string;
  isAdmin: boolean;
  onChange: (v: TemplateAdminView) => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const flagger = view.flaggedBy?.name ?? "A moderator";
  const flaggedAt = view.flaggedForDeletionAt ? formatDate(view.flaggedForDeletionAt) : "recently";

  const handleRestore = async () => {
    setRestoring(true);
    setError("");
    try {
      await unflagDeletion(templateId);
      onChange({
        ...view,
        flaggedForDeletion: false,
        flaggedForDeletionReason: null,
        flaggedForDeletionAt: null,
        flaggedBy: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore");
    } finally {
      setRestoring(false);
    }
  };

  const handleHardDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteTemplate(templateId, null);
      navigateTo("/admin/pending-deletions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  };

  return (
    <div className="mb-4 border border-red-400 dark:border-red-700 rounded-lg p-4 bg-red-50 dark:bg-red-900/30">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-red-800 dark:text-red-200">
            Flagged for deletion
          </div>
          <div className="mt-1 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
            {view.flaggedForDeletionReason || "(no reason given)"}
          </div>
          <div className="mt-1 text-xs text-red-600 dark:text-red-400">
            Flagged by {flagger} · {flaggedAt}
            {!isAdmin && " · Waiting for admin to confirm or restore."}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {!confirmDelete ? (
              <>
                <button
                  onClick={handleRestore}
                  disabled={restoring || deleting}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {restoring ? "Restoring..." : "Restore"}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={restoring || deleting}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Permanently Delete
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-red-700 dark:text-red-300">Are you sure?</span>
                <button
                  onClick={handleHardDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</div>}
    </div>
  );
}

function SlotsSection({ slots, allTemplates }: { slots: SlotDefinition[]; allTemplates: DeviceTemplate[] }) {
  // Group slots by family
  const families = [...new Set(slots.map((s) => s.slotFamily))];

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Expansion Slots</h3>
      {families.map((family) => {
        const familySlots = slots.filter((s) => s.slotFamily === family);
        const compatibleCards = allTemplates.filter((t) => t.slotFamily === family);
        return (
          <div key={family} className="mb-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">{family}</div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Slot</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-500 dark:text-slate-400">Default Card</th>
                </tr>
              </thead>
              <tbody>
                {familySlots.map((slot) => {
                  const defaultCard = slot.defaultCardId ? allTemplates.find((t) => t.id === slot.defaultCardId) : null;
                  return (
                    <tr key={slot.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-3">{slot.label}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{defaultCard?.label ?? slot.defaultCardId ?? "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {compatibleCards.length > 0 && (
              <div className="px-3">
                <span className="text-xs text-slate-400 dark:text-slate-500">Compatible cards: </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">{compatibleCards.map((c) => c.label).join(", ")}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
