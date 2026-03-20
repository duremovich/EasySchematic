import { useState, useEffect } from "react";
import type { DeviceTemplate, SlotDefinition } from "../../../src/types";
import { CONNECTOR_LABELS } from "../../../src/types";
import { fetchTemplate, fetchTemplates, getAdminToken } from "../api";
import SignalBadge from "../components/SignalBadge";

type TemplateWithAttribution = DeviceTemplate & {
  submittedBy?: { name: string };
  lastEditedBy?: { name: string };
};

export default function DeviceDetailPage({ id }: { id: string }) {
  const [template, setTemplate] = useState<TemplateWithAttribution | null>(null);
  const [allTemplates, setAllTemplates] = useState<DeviceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTemplate(id)
      .then((data) => { if (!cancelled) setTemplate(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetchTemplates().then((t) => { if (!cancelled) setAllTemplates(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!template) return <div className="p-8 text-center text-slate-500">Not found</div>;

  const inputs = template.ports.filter((p) => p.direction === "input");
  const outputs = template.ports.filter((p) => p.direction === "output");
  const bidi = template.ports.filter((p) => p.direction === "bidirectional");
  const hasAdmin = !!getAdminToken();

  const renderPortTable = (ports: typeof template.ports, title: string) => {
    if (ports.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">{title}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-medium text-slate-500">Label</th>
              <th className="text-left py-2 px-3 font-medium text-slate-500">Signal</th>
              <th className="text-left py-2 px-3 font-medium text-slate-500">Connector</th>
              <th className="text-left py-2 px-3 font-medium text-slate-500">Section</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((port) => (
              <tr key={port.id} className="border-b border-slate-100">
                <td className="py-2 px-3">{port.label}</td>
                <td className="py-2 px-3"><SignalBadge signalType={port.signalType} /></td>
                <td className="py-2 px-3 text-slate-600">{port.connectorType ? CONNECTOR_LABELS[port.connectorType] ?? port.connectorType : "\u2014"}</td>
                <td className="py-2 px-3 text-slate-600">{port.section ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <a href="#/" className="text-sm text-blue-600 hover:text-blue-800">&larr; All Devices</a>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{template.label}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
            {template.manufacturer && <span>{template.manufacturer}</span>}
            {template.modelNumber && <span>Model: {template.modelNumber}</span>}
            <span className="capitalize">{template.deviceType.replace(/-/g, " ")}</span>
          </div>
          {template.referenceUrl && (
            <a href={template.referenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800">
              Manufacturer Page <span aria-hidden="true">{"\u2197"}</span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {template.color && (
            <span className="w-6 h-6 rounded-full border border-slate-200" style={{ backgroundColor: template.color }} />
          )}
          <a
            href={`#/submit/${template.id}`}
            className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
          >
            Suggest Edit
          </a>
          {hasAdmin && (
            <a
              href={`#/admin/edit/${template.id}`}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Edit
            </a>
          )}
        </div>
      </div>

      {template.searchTerms && template.searchTerms.length > 0 && (
        <div className="mb-6">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Search Terms</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {template.searchTerms.map((term, i) => (
              <span key={i} className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">{term}</span>
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
        <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400">
          {template.submittedBy && (
            <>Submitted by <span className="text-slate-500">{template.submittedBy.name}</span></>
          )}
          {template.submittedBy && template.lastEditedBy && " · "}
          {template.lastEditedBy && (
            <>Last edited by <span className="text-slate-500">{template.lastEditedBy.name}</span></>
          )}
        </div>
      )}
    </div>
  );
}

function SlotsSection({ slots, allTemplates }: { slots: SlotDefinition[]; allTemplates: DeviceTemplate[] }) {
  // Group slots by family
  const families = [...new Set(slots.map((s) => s.slotFamily))];

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">Expansion Slots</h3>
      {families.map((family) => {
        const familySlots = slots.filter((s) => s.slotFamily === family);
        const compatibleCards = allTemplates.filter((t) => t.slotFamily === family);
        return (
          <div key={family} className="mb-4">
            <div className="text-xs text-slate-500 mb-1 font-medium">{family}</div>
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-medium text-slate-500">Slot</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-500">Default Card</th>
                </tr>
              </thead>
              <tbody>
                {familySlots.map((slot) => {
                  const defaultCard = slot.defaultCardId ? allTemplates.find((t) => t.id === slot.defaultCardId) : null;
                  return (
                    <tr key={slot.id} className="border-b border-slate-100">
                      <td className="py-2 px-3">{slot.label}</td>
                      <td className="py-2 px-3 text-slate-600">{defaultCard?.label ?? slot.defaultCardId ?? "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {compatibleCards.length > 0 && (
              <div className="px-3">
                <span className="text-xs text-slate-400">Compatible cards: </span>
                <span className="text-xs text-slate-600">{compatibleCards.map((c) => c.label).join(", ")}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
