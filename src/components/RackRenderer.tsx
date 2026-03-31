import { useCallback, useMemo, useRef, useState, type WheelEvent, type MouseEvent } from "react";
import { useSchematicStore } from "../store";
import type { RackData, RackDevicePlacement, RackAccessory, DeviceData, SchematicPage } from "../types";
import { RACK_ACCESSORY_LABELS } from "../types";
import { inferRackHeightU, autoLayoutPorts, PX_PER_MM } from "../rackUtils";
import { SIGNAL_COLORS } from "../types";
import { ConnectorIcon, getConnectorSpec } from "./connectorIcons";
import { draggedDeviceHeightU } from "./RackSidebar";
import FacePlateEditor from "./FacePlateEditor";
import type { FacePlateLayout } from "../types";

// ── Constants ──────────────────────────────────────────────────────

const PX_PER_U = 24;
const RACK_WIDTH = 260;
const RULER_WIDTH = 28;
const RAIL_WIDTH = 8;
const RACK_PAD_X = 20;
const RACK_PAD_Y = 40;
const LABEL_HEIGHT = 24;
const DEVICE_INSET = RAIL_WIDTH;
const HALF_WIDTH = (RACK_WIDTH - 2 * DEVICE_INSET) / 2 - 1;
const FULL_WIDTH = RACK_WIDTH - 2 * DEVICE_INSET;
const SIDE_VIEW_WIDTH = 120;

type ViewFace = "front" | "rear";
type ViewMode = "front" | "rear" | "side";

function uToY(uPosition: number, rackHeightU: number): number {
  return (rackHeightU - uPosition) * PX_PER_U;
}

// ── SVG defs ───────────────────────────────────────────────────────

