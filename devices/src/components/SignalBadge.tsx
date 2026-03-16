import { SIGNAL_LABELS, type SignalType } from "../../../src/types";

export default function SignalBadge({ signalType }: { signalType: SignalType }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700"
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: `var(--color-${signalType})` }}
      />
      {SIGNAL_LABELS[signalType] ?? signalType}
    </span>
  );
}
