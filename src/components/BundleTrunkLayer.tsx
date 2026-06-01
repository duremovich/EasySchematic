import { useViewport } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { bundleMembers } from "../bundles";
import { DEFAULT_SIGNAL_COLORS } from "../signalColors";
import type { SignalType } from "../types";

const NEUTRAL = "#64748b";

/**
 * Draws each bundle's shared trunk as one thick band over its member legs, with an `Nx`
 * member-count badge. A bundle whose members all share one signal type takes that color;
 * mixed bundles draw neutral grey. Clicking the trunk selects all its members. Members
 * still render their own (thin, signal-colored) gather/trunk/fan paths underneath via
 * OffsetEdge — this overlay just makes the shared span read as one trunk.
 */
export default function BundleTrunkLayer() {
  const routedEdges = useSchematicStore((s) => s.routedEdges);
  const edges = useSchematicStore((s) => s.edges);
  const bundles = useSchematicStore((s) => s.bundles);
  const selectEdges = useSchematicStore((s) => s.selectEdges);
  const { x: vx, y: vy, zoom } = useViewport();

  const ids = Object.keys(bundles);
  if (ids.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4, overflow: "hidden" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <g transform={`translate(${vx}, ${vy}) scale(${zoom})`}>
          {ids.map((id) => {
            const r = routedEdges[`bundle:${id}`];
            if (!r || !r.svgPath) return null;
            const members = bundleMembers(edges, id);
            if (members.length < 2) return null;
            const types = new Set(members.map((m) => m.data?.signalType));
            const color = types.size === 1
              ? (DEFAULT_SIGNAL_COLORS[[...types][0] as SignalType] ?? NEUTRAL)
              : NEUTRAL;
            return (
              <g
                key={id}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); selectEdges(members.map((m) => m.id)); }}
              >
                <path d={r.svgPath} fill="none" stroke={color} strokeWidth={7} opacity={0.45} strokeLinecap="round" strokeLinejoin="round" />
                <text
                  x={r.labelX} y={r.labelY - 7}
                  fontSize={12} fontWeight={600} fill={color}
                  textAnchor="middle"
                  paintOrder="stroke" stroke="#ffffff" strokeWidth={3}
                  style={{ userSelect: "none" }}
                >
                  {members.length}×
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
