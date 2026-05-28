import { useSWStore } from "../swStore";
import { triggerUpdate } from "../sw-register";

export default function UpdatePill() {
  const updateAvailable = useSWStore((s) => s.updateAvailable);
  if (!updateAvailable) return null;

  return (
    <div
      className="text-sm px-4 py-2 flex items-center justify-between gap-4"
      style={{
        backgroundColor: "#2563eb",
        color: "#ffffff",
        borderBottom: "1px solid #1d4ed8",
      }}
      data-print-hide
    >
      <span>
        <strong>New version available.</strong> Reload to pick up the latest fixes.
      </span>
      <button
        onClick={() => triggerUpdate()}
        className="text-xs cursor-pointer px-2 py-1 rounded bg-white/15 hover:bg-white/25 transition-colors shrink-0"
      >
        Reload now
      </button>
    </div>
  );
}
