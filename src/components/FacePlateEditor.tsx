import { useState, useCallback, useRef, useMemo, type WheelEvent } from "react";
import type { DeviceData, FacePlateLayout, FacePlateLabel } from "../types";
import { autoLayoutPorts, inferRackHeightU, PX_PER_U, DEVICE_WIDTH_PX, PX_PER_MM } from "../rackUtils";
import { ConnectorIcon, getConnectorSpec } from "./connectorIcons";
import { SIGNAL_COLORS } from "../types";

interface FacePlateEditorProps {
  deviceData: DeviceData;
  onSave: (layout: FacePlateLayout) => void;
  onClose: () => void;
}

// Canonical padding around face plate (in rack-pixel units)
const PAD = 6;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const DEVICE_LABEL_ID = "__device_label__";

/** Compute device label font size — same formula as rack view */
function computeDeviceLabelFont(fontSize: number, h: number) {
  return Math.max(4, fontSize * (h / 140));
}

export default function FacePlateEditor({ deviceData, onSave, onClose }: FacePlateEditorProps) {
  const heightU = inferRackHeightU(deviceData);

  // Canonical dimensions — exactly match the rack view
  const canonW = DEVICE_WIDTH_PX;
  const canonH = heightU * PX_PER_U - 1;
  const svgW = canonW + PAD * 2;
  const svgH = canonH + PAD * 2;

  // Face-plate rendering sizes
  const availableHeight = canonH - 14;
  const showPortLabels = availableHeight >= 30;
  const deviceColor = deviceData.headerColor ?? deviceData.color ?? "#4a90d9";

  // Zoom & pan state — start zoomed to fit
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Auto-layout as fallback
  const autoLayout = useMemo(
    () => autoLayoutPorts(deviceData.ports ?? [], canonW, canonH),
    [deviceData.ports, canonW, canonH],
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

  // Device label position and size (fontSize is "design intent" — gets scaled by h/140)
  const [deviceLabelPos, setDeviceLabelPos] = useState<{ x: number; y: number; fontSize: number }>(
    () => ({
      x: deviceData.facePlateLayout?.deviceLabel?.x ?? 50,
      y: deviceData.facePlateLayout?.deviceLabel?.y ?? 8,
      fontSize: deviceData.facePlateLayout?.deviceLabel?.fontSize ?? 12,
    }),
  );

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(2);

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Undo / redo
  type Snapshot = {
    positions: Record<string, { x: number; y: number }>;
    labels: FacePlateLabel[];
    deviceLabelPos: { x: number; y: number; fontSize: number };
  };
  const historyRef = useRef<{ stack: Snapshot[]; index: number }>({ stack: [], index: -1 });

  const pushUndo = useCallback(() => {
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push({
      positions: { ...positions },
      labels: labels.map((l) => ({ ...l })),
      deviceLabelPos: { ...deviceLabelPos },
    });
    h.index = h.stack.length - 1;
  }, [positions, labels, deviceLabelPos]);

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (h.index < 0) return;
    if (h.index === h.stack.length - 1) {
      h.stack.push({
        positions: { ...positions },
        labels: labels.map((l) => ({ ...l })),
        deviceLabelPos: { ...deviceLabelPos },
      });
    }
    const snap = h.stack[h.index];
    h.index--;
    setPositions(snap.positions);
    setLabels(snap.labels);
    setDeviceLabelPos(snap.deviceLabelPos);
  }, [positions, labels, deviceLabelPos]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 2) return;
    h.index += 2;
    const snap = h.stack[h.index];
    h.index--;
    setPositions(snap.positions);
    setLabels(snap.labels);
    setDeviceLabelPos(snap.deviceLabelPos);
  }, []);

  // Drag state — tracks group drag with initial positions
  const dragRef = useRef<{
    type: "port" | "label" | "device-label";
    id: string;
    offsetX: number;
    offsetY: number;
    initPositions: Record<string, { x: number; y: number }>;
  } | null>(null);

  // Marquee selection state
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeRef = useRef<{ startX: number; startY: number } | null>(null);
  const justFinishedInteraction = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);

  // Snap — square pixel grid using percentage coordinates
  const yGridSize = useMemo(() => {
    const cellPx = (gridSize / 100) * canonW;
    return (cellPx / canonH) * 100;
  }, [gridSize, canonW, canonH]);

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

  // Convert mouse position to face-plate percentage coordinates (viewBox-aware via getScreenCTM)
  const toFaceCoords = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 50, y: 50 };
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 50, y: 50 };
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      return {
        x: ((svgPt.x - PAD) / canonW) * 100,
        y: ((svgPt.y - PAD) / canonH) * 100,
      };
    },
    [canonW, canonH],
  );

  // Get position for any item by id
  const getItemPos = useCallback((id: string): { x: number; y: number } | undefined => {
    if (id === DEVICE_LABEL_ID) return deviceLabelPos;
    if (positions[id]) return positions[id];
    return labels.find((l) => l.id === id);
  }, [positions, labels, deviceLabelPos]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string, type: "port" | "label" | "device-label") => {
      e.preventDefault();
      e.stopPropagation();
      const coords = toFaceCoords(e);
      const pos = getItemPos(id);
      if (!pos) return;

      // Multi-select with shift
      let newSelection: Set<string>;
      if (e.shiftKey) {
        newSelection = new Set(selectedIds);
        if (newSelection.has(id)) newSelection.delete(id);
        else newSelection.add(id);
      } else if (!selectedIds.has(id)) {
        newSelection = new Set([id]);
      } else {
        newSelection = selectedIds;
      }
      setSelectedIds(newSelection);

      // Snapshot initial positions for group drag
      const initPositions: Record<string, { x: number; y: number }> = {};
      for (const sid of newSelection) {
        const spos = sid === id ? pos : getItemPos(sid);
        if (spos) initPositions[sid] = { x: spos.x, y: spos.y };
      }

      pushUndo();
      dragRef.current = { type, id, offsetX: coords.x - pos.x, offsetY: coords.y - pos.y, initPositions };
    },
    [toFaceCoords, getItemPos, selectedIds, pushUndo],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Marquee dragging
      if (marqueeRef.current) {
        const coords = toFaceCoords(e);
        setMarquee({
          x1: marqueeRef.current.startX,
          y1: marqueeRef.current.startY,
          x2: coords.x,
          y2: coords.y,
        });
        return;
      }

      if (!dragRef.current) return;
      const coords = toFaceCoords(e);
      const { id, offsetX, offsetY, initPositions } = dragRef.current;

      const initPos = initPositions[id];
      if (!initPos) return;
      const snappedX = snapX(coords.x - offsetX);
      const snappedY = snapY(coords.y - offsetY);
      const dx = snappedX - initPos.x;
      const dy = snappedY - initPos.y;

      const updatedPorts: Record<string, { x: number; y: number }> = {};
      const updatedLabels: { id: string; x: number; y: number }[] = [];
      let updatedDeviceLabel: { x: number; y: number } | null = null;

      for (const [sid, spos] of Object.entries(initPositions)) {
        const newX = Math.max(2, Math.min(98, spos.x + dx));
        const newY = Math.max(2, Math.min(98, spos.y + dy));
        if (sid === DEVICE_LABEL_ID) {
          updatedDeviceLabel = { x: newX, y: newY };
        } else if (positions[sid]) {
          updatedPorts[sid] = { x: newX, y: newY };
        } else {
          updatedLabels.push({ id: sid, x: newX, y: newY });
        }
      }

      if (Object.keys(updatedPorts).length > 0) {
        setPositions((prev) => ({ ...prev, ...updatedPorts }));
      }
      if (updatedLabels.length > 0) {
        setLabels((prev) => prev.map((l) => {
          const upd = updatedLabels.find((u) => u.id === l.id);
          return upd ? { ...l, x: upd.x, y: upd.y } : l;
        }));
      }
      if (updatedDeviceLabel) {
        setDeviceLabelPos((prev) => ({ ...prev, ...updatedDeviceLabel }));
      }
    },
    [toFaceCoords, snapX, snapY, positions],
  );

  const handleMouseUp = useCallback(() => {
    if (marqueeRef.current && marquee) {
      const minX = Math.min(marquee.x1, marquee.x2);
      const maxX = Math.max(marquee.x1, marquee.x2);
      const minY = Math.min(marquee.y1, marquee.y2);
      const maxY = Math.max(marquee.y1, marquee.y2);

      const hits = new Set<string>();
      for (const [pid, pos] of Object.entries(positions)) {
        if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) hits.add(pid);
      }
      for (const lbl of labels) {
        if (lbl.x >= minX && lbl.x <= maxX && lbl.y >= minY && lbl.y <= maxY) hits.add(lbl.id);
      }
      if (deviceLabelPos.x >= minX && deviceLabelPos.x <= maxX &&
          deviceLabelPos.y >= minY && deviceLabelPos.y <= maxY) {
        hits.add(DEVICE_LABEL_ID);
      }

      setSelectedIds(hits);
      setMarquee(null);
      marqueeRef.current = null;
    }

    dragRef.current = null;
    panRef.current = null;
    justFinishedInteraction.current = true;
  }, [marquee, positions, labels, deviceLabelPos]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const ratio = newZoom / zoom;
    setPan((prev) => ({
      x: svgPt.x - (svgPt.x - prev.x) * ratio,
      y: svgPt.y - (svgPt.y - prev.y) * ratio,
    }));
    setZoom(newZoom);
  }, [zoom]);

  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (e.button === 0) {
      const coords = toFaceCoords(e);
      marqueeRef.current = { startX: coords.x, startY: coords.y };
      setMarquee({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
      if (!e.shiftKey) setSelectedIds(new Set());
    }
  }, [pan, toFaceCoords]);

  const handleBgMouseMove = useCallback((e: React.MouseEvent) => {
    if (panRef.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const scale = ctm.a;
      const dx = (e.clientX - panRef.current.startX) / scale;
      const dy = (e.clientY - panRef.current.startY) / scale;
      setPan({ x: panRef.current.panX + dx, y: panRef.current.panY + dy });
      return;
    }
    handleMouseMove(e);
  }, [handleMouseMove]);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleResetLayout = useCallback(() => {
    pushUndo();
    const pos: Record<string, { x: number; y: number }> = {};
    for (const lp of autoLayout) {
      pos[lp.id] = { x: lp.x, y: lp.y };
    }
    setPositions(pos);
    setLabels([]);
    setDeviceLabelPos({ x: 50, y: 8, fontSize: 12 });
    setSelectedIds(new Set());
  }, [autoLayout, pushUndo]);

  const handleAddLabel = useCallback(() => {
    pushUndo();
    const id = `lbl-${Date.now()}`;
    setLabels((prev) => [...prev, { id, text: "LABEL", x: 50, y: 8 }]);
    setSelectedIds(new Set([id]));
  }, [pushUndo]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const labelIds = new Set(labels.map((l) => l.id));
    const toDelete = [...selectedIds].filter((id) => labelIds.has(id));
    if (toDelete.length > 0) {
      pushUndo();
      const delSet = new Set(toDelete);
      setLabels((prev) => prev.filter((l) => !delSet.has(l.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of toDelete) next.delete(id);
        return next;
      });
    }
  }, [selectedIds, labels, pushUndo]);

  const handleSave = useCallback(() => {
    onSave({
      positions,
      labels: labels.length > 0 ? labels : undefined,
      deviceLabel: { x: deviceLabelPos.x, y: deviceLabelPos.y, fontSize: deviceLabelPos.fontSize },
    });
  }, [positions, labels, deviceLabelPos, onSave]);

  // ── Align / Distribute ──────────────────────────────────────────────

  const getSelectedPositions = useCallback(() => {
    const items: { id: string; x: number; y: number }[] = [];
    for (const id of selectedIds) {
      const pos = getItemPos(id);
      if (pos) items.push({ id, x: pos.x, y: pos.y });
    }
    return items;
  }, [selectedIds, getItemPos]);

  const applyPositions = useCallback((items: { id: string; x: number; y: number }[]) => {
    const portUpdates: Record<string, { x: number; y: number }> = {};
    const labelUpdates: { id: string; x: number; y: number }[] = [];
    let devLabel: { x: number; y: number } | null = null;

    for (const item of items) {
      if (item.id === DEVICE_LABEL_ID) {
        devLabel = { x: item.x, y: item.y };
      } else if (positions[item.id]) {
        portUpdates[item.id] = { x: item.x, y: item.y };
      } else {
        labelUpdates.push(item);
      }
    }
    if (Object.keys(portUpdates).length > 0) {
      setPositions((prev) => ({ ...prev, ...portUpdates }));
    }
    if (labelUpdates.length > 0) {
      setLabels((prev) => prev.map((l) => {
        const upd = labelUpdates.find((u) => u.id === l.id);
        return upd ? { ...l, x: upd.x, y: upd.y } : l;
      }));
    }
    if (devLabel) {
      setDeviceLabelPos((prev) => ({ ...prev, ...devLabel }));
    }
  }, [positions]);

  const handleAlign = useCallback((axis: "x" | "y", edge: "min" | "mid" | "max") => {
    const items = getSelectedPositions();
    if (items.length < 2) return;
    pushUndo();
    const values = items.map((it) => axis === "x" ? it.x : it.y);
    let target: number;
    if (edge === "min") target = Math.min(...values);
    else if (edge === "max") target = Math.max(...values);
    else target = (Math.min(...values) + Math.max(...values)) / 2;
    applyPositions(items.map((it) => ({
      ...it,
      x: axis === "x" ? target : it.x,
      y: axis === "y" ? target : it.y,
    })));
  }, [getSelectedPositions, applyPositions, pushUndo]);

  const handleDistribute = useCallback((axis: "x" | "y") => {
    const items = getSelectedPositions();
    if (items.length < 3) return;
    pushUndo();
    const sorted = [...items].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
    const first = axis === "x" ? sorted[0].x : sorted[0].y;
    const last = axis === "x" ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y;
    const step = (last - first) / (sorted.length - 1);
    applyPositions(sorted.map((it, i) => ({
      ...it,
      x: axis === "x" ? first + step * i : it.x,
      y: axis === "y" ? first + step * i : it.y,
    })));
  }, [getSelectedPositions, applyPositions, pushUndo]);

  // ── Port data ───────────────────────────────────────────────────────

  const portMap = useMemo(() => {
    const map = new Map<string, (typeof deviceData.ports)[number]>();
    for (const p of deviceData.ports ?? []) map.set(p.id, p);
    return map;
  }, [deviceData.ports]);

  const portIds = useMemo(() => (deviceData.ports ?? []).map((p) => p.id), [deviceData.ports]);

  // Layout ports — same logic as rack view
  const layoutPorts = useMemo(() => {
    const auto = autoLayoutPorts(deviceData.ports ?? [], canonW, canonH);
    const custom = positions;
    return auto.map((lp) => {
      const pos = custom[lp.id];
      return pos ? { ...lp, x: pos.x, y: pos.y } : lp;
    });
  }, [deviceData.ports, canonW, canonH, positions]);

  // Status info
  const singleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const selectedPort = singleSelectedId ? portMap.get(singleSelectedId) : null;
  const selectedLabel = singleSelectedId ? labels.find((l) => l.id === singleSelectedId) : null;
  const selectedPos = singleSelectedId ? positions[singleSelectedId] : null;
  const isDeviceLabelSelected = singleSelectedId === DEVICE_LABEL_ID;

  // Computed device label font (same formula as rack view)
  const dlFontSize = computeDeviceLabelFont(deviceLabelPos.fontSize, canonH);

  // Marquee rect in canonical SVG coordinates
  const marqueeRect = marquee ? {
    x: PAD + (Math.min(marquee.x1, marquee.x2) / 100) * canonW,
    y: PAD + (Math.min(marquee.y1, marquee.y2) / 100) * canonH,
    w: (Math.abs(marquee.x2 - marquee.x1) / 100) * canonW,
    h: (Math.abs(marquee.y2 - marquee.y1) / 100) * canonH,
  } : null;

  // Stroke widths scaled for canonical coordinates (will look normal when viewBox scales up)
  const thinStroke = 0.5;
  const selStroke = 0.4;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose} onWheel={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col text-xs"
        style={{ width: "90vw", height: "90vh", maxWidth: 1400 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Delete" || e.key === "Backspace") handleDeleteSelected();
          if (e.key === "Escape") { if (selectedIds.size > 0) setSelectedIds(new Set()); else onClose(); }
          if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setSelectedIds(new Set(portIds));
          }
          if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            handleUndo();
          }
          if ((e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === "y" && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            handleRedo();
          }
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

        {/* Canvas — renders at canonical rack dimensions, viewBox scales up */}
        <div className="flex-1 overflow-hidden bg-neutral-100 relative" style={{ minHeight: 0 }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`${svgW / 2 - svgW / (2 * zoom) - pan.x} ${svgH / 2 - svgH / (2 * zoom) - pan.y} ${svgW / zoom} ${svgH / zoom}`}
            className="select-none"
            onMouseMove={handleBgMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={handleBgMouseDown}
            onWheel={handleWheel}
            onClick={() => { if (justFinishedInteraction.current) { justFinishedInteraction.current = false; return; } setSelectedIds(new Set()); }}
          >
            {/* Face-plate background — uses device color, same as rack view */}
            <rect
              x={PAD}
              y={PAD}
              width={canonW}
              height={canonH}
              rx={1}
              fill={deviceColor}
              stroke="#333"
              strokeWidth={0.75}
            />

            {/* Snap grid — thin lines at canonical scale */}
            {snapEnabled && (() => {
              const cellPx = (gridSize / 100) * canonW;
              const vLines = Math.floor(canonW / cellPx) - 1;
              const hLines = Math.floor(canonH / cellPx) - 1;
              return (
                <g>
                  {Array.from({ length: vLines }, (_, i) => {
                    const gx = PAD + cellPx * (i + 1);
                    return <line key={`v${i}`} x1={gx} y1={PAD} x2={gx} y2={PAD + canonH} stroke="rgba(255,255,255,0.15)" strokeWidth={0.25} />;
                  })}
                  {Array.from({ length: hLines }, (_, i) => {
                    const gy = PAD + cellPx * (i + 1);
                    return <line key={`h${i}`} x1={PAD} y1={gy} x2={PAD + canonW} y2={gy} stroke="rgba(255,255,255,0.15)" strokeWidth={0.25} />;
                  })}
                </g>
              );
            })()}

            {/* Device label — same rendering as rack view */}
            {(() => {
              const dlx = PAD + (deviceLabelPos.x / 100) * canonW;
              const dly = PAD + (deviceLabelPos.y / 100) * canonH;
              const isSel = selectedIds.has(DEVICE_LABEL_ID);
              const truncLabel = deviceData.label.length > 28 ? deviceData.label.slice(0, 27) + "…" : deviceData.label;
              return (
                <g>
                  {isSel && (
                    <rect
                      x={dlx - dlFontSize * 3}
                      y={dly - dlFontSize * 0.6}
                      width={dlFontSize * 6}
                      height={dlFontSize * 1.2}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={selStroke}
                      strokeDasharray="1 0.5"
                      rx={0.5}
                    />
                  )}
                  <text
                    x={dlx}
                    y={dly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={dlFontSize}
                    fontWeight={600}
                    fill="#fff"
                    style={{ cursor: "grab" }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleMouseDown(e, DEVICE_LABEL_ID, "device-label")}
                  >
                    {truncLabel}
                  </text>
                </g>
              );
            })()}

            {/* Section labels — same rendering as rack view */}
            {labels.map((lbl) => {
              const lx = PAD + (lbl.x / 100) * canonW;
              const ly = PAD + (lbl.y / 100) * canonH;
              const isSel = selectedIds.has(lbl.id);
              return (
                <g key={lbl.id}>
                  {isSel && (
                    <rect
                      x={lx - 10}
                      y={ly - 2.5}
                      width={20}
                      height={5}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={selStroke}
                      strokeDasharray="1 0.5"
                      rx={0.5}
                    />
                  )}
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={3.5}
                    fontWeight={700}
                    fill="rgba(255,255,255,0.6)"
                    letterSpacing={0.5}
                    style={{ cursor: "grab", textTransform: "uppercase" }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleMouseDown(e, lbl.id, "label")}
                  >
                    {lbl.text}
                  </text>
                </g>
              );
            })}

            {/* Connector icons — same rendering as rack view */}
            {layoutPorts.map((lp) => {
              const port = portMap.get(lp.id);
              if (!port) return null;
              const cx = PAD + (lp.x / 100) * canonW;
              const cy = PAD + (lp.y / 100) * canonH;
              const sigColor = (SIGNAL_COLORS as Record<string, string>)[lp.signalType] ?? "#fff";
              const isSel = selectedIds.has(lp.id);

              return (
                <g
                  key={lp.id}
                  style={{ cursor: "grab" }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => handleMouseDown(e, lp.id, "port")}
                >
                  {/* Selection ring */}
                  {isSel && (() => {
                    const spec = getConnectorSpec(lp.connectorType);
                    const selR = Math.max(spec.widthMm, spec.heightMm) * PX_PER_MM / 2 + 1;
                    return (
                      <circle cx={cx} cy={cy} r={selR}
                        fill="none" stroke="#3b82f6" strokeWidth={selStroke} strokeDasharray="1 0.5"
                      />
                    );
                  })()}
                  {/* Connector icon — same size as rack view */}
                  <ConnectorIcon
                    x={cx}
                    y={cy}
                    connectorType={lp.connectorType}
                    scale={PX_PER_MM}
                    color={sigColor}
                    detail={2}
                  />
                  {/* Port label — same as rack view */}
                  {showPortLabels && (
                    <text
                      x={cx}
                      y={cy + (getConnectorSpec(lp.connectorType).heightMm * PX_PER_MM) / 2 + 3}
                      textAnchor="middle"
                      fontSize={4}
                      fill="rgba(255,255,255,0.8)"
                    >
                      {port.label.length > 8 ? port.label.slice(0, 7) + "…" : port.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Marquee selection rectangle */}
            {marqueeRect && (
              <rect
                x={marqueeRect.x}
                y={marqueeRect.y}
                width={marqueeRect.w}
                height={marqueeRect.h}
                fill="rgba(59,130,246,0.15)"
                stroke="#3b82f6"
                strokeWidth={thinStroke}
                strokeDasharray="1.5 0.75"
                style={{ pointerEvents: "none" }}
              />
            )}
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
                <option value={1}>Fine</option>
                <option value={2}>Medium</option>
                <option value={5}>Coarse</option>
              </select>
            )}
            <button
              className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50"
              onClick={handleAddLabel}
            >
              + Label
            </button>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">{Math.round(zoom * 100)}%</span>
            {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
              <button
                className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50"
                onClick={handleResetView}
              >
                Reset View
              </button>
            )}

            {/* Align / distribute — visible when 2+ items selected */}
            {selectedIds.size >= 2 && (
              <>
                <span className="text-neutral-400">|</span>
                <span className="text-neutral-500">Align:</span>
                <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleAlign("x", "min")} title="Align left">L</button>
                <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleAlign("x", "mid")} title="Align center horizontally">CX</button>
                <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleAlign("x", "max")} title="Align right">R</button>
                <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleAlign("y", "min")} title="Align top">T</button>
                <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleAlign("y", "mid")} title="Align center vertically">CY</button>
                <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleAlign("y", "max")} title="Align bottom">B</button>
                {selectedIds.size >= 3 && (
                  <>
                    <span className="text-neutral-400">|</span>
                    <span className="text-neutral-500">Distribute:</span>
                    <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleDistribute("x")} title="Distribute horizontally">H</button>
                    <button className="px-1.5 py-0.5 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => handleDistribute("y")} title="Distribute vertically">V</button>
                  </>
                )}
              </>
            )}

            {/* Status bar */}
            <span className="text-neutral-400 ml-2">
              {selectedIds.size > 1
                ? `${selectedIds.size} items selected`
                : isDeviceLabelSelected
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
                    prev.map((l) => (l.id === singleSelectedId ? { ...l, text: val } : l)),
                  );
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") setSelectedIds(new Set());
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
