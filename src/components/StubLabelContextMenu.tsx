import { useCallback } from "react";
import { useSchematicStore } from "../store";
import type { StubLabelData, StubLabelPageMode } from "../types";
import { selectedConnectionEdges, stubbedLinkIdsOf } from "../stubSelection";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";
import { useContextMenuDismiss } from "../hooks/useContextMenuDismiss";

const closeMenu = () => useSchematicStore.setState({ stubLabelContextMenu: null });

/** Right-click menu for stub-label nodes — what the tag prints, per-stub overrides for
 *  the four label fields, plus a "show full connection" collapse action. Each cycle item
 *  rotates through "Default (follows global)" → explicit-on → explicit-off → undefined. */
export default function StubLabelContextMenu() {
  const menu = useSchematicStore((s) => s.stubLabelContextMenu);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  // One menu at a time; a press or right-click outside it, or Escape, closes it (#411).
  useContextMenuDismiss(!!menu, closeMenu);

  const cycleBool = useCallback(
    (field: "showArrow" | "showPort" | "showRoom") => {
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

  // "Cable ID only" turns the tag into a plain cable tag — no destination device, port,
  // room or page, whatever those toggles say (#270). Two states only, so this is a
  // straight flip rather than a Default/on/off cycle: the default-mode setting (#377) is
  // applied when a connection is stubbed, not deferred to here. The flip covers both tags
  // of the connection in one undo step, since they are one cable (#376).
  const toggleLabelMode = useCallback(() => {
    if (!menu) return;
    const store = useSchematicStore.getState();
    store.toggleStubLabelMode(menu.nodeId);
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

  const collapseSelection = useCallback(() => {
    const store = useSchematicStore.getState();
    store.collapseStubsForEdges(
      selectedConnectionEdges(store.nodes, store.edges).map((e) => e.id),
    );
    useSchematicStore.setState({ stubLabelContextMenu: null });
  }, []);

  if (!menu) return null;

  const store = useSchematicStore.getState();
  const node = store.nodes.find((n) => n.id === menu.nodeId);
  const data = node?.data as StubLabelData | undefined;

  const showArrowLabel = boolItemLabel("Show arrow", data?.showArrow, store.stubLabelShowArrow);
  const showPortLabel = boolItemLabel("Show port", data?.showPort, store.stubLabelShowPort);
  // The room default is "other rooms only" — a same-room tag leaves it off unless the tag
  // itself is set On (#297) — so the Default label says so rather than a bare "on".
  const showRoomLabel = boolItemLabel("Show room", data?.showRoom, store.stubLabelShowRoom, "other rooms");
  const pageModeLabel = pageModeItemLabel(data?.pageMode, store.stubLabelPageMode);
  // The four content toggles say nothing about a cable-ID-only tag, so they come off the
  // menu in that mode rather than sitting there doing nothing when clicked.
  const cableIdOnly = data?.labelMode === "cableId";

  // Bulk unstub (#349): the tag is the only part of a stub with real hit area, so this is
  // the menu a user reaches for after selecting a column of them. Offered on the same
  // terms as the connection menu's version — ≥2 stubbed connections selected, and the
  // right-clicked tag among them.
  const selectedEdges = selectedConnectionEdges(store.nodes, store.edges);
  const selectedLinkIds = stubbedLinkIdsOf(selectedEdges);
  const canBulkCollapse =
    selectedLinkIds.length >= 2 && !!data?.linkedConnectionId
    && selectedLinkIds.includes(data.linkedConnectionId);

  return (
    <div
      ref={menuRef}
      data-context-menu=""
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
      <MenuItem
        label={`Tag text: ${cableIdOnly ? "Cable ID only" : "Destination"}`}
        onClick={toggleLabelMode}
      />
      {!cableIdOnly && (
        <>
          <MenuItem label={showArrowLabel} onClick={() => cycleBool("showArrow")} />
          <MenuItem label={showPortLabel} onClick={() => cycleBool("showPort")} />
          <MenuItem label={showRoomLabel} onClick={() => cycleBool("showRoom")} />
          <MenuItem label={pageModeLabel} onClick={cyclePageMode} />
        </>
      )}
      <div className="border-t border-gray-200 my-1" />
      <MenuItem label="Show Full Connection" onClick={collapseStubs} />
      {canBulkCollapse && (
        <MenuItem
          label={`Show ${selectedLinkIds.length} Selected Connections in Full`}
          onClick={collapseSelection}
        />
      )}
    </div>
  );
}

function boolItemLabel(prefix: string, override: boolean | undefined, globalVal: boolean, onText = "on"): string {
  if (override === undefined) return `${prefix}: Default (${globalVal ? onText : "off"})`;
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
