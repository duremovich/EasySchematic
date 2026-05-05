import { useEffect, useCallback } from "react";
import { useSchematicStore } from "../store";
import type { StubLabelData, StubLabelPageMode } from "../types";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";

/** Right-click menu for stub-label nodes — per-stub overrides for the three label
 *  fields plus a "show full connection" collapse action. Each cycle item rotates
 *  through "Default (follows global)" → explicit-on → explicit-off → undefined. */
export default function StubLabelContextMenu() {
  const menu = useSchematicStore((s) => s.stubLabelContextMenu);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ stubLabelContextMenu: null });
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

  const cycleBool = useCallback(
    (field: "showPort" | "showRoom") => {
      if (!menu) return;
      const store = useSchematicStore.getState();
      const node = store.nodes.find((n) => n.id === menu.nodeId);
      const current = (node?.data as StubLabelData | undefined)?.[field];
      // undefined → true → false → undefined
      const next: boolean | undefined =
        current === undefined ? true : current === true ? false : undefined;
      store.patchStubLabelData(menu.nodeId, { [field]: next } as Partial<StubLabelData>);
      useSchematicStore.setState({ stubLabelContextMenu: null });
    },
    [menu],
  );

  const cyclePageMode = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const node = store.nodes.find((n) => n.id === menu.nodeId);
    const current = (node?.data as StubLabelData | undefined)?.pageMode;
    // undefined → "always" → "cross-page" → "never" → undefined
    const next: StubLabelPageMode | undefined =
      current === undefined ? "always"
      : current === "always" ? "cross-page"
      : current === "cross-page" ? "never"
      : undefined;
    store.patchStubLabelData(menu.nodeId, { pageMode: next });
    useSchematicStore.setState({ stubLabelContextMenu: null });
  }, [menu]);

  const collapseStubs = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    const node = store.nodes.find((n) => n.id === menu.nodeId);
    const linkedId = (node?.data as StubLabelData | undefined)?.linkedConnectionId;
    if (!linkedId) {
      useSchematicStore.setState({ stubLabelContextMenu: null });
      return;
    }
    const leg = store.edges.find((e) => e.data?.linkedConnectionId === linkedId);
    if (leg) store.collapseStubsForEdge(leg.id);
    useSchematicStore.setState({ stubLabelContextMenu: null });
  }, [menu]);

  if (!menu) return null;

  const store = useSchematicStore.getState();
  const node = store.nodes.find((n) => n.id === menu.nodeId);
  const data = node?.data as StubLabelData | undefined;

  const showPortLabel = boolItemLabel("Show port", data?.showPort, store.stubLabelShowPort);
  const showRoomLabel = boolItemLabel("Show room", data?.showRoom, store.stubLabelShowRoom);
  const pageModeLabel = pageModeItemLabel(data?.pageMode, store.stubLabelPageMode);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[200px]"
      style={{
        left: menuPos.x,
        top: menuPos.y,
        maxHeight: menuPos.maxHeight,
        overflowY: menuPos.maxHeight ? "auto" : undefined,
        visibility: menuPos.ready ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label={showPortLabel} onClick={() => cycleBool("showPort")} />
      <MenuItem label={showRoomLabel} onClick={() => cycleBool("showRoom")} />
      <MenuItem label={pageModeLabel} onClick={cyclePageMode} />
      <div className="border-t border-gray-200 my-1" />
      <MenuItem label="Show Full Connection" onClick={collapseStubs} />
    </div>
  );
}

function boolItemLabel(prefix: string, override: boolean | undefined, globalVal: boolean): string {
  if (override === undefined) return `${prefix}: Default (${globalVal ? "on" : "off"})`;
  return `${prefix}: ${override ? "On" : "Off"}`;
}

function pageModeItemLabel(override: StubLabelPageMode | undefined, globalVal: StubLabelPageMode): string {
  const fmt = (m: StubLabelPageMode) => m === "cross-page" ? "Cross-page" : m === "always" ? "Always" : "Never";
  if (override === undefined) return `Page mode: Default (${fmt(globalVal)})`;
  return `Page mode: ${fmt(override)}`;
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-xs cursor-pointer text-gray-700 hover:bg-blue-50 hover:text-blue-700"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
