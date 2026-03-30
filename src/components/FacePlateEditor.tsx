import { useState, useCallback, useRef, useMemo } from "react";
import type { DeviceData, FacePlateLayout, FacePlateLabel } from "../types";
import { autoLayoutPorts, inferRackHeightU } from "../rackUtils";
import { ConnectorIcon } from "./connectorIcons";
import { SIGNAL_COLORS } from "../types";

interface FacePlateEditorProps {
  deviceData: DeviceData;
  onSave: (layout: FacePlateLayout) => void;
  onClose: () => void;
}

const EDITOR_WIDTH = 500;
const MIN_HEIGHT = 140;
const ICON_SIZE = 22;
const PAD = 24;

export default function FacePlateEditor({ deviceData, onSave, onClose }: FacePlateEditorProps) {
  const heightU = inferRackHeightU(deviceData);
  const faceH = Math.max(MIN_HEIGHT, heightU * 50);
  const svgW = EDITOR_WIDTH + PAD * 2;
  const svgH = faceH + PAD * 2;

  // Auto-layout as fallback
  const autoLayout = useMemo(
    () => autoLayoutPorts(deviceData.ports ?? [], EDITOR_WIDTH, faceH),
    [deviceData.ports, faceH],
  );

  // Initialize positions from existing layout or auto-layout
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    if (deviceData.facePlateLayout?.positions) {
      return { ...deviceData.facePlateLayout.positions };
    }
    const pos: Record<string, { x: number; y: number }> = {};
    for (const lp of autoLayout) {
      pos[lp.id] = { x: lp.x, y: lp.y };
    }
    return pos;
  });

  const [labels, setLabels] = useState<FacePlateLabel[]>(
    () => (deviceData.facePlateLayout?.labels ? [...deviceData.facePlateLayout.labels] : []),
  );

  // Device label position and size
  const [deviceLabelPos, setDeviceLabelPos] = useState<{ x: number; y: number; fontSize: number }>(
    () => ({
      x: deviceData.facePlateLayout?.deviceLabel?.x ?? 50,
      y: deviceData.facePlateLayout?.deviceLabel?.y ?? 8,
      fontSize: deviceData.facePlateLayout?.deviceLabel?.fontSize ?? 12,
    }),
  );

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const DEVICE_LABEL_ID = "__device_label__";

  const dragRef = useRef<{
    type: "port" | "label" | "device-label";
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Snap uses a square pixel grid — X snaps to gridSize%, Y snaps to the equivalent pixel distance as a percentage of faceH
  const yGridSize = useMemo(() => {
    const cellPx = (gridSize / 100) * EDITOR_WIDTH;
    return (cellPx / faceH) * 100;
  }, [gridSize, faceH]);

  const snapX = useCallback(
    (val: number) => {
      const clamped = Math.max(2, Math.min(98, val));
      if (!snapEnabled) return clamped;
      return Math.max(2, Math.min(98, Math.round(clamped / gridSize) * gridSize));
    },
    [snapEnabled, gridSize],
  );

  const snapY = useCallback(
    (val: number) => {
      const clamped = Math.max(2, Math.min(98, val));
      if (!snapEnabled) return clamped;
      return Math.max(2, Math.min(98, Math.round(clamped / yGridSize) * yGridSize));
    },
    [snapEnabled, yGridSize],
  );

  // Convert mouse position to face-plate percentage coordinates
  const toFaceCoords = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 50, y: 50 };
      const rect = svg.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left - PAD) / EDITOR_WIDTH) * 100,
        y: ((e.clientY - rect.top - PAD) / faceH) * 100,
      };
    },
    [faceH],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string, type: "port" | "label" | "device-label") => {
      e.preventDefault();
      e.stopPropagation();
      const coords = toFaceCoords(e);
      const pos = type === "port" ? positions[id] : type === "device-label" ? deviceLabelPos : labels.find((l) => l.id === id);
      if (!pos) return;
      dragRef.current = { type, id, offsetX: coords.x - pos.x, offsetY: coords.y - pos.y };
      setSelectedId(id);
    },
    [toFaceCoords, positions, labels, deviceLabelPos],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current) return;
      const coords = toFaceCoords(e);
      const { type, id, offsetX, offsetY } = dragRef.current;
      const newX = snapX(coords.x - offsetX);
      const newY = snapY(coords.y - offsetY);
      if (type === "port") {
        setPositions((prev) => ({ ...prev, [id]: { x: newX, y: newY } }));
      } else if (type === "device-label") {
        setDeviceLabelPos((prev) => ({ ...prev, x: newX, y: newY }));
      } else {
        setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, x: newX, y: newY } : l)));
      }
    },
    [toFaceCoords, snapX, snapY],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleResetLayout = useCallback(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const lp of autoLayout) {
      pos[lp.id] = { x: lp.x, y: lp.y };
    }
    setPositions(pos);
    setLabels([]);
    setDeviceLabelPos({ x: 50, y: 8, fontSize: 12 });
    setSelectedId(null);
  }, [autoLayout]);

  const handleAddLabel = useCallback(() => {
    const id = `lbl-${Date.now()}`;
    setLabels((prev) => [...prev, { id, text: "LABEL", x: 50, y: 8 }]);
    setSelectedId(id);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    // Only labels can be deleted — ports are always present
    if (labels.find((l) => l.id === selectedId)) {
      setLabels((prev) => prev.filter((l) => l.id !== selectedId));
      setSelectedId(null);
    }
  }, [selectedId, labels]);

  const handleSave = useCallback(() => {
    onSave({
      positions,
      labels: labels.length > 0 ? labels : undefined,
      deviceLabel: { x: deviceLabelPos.x, y: deviceLabelPos.y, fontSize: deviceLabelPos.fontSize },
    });
  }, [positions, labels, deviceLabelPos, onSave]);

  // Port data lookup
  const portMap = useMemo(() => {
    const map = new Map<string, (typeof deviceData.ports)[number]>();
    for (const p of deviceData.ports ?? []) map.set(p.id, p);
    return map;
  }, [deviceData.ports]);

  const portIds = useMemo(() => (deviceData.ports ?? []).map((p) => p.id), [deviceData.ports]);

  // Selected item info for status
  const selectedPort = selectedId ? portMap.get(selectedId) : null;
  const selectedLabel = selectedId ? labels.find((l) => l.id === selectedId) : null;
  const selectedPos = selectedId ? positions[selectedId] : null;
  const isDeviceLabelSelected = selectedId === DEVICE_LABEL_ID;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col text-xs"
        style={{ width: svgW + 40, maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Delete" || e.key === "Backspace") handleDeleteSelected();
          if (e.key === "Escape") { if (selectedId) setSelectedId(null); else onClose(); }
        }}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div>
            <h3 className="font-semibold text-sm">Face-Plate Layout</h3>
            <span className="text-neutral-400">{deviceData.label} — {heightU}U</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50 text-xs"
              onClick={handleResetLayout}
              title="Reset all positions to auto-layout"
            >
              Reset
            </button>
            <button
              className="text-neutral-400 hover:text-neutral-600 text-lg leading-none"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-4 flex justify-center bg-neutral-50">
          <svg
            ref={svgRef}
            width={svgW}
            height={svgH}
            className="select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={() => setSelectedId(null)}
          >
            {/* Face-plate background */}
            <rect
              x={PAD}
              y={PAD}
              width={EDITOR_WIDTH}
              height={faceH}
              rx={3}
              fill="#e5e5e5"
              stroke="#a3a3a3"
              strokeWidth={1.5}
            />

            {/* Grid — square cells based on pixel spacing, not percentage */}
            {snapEnabled && (() => {
              // Use the X grid spacing (in px) as the cell size for both axes
              const cellPx = (gridSize / 100) * EDITOR_WIDTH;
              const vLines = Math.floor(EDITOR_WIDTH / cellPx) - 1;
              const hLines = Math.floor(faceH / cellPx) - 1;
              return (
                <g>
                  {Array.from({ length: vLines }, (_, i) => {
                    const gx = PAD + cellPx * (i + 1);
                    return <line key={`v${i}`} x1={gx} y1={PAD} x2={gx} y2={PAD + faceH} stroke="#d4d4d4" strokeWidth={0.5} />;
                  })}
                  {Array.from({ length: hLines }, (_, i) => {
                    const gy = PAD + cellPx * (i + 1);
                    return <line key={`h${i}`} x1={PAD} y1={gy} x2={PAD + EDITOR_WIDTH} y2={gy} stroke="#d4d4d4" strokeWidth={0.5} />;
                  })}
                </g>
              );
            })()}

            {/* Device label — draggable and resizable */}
            {(() => {
              const dlx = PAD + (deviceLabelPos.x / 100) * EDITOR_WIDTH;
              const dly = PAD + (deviceLabelPos.y / 100) * faceH;
              const isSelected = selectedId === DEVICE_LABEL_ID;
              return (
                <g>
                  {isSelected && (
                    <rect
                      x={dlx - 50}
                      y={dly - deviceLabelPos.fontSize * 0.6}
                      width={100}
                      height={deviceLabelPos.fontSize * 1.2}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      rx={2}
                    />
                  )}
                  <text
                    x={dlx}
                    y={dly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={deviceLabelPos.fontSize}
                    fontWeight={700}
                    fill="#333"
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => handleMouseDown(e, DEVICE_LABEL_ID, "device-label")}
                  >
                    {deviceData.label}
                  </text>
                </g>
              );
            })()}

            {/* Section labels */}
            {labels.map((lbl) => {
              const lx = PAD + (lbl.x / 100) * EDITOR_WIDTH;
              const ly = PAD + (lbl.y / 100) * faceH;
              const isSelected = selectedId === lbl.id;
              return (
                <g key={lbl.id}>
                  {isSelected && (
                    <rect
                      x={lx - 35}
                      y={ly - 9}
                      width={70}
                      height={18}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      rx={2}
                    />
                  )}
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontWeight={700}
                    fill="#525252"
                    letterSpacing={1}
                    style={{ cursor: "grab", textTransform: "uppercase" }}
                    onMouseDown={(e) => handleMouseDown(e, lbl.id, "label")}
                  >
                    {lbl.text}
                  </text>
                </g>
              );
            })}

            {/* Port connectors */}
            {portIds.map((pid) => {
              const port = portMap.get(pid);
              const pos = positions[pid];
              if (!port || !pos) return null;

              const cx = PAD + (pos.x / 100) * EDITOR_WIDTH;
              const cy = PAD + (pos.y / 100) * faceH;
              const sigColor =
                (SIGNAL_COLORS as Record<string, string>)[port.signalType] ?? "#888";
              const isSelected = selectedId === pid;

              return (
                <g
                  key={pid}
                  style={{ cursor: "grab" }}
                  onMouseDown={(e) => handleMouseDown(e, pid, "port")}
                >
                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={ICON_SIZE * 0.75}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                  )}
                  {/* Connector icon */}
                  <ConnectorIcon
                    x={cx}
                    y={cy}
                    connectorType={port.connectorType}
                    size={ICON_SIZE}
                    color={sigColor}
                    detail={2}
                  />
                  {/* Port label */}
                  <text
                    x={cx}
                    y={cy + ICON_SIZE * 0.75}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#525252"
                  >
                    {port.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={(e) => setSnapEnabled(e.target.checked)}
                className="rounded accent-blue-600"
              />
              <span>Snap</span>
            </label>
            {snapEnabled && (
              <select
                className="border border-neutral-300 rounded px-1.5 py-0.5 text-xs"
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
              >
                <option value={2}>2%</option>
                <option value={5}>5%</option>
                <option value={10}>10%</option>
              </select>
            )}
            <button
              className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50"
              onClick={handleAddLabel}
            >
              + Label
            </button>
            {/* Status bar */}
            <span className="text-neutral-400 ml-2">
              {isDeviceLabelSelected
                ? `Device label — (${deviceLabelPos.x.toFixed(0)}%, ${deviceLabelPos.y.toFixed(0)}%)`
                : selectedPort && selectedPos
                  ? `${selectedPort.label} — (${selectedPos.x.toFixed(0)}%, ${selectedPos.y.toFixed(0)}%)`
                  : selectedLabel
                    ? `"${selectedLabel.text}" — (${selectedLabel.x.toFixed(0)}%, ${selectedLabel.y.toFixed(0)}%)`
                    : `${portIds.length} ports`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Device label font size control */}
            {isDeviceLabelSelected && (
              <div className="flex items-center gap-1 mr-2">
                <span className="text-neutral-500">Size</span>
                <input
                  type="range"
                  min={6}
                  max={20}
                  step={1}
                  value={deviceLabelPos.fontSize}
                  onChange={(e) => setDeviceLabelPos((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
                  className="w-20 accent-blue-600"
                />
                <span className="text-neutral-500 w-6 text-right">{deviceLabelPos.fontSize}</span>
              </div>
            )}
            {/* Inline label text editor */}
            {selectedLabel && (
              <input
                className="border border-neutral-300 rounded px-2 py-0.5 text-xs w-28"
                value={selectedLabel.text}
                autoFocus
                onChange={(e) => {
                  const val = e.target.value;
                  setLabels((prev) =>
                    prev.map((l) => (l.id === selectedId ? { ...l, text: val } : l)),
                  );
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") setSelectedId(null);
                }}
                placeholder="Label text"
              />
            )}
            <button
              className="px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
