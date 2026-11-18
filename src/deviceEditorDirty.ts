import type { AuxRow, DeviceData, DhcpServerConfig } from "./types";
import type { PortDraft } from "./deviceTemplateBuild";
import { normalizeAuxRows, trimTrailingEmpty } from "./auxiliaryData";

/**
 * Unsaved-changes detection for the device editor (#413).
 *
 * Clicking outside the editor (or Esc / Cancel / ×) used to close it and silently drop
 * everything typed since it opened. It now asks first — but only when something actually
 * differs from what the editor loaded, so a look-and-leave still closes in one click.
 * "Dirty" is a real comparison against the loaded snapshot, not "a key was pressed":
 * typing a value and putting it back is clean again.
 */

/** Every non-port field the editor holds as local form state until Apply. */
export interface DeviceEditorFields {
  label: string;
  shortName: string;
  useShortName: boolean | undefined;
  wrapLabel: boolean | undefined;
  hostname: string;
  deviceType: string;
  manufacturer: string;
  modelNumber: string;
  referenceUrl: string;
  category: string;
  color: string | undefined;
  headerColor: string | undefined;
  showAllPorts: boolean;
  dhcpServer: DhcpServerConfig | undefined;
  powerDrawW: number | undefined;
  powerCapacityW: number | undefined;
  voltage: string | undefined;
  thermalBtuh: number | undefined;
  poeBudgetW: number | undefined;
  poeDrawW: number | undefined;
  unitCost: number | undefined;
  serialNumber: string;
  note: string;
  isSpare: boolean;
  procurementSource: DeviceData["procurementSource"];
  heightMm: number | undefined;
  widthMm: number | undefined;
  depthMm: number | undefined;
  weightKg: number | undefined;
  rackForm: DeviceData["rackForm"];
  isCableAccessory: boolean;
  integratedWithCable: boolean;
  isVenueProvided: boolean;
  adapterVisibility: "default" | "force-show" | "force-hide";
  auxiliaryData: AuxRow[];
  searchTermsRaw: string;
}

/**
 * The editor's initial field values for a device — what the form loads when it opens.
 * `tpl` supplies the reference URL / category a device placed from a template inherits
 * when it has none of its own.
 */
export function deviceEditorFields(
  data: DeviceData,
  tpl?: { referenceUrl?: string; category?: string },
): DeviceEditorFields {
  return {
    label: data.label,
    shortName: data.shortName ?? "",
    useShortName: data.useShortName,
    wrapLabel: data.wrapLabel,
    hostname: data.hostname ?? "",
    deviceType: data.deviceType,
    manufacturer: data.manufacturer ?? "",
    modelNumber: data.modelNumber ?? "",
    referenceUrl: data.referenceUrl ?? tpl?.referenceUrl ?? "",
    category: data.category ?? tpl?.category ?? "",
    color: data.color,
    headerColor: data.headerColor,
    showAllPorts: data.showAllPorts ?? false,
    dhcpServer: data.dhcpServer ? { ...data.dhcpServer } : undefined,
    powerDrawW: data.powerDrawW,
    powerCapacityW: data.powerCapacityW,
    voltage: data.voltage,
    thermalBtuh: data.thermalBtuh,
    poeBudgetW: data.poeBudgetW,
    poeDrawW: data.poeDrawW,
    unitCost: data.unitCost,
    serialNumber: data.serialNumber ?? "",
    note: data.note ?? "",
    isSpare: data.isSpare ?? false,
    procurementSource: data.procurementSource,
    heightMm: data.heightMm,
    widthMm: data.widthMm,
    depthMm: data.depthMm,
    weightKg: data.weightKg,
    rackForm: data.rackForm,
    isCableAccessory: data.isCableAccessory ?? false,
    integratedWithCable: data.integratedWithCable ?? false,
    isVenueProvided: data.isVenueProvided ?? false,
    adapterVisibility: data.adapterVisibility ?? "default",
    auxiliaryData: normalizeAuxRows(data.auxiliaryData),
    searchTermsRaw: (data.searchTerms ?? []).join(", "),
  };
}

/** The port half of the form: the port rows plus the per-port hide list. */
export interface DeviceEditorPorts {
  ports: PortDraft[];
  hiddenPorts: string[];
}

/**
 * JSON with sorted keys and `undefined` members dropped, so `{ a: 1, b: undefined }` and
 * `{ a: 1 }` compare equal (unticking a badge writes `undefined`, not a deleted key) and
 * key order never matters.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) {
        if ((v as Record<string, unknown>)[k] !== undefined) out[k] = (v as Record<string, unknown>)[k];
      }
      return out;
    }
    return v;
  });
}

function comparableFields(f: DeviceEditorFields): unknown {
  // Empty trailing auxiliary rows are dropped on Apply, so a row that was filled in and
  // cleared again isn't a change.
  return { ...f, auxiliaryData: trimTrailingEmpty(f.auxiliaryData) };
}

function comparablePorts(p: DeviceEditorPorts): unknown {
  // The hide list is a set; hiding and re-showing a port re-appends it in another order.
  return { ports: p.ports, hiddenPorts: [...new Set(p.hiddenPorts)].sort() };
}

/** Whether the form differs from what it loaded — i.e. closing now would lose something. */
export function isDeviceEditorDirty(
  baseline: { fields: DeviceEditorFields; ports: DeviceEditorPorts },
  current: { fields: DeviceEditorFields; ports: DeviceEditorPorts },
): boolean {
  return (
    stableStringify(comparableFields(baseline.fields)) !== stableStringify(comparableFields(current.fields)) ||
    stableStringify(comparablePorts(baseline.ports)) !== stableStringify(comparablePorts(current.ports))
  );
}
