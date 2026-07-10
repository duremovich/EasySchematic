import { memo, useEffect, useRef, useState, useCallback } from "react";
import { type NodeProps } from "@xyflow/react";
import type { TextStubNode as TextStubNodeType, TextStubData, SchematicNode } from "../types";
import { SIGNAL_COLORS } from "../types";
import { useSchematicStore, GRID_SIZE } from "../store";
import { getPortAbsolutePositions } from "../snapUtils";
import {
  TEXT_STUB_PLACEHOLDER,
  textStubBoxPosition,
  textStubLeaderPoints,
  textStubSideForPort,
  pointsToSvg,
} from "../textStub";
import { STUB_H_EST } from "../stubPlacement";

/** Walk parent chain to compute absolute position. */
function absolutePos(node: SchematicNode | undefined, nodeMap: Map<string, SchematicNode>): { x: number; y: number } {
  if (!node) return { x: 0, y: 0 };
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

/** Resolve the anchored port's absolute position on the natural outward side. */
function resolvePortAbs(
  data: Pick<TextStubData, "anchorNodeId" | "anchorPortId" | "side">,
  nodes: SchematicNode[],
): { x: number; y: number; side: "l" | "r" } | null {
  const device = nodes.find((n) => n.id === data.anchorNodeId);
  if (!device || device.type !== "device") return null;
  const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));
  const { useShortNames, wrapDeviceLabels } = useSchematicStore.getState();
  const positions = getPortAbsolutePositions(device, nodeMap, { useShortNames, wrapDeviceLabels });
  const candidates = positions.filter((p) => p.portId === data.anchorPortId);
  if (candidates.length === 0) return null;
  // Prefer the side that keeps the box on the device's outward edge; fall back to stored.
  const preferred =
    candidates.find((p) => textStubSideForPort(p.side) === data.side) ?? candidates[0];
  return { x: preferred.absX, y: preferred.absY, side: textStubSideForPort(preferred.side) };
}

