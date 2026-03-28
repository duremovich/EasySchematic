import { useState, useCallback } from "react";
import { useSchematicStore } from "../store";
import { ROUTING_DEFAULTS as PATHFINDING_DEFAULTS } from "../pathfinding";
import { ROUTER_DEFAULTS } from "../edgeRouter";

/** Parameter definition for building sliders. */
interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description: string;
}

const PATHFINDING_PARAMS: ParamDef[] = [
  { key: "TURN_PENALTY", label: "Turn Penalty", min: 0, max: 50, step: 1, defaultValue: PATHFINDING_DEFAULTS.TURN_PENALTY, description: "Extra cost added each time A* makes a 90° turn. Higher = straighter paths with fewer bends. Lower = shorter paths that bend freely. Also affects U-turns at 5x and the heuristic." },
  { key: "CROSSING_PENALTY", label: "Crossing Penalty", min: 0, max: 100, step: 1, defaultValue: PATHFINDING_DEFAULTS.CROSSING_PENALTY, description: "Cost added when a path crosses an existing edge perpendicularly. Accumulates per crossing — 1 crossing costs 1x, 8 crossings costs 8x. Discourages unnecessary crossings without preventing necessary ones like highway intersections." },
  { key: "PAD", label: "Device Padding", min: 0, max: 5, step: 1, defaultValue: PATHFINDING_DEFAULTS.PAD, description: "How many grid cells of blocked space to add around each device. At 1, edges must route at least 20px away from any device border. At 0, edges can hug device edges." },
  { key: "ESCAPE_MARGIN", label: "Escape Margin", min: 0, max: 10, step: 1, defaultValue: PATHFINDING_DEFAULTS.ESCAPE_MARGIN, description: "Extra grid cells added beyond the bounding box of all devices. Gives A* room to route around the outside. Too small = edges get trapped, too large = wasted grid and slower routing." },
  { key: "NESTING_BIAS", label: "Nesting Bias", min: 0, max: 0.5, step: 0.01, defaultValue: PATHFINDING_DEFAULTS.NESTING_BIAS, description: "Discount at turns proportional to vertical span × horizontal progress. Larger-span edges get more discount for turning later, claiming outer corridors. At 0.05, a span-60 edge gets ~2.7 discount per turn (vs 7 turn penalty). Too high will override crossing penalties." },
];

const ORCHESTRATION_PARAMS: ParamDef[] = [
  { key: "SORT_STRATEGY", label: "Sort Strategy", min: 0, max: 2, step: 1, defaultValue: ROUTER_DEFAULTS.SORT_STRATEGY, description: "Order edges are routed in Phase 1. 0 = signal-type groups then shortest first, 1 = longest edges first (they claim space early), 2 = most-connected devices first. Earlier edges get cleaner paths." },
  { key: "SEPARATION_THRESHOLD", label: "Sep. Threshold", min: 1, max: 30, step: 1, defaultValue: ROUTER_DEFAULTS.SEPARATION_THRESHOLD, description: "Minimum pixel distance between two parallel segments before they're considered 'shared' (a violation). Used in Phase 2 violation detection to flag edges that are too close together." },
];

function getOverrides(): Record<string, number> {
  const w = globalThis as unknown as Record<string, unknown>;
  if (!w.__routingParams) w.__routingParams = {};
  return w.__routingParams as Record<string, number>;
}

function ParamSlider({ def, value, onChange }: { def: ParamDef; value: number; onChange: (key: string, val: number) => void }) {
  const isDefault = value === def.defaultValue;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <label className="text-[11px] w-[110px] shrink-0 truncate" title={def.description}>
        {def.label}
      </label>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(def.key, Number(e.target.value))}
        className="flex-1 h-1 accent-blue-500"
      />
      <span className={`text-[11px] w-[32px] text-right font-mono ${isDefault ? "text-gray-400" : "text-yellow-400 font-bold"}`}>
        {value}
      </span>
    </div>
  );
}

export default function RoutingTuningPanel() {
  const debugEdges = useSchematicStore((s) => s.debugEdges);
  const bumpRoutingParams = useSchematicStore((s) => s.bumpRoutingParams);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const overrides = getOverrides();
    const all: Record<string, number> = {};
    for (const def of [...PATHFINDING_PARAMS, ...ORCHESTRATION_PARAMS]) {
      all[def.key] = (overrides[def.key] as number) ?? def.defaultValue;
    }
    return all;
  });
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = useCallback((key: string, val: number) => {
    const overrides = getOverrides();
    const allDefs = [...PATHFINDING_PARAMS, ...ORCHESTRATION_PARAMS];
    const def = allDefs.find((d) => d.key === key);
    if (def && val === def.defaultValue) {
      delete overrides[key];
    } else {
      overrides[key] = val;
    }
    setValues((prev) => ({ ...prev, [key]: val }));
    bumpRoutingParams();
  }, [bumpRoutingParams]);

  const handleReset = useCallback(() => {
    const w = globalThis as unknown as Record<string, unknown>;
    w.__routingParams = {};
    const defaults: Record<string, number> = {};
    for (const def of [...PATHFINDING_PARAMS, ...ORCHESTRATION_PARAMS]) {
      defaults[def.key] = def.defaultValue;
    }
    setValues(defaults);
    bumpRoutingParams();
  }, [bumpRoutingParams]);

  const handleCopyParams = useCallback(() => {
    const overrides = getOverrides();
    const nonDefault = Object.entries(overrides).filter(([, v]) => v !== undefined);
    if (nonDefault.length === 0) {
      navigator.clipboard.writeText("// All defaults — no overrides");
    } else {
      const lines = nonDefault.map(([k, v]) => `  ${k}: ${v},`).join("\n");
      navigator.clipboard.writeText(`// Routing param overrides\n{\n${lines}\n}`);
    }
  }, []);

  if (!debugEdges) return null;

  return (
    <div
      className="fixed top-12 right-2 z-[10001] bg-gray-900/95 text-white rounded-lg shadow-2xl border border-gray-700 backdrop-blur-sm"
      style={{ width: collapsed ? "auto" : 320 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-xs font-semibold tracking-wide uppercase">Routing Tuning</span>
        <span className="text-[10px] text-gray-400">{collapsed ? "+" : "-"}</span>
      </div>

      {!collapsed && (
        <div className="px-3 py-2 max-h-[70vh] overflow-y-auto">
          {/* A* Pathfinding params */}
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 mt-1">A* Pathfinding</div>
          {PATHFINDING_PARAMS.map((def) => (
            <ParamSlider key={def.key} def={def} value={values[def.key]} onChange={handleChange} />
          ))}

          {/* Router orchestration params */}
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 mt-3">Router Orchestration</div>
          {ORCHESTRATION_PARAMS.map((def) => (
            <ParamSlider key={def.key} def={def} value={values[def.key]} onChange={handleChange} />
          ))}

          {/* Actions */}
          <div className="flex gap-2 mt-3 mb-1">
            <button
              onClick={handleReset}
              className="flex-1 text-[11px] px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              Reset All
            </button>
            <button
              onClick={handleCopyParams}
              className="flex-1 text-[11px] px-2 py-1.5 bg-blue-700 hover:bg-blue-600 rounded transition-colors"
            >
              Copy Overrides
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
