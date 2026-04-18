import { useState, useEffect, useCallback, useRef, useMemo, type DragEvent } from "react";
import { useSchematicStore } from "../store";
import {
  SIGNAL_LABELS,
  SIGNAL_COLORS,
  CONNECTOR_LABELS,
  type SignalType,
  type ConnectorType,
  type Port,
  type PortDirection,
  type PortNetworkConfig,
  type PortCapabilities,
  type DeviceData,
  type DeviceNode,
  type DhcpServerConfig,
  type SlotDefinition,
} from "../types";
import { DEFAULT_CONNECTOR, NETWORK_SIGNAL_TYPES, VIDEO_SIGNAL_TYPES } from "../connectorTypes";
import { getBundledTemplates, getCardsByFamily, checkSession, createDraft, createHandoff } from "../templateApi";
import { getTemplateDrift } from "../templateSync";
import LoginDialog from "./LoginDialog";
import CardCreatorDialog from "./CardCreatorDialog";
import TemplateSyncDialog from "./TemplateSyncDialog";
import { isValidIpv4, isValidSubnetMask, isValidVlan, findDuplicateIps } from "../networkValidation";
import IpInput from "./IpInput";
import { AUX_FIELD_GROUPS, resolveAuxiliaryLine } from "../auxiliaryData";

const ALL_SIGNAL_TYPES = (Object.keys(SIGNAL_LABELS) as SignalType[]).sort(
  (a, b) => SIGNAL_LABELS[a].localeCompare(SIGNAL_LABELS[b]),
);
const ALL_CONNECTOR_TYPES = (Object.keys(CONNECTOR_LABELS) as ConnectorType[]).sort(
  (a, b) => CONNECTOR_LABELS[a].localeCompare(CONNECTOR_LABELS[b]),
);

interface PortDraft {
  id: string;
  label: string;
  signalType: SignalType;
  direction: PortDirection;
  section?: string;
  connectorType?: ConnectorType;
  networkConfig?: PortNetworkConfig;
  addressable?: boolean;
  capabilities?: PortCapabilities;
  isMulticable?: boolean;
  channelCount?: number;
  directAttach?: boolean;
  notes?: string;
  poeDrawW?: number;
  linkSpeed?: string;
  flipped?: boolean;
}

function newPortDraft(direction: PortDirection): PortDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    signalType: "sdi",
    direction,
    connectorType: DEFAULT_CONNECTOR["sdi"],
  };
}

const MIME = "application/easyschematic-port";

