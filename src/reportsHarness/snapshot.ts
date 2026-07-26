/**
 * Compute a deterministic snapshot of every report output for one fixture.
 *
 * The snapshot is the harness's unit of comparison: golden JSON files pin the
 * exact rows, CSV text, and print-table data each report produces, so any
 * change to report/column/CSV code shows up as a golden diff instead of
 * needing a manual playtest pass.
 */

import type { ReportFixture } from "./fixtures";
import { computeCableSchedule, buildCableScheduleCsv, getCableScheduleTableData } from "../cableSchedule";
import {
  computePackList,
  computeDocumentSummary,
  buildPackListCsv,
  getPackListTableData,
} from "../packList";
import {
  computeNetworkReport,
  computeDhcpServerSummary,
  computePoeBudget,
  buildNetworkReportCsv,
  getNetworkReportTableData,
} from "../networkReport";
import { computePowerReport, buildPowerReportCsv, getPowerReportTableData } from "../powerReport";
import {
  computePatchPanelSchedule,
  buildPatchPanelScheduleCsv,
  getPatchPanelScheduleTableData,
} from "../patchPanelSchedule";
import {
  findDuplicateIps,
  computeDhcpWarnings,
  computeSubnetConflicts,
} from "../networkValidation";
import {
  createDefaultCableScheduleLayout,
  createDefaultPackListLayout,
  createDefaultNetworkReportLayout,
  createDefaultPowerReportLayout,
  createDefaultPatchPanelScheduleLayout,
  type ReportLayout,
} from "../reportLayout";
import type { ReportTableData } from "../reportPdf";

/** Fixed date so golden snapshots don't churn daily. */
const GENERATED_DATE = "2026-01-01";

/** ReportTableData with the groupedRows Map flattened for JSON round-tripping. */
export interface SnapshotTable {
  id: string;
  rows: Record<string, string>[];
  groupedRows?: Record<string, Record<string, string>[]>;
}

export interface ReportsSnapshot {
  fixture: string;
  cableSchedule: {
    rows: unknown[];
    csv: string;
    printTables: SnapshotTable[];
  };
  packList: {
    data: unknown;
    documentSummary: string;
    csv: string;
    printTables: SnapshotTable[];
  };
  networkReport: {
    rows: unknown[];
    csv: string;
    dhcpServers: unknown[];
    poeBudget: unknown[];
    printTables: SnapshotTable[];
  };
  powerReport: {
    data: unknown;
    csv: string;
    printTables: SnapshotTable[];
  };
  patchPanelSchedule: {
    rows: unknown[];
    csv: string;
    printTables: SnapshotTable[];
  };
  warnings: {
    duplicateIps: Record<string, unknown[]>;
    dhcp: unknown[];
    subnetConflicts: unknown[];
  };
}

function toSnapshotTables(tables: ReportTableData[]): SnapshotTable[] {
  return tables.map((t) => ({
    id: t.id,
    rows: t.rows,
    groupedRows: t.groupedRows ? Object.fromEntries(t.groupedRows) : undefined,
  }));
}

/** The default print layouts, keyed by report. Exported for the layout invariants. */
export function defaultLayouts(): Record<string, ReportLayout> {
  return {
    cableSchedule: createDefaultCableScheduleLayout(),
    packList: createDefaultPackListLayout(),
    networkReport: createDefaultNetworkReportLayout(),
    powerReport: createDefaultPowerReportLayout(),
    patchPanelSchedule: createDefaultPatchPanelScheduleLayout(),
  };
}

export function computeReportsSnapshot(fx: ReportFixture): ReportsSnapshot {
  const snap = computeRaw(fx);
  // JSON round-trip so undefined-valued keys vanish exactly as they do in the
  // stored goldens — otherwise every diff is polluted with "(absent) → undefined".
  return JSON.parse(JSON.stringify(snap)) as ReportsSnapshot;
}

function computeRaw(fx: ReportFixture): ReportsSnapshot {
  const { nodes, edges, pages, bundles } = fx;
  const layouts = defaultLayouts();

  // Cable schedule
  const cableRows = computeCableSchedule(nodes, edges, "sequential", undefined, bundles);
  const cableCsv = buildCableScheduleCsv(cableRows, fx.name, GENERATED_DATE);

  // Pack list
  const packData = computePackList(nodes, edges, pages);
  const documentSummary = computeDocumentSummary(nodes, edges, pages);
  const packCsv = buildPackListCsv(packData, fx.name, undefined, documentSummary, GENERATED_DATE);

  // Network report + warnings
  const netRows = computeNetworkReport(nodes, edges);
  const netCsv = buildNetworkReportCsv(netRows);
  const dhcpServers = computeDhcpServerSummary(nodes);
  const poeBudget = computePoeBudget(nodes, edges);
  const duplicateIps = Object.fromEntries(findDuplicateIps(nodes));
  const dhcpWarnings = computeDhcpWarnings(netRows, nodes, edges);
  const subnetConflicts = computeSubnetConflicts(nodes, edges);

  // Power report
  const powerData = computePowerReport(nodes, edges);
  const powerCsv = buildPowerReportCsv(powerData, fx.name, GENERATED_DATE);

  // Patch panel schedule
  const patchRows = computePatchPanelSchedule(nodes, edges);
  const patchCsv = buildPatchPanelScheduleCsv(patchRows, fx.name, GENERATED_DATE);

  return {
    fixture: fx.name,
    cableSchedule: {
      rows: cableRows,
      csv: cableCsv,
      printTables: toSnapshotTables(getCableScheduleTableData(cableRows, layouts.cableSchedule)),
    },
    packList: {
      data: packData,
      documentSummary,
      csv: packCsv,
      printTables: toSnapshotTables(getPackListTableData(packData, layouts.packList)),
    },
    networkReport: {
      rows: netRows,
      csv: netCsv,
      dhcpServers,
      poeBudget,
      printTables: toSnapshotTables(getNetworkReportTableData(netRows, layouts.networkReport)),
    },
    powerReport: {
      data: powerData,
      csv: powerCsv,
      printTables: toSnapshotTables(getPowerReportTableData(powerData, layouts.powerReport)),
    },
    patchPanelSchedule: {
      rows: patchRows,
      csv: patchCsv,
      printTables: toSnapshotTables(getPatchPanelScheduleTableData(patchRows, layouts.patchPanelSchedule)),
    },
    warnings: {
      duplicateIps,
      dhcp: dhcpWarnings,
      subnetConflicts,
    },
  };
}
