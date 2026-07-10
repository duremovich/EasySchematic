import { memo, useMemo, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { StubLabelNode as StubLabelNodeType, StubLabelData, ConnectionEdge, SchematicNode } from "../types";
import { SIGNAL_COLORS } from "../types";
import { useSchematicStore, GRID_SIZE } from "../store";
import { resolvePortLabel } from "../packList";
import { computePageGrid } from "../printPageGrid";
import { getPaperSize } from "../printConfig";
import { STUB_GAP } from "../stubPlacement";
import { getPortAbsolutePositions } from "../snapUtils";
import { buildStubLabelText } from "../stubLabelText";

/** Find the connecting edge: source-side stub is the TARGET of an edge from a device;
 *  target-side stub is the SOURCE of an edge to a device. */
function findOwnEdge(stubId: string, side: "source" | "target", edges: ConnectionEdge[]): ConnectionEdge | undefined {
  return edges.find((e) =>
    side === "source" ? e.target === stubId : e.source === stubId,
  );
}

/** Find the partner stub label node (same linkedConnectionId, opposite side). */
function findPartnerStub(linkedConnectionId: string, mySide: "source" | "target", nodes: SchematicNode[]): SchematicNode | undefined {
  const otherSide = mySide === "source" ? "target" : "source";
  return nodes.find((n) =>
    n.type === "stub-label" &&
    (n.data as StubLabelData).linkedConnectionId === linkedConnectionId &&
    (n.data as StubLabelData).side === otherSide,
  );
}

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

function StubLabelNodeComponent({ id, data, selected }: NodeProps<StubLabelNodeType>) {
  // Single combined selector returning a serialized string — minimizes re-renders.
  const labelStr = useSchematicStore((s) => {
    const ownEdge = findOwnEdge(id, data.side, s.edges);
    if (!ownEdge) return "";
    // The "far device" for this stub is at the OTHER end of the partner leg, not our own.
    const partnerEdge = s.edges.find(
      (e) => e.data?.linkedConnectionId === data.linkedConnectionId && e.id !== ownEdge.id,
    );
    if (!partnerEdge) return "";
    const farDeviceId = data.side === "source" ? partnerEdge.target : partnerEdge.source;
    const farHandleId = data.side === "source" ? partnerEdge.targetHandle : partnerEdge.sourceHandle;
    const farDevice = s.nodes.find((n) => n.id === farDeviceId);
    if (!farDevice) return "";

    const farLabel = (farDevice.data as Record<string, unknown>)?.label as string ?? "";
    const farRoom = farDevice.parentId
      ? s.nodes.find((n) => n.id === farDevice.parentId)
      : null;
    const farRoomLabel = (farRoom?.data as Record<string, unknown>)?.label as string ?? "";
    const farPort = resolvePortLabel(farDevice, farHandleId ?? null);

    // Partner stub's geographical X relative to ours — drives arrow direction.
    const partnerStub = findPartnerStub(data.linkedConnectionId, data.side, s.nodes);
    const nodeMap = new Map(s.nodes.map((n) => [n.id, n] as const));
    const myAbs = absolutePos(s.nodes.find((n) => n.id === id), nodeMap);
    const partnerAbs = partnerStub ? absolutePos(partnerStub, nodeMap) : myAbs;
    const dx = partnerAbs.x - myAbs.x;
    const dy = partnerAbs.y - myAbs.y;
    let arrow: string;
    if (Math.abs(dx) >= Math.abs(dy)) arrow = dx >= 0 ? "→" : "←";
    else arrow = dy >= 0 ? "↓" : "↑";

    // Page numbers in print view (matches OffsetEdge.tsx legacy behavior)
    let myPage = "";
    let farPage = "";
    if (s.printView) {
      const paperSize = getPaperSize(s.printPaperId, s.printCustomWidthIn, s.printCustomHeightIn);
      const pages = computePageGrid(
        paperSize, s.printOrientation, s.printScale, s.nodes,
        s.titleBlockLayout?.heightIn ?? 1, s.printOriginOffsetX, s.printOriginOffsetY,
      );
      if (pages.length > 1) {
        const findPage = (x: number, y: number) => {
          for (const p of pages) {
            if (x >= p.x && x < p.x + p.widthPx && y >= p.y && y < p.y + p.heightPx) return p.index + 1;
          }
          return 0;
        };
        const farAbs = absolutePos(farDevice, nodeMap);
        const mp = findPage(myAbs.x, myAbs.y);
        const fp = findPage(farAbs.x, farAbs.y);
        if (mp > 0) myPage = String(mp);
        if (fp > 0) farPage = String(fp);
      }
    }
    return `${arrow}\0${farLabel}\0${farPort}\0${farRoomLabel}\0${myPage}\0${farPage}`;
  });

  const showPortGlobal = useSchematicStore((s) => s.stubLabelShowPort);
  const showRoomGlobal = useSchematicStore((s) => s.stubLabelShowRoom);
  const pageModeGlobal = useSchematicStore((s) => s.stubLabelPageMode);
  const effectiveShowPort = data.showPort ?? showPortGlobal;
  const effectiveShowRoom = data.showRoom ?? showRoomGlobal;
  const effectivePageMode = data.pageMode ?? pageModeGlobal;

  // Auto-place: once per stub (lifetime, not per mount), align Y with the connected
  // device's actual port Y and ensure the box edge clears the device. Result is sticky
  // via data.placed — subsequent mounts (incl. page refresh) bail so user-dragged
  // positions don't get clobbered. Polls via rAF (without subscribing to the store)
  // so a setState here doesn't cascade through Zustand selectors and re-fire the effect.
  useEffect(() => {
    if (data.placed) return;
    let cancelled = false;
    let raf = 0;
    const tryPlace = () => {
      if (cancelled) return;
      const state = useSchematicStore.getState();
      const stub = state.nodes.find((n) => n.id === id);
      const stubW = stub?.measured?.width as number | undefined;
      const stubH = stub?.measured?.height as number | undefined;
      if (!stub || !stubW || !stubH) {
        raf = requestAnimationFrame(tryPlace);
        return;
      }

      const ownEdge = findOwnEdge(id, data.side, state.edges);
      if (!ownEdge) return;

      const deviceId = data.side === "source" ? ownEdge.source : ownEdge.target;
      const deviceHandleId = data.side === "source" ? ownEdge.sourceHandle : ownEdge.targetHandle;
      const device = state.nodes.find((n) => n.id === deviceId);
      if (!device || device.type !== "device") return;

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n] as const));
      const portPositions = getPortAbsolutePositions(device, nodeMap, {
        useShortNames: state.useShortNames,
        wrapDeviceLabels: state.wrapDeviceLabels,
      });
      // Match by full handle id so bidir / passthrough resolve to the right row+side.
      const portPos = portPositions.find((p) => p.handleId === deviceHandleId);
      if (!portPos) return;

      const side = portPos.side;
      const deviceAbs = absolutePos(device, nodeMap);
      const deviceW = (device.measured?.width as number | undefined) ?? 180;
      const portAbsX = portPos.absX;
      const portAbsY = portPos.absY;

      // Center Y on the (grid-snapped) port Y; port handles are already on the 20px grid
      // when the device sits on the grid — the snap is just a safety rail.
      const centerY = Math.round(portAbsY / GRID_SIZE) * GRID_SIZE;
      const desiredAbsY = centerY - stubH / 2;

      const stubCurAbs = absolutePos(stub, nodeMap);

      // Anchor the box edge facing the device STUB_GAP from the port — unconditionally,
      // not just when it overlaps. This is what lets a re-placement (e.g. after the device
      // is moved, see App.tsx onNodeDragStop) follow the device instead of stranding the
      // stub at its old X with a dogleg. On first placement this equals the creation
      // position from defaultStubPlacement, so it's a no-op there. (#182)
      const desiredAbsX = side === "right"
        ? portAbsX + STUB_GAP
        : portAbsX - STUB_GAP - stubW;

      // Stubs always connect via left or right — figure out which side faces the device
      // using the stub's resolved (re-anchored) position.
      const desiredHandle: "l" | "r" =
        (desiredAbsX + stubW / 2) <= (deviceAbs.x + deviceW / 2) ? "r" : "l";
      const currentHandle = data.side === "source" ? ownEdge.targetHandle : ownEdge.sourceHandle;
      const handleNeedsFix = currentHandle !== desiredHandle;

      const xOff = Math.abs(stubCurAbs.x - desiredAbsX) > 0.5;
      const yOff = Math.abs(stubCurAbs.y - desiredAbsY) > 0.5;
      const posChanges = xOff || yOff;

      const parent = stub.parentId ? nodeMap.get(stub.parentId) : null;
      const parentAbs = parent ? absolutePos(parent, nodeMap) : { x: 0, y: 0 };
      const newRelX = desiredAbsX - parentAbs.x;
      const newRelY = desiredAbsY - parentAbs.y;

      // Always stamp data.placed = true so the next mount skips this work entirely,
      // even when no correction was needed. That's what protects the user's drag
      // position across page refresh.
      //
      // Functional setState — when multiple stub effects fire in the same frame
      // (e.g. on a freshly opened schematic), object-form setState reads `state`
      // captured at the top of this rAF tick and would clobber updates landed
      // between then and now.
      useSchematicStore.setState((prev) => ({
        nodes: prev.nodes.map((n) => {
          if (n.id !== id || n.type !== "stub-label") return n;
          const stamped: StubLabelData = { ...n.data, placed: true };
          return posChanges
            ? { ...n, position: { x: newRelX, y: newRelY }, data: stamped }
            : { ...n, data: stamped };
        }),
        edges: handleNeedsFix
          ? prev.edges.map((e) => {
              if (e.id !== ownEdge.id) return e;
              return data.side === "source"
                ? { ...e, targetHandle: desiredHandle }
                : { ...e, sourceHandle: desiredHandle };
            })
          : prev.edges,
      }));
      useSchematicStore.getState().saveToLocalStorage();
    };
    raf = requestAnimationFrame(tryPlace);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [id, data.side, data.placed]);

  const text = useMemo(() => {
    if (!labelStr) return "?";
    const [arrow, farLabel, farPort, farRoom, myPage, farPage] = labelStr.split("\0");
    return buildStubLabelText(
      { arrow, farLabel, farPort, farRoom, myPage, farPage },
      { showPort: effectiveShowPort, showRoom: effectiveShowRoom, pageMode: effectivePageMode },
    );
  }, [labelStr, effectiveShowPort, effectiveShowRoom, effectivePageMode]);

  const color = SIGNAL_COLORS[data.signalType] ?? "#999";
  // Source-side stubs receive an incoming line (they're the TARGET of the edge);
  // target-side stubs originate the line (they're the SOURCE).
  const handleType = data.side === "source" ? "target" : "source";

  return (
    <>
      <Handle type={handleType} position={Position.Top} id="t" isConnectable={false} style={{ opacity: 0, width: 6, height: 6 }} />
      <Handle type={handleType} position={Position.Right} id="r" isConnectable={false} style={{ opacity: 0, width: 6, height: 6 }} />
      <Handle type={handleType} position={Position.Bottom} id="b" isConnectable={false} style={{ opacity: 0, width: 6, height: 6 }} />
      <Handle type={handleType} position={Position.Left} id="l" isConnectable={false} style={{ opacity: 0, width: 6, height: 6 }} />
      <div
        style={{
          // Pin to STUB_H_EST so the box's geometric center (where handles sit
          // via top:50%) actually lands at position.y + STUB_H_EST/2. Without
          // this, sub-pixel rounding of `padding: 1.5px` and `lineHeight: 1`
          // produced a ~13.5px box, putting the visual center 0.25px above
          // where the auto-place math thinks it is, and the connection edge
          // jogged a fraction of a pixel at the stub end.
          boxSizing: "border-box",
          height: 14,
          display: "flex",
          alignItems: "center",
          fontSize: 9,
          lineHeight: 1,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 500,
          whiteSpace: "nowrap",
          padding: "0 4px",
          borderRadius: 2,
          border: `1px solid ${selected ? "#1a73e8" : color}`,
          backgroundColor: "white",
          color: "#374151",
        }}
      >
        {text}
      </div>
    </>
  );
}

export default memo(StubLabelNodeComponent);
