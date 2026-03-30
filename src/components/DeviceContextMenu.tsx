import { useCallback, useEffect, useRef } from "react";
import { useSchematicStore } from "../store";
import type { DeviceData } from "../types";
import { inferRackHeightU } from "../rackUtils";

export default function DeviceContextMenu() {
  const pages = useSchematicStore((s) => s.pages);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const nodes = useSchematicStore((s) => s.nodes);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const deviceContextMenu = useSchematicStore((s) => s.deviceContextMenu);
  const setDeviceContextMenu = useSchematicStore((s) => s.setDeviceContextMenu);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setDeviceContextMenu(null), [setDeviceContextMenu]);

  useEffect(() => {
    if (!deviceContextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [deviceContextMenu, close]);

  if (!deviceContextMenu) return null;

  const { nodeId, screenX, screenY } = deviceContextMenu;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.type !== "device") return null;

  const deviceData = node.data as DeviceData;

  // Find which page/rack this device is placed in (if any)
  const placement = pages
    .flatMap((p) => p.placements.map((pl) => ({ page: p, placement: pl })))
    .find((x) => x.placement.deviceNodeId === nodeId);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 text-xs min-w-[160px]"
      style={{ left: screenX, top: screenY }}
    >
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
        onClick={() => { setEditingNodeId(nodeId); close(); }}
      >
        Edit Device
      </button>

      <div className="border-t border-neutral-100 my-0.5" />

      {placement ? (
        <button
          className="w-full text-left px-3 py-1.5 hover:bg-neutral-100"
          onClick={() => {
            setActivePage(placement.page.id);
            close();
          }}
        >
          Show in Rack ({placement.page.label})
        </button>
      ) : pages.length > 0 ? (
        <>
          <div className="px-3 py-1 text-neutral-400 text-[10px] uppercase tracking-wider">
            Place in Rack
          </div>
          {pages.map((page) =>
            page.racks.map((rack) => (
              <button
                key={`${page.id}-${rack.id}`}
                className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 pl-5"
                onClick={() => {
                  // Find first available U position
                  const state = useSchematicStore.getState();
                  const heightU = inferRackHeightU(deviceData);
                  for (let u = 1; u <= rack.heightU - heightU + 1; u++) {
                    if (state.isRackSlotAvailable(page.id, rack.id, u, heightU, "front")) {
                      state.addRackPlacement(page.id, {
                        rackId: rack.id,
                        deviceNodeId: nodeId,
                        uPosition: u,
                        face: "front",
                      });
                      state.addToast(`Placed ${deviceData.label} in ${rack.label} at U${u}`, "success");
                      close();
                      return;
                    }
                  }
                  state.addToast(`No space in ${rack.label} for ${heightU}U device`, "error");
                  close();
                }}
              >
                {rack.label} ({rack.heightU}U)
              </button>
            ))
          )}
        </>
      ) : (
        <div className="px-3 py-1.5 text-neutral-400">
          No rack pages yet
        </div>
      )}
    </div>
  );
}
