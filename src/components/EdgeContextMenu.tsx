import { useEffect, useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { resolvePort } from "../packList";
import { LINE_STYLE_LABELS, LINE_STYLE_DASHARRAY, type DeviceData, type LineStyle } from "../types";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";
import MenuSubmenu from "./MenuSubmenu";

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
    store.addEdgeHandle(menu.edgeId, { x: menu.flowX, y: menu.flowY });
    useSchematicStore.setState({
      edgeContextMenu: null,
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

  const [editingLabel, setEditingLabel] = useState<false | "label" | "multicable" | "source" | "target" | "cableId">(false);
  const [labelValue, setLabelValue] = useState("");

  const setEdgeColor = useCallback((hex: string) => {
    if (!menu) return;
    useSchematicStore.getState().patchEdgeData(menu.edgeId, { color: hex });
  }, [menu]);

  const clearEdgeColor = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().patchEdgeData(menu.edgeId, { color: undefined });
    useSchematicStore.setState({ edgeContextMenu: null });
  }, [menu]);

  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
    [editingLabel],
  );

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

  const setCableId = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    setLabelValue((edge?.data?.cableId as string) ?? "");
    setEditingLabel("cableId");
  }, [menu]);

  const setSourceEndLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    setLabelValue((edge?.data?.sourceLabel as string) ?? "");
    setEditingLabel("source");
  }, [menu]);

  const setTargetEndLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    setLabelValue((edge?.data?.targetLabel as string) ?? "");
    setEditingLabel("target");
  }, [menu]);

  const commitLabel = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const field =
      editingLabel === "multicable" ? "multicableLabel"
      : editingLabel === "source" ? "sourceLabel"
      : editingLabel === "target" ? "targetLabel"
      : editingLabel === "cableId" ? "cableId"
      : "label";
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
    if (edge?.data?.linkedConnectionId) {
      store.collapseStubsForEdge(menu.edgeId);
    } else {
      store.convertEdgeToStubs(menu.edgeId);
    }
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

  const toggleEdgeCableIdMode = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const edge = store.edges.find((e) => e.id === menu.edgeId);
    const current = (edge?.data?.cableIdLabelMode as string) ?? store.cableIdLabelMode;
    const next = current === "endpoint" ? "midpoint" : "endpoint";
    store.patchEdgeData(menu.edgeId, { cableIdLabelMode: next });
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
  const isStubbed = !!edge?.data?.linkedConnectionId;
  const isCableIdHidden = edge?.data?.hideCableId === true;
  const edgeCableIdMode = (edge?.data?.cableIdLabelMode as string) ?? useSchematicStore.getState().cableIdLabelMode;
  // NOTE: Stub label show-port / page-mode overrides moved to StubLabelNode.data
  // (per-stub, not per-edge). Right-click on a stub label node will surface these
  // options in a future menu; for now they fall back to the global setting.
  const currentLineStyle: LineStyle = (edge?.data?.lineStyle as LineStyle) ?? "solid";
  const hasMismatch = edge?.data?.connectorMismatch === true;
  const allowIncompatible = edge?.data?.allowIncompatible === true;
  const isDirectAttach = edge?.data?.directAttach === true;
  const customColor = (edge?.data?.color as string | undefined) ?? "";

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

  if (editingLabel) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg p-2 min-w-[200px]"
        style={{
          left: menuPos.x,
          top: menuPos.y,
          maxHeight: menuPos.maxHeight,
          overflowY: menuPos.maxHeight ? "auto" : undefined,
          visibility: menuPos.ready ? "visible" : "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-gray-500 mb-1">
          {editingLabel === "multicable" ? "Cable Label"
            : editingLabel === "source" ? "Source-end Label"
            : editingLabel === "target" ? "Target-end Label"
            : editingLabel === "cableId" ? "Cable ID"
            : "Midpoint Label"}
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
          placeholder={editingLabel === "multicable"
            ? "e.g. Audio Snake A"
            : editingLabel === "cableId"
              ? "e.g. SPK-001-HL"
              : "e.g. Program Feed"}
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
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[160px]"
      style={{
        left: menuPos.x,
        top: menuPos.y,
        maxHeight: menuPos.maxHeight,
        overflowY: menuPos.maxHeight ? "auto" : undefined,
        visibility: menuPos.ready ? "visible" : "hidden",
      }}
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
      <MenuItem label="Set Source-end Label..." onClick={setSourceEndLabel} />
      <MenuItem label="Set Midpoint Label..." onClick={setConnectionLabel} />
      <MenuItem label="Set Target-end Label..." onClick={setTargetEndLabel} />
      {isTrunkEdge && (
        <MenuItem label="Set Cable Label..." onClick={setCableLabel} />
      )}
      <MenuItem label="Set Cable ID..." onClick={setCableId} />
      <MenuItem
        label={isCableIdHidden ? "Show Cable ID" : "Hide Cable ID"}
        onClick={toggleHideCableId}
      />
      <MenuItem
        label={edgeCableIdMode === "endpoint" ? "Cable ID at Midpoint" : "Cable ID at Endpoints"}
        onClick={toggleEdgeCableIdMode}
      />
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
      {!isDirectAttach && (
        <>
          <div className="h-px bg-gray-200 my-1" />
          <div className="px-3 py-1.5 flex items-center gap-2">
            <span className="text-xs text-gray-700 flex-1">Cable Color</span>
            <input
              type="color"
              value={customColor || "#9ca3af"}
              onChange={(e) => setEdgeColor(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-5 cursor-pointer border border-gray-300 rounded p-0.5 bg-white"
              title={customColor ? `Override: ${customColor}` : "Pick a custom cable color"}
            />
            {customColor && (
              <button
                onClick={clearEdgeColor}
                className="text-[10px] text-gray-500 hover:text-red-600 underline cursor-pointer"
                title="Reset to signal-type color"
              >
                reset
              </button>
            )}
          </div>
        </>
      )}
      <div className="h-px bg-gray-200 my-1" />
      <MenuSubmenu label={`Line Style: ${LINE_STYLE_LABELS[currentLineStyle]}`} minWidth={180}>
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
      </MenuSubmenu>
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
