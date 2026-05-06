import { useCallback, useMemo, useRef, useState, type WheelEvent, type MouseEvent } from "react";
import { useSchematicStore } from "../store";
import type { RackData, RackDevicePlacement, RackAccessory, RackDepthConflict, DeviceData, RackElevationPage } from "../types";
import { RACK_ACCESSORY_LABELS, RACK_TYPE_LABELS } from "../types";
import {
  inferRackHeightU,
  inferRackForm,
  autoLayoutPorts,
  PX_PER_MM,
  getRackDepthConflicts,
  countUnknownDepthDevices,
  getOversizedDevices,
  shelfDepthMm,
  shelfInnerWidthMm,
  getShelfOccupants,
  canFitOnShelf,
  isShelfOffsetValid,
  gravitySnapShelfY,
  computeShelfSnaps,
} from "../rackUtils";
import type { ShelfSnapGuides } from "../rackUtils";
import { computeRackStats, formatStatsLine } from "../rackStats";
import { SIGNAL_COLORS } from "../types";
import { ConnectorIcon, getConnectorSpec } from "./connectorIcons";
import { draggedDeviceHeightU, draggedDeviceNodeId } from "./RackSidebar";
import FacePlateEditor from "./FacePlateEditor";
import type { FacePlateLayout } from "../types";
import { getDevicesInRoom, proposeRackPlacements } from "../rackLink";

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
/** Side-view width in pixels for a given rack — true-scale: depth axis uses the
 *  same px-per-mm as the height axis, so 1U-tall and 1mm-deep render at matching
 *  pixel ratios. Floor a little so very shallow desktops still have room to draw. */
function sideViewWidthPx(rack: RackData): number {
  return Math.max(80, rack.depthMm * PX_PER_MM);
}

type ViewFace = "front" | "rear";
type ViewMode = "front" | "rear" | "side";

function uToY(uPosition: number, rackHeightU: number): number {
  return (rackHeightU - uPosition) * PX_PER_U;
}

/** Word-wrap text into at most maxLines lines, each no longer than maxChars. Last line gets "…" if truncated. */
function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  if (maxChars < 2) return [text.slice(0, 1) + "…"];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = cur ? cur + " " + word : word;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === 0) lines.push(text.slice(0, maxChars - 1) + "…");
  return lines;
}

/** Canvas origin (left edge of inner shelf area) and shelf surface y for a given shelf. */
function shelfCanvasCoords(rack: RackData, shelf: RackAccessory, maxHeightU = 0) {
  const rackOriginX = rack.position.x + RACK_PAD_X + RULER_WIDTH;
  const rackOriginY = rack.position.y + RACK_PAD_Y + LABEL_HEIGHT + (maxHeightU - rack.heightU) * PX_PER_U;
  const shelfTopY = uToY(shelf.uPosition + shelf.heightU - 1, rack.heightU);
  const shelfH = shelf.heightU * PX_PER_U - 1;
  return {
    originX: rackOriginX + DEVICE_INSET,
    topCanvasY: rackOriginY + shelfTopY,
    surfaceCanvasY: rackOriginY + shelfTopY + shelfH - 0.5,
    height: shelfH,
  };
}

/** Find the shelf (and its rack) that contains canvas point (cx, cy) on the given face. */
function hitTestShelfCanvas(
  page: RackElevationPage,
  cx: number,
  cy: number,
  viewFace: "front" | "rear",
  maxHeightU = 0,
): { shelf: RackAccessory; rack: RackData } | null {
  for (const rack of page.racks) {
    for (const acc of page.accessories) {
      if (acc.rackId !== rack.id || acc.type !== "shelf" || acc.face !== viewFace) continue;
      const { originX, topCanvasY, height } = shelfCanvasCoords(rack, acc, maxHeightU);
      if (cx >= originX && cx <= originX + FULL_WIDTH &&
          cy >= topCanvasY && cy <= topCanvasY + height) {
        return { shelf: acc, rack };
      }
    }
  }
  return null;
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
  showFacePlateDetail: boolean;
  onSelect: (id: string) => void;
  onDragStart: (placementId: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, placement: RackDevicePlacement) => void;
}

