import { useViewport } from "@xyflow/react";
import type { GuideLine } from "../snapUtils";

export default function SnapGuides({ guides }: { guides: GuideLine[] }) {
  const { x: vx, y: vy, zoom } = useViewport();

  if (guides.length === 0) return null;

  // Render a viewport-aligned container so coordinates are in flow-space
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      <svg
        style={{
          position: "absolute",
          overflow: "visible",
          width: 1,
          height: 1,
          transform: `translate(${vx}px, ${vy}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {guides.map((g, i) =>
          g.orientation === "v" ? (
            <line
              key={i}
              x1={g.pos}
              y1={g.from}
              x2={g.pos}
              y2={g.to}
              stroke="#3b82f6"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${3 / zoom}`}
            />
          ) : (
            <line
              key={i}
              x1={g.from}
              y1={g.pos}
              x2={g.to}
              y2={g.pos}
              stroke="#3b82f6"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${3 / zoom}`}
            />
          ),
        )}
      </svg>
    </div>
  );
}
