import { useEffect, useCallback } from "react";
import { useSchematicStore } from "../store";
import type { RoomData } from "../types";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";

export default function RoomContextMenu() {
  const menu = useSchematicStore((s) => s.roomContextMenu);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  // Close on click anywhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ roomContextMenu: null });
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

  const editProperties = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().setEditingNodeId(menu.nodeId);
    useSchematicStore.setState({ roomContextMenu: null });
  }, [menu]);

  const toggleLock = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().toggleRoomLock(menu.nodeId);
    useSchematicStore.setState({ roomContextMenu: null });
  }, [menu]);

  const toggleEquipmentRack = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().toggleEquipmentRack(menu.nodeId);
    useSchematicStore.setState({ roomContextMenu: null });
  }, [menu]);

  const deleteRoom = useCallback(() => {
    if (!menu) return;
    useSchematicStore.setState({ roomContextMenu: null });
    useSchematicStore.getState().deleteNode(menu.nodeId);
  }, [menu]);

  const deleteRoomAndContents = useCallback(() => {
    if (!menu) return;
    useSchematicStore.setState({ roomContextMenu: null });
    useSchematicStore.getState().deleteNodeAndChildren(menu.nodeId);
  }, [menu]);

  if (!menu) return null;

  const node = useSchematicStore.getState().nodes.find((n) => n.id === menu.nodeId);
  const roomData = node?.data as RoomData | undefined;
  const isLocked = !!roomData?.locked;
  const isNested = !!node?.parentId;
  const isEquipmentRack = !!roomData?.isEquipmentRack;

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
      <MenuItem label="Edit Properties..." onClick={editProperties} />
      <MenuItem label={isLocked ? "Unlock Room" : "Lock Room"} onClick={toggleLock} />
      {isNested && (
        <MenuItem
          label={isEquipmentRack ? "Remove Equipment Rack" : "Mark as Equipment Rack"}
          onClick={toggleEquipmentRack}
        />
      )}
      <div className="border-t border-gray-200 my-1" />
      <MenuItem label="Delete Room" onClick={deleteRoom} danger />
      <MenuItem label="Delete Room & Contents" onClick={deleteRoomAndContents} danger />
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer ${
        danger
          ? "text-red-600 hover:bg-red-50 hover:text-red-700"
          : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