function DeviceBlock({ placement, rack, deviceData, isSelected, isDragging, zoom, showFacePlateDetail, onSelect, onDragStart, onContextMenu }: DeviceBlockProps) {
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
  const showConnectors = showFacePlateDetail && zoom >= 0.8 && availableHeight >= 16;

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
        const showConn = showConnectors && layoutPorts.length > 0;
        const fs = dl?.fontSize ? Math.max(4, dl.fontSize * (h / 140)) : (h > 20 ? 8 : 7);
        const cx = dl ? x + (dl.x / 100) * w : x + w / 2;
        if (dl) {
          const ly = y + (dl.y / 100) * h;
          const maxC = Math.floor(w / (fs * 0.62));
          const lbl = label.length > maxC ? label.slice(0, maxC - 1) + "…" : label;
          return (
            <text x={cx} y={ly} textAnchor="middle" dominantBaseline="central"
              fontSize={fs} fill="#fff" fontWeight={600} style={{ pointerEvents: "none" }}>
              {lbl}
            </text>
          );
        }
        const maxChars = Math.min(isHalf ? 14 : 36, Math.floor(w / (fs * 0.58)));
        const maxLines = showConn ? 1 : Math.max(1, Math.floor(h / (fs * 1.5)));
        const lines = wrapLabel(label, maxChars, Math.min(maxLines, 3));
        const lineH = fs * 1.35;
        const baseY = showConn
          ? y + 5
          : y + h / 2 - ((lines.length - 1) * lineH) / 2;
        return (
          <text x={cx} textAnchor="middle" fontSize={fs} fill="#fff"
            fontWeight={600} style={{ pointerEvents: "none" }}>
            {lines.map((line, i) => (
              <tspan key={i} x={cx} y={baseY + i * lineH}
                dominantBaseline={showConn ? "hanging" : "central"}>
                {line}
              </tspan>
            ))}
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

function AccessoryBlock({
  accessory,
  rack,
  occupants,
  deviceDataMap,
  isDragging,
  onDragStart,
  onOccupantDragStart,
  onOccupantContextMenu,
  draggingOccupantId,
  draggingOccupantPreview,
  crossShelfPreview,
  snapGuides,
}: {
  accessory: RackAccessory;
  rack: RackData;
  occupants: RackDevicePlacement[];
  deviceDataMap: Map<string, DeviceData>;
  isDragging: boolean;
  onDragStart: (accessoryId: string, e: React.MouseEvent) => void;
  onOccupantDragStart: (placementId: string, shelfId: string, e: React.MouseEvent) => void;
  onOccupantContextMenu: (e: React.MouseEvent, placement: RackDevicePlacement) => void;
  /** When set, the indicated occupant is being dragged — render its preview at the
   *  drag's current target offset rather than the stored offset. */
  draggingOccupantId: string | null;
  draggingOccupantPreview: { offsetMm: { x: number; y: number }; valid: boolean } | null;
  /** Incoming device dragged from another shelf — rendered as a preview on this shelf. */
  crossShelfPreview: {
    offsetMm: { x: number; y: number }; valid: boolean;
    wMm: number; hMm: number; rotated: boolean; label: string; color: string;
  } | null;
  snapGuides: ShelfSnapGuides | null;
}) {
  const y = uToY(accessory.uPosition + accessory.heightU - 1, rack.heightU);
  const h = accessory.heightU * PX_PER_U - 1;
  const fills: Record<string, string> = {
    "blank-panel": "#888", "vent-panel": "#aaa", "shelf": "#a0855b",
    "drawer": "#8a7a5a", "cable-manager": "#666", "fan-unit": "#556b7a",
  };
  const isShelf = accessory.type === "shelf" && occupants.length > 0;
  const innerW = shelfInnerWidthMm();

  return (
    <g
      className="cursor-grab"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseDown={(e) => {
        if (e.button === 0 && !e.altKey) {
          e.stopPropagation();
          onDragStart(accessory.id, e);
        }
      }}
    >
      <rect x={DEVICE_INSET} y={y} width={FULL_WIDTH} height={h} fill={fills[accessory.type] ?? "#888"} stroke="#555" strokeWidth={0.5} rx={1} />
      {accessory.type === "vent-panel" && Array.from({ length: Math.max(1, Math.floor(h / 6)) }, (_, i) => (
        <line key={i} x1={DEVICE_INSET + 8} y1={y + 3 + i * 6} x2={DEVICE_INSET + FULL_WIDTH - 8} y2={y + 3 + i * 6} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      ))}
      {!isShelf && (
        <text x={DEVICE_INSET + FULL_WIDTH / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="rgba(255,255,255,0.8)" style={{ pointerEvents: "none" }}>
          {accessory.label ?? RACK_ACCESSORY_LABELS[accessory.type]}
        </text>
      )}
      {/* Shelf occupants — real-mm proportions, free-form positioning via shelfOffsetMm */}
      {isShelf && (() => {
        const surfaceY = y + h - 0.5;  // bottom edge of shelf rect = the surface line
        return occupants.map((p) => {
          const dd = deviceDataMap.get(p.deviceNodeId);
          if (!dd) return null;
          // Effective dims: rotated devices swap width and height
          const wMm = p.rotated ? (dd.heightMm ?? 44.45) : (dd.widthMm ?? innerW);
          const hMm = p.rotated ? (dd.widthMm ?? innerW) : (dd.heightMm ?? 44.45);
          const wPx = wMm * PX_PER_MM;
          const hPx = hMm * PX_PER_MM;
          // Offset: drag preview if currently being dragged, else stored offset
          const isOccDragging = draggingOccupantId === p.id;
          const offset = isOccDragging && draggingOccupantPreview
            ? draggingOccupantPreview.offsetMm
            : (p.shelfOffsetMm ?? { x: 0, y: 0 });
          const xPx = DEVICE_INSET + offset.x * PX_PER_MM;
          const topY = surfaceY - hPx - offset.y * PX_PER_MM;
          const overflowsAbove = hPx + offset.y * PX_PER_MM > h - 1;
          // Rotated labels use hPx as the effective display width (text rotates with the device)
          const effectiveWidthPx = p.rotated ? hPx : wPx;
          const labelTrim = Math.max(4, Math.floor(effectiveWidthPx / 5));
          const lbl = dd.label.length > labelTrim ? dd.label.slice(0, Math.max(1, labelTrim - 1)) + "…" : dd.label;
          const previewInvalid = isOccDragging && draggingOccupantPreview && !draggingOccupantPreview.valid;
          return (
            <g
              key={p.id}
              className="cursor-grab"
              style={{ opacity: isOccDragging ? 0.85 : 1 }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onOccupantContextMenu(e, p); }}
              onMouseDown={(e) => {
                if (e.button === 0 && !e.altKey) {
                  e.stopPropagation();
                  onOccupantDragStart(p.id, accessory.id, e);
                }
              }}
            >
              <rect
                x={xPx}
                y={topY}
                width={wPx}
                height={hPx}
                fill={dd.headerColor ?? dd.color ?? "#4a90d9"}
                stroke={previewInvalid ? "#ef4444" : (overflowsAbove ? "#dc2626" : "#333")}
                strokeWidth={previewInvalid || overflowsAbove ? 1 : 0.5}
                strokeDasharray={previewInvalid || overflowsAbove ? "3 2" : undefined}
                rx={1}
              />
              <text
                x={xPx + wPx / 2}
                y={topY + hPx / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(7, hPx * 0.4)}
                fill="#fff"
                style={{ pointerEvents: "none" }}
                transform={p.rotated ? `rotate(-90 ${xPx + wPx / 2} ${topY + hPx / 2})` : undefined}
              >
                {lbl}
              </text>
            </g>
          );
        });
      })()}

      {/* Cross-shelf preview — incoming device dragged from another shelf */}
      {accessory.type === "shelf" && crossShelfPreview && (() => {
        const surfaceY = y + h - 0.5;
        const { offsetMm, valid, wMm, hMm, rotated, label, color } = crossShelfPreview;
        const wPx = wMm * PX_PER_MM;
        const hPx = hMm * PX_PER_MM;
        const xPx = DEVICE_INSET + offsetMm.x * PX_PER_MM;
        const topY = surfaceY - hPx - offsetMm.y * PX_PER_MM;
        const effectiveWidthPx = rotated ? hPx : wPx;
        const labelTrim = Math.max(4, Math.floor(effectiveWidthPx / 5));
        const lbl = label.length > labelTrim ? label.slice(0, Math.max(1, labelTrim - 1)) + "…" : label;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect
              x={xPx} y={topY} width={wPx} height={hPx}
              fill={color}
              stroke={valid ? "#3b82f6" : "#ef4444"}
              strokeWidth={1}
              strokeDasharray="4 3"
              rx={1}
              opacity={0.75}
            />
            <text
              x={xPx + wPx / 2} y={topY + hPx / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize={Math.min(7, hPx * 0.4)}
              fill="#fff"
              transform={rotated ? `rotate(-90 ${xPx + wPx / 2} ${topY + hPx / 2})` : undefined}
            >{lbl}</text>
          </g>
        );
      })()}

      {/* Snap guide lines — rendered on top of occupants during drag */}
      {accessory.type === "shelf" && snapGuides && (() => {
        const surfaceY = y + h - 0.5;
        return (
          <>
            {snapGuides.xMm !== undefined && (
              <line
                x1={DEVICE_INSET + snapGuides.xMm * PX_PER_MM}
                y1={y}
                x2={DEVICE_INSET + snapGuides.xMm * PX_PER_MM}
                y2={y + h}
                stroke="#3b82f6"
                strokeWidth={0.75}
                strokeDasharray="3 2"
                style={{ pointerEvents: "none" }}
              />
            )}
            {snapGuides.yMm !== undefined && (
              <line
                x1={DEVICE_INSET}
                y1={surfaceY - snapGuides.yMm * PX_PER_MM}
                x2={DEVICE_INSET + FULL_WIDTH}
                y2={surfaceY - snapGuides.yMm * PX_PER_MM}
                stroke="#3b82f6"
                strokeWidth={0.75}
                strokeDasharray="3 2"
                style={{ pointerEvents: "none" }}
              />
            )}
          </>
        );
      })()}
    </g>
  );
}

function DropIndicator({ rack, uPosition, heightU, halfRackSide, valid, mode }: { rack: RackData; uPosition: number; heightU: number; halfRackSide?: "left" | "right"; valid: boolean; mode?: "direct" | "shelf-only" | "oversize" }) {
  const y = uToY(uPosition + heightU - 1, rack.heightU);
  const h = heightU * PX_PER_U - 1;
  const isHalf = !!halfRackSide;
  const w = isHalf ? HALF_WIDTH : FULL_WIDTH;
  const x = DEVICE_INSET + (isHalf && halfRackSide === "right" ? HALF_WIDTH + 2 : 0);
  const stroke = valid ? "#3b82f6" : "#ef4444";
  const fill = valid ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)";
  if (mode === "shelf-only") {
    // Render as an auto-shelf preview: a slim shelf bar across the bottom of the U,
    // hatched to communicate "a shelf will be added here".
    const shelfBarH = Math.min(6, h);
    const shelfY = y + h - shelfBarH;
    return (
      <g style={{ pointerEvents: "none" }}>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1.5} strokeDasharray="4 2" rx={1} />
        <rect x={x} y={shelfY} width={w} height={shelfBarH} fill={valid ? "rgba(59,130,246,0.55)" : "rgba(239,68,68,0.55)"} stroke="none" />
      </g>
    );
  }
  return <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1.5} strokeDasharray="4 2" rx={1} style={{ pointerEvents: "none" }} />;
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

