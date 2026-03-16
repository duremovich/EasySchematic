import { useState, useEffect } from "react";
import type { DeviceTemplate } from "../../../src/types";
import { CONNECTOR_LABELS } from "../../../src/types";
import { fetchTemplate, getAdminToken } from "../api";
import SignalBadge from "../components/SignalBadge";

export default function DeviceDetailPage({ id }: { id: string }) {
  const [template, setTemplate] = useState<DeviceTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchTemplate(id)
      .then(setTemplate)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
        </div>
        <div className="flex items-center gap-3">
          {template.color && (
            <span className="w-6 h-6 rounded-full border border-slate-200" style={{ backgroundColor: template.color }} />
          )}
          {hasAdmin && (
            <a
              href={`#/admin/${template.id}`}
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
    </div>
  );
}