function OccupancyPattern() {
  return (
    <defs>
      <pattern id="occupancy-stripes" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(0,0,0,0.08)" strokeWidth={2} />
      </pattern>
    </defs>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function RackFrame({ rack, faceLabel, viewFace = "front" }: { rack: RackData; faceLabel?: string; viewFace?: "front" | "rear" }) {
  const totalH = rack.heightU * PX_PER_U;
  const is2Post = rack.rackType === "open-2post";
  const isOpen = is2Post || rack.rackType === "open-4post";
  /** 2-post rear has no rails, no holes, no mounting — just an empty frame */
  const showRails = !(is2Post && viewFace === "rear");

  return (
    <g>
      {/* Frame background */}
      <rect
        x={0} y={0} width={RACK_WIDTH} height={totalH}
        fill={isOpen ? "rgba(245,245,245,0.4)" : "#f5f5f5"}
        stroke="#333"
        strokeWidth={isOpen ? 1 : 1.5}
        strokeDasharray={isOpen ? "4 2" : undefined}
        rx={2}
      />

      {/* Main rails */}
      <rect x={0} y={0} width={RAIL_WIDTH} height={totalH} fill="#d4d4d4" stroke="#999" strokeWidth={0.5} />
      <rect x={RACK_WIDTH - RAIL_WIDTH} y={0} width={RAIL_WIDTH} height={totalH} fill="#d4d4d4" stroke="#999" strokeWidth={0.5} />

      {/* Inner pseudo-rails and mounting holes — hidden on 2-post rear */}
      {showRails && (
        <>
          <rect x={RAIL_WIDTH + 1} y={0} width={3} height={totalH} fill="#e0e0e0" stroke="#ccc" strokeWidth={0.25} />
          <rect x={RACK_WIDTH - RAIL_WIDTH - 4} y={0} width={3} height={totalH} fill="#e0e0e0" stroke="#ccc" strokeWidth={0.25} />
        </>
      )}

      {/* U lines, ruler numbers, and mounting holes */}
      {Array.from({ length: rack.heightU }, (_, i) => {
        const uNum = rack.heightU - i;
        const y = i * PX_PER_U;
        return (
          <g key={uNum}>
            <line x1={0} y1={y} x2={RACK_WIDTH} y2={y} stroke="#ddd" strokeWidth={0.5} />
            <text x={-RULER_WIDTH / 2 - 2} y={y + PX_PER_U / 2} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#999">{uNum}</text>

            {showRails && [1/6, 3/6, 5/6].map((frac, hi) => {
              const cy = y + PX_PER_U * frac;
              return (
                <g key={hi}>
                  <circle cx={RAIL_WIDTH + 2.5} cy={cy} r={1.2} fill="#999" />
                  <circle cx={RACK_WIDTH - RAIL_WIDTH - 2.5} cy={cy} r={1.2} fill="#999" />
                </g>
              );
            })}
          </g>
        );
      })}

      {faceLabel && (
        <text x={RACK_WIDTH / 2} y={totalH + 14} textAnchor="middle" fontSize={9} fill="#999" fontWeight={500} fontStyle="italic">{faceLabel}</text>
      )}
    </g>
  );
}

function RackLabel({ rack, width = RACK_WIDTH, onRename }: { rack: RackData; width?: number; onRename?: (rackId: string, label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rack.label);
  const inputRef = useRef<HTMLInputElement>(null);

  if (editing) {
    return (
      <foreignObject x={0} y={-22} width={width} height={20}>
        <input
          ref={inputRef}
          className="w-full bg-white border border-blue-400 rounded px-1 text-xs text-center outline-none"
          style={{ fontSize: 12, fontWeight: 600, height: 20 }}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim() && onRename) onRename(rack.id, value.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { if (value.trim() && onRename) onRename(rack.id, value.trim()); setEditing(false); }
            if (e.key === "Escape") { setValue(rack.label); setEditing(false); }
          }}
        />
      </foreignObject>
    );
  }

  return (
    <text
      x={width / 2} y={-8} textAnchor="middle" fontSize={12} fontWeight={600} fill="#333"
      className="cursor-pointer"
      onDoubleClick={() => { setValue(rack.label); setEditing(true); }}
    >
      {rack.label}
    </text>
  );
}

interface DeviceBlockProps {
  placement: RackDevicePlacement;
  rack: RackData;
  deviceData: DeviceData;
  isSelected: boolean;
  isDragging: boolean;
  zoom: number;
  onSelect: (id: string) => void;
  onDragStart: (placementId: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, placement: RackDevicePlacement) => void;
}

function DeviceBlock({ placement, rack, deviceData, isSelected, isDragging, zoom, onSelect, onDragStart, onContextMenu }: DeviceBlockProps) {
  const label = deviceData.label;
  const heightU = inferRackHeightU(deviceData);
  const color = deviceData.headerColor ?? deviceData.color;
  const y = uToY(placement.uPosition + heightU - 1, rack.heightU);
  const h = heightU * PX_PER_U - 1;
  const isHalf = !!placement.halfRackSide;
  const w = isHalf ? HALF_WIDTH : FULL_WIDTH;
  const x = DEVICE_INSET + (isHalf && placement.halfRackSide === "right" ? HALF_WIDTH + 2 : 0);

  // Connector rendering — need enough vertical space for label + icons
  // 1U (23px) = label only, no connectors. 2U+ = connectors fit.
  const labelHeight = 14;
  const availableHeight = h - labelHeight;
  const showConnectors = zoom >= 0.8 && availableHeight >= 16;

  // Connector detail level based on zoom
  // 0 = dots, 1 = silhouettes, 2 = detailed with pins
  const connectorDetail = zoom < 1.2 ? 0 : zoom < 2 ? 1 : 2;
  // Show port labels once silhouettes are visible and there's enough space
  const showPortLabels = connectorDetail >= 1 && availableHeight >= 30;

  // Layout ports — use custom face-plate positions if available, otherwise auto-layout
  const layoutPorts = useMemo(() => {
    if (!showConnectors) return [];
    const auto = autoLayoutPorts(deviceData.ports ?? [], w, h);
    const custom = deviceData.facePlateLayout?.positions;
    if (!custom) return auto;
    return auto.map((lp) => {
      const pos = custom[lp.id];
      return pos ? { ...lp, x: pos.x, y: pos.y } : lp;
    });
  }, [showConnectors, deviceData.ports, w, h, deviceData.facePlateLayout]);

  return (
    <g
      className="cursor-grab"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onClick={(e) => { e.stopPropagation(); onSelect(placement.id); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, placement); }}
      onMouseDown={(e) => {
        if (e.button === 0 && !e.altKey) {
          e.stopPropagation();
          onDragStart(placement.id, e);
        }
      }}
    >
      {/* Clip path to prevent connector overflow */}
      <clipPath id={`dev-clip-${placement.id}`}>
        <rect x={x} y={y} width={w} height={h} rx={1} />
      </clipPath>
      <rect x={x} y={y} width={w} height={h} fill={color ?? "#4a90d9"} stroke={isSelected ? "#2563eb" : "#333"} strokeWidth={isSelected ? 2 : 0.75} rx={1} />

      <g clipPath={`url(#dev-clip-${placement.id})`}>
      {/* Device label — custom position from face-plate layout, or default */}
      {(() => {
        const dl = deviceData.facePlateLayout?.deviceLabel;
        const defaultY = showConnectors && layoutPorts.length > 0 ? y + 6 : y + h / 2;
        const defaultBaseline = showConnectors && layoutPorts.length > 0 ? "hanging" : "central";
        const labelX = dl ? x + (dl.x / 100) * w : x + w / 2;
        const labelY = dl ? y + (dl.y / 100) * h : defaultY;
        const labelFontSize = dl?.fontSize ? Math.max(4, dl.fontSize * (h / 140)) : (h > 20 ? 9 : 7);
        return (
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline={dl ? "central" : defaultBaseline}
            fontSize={labelFontSize}
            fill="#fff"
            fontWeight={600}
            style={{ pointerEvents: "none" }}
          >
            {label.length > (isHalf ? 12 : 28) ? label.slice(0, isHalf ? 11 : 27) + "…" : label}
          </text>
        );
      })()}

      {/* U height indicator */}
      {heightU > 1 && !showConnectors && (
        <text x={x + w - 4} y={y + 8} textAnchor="end" fontSize={7} fill="rgba(255,255,255,0.7)" style={{ pointerEvents: "none" }}>{heightU}U</text>
      )}

      {/* Connector icons */}
      {showConnectors && layoutPorts.map((lp) => {
        const cx = x + (lp.x / 100) * w;
        const cy = y + (lp.y / 100) * h;
        const sigColor = SIGNAL_COLORS[lp.signalType as keyof typeof SIGNAL_COLORS] ?? "#fff";
        return (
          <g key={lp.id} style={{ pointerEvents: "none" }}>
            <ConnectorIcon
              x={cx}
              y={cy}
              connectorType={lp.connectorType}
              scale={PX_PER_MM}
              color={sigColor}
              detail={connectorDetail}
            />
            {/* Port label at high zoom with enough space */}
            {showPortLabels && (
              <text
                x={cx}
                y={cy + (getConnectorSpec(lp.connectorType).heightMm * PX_PER_MM) / 2 + 3}
                textAnchor="middle"
                fontSize={4}
                fill="rgba(255,255,255,0.8)"
              >
                {lp.label.length > 8 ? lp.label.slice(0, 7) + "…" : lp.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Face-plate section labels (from custom layout) */}
      {showConnectors && deviceData.facePlateLayout?.labels?.map((lbl) => {
        const lx = x + (lbl.x / 100) * w;
        const ly = y + (lbl.y / 100) * h;
        return (
          <text
            key={lbl.id}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={3.5}
            fontWeight={700}
            fill="rgba(255,255,255,0.6)"
            letterSpacing={0.5}
            style={{ pointerEvents: "none", textTransform: "uppercase" }}
          >
            {lbl.text}
          </text>
        );
      })}
      </g>{/* end clip group */}
    </g>
  );
}

function OccupancyGhost({ placement, rack, heightU }: { placement: RackDevicePlacement; rack: RackData; heightU: number }) {
  const y = uToY(placement.uPosition + heightU - 1, rack.heightU);
  const h = heightU * PX_PER_U - 1;
  const isHalf = !!placement.halfRackSide;
  const w = isHalf ? HALF_WIDTH : FULL_WIDTH;
  const x = DEVICE_INSET + (isHalf && placement.halfRackSide === "right" ? HALF_WIDTH + 2 : 0);
  return <rect x={x} y={y} width={w} height={h} fill="url(#occupancy-stripes)" stroke="#bbb" strokeWidth={0.5} strokeDasharray="3 2" rx={1} />;
}

function AccessoryBlock({ accessory, rack }: { accessory: RackAccessory; rack: RackData }) {
  const y = uToY(accessory.uPosition + accessory.heightU - 1, rack.heightU);
  const h = accessory.heightU * PX_PER_U - 1;
  const fills: Record<string, string> = {
    "blank-panel": "#888", "vent-panel": "#aaa", "shelf": "#a0855b",
    "drawer": "#8a7a5a", "cable-manager": "#666", "fan-unit": "#556b7a",
  };
  return (
    <g>
      <rect x={DEVICE_INSET} y={y} width={FULL_WIDTH} height={h} fill={fills[accessory.type] ?? "#888"} stroke="#555" strokeWidth={0.5} rx={1} />
      {accessory.type === "vent-panel" && Array.from({ length: Math.max(1, Math.floor(h / 6)) }, (_, i) => (
        <line key={i} x1={DEVICE_INSET + 8} y1={y + 3 + i * 6} x2={DEVICE_INSET + FULL_WIDTH - 8} y2={y + 3 + i * 6} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      ))}
      <text x={DEVICE_INSET + FULL_WIDTH / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="rgba(255,255,255,0.8)" style={{ pointerEvents: "none" }}>
        {accessory.label ?? RACK_ACCESSORY_LABELS[accessory.type]}
      </text>
    </g>
  );
}

function DropIndicator({ rack, uPosition, heightU, halfRackSide, valid }: { rack: RackData; uPosition: number; heightU: number; halfRackSide?: "left" | "right"; valid: boolean }) {
  const y = uToY(uPosition + heightU - 1, rack.heightU);
  const h = heightU * PX_PER_U - 1;
  const isHalf = !!halfRackSide;
  const w = isHalf ? HALF_WIDTH : FULL_WIDTH;
  const x = DEVICE_INSET + (isHalf && halfRackSide === "right" ? HALF_WIDTH + 2 : 0);
  return <rect x={x} y={y} width={w} height={h} fill={valid ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)"} stroke={valid ? "#3b82f6" : "#ef4444"} strokeWidth={1.5} strokeDasharray="4 2" rx={1} style={{ pointerEvents: "none" }} />;
}

/** Floating ghost that follows the cursor when dragging an existing placement */
function DragGhost({ x, y, width, height, label, color }: { x: number; y: number; width: number; height: number; label: string; color: string }) {
  return (
    <g style={{ pointerEvents: "none" }} opacity={0.7}>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#2563eb" strokeWidth={1.5} rx={1} />
      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fontSize={height > 20 ? 10 : 8} fill="#fff" fontWeight={500}>{label}</text>
    </g>
  );
}

// ── Side view ──────────────────────────────────────────────────────

function SideViewRack({ rack, placements, deviceDataMap }: { rack: RackData; placements: RackDevicePlacement[]; deviceDataMap: Map<string, DeviceData> }) {
  const totalH = rack.heightU * PX_PER_U;
  const is2Post = rack.rackType === "open-2post";
  const isOpen = is2Post || rack.rackType === "open-4post";
  const depthScale = SIDE_VIEW_WIDTH / rack.depthMm;

  return (
    <g>
      {/* Frame outline */}
      <rect
        x={0} y={0} width={SIDE_VIEW_WIDTH} height={totalH}
        fill={isOpen ? "rgba(250,250,250,0.4)" : "#fafafa"}
        stroke="#333" strokeWidth={1}
        strokeDasharray={isOpen ? "4 2" : undefined}
        rx={1}
      />

      {/* U lines */}
      {Array.from({ length: rack.heightU }, (_, i) => <line key={i} x1={0} y1={i * PX_PER_U} x2={SIDE_VIEW_WIDTH} y2={i * PX_PER_U} stroke="#eee" strokeWidth={0.5} />)}

      {/* Front rail — always present */}
      <line x1={4} y1={0} x2={4} y2={totalH} stroke="#aaa" strokeWidth={1} strokeDasharray="2 2" />
      <text x={4} y={-3} textAnchor="middle" fontSize={7} fill="#aaa">F</text>

      {/* Rear rail — 4-post only */}
      {!is2Post && (
        <>
          <line x1={SIDE_VIEW_WIDTH - 4} y1={0} x2={SIDE_VIEW_WIDTH - 4} y2={totalH} stroke="#aaa" strokeWidth={1} strokeDasharray="2 2" />
          <text x={SIDE_VIEW_WIDTH - 4} y={-3} textAnchor="middle" fontSize={7} fill="#aaa">R</text>
        </>
      )}

      {/* Devices */}
      {placements.map((pl) => {
        const dd = deviceDataMap.get(pl.deviceNodeId);
        if (!dd) return null;
        const heightU = inferRackHeightU(dd);
        const y = uToY(pl.uPosition + heightU - 1, rack.heightU);
        const h = heightU * PX_PER_U - 1;
        const deviceDepth = (dd.rackDepthMm ?? rack.depthMm * 0.6) * depthScale;
        // 2-post: everything hangs from the front post
        const x = (is2Post || pl.face === "front") ? 4 : SIDE_VIEW_WIDTH - 4 - deviceDepth;
        return (
          <g key={pl.id}>
            <rect x={x} y={y} width={deviceDepth} height={h} fill={dd.headerColor ?? dd.color ?? "#4a90d9"} stroke="#333" strokeWidth={0.5} rx={1} opacity={0.7} />
            <text x={x + deviceDepth / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#fff" style={{ pointerEvents: "none" }}>
              {dd.label.length > 8 ? dd.label.slice(0, 7) + "…" : dd.label}
            </text>
          </g>
        );
      })}

      <text x={SIDE_VIEW_WIDTH / 2} y={totalH + 14} textAnchor="middle" fontSize={9} fill="#999" fontWeight={500} fontStyle="italic">Side</text>
    </g>
  );
}

// ── View toggle ────────────────────────────────────────────────────

function ViewToggle({ viewMode, onChangeView }: { viewMode: ViewMode; onChangeView: (mode: ViewMode) => void }) {
  const btn = (mode: ViewMode, label: string) => (
    <button
      className={`px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === mode ? "bg-blue-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}
      onClick={() => onChangeView(mode)}
    >{label}</button>
  );
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex rounded-md overflow-hidden border border-neutral-300 shadow-sm" data-print-hide>
      {btn("front", "Front")}
      {btn("rear", "Rear")}
      {btn("side", "Side")}
    </div>
  );
}

// ── Drag state for in-rack movement ────────────────────────────────

interface InRackDrag {
  placementId: string;
  deviceNodeId: string;
  heightU: number;
  label: string;
  color: string;
  /** Canvas-space cursor position */
  cx: number;
  cy: number;
}

// ── Helper: hit-test which rack + U position a canvas point is over ─

function hitTestRack(
  page: SchematicPage,
  cx: number,
  cy: number,
): { rack: RackData; uPosition: number } | null {
  for (const rack of page.racks) {
    const rx = rack.position.x + RACK_PAD_X + RULER_WIDTH;
    const ry = rack.position.y + RACK_PAD_Y + LABEL_HEIGHT;
    const totalH = rack.heightU * PX_PER_U;
    if (cx >= rx && cx <= rx + RACK_WIDTH && cy >= ry && cy <= ry + totalH) {
      const relY = cy - ry;
      const uFromTop = Math.floor(relY / PX_PER_U);
      const uPosition = rack.heightU - uFromTop;
      return { rack, uPosition };
    }
  }
  return null;
}

// ── Main RackRenderer ──────────────────────────────────────────────

export default function RackRenderer({ page }: { page: SchematicPage }) {
  const nodes = useSchematicStore((s) => s.nodes);
  const addRackPlacement = useSchematicStore((s) => s.addRackPlacement);
  const removeRackPlacement = useSchematicStore((s) => s.removeRackPlacement);
  const updateRackPlacement = useSchematicStore((s) => s.updateRackPlacement);
  const updateRack = useSchematicStore((s) => s.updateRack);
  const isRackSlotAvailable = useSchematicStore((s) => s.isRackSlotAvailable);
  const addToast = useSchematicStore((s) => s.addToast);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);

  // Device context menu in rack view
  const [rackContextMenu, setRackContextMenu] = useState<{
    screenX: number; screenY: number; placement: RackDevicePlacement; deviceData: DeviceData;
  } | null>(null);
  // Face-plate editor
  const [facePlateTarget, setFacePlateTarget] = useState<{
    nodeId: string; deviceData: DeviceData;
  } | null>(null);

  const handleRenameRack = useCallback((rackId: string, label: string) => {
    updateRack(page.id, rackId, { label });
  }, [page.id, updateRack]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewOffset, setViewOffset] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("front");

  // Sidebar drag-and-drop (new placements from unracked list)
  const [dropTarget, setDropTarget] = useState<{
    rackId: string; uPosition: number; heightU: number; halfRackSide?: "left" | "right"; valid: boolean;
  } | null>(null);

  // In-rack drag (moving existing placements)
  const [inRackDrag, setInRackDrag] = useState<InRackDrag | null>(null);
  const pendingDragRef = useRef<{ placementId: string; startX: number; startY: number } | null>(null);

  const deviceDataMap = useMemo(() => {
    const map = new Map<string, DeviceData>();
    for (const n of nodes) {
      if (n.type === "device") map.set(n.id, n.data as DeviceData);
    }
    return map;
  }, [nodes]);

  const handleDeviceContextMenu = useCallback((e: React.MouseEvent, placement: RackDevicePlacement) => {
    const dd = deviceDataMap.get(placement.deviceNodeId);
    if (!dd) return;
    setRackContextMenu({ screenX: e.clientX, screenY: e.clientY, placement, deviceData: dd });
  }, [deviceDataMap]);

  const activeFace: ViewFace = viewMode === "rear" ? "rear" : "front";

  /** True when the current view doesn't allow placement (side view, or 2-post rear) */
  const isPlacementBlocked = viewMode === "side" || (viewMode === "rear" && page.racks.every((r) => r.rackType === "open-2post"));

  /** Check if a specific rack blocks rear placement */
  const isRackRearBlocked = useCallback((rackId: string) => {
    const rack = page.racks.find((r) => r.id === rackId);
    return rack?.rackType === "open-2post" && activeFace === "rear";
  }, [page.racks, activeFace]);

  /** Convert client coords to canvas coords */
  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewOffset.x) / zoom,
      y: (clientY - rect.top - viewOffset.y) / zoom,
    };
  }, [viewOffset, zoom]);

  // ── Pan/zoom ─────────────────────────────────────────────────────

  const scrollConfig = useSchematicStore((s) => s.scrollConfig);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    // Determine which action based on modifier keys (matching schematic behavior)
    const action = (e.ctrlKey || e.metaKey) ? scrollConfig.ctrlScroll
      : e.shiftKey ? scrollConfig.shiftScroll
      : scrollConfig.scroll;

    if (action === "zoom") {
      const speed = scrollConfig.zoomSpeed;
      const delta = e.deltaY > 0 ? 1 - 0.1 * speed : 1 + 0.1 * speed;
      setZoom((z) => Math.min(4, Math.max(0.25, z * delta)));
    } else if (action === "pan-y") {
      const speed = scrollConfig.panSpeed;
      setViewOffset((o) => ({ x: o.x, y: o.y - e.deltaY * speed }));
    } else if (action === "pan-x") {
      const speed = scrollConfig.panSpeed;
      setViewOffset((o) => ({ x: o.x - e.deltaY * speed, y: o.y }));
    }
  }, [scrollConfig]);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (inRackDrag) return; // Don't pan while dragging a device
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, ox: viewOffset.x, oy: viewOffset.y };
    } else if (e.button === 0) {
      setSelectedPlacementId(null);
    }
  }, [viewOffset, inRackDrag]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      setViewOffset({
        x: panStart.current.ox + (e.clientX - panStart.current.x),
        y: panStart.current.oy + (e.clientY - panStart.current.y),
      });
      return;
    }

    // Promote pending drag to real drag after 4px threshold
    if (pendingDragRef.current && !inRackDrag) {
      const dx = e.clientX - pendingDragRef.current.startX;
      const dy = e.clientY - pendingDragRef.current.startY;
      if (dx * dx + dy * dy > 16) { // 4px threshold
        const { placementId } = pendingDragRef.current;
        pendingDragRef.current = null;
        const pl = page.placements.find((p) => p.id === placementId);
        if (pl) {
          const dd = deviceDataMap.get(pl.deviceNodeId);
          if (dd) {
            const c = clientToCanvas(e.clientX, e.clientY);
            setInRackDrag({
              placementId,
              deviceNodeId: pl.deviceNodeId,
              heightU: inferRackHeightU(dd),
              label: dd.label,
              color: dd.headerColor ?? dd.color ?? "#4a90d9",
              cx: c.x,
              cy: c.y,
            });
          }
        }
      }
      return;
    }

    if (inRackDrag) {
      const c = clientToCanvas(e.clientX, e.clientY);
      setInRackDrag((d) => d ? { ...d, cx: c.x, cy: c.y } : null);

      // Update drop target
      const hit = hitTestRack(page, c.x, c.y);
      if (hit) {
        if (isRackRearBlocked(hit.rack.id)) {
          const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - inRackDrag.heightU + 1));
          setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU: inRackDrag.heightU, valid: false });
        } else {
          const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - inRackDrag.heightU + 1));
          const valid = isRackSlotAvailable(page.id, hit.rack.id, clampedU, inRackDrag.heightU, activeFace, undefined, inRackDrag.placementId);
          setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU: inRackDrag.heightU, valid });
        }
      } else {
        setDropTarget(null);
      }
    }
  }, [isPanning, inRackDrag, clientToCanvas, page, isRackSlotAvailable, activeFace, isRackRearBlocked, deviceDataMap]);

  const onMouseUp = useCallback((e: MouseEvent) => {
    setIsPanning(false);
    pendingDragRef.current = null;

    if (inRackDrag) {
      const c = clientToCanvas(e.clientX, e.clientY);
      const hit = hitTestRack(page, c.x, c.y);

      if (hit && dropTarget?.valid) {
        // Move to new position
        const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - inRackDrag.heightU + 1));
        if (dropTarget.rackId === page.placements.find((p) => p.id === inRackDrag.placementId)?.rackId) {
          // Same rack — update position
          updateRackPlacement(page.id, inRackDrag.placementId, { uPosition: clampedU, rackId: dropTarget.rackId });
        } else {
          // Different rack — remove and re-add
          removeRackPlacement(page.id, inRackDrag.placementId);
          addRackPlacement(page.id, {
            rackId: dropTarget.rackId,
            deviceNodeId: inRackDrag.deviceNodeId,
            uPosition: clampedU,
            face: activeFace,
          });
        }
      } else if (!hit) {
        // Dropped outside any rack — unrack the device
        const dd = deviceDataMap.get(inRackDrag.deviceNodeId);
        removeRackPlacement(page.id, inRackDrag.placementId);
        addToast(`Removed ${dd?.label ?? "device"} from rack`, "info");
      }
      // else: dropped on invalid position — snap back (do nothing)

      setInRackDrag(null);
      setDropTarget(null);
    }
  }, [inRackDrag, dropTarget, clientToCanvas, page, updateRackPlacement, removeRackPlacement, addRackPlacement, activeFace, deviceDataMap, addToast]);

  // ── In-rack drag start (from DeviceBlock) ────────────────────────

  const onPlacementDragStart = useCallback((placementId: string, e: React.MouseEvent) => {
    if (viewMode === "side" || isPlacementBlocked) return;
    // Don't start drag immediately — wait for mouse movement past threshold
    pendingDragRef.current = { placementId, startX: e.clientX, startY: e.clientY };
    setSelectedPlacementId(placementId);
  }, [viewMode, isPlacementBlocked]);

  // ── Sidebar drag-and-drop (new placements) ───────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (viewMode === "side" || isPlacementBlocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const c = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTestRack(page, c.x, c.y);
    if (hit) {
      if (isRackRearBlocked(hit.rack.id)) {
        const heightU = draggedDeviceHeightU;
        const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - heightU + 1));
        setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU, valid: false });
        return;
      }
      const heightU = draggedDeviceHeightU;
      const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - heightU + 1));
      const valid = isRackSlotAvailable(page.id, hit.rack.id, clampedU, heightU, activeFace, undefined);
      setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU, valid });
    } else {
      setDropTarget(null);
    }
  }, [page, clientToCanvas, isRackSlotAvailable, activeFace, viewMode, isPlacementBlocked, isRackRearBlocked]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const deviceNodeId = e.dataTransfer.getData("application/x-rack-device-id");
    if (!deviceNodeId || !dropTarget || !dropTarget.valid) { setDropTarget(null); return; }
    addRackPlacement(page.id, {
      rackId: dropTarget.rackId, deviceNodeId, uPosition: dropTarget.uPosition, face: activeFace, halfRackSide: dropTarget.halfRackSide,
    });
    setDropTarget(null);
  }, [page.id, dropTarget, addRackPlacement, activeFace]);

  const onDragLeave = useCallback(() => { setDropTarget(null); }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedPlacementId) {
      removeRackPlacement(page.id, selectedPlacementId);
      setSelectedPlacementId(null);
    }
  }, [selectedPlacementId, page.id, removeRackPlacement]);

  // ── Cursor style ─────────────────────────────────────────────────

  const cursor = inRackDrag ? "grabbing" : isPanning ? "grabbing" : "default";

  return (
    <div
      ref={containerRef}
      className="relative flex-1 bg-neutral-200 overflow-hidden outline-none"
      style={{ cursor }}
      tabIndex={0}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={(e) => { onMouseUp(e as unknown as MouseEvent); }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      onKeyDown={onKeyDown}
    >
      <ViewToggle viewMode={viewMode} onChangeView={setViewMode} />

      <svg width="100%" height="100%" style={{ display: "block" }} onClick={() => setRackContextMenu(null)} onContextMenu={() => setRackContextMenu(null)}>
        <OccupancyPattern />
        <g transform={`translate(${viewOffset.x}, ${viewOffset.y}) scale(${zoom})`}>
          {page.racks.map((rack) => {
            const ox = rack.position.x + RACK_PAD_X + RULER_WIDTH;
            const oy = rack.position.y + RACK_PAD_Y + LABEL_HEIGHT;
            const activePlacements = page.placements.filter((p) => p.rackId === rack.id && p.face === activeFace);
            const oppositePlacements = page.placements.filter((p) => p.rackId === rack.id && p.face !== activeFace);
            const activeAccessories = page.accessories.filter((a) => a.rackId === rack.id && a.face === activeFace);
            const allPlacements = page.placements.filter((p) => p.rackId === rack.id);

            if (viewMode === "side") {
              return (
                <g key={rack.id} transform={`translate(${ox}, ${oy})`}>
                  <RackLabel rack={rack} width={SIDE_VIEW_WIDTH} onRename={handleRenameRack} />
                  <SideViewRack rack={rack} placements={allPlacements} deviceDataMap={deviceDataMap} />
                </g>
              );
            }

            return (
              <g key={rack.id} transform={`translate(${ox}, ${oy})`}>
                <RackLabel rack={rack} onRename={handleRenameRack} />
                <RackFrame rack={rack} faceLabel={viewMode === "front" ? "Front" : "Rear"} viewFace={activeFace} />
                {oppositePlacements.map((pl) => {
                  const dd = deviceDataMap.get(pl.deviceNodeId);
                  if (!dd) return null;
                  return <OccupancyGhost key={pl.id} placement={pl} rack={rack} heightU={inferRackHeightU(dd)} />;
                })}
                {activeAccessories.map((a) => <AccessoryBlock key={a.id} accessory={a} rack={rack} />)}
                {activePlacements.map((pl) => {
                  const dd = deviceDataMap.get(pl.deviceNodeId);
                  if (!dd) return null;
                  return (
                    <DeviceBlock
                      key={pl.id}
                      placement={pl}
                      rack={rack}
                      deviceData={dd}
                      isSelected={selectedPlacementId === pl.id}
                      isDragging={inRackDrag?.placementId === pl.id}
                      zoom={zoom}
                      onSelect={setSelectedPlacementId}
                      onDragStart={onPlacementDragStart}
                      onContextMenu={handleDeviceContextMenu}
                    />
                  );
                })}
                {dropTarget && dropTarget.rackId === rack.id && (
                  <DropIndicator rack={rack} uPosition={dropTarget.uPosition} heightU={dropTarget.heightU} halfRackSide={dropTarget.halfRackSide} valid={dropTarget.valid} />
                )}
              </g>
            );
          })}

          {page.racks.length === 0 && (
            <text x={200} y={200} fontSize={14} fill="#999" textAnchor="middle">No racks yet. Use the sidebar to add a rack.</text>
          )}

          {/* Floating drag ghost that follows cursor */}
          {inRackDrag && (
            <DragGhost
              x={inRackDrag.cx - FULL_WIDTH / 2}
              y={inRackDrag.cy - (inRackDrag.heightU * PX_PER_U) / 2}
              width={FULL_WIDTH}
              height={inRackDrag.heightU * PX_PER_U - 1}
              label={inRackDrag.label}
              color={inRackDrag.color}
            />
          )}
        </g>
      </svg>

      {/* Status indicator while dragging */}
      {inRackDrag && !dropTarget && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-700 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          Drop here to remove from rack
        </div>
      )}
      {inRackDrag && dropTarget && !dropTarget.valid && dropTarget.rackId && isRackRearBlocked(dropTarget.rackId) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          2-post racks have no rear mounting
        </div>
      )}

      {/* Device context menu */}
      {rackContextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 text-xs min-w-[160px]"
          style={{ left: rackContextMenu.screenX, top: rackContextMenu.screenY }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
            onClick={() => {
              setFacePlateTarget({ nodeId: rackContextMenu.placement.deviceNodeId, deviceData: rackContextMenu.deviceData });
              setRackContextMenu(null);
            }}
          >
            Edit Face-Plate Layout
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
            onClick={() => {
              setEditingNodeId(rackContextMenu.placement.deviceNodeId);
              setRackContextMenu(null);
            }}
          >
            Edit Device
          </button>
          <div className="border-t border-neutral-100 my-0.5" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 text-red-600"
            onClick={() => {
              removeRackPlacement(page.id, rackContextMenu.placement.id);
              setRackContextMenu(null);
            }}
          >
            Remove from Rack
          </button>
        </div>
      )}

      {/* Face-plate editor modal */}
      {facePlateTarget && (
        <FacePlateEditor
          deviceData={facePlateTarget.deviceData}
          onSave={(layout: FacePlateLayout) => {
            patchDeviceData(facePlateTarget.nodeId, { facePlateLayout: layout });
            setFacePlateTarget(null);
          }}
          onClose={() => setFacePlateTarget(null)}
        />
      )}
    </div>
  );
}
