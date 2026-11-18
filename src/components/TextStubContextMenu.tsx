import { useCallback } from "react";
import { useSchematicStore } from "../store";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";
import { useContextMenuDismiss } from "../hooks/useContextMenuDismiss";

const closeMenu = () => useSchematicStore.setState({ textStubContextMenu: null });

/** Right-click menu for text-stub nodes (#196): edit the note text or delete the stub. */
export default function TextStubContextMenu() {
  const menu = useSchematicStore((s) => s.textStubContextMenu);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  // One menu at a time; a press or right-click outside it, or Escape, closes it (#411).
  useContextMenuDismiss(!!menu, closeMenu);

  const editText = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().setEditingNodeId(menu.nodeId);
    useSchematicStore.setState({ textStubContextMenu: null });
  }, [menu]);

  const deleteStub = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().deleteNode(menu.nodeId);
    useSchematicStore.setState({ textStubContextMenu: null });
  }, [menu]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      data-context-menu=""
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
      <MenuItem label="Edit Text..." onClick={editText} />
      <div className="border-t border-gray-200 my-1" />
      <MenuItem label="Delete Text Stub" onClick={deleteStub} />
    </div>
  );
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