function TextStubNodeComponent({ id, data, selected }: NodeProps<TextStubNodeType>) {
  const updateTextStubText = useSchematicStore((s) => s.updateTextStubText);
  const pushSnapshot = useSchematicStore((s) => s.pushSnapshot);
  const editingGlobal = useSchematicStore((s) => s.editingNodeId === id);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);

  // Live leader geometry: port position relative to this box's top-left, plus the box's
  // measured size. Serialized to a primitive so the selector doesn't churn on every store
  // write. Returns "" when the anchor can't be resolved (device deleted mid-frame).
  const geomStr = useSchematicStore((s) => {
    const port = resolvePortAbs(data, s.nodes);
    if (!port) return "";
    const nodeMap = new Map(s.nodes.map((n) => [n.id, n] as const));
    const self = s.nodes.find((n) => n.id === id);
    const myAbs = absolutePos(self, nodeMap);
    const w = (self?.measured?.width as number | undefined) ?? 0;
    const h = (self?.measured?.height as number | undefined) ?? STUB_H_EST;
    return `${port.x - myAbs.x}\0${port.y - myAbs.y}\0${w}\0${h}\0${port.side}`;
  });

  // One-shot auto-placement: align the box with the port row once React Flow has measured
  // the real width (a wide note shifts a left-facing box's X). Sticky via data.placed so a
  // user drag survives refresh. Mirrors StubLabelNode.tryPlace but with no edge to follow.
  const { placed, anchorNodeId, anchorPortId, side } = data;
  useEffect(() => {
    if (placed) return;
    const anchor = { anchorNodeId, anchorPortId, side };
    let cancelled = false;
    let raf = 0;
    const tryPlace = () => {
      if (cancelled) return;
      const state = useSchematicStore.getState();
      const self = state.nodes.find((n) => n.id === id);
      const w = self?.measured?.width as number | undefined;
      const h = self?.measured?.height as number | undefined;
      if (!self || !w || !h) {
        raf = requestAnimationFrame(tryPlace);
        return;
      }
      const port = resolvePortAbs(anchor, state.nodes);
      if (!port) return;

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n] as const));
      const parent = self.parentId ? nodeMap.get(self.parentId) : undefined;
      const parentAbs = parent ? absolutePos(parent, nodeMap) : { x: 0, y: 0 };
      const boxAbs = textStubBoxPosition({ x: port.x, y: port.y }, port.side, w, h);
      const centerY = Math.round(port.y / GRID_SIZE) * GRID_SIZE;
      const newRelX = Math.round(boxAbs.x - parentAbs.x);
      const newRelY = Math.round(centerY - h / 2 - parentAbs.y);
      const curAbs = absolutePos(self, nodeMap);
      const moved = Math.abs(curAbs.x - boxAbs.x) > 0.5 || Math.abs(self.position.y - newRelY) > 0.5;

      useSchematicStore.setState((prev) => ({
        nodes: prev.nodes.map((n) => {
          if (n.id !== id || n.type !== "text-stub") return n;
          const stamped: TextStubData = { ...n.data, side: port.side, placed: true };
          return moved
            ? { ...n, position: { x: newRelX, y: newRelY }, data: stamped }
            : { ...n, data: stamped };
        }),
      }));
      useSchematicStore.getState().saveToLocalStorage();
    };
    raf = requestAnimationFrame(tryPlace);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [id, placed, anchorNodeId, anchorPortId, side]);

  const color = SIGNAL_COLORS[data.signalType] ?? "#999";

  // ---- Inline text editing (double-click or the "Edit Text" context-menu action) ----
  const [draft, setDraft] = useState(data.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const snapshotPushed = useRef(false);

  useEffect(() => {
    if (!editingGlobal) return;
    snapshotPushed.current = false;
    // Seed + focus the field on the next frame — setState inside the effect body would
    // trigger a cascading render (and the input isn't mounted until editingGlobal flips).
    const raf = requestAnimationFrame(() => {
      setDraft(data.text);
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [editingGlobal, data.text]);

  const commit = useCallback(() => {
    updateTextStubText(id, draft.trim());
    setEditingNodeId(null);
  }, [id, draft, updateTextStubText, setEditingNodeId]);

  const startEditing = useCallback(() => setEditingNodeId(id), [id, setEditingNodeId]);

  const onDraftChange = useCallback(
    (v: string) => {
      if (!snapshotPushed.current) {
        pushSnapshot();
        snapshotPushed.current = true;
      }
      setDraft(v);
    },
    [pushSnapshot],
  );

  // Parse the live geometry for the leader line.
  let leaderPts: string | null = null;
  if (geomStr) {
    const [px, py, w, h, side] = geomStr.split("\0");
    const boxW = Number(w) || 0;
    const boxH = Number(h) || STUB_H_EST;
    const pts = textStubLeaderPoints(
      { width: boxW, height: boxH },
      { x: Number(px), y: Number(py) },
      side as "l" | "r",
    );
    leaderPts = pointsToSvg(pts);
  }

  const displayText = data.text || TEXT_STUB_PLACEHOLDER;

  return (
    <>
      {/* Leader line to the anchor port. Zero-size SVG with overflow visible so it can
          draw outside the box toward the device. pointer-events none so it never blocks
          selecting/dragging the label. */}
      {leaderPts && (
        <svg
          width={0}
          height={0}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        >
          <polyline points={leaderPts} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      )}
      <div
        onDoubleClick={editingGlobal ? undefined : startEditing}
        className={editingGlobal ? "nodrag nowheel" : undefined}
        style={{
          boxSizing: "border-box",
          minHeight: 14,
          display: "flex",
          alignItems: "center",
          fontSize: 9,
          lineHeight: 1,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 500,
          whiteSpace: "nowrap",
          padding: "0 4px",
          borderRadius: 2,
          border: `1px dashed ${selected ? "#1a73e8" : color}`,
          backgroundColor: "white",
          color: data.text ? "#374151" : "#9ca3af",
        }}
      >
        {editingGlobal ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingNodeId(null);
              }
            }}
            placeholder="text"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              font: "inherit",
              color: "#374151",
              width: `${Math.max(4, draft.length)}ch`,
              minWidth: 24,
              padding: 0,
            }}
          />
        ) : (
          displayText
        )}
      </div>
    </>
  );
}

export default memo(TextStubNodeComponent);
