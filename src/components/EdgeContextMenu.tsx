import { useEffect, useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { resolvePort } from "../packList";
import { LINE_STYLE_LABELS, LINE_STYLE_DASHARRAY, type DeviceData, type LineStyle } from "../types";

/** Project a point onto the nearest segment and return the projected point. */
function projectOntoSegments(
  px: number,
  py: number,
  waypoints: { x: number; y: number }[],
): { x: number; y: number; segIdx: number } {
  let bestX = px;
  let bestY = py;
  let bestDist = Infinity;
  let bestSeg = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const ax = waypoints[i].x, ay = waypoints[i].y;
    const bx = waypoints[i + 1].x, by = waypoints[i + 1].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const dist = (px - cx) ** 2 + (py - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestX = cx;
      bestY = cy;
      bestSeg = i;
    }
  }

  return { x: bestX, y: bestY, segIdx: bestSeg };
}

export default function EdgeContextMenu() {
  const menu = useSchematicStore((s) => s.edgeContextMenu);
  const { setCenter, getZoom, getInternalNode } = useReactFlow();

  // Close on click anywhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ edgeContextMenu: null });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const addHandle = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    if (!edge) return;

    store.pushSnapshot();
    const GRID = 20;
    const newPtSnapped = {
      x: Math.round(menu.flowX / GRID) * GRID,
      y: Math.round(menu.flowY / GRID) * GRID,
    };

    // For stubbed edges, add waypoint to the closer stub (source or target)
    if (edge.data?.stubbed) {
      const srcNode = store.nodes.find((n) => n.id === edge.source);
      const tgtNode = store.nodes.find((n) => n.id === edge.target);
      const srcX = srcNode?.position.x ?? 0;
      const tgtX = tgtNode?.position.x ?? 0;
      const distToSrc = Math.abs(menu.flowX - srcX);
      const distToTgt = Math.abs(menu.flowX - tgtX);
      const field = distToSrc <= distToTgt ? "stubSourceWaypoints" : "stubTargetWaypoints";
      const existing = (field === "stubSourceWaypoints" ? edge.data.stubSourceWaypoints : edge.data.stubTargetWaypoints) ?? [];
      store.patchEdgeData(menu.edgeId, { [field]: [...existing, newPtSnapped] });

      useSchematicStore.setState({
        edgeContextMenu: null,
        edges: useSchematicStore.getState().edges.map((e) => ({
          ...e,
          selected: e.id === menu.edgeId,
        })),
      });
      return;
    }

    // Get existing manual waypoints (just user-placed handles, not auto-route copies)
    const manualWps: { x: number; y: number }[] =
      edge.data?.manualWaypoints?.map((p) => ({ ...p })) ?? [];

    // Get the current visual path to project the click onto it
    const route = store.routedEdges[menu.edgeId];
    if (!route || route.waypoints.length < 2) return;

    // Project click position onto nearest segment of the current path
    const projected = projectOntoSegments(menu.flowX, menu.flowY, route.waypoints);

    // For orthogonal segments, lock the fixed axis and snap only the free axis.
    const segStart = route.waypoints[projected.segIdx];
    const segEnd = route.waypoints[projected.segIdx + 1];
    let newPt: { x: number; y: number };
    if (segStart && segEnd && Math.abs(segStart.y - segEnd.y) < 1) {
      newPt = { x: Math.round(projected.x / GRID) * GRID, y: segStart.y };
    } else if (segStart && segEnd && Math.abs(segStart.x - segEnd.x) < 1) {
      newPt = { x: segStart.x, y: Math.round(projected.y / GRID) * GRID };
    } else {
      newPt = {
        x: Math.round(projected.x / GRID) * GRID,
        y: Math.round(projected.y / GRID) * GRID,
      };
    }

    if (manualWps.length === 0) {
      manualWps.push(newPt);
    } else {
      // Find the correct insertion position by comparing the new point's
      // position along the routed path to each existing manual waypoint's
      // position. projected.segIdx indexes the routed path (many A* segments),
      // NOT the manual waypoints array — we need to map between the two.
      const manualSegIdxes = manualWps.map((wp) =>
        projectOntoSegments(wp.x, wp.y, route.waypoints).segIdx,
      );
      let insertIdx = manualWps.length; // default: after all existing
      for (let i = 0; i < manualSegIdxes.length; i++) {
        if (projected.segIdx <= manualSegIdxes[i]) {
          insertIdx = i;
          break;
        }
      }
      manualWps.splice(insertIdx, 0, newPt);
    }

    store.setManualWaypoints(menu.edgeId, manualWps);

    useSchematicStore.setState({
      edgeContextMenu: null,
      edges: useSchematicStore.getState().edges.map((e) => ({
        ...e,
        selected: e.id === menu.edgeId,
      })),
    });
  }, [menu]);

  const removeHandle = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    if (!edge) return;

    // For stubbed edges, find closest waypoint across both stubs
    if (edge.data?.stubbed) {
      const srcWps = edge.data.stubSourceWaypoints ?? [];
      const tgtWps = edge.data.stubTargetWaypoints ?? [];
      let bestField: "stubSourceWaypoints" | "stubTargetWaypoints" | null = null;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < srcWps.length; i++) {
        const d = Math.abs(srcWps[i].x - menu.flowX) + Math.abs(srcWps[i].y - menu.flowY);
        if (d < bestDist) { bestDist = d; bestIdx = i; bestField = "stubSourceWaypoints"; }
      }
      for (let i = 0; i < tgtWps.length; i++) {
        const d = Math.abs(tgtWps[i].x - menu.flowX) + Math.abs(tgtWps[i].y - menu.flowY);
        if (d < bestDist) { bestDist = d; bestIdx = i; bestField = "stubTargetWaypoints"; }
      }
      if (!bestField || bestDist > 60) {
        useSchematicStore.setState({ edgeContextMenu: null });
        return;
      }
      store.pushSnapshot();
      const existing = bestField === "stubSourceWaypoints" ? srcWps : tgtWps;
      const newWps = existing.filter((_, i) => i !== bestIdx);
      store.patchEdgeData(menu.edgeId, { [bestField]: newWps.length > 0 ? newWps : undefined });
      useSchematicStore.setState({ edgeContextMenu: null });
      return;
    }

    if (!edge.data?.manualWaypoints?.length) return;

    const wps = edge.data.manualWaypoints;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < wps.length; i++) {
      const d = Math.abs(wps[i].x - menu.flowX) + Math.abs(wps[i].y - menu.flowY);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestDist > 60) {
      useSchematicStore.setState({ edgeContextMenu: null });
      return;
    }

    store.pushSnapshot();
    const newWps = wps.filter((_, i) => i !== bestIdx);
    if (newWps.length === 0) {
      store.clearManualWaypoints(menu.edgeId);
    } else {
      store.setManualWaypoints(menu.edgeId, newWps);
    }
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const resetRoute = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().clearManualWaypoints(menu.edgeId);
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const [editingLabel, setEditingLabel] = useState<false | "label" | "multicable">(false);
  const [labelValue, setLabelValue] = useState("");

  const setConnectionLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    setLabelValue((edge?.data?.label as string) ?? "");
    setEditingLabel("label");
  }, [menu]);

  const setCableLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    setLabelValue((edge?.data?.multicableLabel as string) ?? "");
    setEditingLabel("multicable");
  }, [menu]);

  const commitLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const field = editingLabel === "multicable" ? "multicableLabel" : "label";
    store.patchEdgeData(menu.edgeId, { [field]: labelValue.trim() || undefined });
    useSchematicStore.setState({ edgeContextMenu: null });
    setEditingLabel(false);
  }, [menu, labelValue, editingLabel]);

  const toggleAllowIncompatible = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = edge?.data?.allowIncompatible === true;
    store.patchEdgeData(menu.edgeId, { allowIncompatible: current ? undefined : true });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const toggleStubbed = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = edge?.data?.stubbed === true;
    store.patchEdgeData(menu.edgeId, { stubbed: current ? undefined : true });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const toggleHideCableId = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = edge?.data?.hideCableId === true;
    store.patchEdgeData(menu.edgeId, { hideCableId: current ? undefined : true });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const toggleHideCustomLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = edge?.data?.hideCustomLabel === true;
    store.patchEdgeData(menu.edgeId, { hideCustomLabel: current ? undefined : true });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const toggleEdgeCableIdMode = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = (edge?.data?.cableIdLabelMode as string) ?? store.cableIdLabelMode;
    const next = current === "endpoint" ? "midpoint" : "endpoint";
    store.patchEdgeData(menu.edgeId, { cableIdLabelMode: next });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const toggleEdgeCustomLabelMode = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = (edge?.data?.customLabelMode as string) ?? store.customLabelMode;
    const next = current === "endpoint" ? "midpoint" : "endpoint";
    store.patchEdgeData(menu.edgeId, { customLabelMode: next });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const toggleAdapterVisibility = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    if (!edge) return;

    // Find the adapter node — could be source, target, or a hidden adapter in between
    let adapterId: string | null = null;
    const srcData = store.nodes.find((n) => n.id === edge.source)?.data as DeviceData | undefined;
    const tgtData = store.nodes.find((n) => n.id === edge.target)?.data as DeviceData | undefined;

    if (srcData?.deviceType === "adapter") adapterId = edge.source;
    else if (tgtData?.deviceType === "adapter") adapterId = edge.target;
    // Check for hidden adapter (virtual edge — target is hidden adapter)
    else if (store.hiddenAdapterNodeIds.has(edge.target)) adapterId = edge.target;

    if (!adapterId) return;

    const adapterData = store.nodes.find((n) => n.id === adapterId)?.data as DeviceData | undefined;
    const current = adapterData?.adapterVisibility ?? "default";
    const isCurrentlyHidden = current === "force-hide" || (current === "default" && store.hideAdapters);
    const newVisibility = isCurrentlyHidden ? "force-show" : "force-hide";

    store.patchDeviceData(adapterId, { adapterVisibility: newVisibility });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const setLineStyle = useCallback((ls: LineStyle) => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    store.patchEdgeData(menu.edgeId, { lineStyle: ls === "solid" ? undefined : ls });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const goToNode = useCallback((nodeId: string | undefined) => {
    if (!menu || !nodeId) return;
    const internal = getInternalNode(nodeId);
    if (!internal) return;
    const { x, y } = internal.internals.positionAbsolute;
    const w = internal.measured?.width ?? 200;
    const h = internal.measured?.height ?? 100;
    setCenter(x + w / 2, y + h / 2, { zoom: getZoom(), duration: 300 });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu, setCenter, getZoom, getInternalNode]);

  if (!menu) return null;

  const store = useSchematicStore.getState();
  const edge = store.edges.find((e) => e.id === menu.edgeId);
  const hasManual = !!(edge?.data?.manualWaypoints?.length);
  const isStubbed = edge?.data?.stubbed === true;
  const isCableIdHidden = edge?.data?.hideCableId === true;
  const isCustomLabelHidden = edge?.data?.hideCustomLabel === true;
  const hasCustomLabel = !!(edge?.data?.label);
  const edgeCableIdMode = (edge?.data?.cableIdLabelMode as string) ?? useSchematicStore.getState().cableIdLabelMode;
  const edgeCustomLabelMode = (edge?.data?.customLabelMode as string) ?? useSchematicStore.getState().customLabelMode;
  const currentLineStyle: LineStyle = (edge?.data?.lineStyle as LineStyle) ?? "solid";
  const hasMismatch = edge?.data?.connectorMismatch === true;
  const allowIncompatible = edge?.data?.allowIncompatible === true;

  // Check if this is a trunk (multicable) edge
  const srcNode = store.nodes.find((n) => n.id === edge?.source);
  const tgtNode = store.nodes.find((n) => n.id === edge?.target);
  const srcPort = resolvePort(srcNode, edge?.sourceHandle);
  const tgtPort = resolvePort(tgtNode, edge?.targetHandle);
  const isTrunkEdge = !!(srcPort?.isMulticable || tgtPort?.isMulticable);

  // Check if edge connects to an adapter (visible or hidden)
  const srcIsAdapter = (srcNode?.data as DeviceData)?.deviceType === "adapter";
  const tgtIsAdapter = (tgtNode?.data as DeviceData)?.deviceType === "adapter";
  const hiddenAdapterTarget = edge ? store.hiddenAdapterNodeIds.has(edge.target) : false;
  const connectsToAdapter = srcIsAdapter || tgtIsAdapter || hiddenAdapterTarget;
  const adapterId = srcIsAdapter ? edge?.source : tgtIsAdapter ? edge?.target : hiddenAdapterTarget ? edge?.target : null;
  const adapterData = adapterId ? store.nodes.find((n) => n.id === adapterId)?.data as DeviceData | undefined : undefined;
  const adapterVisibility = adapterData?.adapterVisibility ?? "default";
  const adapterIsHidden = adapterVisibility === "force-hide" || (adapterVisibility === "default" && store.hideAdapters);

  let nearWaypoint = false;
  const checkNear = (wps: { x: number; y: number }[]) => {
    for (const wp of wps) {
      if (Math.abs(wp.x - menu.flowX) + Math.abs(wp.y - menu.flowY) < 60) return true;
    }
    return false;
  };
  if (hasManual) nearWaypoint = checkNear(edge!.data!.manualWaypoints!);
  if (isStubbed) {
    nearWaypoint = nearWaypoint || checkNear(edge?.data?.stubSourceWaypoints ?? []) || checkNear(edge?.data?.stubTargetWaypoints ?? []);
  }

  if (editingLabel) {
    return (
      <div
        className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg p-2 min-w-[200px]"
        style={{ left: menu.screenX, top: menu.screenY }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-gray-500 mb-1">
          {editingLabel === "multicable" ? "Cable Label" : "Connection Label"}
        </div>
        <input
          className="w-full bg-gray-50 border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitLabel();
            else if (e.key === "Escape") {
              setEditingLabel(false);
              useSchematicStore.setState({ edgeContextMenu: null });
            }
          }}
          placeholder={editingLabel === "multicable" ? "e.g. Audio Snake A" : "e.g. Program Feed"}
          autoFocus
        />
        <div className="flex justify-end gap-1 mt-1.5">
          <button
            onClick={() => { setEditingLabel(false); useSchematicStore.setState({ edgeContextMenu: null }); }}
            className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={commitLabel}
            className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-500 cursor-pointer"
          >
            Set
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[160px]"
      style={{ left: menu.screenX, top: menu.screenY }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label="Add Handle" onClick={addHandle} />
      {nearWaypoint && (
        <MenuItem label="Remove Handle" onClick={removeHandle} />
      )}
      {hasManual && (
        <>
          <div className="h-px bg-gray-200 my-1" />
          <MenuItem label="Reset Route" onClick={resetRoute} />
        </>
      )}
      <div className="h-px bg-gray-200 my-1" />
      <MenuItem label="Set Label..." onClick={setConnectionLabel} />
      {isTrunkEdge && (
        <MenuItem label="Set Cable Label..." onClick={setCableLabel} />
      )}
      <MenuItem
        label={isCableIdHidden ? "Show Cable ID" : "Hide Cable ID"}
        onClick={toggleHideCableId}
      />
      <MenuItem
        label={edgeCableIdMode === "endpoint" ? "Cable ID at Midpoint" : "Cable ID at Endpoints"}
        onClick={toggleEdgeCableIdMode}
      />
      {hasCustomLabel && (
        <MenuItem
          label={isCustomLabelHidden ? "Show Custom Label" : "Hide Custom Label"}
          onClick={toggleHideCustomLabel}
        />
      )}
      {hasCustomLabel && (
        <MenuItem
          label={edgeCustomLabelMode === "endpoint" ? "Label at Midpoint" : "Label at Endpoints"}
          onClick={toggleEdgeCustomLabelMode}
        />
      )}
      <MenuItem
        label={isStubbed ? "Show Full Connection" : "Stub Connection"}
        onClick={toggleStubbed}
      />
      {(hasMismatch || allowIncompatible) && (
        <MenuItem
          label={allowIncompatible ? "Disallow Incompatible" : "Allow Incompatible"}
          onClick={toggleAllowIncompatible}
        />
      )}
      {connectsToAdapter && (
        <MenuItem
          label={adapterIsHidden ? "Show Adapter" : "Hide Adapter"}
          onClick={toggleAdapterVisibility}
        />
      )}
      <div className="h-px bg-gray-200 my-1" />
      <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Line Style</div>
      {(["solid", "dashed", "dotted", "dash-dot"] as LineStyle[]).map((ls) => (
        <button
          key={ls}
          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer ${
            currentLineStyle === ls
              ? "text-blue-700 bg-blue-50"
              : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
          }`}
          onClick={() => setLineStyle(ls)}
        >
          <svg width="24" height="8" className="shrink-0">
            <line
              x1="0" y1="4" x2="24" y2="4"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={LINE_STYLE_DASHARRAY[ls] ?? "none"}
            />
          </svg>
          <span>{LINE_STYLE_LABELS[ls]}</span>
        </button>
      ))}
      <div className="h-px bg-gray-200 my-1" />
      <MenuItem label="Go to Source" onClick={() => goToNode(edge?.source)} />
      <MenuItem label="Go to Destination" onClick={() => goToNode(edge?.target)} />
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
