import { useState, useEffect } from "react";
import { fetchSubmission, fetchTemplate, approveSubmission, rejectSubmission } from "../api";
import type { Submission } from "../api";
import type { DeviceTemplate, Port, SlotDefinition } from "../../../src/types";
import { CONNECTOR_LABELS } from "../../../src/types";
import { linkClick } from "../navigate";
import StatusBadge from "../components/StatusBadge";
import SignalBadge from "../components/SignalBadge";
import PortEditor from "../components/PortEditor";

export default function ReviewDetailPage({ id }: { id: string }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [existing, setExisting] = useState<DeviceTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState("");
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDeviceType, setEditDeviceType] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editModelNumber, setEditModelNumber] = useState("");
  const [editReferenceUrl, setEditReferenceUrl] = useState("");
  const [editSearchTerms, setEditSearchTerms] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editPorts, setEditPorts] = useState<Port[]>([]);
  const [editSlots, setEditSlots] = useState<SlotDefinition[]>([]);
  const [editSlotFamily, setEditSlotFamily] = useState("");
  const [editHostname, setEditHostname] = useState("");
  const [editPowerDrawW, setEditPowerDrawW] = useState("");
  const [editPowerCapacityW, setEditPowerCapacityW] = useState("");
  const [editVoltage, setEditVoltage] = useState("");
  const [editPoeBudgetW, setEditPoeBudgetW] = useState("");

  useEffect(() => {
    fetchSubmission(id)
      .then(async (s) => {
        setSubmission(s);
        if (s.action === "update" && s.templateId) {
          try {
            const t = await fetchTemplate(s.templateId);
            setExisting(t);
          } catch {
            // Template may have been deleted
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const startEditing = () => {
    if (!submission) return;
    const d = submission.data;
    setEditLabel(d.label ?? "");
    setEditDeviceType(d.deviceType ?? "");
    setEditManufacturer(d.manufacturer ?? "");
    setEditModelNumber(d.modelNumber ?? "");
    setEditReferenceUrl(d.referenceUrl ?? "");
    setEditSearchTerms(d.searchTerms?.join(", ") ?? "");
    setEditColor(d.color ?? "");
    setEditPorts((d.ports ?? []) as Port[]);
    setEditSlots((d.slots ?? []) as SlotDefinition[]);
    setEditSlotFamily((d as Record<string, unknown>).slotFamily as string ?? "");
    setEditHostname((d as Record<string, unknown>).hostname as string ?? "");
    setEditPowerDrawW((d as Record<string, unknown>).powerDrawW != null ? String((d as Record<string, unknown>).powerDrawW) : "");
    setEditPowerCapacityW((d as Record<string, unknown>).powerCapacityW != null ? String((d as Record<string, unknown>).powerCapacityW) : "");
    setEditVoltage((d as Record<string, unknown>).voltage as string ?? "");
    setEditPoeBudgetW((d as Record<string, unknown>).poeBudgetW != null ? String((d as Record<string, unknown>).poeBudgetW) : "");
    setEditing(true);
  };

  const handleApprove = async (withEdits?: boolean) => {
    setActing(true);
    try {
      let editedData: Omit<DeviceTemplate, "id" | "version"> | undefined;
      if (withEdits) {
        editedData = {
          label: editLabel.trim(),
          deviceType: editDeviceType.trim(),
          ports: editPorts,
          ...(editManufacturer.trim() && { manufacturer: editManufacturer.trim() }),
          ...(editModelNumber.trim() && { modelNumber: editModelNumber.trim() }),
          ...(editReferenceUrl.trim() && { referenceUrl: editReferenceUrl.trim() }),
          ...(editColor.trim() && { color: editColor.trim() }),
          ...(editSearchTerms.trim() && { searchTerms: editSearchTerms.split(",").map((s) => s.trim()).filter(Boolean) }),
          ...(editSlots.length > 0 && { slots: editSlots }),
          ...(editSlotFamily.trim() && { slotFamily: editSlotFamily.trim() }),
          ...(editHostname.trim() && { hostname: editHostname.trim() }),
          ...(editPowerDrawW.trim() && { powerDrawW: Number(editPowerDrawW) }),
          ...(editPowerCapacityW.trim() && { powerCapacityW: Number(editPowerCapacityW) }),
          ...(editVoltage.trim() && { voltage: editVoltage.trim() }),
          ...(editPoeBudgetW.trim() && { poeBudgetW: Number(editPoeBudgetW) }),
        };
      }
      await approveSubmission(id, editedData);
      setDone("approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await rejectSubmission(id, rejectNote || undefined);
      setDone("rejected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!submission) return <div className="p-8 text-center text-slate-500">Not found</div>;

  if (done) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${done === "approved" ? "bg-green-100" : "bg-red-100"}`}>
          {done === "approved" ? (
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <h2 className="text-xl font-semibold mb-2">Submission {done}</h2>
        <a href="/review" onClick={linkClick} className="text-sm text-blue-600 hover:text-blue-800">Back to review queue</a>
      </div>
    );
  }

  const proposed = submission.data;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <a href="/review" onClick={linkClick} className="text-sm text-blue-600 hover:text-blue-800">&larr; Review Queue</a>
        <StatusBadge status={submission.status} />
        <span className="text-xs text-slate-400 capitalize">{submission.action}</span>
      </div>

      {submission.submitterNote && (
        <div className="mb-6 border border-amber-200 rounded-lg p-4 bg-amber-50">
          <div className="text-xs font-semibold text-amber-700 mb-1">Submitter Note</div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{submission.submitterNote}</p>
        </div>
      )}

      {existing && submission.action === "update" ? (
        // Side-by-side diff for edits
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h2 className="text-lg font-semibold text-slate-700 mb-3">Current</h2>
            <DeviceInfo data={existing} compare={proposed as DeviceTemplate} side="current" />
            <PortTable ports={existing.ports} comparePorts={(proposed.ports ?? []) as Port[]} side="current" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-blue-700 mb-3">Proposed</h2>
            <DeviceInfo data={proposed as DeviceTemplate} compare={existing} side="proposed" />
            <PortTable ports={(proposed.ports ?? []) as Port[]} comparePorts={existing.ports} side="proposed" />
          </div>
        </div>
      ) : (
        // Single view for new submissions
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-3">Proposed New Device</h2>
          <DeviceInfo data={proposed as DeviceTemplate} />
          <PortTable ports={(proposed.ports ?? []) as Port[]} />
        </div>
      )}

      {/* Edit mode */}
      {editing && submission.status === "pending" && (
        <div className="mb-8 border border-blue-200 rounded-lg p-6 bg-blue-50/50">
          <h2 className="text-lg font-semibold text-blue-700 mb-4">Edit Before Approving</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <label className="sm:col-span-2">
              <span className="block text-sm font-medium text-slate-700 mb-1">Label *</span>
              <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Device Type *</span>
              <input value={editDeviceType} onChange={(e) => setEditDeviceType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Manufacturer</span>
              <input value={editManufacturer} onChange={(e) => setEditManufacturer(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Model Number</span>
              <input value={editModelNumber} onChange={(e) => setEditModelNumber(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="sm:col-span-2">
              <span className="block text-sm font-medium text-slate-700 mb-1">Reference URL</span>
              <input value={editReferenceUrl} onChange={(e) => setEditReferenceUrl(e.target.value)} placeholder="https://manufacturer.com/product-page" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Search Terms</span>
              <input value={editSearchTerms} onChange={(e) => setEditSearchTerms(e.target.value)} placeholder="comma, separated, terms" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Color</span>
              <div className="flex items-center gap-2">
                <input value={editColor} onChange={(e) => setEditColor(e.target.value)} placeholder="#3b82f6" className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {editColor && <span className="w-8 h-8 rounded border border-slate-200" style={{ backgroundColor: editColor }} />}
              </div>
            </label>
          </div>
          <PortEditor ports={editPorts} onChange={setEditPorts} />

          {/* Slot Editor */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700">
                Expansion Slots
                {editSlots.length > 0 && <span className="text-xs text-slate-400 font-normal ml-1">({editSlots.length})</span>}
              </span>
              <button
                onClick={() => {
                  const id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  setEditSlots([...editSlots, { id, label: `Slot ${editSlots.length + 1}`, slotFamily: "" }]);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                + Add Slot
              </button>
            </div>

            {editSlots.length === 0 && (
              <p className="text-xs text-slate-400 mb-2">No expansion slots defined.</p>
            )}

            {editSlots.map((slot, i) => (
              <div key={slot.id} className="border border-slate-200 rounded-lg p-3 mb-3 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={slot.label}
                    onChange={(e) => setEditSlots(editSlots.map((s, j) => j === i ? { ...s, label: e.target.value } : s))}
                    className="flex-1 px-2 py-1 rounded border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Slot label"
                  />
                  <button
                    onClick={() => setEditSlots(editSlots.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-500 text-sm cursor-pointer px-1"
                    title="Remove slot"
                  >
                    &times;
                  </button>
                </div>
                <label className="block text-xs text-slate-500 mb-1">Slot Family</label>
                <input
                  value={slot.slotFamily}
                  onChange={(e) => setEditSlots(editSlots.map((s, j) => j === i ? { ...s, slotFamily: e.target.value } : s))}
                  className="w-full px-2 py-1 rounded border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. disguise-vfc"
                />
              </div>
            ))}

            {/* Slot Family (this device fits into slots of this family) */}
            <label className="block mt-4">
              <span className="block text-xs font-medium text-slate-600 mb-1">Slot Family (device fits into)</span>
              <input
                value={editSlotFamily}
                onChange={(e) => setEditSlotFamily(e.target.value)}
                placeholder="e.g. disguise-vfc"
                className="w-full px-2 py-1 rounded border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-blue-200">
            <button
              onClick={() => handleApprove(true)}
              disabled={acting}
              className="px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {acting ? "Approving..." : "Approve with Edits"}
            </button>
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel Edit
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {submission.status === "pending" && !editing && (
        <div className="border-t border-slate-200 pt-6">
          {showReject ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Rejection note (optional)</span>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Reason for rejection or feedback for the submitter..."
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows={3}
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReject}
                  disabled={acting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {acting ? "Rejecting..." : "Confirm Reject"}
                </button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleApprove()}
                disabled={acting}
                className="px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {acting ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={startEditing}
                className="px-6 py-2 rounded-lg border border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                Edit & Approve
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="px-6 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fieldChanged(a: unknown, b: unknown): boolean {
  return String(a ?? "") !== String(b ?? "");
}

function diffCls(changed: boolean, side?: "current" | "proposed"): string {
  if (!changed || !side) return "";
  return side === "proposed" ? "bg-green-50 rounded px-1 -mx-1" : "bg-red-50 rounded px-1 -mx-1";
}

type DeviceInfoProps = {
  data: Pick<DeviceTemplate, "label" | "deviceType" | "manufacturer" | "modelNumber" | "color" | "referenceUrl" | "slots" | "slotFamily" | "powerDrawW" | "powerCapacityW" | "voltage">;
  compare?: Pick<DeviceTemplate, "label" | "deviceType" | "manufacturer" | "modelNumber" | "color" | "referenceUrl" | "slots" | "slotFamily" | "powerDrawW" | "powerCapacityW" | "voltage">;
  side?: "current" | "proposed";
};

function DeviceInfo({ data, compare, side }: DeviceInfoProps) {
  const extra = data as Record<string, unknown>;
  const cExtra = compare as Record<string, unknown> | undefined;
  const d = (field: keyof typeof data) => compare ? diffCls(fieldChanged(data[field], compare[field]), side) : "";
  const dExtra = (field: string) => cExtra ? diffCls(fieldChanged(extra[field], cExtra[field]), side) : "";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-4">
      <div className={d("label")}><span className="text-slate-500">Label:</span> <span className="font-medium">{data.label}</span></div>
      {extra.hostname ? <div className={dExtra("hostname")}><span className="text-slate-500">Hostname:</span> {String(extra.hostname)}</div> : null}
      <div className={d("deviceType")}><span className="text-slate-500">Type:</span> {data.deviceType}</div>
      {data.manufacturer && <div className={d("manufacturer")}><span className="text-slate-500">Manufacturer:</span> {data.manufacturer}</div>}
      {data.modelNumber && <div className={d("modelNumber")}><span className="text-slate-500">Model:</span> {data.modelNumber}</div>}
      {data.referenceUrl && (
        <div className={`sm:col-span-2 ${d("referenceUrl")}`}>
          <span className="text-slate-500">Reference:</span>{" "}
          <a href={data.referenceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all">{data.referenceUrl}</a>
        </div>
      )}
      {data.color && (
        <div className={`flex items-center gap-1 ${d("color")}`}>
          <span className="text-slate-500">Color:</span>
          <span className="w-4 h-4 rounded border border-slate-200 inline-block" style={{ backgroundColor: data.color }} />
          <span>{data.color}</span>
        </div>
      )}
      {data.slots && data.slots.length > 0 && (
        <div><span className="text-slate-500">Slots:</span> {data.slots.length} ({[...new Set(data.slots.map((s) => s.slotFamily))].join(", ")})</div>
      )}
      {data.slotFamily && (
        <div className={d("slotFamily")}><span className="text-slate-500">Slot Family:</span> {data.slotFamily}</div>
      )}
      {data.powerDrawW != null && (
        <div className={d("powerDrawW")}><span className="text-slate-500">Power Draw:</span> {data.powerDrawW}W</div>
      )}
      {data.powerCapacityW != null && (
        <div className={d("powerCapacityW")}><span className="text-slate-500">Power Capacity:</span> {data.powerCapacityW}W</div>
      )}
      {extra.poeBudgetW != null && (
        <div className={dExtra("poeBudgetW")}><span className="text-slate-500">PoE Budget:</span> {String(extra.poeBudgetW)}W</div>
      )}
      {data.voltage && (
        <div className={d("voltage")}><span className="text-slate-500">Voltage:</span> {data.voltage}</div>
      )}
    </div>
  );
}

function getPortDiffMap(ports: Port[], comparePorts: Port[], side: "current" | "proposed"): Map<string, "added" | "removed" | "changed" | "unchanged"> {
  const map = new Map<string, "added" | "removed" | "changed" | "unchanged">();
  const compareById = new Map(comparePorts.map((p) => [p.id, p]));
  const portIds = new Set(ports.map((p) => p.id));

  for (const p of ports) {
    const other = compareById.get(p.id);
    if (!other) {
      // Port exists in this list but not the other
      map.set(p.id, side === "proposed" ? "added" : "removed");
    } else {
      const changed = p.label !== other.label || p.direction !== other.direction || p.signalType !== other.signalType || (p.connectorType ?? "") !== (other.connectorType ?? "") || (p.section ?? "") !== (other.section ?? "");
      map.set(p.id, changed ? "changed" : "unchanged");
    }
  }

  // For current side, also mark ports that exist in compare but not here (they were added in proposed)
  if (side === "current") {
    for (const cp of comparePorts) {
      if (!portIds.has(cp.id)) {
        // This port was added in proposed — nothing to mark on current side
      }
    }
  }

  return map;
}

const PORT_DIFF_STYLES: Record<string, string> = {
  added: "bg-green-50 border-l-2 border-l-green-400",
  removed: "bg-red-50 border-l-2 border-l-red-400",
  changed: "bg-amber-50 border-l-2 border-l-amber-400",
  unchanged: "",
};

function PortTable({ ports, comparePorts, side }: { ports: Port[]; comparePorts?: Port[]; side?: "current" | "proposed" }) {
  if (!ports.length) return <p className="text-sm text-slate-400">No ports</p>;

  const diffMap = comparePorts && side ? getPortDiffMap(ports, comparePorts, side) : null;

  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
          <th className="pb-1">Label</th>
          <th className="pb-1">Direction</th>
          <th className="pb-1">Signal</th>
          <th className="pb-1">Connector</th>
        </tr>
      </thead>
      <tbody>
        {ports.map((p, i) => {
          const status = diffMap?.get(p.id);
          const rowCls = status ? PORT_DIFF_STYLES[status] : "";
          return (
            <tr key={i} className={`border-b border-slate-100 ${rowCls}`}>
              <td className="py-1 pl-1">{p.label}</td>
              <td className="py-1">{p.direction}</td>
              <td className="py-1"><SignalBadge signalType={p.signalType} /></td>
              <td className="py-1 text-slate-500">{p.connectorType ? (CONNECTOR_LABELS[p.connectorType] ?? p.connectorType) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
