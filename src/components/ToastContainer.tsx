import { useSchematicStore } from "../store";
import type { Toast } from "../store";

const iconByType: Record<Toast["type"], string> = {
  error: "\u26A0",    // ⚠
  success: "\u2713",  // ✓
  info: "\u2139",     // ℹ
};

const bgByType: Record<Toast["type"], string> = {
  error: "rgba(220, 38, 38, 0.15)",
  success: "rgba(22, 163, 74, 0.15)",
  info: "rgba(59, 130, 246, 0.15)",
};

const borderByType: Record<Toast["type"], string> = {
  error: "rgba(220, 38, 38, 0.4)",
  success: "rgba(22, 163, 74, 0.4)",
  info: "rgba(59, 130, 246, 0.4)",
};

const iconColorByType: Record<Toast["type"], string> = {
  error: "#dc2626",
  success: "#16a34a",
  info: "#3b82f6",
};

export default function ToastContainer() {
  const toasts = useSchematicStore((s) => s.toasts);
  const removeToast = useSchematicStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 8,
            background: bgByType[t.type],
            border: `1px solid ${borderByType[t.type]}`,
            backdropFilter: "blur(12px)",
            color: "var(--color-text)",
            fontSize: 13,
            lineHeight: 1.4,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            animation: "toast-in 0.2s ease-out",
          }}
        >
          <span style={{ color: iconColorByType[t.type], fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
            {iconByType[t.type]}
          </span>
          <span>{t.message}</span>
        </div>
      ))}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
