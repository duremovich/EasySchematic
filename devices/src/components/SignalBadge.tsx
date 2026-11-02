import { type SignalType } from "../../../src/types";
import { signalLabel } from "../../../src/typeRegistry";
import { signalCssColor } from "../../../src/typeRegistry";
import { useCommunityTypes } from "../hooks/useCommunityTypes";

export default function SignalBadge({ signalType }: { signalType: SignalType }) {
  useCommunityTypes(); // community signals resolve once /types lands
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700"
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: signalCssColor(signalType) }}
      />
      {signalLabel(signalType)}
    </span>
  );
}
