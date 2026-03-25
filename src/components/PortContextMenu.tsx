import { useEffect, useCallback } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { DeviceData } from "../types";
import { portSide } from "../types";

export default function PortContextMenu() {
  const menu = useSchematicStore((s) => s.portContextMenu);
  const updateNodeInternals = useUpdateNodeInternals();

  // Close on click anywhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ portContextMenu: null });
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

  const flipPort = useCallback(() => {
    if (!menu) return;
    const { patchDeviceData, nodes } = useSchematicStore.getState();
    const node = nodes.find((n) => n.id === menu.nodeId);
    if (!node || node.type !== "device") return;
    const data = node.data as DeviceData;
    const newPorts = data.ports.map((p) =>
      p.id === menu.portId ? { ...p, flipped: !p.flipped || undefined } : p,
    );
    patchDeviceData(menu.nodeId, { ports: newPorts });
    // Force React Flow to re-measure handle positions after the flip
    updateNodeInternals(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu, updateNodeInternals]);

  const editDevice = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().setEditingNodeId(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu]);

  if (!menu) return null;

  const node = useSchematicStore.getState().nodes.find((n) => n.id === menu.nodeId);
  if (!node || node.type !== "device") return null;
  const data = node.data as DeviceData;
  const port = data.ports.find((p) => p.id === menu.portId);
  if (!port) return null;

  const side = portSide(port);
  const flipLabel = side === "left" ? "Flip to Right" : "Flip to Left";

  return (
    <div
      className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[160px]"
      style={{ left: menu.screenX, top: menu.screenY }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label={flipLabel} onClick={flipPort} />
      <div className="border-t border-gray-200 my-1" />
      <MenuItem label="Edit Device..." onClick={editDevice} />
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
