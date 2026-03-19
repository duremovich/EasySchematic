import { useEffect, useCallback, useState } from "react";
import { useSchematicStore } from "../store";
import { resolvePort } from "../packList";

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

    // Get existing manual waypoints (just user-placed handles, not auto-route copies)
    const manualWps: { x: number; y: number }[] =
      edge.data?.manualWaypoints?.map((p) => ({ ...p })) ?? [];

    // Get the current visual path to project the click onto it
    const route = store.routedEdges[menu.edgeId];
    if (!route || route.waypoints.length < 2) return;

    // Project click position onto nearest segment of the current path
    const projected = projectOntoSegments(menu.flowX, menu.flowY, route.waypoints);
    const GRID = 20;

    // For orthogonal segments, lock the fixed axis and snap only the free axis.
    // Horizontal segment (same Y): lock Y, snap X.
    // Vertical segment (same X): lock X, snap Y.
    const segStart = route.waypoints[projected.segIdx];
    const segEnd = route.waypoints[projected.segIdx + 1];
    let newPt: { x: number; y: number };
    if (segStart && segEnd && Math.abs(segStart.y - segEnd.y) < 1) {
      // Horizontal segment — keep Y exactly on the segment
      newPt = { x: Math.round(projected.x / GRID) * GRID, y: segStart.y };
    } else if (segStart && segEnd && Math.abs(segStart.x - segEnd.x) < 1) {
      // Vertical segment — keep X exactly on the segment
      newPt = { x: segStart.x, y: Math.round(projected.y / GRID) * GRID };
    } else {
      // Diagonal or other — snap both
      newPt = {
        x: Math.round(projected.x / GRID) * GRID,
        y: Math.round(projected.y / GRID) * GRID,
      };
    }

    if (manualWps.length === 0) {
      // First handle — just add it
      manualWps.push(newPt);
    } else {
      // Find insertion position: the projected segment index tells us where
      // in the full path [source, ...manual, target] the click landed.
      // segIdx 0 = before manual[0], segIdx 1 = between manual[0] and manual[1], etc.
      // But the full path waypoints may differ from manual waypoints after simplification.
      // Simpler approach: insert in order along the path by finding which pair of
      // existing manual points (or endpoints) the new point falls between.
      // Use the projected segment index relative to the full path.
      // Full path = [source, m0, m1, ..., mN, target]
      // segIdx in full path: 0 = src→m0, 1 = m0→m1, ..., N = mN-1→mN, N+1 = mN→tgt
      // So insert at manual index = segIdx (clamped to [0, len])
      const insertIdx = Math.max(0, Math.min(projected.segIdx, manualWps.length));
      manualWps.splice(insertIdx, 0, newPt);
    }

    store.setManualWaypoints(menu.edgeId, manualWps);

    // Select the edge so the handle is immediately visible
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
    if (!edge?.data?.manualWaypoints?.length) return;

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

  if (!menu) return null;

  const store = useSchematicStore.getState();
  const edge = store.edges.find((e) => e.id === menu.edgeId);
  const hasManual = !!(edge?.data?.manualWaypoints?.length);
  const isStubbed = edge?.data?.stubbed === true;
  const hasMismatch = edge?.data?.connectorMismatch === true;
  const allowIncompatible = edge?.data?.allowIncompatible === true;

  // Check if this is a trunk (multicable) edge
  const srcNode = store.nodes.find((n) => n.id === edge?.source);
  const tgtNode = store.nodes.find((n) => n.id === edge?.target);
  const srcPort = resolvePort(srcNode, edge?.sourceHandle);
  const tgtPort = resolvePort(tgtNode, edge?.targetHandle);
  const isTrunkEdge = !!(srcPort?.isMulticable || tgtPort?.isMulticable);

  let nearWaypoint = false;
  if (hasManual) {
    const wps = edge!.data!.manualWaypoints!;
    for (const wp of wps) {
      if (Math.abs(wp.x - menu.flowX) + Math.abs(wp.y - menu.flowY) < 60) {
        nearWaypoint = true;
        break;
      }
    }
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
        label={isStubbed ? "Show Full Connection" : "Stub Connection"}
        onClick={toggleStubbed}
      />
      {(hasMismatch || allowIncompatible) && (
        <MenuItem
          label={allowIncompatible ? "Disallow Incompatible" : "Allow Incompatible"}
          onClick={toggleAllowIncompatible}
        />
      )}
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
