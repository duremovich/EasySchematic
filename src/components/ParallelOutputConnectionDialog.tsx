import { useState } from "react";
import { useSchematicStore } from "../store";
import { CONNECTOR_LABELS, SIGNAL_LABELS } from "../types";

export default function ParallelOutputConnectionDialog() {
  const pending = useSchematicStore((s) => s.pendingParallelOutputConnection);
  const dismiss = useSchematicStore((s) => s.dismissParallelOutputDialog);
  const forceConnect = useSchematicStore((s) => s.forceParallelOutputConnection);
  const [dontWarnAgain, setDontWarnAgain] = useState(false);

  if (!pending) return null;

  const srcSignal = SIGNAL_LABELS[pending.sourcePort.signalType];
  const srcConn = pending.sourcePort.connectorType ? CONNECTOR_LABELS[pending.sourcePort.connectorType] : "";
  const tgtConn = pending.targetPort.connectorType ? CONNECTOR_LABELS[pending.targetPort.connectorType] : "";
  const connectorText = srcConn || tgtConn ? ` (${[srcConn, tgtConn].filter(Boolean).join(" to ")})` : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={dismiss}
    >
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[440px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-heading)]">
            Output to Output Connection
          </span>
          <button
            onClick={dismiss}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            {srcSignal}{connectorText}
          </p>
          <p className="text-xs text-[var(--color-text)]">
            You are connecting two outputs together. Use this for intentional parallel or summed feeds only.
          </p>
          <label className="flex items-center gap-2 text-xs text-[var(--color-text)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontWarnAgain}
              onChange={(e) => setDontWarnAgain(e.target.checked)}
              className="accent-blue-600 cursor-pointer"
            />
            Don't warn me again for output connections
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <button
            onClick={dismiss}
            className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
          >
            Cancel
          </button>
          <button
            onClick={() => forceConnect(dontWarnAgain)}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Connect Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