export default function DeviceEditor() {
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const nodes = useSchematicStore((s) => s.nodes);
  const updateDevice = useSchematicStore((s) => s.updateDevice);
  const syncDeviceFromTemplate = useSchematicStore((s) => s.syncDeviceFromTemplate);
  const edges = useSchematicStore((s) => s.edges);
  const setEditingNodeId = useSchematicStore((s) => s.setEditingNodeId);
  const setCreatingNodeId = useSchematicStore((s) => s.setCreatingNodeId);
  const undo = useSchematicStore((s) => s.undo);
  const addCustomTemplate = useSchematicStore((s) => s.addCustomTemplate);
  const customTemplates = useSchematicStore((s) => s.customTemplates);
  const templateHiddenSignals = useSchematicStore((s) => s.templateHiddenSignals);
  const setTemplateHiddenSignals = useSchematicStore((s) => s.setTemplateHiddenSignals);
  const templatePresets = useSchematicStore((s) => s.templatePresets);
  const setTemplatePreset = useSchematicStore((s) => s.setTemplatePreset);

  const node = nodes.find((n) => n.id === editingNodeId && n.type === "device") as DeviceNode | undefined;

  const [label, setLabel] = useState("");
  const [hostname, setHostname] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [headerColor, setHeaderColor] = useState<string | undefined>(undefined);
  const [ports, setPorts] = useState<PortDraft[]>([]);

  // Port visibility local state
  const [showAllPorts, setShowAllPorts] = useState(false);
  const [hiddenPorts, setHiddenPorts] = useState<string[]>([]);
  const [portVisOpen, setPortVisOpen] = useState(false);

  // DHCP server config
  const [dhcpServer, setDhcpServer] = useState<DhcpServerConfig | undefined>(undefined);

  // Power fields
  const [powerDrawW, setPowerDrawW] = useState<number | undefined>(undefined);
  const [powerCapacityW, setPowerCapacityW] = useState<number | undefined>(undefined);
  const [voltage, setVoltage] = useState<string | undefined>(undefined);
  const [poeBudgetW, setPoeBudgetW] = useState<number | undefined>(undefined);
  const [poeDrawW, setPoeDrawW] = useState<number | undefined>(undefined);

  // Cost
  const [unitCost, setUnitCost] = useState<number | undefined>(undefined);

  // Physical dimensions
  const [heightMm, setHeightMm] = useState<number | undefined>(undefined);
  const [widthMm, setWidthMm] = useState<number | undefined>(undefined);
  const [depthMm, setDepthMm] = useState<number | undefined>(undefined);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);

  // Cable accessory flags
  const [isCableAccessory, setIsCableAccessory] = useState(false);
  const [integratedWithCable, setIntegratedWithCable] = useState(false);
  const [isVenueProvided, setIsVenueProvided] = useState(false);
  const [adapterVisibility, setAdapterVisibility] = useState<"default" | "force-show" | "force-hide">("default");

  // Auxiliary data lines
  const [auxiliaryData, setAuxiliaryData] = useState<string[]>([]);
  const [auxFieldMenuIdx, setAuxFieldMenuIdx] = useState<number | null>(null);
  const auxInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const auxMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (auxFieldMenuIdx === null) return;
    const onDown = (e: MouseEvent) => {
      if (!auxMenuRef.current) return;
      if (!auxMenuRef.current.contains(e.target as Node)) setAuxFieldMenuIdx(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [auxFieldMenuIdx]);

  // Login dialog for community submission
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  // Drag state — which port is being dragged and where it would drop
  const [draggedPortId, setDraggedPortId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ direction: PortDirection; index: number } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing props to local editor state */
  useEffect(() => {
    if (!node) return;
    setLabel(node.data.label);
    setHostname(node.data.hostname ?? "");
    setDeviceType(node.data.deviceType);
    setManufacturer(node.data.manufacturer ?? "");
    setColor(node.data.color);
    setHeaderColor(node.data.headerColor);
    setPorts(
      node.data.ports.map((p) => ({
        id: p.id,
        label: p.label,
        signalType: p.signalType,
        direction: p.direction,
        section: p.section,
        connectorType: p.connectorType,
        networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
        capabilities: p.capabilities ? { ...p.capabilities } : undefined,
        isMulticable: p.isMulticable,
        channelCount: p.channelCount,
        directAttach: p.directAttach,
        notes: p.notes,
        poeDrawW: p.poeDrawW,
        linkSpeed: p.linkSpeed,
        flipped: p.flipped,
        addressable: p.addressable,
      })),
    );
    setShowAllPorts(node.data.showAllPorts ?? false);
    setHiddenPorts(node.data.hiddenPorts ?? []);
    setPortVisOpen(false);
    setDhcpServer(node.data.dhcpServer ? { ...node.data.dhcpServer } : undefined);
    setPowerDrawW(node.data.powerDrawW);
    setPowerCapacityW(node.data.powerCapacityW);
    setVoltage(node.data.voltage);
    setPoeBudgetW(node.data.poeBudgetW);
    setPoeDrawW(node.data.poeDrawW);
    setUnitCost(node.data.unitCost);
    setHeightMm(node.data.heightMm);
    setWidthMm(node.data.widthMm);
    setDepthMm(node.data.depthMm);
    setWeightKg(node.data.weightKg);
    setIsCableAccessory(node.data.isCableAccessory ?? false);
    setIntegratedWithCable(node.data.integratedWithCable ?? false);
    setIsVenueProvided(node.data.isVenueProvided ?? false);
    setAdapterVisibility(node.data.adapterVisibility ?? "default");
    setAuxiliaryData(node.data.auxiliaryData ?? []);
  }, [node]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const close = useCallback(() => {
    // Read live store state — a stale closure here would make handleSave
    // (which clears creatingNodeId just before calling close) trigger the
    // provisional-undo branch and revert the user's just-saved data.
    const { editingNodeId: eId, creatingNodeId: cId } = useSchematicStore.getState();
    if (eId && eId === cId) {
      // Provisional node — user cancelled without saving, undo the addDevice
      undo();
      setCreatingNodeId(null);
    }
    setEditingNodeId(null);
  }, [undo, setCreatingNodeId, setEditingNodeId]);

  const handleSave = useCallback(() => {
    if (!editingNodeId) return;

    // Build old→new ID map for draft ports
    const idMap = new Map<string, string>();
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => {
        const newId = p.id.startsWith("draft-") ? `p${Date.now()}-${i}` : p.id;
        if (newId !== p.id) idMap.set(p.id, newId);
        return { ...p, id: newId, label: p.label.trim() };
      });

    // Remap and prune stale IDs from hiddenPorts
    const finalPortIds = new Set(finalPorts.map((p) => p.id));
    const finalHiddenPorts = hiddenPorts
      .map((id) => idMap.get(id) ?? id)
      .filter((id) => finalPortIds.has(id));

    // Preserve existing metadata fields from the node
    const existing = node?.data;
    const data: DeviceData = {
      label: label.trim() || "Untitled",
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      deviceType: deviceType.trim() || "custom",
      ports: finalPorts,
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(existing?.modelNumber ? { modelNumber: existing.modelNumber } : {}),
      ...(existing?.templateId ? { templateId: existing.templateId } : {}),
      ...(existing?.templateVersion ? { templateVersion: existing.templateVersion } : {}),
      ...(color ? { color } : {}),
      ...(headerColor ? { headerColor } : {}),
      ...(existing?.model ? { model: existing.model } : {}),
      ...(showAllPorts ? { showAllPorts: true } : {}),
      ...(finalHiddenPorts.length > 0 ? { hiddenPorts: finalHiddenPorts } : {}),
      // Always persist dhcpServer if set (preserves range config when toggling off)
      ...(dhcpServer ? { dhcpServer } : {}),
      ...(powerDrawW != null ? { powerDrawW } : {}),
      ...(powerCapacityW != null ? { powerCapacityW } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
      ...(voltage ? { voltage } : {}),
      ...(unitCost != null ? { unitCost } : {}),
      ...(heightMm != null ? { heightMm } : {}),
      ...(widthMm != null ? { widthMm } : {}),
      ...(depthMm != null ? { depthMm } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(isCableAccessory ? { isCableAccessory: true } : {}),
      ...(integratedWithCable ? { integratedWithCable: true } : {}),
      ...(isVenueProvided ? { isVenueProvided: true } : {}),
      ...(adapterVisibility !== "default" ? { adapterVisibility } : {}),
      ...(existing?.baseLabel ? { baseLabel: existing.baseLabel } : {}),
      ...(existing?.slots ? { slots: existing.slots } : {}),
      ...(auxiliaryData.filter((line) => line.trim()).length > 0 ? { auxiliaryData: auxiliaryData.filter((line) => line.trim()) } : {}),
    };
    updateDevice(editingNodeId, data);
    setCreatingNodeId(null); // commit the node — close won't undo it
    close();
  }, [editingNodeId, ports, label, hostname, deviceType, manufacturer, color, headerColor, node, updateDevice, close, setCreatingNodeId, showAllPorts, hiddenPorts, dhcpServer, powerDrawW, powerCapacityW, voltage, poeBudgetW, poeDrawW, unitCost, heightMm, widthMm, depthMm, weightKg, isCableAccessory, integratedWithCable, isVenueProvided, adapterVisibility, auxiliaryData]);

  // Ctrl+Enter anywhere in the editor → Apply & Close
  const onCtrlEnter = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    }
  }, [handleSave]);

  const handleSaveAsTemplate = useCallback(() => {
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));

    const existing = node?.data;
    addCustomTemplate({
      id: `custom-${Date.now()}`,
      deviceType: deviceType.trim() || "custom",
      label: label.trim() || "Custom Device",
      ports: finalPorts,
      ...(color ? { color } : {}),
      ...(existing?.category ? { category: String(existing.category) } : {}),
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(existing?.modelNumber ? { modelNumber: existing.modelNumber } : {}),
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
    });
  }, [ports, label, hostname, node, addCustomTemplate, poeBudgetW, poeDrawW, deviceType, color, manufacturer]);

  const handleSubmitToCommunity = useCallback(async () => {
    const finalPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({
        ...p,
        id: `tpl-${i}`,
        label: p.label.trim(),
      }));

    if (finalPorts.length === 0) return;

    const existing = node?.data;
    let dt = deviceType.trim() || "custom";
    if (dt.startsWith("custom-")) dt = "";

    const draftData: Record<string, unknown> = {
      label: label.trim() || "Custom Device",
      deviceType: dt,
      ports: finalPorts,
      ...(color ? { color } : {}),
      ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
      ...(existing?.modelNumber ? { modelNumber: existing.modelNumber } : {}),
      ...(existing?.referenceUrl ? { referenceUrl: existing.referenceUrl } : {}),
      ...(existing?.category ? { category: existing.category } : {}),
      ...(existing?.slots ? { slots: existing.slots } : {}),
      ...(existing?.slotFamily ? { slotFamily: existing.slotFamily } : {}),
      ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
      ...(poeBudgetW != null ? { poeBudgetW } : {}),
      ...(poeDrawW != null ? { poeDrawW } : {}),
    };

    const devicesUrl = import.meta.env.VITE_DEVICES_URL ?? "https://devices.easyschematic.live";

    const user = await checkSession();
    if (!user) {
      // Save to localStorage and show login dialog
      localStorage.setItem("easyschematic-pending-submission", JSON.stringify({
        data: draftData,
        timestamp: Date.now(),
      }));
      setShowLoginDialog(true);
      return;
    }

    try {
      const draftId = await createDraft(draftData);
      let url = `${devicesUrl}/#/submit?draft=${draftId}`;
      try {
        const authToken = await createHandoff();
        url += `&auth=${authToken}`;
      } catch { /* cookie domain should handle it */ }
      window.open(url, "_blank");
    } catch (e) {
      console.error("Failed to create draft:", e);
    }
  }, [ports, label, deviceType, color, node, hostname, poeBudgetW, poeDrawW, manufacturer]);

  const handleSaveAsPreset = useCallback(() => {
    if (!editingNodeId || !node?.data.templateId) return;
    const templateId = node.data.templateId;

    // Normalize ports to stable preset IDs
    const presetPorts: Port[] = ports
      .filter((p) => p.label.trim())
      .map((p, i) => ({ ...p, id: `preset-${i}`, label: p.label.trim() }));

    // Remap hiddenPorts through old→new mapping
    const idMap = new Map<string, string>();
    ports.filter((p) => p.label.trim()).forEach((p, i) => { idMap.set(p.id, `preset-${i}`); });
    const presetHidden = hiddenPorts
      .map((id) => idMap.get(id) ?? id)
      .filter((id) => presetPorts.some((p) => p.id === id));

    setTemplatePreset(templateId, {
      ports: presetPorts,
      ...(presetHidden.length > 0 ? { hiddenPorts: presetHidden } : {}),
      ...(color ? { color } : {}),
    });

    // Also apply changes to current device
    handleSave();
  }, [editingNodeId, node, ports, hiddenPorts, color, setTemplatePreset, handleSave]);

  const handleRevertToTemplate = useCallback(() => {
    if (!node) return;
    const templateId = node.data.templateId;
    const tpl = templateId
      ? getBundledTemplates().find((t) => t.id === templateId) ??
        customTemplates.find((t) => t.id === templateId)
      : undefined;
    if (!tpl) return;

    setPorts(tpl.ports.map((p) => ({
      id: p.id,
      label: p.label,
      signalType: p.signalType,
      direction: p.direction,
      section: p.section,
      connectorType: p.connectorType,
      networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
      capabilities: p.capabilities ? { ...p.capabilities } : undefined,
      directAttach: p.directAttach,
      notes: p.notes,
      poeDrawW: p.poeDrawW,
      linkSpeed: p.linkSpeed,
      flipped: p.flipped,
      addressable: p.addressable,
    })));
    setHiddenPorts([]);
    setColor(tpl.color);
  }, [node, customTemplates]);

  const handleRevertToPreset = useCallback(() => {
    if (!node?.data.templateId) return;
    const preset = templatePresets[node.data.templateId];
    if (!preset) return;

    setPorts(preset.ports.map((p) => ({
      id: p.id,
      label: p.label,
      signalType: p.signalType,
      direction: p.direction,
      section: p.section,
      connectorType: p.connectorType,
      networkConfig: p.networkConfig ? { ...p.networkConfig } : undefined,
      capabilities: p.capabilities ? { ...p.capabilities } : undefined,
      directAttach: p.directAttach,
      notes: p.notes,
      poeDrawW: p.poeDrawW,
      linkSpeed: p.linkSpeed,
      flipped: p.flipped,
      addressable: p.addressable,
    })));
    setHiddenPorts(preset.hiddenPorts ?? []);
    setColor(preset.color);
  }, [node, templatePresets]);

  const addPort = (direction: PortDirection) => {
    setPorts([...ports, newPortDraft(direction)]);
  };

  const removePort = (id: string) => {
    setPorts(ports.filter((p) => p.id !== id));
  };

  const updatePort = (id: string, updates: Partial<PortDraft>) => {
    setPorts(ports.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const bulkAddPorts = (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => {
    const newPorts: PortDraft[] = [];
    for (let i = 0; i < count; i++) {
      newPorts.push({
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
        label: `${prefix} ${start + i}`,
        signalType,
        direction,
        section: section || undefined,
      });
    }
    setPorts([...ports, ...newPorts]);
  };

  // Drag-and-drop: move a port to a new position/section
  const movePortTo = useCallback(
    (portId: string, targetDirection: PortDirection, targetIndex: number) => {
      setPorts((prev) => {
        const port = prev.find((p) => p.id === portId);
        if (!port) return prev;

        const without = prev.filter((p) => p.id !== portId);
        const updated = { ...port, direction: targetDirection };

        const sectionPorts = without.filter((p) => p.direction === targetDirection);
        const insertAfterId = targetIndex > 0 ? sectionPorts[targetIndex - 1]?.id : null;

        if (sectionPorts.length === 0 || targetIndex === 0) {
          const firstOfSection = without.findIndex((p) => p.direction === targetDirection);
          if (firstOfSection === -1) {
            return [...without, updated];
          }
          without.splice(firstOfSection, 0, updated);
          return [...without];
        }

        const insertAfterIdx = without.findIndex((p) => p.id === insertAfterId);
        without.splice(insertAfterIdx + 1, 0, updated);
        return [...without];
      });
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    if (draggedPortId && dropTarget) {
      movePortTo(draggedPortId, dropTarget.direction, dropTarget.index);
    }
    setDraggedPortId(null);
    setDropTarget(null);
  }, [draggedPortId, dropTarget, movePortTo]);

  // Dirty detection: compare current editor state against the effective default
  // (preset if one exists, otherwise raw template)
  // Must be above the early return to satisfy rules of hooks.
  const templateId = node?.data.templateId;
  const { dirtyVsPreset, dirtyVsTemplate } = useMemo(() => {
    if (!templateId) return { dirtyVsPreset: false, dirtyVsTemplate: false };

    const tpl = getBundledTemplates().find((t) => t.id === templateId) ??
      customTemplates.find((t) => t.id === templateId);
    const preset = templatePresets[templateId];

    const portsMatch = (a: PortDraft[], b: Port[]) => {
      if (a.length !== b.length) return false;
      return a.every((ap, i) => {
        const bp = b[i];
        return ap.label === bp.label &&
          ap.signalType === bp.signalType &&
          ap.direction === bp.direction &&
          (ap.connectorType ?? undefined) === (bp.connectorType ?? undefined) &&
          (ap.section ?? undefined) === (bp.section ?? undefined);
      });
    };

    const dirtyVsTemplate = !!tpl && (
      !portsMatch(ports, tpl.ports) ||
      hiddenPorts.length > 0 ||
      (color ?? undefined) !== (tpl.color ?? undefined)
    );

    const dirtyVsPreset = !!preset && (
      !portsMatch(ports, preset.ports) ||
      JSON.stringify([...hiddenPorts].sort()) !== JSON.stringify([...(preset.hiddenPorts ?? [])].sort()) ||
      (color ?? undefined) !== (preset.color ?? undefined)
    );

    return { dirtyVsPreset, dirtyVsTemplate };
  }, [templateId, ports, hiddenPorts, color, templatePresets, customTemplates]);

  if (!editingNodeId || !node) return null;

  const drift = getTemplateDrift(node.data, customTemplates);
  const hasPreset = !!(templateId && templatePresets[templateId]);
  const inputs = ports.filter((p) => p.direction === "input");
  const outputs = ports.filter((p) => p.direction === "output");
  const bidir = ports.filter((p) => p.direction === "bidirectional");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDownCapture={onCtrlEnter}>
      <div
        className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[560px] max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">Device Properties</h2>
          <button
            onClick={close}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Template-drift notice */}
        {drift && (
          <div className="px-4 py-2 border-b border-[var(--color-border)] bg-blue-50 flex items-center justify-between gap-2">
            <span className="text-xs text-blue-900">
              Template updated — v{drift.deviceVersion} → v{drift.currentVersion} available
            </span>
            <button
              onClick={() => setShowSyncDialog(true)}
              className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Update
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Device Name">
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Camera 1"
              />
              {node.data.model && label.trim() !== node.data.model && (
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Template: {node.data.model}
                </div>
              )}
            </Field>
            <Field label="Device Type">
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                placeholder="e.g. camera"
              />
            </Field>
            <Field label="Manufacturer">
              <input
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Sony"
              />
            </Field>
          </div>

          {/* Header color picker */}
          <div className="flex items-center gap-2 -mt-1">
            <span className="text-[10px] text-[var(--color-text-muted)]">Header Color</span>
            <input
              type="color"
              className="w-6 h-6 rounded border border-[var(--color-border)] cursor-pointer p-0"
              value={headerColor ?? "#4b5563"}
              onChange={(e) => setHeaderColor(e.target.value)}
            />
            {headerColor && (
              <button
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                onClick={() => setHeaderColor(undefined)}
              >
                Reset
              </button>
            )}
          </div>

          {(() => {
            const tpl = node.data.templateId
              ? getBundledTemplates().find((t) => t.id === node.data.templateId)
              : undefined;
            const url = tpl?.referenceUrl;
            return url ? (
              <div className="text-[10px] text-[var(--color-text-muted)] -mt-2 flex items-center gap-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1"
                  title="View manufacturer spec page"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                    <path d="M9 2h5v5" />
                    <path d="M14 2L7 9" />
                  </svg>
                  <span>Spec sheet</span>
                </a>
              </div>
            ) : null;
          })()}

          {/* Preset indicator */}
          {hasPreset && templateId && (
            <div className="text-[10px] text-[var(--color-text-muted)] bg-blue-50 border border-blue-200/60 rounded px-2 py-1 flex items-center justify-between -mt-1">
              <span>Preset active for all &ldquo;{node.data.model || "this template"}&rdquo; devices</span>
              <button
                onClick={() => setTemplatePreset(templateId, null)}
                className="text-blue-500 hover:text-blue-600 cursor-pointer ml-2"
              >
                Clear
              </button>
            </div>
          )}

          {/* Port Visibility */}
          <PortVisibilitySection
            showAllPorts={showAllPorts}
            setShowAllPorts={setShowAllPorts}
            hiddenPorts={hiddenPorts}
            setHiddenPorts={setHiddenPorts}
            ports={ports}
            node={node}
            nodes={nodes}
            templateHiddenSignals={templateHiddenSignals}
            setTemplateHiddenSignals={setTemplateHiddenSignals}
            open={portVisOpen}
            setOpen={setPortVisOpen}
          />

          <PortSection
            title="Inputs"
            direction="input"
            deviceType={deviceType}
            ports={inputs}
            onAdd={() => addPort("input")}
            onBulkAdd={bulkAddPorts}
            onRemove={removePort}
            onUpdate={updatePort}
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={handleDragEnd}
            hiddenPorts={hiddenPorts}
            setHiddenPorts={setHiddenPorts}
          />

          <PortSection
            title="Outputs"
            direction="output"
            deviceType={deviceType}
            ports={outputs}
            onAdd={() => addPort("output")}
            onBulkAdd={bulkAddPorts}
            onRemove={removePort}
            onUpdate={updatePort}
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={handleDragEnd}
            hiddenPorts={hiddenPorts}
            setHiddenPorts={setHiddenPorts}
          />

          <PortSection
            title="Bidirectional"
            direction="bidirectional"
            deviceType={deviceType}
            ports={bidir}
            onAdd={() => addPort("bidirectional")}
            onBulkAdd={bulkAddPorts}
            onRemove={removePort}
            onUpdate={updatePort}
            draggedPortId={draggedPortId}
            setDraggedPortId={setDraggedPortId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDragEnd={handleDragEnd}
            hiddenPorts={hiddenPorts}
            setHiddenPorts={setHiddenPorts}
          />

          {/* Hostname */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">Hostname:</span>
            <input
              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-500"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="e.g. nvx-room101"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Physical Dimensions */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Physical Dimensions
            </summary>
            <div className="pt-1 pl-2 grid grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                  Height (mm)
                </label>
                <input
                  type="number"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  value={heightMm ?? ""}
                  onChange={(e) => setHeightMm(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 44"
                  min={1}
                  step={1}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                  Width (mm)
                </label>
                <input
                  type="number"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  value={widthMm ?? ""}
                  onChange={(e) => setWidthMm(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 482"
                  min={1}
                  step={1}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                  Depth (mm)
                </label>
                <input
                  type="number"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  value={depthMm ?? ""}
                  onChange={(e) => setDepthMm(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 350"
                  min={1}
                  step={1}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                  value={weightKg ?? ""}
                  onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 2.5"
                  min={0}
                  step={0.1}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </details>

          {ports.some((p) => p.connectorType === "rj45" || p.connectorType === "ethercon") && (
            <>
              <DhcpServerSection dhcpServer={dhcpServer} onChange={setDhcpServer} />
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={poeBudgetW != null}
                    onChange={(e) => setPoeBudgetW(e.target.checked ? 0 : undefined)}
                    className="cursor-pointer"
                  />
                  PoE Source
                </label>
                {poeBudgetW != null && (
                  <input
                    className="w-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-500"
                    type="number"
                    value={poeBudgetW || ""}
                    onChange={(e) => setPoeBudgetW(e.target.value ? Number(e.target.value) : 0)}
                    placeholder="Budget (W)"
                    min={0}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={poeDrawW != null}
                    onChange={(e) => setPoeDrawW(e.target.checked ? 0 : undefined)}
                    className="cursor-pointer"
                  />
                  Powered by PoE
                </label>
                {poeDrawW != null && (
                  <input
                    className="w-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-500"
                    type="number"
                    value={poeDrawW || ""}
                    onChange={(e) => setPoeDrawW(e.target.value ? Number(e.target.value) : 0)}
                    placeholder="Draw (W)"
                    min={0}
                    step={0.1}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </>
          )}

          {/* Expansion Slots */}
          {(() => {
            const templateDef = node.data.templateId
              ? getBundledTemplates().find((t) => t.id === node.data.templateId)
              : undefined;
            const slotDefs = templateDef?.slots ?? [];
            return (
              <SlotEditSection
                nodeId={node.id}
                installedSlots={node.data.slots ?? []}
                slotDefs={slotDefs}
              />
            );
          })()}

          {/* Power */}
          {(ports.some((p) => p.signalType === "power") || deviceType.includes("power")) && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
                Power
              </summary>
              <div className="grid grid-cols-2 gap-2 pt-1 pl-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                    Power Draw (W)
                  </label>
                  <input
                    type="number"
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    value={powerDrawW ?? ""}
                    onChange={(e) => setPowerDrawW(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                    Voltage
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                    value={voltage ?? ""}
                    onChange={(e) => setVoltage(e.target.value || undefined)}
                    placeholder="100-240V"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                {deviceType.includes("power-distribution") && (
                  <div className="col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                      Power Capacity (W)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                      value={powerCapacityW ?? ""}
                      onChange={(e) => setPowerCapacityW(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Cost */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Cost
            </summary>
            <div className="pt-1 pl-2" style={{ maxWidth: "50%" }}>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                Unit Cost ($)
              </label>
              <input
                type="number"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                value={unitCost ?? ""}
                onChange={(e) => setUnitCost(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="0.00"
                min={0}
                step={0.01}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </details>

          {/* Auxiliary Data */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Auxiliary Data
            </summary>
            <div className="flex flex-col gap-1.5 pt-1 pl-2">
              <p className="text-[10px] text-[var(--color-text-muted)] -mb-0.5">
                Up to 5 custom lines (displayed at bottom of device). Use the <span className="font-mono">+</span> button to insert a device field.
              </p>
              {(() => {
                const previewDevice = {
                  label,
                  hostname,
                  manufacturer,
                  modelNumber: node?.data.modelNumber,
                  deviceType,
                  powerDrawW,
                  powerCapacityW,
                  poeBudgetW,
                  poeDrawW,
                  voltage,
                  weightKg,
                  widthMm,
                  heightMm,
                  depthMm,
                  unitCost,
                  ports,
                } as unknown as DeviceData;
                return [0, 1, 2, 3, 4].map((i) => {
                  const line = auxiliaryData[i] ?? "";
                  const hasToken = line.indexOf("{{") !== -1;
                  const preview = hasToken ? resolveAuxiliaryLine(line, previewDevice) : "";
                  return (
                    <div key={i} className="relative">
                      <div className="flex gap-1">
                        <input
                          ref={(el) => { auxInputRefs.current[i] = el; }}
                          type="text"
                          className="flex-1 min-w-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                          value={line}
                          onChange={(e) => {
                            const newData = [...auxiliaryData];
                            newData[i] = e.target.value;
                            setAuxiliaryData(newData);
                          }}
                          placeholder="Auxiliary Data"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          type="button"
                          title="Insert device field"
                          className="px-2 py-1 text-xs rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] cursor-pointer shrink-0"
                          onClick={() => setAuxFieldMenuIdx(auxFieldMenuIdx === i ? null : i)}
                        >
                          +
                        </button>
                      </div>
                      {hasToken && (
                        <div className="text-[10px] text-[var(--color-text-muted)] pl-1 truncate" title={preview}>
                          → {preview || <span className="italic">(empty)</span>}
                        </div>
                      )}
                      {auxFieldMenuIdx === i && (
                        <div
                          ref={auxMenuRef}
                          className="absolute right-0 z-20 mt-1 w-56 max-h-64 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded shadow-lg"
                        >
                          {AUX_FIELD_GROUPS.map(({ group, fields }) => (
                            <div key={group} className="py-1">
                              <div className="px-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                {group}
                              </div>
                              {fields.map((f) => (
                                <button
                                  key={f.token}
                                  type="button"
                                  className="block w-full text-left px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-bg)] cursor-pointer"
                                  onClick={() => {
                                    const input = auxInputRefs.current[i];
                                    const token = `{{${f.token}}}`;
                                    const current = auxiliaryData[i] ?? "";
                                    const start = input?.selectionStart ?? current.length;
                                    const end = input?.selectionEnd ?? current.length;
                                    const next = current.slice(0, start) + token + current.slice(end);
                                    const newData = [...auxiliaryData];
                                    newData[i] = next;
                                    setAuxiliaryData(newData);
                                    setAuxFieldMenuIdx(null);
                                    // Restore focus + caret after the inserted token
                                    requestAnimationFrame(() => {
                                      const el = auxInputRefs.current[i];
                                      if (el) {
                                        el.focus();
                                        const pos = start + token.length;
                                        el.setSelectionRange(pos, pos);
                                      }
                                    });
                                  }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </details>

          {/* Flags */}
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none py-1">
              Flags
            </summary>
            <div className="flex flex-col gap-2 pt-1 pl-2">
              <label className="flex items-center gap-1.5 text-[var(--color-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCableAccessory}
                  onChange={(e) => {
                    setIsCableAccessory(e.target.checked);
                    if (!e.target.checked) setIntegratedWithCable(false);
                  }}
                  className="cursor-pointer"
                />
                Cable accessory
              </label>
              {isCableAccessory && (
                <label className="flex items-center gap-1.5 text-[var(--color-text)] cursor-pointer select-none ml-4">
                  <input
                    type="checkbox"
                    checked={integratedWithCable}
                    onChange={(e) => setIntegratedWithCable(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Integrated with cable
                </label>
              )}
              {deviceType === "adapter" && (
                <label className="flex items-center gap-1.5 text-[var(--color-text)] select-none">
                  <span className="text-[var(--color-text-muted)]">Visibility:</span>
                  <select
                    value={adapterVisibility}
                    onChange={(e) => setAdapterVisibility(e.target.value as "default" | "force-show" | "force-hide")}
                    className="text-xs border border-[var(--color-border)] rounded px-1.5 py-0.5 bg-white cursor-pointer"
                  >
                    <option value="default">Default</option>
                    <option value="force-show">Always Show</option>
                    <option value="force-hide">Always Hide</option>
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1.5 text-[var(--color-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isVenueProvided}
                  onChange={(e) => setIsVenueProvided(e.target.checked)}
                  className="cursor-pointer"
                />
                Venue provided (exclude from pack list)
              </label>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center gap-2">
          <button
            onClick={handleSaveAsTemplate}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
            title="Save this device configuration as a reusable user template"
          >
            Save as User Template
          </button>
          {(!templateId || dirtyVsTemplate) && ports.some((p) => p.label.trim()) && (
            <button
              onClick={handleSubmitToCommunity}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Submit this device to the community device library"
            >
              Submit to Community
            </button>
          )}
          {templateId && (
            <button
              onClick={handleSaveAsPreset}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Set this configuration as the project default for this template"
            >
              Save as Preset
            </button>
          )}
          {hasPreset && dirtyVsPreset && (
            <button
              onClick={handleRevertToPreset}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Reset ports and visibility to the project preset"
            >
              Revert to Preset
            </button>
          )}
          {dirtyVsTemplate && (
            <button
              onClick={handleRevertToTemplate}
              className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
              title="Reset ports and visibility to the original template defaults"
            >
              Revert to Template
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
      <LoginDialog open={showLoginDialog} onClose={() => setShowLoginDialog(false)} />
      {showSyncDialog && drift && editingNodeId && (
        <TemplateSyncDialog
          deviceId={editingNodeId}
          device={node.data}
          template={drift.template}
          edges={edges}
          onConfirm={() => {
            syncDeviceFromTemplate(editingNodeId);
            setShowSyncDialog(false);
          }}
          onCancel={() => setShowSyncDialog(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function BulkAddForm({
  direction,
  onBulkAdd,
  onClose,
}: {
  direction: PortDirection;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState("Input");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(8);
  const [signalType, setSignalType] = useState<SignalType>("sdi");
  const [section, setSection] = useState("");

  const handleSubmit = () => {
    const count = end - start + 1;
    if (count < 1 || !prefix.trim()) return;
    onBulkAdd(direction, prefix.trim(), start, count, signalType, section.trim());
    onClose();
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded p-2 space-y-2 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          className="w-20 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Prefix"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">from</span>
          <input
            type="number"
            className="w-12 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
            value={start}
            onChange={(e) => setStart(parseInt(e.target.value) || 1)}
            min={0}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">to</span>
          <input
            type="number"
            className="w-12 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
            value={end}
            onChange={(e) => setEnd(parseInt(e.target.value) || 1)}
            min={start}
            max={999}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <select
          className="bg-white border border-[var(--color-border)] rounded px-1 py-1 text-xs outline-none focus:border-blue-500 cursor-pointer"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {ALL_SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--color-text-muted)]">Section:</span>
        <input
          className="flex-1 bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="(optional)"
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          onClick={handleSubmit}
          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)]">
        Preview: {prefix} {start}, {prefix} {start + 1}, ... {prefix} {end}
      </div>
    </div>
  );
}

function PortVisibilitySection({
  showAllPorts,
  setShowAllPorts,
  hiddenPorts: _hiddenPorts,
  setHiddenPorts,
  ports,
  node,
  nodes,
  templateHiddenSignals,
  setTemplateHiddenSignals,
  open,
  setOpen,
}: {
  showAllPorts: boolean;
  setShowAllPorts: (v: boolean) => void;
  hiddenPorts: string[];
  setHiddenPorts: React.Dispatch<React.SetStateAction<string[]>>;
  ports: PortDraft[];
  node: DeviceNode | undefined;
  nodes: import("../types").SchematicNode[];
  templateHiddenSignals: Record<string, SignalType[]>;
  setTemplateHiddenSignals: (templateId: string, hidden: SignalType[]) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const templateId = node?.data.templateId;
  const modelLabel = node?.data.model;

  // Signal types present across all devices with this templateId
  const templateSignalTypes = useMemo(() => {
    if (!templateId) return [];
    const types = new Set<SignalType>();
    for (const n of nodes) {
      if (n.type !== "device") continue;
      if ((n.data as DeviceData).templateId !== templateId) continue;
      for (const p of (n.data as DeviceData).ports) types.add(p.signalType);
    }
    return [...types].sort() as SignalType[];
  }, [nodes, templateId]);

  const tplHidden = templateId ? (templateHiddenSignals[templateId] ?? []) : [];

  const namedPorts = ports.filter((p) => p.label.trim());

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer transition-colors"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>Port Visibility</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3 pl-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllPorts}
              onChange={(e) => setShowAllPorts(e.target.checked)}
              className="w-3 h-3 accent-blue-500 cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text)]">Show all ports (override filters)</span>
          </label>

          {namedPorts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-[var(--color-text-muted)]">Quick:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHiddenPorts([])}
                    className="text-[9px] text-blue-600 hover:text-blue-500 cursor-pointer"
                  >
                    Show All
                  </button>
                  <button
                    onClick={() => setHiddenPorts(namedPorts.map((p) => p.id))}
                    className="text-[9px] text-blue-600 hover:text-blue-500 cursor-pointer"
                  >
                    Hide All
                  </button>
                </div>
              </div>
            </div>
          )}

          {templateId && templateSignalTypes.length > 0 && (
            <div>
              <div className="text-[9px] text-[var(--color-text-muted)] mb-1">
                Hide on all &ldquo;{modelLabel || "this template"}&rdquo; devices:
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {templateSignalTypes.map((st) => (
                  <label key={st} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!tplHidden.includes(st)}
                      onChange={() => {
                        const next = tplHidden.includes(st)
                          ? tplHidden.filter((s) => s !== st)
                          : [...tplHidden, st];
                        setTemplateHiddenSignals(templateId, next);
                      }}
                      className="w-3 h-3 accent-blue-500 cursor-pointer"
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: SIGNAL_COLORS[st] }}
                    />
                    <span className="text-[10px] text-[var(--color-text)]">{SIGNAL_LABELS[st]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PortSection({
  title,
  direction,
  deviceType,
  ports,
  onAdd,
  onBulkAdd,
  onRemove,
  onUpdate,
  draggedPortId,
  setDraggedPortId,
  dropTarget,
  setDropTarget,
  onDragEnd,
  hiddenPorts,
  setHiddenPorts,
}: {
  title: string;
  direction: PortDirection;
  deviceType: string;
  ports: PortDraft[];
  onAdd: () => void;
  onBulkAdd: (direction: PortDirection, prefix: string, start: number, count: number, signalType: SignalType, section: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PortDraft>) => void;
  draggedPortId: string | null;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
  hiddenPorts: string[];
  setHiddenPorts: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  const handleSectionDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (ports.length === 0) {
      setDropTarget({ direction, index: 0 });
    }
  };

  const handleSectionDrop = (e: DragEvent) => {
    e.preventDefault();
    onDragEnd();
  };

  const handleSectionDragLeave = (e: DragEvent) => {
    if (sectionRef.current && !sectionRef.current.contains(e.relatedTarget as Node)) {
      if (dropTarget?.direction === direction) {
        setDropTarget(null);
      }
    }
  };

  const showDropIndicator = dropTarget?.direction === direction;

  // Group ports by section for visual grouping in editor
  const groups: { section: string | undefined; ports: PortDraft[] }[] = [];
  for (const port of ports) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.section === port.section) {
      lastGroup.ports.push(port);
    } else {
      groups.push({ section: port.section, ports: [port] });
    }
  }

  // Track running index across groups for drop targeting
  let runningIndex = 0;

  return (
    <div
      ref={sectionRef}
      onDragOver={handleSectionDragOver}
      onDrop={handleSectionDrop}
      onDragLeave={handleSectionDragLeave}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkAdd(!showBulkAdd)}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Bulk Add
          </button>
          <button
            onClick={onAdd}
            className="text-[10px] text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            + Add
          </button>
        </div>
      </div>

      {showBulkAdd && (
        <BulkAddForm
          direction={direction}
          onBulkAdd={onBulkAdd}
          onClose={() => setShowBulkAdd(false)}
        />
      )}

      {ports.length === 0 && !showDropIndicator && (
        <div className="text-[10px] text-[var(--color-text-muted)] italic px-1 py-2">
          No {title.toLowerCase()} — click &quot;+ Add&quot; or drag a port here
        </div>
      )}
      {ports.length === 0 && showDropIndicator && (
        <div className="h-1 bg-blue-500 rounded-full my-1" />
      )}

      <div className="space-y-0">
        {groups.map((group, gi) => {
          const startIndex = runningIndex;
          runningIndex += group.ports.length;

          return (
            <div key={gi}>
              {group.section && (
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-surface)] px-1.5 py-0.5 mt-1 mb-0.5 rounded border-b border-[var(--color-border)]/30">
                  {group.section}
                </div>
              )}
              {group.ports.map((port, i) => (
                <PortRow
                  key={port.id}
                  port={port}
                  index={startIndex + i}
                  direction={direction}
                  deviceType={deviceType}
                  onRemove={() => onRemove(port.id)}
                  onUpdate={(u) => onUpdate(port.id, u)}
                  isDragging={draggedPortId === port.id}
                  setDraggedPortId={setDraggedPortId}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  onDragEnd={onDragEnd}
                  isLast={startIndex + i === ports.length - 1}
                  isHidden={hiddenPorts.includes(port.id)}
                  onToggleVisibility={() => {
                    setHiddenPorts((prev) =>
                      prev.includes(port.id)
                        ? prev.filter((id) => id !== port.id)
                        : [...prev, port.id]
                    );
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortRow({
  port,
  index,
  direction,
  deviceType,
  onRemove,
  onUpdate,
  isDragging,
  setDraggedPortId,
  dropTarget,
  setDropTarget,
  onDragEnd,
  isLast,
  isHidden,
  onToggleVisibility,
}: {
  port: PortDraft;
  index: number;
  direction: PortDirection;
  deviceType: string;
  onRemove: () => void;
  onUpdate: (updates: Partial<PortDraft>) => void;
  isDragging: boolean;
  setDraggedPortId: (id: string | null) => void;
  dropTarget: { direction: PortDirection; index: number } | null;
  setDropTarget: (target: { direction: PortDirection; index: number } | null) => void;
  onDragEnd: () => void;
  isLast: boolean;
  isHidden: boolean;
  onToggleVisibility: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showSection, setShowSection] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(MIME, port.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedPortId(port.id);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midY = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midY ? index : index + 1;
    setDropTarget({ direction, index: insertIndex });
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragEnd();
  };

  const showIndicatorBefore =
    dropTarget?.direction === direction && dropTarget.index === index;
  const showIndicatorAfter =
    isLast && dropTarget?.direction === direction && dropTarget.index === index + 1;

  return (
    <>
      {showIndicatorBefore && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
      <div
        ref={rowRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex items-center gap-1.5 group py-0.5 ${
          isDragging ? "opacity-30" : ""
        } ${isHidden ? "opacity-50" : ""}`}
      >
        {/* Drag handle */}
        <span
          draggable
          onDragStart={handleDragStart}
          onDragEnd={() => {
            setDraggedPortId(null);
            setDropTarget(null);
          }}
          className="text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing text-[10px] select-none shrink-0"
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Eye toggle for port visibility */}
        <button
          onClick={onToggleVisibility}
          className="shrink-0 cursor-pointer transition-colors"
          title={isHidden ? "Show port on schematic" : "Hide port on schematic"}
        >
          {isHidden ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2l12 12" />
              <path d="M6.5 6.5a2 2 0 0 0 2.8 2.8" />
              <path d="M4.2 4.2C3 5.1 2 6.4 2 8c1.3 3 3.5 5 6 5 1.2 0 2.3-.4 3.3-1.2M13.4 11.4C14.6 10.4 15.3 9.2 16 8c-1.3-3-3.5-5-6-5-.7 0-1.4.1-2 .4" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[var(--color-text)]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8c1.3-3 3.5-5 6-5s4.7 2 6 5c-1.3 3-3.5 5-6 5S3.3 11 2 8z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          )}
        </button>

        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: SIGNAL_COLORS[port.signalType] }}
        />

        <input
          className="flex-1 min-w-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500"
          value={port.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Port label"
          onKeyDown={(e) => e.stopPropagation()}
        />

        <select
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-1 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
          value={port.signalType}
          onChange={(e) => {
            const newSignal = e.target.value as SignalType;
            onUpdate({
              signalType: newSignal,
              connectorType: DEFAULT_CONNECTOR[newSignal],
            });
          }}
        >
          {ALL_SIGNAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {SIGNAL_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-1 text-[10px] text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer max-w-[80px]"
          value={port.connectorType ?? DEFAULT_CONNECTOR[port.signalType]}
          onChange={(e) => onUpdate({ connectorType: e.target.value as ConnectorType })}
          title="Connector type"
        >
          {ALL_CONNECTOR_TYPES.map((c) => (
            <option key={c} value={c}>
              {CONNECTOR_LABELS[c]}
            </option>
          ))}
        </select>

        {/* Multicable trunk toggle */}
        <label
          className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 select-none ${
            port.isMulticable
              ? "bg-purple-100 text-purple-600"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100"
          }`}
          title="Multicable trunk port"
        >
          <input
            type="checkbox"
            checked={port.isMulticable ?? false}
            onChange={(e) => onUpdate({ isMulticable: e.target.checked || undefined, channelCount: e.target.checked ? (port.channelCount ?? 0) : undefined })}
            className="hidden"
          />
          {port.isMulticable ? `T${port.channelCount ?? 0}` : "T"}
        </label>

        {port.isMulticable && (
          <input
            type="number"
            min={0}
            className="w-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] text-[var(--color-text-heading)] outline-none focus:border-blue-500 shrink-0"
            value={port.channelCount ?? 0}
            onChange={(e) => onUpdate({ channelCount: parseInt(e.target.value) || 0 })}
            title="Channel count"
            onKeyDown={(e) => e.stopPropagation()}
          />
        )}

        {/* Direct attach toggle (adapters only) */}
        {deviceType === "adapter" && (
          <label
            className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 select-none ${
              port.directAttach
                ? "bg-green-100 text-green-700"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100"
            }`}
            title="Direct attach — plugs directly into device, no separate cable"
          >
            <input
              type="checkbox"
              checked={port.directAttach ?? false}
              onChange={(e) => onUpdate({ directAttach: e.target.checked || undefined })}
              className="hidden"
            />
            DA
          </label>
        )}

        {/* Section badge */}
        <button
          onClick={() => setShowSection(!showSection)}
          className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
            port.section
              ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100"
          }`}
          title="Set section group"
        >
          {port.section || "§"}
        </button>

        {/* Notes badge */}
        <button
          onClick={() => setShowNotes(!showNotes)}
          className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
            port.notes
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100"
          }`}
          title={port.notes || "Add note"}
        >
          {port.notes ? "N" : "N"}
        </button>

        {/* Flip badge */}
        <button
          onClick={() => onUpdate({ flipped: !port.flipped || undefined })}
            className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
              port.flipped
                ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100"
            }`}
            title="Flip port to opposite side"
          >
            ⇄
        </button>

        <button
          onClick={onRemove}
          className="text-red-400/60 hover:text-red-500 text-sm cursor-pointer px-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove port"
        >
          &times;
        </button>
      </div>

      {showSection && (
        <div className="flex items-center gap-1.5 pl-6 pb-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">Section:</span>
          <input
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={port.section || ""}
            onChange={(e) => onUpdate({ section: e.target.value || undefined })}
            placeholder="e.g. Cameras"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") setShowSection(false);
            }}
            autoFocus
          />
          <button
            onClick={() => setShowSection(false)}
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {showNotes && (
        <div className="flex items-center gap-1.5 pl-6 pb-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">Note:</span>
          <input
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={port.notes || ""}
            onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
            placeholder="e.g. East wall plate, Drop 3"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") setShowNotes(false);
            }}
            autoFocus
          />
          <button
            onClick={() => setShowNotes(false)}
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {/* Network Config (collapsible, only for addressable network signal types) */}
      {NETWORK_SIGNAL_TYPES.has(port.signalType) && (
        <>
          <label className="pl-6 flex items-center gap-1 text-[9px] text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={port.addressable !== false}
              onChange={(e) => onUpdate({ addressable: e.target.checked ? undefined : false })}
              className="cursor-pointer"
            />
            Addressable (has IP)
          </label>
          {port.addressable !== false && (
            <PortNetworkSection
              config={port.networkConfig}
              onChange={(nc) => onUpdate({ networkConfig: nc })}
              portId={port.id}
              poeDrawW={port.poeDrawW}
              onPoeDrawChange={(v) => onUpdate({ poeDrawW: v })}
              linkSpeed={port.linkSpeed}
              onLinkSpeedChange={(v) => onUpdate({ linkSpeed: v })}
            />
          )}
        </>
      )}

      {/* Capabilities (collapsible, only for video signal types) */}
      {VIDEO_SIGNAL_TYPES.has(port.signalType) && (
        <PortCapabilitiesSection
          capabilities={port.capabilities}
          onChange={(caps) => onUpdate({ capabilities: caps })}
        />
      )}

      {showIndicatorAfter && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
    </>
  );
}

const LINK_SPEED_OPTIONS = ["", "100M", "1G", "2.5G", "5G", "10G", "25G", "40G", "100G"];

function PortNetworkSection({
  config,
  onChange,
  portId,
  poeDrawW,
  onPoeDrawChange,
  linkSpeed,
  onLinkSpeedChange,
}: {
  config?: PortNetworkConfig;
  onChange: (config: PortNetworkConfig) => void;
  portId: string;
  poeDrawW?: number;
  onPoeDrawChange: (v: number | undefined) => void;
  linkSpeed?: string;
  onLinkSpeedChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = config ?? {};
  const hasData = c.ip || c.subnetMask || c.gateway || c.vlan || c.dhcp;

  // Duplicate IP detection
  const nodes = useSchematicStore((s) => s.nodes);
  const editingNodeId = useSchematicStore((s) => s.editingNodeId);
  const duplicateWarning = useMemo(() => {
    const ip = c.ip?.trim();
    if (!ip) return undefined;
    const dupes = findDuplicateIps(nodes);
    const entries = dupes.get(ip);
    if (!entries) return undefined;
    const others = entries.filter((e) => !(e.nodeId === editingNodeId && e.portId === portId));
    if (others.length === 0) return undefined;
    return `Duplicate IP — also used by: ${others.map((e) => `${e.deviceLabel} (${e.portLabel})`).join(", ")}`;
  }, [nodes, c.ip, editingNodeId, portId]);

  const vlanInvalid = c.vlan != null && !isValidVlan(c.vlan);

  return (
    <div className="pl-6 mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[9px] cursor-pointer transition-colors ${
          hasData ? "text-blue-600" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        {open ? "▾" : "▸"} Network{hasData ? " (configured)" : ""}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1 mt-1">
          <label className="flex items-center gap-1 col-span-2 text-[9px] text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={c.dhcp ?? false}
              onChange={(e) => onChange({ ...c, dhcp: e.target.checked })}
              className="cursor-pointer"
            />
            DHCP
          </label>
          <IpInput
            value={c.ip ?? ""}
            onChange={(v) => {
              const update: typeof c = { ...c, ip: v || undefined };
              if (v && isValidIpv4(v) && !c.subnetMask) update.subnetMask = "255.255.255.0";
              onChange(update);
            }}
            placeholder="IP Address"
            disabled={c.dhcp}
            duplicateWarning={duplicateWarning}
          />
          <IpInput
            value={c.subnetMask ?? ""}
            onChange={(v) => onChange({ ...c, subnetMask: v || undefined })}
            placeholder="Subnet Mask"
            disabled={c.dhcp}
            validate={isValidSubnetMask}
          />
          <IpInput
            value={c.gateway ?? ""}
            onChange={(v) => onChange({ ...c, gateway: v || undefined })}
            placeholder="Gateway"
            disabled={c.dhcp}
          />
          <input
            className={`bg-[var(--color-surface)] border rounded px-1 py-0.5 text-[10px] outline-none ${
              vlanInvalid ? "border-red-400" : "border-[var(--color-border)] focus:border-blue-500"
            }`}
            type="number"
            value={c.vlan ?? ""}
            onChange={(e) => onChange({ ...c, vlan: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="VLAN"
            title={vlanInvalid ? "VLAN must be 1-4094" : undefined}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <select
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500 cursor-pointer"
            value={linkSpeed ?? ""}
            onChange={(e) => onLinkSpeedChange(e.target.value || undefined)}
          >
            {LINK_SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "Speed"}</option>
            ))}
          </select>
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            type="number"
            value={poeDrawW ?? ""}
            onChange={(e) => onPoeDrawChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="PoE (W)"
            min={0}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function DhcpServerSection({
  dhcpServer,
  onChange,
}: {
  dhcpServer: DhcpServerConfig | undefined;
  onChange: (cfg: DhcpServerConfig | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = dhcpServer ?? { enabled: false };
  const enabled = cfg.enabled;

  const startInvalid = cfg.rangeStart ? !isValidIpv4(cfg.rangeStart) : false;
  const endInvalid = cfg.rangeEnd ? !isValidIpv4(cfg.rangeEnd) : false;
  const maskInvalid = cfg.subnetMask ? !isValidSubnetMask(cfg.subnetMask) : false;
  const gatewayInvalid = cfg.gateway ? !isValidIpv4(cfg.gateway) : false;

  const handleToggle = (checked: boolean) => {
    if (checked) {
      onChange({ ...cfg, enabled: true });
    } else {
      onChange({ ...cfg, enabled: false });
    }
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-[10px] uppercase tracking-wider cursor-pointer transition-colors ${
          enabled
            ? "text-blue-600 hover:text-blue-500"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>DHCP Server{enabled ? " (active)" : ""}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 pl-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="w-3 h-3 accent-blue-500 cursor-pointer"
            />
            <span className="text-xs text-[var(--color-text)]">This device serves DHCP on its network</span>
          </label>
          {enabled && (
            <div className="grid grid-cols-2 gap-1">
              <div>
                <IpInput
                  value={cfg.rangeStart ?? ""}
                  onChange={(v) => onChange({ ...cfg, rangeStart: v || undefined })}
                  placeholder="Pool Start"
                />
                {startInvalid && (
                  <div className="text-[9px] text-red-500 mt-0.5">Invalid IP</div>
                )}
              </div>
              <div>
                <IpInput
                  value={cfg.rangeEnd ?? ""}
                  onChange={(v) => onChange({ ...cfg, rangeEnd: v || undefined })}
                  placeholder="Pool End"
                />
                {endInvalid && (
                  <div className="text-[9px] text-red-500 mt-0.5">Invalid IP</div>
                )}
              </div>
              <div>
                <IpInput
                  value={cfg.subnetMask ?? ""}
                  onChange={(v) => onChange({ ...cfg, subnetMask: v || undefined })}
                  placeholder="Subnet Mask"
                  validate={isValidSubnetMask}
                />
                {maskInvalid && (
                  <div className="text-[9px] text-red-500 mt-0.5">Invalid mask</div>
                )}
              </div>
              <div>
                <IpInput
                  value={cfg.gateway ?? ""}
                  onChange={(v) => onChange({ ...cfg, gateway: v || undefined })}
                  placeholder="Gateway"
                />
                {gatewayInvalid && (
                  <div className="text-[9px] text-red-500 mt-0.5">Invalid IP</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlotEditSection({
  nodeId,
  installedSlots,
  slotDefs,
}: {
  nodeId: string;
  installedSlots: NonNullable<DeviceData["slots"]>;
  slotDefs: SlotDefinition[];
}) {
  const swapCard = useSchematicStore((s) => s.swapCard);
  const addSlot = useSchematicStore((s) => s.addSlot);
  const updateSlot = useSchematicStore((s) => s.updateSlot);
  const removeSlot = useSchematicStore((s) => s.removeSlot);
  const edges = useSchematicStore((s) => s.edges);
  const customTemplates = useSchematicStore((s) => s.customTemplates);

  const [creatingCardForSlot, setCreatingCardForSlot] = useState<string | null>(null);

  const knownFamilies = useMemo(
    () => [
      ...new Set([
        ...getBundledTemplates().map((t) => t.slotFamily),
        ...customTemplates.map((t) => t.slotFamily),
      ].filter((f): f is string => !!f)),
    ],
    [customTemplates],
  );

  const creatingSlot = creatingCardForSlot ? installedSlots.find((s) => s.slotId === creatingCardForSlot) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
          Expansion Slots{installedSlots.length > 0 ? ` (${installedSlots.filter((s) => !s.parentSlotId).length})` : ""}
        </div>
        <button
          type="button"
          onClick={() => addSlot(nodeId, { label: `Slot ${installedSlots.filter((s) => !s.parentSlotId).length + 1}`, slotFamily: "" })}
          className="text-[10px] text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          + Add Slot
        </button>
      </div>
      {installedSlots.length === 0 && (
        <div className="text-[10px] text-[var(--color-text-muted)] italic">
          No expansion slots. Add a slot for devices with modular card bays.
        </div>
      )}
      <datalist id={`slot-families-${nodeId}`}>
        {knownFamilies.map((f) => <option key={f} value={f} />)}
      </datalist>
      {installedSlots.map((slot) => {
        // Use slotFamily from the slot itself (works for both top-level and nested)
        const family = slot.slotFamily ?? slotDefs.find((d) => d.id === slot.slotId)?.slotFamily;
        const familyCards = family ? getCardsByFamily(family, customTemplates) : [];
        const isNested = !!slot.parentSlotId;

        // Count connections to this slot's ports (including descendant ports for parent slots)
        const descendantPortIds = isNested ? [] : installedSlots
          .filter((s) => s.parentSlotId?.startsWith(slot.slotId))
          .flatMap((s) => s.portIds);
        const allPortIds = new Set([...slot.portIds, ...descendantPortIds]);
        const connCount = edges.filter((e) => {
          if (e.source === nodeId && allPortIds.has(e.sourceHandle ?? "")) return true;
          if (e.target === nodeId && allPortIds.has(e.targetHandle ?? "")) return true;
          if (e.source === nodeId && allPortIds.has((e.sourceHandle ?? "").replace(/-(in|out)$/, ""))) return true;
          if (e.target === nodeId && allPortIds.has((e.targetHandle ?? "").replace(/-(in|out)$/, ""))) return true;
          return false;
        }).length;

        return (
          <div
            key={slot.slotId}
            className={`bg-[var(--color-surface)] rounded px-2 py-1.5 border border-[var(--color-border)] ${isNested ? "ml-3 border-dashed" : ""}`}
          >
            {isNested ? (
              <div className="text-[10px] text-[var(--color-text-muted)] mb-1">{slot.label}</div>
            ) : (
              <div className="flex items-center gap-1 mb-1">
                <input
                  value={slot.label}
                  onChange={(e) => updateSlot(nodeId, slot.slotId, { label: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Slot label"
                  className="flex-1 min-w-0 bg-white border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-blue-500"
                />
                <input
                  value={slot.slotFamily ?? ""}
                  onChange={(e) => updateSlot(nodeId, slot.slotId, { slotFamily: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  list={`slot-families-${nodeId}`}
                  placeholder="family"
                  className="w-24 bg-white border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const warnConn = connCount > 0 ? `This slot has ${connCount} connection(s) that will be disconnected. ` : "";
                    const warnCard = slot.cardTemplateId ? "The installed card and its ports will be removed. " : "";
                    if ((warnConn || warnCard) && !confirm(`${warnConn}${warnCard}Remove slot "${slot.label}"?`)) return;
                    removeSlot(nodeId, slot.slotId);
                  }}
                  className="text-red-400 hover:text-red-500 text-xs cursor-pointer px-1 leading-none"
                  title="Remove slot"
                >
                  &times;
                </button>
              </div>
            )}
            <select
              value={slot.cardTemplateId ?? ""}
              onChange={(e) => {
                const newCardId = e.target.value || null;
                if (newCardId === slot.cardTemplateId) return;
                if (connCount > 0) {
                  if (!confirm(`Swapping this card will disconnect ${connCount} connection(s). Continue?`)) return;
                }
                swapCard(nodeId, slot.slotId, newCardId);
              }}
              disabled={!isNested && !slot.slotFamily}
              className="w-full bg-white border border-[var(--color-border)] rounded px-1.5 py-1 text-xs outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">{!isNested && !slot.slotFamily ? "(set slot family to enable)" : "(empty)"}</option>
              {familyCards.map((card) => (
                <option key={card.id} value={card.id!}>
                  {card.label}
                </option>
              ))}
            </select>
            {slot.cardLabel && (
              <div className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                {[slot.cardManufacturer, slot.cardModelNumber].filter(Boolean).join(" ")}
              </div>
            )}
            {!isNested && (
              <button
                type="button"
                onClick={() => setCreatingCardForSlot(slot.slotId)}
                className="text-[10px] text-blue-500 hover:text-blue-600 cursor-pointer mt-1"
              >
                + Create custom card...
              </button>
            )}
          </div>
        );
      })}
      {creatingSlot && (
        <CardCreatorDialog
          open
          initialFamily={creatingSlot.slotFamily ?? ""}
          familySuggestions={knownFamilies}
          onClose={() => setCreatingCardForSlot(null)}
          onCreated={(cardId, finalFamily) => {
            // If the slot's family was empty or differs, update it so swapCard resolves the card correctly.
            if ((creatingSlot.slotFamily ?? "") !== finalFamily) {
              updateSlot(nodeId, creatingSlot.slotId, { slotFamily: finalFamily });
            }
            swapCard(nodeId, creatingSlot.slotId, cardId);
            setCreatingCardForSlot(null);
          }}
        />
      )}
    </div>
  );
}

function PortCapabilitiesSection({
  capabilities,
  onChange,
}: {
  capabilities?: PortCapabilities;
  onChange: (caps: PortCapabilities) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = capabilities ?? {};
  const hasData = c.maxResolution || c.maxFrameRate || c.maxBitDepth;

  return (
    <div className="pl-6 mb-0.5">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[9px] cursor-pointer transition-colors ${
          hasData ? "text-blue-600" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        }`}
      >
        {open ? "▾" : "▸"} Capabilities{hasData ? " (set)" : ""}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-1 mt-1">
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.maxResolution ?? ""}
            onChange={(e) => onChange({ ...c, maxResolution: e.target.value || undefined })}
            placeholder="Max Resolution (e.g. 3840x2160)"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            type="number"
            value={c.maxFrameRate ?? ""}
            onChange={(e) => onChange({ ...c, maxFrameRate: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Max FPS"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            type="number"
            value={c.maxBitDepth ?? ""}
            onChange={(e) => onChange({ ...c, maxBitDepth: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Bit Depth"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500"
            value={c.colorSpaces?.join(", ") ?? ""}
            onChange={(e) => onChange({ ...c, colorSpaces: e.target.value ? e.target.value.split(",").map((s) => s.trim()) : undefined })}
            placeholder="Color Spaces (comma sep)"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
