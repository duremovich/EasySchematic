import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore, GRID_SIZE } from "../store";
import type { DeviceTemplate, DeviceNode } from "../types";

export default function DeviceCreatorPicker({
  position: positionProp,
  onClose,
}: {
  position?: { x: number; y: number };
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const nodes = useSchematicStore((s) => s.nodes);
  const createAndEditDevice = useSchematicStore((s) => s.createAndEditDevice);
  const rfInstance = useReactFlow();

  // Compute canvas position: use provided position or center of viewport
  const position = useMemo(() => {
    if (positionProp) return positionProp;
    const vp = rfInstance.getViewport();
    const container = document.querySelector(".react-flow");
    const cw = container?.clientWidth ?? window.innerWidth;
    const ch = container?.clientHeight ?? window.innerHeight;
    return {
      x: Math.round((-vp.x + cw / 2) / vp.zoom / GRID_SIZE) * GRID_SIZE,
      y: Math.round((-vp.y + ch / 2) / vp.zoom / GRID_SIZE) * GRID_SIZE,
    };
  }, [positionProp, rfInstance]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const devices = nodes.filter((n): n is DeviceNode => n.type === "device");

  const filtered = search.trim()
    ? devices.filter((d) => {
        const q = search.toLowerCase();
        return (
          d.data.label.toLowerCase().includes(q) ||
          d.data.deviceType.toLowerCase().includes(q) ||
          (d.data.manufacturer ?? "").toLowerCase().includes(q)
        );
      })
    : devices;

  const createBlank = useCallback(() => {
    const blank: DeviceTemplate = {
      deviceType: "custom",
      label: "New Device",
      ports: [],
    };
    createAndEditDevice(blank, position);
    onClose();
  }, [createAndEditDevice, position, onClose]);

  const createFromDevice = useCallback(
    (source: DeviceNode) => {
      const d = source.data;
      const template: DeviceTemplate = {
        deviceType: d.deviceType,
        label: "New Device",
        ports: d.ports.map((p) => ({ ...p })),
        ...(d.color ? { color: d.color } : {}),
        ...(d.headerColor ? { headerColor: d.color } : {}),
        ...(d.hostname ? { hostname: d.hostname } : {}),
        ...(d.powerDrawW != null ? { powerDrawW: d.powerDrawW } : {}),
        ...(d.powerCapacityW != null ? { powerCapacityW: d.powerCapacityW } : {}),
        ...(d.voltage ? { voltage: d.voltage } : {}),
        ...(d.poeBudgetW != null ? { poeBudgetW: d.poeBudgetW } : {}),
      };
      createAndEditDevice(template, position);
      onClose();
    },
    [createAndEditDevice, position, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && filtered.length === 0) {
      e.preventDefault();
      createBlank();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-72 flex flex-col overflow-hidden"
        style={{ left: "50%", top: "30%", transform: "translateX(-50%)" }}
      >
        <div className="px-3 pt-3 pb-1">
          <div className="text-xs font-semibold text-[var(--color-text-heading)] mb-2">
            Create New Device
          </div>
          <button
            onClick={createBlank}
            className="w-full text-left px-2.5 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-blue-400 hover:bg-blue-50 transition-colors mb-2"
          >
            <div className="text-xs font-medium text-[var(--color-text-heading)]">
              Start Blank
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)]">
              Empty device with no ports
            </div>
          </button>
        </div>

        <div className="px-3 pb-1">
          <div className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
            Or copy from canvas device
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search devices on canvas..."
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        <div className="max-h-48 overflow-y-auto px-3 pb-3 pt-1">
          {devices.length === 0 ? (
            <div className="text-[10px] text-[var(--color-text-muted)] py-2 text-center">
              No devices on canvas
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-[10px] text-[var(--color-text-muted)] py-2 text-center">
              No matching devices
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.id}
                onClick={() => createFromDevice(d)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-surface)] transition-colors flex items-center gap-2"
              >
                {d.data.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: d.data.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--color-text-heading)] truncate">
                    {d.data.label}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                    {d.data.manufacturer ? `${d.data.manufacturer} \u00b7 ` : ""}
                    {d.data.deviceType} \u00b7 {d.data.ports.length} port{d.data.ports.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
