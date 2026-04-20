import type {
  DeviceData,
  DeviceTemplate,
  Port,
  ConnectionEdge,
} from "./types";
import { getTemplateById } from "./templateApi";

export interface TemplateDrift {
  template: DeviceTemplate;
  deviceVersion: number;
  currentVersion: number;
}

/** Returns drift info if the device is on a stale template version, else null. */
export function getTemplateDrift(
  device: DeviceData,
  extras?: DeviceTemplate[],
): TemplateDrift | null {
  if (!device.templateId || device.templateVersion == null) return null;
  const template = getTemplateById(device.templateId, extras);
  if (!template || template.version == null) return null;
  if (template.version <= device.templateVersion) return null;
  return {
    template,
    deviceVersion: device.templateVersion,
    currentVersion: template.version,
  };
}

export interface FactualChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface SyncPreview {
  factualChanges: FactualChange[];
  portsAdded: Port[];
  portsRemovedSafe: Port[];
  portsOrphanedWithEdges: Port[];
}

export interface SyncResult {
  updatedData: DeviceData;
  preview: SyncPreview;
}

/** Factual fields overwritten from template. Everything else on DeviceData is preserved. */
const FACTUAL_FIELDS = [
  "manufacturer",
  "modelNumber",
  "model",
  "heightMm",
  "widthMm",
  "depthMm",
  "weightKg",
  "powerDrawW",
  "powerCapacityW",
  "voltage",
  "poeBudgetW",
  "poeDrawW",
  "unitCost",
  "isCableAccessory",
  "integratedWithCable",
] as const;

function findTemplatePortMatch(
  templatePort: Port,
  devicePorts: Port[],
  used: Set<string>,
): Port | undefined {
  // Prefer templatePortId linkage (stable across renames).
  const byId = devicePorts.find(
    (p) => p.templatePortId === templatePort.id && !used.has(p.id),
  );
  if (byId) return byId;
  // Fall back to label match for devices placed before templatePortId stamping.
  return devicePorts.find(
    (p) => !p.templatePortId && p.label === templatePort.label && !used.has(p.id),
  );
}

function nextPortId(deviceId: string): string {
  return `${deviceId}-sync-${Math.random().toString(36).slice(2, 8)}`;
}

function mergePort(templatePort: Port, devicePort: Port): Port {
  // Overwrite structural fields from template; preserve user overrides on per-port knobs.
  const merged: Port = {
    ...templatePort,
    id: devicePort.id,                       // keep device-side ID so edges stay attached
    templatePortId: templatePort.id,         // (re-)stamp the link
    label: devicePort.label,                 // users often rename ports meaningfully — preserve
  };
  if (devicePort.flipped) merged.flipped = devicePort.flipped;
  if (devicePort.networkConfig) merged.networkConfig = devicePort.networkConfig;
  if (devicePort.notes) merged.notes = devicePort.notes;
  if (devicePort.activeConfig) merged.activeConfig = devicePort.activeConfig;
  if (devicePort.poeDrawW != null) merged.poeDrawW = devicePort.poeDrawW;
  if (devicePort.linkSpeed) merged.linkSpeed = devicePort.linkSpeed;
  if (devicePort.gender) merged.gender = devicePort.gender;
  return merged;
}

function portHasEdge(portId: string, deviceNodeId: string, edges: ConnectionEdge[]): boolean {
  const bareHandle = portId;
  const inHandle = `${portId}-in`;
  const outHandle = `${portId}-out`;
  return edges.some(
    (e) =>
      (e.source === deviceNodeId &&
        (e.sourceHandle === bareHandle ||
          e.sourceHandle === inHandle ||
          e.sourceHandle === outHandle)) ||
      (e.target === deviceNodeId &&
        (e.targetHandle === bareHandle ||
          e.targetHandle === inHandle ||
          e.targetHandle === outHandle)),
  );
}

/**
 * Reconcile a placed device against the current template.
 * Returns both the updated DeviceData and a preview describing what changed
 * (so the caller can show a confirmation dialog before committing).
 *
 * Slot-installed card ports (identified via `device.slots[].portIds`) are
 * left untouched — card templates are synced separately.
 */
export function syncDeviceWithTemplate(
  device: DeviceData,
  template: DeviceTemplate,
  deviceNodeId: string,
  edges: ConnectionEdge[],
): SyncResult {
  // Partition device ports into base (template-owned) and slot-owned.
  const slotPortIds = new Set<string>();
  for (const slot of device.slots ?? []) {
    for (const pid of slot.portIds) slotPortIds.add(pid);
  }
  const basePorts = device.ports.filter((p) => !slotPortIds.has(p.id));
  const slotPorts = device.ports.filter((p) => slotPortIds.has(p.id));

  const usedDevicePortIds = new Set<string>();
  const newBasePorts: Port[] = [];
  const portsAdded: Port[] = [];

  for (const tp of template.ports) {
    const match = findTemplatePortMatch(tp, basePorts, usedDevicePortIds);
    if (match) {
      usedDevicePortIds.add(match.id);
      newBasePorts.push(mergePort(tp, match));
    } else {
      const fresh: Port = {
        ...tp,
        id: nextPortId(deviceNodeId),
        templatePortId: tp.id,
      };
      newBasePorts.push(fresh);
      portsAdded.push(fresh);
    }
  }

  const portsRemovedSafe: Port[] = [];
  const portsOrphanedWithEdges: Port[] = [];
  for (const dp of basePorts) {
    if (usedDevicePortIds.has(dp.id)) continue;
    if (portHasEdge(dp.id, deviceNodeId, edges)) {
      portsOrphanedWithEdges.push(dp);
      newBasePorts.push(dp); // keep the orphan with its edges; user cleans up manually
    } else {
      portsRemovedSafe.push(dp);
    }
  }

  const updatedPorts = [...newBasePorts, ...slotPorts];

  // Build factual-change preview before mutating the device.
  const factualChanges: FactualChange[] = [];
  for (const field of FACTUAL_FIELDS) {
    const before = (device as Record<string, unknown>)[field];
    const after = (template as unknown as Record<string, unknown>)[field];
    if (before !== after) {
      factualChanges.push({ field, before, after });
    }
  }

  // Apply factual overwrites.
  const updatedData: DeviceData = { ...device, ports: updatedPorts };
  for (const field of FACTUAL_FIELDS) {
    const value = (template as unknown as Record<string, unknown>)[field];
    if (value == null) {
      delete (updatedData as Record<string, unknown>)[field];
    } else {
      (updatedData as Record<string, unknown>)[field] = value;
    }
  }
  if (template.version != null) {
    updatedData.templateVersion = template.version;
  }

  return {
    updatedData,
    preview: {
      factualChanges,
      portsAdded,
      portsRemovedSafe,
      portsOrphanedWithEdges,
    },
  };
}
