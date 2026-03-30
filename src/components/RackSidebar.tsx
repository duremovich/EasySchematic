import { useCallback, useState } from "react";
import { useSchematicStore } from "../store";
import type { DeviceData, SchematicPage, RackType } from "../types";
import { RACK_TYPE_LABELS } from "../types";
import { inferRackHeightU } from "../rackUtils";

/** Shared drag state — set by sidebar, read by RackRenderer during dragOver. */
export let draggedDeviceHeightU = 1;

interface RackSidebarProps {
  page: SchematicPage;
}

export default function RackSidebar({ page }: RackSidebarProps) {
  const nodes = useSchematicStore((s) => s.nodes);
  const removeRack = useSchematicStore((s) => s.removeRack);
  const updateRack = useSchematicStore((s) => s.updateRack);
  const [showAddRack, setShowAddRack] = useState(false);
  const [search, setSearch] = useState("");
  const [editingRackId, setEditingRackId] = useState<string | null>(null);
  const [editingRackLabel, setEditingRackLabel] = useState("");

  // Find devices that haven't been placed in ANY rack on ANY page
  const allPages = useSchematicStore((s) => s.pages);
  const placedNodeIds = new Set(
    allPages.flatMap((p) => p.placements.map((pl) => pl.deviceNodeId))
  );

  const unrackedDevices = nodes.filter(
    (n) => n.type === "device" && !placedNodeIds.has(n.id) && (n.data as DeviceData).deviceType !== "adapter"
  );

  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string, rackHeightU: number) => {
    e.dataTransfer.setData("application/x-rack-device-id", nodeId);
    e.dataTransfer.effectAllowed = "move";
    draggedDeviceHeightU = rackHeightU;
  }, []);

  return (
    <div className="w-56 bg-white border-r border-neutral-300 flex flex-col text-xs overflow-hidden">
      {/* Add Rack section */}
      <div className="p-2 border-b border-neutral-200">
        <button
          className="w-full px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          onClick={() => setShowAddRack(true)}
        >
          + Add Rack
        </button>
      </div>

      {/* Racks on this page */}
      {page.racks.length > 0 && (
        <div className="p-2 border-b border-neutral-200">
          <div className="font-semibold text-neutral-500 mb-1 uppercase tracking-wider" style={{ fontSize: 9 }}>
            Racks
          </div>
          {page.racks.map((rack) => {
            const placementCount = page.placements.filter((p) => p.rackId === rack.id).length;
            const isEditing = editingRackId === rack.id;
            return (
              <div key={rack.id} className="flex items-center justify-between py-0.5 text-neutral-700 group">
                {isEditing ? (
                  <input
                    className="flex-1 min-w-0 bg-white border border-blue-400 rounded px-1 py-0 text-xs outline-none"
                    value={editingRackLabel}
                    autoFocus
                    onChange={(e) => setEditingRackLabel(e.target.value)}
                    onBlur={() => {
                      if (editingRackLabel.trim()) updateRack(page.id, rack.id, { label: editingRackLabel.trim() });
                      setEditingRackId(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") { if (editingRackLabel.trim()) updateRack(page.id, rack.id, { label: editingRackLabel.trim() }); setEditingRackId(null); }
                      if (e.key === "Escape") setEditingRackId(null);
                    }}
                  />
                ) : (
                  <span
                    className="truncate cursor-pointer"
                    onDoubleClick={() => { setEditingRackId(rack.id); setEditingRackLabel(rack.label); }}
                    title="Double-click to rename"
                  >
                    {rack.label} ({rack.heightU}U)
                  </span>
                )}
                <span className="text-neutral-400 text-[10px] shrink-0 ml-1">
                  {placementCount > 0 && `${placementCount} dev`}
                  <button
                    className="ml-1 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={`Delete ${rack.label}`}
                    onClick={() => {
                      if (confirm(`Delete "${rack.label}"? This removes all devices placed in it.`)) {
                        removeRack(page.id, rack.id);
                      }
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Unracked devices */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col">
        <div className="font-semibold text-neutral-500 mb-1 uppercase tracking-wider" style={{ fontSize: 9 }}>
          Unracked Devices ({unrackedDevices.length})
        </div>
        {unrackedDevices.length > 0 && (
          <input
            className="w-full bg-neutral-50 border border-neutral-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-400 mb-1"
            placeholder="Search devices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        )}
        {unrackedDevices.length === 0 ? (
          <div className="text-neutral-400 py-2">All devices placed</div>
        ) : (
          <div className="flex flex-col gap-0.5 overflow-y-auto flex-1">
            {unrackedDevices
              .filter((node) => {
                if (!search.trim()) return true;
                const data = node.data as DeviceData;
                const q = search.toLowerCase();
                return data.label.toLowerCase().includes(q)
                  || (data.manufacturer?.toLowerCase().includes(q) ?? false)
                  || (data.modelNumber?.toLowerCase().includes(q) ?? false)
                  || data.deviceType.toLowerCase().includes(q);
              })
              .sort((a, b) => ((a.data as DeviceData).label).localeCompare((b.data as DeviceData).label))
              .map((node) => {
                const data = node.data as DeviceData;
                const heightU = inferRackHeightU(data);
                return (
                  <div
                    key={node.id}
                    className="flex items-center justify-between px-2 py-1 rounded bg-neutral-50 border border-neutral-200 cursor-grab hover:bg-blue-50 hover:border-blue-300"
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.id, heightU)}
                  >
                    <span className="truncate" title={data.label}>{data.label}</span>
                    <span className="text-neutral-400 ml-1 shrink-0">{heightU}U</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Add Rack Dialog */}
      {showAddRack && (
        <AddRackDialog
          pageId={page.id}
          rackCount={page.racks.length}
          onClose={() => setShowAddRack(false)}
        />
      )}
    </div>
  );
}

interface RackPreset {
  label: string;
  rackType: RackType;
  heightU: number;
  depthMm: number;
  description: string;
}

const RACK_PRESETS: RackPreset[] = [
  { label: "42U Floor Rack", rackType: "floor-19", heightU: 42, depthMm: 600, description: "Standard full-height AV rack" },
  { label: "25U Floor Rack", rackType: "floor-19", heightU: 25, depthMm: 600, description: "Half-height floor standing" },
  { label: "16U Floor Rack", rackType: "floor-19", heightU: 16, depthMm: 600, description: "Short floor standing" },
  { label: "12U Wall Mount", rackType: "wall-mount", heightU: 12, depthMm: 600, description: "Wall-mounted enclosure" },
  { label: "6U Wall Mount", rackType: "wall-mount", heightU: 6, depthMm: 600, description: "Small wall-mount" },
  { label: "4U Desktop", rackType: "desktop", heightU: 4, depthMm: 600, description: "Tabletop / portable" },
  { label: "8U Desktop", rackType: "desktop", heightU: 8, depthMm: 600, description: "Larger tabletop rack" },
  { label: "45U Open 2-Post", rackType: "open-2post", heightU: 45, depthMm: 600, description: "2-post relay rack" },
  { label: "12U Open 2-Post", rackType: "open-2post", heightU: 12, depthMm: 600, description: "Small 2-post relay rack" },
  { label: "42U Open 4-Post", rackType: "open-4post", heightU: 42, depthMm: 800, description: "4-post open frame" },
];

function AddRackDialog({ pageId, rackCount, onClose }: { pageId: string; rackCount: number; onClose: () => void }) {
  const addRack = useSchematicStore((s) => s.addRack);
  const [mode, setMode] = useState<"presets" | "custom">("presets");
  const [label, setLabel] = useState(`Rack ${rackCount + 1}`);
  const [rackType, setRackType] = useState<RackType>("floor-19");
  const [heightU, setHeightU] = useState(42);
  const [depthMm, setDepthMm] = useState(600);

  const applyPreset = useCallback((preset: RackPreset) => {
    addRack(pageId, {
      label: `Rack ${rackCount + 1}`,
      rackType: preset.rackType,
      heightU: preset.heightU,
      depthMm: preset.depthMm,
      widthClass: "19in",
      position: { x: rackCount * 400, y: 0 },
    });
    onClose();
  }, [pageId, rackCount, addRack, onClose]);

  const handleCustomSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    addRack(pageId, {
      label: label.trim() || `Rack ${rackCount + 1}`,
      rackType,
      heightU: Math.max(2, Math.min(52, heightU)),
      depthMm,
      widthClass: "19in",
      position: { x: rackCount * 400, y: 0 },
    });
    onClose();
  }, [pageId, label, rackType, heightU, depthMm, rackCount, addRack, onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-4 w-80 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Add Rack</h3>
          <div className="flex rounded overflow-hidden border border-neutral-300">
            <button
              className={`px-2 py-0.5 ${mode === "presets" ? "bg-blue-600 text-white" : "bg-white text-neutral-600"}`}
              onClick={() => setMode("presets")}
            >
              Presets
            </button>
            <button
              className={`px-2 py-0.5 ${mode === "custom" ? "bg-blue-600 text-white" : "bg-white text-neutral-600"}`}
              onClick={() => setMode("custom")}
            >
              Custom
            </button>
          </div>
        </div>

        {mode === "presets" ? (
          <div className="flex flex-col gap-1">
            {RACK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="flex items-center justify-between px-3 py-2 rounded border border-neutral-200 hover:border-blue-400 hover:bg-blue-50 text-left transition-colors"
                onClick={() => applyPreset(preset)}
              >
                <div>
                  <div className="font-medium text-neutral-800">{preset.label}</div>
                  <div className="text-neutral-400 text-[10px]">{preset.description}</div>
                </div>
                <span className="text-neutral-400 shrink-0 ml-2">{preset.heightU}U</span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit}>
            <label className="block mb-2">
              <span className="text-neutral-600">Label</span>
              <input
                className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </label>

            <label className="block mb-2">
              <span className="text-neutral-600">Type</span>
              <select
                className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
                value={rackType}
                onChange={(e) => setRackType(e.target.value as RackType)}
              >
                {(Object.entries(RACK_TYPE_LABELS) as [RackType, string][]).map(([value, lbl]) => (
                  <option key={value} value={value}>{lbl}</option>
                ))}
              </select>
            </label>

            <div className="flex gap-2 mb-3">
              <label className="block flex-1">
                <span className="text-neutral-600">Height (U)</span>
                <input
                  type="number"
                  className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
                  value={heightU}
                  onChange={(e) => setHeightU(Number(e.target.value))}
                  min={2}
                  max={52}
                />
              </label>
              <label className="block flex-1">
                <span className="text-neutral-600">Depth (mm)</span>
                <select
                  className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-400"
                  value={depthMm}
                  onChange={(e) => setDepthMm(Number(e.target.value))}
                >
                  <option value={600}>600mm</option>
                  <option value={800}>800mm</option>
                  <option value={1000}>1000mm</option>
                  <option value={1200}>1200mm</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
                Add
              </button>
            </div>
          </form>
        )}

        {mode === "presets" && (
          <div className="flex justify-end mt-2">
            <button className="px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
