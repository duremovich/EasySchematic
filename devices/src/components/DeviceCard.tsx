import type { DeviceTemplate, SignalType } from "../../../src/types";
import SignalBadge from "./SignalBadge";

export default function DeviceCard({ template }: { template: DeviceTemplate }) {
  const signals = [...new Set(template.ports.map((p) => p.signalType))];

  return (
    <a
      href={`#/device/${template.id}`}
      className="block p-4 rounded-lg border border-slate-200 hover:border-slate-400 hover:shadow-md transition-all bg-white"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">{template.label}</h3>
          {template.manufacturer && (
            <p className="text-sm text-slate-500 truncate">{template.manufacturer}</p>
          )}
        </div>
        {template.color && (
          <span
            className="w-4 h-4 rounded-full shrink-0 border border-slate-200"
            style={{ backgroundColor: template.color }}
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {signals.map((s) => (
          <SignalBadge key={s} signalType={s as SignalType} />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {template.ports.length} port{template.ports.length !== 1 ? "s" : ""}
        {template.slots && template.slots.length > 0 && (
          <> &middot; {template.slots.length} slot{template.slots.length !== 1 ? "s" : ""}</>
        )}
      </p>
    </a>
  );
}
