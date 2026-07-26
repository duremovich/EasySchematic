import { useEffect, useCallback } from "react";
import { useSchematicStore } from "../store";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";

/** Right-click menu for text-stub nodes (#196): edit the note text or delete the stub. */
export default function TextStubContextMenu() {
  const menu = useSchematicStore((s) => s.textStubContextMenu);
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ textStubContextMenu: null });
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