function SideViewRack({
  rack,
  placements,
  accessories,
  deviceDataMap,
  conflicts,
  selectedPlacementId,
  draggingPlacementId,
  dropTarget,
  onSelect,
  onDragStart,
  onContextMenu,
}: {
  rack: RackData;
  placements: RackDevicePlacement[];
  accessories: RackAccessory[];
  deviceDataMap: Map<string, DeviceData>;
  conflicts: RackDepthConflict[];
  selectedPlacementId: string | null;
  draggingPlacementId: string | null;
  dropTarget: { rackId: string; uPosition: number; heightU: number; valid: boolean; face?: "front" | "rear" } | null;
  onSelect: (id: string) => void;
  onDragStart: (placementId: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, placement: RackDevicePlacement) => void;
}) {
  const totalH = rack.heightU * PX_PER_U;
  const is2Post = rack.rackType === "open-2post";
  const isOpen = is2Post || rack.rackType === "open-4post";
  // True-scale depth — matches front-view px-per-mm so geometry isn't squished.
  const SIDE_VIEW_WIDTH = sideViewWidthPx(rack);
  const depthScale = PX_PER_MM;

  // Index placements by id for conflict overlay lookup
  const byId = new Map(placements.map((p) => [p.id, p]));

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

      {/* Shelf accessories — drawn first so device blocks paint on top */}
      {accessories.filter((a) => a.type === "shelf").map((a) => {
        const ay = uToY(a.uPosition + a.heightU - 1, rack.heightU);
        const ah = a.heightU * PX_PER_U - 1;
        const sd = shelfDepthMm(a, rack) * depthScale;
        const ax = (is2Post || a.face === "front") ? 4 : SIDE_VIEW_WIDTH - 4 - sd;
        return <rect key={a.id} x={ax} y={ay + ah - 2} width={sd} height={2} fill="#a0855b" stroke="#7a6240" strokeWidth={0.5} />;
      })}

      {/* Devices */}
      {placements.map((pl) => {
        const dd = deviceDataMap.get(pl.deviceNodeId);
        if (!dd) return null;
        const heightU = inferRackHeightU(dd);
        const isSelected = selectedPlacementId === pl.id;
        const isDragging = draggingPlacementId === pl.id;
        // Shelf-mounted: real-mm height, sitting on the shelf surface line (+ stack offset y)
        if (pl.mountedOnShelfId) {
          const shelf = accessories.find((a) => a.id === pl.mountedOnShelfId);
          if (!shelf) return null;
          const ay = uToY(shelf.uPosition + shelf.heightU - 1, rack.heightU);
          const ah = shelf.heightU * PX_PER_U - 1;
          // Rotation swaps width <-> height. Depth axis is unchanged.
          const dDepth = (dd.depthMm ?? shelfDepthMm(shelf, rack)) * depthScale;
          const hMm = pl.rotated ? (dd.widthMm ?? 44.45) : (dd.heightMm ?? 44.45);
          const dh = hMm * PX_PER_MM;
          const stackYMm = pl.shelfOffsetMm?.y ?? 0;
          const surfaceY = ay + ah - 0.5;
          const dy = surfaceY - dh - stackYMm * PX_PER_MM;
          const dx = (is2Post || shelf.face === "front") ? 4 : SIDE_VIEW_WIDTH - 4 - dDepth;
          const overflowsAbove = dh + stackYMm * PX_PER_MM > ah - 1;
          return (
            <g key={pl.id} style={{ opacity: isDragging ? 0.3 : 1 }}>
              <rect
                x={dx}
                y={dy}
                width={dDepth}
                height={dh}
                fill={dd.headerColor ?? dd.color ?? "#4a90d9"}
                stroke={overflowsAbove ? "#dc2626" : "#333"}
                strokeWidth={overflowsAbove ? 1 : 0.5}
                strokeDasharray={overflowsAbove ? "3 2" : undefined}
                rx={1}
                opacity={0.85}
              />
            </g>
          );
        }
        const y = uToY(pl.uPosition + heightU - 1, rack.heightU);
        const h = heightU * PX_PER_U - 1;
        const deviceDepth = (dd.depthMm ?? rack.depthMm * 0.6) * depthScale;
        // 2-post: everything hangs from the front post
        const x = (is2Post || pl.face === "front") ? 4 : SIDE_VIEW_WIDTH - 4 - deviceDepth;
        return (
          <g
            key={pl.id}
            className="cursor-grab"
            style={{ opacity: isDragging ? 0.3 : 1 }}
            onClick={(e) => { e.stopPropagation(); onSelect(pl.id); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, pl); }}
            onMouseDown={(e) => {
              if (e.button === 0 && !e.altKey) {
                e.stopPropagation();
                onDragStart(pl.id, e);
              }
            }}
          >
            <rect x={x} y={y} width={deviceDepth} height={h} fill={dd.headerColor ?? dd.color ?? "#4a90d9"} stroke={isSelected ? "#2563eb" : "#333"} strokeWidth={isSelected ? 1.5 : 0.5} rx={1} opacity={0.85} />
            <text x={x + deviceDepth / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#fff" style={{ pointerEvents: "none" }}>
              {dd.label.length > 8 ? dd.label.slice(0, 7) + "…" : dd.label}
            </text>
          </g>
        );
      })}

      {/* Side-view drop indicator: horizontal band at target U, on the target face */}
      {dropTarget && dropTarget.rackId === rack.id && (() => {
        const y = uToY(dropTarget.uPosition + dropTarget.heightU - 1, rack.heightU);
        const h = dropTarget.heightU * PX_PER_U - 1;
        // 2-post: full width. Otherwise: front half or rear half based on dropTarget.face.
        let bandX = 0;
        let bandW = SIDE_VIEW_WIDTH;
        if (!is2Post && dropTarget.face) {
          if (dropTarget.face === "front") {
            bandX = 0;
            bandW = SIDE_VIEW_WIDTH / 2;
          } else {
            bandX = SIDE_VIEW_WIDTH / 2;
            bandW = SIDE_VIEW_WIDTH / 2;
          }
        }
        return (
          <rect
            x={bandX} y={y} width={bandW} height={h}
            fill={dropTarget.valid ? "rgba(59,130,246,0.18)" : "rgba(239,68,68,0.18)"}
            stroke={dropTarget.valid ? "#3b82f6" : "#ef4444"}
            strokeWidth={1.2}
            strokeDasharray="4 2"
            rx={1}
            style={{ pointerEvents: "none" }}
          />
        );
      })()}

      {/* Depth conflicts — translucent red rect across the U overlap × overhang span */}
      {conflicts.map((c, i) => {
        const a = byId.get(c.aId);
        const b = byId.get(c.bId);
        if (!a || !b) return null;
        const ad = deviceDataMap.get(a.deviceNodeId);
        const bd = deviceDataMap.get(b.deviceNodeId);
        if (!ad || !bd || ad.depthMm == null || bd.depthMm == null) return null;
        // Y-band over the U overlap range
        const yTop = uToY(c.uOverlapEnd, rack.heightU);
        const yBot = uToY(c.uOverlapStart - 1, rack.heightU);
        // X-band: the overlap zone in the middle — front device extends inward, rear device extends inward
        const frontEnd = 4 + ad.depthMm * depthScale;
        const rearStart = SIDE_VIEW_WIDTH - 4 - bd.depthMm * depthScale;
        const x = Math.min(frontEnd, rearStart);
        const w = Math.max(0, Math.max(frontEnd, rearStart) - x);
        return (
          <g key={i}>
            <rect x={x} y={yTop} width={w} height={yBot - yTop} fill="rgba(239,68,68,0.35)" stroke="#dc2626" strokeWidth={1} strokeDasharray="3 2" />
            <text x={x + w / 2} y={(yTop + yBot) / 2} textAnchor="middle" dominantBaseline="central" fontSize={6} fill="#7f1d1d" fontWeight={700} style={{ pointerEvents: "none" }}>
              +{Math.round(c.depthOverhangMm)}mm
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
  /** "device" = a placement is being dragged; "accessory" = a shelf/blank/etc. */
  kind: "device" | "accessory";
  /** placementId for kind="device", accessoryId for kind="accessory". */
  id: string;
  /** Only set when kind === "device". */
  deviceNodeId?: string;
  /** Only set when kind === "accessory". */
  accessoryType?: import("../types").RackAccessoryType;
  heightU: number;
  label: string;
  color: string;
  /** Face the item was on when the drag started — preserved unless flipped in side view. */
  face: "front" | "rear";
  /** Canvas-space cursor position */
  cx: number;
  cy: number;
}

// ── Helper: hit-test which rack + U position a canvas point is over ─

function hitTestRack(
  page: RackElevationPage,
  cx: number,
  cy: number,
  viewMode: ViewMode = "front",
  maxHeightU = 0,
): { rack: RackData; uPosition: number } | null {
  for (const rack of page.racks) {
    const rx = rack.position.x + RACK_PAD_X + RULER_WIDTH;
    const ry = rack.position.y + RACK_PAD_Y + LABEL_HEIGHT + (maxHeightU - rack.heightU) * PX_PER_U;
    const totalH = rack.heightU * PX_PER_U;
    const rackW = viewMode === "side" ? sideViewWidthPx(rack) : RACK_WIDTH;
    if (cx >= rx && cx <= rx + rackW && cy >= ry && cy <= ry + totalH) {
      const relY = cy - ry;
      const uFromTop = Math.floor(relY / PX_PER_U);
      const uPosition = rack.heightU - uFromTop;
      return { rack, uPosition };
    }
  }
  return null;
}

/** Find a shelf accessory at the given U position on the active face. */
function findShelfAt(
  page: RackElevationPage,
  rackId: string,
  uPosition: number,
  face: "front" | "rear",
): RackAccessory | null {
  for (const a of page.accessories) {
    if (a.rackId !== rackId || a.face !== face || a.type !== "shelf") continue;
    const aTop = a.uPosition + a.heightU - 1;
    if (uPosition >= a.uPosition && uPosition <= aTop) return a;
  }
  return null;
}

// ── Accessory context menu (resize / rename / remove) ──────────────

function AccessoryMenu({
  menu,
  defaultShelfDepthMm,
  maxShelfDepthMm,
  onResize,
  onRename,
  onChangeDepth,
  onRemove,
  onClose,
}: {
  menu: { screenX: number; screenY: number; accessory: RackAccessory; occupantCount: number };
  /** Computed fallback depth (rack.depthMm * 0.6) — shown as placeholder when shelfDepthMm is unset. */
  defaultShelfDepthMm: number;
  /** Cap to prevent shelves deeper than the rack itself. */
  maxShelfDepthMm: number;
  onResize: (heightU: number) => void;
  onRename: (label: string) => void;
  onChangeDepth: (depthMm: number | undefined) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [heightU, setHeightU] = useState(menu.accessory.heightU);
  const [label, setLabel] = useState(menu.accessory.label ?? "");
  const isShelf = menu.accessory.type === "shelf";
  const [depthMm, setDepthMm] = useState<number | undefined>(menu.accessory.shelfDepthMm);
  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 text-xs min-w-[200px]"
      style={{ left: menu.screenX, top: menu.screenY }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 text-neutral-400 text-[10px] uppercase tracking-wider">
        {RACK_ACCESSORY_LABELS[menu.accessory.type]}
        {menu.occupantCount > 0 && ` (${menu.occupantCount} on shelf)`}
      </div>
      <label className="flex items-center gap-2 px-3 py-1.5 border-t border-neutral-100">
        <span className="text-neutral-600 w-12">Label</span>
        <input
          className="flex-1 border border-neutral-300 rounded px-2 py-0.5 outline-none focus:border-blue-400"
          value={label}
          placeholder={RACK_ACCESSORY_LABELS[menu.accessory.type]}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onRename(label.trim());
            if (e.key === "Escape") onClose();
          }}
          autoFocus
        />
      </label>
      {isShelf && (
        <label className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-neutral-600 w-12">Depth</span>
          <input
            type="number"
            className="flex-1 border border-neutral-300 rounded px-2 py-0.5 outline-none focus:border-blue-400 text-right"
            value={depthMm ?? ""}
            placeholder={Math.round(defaultShelfDepthMm).toString()}
            min={50}
            max={maxShelfDepthMm}
            step={5}
            onChange={(e) => setDepthMm(e.target.value === "" ? undefined : Number(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span className="text-neutral-500">mm</span>
        </label>
      )}
      <label className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-neutral-600 w-12">Height</span>
        <input
          type="number"
          className="flex-1 border border-neutral-300 rounded px-2 py-0.5 outline-none focus:border-blue-400 text-right"
          value={heightU}
          min={1}
          max={20}
          onChange={(e) => setHeightU(Number(e.target.value))}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <span className="text-neutral-500">U</span>
      </label>
      <div className="flex gap-1 px-3 py-1.5 border-t border-neutral-100">
        <button
          className="flex-1 px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => {
            const labelChanged = label.trim() !== (menu.accessory.label ?? "");
            const heightChanged = heightU !== menu.accessory.heightU;
            const depthChanged = isShelf && depthMm !== menu.accessory.shelfDepthMm;
            if (labelChanged) onRename(label.trim());
            if (depthChanged) onChangeDepth(depthMm);
            if (heightChanged) onResize(heightU);
            else if (!labelChanged && !depthChanged) onClose();
          }}
        >
          Save
        </button>
        <button
          className="px-2 py-1 rounded text-red-600 hover:bg-red-50 border border-red-200"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Inline Edit Rack dialog (used by rack context menu) ────────────

function EditRackInlineDialog({
  rack,
  onSave,
  onClose,
}: {
  rack: RackData;
  onSave: (patch: Partial<RackData>) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(rack.label);
  const [rackType, setRackType] = useState(rack.rackType);
  const [heightU, setHeightU] = useState(rack.heightU);
  const [depthMm, setDepthMm] = useState(rack.depthMm);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      label: label.trim() || rack.label,
      rackType,
      heightU: Math.max(2, Math.min(60, Math.round(heightU))),
      depthMm: Math.max(100, Math.min(2000, Math.round(depthMm))),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-white rounded-lg shadow-xl p-4 w-80 text-xs" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="font-semibold text-sm mb-3">Edit Rack</h3>
        <label className="block mb-2">
          <span className="text-neutral-600">Label</span>
          <input
            className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            autoFocus
          />
        </label>
        <label className="block mb-2">
          <span className="text-neutral-600">Type</span>
          <select
            className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
            value={rackType}
            onChange={(e) => setRackType(e.target.value as typeof rackType)}
          >
            {(Object.entries(RACK_TYPE_LABELS) as [typeof rackType, string][]).map(([value, lbl]) => (
              <option key={value} value={value}>{lbl}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 mb-3">
          <label className="block flex-1">
            <span className="text-neutral-600">Height (U)</span>
            <input
              type="number"
              className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
              value={heightU}
              min={2}
              max={60}
              onChange={(e) => setHeightU(Number(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
          <label className="block flex-1">
            <span className="text-neutral-600">Depth (mm)</span>
            <input
              type="number"
              className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
              value={depthMm}
              min={100}
              max={2000}
              step={50}
              onChange={(e) => setDepthMm(Number(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50" onClick={onClose}>Cancel</button>
          <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
        </div>
      </form>
    </div>
  );
}

// ── Slot context menu (cascading: Add Accessory ▸ Type ▸ U-height) ──

const ACCESSORY_TYPE_ORDER: import("../types").RackAccessoryType[] = [
  "shelf", "blank-panel", "vent-panel", "drawer", "cable-manager", "fan-unit",
];
const ACCESSORY_HEIGHTS: number[] = [1, 2, 3, 4];
const MENU_W = 180;

function SlotMenu({
  menu,
  onAdd,
  onEditRack,
  onDeleteRack,
  onClose,
}: {
  menu: { screenX: number; screenY: number; rackId: string; uPosition: number };
  onAdd: (rackId: string, uPosition: number, type: import("../types").RackAccessoryType, heightU: number) => void;
  onEditRack: (rackId: string) => void;
  onDeleteRack: (rackId: string) => void;
  onClose: () => void;
}) {
  // Two-level expansion path: which top-level item is expanded, and which type beneath it.
  const [expandedTop, setExpandedTop] = useState<"add" | null>("add");
  const [expandedType, setExpandedType] = useState<import("../types").RackAccessoryType | null>(null);
  const closeTypeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelCloseType = () => { if (closeTypeTimer.current) { clearTimeout(closeTypeTimer.current); closeTypeTimer.current = null; } };
  const scheduleCloseType = () => { cancelCloseType(); closeTypeTimer.current = setTimeout(() => setExpandedType(null), 180); };

  // Item heights (px) — keep aligned across panels for clean stacking
  const ITEM_H = 28;

  return (
    <div
      className="fixed z-50 text-xs"
      style={{ left: menu.screenX, top: menu.screenY }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Root menu */}
      <div
        className="absolute bg-white rounded-lg shadow-xl border border-neutral-200 py-1"
        style={{ width: MENU_W }}
        onMouseLeave={() => { setExpandedType(null); }}
      >
        <div className="px-3 py-1 text-neutral-400 text-[10px] uppercase tracking-wider">Rack at U{menu.uPosition}</div>
        <button
          className={`w-full text-left px-3 flex items-center justify-between hover:bg-neutral-100 ${expandedTop === "add" ? "bg-neutral-100" : ""}`}
          style={{ height: ITEM_H }}
          onMouseEnter={() => setExpandedTop("add")}
          onClick={() => setExpandedTop("add")}
        >
          <span>Add Accessory</span><span className="text-neutral-400">▸</span>
        </button>
        <div className="border-t border-neutral-100 my-0.5" />
        <button
          className="w-full text-left px-3 hover:bg-neutral-100"
          style={{ height: ITEM_H }}
          onMouseEnter={() => { setExpandedTop(null); setExpandedType(null); }}
          onClick={() => { onEditRack(menu.rackId); onClose(); }}
        >
          Edit Rack…
        </button>
        <button
          className="w-full text-left px-3 hover:bg-neutral-100 text-red-600"
          style={{ height: ITEM_H }}
          onMouseEnter={() => { setExpandedTop(null); setExpandedType(null); }}
          onClick={() => { onDeleteRack(menu.rackId); onClose(); }}
        >
          Delete Rack
        </button>
      </div>

      {/* Type panel — opens to right of root */}
      {expandedTop === "add" && (
        <div
          className="absolute bg-white rounded-lg shadow-xl border border-neutral-200 py-1"
          style={{ left: MENU_W + 4, top: ITEM_H + 4, width: MENU_W }}
          onMouseLeave={scheduleCloseType}
        >
          {ACCESSORY_TYPE_ORDER.map((type) => (
            <button
              key={type}
              className={`w-full text-left px-3 flex items-center justify-between hover:bg-neutral-100 ${expandedType === type ? "bg-neutral-100" : ""}`}
              style={{ height: ITEM_H }}
              onMouseEnter={() => { cancelCloseType(); setExpandedType(type); }}
              onClick={() => setExpandedType(type)}
            >
              <span>{RACK_ACCESSORY_LABELS[type]}</span><span className="text-neutral-400">▸</span>
            </button>
          ))}
        </div>
      )}

      {/* U-height panel — opens to right of type panel */}
      {expandedTop === "add" && expandedType && (() => {
        const typeIdx = ACCESSORY_TYPE_ORDER.indexOf(expandedType);
        return (
          <div
            className="absolute bg-white rounded-lg shadow-xl border border-neutral-200 py-1"
            style={{ left: MENU_W * 2 + 8, top: ITEM_H + 4 + typeIdx * ITEM_H, width: 80 }}
            onMouseEnter={cancelCloseType}
            onMouseLeave={scheduleCloseType}
          >
            {ACCESSORY_HEIGHTS.map((h) => (
              <button
                key={h}
                className="w-full text-left px-3 hover:bg-neutral-100"
                style={{ height: ITEM_H }}
                onClick={() => { onAdd(menu.rackId, menu.uPosition, expandedType, h); onClose(); }}
              >
                {h}U
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main RackRenderer ──────────────────────────────────────────────

export default function RackRenderer({ page }: { page: RackElevationPage }) {
  const nodes = useSchematicStore((s) => s.nodes);
  const addRackPlacement = useSchematicStore((s) => s.addRackPlacement);
  const addPlacementSmart = useSchematicStore((s) => s.addPlacementSmart);
  const removeRackPlacement = useSchematicStore((s) => s.removeRackPlacement);
  const updateRackPlacement = useSchematicStore((s) => s.updateRackPlacement);
  const updateRack = useSchematicStore((s) => s.updateRack);
  const isRackSlotAvailable = useSchematicStore((s) => s.isRackSlotAvailable);
  const addToast = useSchematicStore((s) => s.addToast);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const showFacePlateDetail = useSchematicStore((s) => s.showFacePlateDetail);
  const addShelfMountedDevice = useSchematicStore((s) => s.addShelfMountedDevice);
  const removeRackAccessoryWithOccupants = useSchematicStore((s) => s.removeRackAccessoryWithOccupants);
  const addRackAccessory = useSchematicStore((s) => s.addRackAccessory);
  const removeRackAccessory = useSchematicStore((s) => s.removeRackAccessory);
  const updateRackAccessory = useSchematicStore((s) => s.updateRackAccessory);
  const removeRack = useSchematicStore((s) => s.removeRack);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  // Edit Rack dialog (opened from rack-context menu)
  const [editRackTarget, setEditRackTarget] = useState<RackData | null>(null);

  // Device context menu in rack view
  const [rackContextMenu, setRackContextMenu] = useState<{
    screenX: number; screenY: number; placement: RackDevicePlacement; deviceData: DeviceData;
  } | null>(null);
  // Empty-slot context menu — shown on right-click in an empty U position
  const [slotContextMenu, setSlotContextMenu] = useState<{
    screenX: number; screenY: number; rackId: string; uPosition: number;
  } | null>(null);
  // Accessory context menu — shown on right-click of an accessory rect
  const [accessoryContextMenu, setAccessoryContextMenu] = useState<{
    screenX: number; screenY: number; accessory: RackAccessory; occupantCount: number;
  } | null>(null);
  // Shelf-occupant context menu — shown on right-click of a device sitting on a shelf
  const [shelfOccupantMenu, setShelfOccupantMenu] = useState<{
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
    /** Target face — only meaningful in side-view drag where face can flip. */
    face?: "front" | "rear";
    /** When set, the drop will mount the device on this shelf instead of placing in U slots. */
    shelfId?: string;
    /** How the drop will be interpreted: direct rack mount, auto-shelf (small device), or rejected (oversize). */
    mode?: "direct" | "shelf-only" | "oversize";
  } | null>(null);
  // Confirm dialog state for shelf removal with occupants
  const [shelfDeleteConfirm, setShelfDeleteConfirm] = useState<{ accessoryId: string; label: string; occupantCount: number } | null>(null);

  // In-rack drag (moving existing placements)
  const [inRackDrag, setInRackDrag] = useState<InRackDrag | null>(null);
  const pendingDragRef = useRef<{ kind: "device" | "accessory"; id: string; startX: number; startY: number } | null>(null);

  // Shelf-occupant drag — free-form positioning within a shelf (separate pipeline from U-snap drag)
  const [shelfDrag, setShelfDrag] = useState<{
    placementId: string;
    shelfId: string;        // source shelf (never changes during drag)
    targetShelfId: string;  // current target shelf (may differ from shelfId)
    offsetMm: { x: number; y: number };
    valid: boolean;
    guides: ShelfSnapGuides;
  } | null>(null);
  const pendingShelfDragRef = useRef<{
    placementId: string;
    shelfId: string;
    startCanvasX: number;
    startCanvasY: number;
    /** Cursor offset (mm) from device's top-left at the moment of grab — anchors the drag. */
    grabOffsetMm: { x: number; y: number };
    /** Device's effective dims (rotation applied). */
    wMm: number;
    hMm: number;
    /** Initial offset, used when restoring on cancel. */
    initialOffsetMm: { x: number; y: number };
  } | null>(null);

  const maxRackHeightU = useMemo(
    () => page.racks.reduce((m, r) => Math.max(m, r.heightU), 0),
    [page.racks],
  );

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

    // Promote pending shelf-occupant drag to active shelfDrag after 4px threshold
    if (pendingShelfDragRef.current && !shelfDrag) {
      const ps = pendingShelfDragRef.current;
      const c = clientToCanvas(e.clientX, e.clientY);
      const dx = c.x - ps.startCanvasX;
      const dy = c.y - ps.startCanvasY;
      if (dx * dx + dy * dy > 16) {
        setShelfDrag({
          placementId: ps.placementId,
          shelfId: ps.shelfId,
          targetShelfId: ps.shelfId,
          offsetMm: ps.initialOffsetMm,
          valid: true,
          guides: {},
        });
      }
    }

    if (shelfDrag && pendingShelfDragRef.current) {
      const ps = pendingShelfDragRef.current;
      const c = clientToCanvas(e.clientX, e.clientY);
      // Hit-test: which shelf is the cursor over? Fall back to source shelf.
      const hitResult = hitTestShelfCanvas(page, c.x, c.y, activeFace, maxRackHeightU);
      const sourceShelf = page.accessories.find((a) => a.id === ps.shelfId);
      const targetShelf = hitResult?.shelf ?? sourceShelf;
      const targetRack = hitResult?.rack ?? page.racks.find((r) => r.id === targetShelf?.rackId);
      if (targetShelf && targetRack) {
        // Absolute canvas→mm conversion: cursor position in target shelf mm space,
        // offset by the grab anchor so the device follows the cursor correctly.
        const { originX, surfaceCanvasY } = shelfCanvasCoords(targetRack, targetShelf, maxRackHeightU);
        const rawOffsetMm = {
          x: (c.x - originX) / PX_PER_MM - ps.grabOffsetMm.x,
          y: (surfaceCanvasY - c.y) / PX_PER_MM - ps.grabOffsetMm.y,
        };
        const { offset: newOffsetMm, guides } = computeShelfSnaps(
          targetShelf, page.placements, ps.placementId,
          rawOffsetMm, { wMm: ps.wMm }, deviceDataMap,
        );
        const valid = isShelfOffsetValid(
          targetShelf, page.placements, ps.placementId,
          { xMm: newOffsetMm.x, yMm: newOffsetMm.y, wMm: ps.wMm, hMm: ps.hMm },
          deviceDataMap,
        );
        setShelfDrag((d) => d ? { ...d, targetShelfId: targetShelf.id, offsetMm: newOffsetMm, valid, guides } : null);
      }
      return;
    }

    // Promote pending drag to real drag after 4px threshold
    if (pendingDragRef.current && !inRackDrag) {
      const dx = e.clientX - pendingDragRef.current.startX;
      const dy = e.clientY - pendingDragRef.current.startY;
      if (dx * dx + dy * dy > 16) { // 4px threshold
        const { kind, id } = pendingDragRef.current;
        pendingDragRef.current = null;
        const c = clientToCanvas(e.clientX, e.clientY);
        if (kind === "device") {
          const pl = page.placements.find((p) => p.id === id);
          if (pl) {
            const dd = deviceDataMap.get(pl.deviceNodeId);
            if (dd) {
              setInRackDrag({
                kind: "device",
                id,
                deviceNodeId: pl.deviceNodeId,
                heightU: inferRackHeightU(dd),
                label: dd.label,
                color: dd.headerColor ?? dd.color ?? "#4a90d9",
                face: pl.face,
                cx: c.x,
                cy: c.y,
              });
            }
          }
        } else {
          const ac = page.accessories.find((a) => a.id === id);
          if (ac) {
            const fills: Record<string, string> = {
              "blank-panel": "#888", "vent-panel": "#aaa", "shelf": "#a0855b",
              "drawer": "#8a7a5a", "cable-manager": "#666", "fan-unit": "#556b7a",
            };
            setInRackDrag({
              kind: "accessory",
              id,
              accessoryType: ac.type,
              heightU: ac.heightU,
              label: ac.label ?? RACK_ACCESSORY_LABELS[ac.type],
              color: fills[ac.type] ?? "#888",
              face: ac.face,
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

      // In side view, horizontal cursor position picks the target face.
      // Cursor on the front half of the rack → front; on the rear half → rear.
      // 2-post racks have no rear face so always front.
      let dragFace = inRackDrag.face;
      if (viewMode === "side") {
        const hit = hitTestRack(page, c.x, c.y, viewMode, maxRackHeightU);
        if (hit) {
          const rackLeftCanvas = hit.rack.position.x + RACK_PAD_X + RULER_WIDTH;
          const rackMidCanvas = rackLeftCanvas + sideViewWidthPx(hit.rack) / 2;
          if (hit.rack.rackType === "open-2post") dragFace = "front";
          else dragFace = c.x < rackMidCanvas ? "front" : "rear";
        }
      }
      setInRackDrag((d) => d ? { ...d, cx: c.x, cy: c.y, face: dragFace } : null);

      const hit = hitTestRack(page, c.x, c.y, viewMode, maxRackHeightU);
      if (hit) {
        if (dragFace === "rear" && hit.rack.rackType === "open-2post") {
          const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - inRackDrag.heightU + 1));
          setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU: inRackDrag.heightU, valid: false, face: dragFace });
        } else {
          const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - inRackDrag.heightU + 1));
          const valid = isRackSlotAvailable(
            page.id, hit.rack.id, clampedU, inRackDrag.heightU, dragFace, undefined,
            inRackDrag.kind === "device" ? inRackDrag.id : undefined,
            inRackDrag.kind === "accessory" ? inRackDrag.id : undefined,
          );
          setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU: inRackDrag.heightU, valid, face: dragFace });
        }
      } else {
        setDropTarget(null);
      }
    }
  }, [isPanning, inRackDrag, shelfDrag, clientToCanvas, page, isRackSlotAvailable, viewMode, deviceDataMap, activeFace, maxRackHeightU]);

  const onMouseUp = useCallback((e: MouseEvent) => {
    setIsPanning(false);
    pendingDragRef.current = null;

    // Shelf-occupant drag: commit if valid (gravity-snap y), snap back otherwise
    if (shelfDrag) {
      if (shelfDrag.valid) {
        const ps = pendingShelfDragRef.current;
        const targetShelf = page.accessories.find((a) => a.id === shelfDrag.targetShelfId);
        let snappedY = shelfDrag.offsetMm.y;
        if (ps && targetShelf) {
          snappedY = gravitySnapShelfY(targetShelf, page.placements, ps.placementId,
            { xMm: shelfDrag.offsetMm.x, wMm: ps.wMm }, deviceDataMap);
        }
        if (shelfDrag.targetShelfId !== shelfDrag.shelfId && targetShelf) {
          // Cross-shelf drop: rewire the placement to the new shelf
          updateRackPlacement(page.id, shelfDrag.placementId, {
            mountedOnShelfId: targetShelf.id,
            rackId: targetShelf.rackId,
            uPosition: targetShelf.uPosition,
            face: targetShelf.face,
            shelfOffsetMm: { x: shelfDrag.offsetMm.x, y: snappedY },
          });
        } else {
          updateRackPlacement(page.id, shelfDrag.placementId, {
            shelfOffsetMm: { x: shelfDrag.offsetMm.x, y: snappedY },
          });
        }
      }
      setShelfDrag(null);
      pendingShelfDragRef.current = null;
      return;
    }
    pendingShelfDragRef.current = null;

    if (inRackDrag) {
      const c = clientToCanvas(e.clientX, e.clientY);
      const hit = hitTestRack(page, c.x, c.y, viewMode, maxRackHeightU);

      if (hit && dropTarget?.valid) {
        const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - inRackDrag.heightU + 1));
        if (inRackDrag.kind === "device") {
          const original = page.placements.find((p) => p.id === inRackDrag.id);
          if (dropTarget.rackId === original?.rackId) {
            updateRackPlacement(page.id, inRackDrag.id, { uPosition: clampedU, rackId: dropTarget.rackId, face: inRackDrag.face });
          } else {
            removeRackPlacement(page.id, inRackDrag.id);
            addRackPlacement(page.id, {
              rackId: dropTarget.rackId,
              deviceNodeId: inRackDrag.deviceNodeId!,
              uPosition: clampedU,
              face: inRackDrag.face,
            });
          }
        } else {
          // Accessory move — within or across racks
          updateRackAccessory(page.id, inRackDrag.id, { uPosition: clampedU, rackId: dropTarget.rackId, face: inRackDrag.face });
        }
      } else if (!hit) {
        if (inRackDrag.kind === "device") {
          const dd = inRackDrag.deviceNodeId ? deviceDataMap.get(inRackDrag.deviceNodeId) : undefined;
          removeRackPlacement(page.id, inRackDrag.id);
          addToast(`Removed ${dd?.label ?? "device"} from rack`, "info");
        }
        // Accessories don't unrack — dropping outside is a no-op (snap back)
      }
      // else: dropped on invalid position — snap back (do nothing)

      setInRackDrag(null);
      setDropTarget(null);
    }
  }, [inRackDrag, shelfDrag, dropTarget, clientToCanvas, page, updateRackPlacement, removeRackPlacement, addRackPlacement, updateRackAccessory, viewMode, deviceDataMap, addToast, maxRackHeightU]);

  // ── In-rack drag start (from DeviceBlock) ────────────────────────

  const onPlacementDragStart = useCallback((placementId: string, e: React.MouseEvent) => {
    // Side view allows drag (uPosition only, face preserved). Front/rear views still
    // honor the placement-blocked guard (e.g. 2-post rear).
    if (viewMode !== "side" && isPlacementBlocked) return;
    // Don't start drag immediately — wait for mouse movement past threshold
    pendingDragRef.current = { kind: "device", id: placementId, startX: e.clientX, startY: e.clientY };
    setSelectedPlacementId(placementId);
  }, [viewMode, isPlacementBlocked]);

  const onAccessoryDragStart = useCallback((accessoryId: string, e: React.MouseEvent) => {
    if (viewMode !== "side" && isPlacementBlocked) return;
    pendingDragRef.current = { kind: "accessory", id: accessoryId, startX: e.clientX, startY: e.clientY };
  }, [viewMode, isPlacementBlocked]);

  const onShelfOccupantDragStart = useCallback((placementId: string, shelfId: string, e: React.MouseEvent) => {
    if (viewMode !== "front" && viewMode !== "rear") return;
    const pl = page.placements.find((p) => p.id === placementId);
    const shelf = page.accessories.find((a) => a.id === shelfId);
    const rack = page.racks.find((r) => r.id === shelf?.rackId);
    if (!pl || !shelf || !rack) return;
    const dd = deviceDataMap.get(pl.deviceNodeId);
    if (!dd) return;
    const wMm = pl.rotated ? (dd.heightMm ?? 44.45) : (dd.widthMm ?? 482);
    const hMm = pl.rotated ? (dd.widthMm ?? 482) : (dd.heightMm ?? 44.45);
    const offset = pl.shelfOffsetMm ?? { x: 0, y: 0 };
    const c = clientToCanvas(e.clientX, e.clientY);
    // Compute cursor's offset from the device's bottom-left corner in shelf mm space.
    // This is used for absolute-position cross-shelf dragging.
    const { originX, surfaceCanvasY } = shelfCanvasCoords(rack, shelf, maxRackHeightU);
    const grabOffsetMm = {
      x: (c.x - originX) / PX_PER_MM - offset.x,
      y: (surfaceCanvasY - c.y) / PX_PER_MM - offset.y,
    };
    pendingShelfDragRef.current = {
      placementId,
      shelfId,
      startCanvasX: c.x,
      startCanvasY: c.y,
      grabOffsetMm,
      wMm,
      hMm,
      initialOffsetMm: offset,
    };
    setSelectedPlacementId(placementId);
  }, [viewMode, page, deviceDataMap, clientToCanvas, maxRackHeightU]);

  // ── Sidebar drag-and-drop (new placements) ───────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (viewMode === "side" || isPlacementBlocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const c = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTestRack(page, c.x, c.y, "front", maxRackHeightU);
    if (hit) {
      if (isRackRearBlocked(hit.rack.id)) {
        const heightU = draggedDeviceHeightU;
        const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - heightU + 1));
        setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU, valid: false });
        return;
      }
      // Check if hovering over a shelf — prefer shelf-mount over normal placement
      const shelf = findShelfAt(page, hit.rack.id, hit.uPosition, activeFace);
      if (shelf && draggedDeviceNodeId) {
        const dd = deviceDataMap.get(draggedDeviceNodeId);
        if (dd) {
          const occupants = getShelfOccupants(shelf.id, page.placements);
          const fits = canFitOnShelf(shelf, occupants, dd, hit.rack, deviceDataMap);
          setDropTarget({ rackId: hit.rack.id, uPosition: shelf.uPosition, heightU: shelf.heightU, valid: fits, shelfId: shelf.id, mode: "direct" });
          return;
        }
      }
      // Form-aware drop target — small devices auto-shelf, oversize devices reject.
      const dd = draggedDeviceNodeId ? deviceDataMap.get(draggedDeviceNodeId) : undefined;
      const form = dd ? inferRackForm(dd) : "unknown";
      if (form === "oversize") {
        const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU));
        setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU: 1, valid: false, mode: "oversize" });
        return;
      }
      if (form === "shelf-only") {
        // Auto-shelf is always 1U; check the slot for a 1U fit, not the device's inferred U height.
        const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU));
        const valid = isRackSlotAvailable(page.id, hit.rack.id, clampedU, 1, activeFace, undefined);
        setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU: 1, valid, mode: "shelf-only" });
        return;
      }
      const heightU = draggedDeviceHeightU;
      const clampedU = Math.max(1, Math.min(hit.uPosition, hit.rack.heightU - heightU + 1));
      if (form === "half") {
        // Cursor-side preference: rack-local x against the interior centerline.
        const rackInteriorLeft = hit.rack.position.x + RACK_PAD_X + RULER_WIDTH + DEVICE_INSET;
        const preferred: "left" | "right" = c.x < rackInteriorLeft + FULL_WIDTH / 2 ? "left" : "right";
        const other: "left" | "right" = preferred === "left" ? "right" : "left";
        const preferredOk = isRackSlotAvailable(page.id, hit.rack.id, clampedU, heightU, activeFace, preferred);
        const otherOk = !preferredOk && isRackSlotAvailable(page.id, hit.rack.id, clampedU, heightU, activeFace, other);
        const side: "left" | "right" = preferredOk ? preferred : other;
        const valid = preferredOk || otherOk;
        setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU, valid, mode: "direct", halfRackSide: side });
        return;
      }
      const valid = isRackSlotAvailable(page.id, hit.rack.id, clampedU, heightU, activeFace, undefined);
      setDropTarget({ rackId: hit.rack.id, uPosition: clampedU, heightU, valid, mode: "direct" });
    } else {
      setDropTarget(null);
    }
  }, [page, clientToCanvas, isRackSlotAvailable, activeFace, viewMode, isPlacementBlocked, isRackRearBlocked, deviceDataMap, maxRackHeightU]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const deviceNodeId = e.dataTransfer.getData("application/x-rack-device-id");
    if (!deviceNodeId || !dropTarget) { setDropTarget(null); return; }
    if (dropTarget.mode === "oversize") {
      addToast("Device is too wide to fit in this rack — can't be racked.", "error");
      setDropTarget(null);
      return;
    }
    if (!dropTarget.valid) { setDropTarget(null); return; }
    if (dropTarget.shelfId) {
      addShelfMountedDevice(page.id, dropTarget.shelfId, deviceNodeId);
    } else {
      // addPlacementSmart routes by inferRackForm: full/half direct, shelf-only auto-shelf,
      // oversize already short-circuited above. dropTarget.halfRackSide carries the cursor's
      // intent so half-rack drops land where the user aimed (or flip if that side is taken).
      const result = addPlacementSmart(page.id, dropTarget.rackId, deviceNodeId, dropTarget.uPosition, activeFace, dropTarget.halfRackSide);
      if (!result.ok && result.reason === "oversize") {
        addToast("Device is too wide to fit in this rack — can't be racked.", "error");
      }
    }
    setDropTarget(null);
  }, [page.id, dropTarget, addShelfMountedDevice, addPlacementSmart, activeFace, addToast]);

  const onDragLeave = useCallback(() => { setDropTarget(null); }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedPlacementId) {
      removeRackPlacement(page.id, selectedPlacementId);
      setSelectedPlacementId(null);
    }
  }, [selectedPlacementId, page.id, removeRackPlacement]);

  // Right-click on empty rack space → "Add Accessory" menu
  const onCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    if (viewMode === "side") return;
    const c = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTestRack(page, c.x, c.y, "front", maxRackHeightU);
    if (!hit) { setSlotContextMenu(null); setAccessoryContextMenu(null); setRackContextMenu(null); return; }

    // Hit-test for an existing accessory at this U position
    const accessory = page.accessories.find((a) =>
      a.rackId === hit.rack.id && a.face === activeFace
        && hit.uPosition >= a.uPosition && hit.uPosition <= a.uPosition + a.heightU - 1
    );
    if (accessory) {
      e.preventDefault();
      e.stopPropagation();
      const occupantCount = page.placements.filter((p) => p.mountedOnShelfId === accessory.id).length;
      setAccessoryContextMenu({ screenX: e.clientX, screenY: e.clientY, accessory, occupantCount });
      setSlotContextMenu(null);
      setRackContextMenu(null);
      return;
    }

    // Hit-test for a device — handled by DeviceBlock onContextMenu, skip
    const placementHere = page.placements.find((p) => {
      if (p.rackId !== hit.rack.id || p.face !== activeFace || p.mountedOnShelfId) return false;
      const dd = deviceDataMap.get(p.deviceNodeId);
      const heightU = dd ? inferRackHeightU(dd) : 1;
      return hit.uPosition >= p.uPosition && hit.uPosition <= p.uPosition + heightU - 1;
    });
    if (placementHere) return;

    if (isRackRearBlocked(hit.rack.id)) return;

    e.preventDefault();
    e.stopPropagation();
    setSlotContextMenu({ screenX: e.clientX, screenY: e.clientY, rackId: hit.rack.id, uPosition: hit.uPosition });
    setAccessoryContextMenu(null);
    setRackContextMenu(null);
  }, [viewMode, clientToCanvas, page, activeFace, deviceDataMap, isRackRearBlocked, maxRackHeightU]);

  const handleAddAccessory = useCallback((rackId: string, uPosition: number, type: import("../types").RackAccessoryType, heightU: number) => {
    const cleanH = Math.max(1, Math.min(20, Math.round(heightU || 1)));
    const valid = isRackSlotAvailable(page.id, rackId, uPosition, cleanH, activeFace, undefined);
    if (!valid) {
      addToast(`Can't add ${type} — ${cleanH}U slot at U${uPosition} is occupied`, "error");
      return;
    }
    addRackAccessory(page.id, { rackId, type, uPosition, heightU: cleanH, face: activeFace });
    setSlotContextMenu(null);
  }, [page.id, activeFace, addRackAccessory, isRackSlotAvailable, addToast]);

  const handleRemoveAccessory = useCallback((accessory: RackAccessory, occupantCount: number) => {
    if (occupantCount > 0) {
      setShelfDeleteConfirm({ accessoryId: accessory.id, label: accessory.label ?? RACK_ACCESSORY_LABELS[accessory.type], occupantCount });
    } else {
      removeRackAccessory(page.id, accessory.id);
    }
    setAccessoryContextMenu(null);
  }, [page.id, removeRackAccessory]);

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

      <svg
        width="100%" height="100%" style={{ display: "block" }}
        onClick={() => { setRackContextMenu(null); setSlotContextMenu(null); setAccessoryContextMenu(null); setShelfOccupantMenu(null); }}
        onContextMenu={onCanvasContextMenu}
      >
        <OccupancyPattern />
        <g transform={`translate(${viewOffset.x}, ${viewOffset.y}) scale(${zoom})`}>
          {page.racks.map((rack) => {
            const ox = rack.position.x + RACK_PAD_X + RULER_WIDTH;
            const oy = rack.position.y + RACK_PAD_Y + LABEL_HEIGHT + (maxRackHeightU - rack.heightU) * PX_PER_U;
            // Visible (non-shelf-mounted) placements participate in face-specific layout & occupancy
            const visiblePlacements = page.placements.filter((p) => p.rackId === rack.id && !p.mountedOnShelfId);
            const activePlacements = visiblePlacements.filter((p) => p.face === activeFace);
            const oppositePlacements = visiblePlacements.filter((p) => p.face !== activeFace);
            const activeAccessories = page.accessories.filter((a) => a.rackId === rack.id && a.face === activeFace);
            const rackAccessories = page.accessories.filter((a) => a.rackId === rack.id);
            const allPlacements = page.placements.filter((p) => p.rackId === rack.id);
            const conflicts = getRackDepthConflicts(rack, allPlacements, deviceDataMap);
            const unknownDepth = countUnknownDepthDevices(rack, allPlacements, deviceDataMap);
            const oversized = getOversizedDevices(rack, allPlacements, deviceDataMap);
            const maxOversize = oversized.reduce((m, d) => Math.max(m, d.overhangMm), 0);
            const stats = computeRackStats(rack, allPlacements, rackAccessories, deviceDataMap);
            const totalH = rack.heightU * PX_PER_U;
            const statsLine = formatStatsLine(stats);

            if (viewMode === "side") {
              const sideW = sideViewWidthPx(rack);
              return (
                <g key={rack.id} transform={`translate(${ox}, ${oy})`}>
                  <RackLabel rack={rack} width={sideW} onRename={handleRenameRack} />
                  <SideViewRack
                    rack={rack}
                    placements={allPlacements}
                    accessories={rackAccessories}
                    deviceDataMap={deviceDataMap}
                    conflicts={conflicts}
                    selectedPlacementId={selectedPlacementId}
                    draggingPlacementId={inRackDrag && inRackDrag.kind === "device" ? inRackDrag.id : null}
                    dropTarget={dropTarget && dropTarget.rackId === rack.id ? dropTarget : null}
                    onSelect={setSelectedPlacementId}
                    onDragStart={onPlacementDragStart}
                    onContextMenu={handleDeviceContextMenu}
                  />
                  <text x={sideW / 2} y={totalH + 28} textAnchor="middle" fontSize={9} fill="#444">{statsLine}</text>
                </g>
              );
            }

            return (
              <g key={rack.id} transform={`translate(${ox}, ${oy})`}>
                <RackLabel rack={rack} onRename={handleRenameRack} />
                {conflicts.length > 0 && (
                  <g
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setViewMode("side"); }}
                  >
                    <rect x={RACK_WIDTH - 90} y={-22} width={88} height={16} rx={3} fill="#fef2f2" stroke="#dc2626" strokeWidth={0.75} />
                    <text x={RACK_WIDTH - 90 + 44} y={-14} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={600} fill="#b91c1c">
                      ⚠ {conflicts.length} depth conflict{conflicts.length === 1 ? "" : "s"}
                    </text>
                    {unknownDepth > 0 && (
                      <title>{`${conflicts.length} front/rear pair(s) overlap deeper than the rack. ${unknownDepth} device${unknownDepth === 1 ? " has" : "s have"} unknown depth (not counted).`}</title>
                    )}
                  </g>
                )}
                {oversized.length > 0 && (
                  <g
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setViewMode("side"); }}
                  >
                    {/* Left side of header — opposite the depth-conflict badge so they don't both crowd the rack name */}
                    <rect x={2} y={-22} width={92} height={16} rx={3} fill="#fff7ed" stroke="#ea580c" strokeWidth={0.75} />
                    <text x={2 + 46} y={-14} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={600} fill="#9a3412">
                      ⚠ {oversized.length} too deep
                    </text>
                    <title>{`${oversized.length} device${oversized.length === 1 ? "" : "s"} ${oversized.length === 1 ? "is" : "are"} deeper than the rack (max +${Math.round(maxOversize)}mm). Consider a deeper rack.`}</title>
                  </g>
                )}
                {rack.linkedRoomId && (() => {
                  const linkedRoom = nodes.find((n) => n.id === rack.linkedRoomId);
                  const roomLabel = (linkedRoom?.data as { label?: string })?.label ?? "Room";
                  return (
                    <>
                      <g
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePage("schematic");
                          useSchematicStore.setState((state) => ({
                            nodes: state.nodes.map((n) => ({ ...n, selected: n.id === rack.linkedRoomId })),
                          }));
                        }}
                      >
                        <rect x={RACK_WIDTH / 2 - 36} y={-36} width={72} height={13} rx={3} fill="#eff6ff" stroke="#3b82f6" strokeWidth={0.75} />
                        <text x={RACK_WIDTH / 2} y={-29} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#1d4ed8">
                          🔗 {roomLabel}
                        </text>
                      </g>
                      <foreignObject x={RACK_WIDTH - 88} y={-52} width={88} height={16}>
                        <button
                          style={{ fontSize: 9, padding: "1px 4px", cursor: "pointer", background: "#f0fdf4", border: "0.75px solid #16a34a", borderRadius: 3, color: "#15803d", whiteSpace: "nowrap", width: "100%" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const state = useSchematicStore.getState();
                            const roomDevices = getDevicesInRoom(rack.linkedRoomId!, state.nodes);
                            const { placements, skipped } = proposeRackPlacements(rack, roomDevices, page.placements);
                            if (placements.length === 0 && skipped.length === 0) { state.addToast("No devices to place", "info"); return; }
                            for (const p of placements) state.addRackPlacement(page.id, p);
                            state.addToast(`Placed ${placements.length}${skipped.length ? ` · ${skipped.length} skipped (missing height)` : ""}`, "info");
                          }}
                        >
                          Auto-Populate
                        </button>
                      </foreignObject>
                    </>
                  );
                })()}
                <RackFrame rack={rack} faceLabel={viewMode === "front" ? "Front" : "Rear"} viewFace={activeFace} />
                {oppositePlacements.map((pl) => {
                  const dd = deviceDataMap.get(pl.deviceNodeId);
                  if (!dd) return null;
                  return <OccupancyGhost key={pl.id} placement={pl} rack={rack} heightU={inferRackHeightU(dd)} />;
                })}
                {activeAccessories.map((a) => (
                  <AccessoryBlock
                    key={a.id}
                    accessory={a}
                    rack={rack}
                    occupants={a.type === "shelf" ? getShelfOccupants(a.id, page.placements) : []}
                    deviceDataMap={deviceDataMap}
                    isDragging={inRackDrag?.kind === "accessory" && inRackDrag.id === a.id}
                    onDragStart={onAccessoryDragStart}
                    onOccupantDragStart={onShelfOccupantDragStart}
                    draggingOccupantId={shelfDrag?.shelfId === a.id ? shelfDrag.placementId : null}
                    draggingOccupantPreview={
                      shelfDrag?.shelfId === a.id && shelfDrag.targetShelfId === a.id
                        ? { offsetMm: shelfDrag.offsetMm, valid: shelfDrag.valid }
                        : null
                    }
                    crossShelfPreview={(() => {
                      if (!shelfDrag || shelfDrag.targetShelfId !== a.id || shelfDrag.shelfId === a.id) return null;
                      const pl = page.placements.find((p) => p.id === shelfDrag.placementId);
                      if (!pl) return null;
                      const dd = deviceDataMap.get(pl.deviceNodeId);
                      if (!dd) return null;
                      const wMm = pl.rotated ? (dd.heightMm ?? 44.45) : (dd.widthMm ?? 482);
                      const hMm = pl.rotated ? (dd.widthMm ?? 482) : (dd.heightMm ?? 44.45);
                      return {
                        offsetMm: shelfDrag.offsetMm, valid: shelfDrag.valid,
                        wMm, hMm, rotated: pl.rotated ?? false,
                        label: dd.label, color: dd.headerColor ?? dd.color ?? "#4a90d9",
                      };
                    })()}
                    snapGuides={shelfDrag?.targetShelfId === a.id ? shelfDrag.guides : null}
                    onOccupantContextMenu={(e, pl) => {
                      const dd = deviceDataMap.get(pl.deviceNodeId);
                      if (!dd) return;
                      setShelfOccupantMenu({ screenX: e.clientX, screenY: e.clientY, placement: pl, deviceData: dd });
                      setRackContextMenu(null);
                      setAccessoryContextMenu(null);
                      setSlotContextMenu(null);
                    }}
                  />
                ))}
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
                      isDragging={inRackDrag?.kind === "device" && inRackDrag.id === pl.id}
                      zoom={zoom}
                      onSelect={setSelectedPlacementId}
                      onDragStart={onPlacementDragStart}
                      onContextMenu={handleDeviceContextMenu}
                      showFacePlateDetail={showFacePlateDetail}
                    />
                  );
                })}
                {dropTarget && dropTarget.rackId === rack.id && (
                  <DropIndicator rack={rack} uPosition={dropTarget.uPosition} heightU={dropTarget.heightU} halfRackSide={dropTarget.halfRackSide} valid={dropTarget.valid} mode={dropTarget.mode} />
                )}
                <text x={RACK_WIDTH / 2} y={totalH + 28} textAnchor="middle" fontSize={9} fill="#444">{statsLine}</text>
                {(stats.unknownDepthCount > 0 || stats.unknownWeightCount > 0 || stats.unknownPowerCount > 0) && (
                  <text x={RACK_WIDTH / 2} y={totalH + 40} textAnchor="middle" fontSize={7} fill="#999">
                    {[
                      stats.unknownDepthCount > 0 ? `${stats.unknownDepthCount} unknown depth` : null,
                      stats.unknownWeightCount > 0 ? `${stats.unknownWeightCount} unknown weight` : null,
                      stats.unknownPowerCount > 0 ? `${stats.unknownPowerCount} unknown power` : null,
                    ].filter(Boolean).join(" · ")}
                  </text>
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
          {showFacePlateDetail && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
              onClick={() => {
                setFacePlateTarget({ nodeId: rackContextMenu.placement.deviceNodeId, deviceData: rackContextMenu.deviceData });
                setRackContextMenu(null);
              }}
            >
              Edit Face-Plate Layout
            </button>
          )}
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

      {/* Empty-slot context menu — Add Accessory cascade + Edit/Delete Rack */}
      {slotContextMenu && (
        <SlotMenu
          menu={slotContextMenu}
          onAdd={handleAddAccessory}
          onEditRack={(rackId) => {
            const r = page.racks.find((x) => x.id === rackId);
            if (r) setEditRackTarget(r);
          }}
          onDeleteRack={(rackId) => {
            const r = page.racks.find((x) => x.id === rackId);
            if (!r) return;
            if (confirm(`Delete "${r.label}"? This removes all devices placed in it.`)) {
              removeRack(page.id, rackId);
            }
          }}
          onClose={() => setSlotContextMenu(null)}
        />
      )}

      {/* Edit Rack dialog (triggered from rack context menu) */}
      {editRackTarget && (
        <EditRackInlineDialog
          rack={editRackTarget}
          onSave={(patch) => {
            updateRack(page.id, editRackTarget.id, patch);
            setEditRackTarget(null);
          }}
          onClose={() => setEditRackTarget(null)}
        />
      )}

      {/* Accessory context menu — resize / rename / depth / remove */}
      {accessoryContextMenu && (() => {
        const accRack = page.racks.find((r) => r.id === accessoryContextMenu.accessory.rackId);
        const rackDepth = accRack?.depthMm ?? 600;
        return (
        <AccessoryMenu
          menu={accessoryContextMenu}
          defaultShelfDepthMm={rackDepth * 0.6}
          maxShelfDepthMm={rackDepth}
          onResize={(heightU) => {
            const a = accessoryContextMenu.accessory;
            const cleanH = Math.max(1, Math.min(20, Math.round(heightU || 1)));
            // Validate U range fits within rack and doesn't collide with other items
            const rack = page.racks.find((r) => r.id === a.rackId);
            if (!rack) { setAccessoryContextMenu(null); return; }
            if (a.uPosition + cleanH - 1 > rack.heightU) {
              addToast(`Can't resize: extends past top of rack`, "error");
              return;
            }
            // Treat current accessory as exempt by computing collisions manually
            const others = page.accessories.filter((o) => o.id !== a.id && o.rackId === a.rackId && o.face === a.face);
            const newTop = a.uPosition + cleanH - 1;
            const collidesWithAcc = others.some((o) => {
              const oTop = o.uPosition + o.heightU - 1;
              return o.uPosition <= newTop && a.uPosition <= oTop;
            });
            const collidesWithDev = page.placements.some((p) => {
              if (p.rackId !== a.rackId || p.face !== a.face || p.mountedOnShelfId) return false;
              const dd = deviceDataMap.get(p.deviceNodeId);
              const dh = dd ? inferRackHeightU(dd) : 1;
              const pTop = p.uPosition + dh - 1;
              return p.uPosition <= newTop && a.uPosition <= pTop;
            });
            if (collidesWithAcc || collidesWithDev) {
              addToast(`Can't resize: would overlap an existing item`, "error");
              return;
            }
            updateRackAccessory(page.id, a.id, { heightU: cleanH });
            setAccessoryContextMenu(null);
          }}
          onRename={(label) => {
            updateRackAccessory(page.id, accessoryContextMenu.accessory.id, { label: label || undefined });
            setAccessoryContextMenu(null);
          }}
          onChangeDepth={(depthMm) => {
            const a = accessoryContextMenu.accessory;
            const cleaned = depthMm == null || Number.isNaN(depthMm)
              ? undefined
              : Math.max(50, Math.min(rackDepth, Math.round(depthMm)));
            updateRackAccessory(page.id, a.id, { shelfDepthMm: cleaned });
            setAccessoryContextMenu(null);
          }}
          onRemove={() => handleRemoveAccessory(accessoryContextMenu.accessory, accessoryContextMenu.occupantCount)}
          onClose={() => setAccessoryContextMenu(null)}
        />
        );
      })()}

      {/* Shelf-occupant context menu — rotate / remove from shelf / edit device */}
      {shelfOccupantMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 text-xs min-w-[180px]"
          style={{ left: shelfOccupantMenu.screenX, top: shelfOccupantMenu.screenY }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1 text-neutral-400 text-[10px] uppercase tracking-wider truncate">
            {shelfOccupantMenu.deviceData.label}
          </div>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
            onClick={() => {
              const cur = !!shelfOccupantMenu.placement.rotated;
              updateRackPlacement(page.id, shelfOccupantMenu.placement.id, { rotated: !cur });
              setShelfOccupantMenu(null);
            }}
          >
            {shelfOccupantMenu.placement.rotated ? "Lay flat" : "Rotate (lay on side)"}
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
            onClick={() => {
              setEditingNodeId(shelfOccupantMenu.placement.deviceNodeId);
              setShelfOccupantMenu(null);
            }}
          >
            Edit Device
          </button>
          <div className="border-t border-neutral-100 my-0.5" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 text-red-600"
            onClick={() => {
              removeRackPlacement(page.id, shelfOccupantMenu.placement.id);
              setShelfOccupantMenu(null);
            }}
          >
            Remove from shelf (unrack)
          </button>
        </div>
      )}

      {/* Shelf-delete confirm dialog (occupants present) */}
      {shelfDeleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]" onClick={() => setShelfDeleteConfirm(null)}>
          <div className="bg-white rounded-lg shadow-xl p-4 w-80 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-2">Remove shelf?</h3>
            <p className="text-neutral-600 mb-3">
              "{shelfDeleteConfirm.label}" has {shelfDeleteConfirm.occupantCount} mounted device{shelfDeleteConfirm.occupantCount === 1 ? "" : "s"}.
              Removing the shelf will return {shelfDeleteConfirm.occupantCount === 1 ? "it" : "them"} to the unracked sidebar pool.
            </p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => setShelfDeleteConfirm(null)}>Cancel</button>
              <button
                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  removeRackAccessoryWithOccupants(page.id, shelfDeleteConfirm.accessoryId);
                  setShelfDeleteConfirm(null);
                }}
              >
                Remove shelf & unrack devices
              </button>
            </div>
          </div>
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
