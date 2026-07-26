import { useEffect, useMemo, useState } from "react";
import type { DeviceData } from "../types";
import { CONNECTOR_LABELS } from "../types";
import { useSchematicStore } from "../store";
import {
  getPanelOccupancy,
  resolvePortDisplay,
  checkHopConnectors,
  devicePoint,
  type PortDisplay,
  type PortFaceDisplay,
} from "../patchCircuits";
import { exportPatchPanelStripsPdf } from "../patchPanelPdf";

// Face geometry (px) — tuned to fit two-line port cards under each jack.
const PITCH = 84;
const EAR = 42;
const FACE_H = 124;

/** One designation-strip line. 16 chars is what fits in the 72px box at 7.5px mono. */
const clampStrip = (s: string | undefined) => {
  const v = s ?? "—";
  return v.length > 16 ? v.slice(0, 15) + "…" : v;
};

/** Main area of the Patch Panels page: one block per panel — SVG face + per-port cards —
 *  plus the assign-mode banner and hover circuit tracing. */
export default function PatchPanelRenderer() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const cableIdMap = useSchematicStore((s) => s.cableIdMap);
  const patchAssignEdgeId = useSchematicStore((s) => s.patchAssignEdgeId);
  const patchTracedEdgeId = useSchematicStore((s) => s.patchTracedEdgeId);
  const setPatchAssignEdge = useSchematicStore((s) => s.setPatchAssignEdge);
  const setPatchTracedEdge = useSchematicStore((s) => s.setPatchTracedEdge);
  const addEdgePatchHop = useSchematicStore((s) => s.addEdgePatchHop);
  const setPatchSegmentOverride = useSchematicStore((s) => s.setPatchSegmentOverride);
  const addToast = useSchematicStore((s) => s.addToast);

  // Inline label-override editing: which chip is being edited.
  const [editing, setEditing] = useState<{ edgeId: string; segIndex: number; value: string } | null>(null);

  const panels = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "device" && (n.data as DeviceData).deviceType === "patch-panel")
        .sort((a, b) => ((a.data as DeviceData).label || "").localeCompare((b.data as DeviceData).label || "")),
    [nodes],
  );

  const occupancy = useMemo(() => getPanelOccupancy(nodes, edges), [nodes, edges]);
  const baseIdFor = useMemo(
    () => (edge: { id: string; data?: { cableId?: unknown } }) =>
      cableIdMap[edge.id] ?? (edge.data?.cableId as string | undefined) ?? "—",
    [cableIdMap],
  );

  // Per-panel port displays, keyed by panel node id. Hover tracing re-renders the
  // component (patchTracedEdgeId churn) but is NOT an input here — memoizing keeps
  // pointer moves from re-deriving every segment on every panel.
  const displaysByPanel = useMemo(() => {
    const m = new Map<string, (PortDisplay | null)[]>();
    for (const panel of panels) {
      const data = panel.data as DeviceData;
      const hiddenPorts = new Set((data.hiddenPorts as string[] | undefined) ?? []);
      const visiblePorts = data.ports.filter((p) => p.direction === "passthrough" && !hiddenPorts.has(p.id));
      m.set(panel.id, visiblePorts.map((port) =>
        resolvePortDisplay(panel.id, port.id, occupancy, nodes, edges, baseIdFor),
      ));
    }
    return m;
  }, [panels, occupancy, nodes, edges, baseIdFor]);

  const assignEdge = patchAssignEdgeId ? edges.find((e) => e.id === patchAssignEdgeId) : undefined;
  const assigning = !!assignEdge;

  // Esc cancels assign mode. Leaving the page clears assign/trace state in
  // setActivePage — doing it in an unmount cleanup here would let StrictMode's
  // double-invoked effects wipe an arm set by "Patch via Panel..." on the schematic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPatchAssignEdge(null);
    };
    if (assigning) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assigning, setPatchAssignEdge]);

  const tryAssign = (panelNodeId: string, portId: string) => {
    if (!patchAssignEdgeId || !assignEdge) return;
    const hop = { panelNodeId, portId };
    const mismatch = checkHopConnectors(
      assignEdge,
      nodes,
      hop,
      devicePoint(nodes, assignEdge.source, assignEdge.sourceHandle),
      devicePoint(nodes, assignEdge.target, assignEdge.targetHandle),
    );
    if (mismatch) {
      const faceLabel = mismatch.face === "rear" ? "rear" : "front";
      addToast(
        `Won't fit — this port's ${faceLabel} is ${CONNECTOR_LABELS[mismatch.panelConnector]}, ` +
          `but ${mismatch.otherLabel} is ${CONNECTOR_LABELS[mismatch.otherConnector]}.`,
        "error",
      );
      return;
    }
    const ok = addEdgePatchHop(patchAssignEdgeId, hop);
    if (!ok) addToast("That port is already occupied", "info");
  };

  const commitEdit = () => {
    if (editing) setPatchSegmentOverride(editing.edgeId, editing.segIndex, { label: editing.value });
    setEditing(null);
  };

  const renderChip = (
    display: PortDisplay,
    face: PortFaceDisplay | undefined,
    arrow: "◀" | "▶",
  ) => {
    if (!face) {
      return (
        <div className="border border-dashed border-neutral-300 rounded px-1 py-0.5 text-neutral-400 text-center text-[10px]">
          unwired
        </div>
      );
    }
    const traced = patchTracedEdgeId === display.edgeId;
    const editable = display.kind === "hop" && face.segIndex !== undefined;
    const isEditing = editing && editing.edgeId === display.edgeId && editing.segIndex === face.segIndex;
    return (
      <div
        className={`border rounded px-1 py-0.5 bg-white shadow-sm cursor-default ${
          traced ? "border-amber-400 ring-2 ring-amber-200" : "border-neutral-300"
        }`}
        style={{ borderLeftWidth: 3, borderLeftColor: `var(--color-${display.signalType ?? "custom"})` }}
        onMouseEnter={() => setPatchTracedEdge(display.edgeId)}
        onMouseLeave={() => setPatchTracedEdge(null)}
        onDoubleClick={() => {
          if (editable) setEditing({ edgeId: display.edgeId, segIndex: face.segIndex!, value: face.cableLabel });
        }}
        title={editable ? "Double-click to override the cable label" : "Wired on the schematic — edit there"}
      >
        {isEditing ? (
          <input
            autoFocus
            className="w-full font-mono font-bold text-[10px] border border-blue-400 rounded px-0.5 outline-none"
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(null);
            }}
          />
        ) : (
          <div className="font-mono font-bold text-[10px] truncate">
            {arrow} {face.cableLabel}
            {face.overridden ? " ✏️" : ""}
          </div>
        )}
        <div className="text-neutral-500 text-[10px] truncate">{face.farLabel}</div>
        <div className="text-neutral-400 text-[9px] truncate">{face.farPortLabel}</div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-neutral-50 relative">
      {/* Assign-mode banner */}
      {assigning && (
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-blue-600 text-white px-4 py-2 text-xs shadow">
          <span>
            Patching <b className="font-mono">{assignEdge ? baseIdFor(assignEdge) : ""}</b> — click an open port.
            Click a second panel’s port to add another hop.
          </span>
          <button
            className="ml-auto bg-white/20 hover:bg-white/30 rounded px-2 py-0.5"
            onClick={() => setPatchAssignEdge(null)}
          >
            Done
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-neutral-200 text-xs" data-print-hide>
        <span className="font-semibold text-neutral-700">Patch Bay</span>
        <span className="text-neutral-400 hidden md:inline">Hover a port or cable to trace its circuit</span>
        <div className="ml-auto flex gap-2">
          <button
            className="border border-neutral-300 rounded px-2.5 py-1 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
            disabled={panels.length === 0}
            onClick={() => {
              const name = useSchematicStore.getState().schematicName || "Schematic";
              exportPatchPanelStripsPdf(nodes, edges, cableIdMap, name);
            }}
            title="Designation strips at 100% physical scale — cut and slide into the panel's label holder"
          >
            🖨 Print strips (PDF)
          </button>
          <button
            className="bg-blue-600 text-white rounded px-2.5 py-1 hover:bg-blue-700"
            onClick={() => window.dispatchEvent(new CustomEvent("easyschematic:open-reports", { detail: "patchPanel" }))}
          >
            Schedule report…
          </button>
        </div>
      </div>

      <div className="p-5 pb-16">
        {panels.length === 0 && (
          <div className="text-center text-neutral-400 text-sm mt-16">
            No patch panels in this project yet.
            <br />
            Use <b>+ Add panel</b> in the sidebar to create a virtual panel, or place one on the schematic.
          </div>
        )}

        {panels.map((panel) => {
          const data = panel.data as DeviceData;
          const ports = data.ports.filter((p) => p.direction === "passthrough");
          const hiddenPorts = new Set((data.hiddenPorts as string[] | undefined) ?? []);
          const visiblePorts = ports.filter((p) => !hiddenPorts.has(p.id));
          const W = EAR * 2 + PITCH * visiblePorts.length;
          const label = data.label || "Unnamed Panel";

          if (visiblePorts.length === 0) {
            return (
              <div key={panel.id} id={`ppblk-${panel.id}`} className="mb-8">
                <div className="text-sm font-bold text-neutral-800">{label}</div>
                <div className="text-xs text-neutral-400">
                  Legacy paired-port panel — shown in the Patch Panel Schedule report only.
                </div>
              </div>
            );
          }

          const displays = displaysByPanel.get(panel.id) ?? [];

          return (
            <div key={panel.id} id={`ppblk-${panel.id}`} className="mb-9">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-sm font-bold text-neutral-800">{label}</span>
                <span className="text-[11px] text-neutral-400">
                  {data.offCanvas ? "virtual (not on schematic)" : "on schematic"} ·{" "}
                  {displays.filter(Boolean).length}/{visiblePorts.length} used
                </span>
              </div>

              <div className="overflow-x-auto pb-1">
                {/* Panel face */}
                <svg width={W} height={FACE_H} viewBox={`0 0 ${W} ${FACE_H}`} role="img" aria-label={`${label} panel face`}>
                  <rect x={0} y={0} width={W} height={FACE_H} rx={4} fill="#24262b" />
                  <rect x={1.5} y={1.5} width={W - 3} height={FACE_H - 3} rx={3} fill="none" stroke="rgba(255,255,255,.07)" />
                  {[[14, 16], [14, FACE_H - 16], [W - 14, 16], [W - 14, FACE_H - 16]].map(([x, y], i) => (
                    <g key={i}>
                      <circle cx={x} cy={y} r={5} fill="#1a1c20" stroke="#6b6f78" />
                      <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke="#6b6f78" strokeWidth={1.4} transform={`rotate(40 ${x} ${y})`} />
                    </g>
                  ))}
                  <text x={EAR} y={15} fill="#b9bcc4" fontSize={10} fontWeight={700} letterSpacing={1}>
                    {label.toUpperCase()}
                  </text>
                  {visiblePorts.map((port, i) => {
                    const cx = EAR + PITCH * i + PITCH / 2;
                    const cy = FACE_H / 2 - 4;
                    const display = displays[i];
                    const open = !display;
                    const traced = display && patchTracedEdgeId === display.edgeId;
                    const conn = port.frontConnectorType ?? port.connectorType;
                    const connLabel = conn ? (CONNECTOR_LABELS[conn] ?? conn) : "";
                    return (
                      <g
                        key={port.id}
                        className={assigning && open ? "cursor-pointer" : display ? "cursor-default" : undefined}
                        onClick={() => { if (assigning && open) tryAssign(panel.id, port.id); }}
                        onMouseEnter={() => { if (display) setPatchTracedEdge(display.edgeId); }}
                        onMouseLeave={() => { if (display) setPatchTracedEdge(null); }}
                      >
                        <text x={cx} y={cy - 34} textAnchor="middle" fill="#b9bcc4" fontSize={11} fontWeight={600} fontFamily="ui-monospace, monospace">
                          {String(i + 1).padStart(2, "0")}
                        </text>
                        <circle
                          cx={cx} cy={cy} r={21}
                          fill="#1a1c20"
                          stroke={traced ? "#f59e0b" : assigning && open ? "#3b82f6" : "#6b6f78"}
                          strokeWidth={traced || (assigning && open) ? 3 : 2}
                        />
                        <text x={cx} y={cy + 3.5} textAnchor="middle" fill="#9ca3af" fontSize={9} fontWeight={600}>
                          {connLabel}
                        </text>
                        {display && (
                          <>
                            {/* Two lines (rear over front) rather than "rear / front" on one —
                                a default pair like E001-A / E001-B already overran the old box. */}
                            <rect x={cx - 36} y={cy + 24} width={72} height={22} rx={2} fill="#fff" opacity={0.92} />
                            <text x={cx} y={cy + 32.5} textAnchor="middle" fontSize={7.5} fill="#111" fontFamily="ui-monospace, monospace">
                              {clampStrip(display.rear?.cableLabel)}
                            </text>
                            <text x={cx} y={cy + 42} textAnchor="middle" fontSize={7.5} fill="#111" fontFamily="ui-monospace, monospace">
                              {clampStrip(display.front?.cableLabel)}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Per-port cards */}
                <div className="flex mt-1.5" style={{ width: W }}>
                  <div style={{ width: EAR }} className="shrink-0" />
                  {visiblePorts.map((port, i) => {
                    const display = displays[i];
                    return (
                      <div key={port.id} className="shrink-0 px-0.5 flex flex-col gap-1" style={{ width: PITCH }}>
                        {display ? (
                          <>
                            {renderChip(display, display.rear, "◀")}
                            {renderChip(display, display.front, "▶")}
                          </>
                        ) : assigning ? (
                          <button
                            className="border border-dashed border-blue-400 text-blue-600 rounded py-3 text-[10px] hover:bg-blue-50 animate-pulse"
                            onClick={() => tryAssign(panel.id, port.id)}
                          >
                            ＋ patch here
                          </button>
                        ) : (
                          <div className="border border-dashed border-neutral-300 rounded py-3 text-center text-neutral-400 text-[10px]">
                            spare
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
