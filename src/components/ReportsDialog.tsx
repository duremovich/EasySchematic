import { memo, useMemo, useState, useCallback, useEffect } from "react";
import { useSchematicStore } from "../store";
import { computeNetworkReport, computeDhcpServerSummary, type NetworkReportRow } from "../networkReport";
import { isValidIpv4, isValidSubnetMask, isValidVlan, findDuplicateIps, computeDhcpWarnings, type DhcpWarning } from "../networkValidation";
import {
  computePackList,
  mergeDevicesByModel,
  mergeCablesByType,
  exportPackListCsv,
  getPackListTableData,
} from "../packList";
import {
  computeCableSchedule,
  exportCableScheduleCsv,
  getCableScheduleTableData,
  type CableScheduleRow,
} from "../cableSchedule";
import { createDefaultPackListLayout, createDefaultNetworkReportLayout, createDefaultCableScheduleLayout } from "../reportLayout";
import { getNetworkReportTableData } from "../networkReport";
import ReportPreviewDialog from "./ReportPreviewDialog";
import IpInput from "./IpInput";
import type { DeviceData, SchematicNode, RoomData, ConnectionData } from "../types";
import { useSpreadsheetSelection } from "../spreadsheet/useSpreadsheetSelection";
import type { SpreadsheetColumn } from "../spreadsheet/types";
import FillSeriesDialog from "../spreadsheet/FillSeriesDialog";

export type ReportsTab = "network" | "devices" | "packList" | "cableSchedule";

interface ReportsDialogProps {
  initialTab: ReportsTab;
  onClose: () => void;
}

const PACKLIST_LAYOUT_KEY = "easyschematic-packlist-layout";
const NETWORK_LAYOUT_KEY = "easyschematic-network-report-layout";
const CABLE_SCHEDULE_LAYOUT_KEY = "easyschematic-cable-schedule-layout";

function ReportsDialog({ initialTab, onClose }: ReportsDialogProps) {
  const [tab, setTab] = useState<ReportsTab>(initialTab);
  const [maximized, setMaximized] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showNetworkPreview, setShowNetworkPreview] = useState(false);
  const [showCableSchedulePreview, setShowCableSchedulePreview] = useState(false);

  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const schematicName = useSchematicStore((s) => s.schematicName);
  const titleBlock = useSchematicStore((s) => s.titleBlock);

  const tabClass = (t: ReportsTab) =>
    `px-3 py-1.5 text-xs rounded-t cursor-pointer border border-b-0 transition-colors ${
      tab === t
        ? "bg-white text-[var(--color-text-heading)] font-semibold border-[var(--color-border)]"
        : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]"
    }`;

  const btnClass =
    "px-3 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors cursor-pointer";

  const handleCsvExport = useCallback(() => {
    if (tab === "network") {
      exportNetworkCsv(nodes, edges, schematicName);
    } else if (tab === "devices") {
      exportDevicesCsv(nodes, schematicName);
    } else if (tab === "cableSchedule") {
      const rows = computeCableSchedule(nodes, edges);
      exportCableScheduleCsv(rows, schematicName);
    } else {
      const data = computePackList(nodes, edges);
      exportPackListCsv(data, schematicName);
    }
  }, [tab, nodes, edges, schematicName]);

  const defaultLayout = useMemo(() => createDefaultPackListLayout(), []);
  const networkDefaultLayout = useMemo(() => createDefaultNetworkReportLayout(), []);
  const cableScheduleDefaultLayout = useMemo(() => createDefaultCableScheduleLayout(), []);

  const tabLabels: Record<ReportsTab, string> = {
    network: "Network",
    devices: "Devices",
    packList: "Pack List",
    cableSchedule: "Cable Schedule",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        onClick={onClose}
      >
        <div
          className={`bg-white border border-[var(--color-border)] shadow-2xl flex flex-col transition-all duration-200 ${
            maximized
              ? "w-[calc(100%-2rem)] h-[calc(100%-2rem)] rounded-lg"
              : "w-[900px] h-[80vh] rounded-lg"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3 shrink-0">
            <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
              Reports
            </h2>
            <div className="flex-1" />
            <button onClick={handleCsvExport} className={btnClass}>
              CSV
            </button>
            {tab === "network" && (
              <button onClick={() => setShowNetworkPreview(true)} className={btnClass}>
                PDF
              </button>
            )}
            {tab === "packList" && (
              <button onClick={() => setShowPreview(true)} className={btnClass}>
                PDF
              </button>
            )}
            {tab === "cableSchedule" && (
              <button onClick={() => setShowCableSchedulePreview(true)} className={btnClass}>
                PDF
              </button>
            )}
            <button
              onClick={() => setMaximized(!maximized)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-sm leading-none cursor-pointer p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
              title={maximized ? "Restore size" : "Maximize"}
            >
              {maximized ? (
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="8" height="8" rx="1" />
                  <path d="M4 6h-1.5a.5.5 0 01-.5-.5v-3a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="12" height="12" rx="1.5" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] text-lg leading-none cursor-pointer ml-1"
            >
              &times;
            </button>
          </div>

          {/* Tabs */}
          <div className="px-4 pt-2 flex items-center gap-1 border-b border-[var(--color-border)]">
            {(Object.keys(tabLabels) as ReportsTab[]).map((t) => (
              <button key={t} className={tabClass(t)} onClick={() => setTab(t)}>
                {tabLabels[t]}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="overflow-auto flex-1 p-4">
            {tab === "network" && <NetworkReportTab />}
            {tab === "devices" && <DeviceReportTab />}
            {tab === "packList" && <PackListTabInline />}
            {tab === "cableSchedule" && <CableScheduleTabInline />}
          </div>
        </div>
      </div>

      {showNetworkPreview && (
        <ReportPreviewDialog
          reportKey={NETWORK_LAYOUT_KEY}
          defaultLayout={networkDefaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) =>
            getNetworkReportTableData(computeNetworkReport(nodes, edges), layout)
          }
          onClose={() => setShowNetworkPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Network Report.pdf`}
        />
      )}

      {showPreview && (
        <ReportPreviewDialog
          reportKey={PACKLIST_LAYOUT_KEY}
          defaultLayout={defaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) =>
            getPackListTableData(computePackList(nodes, edges), layout)
          }
          onClose={() => setShowPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Pack List.pdf`}
        />
      )}

      {showCableSchedulePreview && (
        <ReportPreviewDialog
          reportKey={CABLE_SCHEDULE_LAYOUT_KEY}
          defaultLayout={cableScheduleDefaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) =>
            getCableScheduleTableData(computeCableSchedule(nodes, edges), layout)
          }
          onClose={() => setShowCableSchedulePreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Cable Schedule.pdf`}
        />
      )}
    </>
  );
}

export default memo(ReportsDialog);

// ─── Shared styling ────────────────────────────────────────────

const thClass =
  "text-left text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-1.5 px-2 border-b border-[var(--color-border)] cursor-pointer hover:text-[var(--color-text)] select-none";
const tdClass = "py-1 px-2 text-xs text-[var(--color-text)]";
const rowClass = (i: number) =>
  i % 2 === 1 ? "bg-[var(--color-surface)]" : "";

// ─── Network Report Tab ────────────────────────────────────────

type SortKey = "deviceLabel" | "portLabel" | "room" | "signalType" | "ip" | "subnetMask" | "gateway" | "vlan" | "dhcp" | "dhcpServerLabel";

const networkColumns: SpreadsheetColumn<NetworkReportRow>[] = [
  { id: "deviceLabel", header: "Device", getValue: (r) => r.deviceLabel },
  { id: "portLabel", header: "Port", getValue: (r) => r.portLabel },
  { id: "room", header: "Room", getValue: (r) => r.room },
  { id: "signalType", header: "Signal", getValue: (r) => r.signalType },
  { id: "ip", header: "IP", getValue: (r) => r.ip, editable: (r) => !r.dhcp, fillType: "ip" },
  { id: "subnetMask", header: "Subnet", getValue: (r) => r.subnetMask, editable: (r) => !r.dhcp, fillType: "subnet" },
  { id: "gateway", header: "Gateway", getValue: (r) => r.gateway, editable: (r) => !r.dhcp, fillType: "gateway" },
  { id: "vlan", header: "VLAN", getValue: (r) => r.vlan, editable: (r) => !r.dhcp, fillType: "vlan" },
];

const COLUMN_LABELS: Record<string, string> = {
  ip: "IP",
  subnetMask: "Subnet",
  gateway: "Gateway",
  vlan: "VLAN",
};

function NetworkReportTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deviceLabel");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => computeNetworkReport(nodes, edges), [nodes, edges]);
  const duplicateIps = useMemo(() => findDuplicateIps(nodes), [nodes]);
  const dhcpServers = useMemo(() => computeDhcpServerSummary(nodes), [nodes]);
  const dhcpWarnings = useMemo(() => {
    const warnings = computeDhcpWarnings(rows, nodes, edges);
    const map = new Map<string, DhcpWarning>();
    for (const w of warnings) map.set(`${w.nodeId}:${w.portId}`, w);
    return map;
  }, [rows, nodes, edges]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.deviceLabel.toLowerCase().includes(q) ||
        r.portLabel.toLowerCase().includes(q) ||
        r.room.toLowerCase().includes(q) ||
        r.ip.includes(q) ||
        r.subnetMask.includes(q) ||
        r.gateway.includes(q) ||
        r.vlan.includes(q),
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "dhcp") {
        cmp = (a.dhcp ? 1 : 0) - (b.dhcp ? 1 : 0);
      } else if (sortKey === "dhcpServerLabel") {
        cmp = a.dhcpServerLabel.localeCompare(b.dhcpServerLabel);
      } else {
        cmp = (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  const updatePortNetworkField = useCallback(
    (row: NetworkReportRow, field: string, value: string | number | boolean | undefined) => {
      const node = nodes.find((n) => n.id === row.nodeId);
      if (!node || node.type !== "device") return;
      const data = node.data as DeviceData;
      const newPorts = data.ports.map((p) => {
        if (p.id !== row.portId) return p;
        const nc = { ...p.networkConfig, [field]: value };
        if (field === "ip" && typeof value === "string" && isValidIpv4(value) && !p.networkConfig?.subnetMask) {
          nc.subnetMask = "255.255.255.0";
        }
        return { ...p, networkConfig: nc };
      });
      patchDeviceData(row.nodeId, { ports: newPorts });
    },
    [nodes, patchDeviceData],
  );

  // Spreadsheet selection hook
  const isCellEditable = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return false;
      const col = networkColumns.find((c) => c.id === columnId);
      if (!col || !col.editable) return false;
      if (typeof col.editable === "function") return col.editable(row);
      return true;
    },
    [sorted],
  );

  const getCellValue = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return "";
      const col = networkColumns.find((c) => c.id === columnId);
      return col ? col.getValue(row) : "";
    },
    [sorted],
  );

  const onCellChange = useCallback(
    (rowIndex: number, columnId: string, value: string) => {
      const row = sorted[rowIndex];
      if (!row) return;
      if (columnId === "vlan") {
        updatePortNetworkField(row, columnId, value ? Number(value) : undefined);
      } else {
        updatePortNetworkField(row, columnId, value || undefined);
      }
    },
    [sorted, updatePortNetworkField],
  );

  const onBatchChange = useCallback(
    (changes: { rowIndex: number; columnId: string; value: string }[]) => {
      // Push a single undo snapshot, then apply all updates
      useSchematicStore.getState().pushSnapshot();

      // Group by nodeId for batching
      const nodeUpdates = new Map<string, { portId: string; field: string; value: string }[]>();
      for (const change of changes) {
        const row = sorted[change.rowIndex];
        if (!row) continue;
        const arr = nodeUpdates.get(row.nodeId) ?? [];
        arr.push({ portId: row.portId, field: change.columnId, value: change.value });
        nodeUpdates.set(row.nodeId, arr);
      }

      for (const [nodeId, updates] of nodeUpdates) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== "device") continue;
        const data = node.data as DeviceData;
        const newPorts = data.ports.map((p) => {
          const portUpdates = updates.filter((u) => u.portId === p.id);
          if (portUpdates.length === 0) return p;
          const nc = { ...p.networkConfig };
          for (const u of portUpdates) {
            if (u.field === "vlan") {
              (nc as Record<string, unknown>)[u.field] = u.value ? Number(u.value) : undefined;
            } else {
              (nc as Record<string, unknown>)[u.field] = u.value || undefined;
            }
            if (u.field === "ip" && u.value && isValidIpv4(u.value) && !nc.subnetMask) {
              nc.subnetMask = "255.255.255.0";
            }
          }
          return { ...p, networkConfig: nc };
        });
        const state = useSchematicStore.getState();
        useSchematicStore.setState({
          nodes: state.nodes.map((n) => {
            if (n.id !== nodeId || n.type !== "device") return n;
            return { ...n, data: { ...n.data, ports: newPorts } } as import("../types").DeviceNode;
          }),
        });
      }
      useSchematicStore.getState().saveToLocalStorage();
    },
    [sorted, nodes],
  );

  const spreadsheet = useSpreadsheetSelection({
    rowCount: sorted.length,
    columns: networkColumns,
    isCellEditable,
    getCellValue,
    onCellChange,
    onBatchChange,
  });

  // Clear selection on sort/filter change
  useEffect(() => {
    spreadsheet.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortAsc, filter]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No addressable ports in this schematic.
      </div>
    );
  }

  const getDupeWarning = (ip: string, nodeId: string, portId: string) => {
    const entries = duplicateIps.get(ip);
    if (!entries) return undefined;
    const others = entries.filter((e) => !(e.nodeId === nodeId && e.portId === portId));
    if (others.length === 0) return undefined;
    return `Duplicate IP — also used by: ${others.map((e) => `${e.deviceLabel} (${e.portLabel})`).join(", ")}`;
  };

  const selectedColLabel = spreadsheet.selectedColumn ? (COLUMN_LABELS[spreadsheet.selectedColumn] ?? spreadsheet.selectedColumn) : "";

  return (
    <>
      {/* DHCP Servers summary */}
      {dhcpServers.length > 0 && (
        <div className="mb-4 border border-[var(--color-border)] rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">DHCP Servers</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Device</th>
                <th className={thClass}>Pool Start</th>
                <th className={thClass}>Pool End</th>
                <th className={thClass}>Subnet</th>
                <th className={thClass}>Gateway</th>
              </tr>
            </thead>
            <tbody>
              {dhcpServers.map((srv, i) => (
                <tr key={srv.nodeId} className={rowClass(i)}>
                  <td className={tdClass}>{srv.deviceLabel}</td>
                  <td className={tdClass}>{srv.rangeStart || "—"}</td>
                  <td className={tdClass}>{srv.rangeEnd || "—"}</td>
                  <td className={tdClass}>{srv.subnetMask || "—"}</td>
                  <td className={tdClass}>{srv.gateway || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action bar */}
      {spreadsheet.selectedCells.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-xs font-medium text-blue-700">
            {spreadsheet.selectedCells.size} cell{spreadsheet.selectedCells.size > 1 ? "s" : ""} selected in {selectedColLabel}
          </span>
          <span className="text-[11px] text-blue-500">
            {spreadsheet.selectedCells.size > 1 ? "Type a value + Enter to fill series" : "Double-click or type to edit"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => spreadsheet.clearSelection()}
            className="px-2 py-1 text-xs rounded text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mb-3">
        <input
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
          placeholder="Filter by device, port, room, or IP..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div {...spreadsheet.getContainerProps()}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass} onClick={() => toggleSort("deviceLabel")}>
                Device{sortArrow("deviceLabel")}
              </th>
              <th className={thClass} onClick={() => toggleSort("portLabel")}>
                Port{sortArrow("portLabel")}
              </th>
              <th className={thClass} onClick={() => toggleSort("room")}>
                Room{sortArrow("room")}
              </th>
              <th className={thClass} onClick={() => toggleSort("signalType")}>
                Signal{sortArrow("signalType")}
              </th>
              <th className={thClass} onClick={() => toggleSort("ip")}>
                IP{sortArrow("ip")}
              </th>
              <th className={thClass} onClick={() => toggleSort("subnetMask")}>
                Subnet{sortArrow("subnetMask")}
              </th>
              <th className={thClass} onClick={() => toggleSort("gateway")}>
                Gateway{sortArrow("gateway")}
              </th>
              <th className={thClass} onClick={() => toggleSort("vlan")}>
                VLAN{sortArrow("vlan")}
              </th>
              <th className={thClass} onClick={() => toggleSort("dhcp")}>
                DHCP{sortArrow("dhcp")}
              </th>
              <th className={thClass} onClick={() => toggleSort("dhcpServerLabel")}>
                DHCP Server{sortArrow("dhcpServerLabel")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <NetworkRow
                key={`${row.nodeId}:${row.portId}`}
                row={row}
                rowIndex={i}
                altClass={rowClass(i)}
                duplicateWarning={row.ip ? getDupeWarning(row.ip, row.nodeId, row.portId) : undefined}
                dhcpWarning={dhcpWarnings.get(`${row.nodeId}:${row.portId}`)}
                onUpdateField={(field, value) => updatePortNetworkField(row, field, value)}
                spreadsheet={spreadsheet}
              />
            ))}
          </tbody>
        </table>
      </div>

      {spreadsheet.fillSeriesRequest && (
        <FillSeriesDialog
          config={spreadsheet.fillSeriesRequest.config}
          startValue={spreadsheet.fillSeriesRequest.startValue}
          cellCount={spreadsheet.fillSeriesRequest.cellCount}
          onApply={(values) => spreadsheet.applyFillSeries(values)}
          onClose={() => spreadsheet.dismissFillSeries()}
        />
      )}
    </>
  );
}

const NetworkRow = memo(function NetworkRow({
  row,
  rowIndex,
  altClass,
  duplicateWarning,
  dhcpWarning,
  onUpdateField,
  spreadsheet,
}: {
  row: NetworkReportRow;
  rowIndex: number;
  altClass: string;
  duplicateWarning?: string;
  dhcpWarning?: DhcpWarning;
  onUpdateField: (field: string, value: string | number | boolean | undefined) => void;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<NetworkReportRow>>;
}) {
  // Check if any cell in this row is selected for row-level highlight
  const hasSelection = networkColumns.some((col) => {
    const props = spreadsheet.getCellProps(rowIndex, col.id);
    return props.isSelected;
  });

  const dhcpServerCell = (() => {
    if (dhcpWarning?.type === "no-server") {
      return (
        <td className={`${tdClass} bg-amber-50`} title={dhcpWarning.message}>
          <span className="text-amber-600 text-[10px]">None found</span>
        </td>
      );
    }
    if (dhcpWarning?.type === "ip-in-range") {
      return (
        <td className={`${tdClass} bg-amber-100`} title={dhcpWarning.message}>
          <span className="text-amber-700 text-[10px]">{row.dhcpServerLabel || "—"}</span>
        </td>
      );
    }
    return (
      <td className={tdClass}>
        <span className="text-[10px]">{row.dhcpServerLabel || "—"}</span>
      </td>
    );
  })();

  return (
    <tr className={hasSelection ? "bg-blue-50" : altClass}>
      {/* Read-only columns */}
      <td className={tdClass}>{row.deviceLabel}</td>
      <td className={tdClass}>{row.portLabel}</td>
      <td className={tdClass}>{row.room}</td>
      <td className={tdClass}>{row.signalType}</td>

      {/* Editable: IP */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="ip"
        spreadsheet={spreadsheet}
        displayValue={row.ip}
        placeholder="—"
        duplicateWarning={duplicateWarning}
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <IpInput
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            placeholder="—"
            duplicateWarning={duplicateWarning}
            className="w-full"
            autoFocus
          />
        )}
      />

      {/* Editable: Subnet */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="subnetMask"
        spreadsheet={spreadsheet}
        displayValue={row.subnetMask}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <IpInput
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            placeholder="—"
            validate={isValidSubnetMask}
            className="w-full"
            autoFocus
          />
        )}
      />

      {/* Editable: Gateway */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="gateway"
        spreadsheet={spreadsheet}
        displayValue={row.gateway}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <IpInput
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            placeholder="—"
            className="w-full"
            autoFocus
          />
        )}
      />

      {/* Editable: VLAN */}
      <SpreadsheetCell
        rowIndex={rowIndex}
        columnId="vlan"
        spreadsheet={spreadsheet}
        displayValue={row.vlan}
        placeholder="—"
        renderEditor={(value, onChange, onCommit, onCancel) => (
          <input
            className={`w-full bg-[var(--color-surface)] border rounded px-1 py-0.5 text-[10px] outline-none ${
              value !== "" && !isValidVlan(Number(value)) ? "border-red-400" : "border-blue-500"
            }`}
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onCommit(); }
              else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
              else if (e.key === "Tab") { e.preventDefault(); onCommit(); }
              e.stopPropagation();
            }}
            placeholder="—"
            autoFocus
          />
        )}
      />

      {/* DHCP: direct checkbox, not spreadsheet-managed */}
      <td className={`${tdClass} text-center`}>
        <input
          type="checkbox"
          checked={row.dhcp}
          onChange={(e) => onUpdateField("dhcp", e.target.checked || undefined)}
          className="cursor-pointer"
        />
      </td>

      {/* DHCP Server: read-only coverage column */}
      {dhcpServerCell}
    </tr>
  );
});

/** Generic spreadsheet-aware cell: shows display text or renders editor */
function SpreadsheetCell({
  rowIndex,
  columnId,
  spreadsheet,
  displayValue,
  placeholder,
  duplicateWarning,
  renderEditor,
}: {
  rowIndex: number;
  columnId: string;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<NetworkReportRow>>;
  displayValue: string;
  placeholder?: string;
  duplicateWarning?: string;
  renderEditor: (
    value: string,
    onChange: (v: string) => void,
    onCommit: () => void,
    onCancel: () => void,
  ) => React.ReactNode;
}) {
  const cellProps = spreadsheet.getCellProps(rowIndex, columnId);

  if (cellProps.isEditing) {
    return (
      <td className={`${tdClass} p-0.5`}>
        {renderEditor(
          spreadsheet.editValue,
          spreadsheet.setEditValue,
          () => spreadsheet.commitEdit(spreadsheet.editValue),
          () => spreadsheet.cancelEdit(),
        )}
      </td>
    );
  }

  const isDupe = columnId === "ip" && !!duplicateWarning;
  const selectionBg = cellProps.isSelected ? "bg-blue-100 ring-1 ring-inset ring-blue-300" : "";
  const dupeBg = isDupe && !cellProps.isSelected ? "bg-yellow-50" : "";

  return (
    <td
      className={`${tdClass} p-0.5 ${cellProps.editable ? "cursor-cell" : ""} ${selectionBg} ${dupeBg}`}
      onMouseDown={cellProps.onMouseDown}
      onMouseEnter={cellProps.onMouseEnter}
      onDoubleClick={cellProps.onDoubleClick}
      title={isDupe ? duplicateWarning : undefined}
    >
      <span className="text-[10px] px-1 select-none">
        {displayValue || <span className="text-[var(--color-text-muted)]">{placeholder}</span>}
      </span>
    </td>
  );
}

// ─── Device Report Tab ─────────────────────────────────────────

interface DeviceReportRow {
  nodeId: string;
  label: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  room: string;
  portCount: number;
  color: string;
}

function computeDeviceReport(nodes: SchematicNode[]): DeviceReportRow[] {
  const rows: DeviceReportRow[] = [];
  for (const node of nodes) {
    if (node.type !== "device") continue;
    const data = node.data as DeviceData;
    if (data.isCableAccessory) continue;
    const parentRoom = nodes.find((n) => n.id === node.parentId);
    const room =
      parentRoom?.type === "room"
        ? (parentRoom.data as RoomData).label || "Unassigned"
        : "Unassigned";

    rows.push({
      nodeId: node.id,
      label: data.label,
      deviceType: data.deviceType,
      manufacturer: data.manufacturer ?? "",
      model: data.model ?? data.label,
      room,
      portCount: data.ports.length,
      color: data.color ?? "#6366f1",
    });
  }
  return rows;
}

type DeviceSortKey = "label" | "deviceType" | "manufacturer" | "model" | "room" | "portCount";

const deviceColumns: SpreadsheetColumn<DeviceReportRow>[] = [
  { id: "label", header: "Device", getValue: (r) => r.label, editable: true, fillType: "deviceName" },
];

function DeviceReportTab() {
  const nodes = useSchematicStore((s) => s.nodes);
  const patchDeviceData = useSchematicStore((s) => s.patchDeviceData);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<DeviceSortKey>("label");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => computeDeviceReport(nodes), [nodes]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.deviceType.toLowerCase().includes(q) ||
        r.manufacturer.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.room.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "portCount") {
        cmp = a.portCount - b.portCount;
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: DeviceSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: DeviceSortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  const handleColorChange = useCallback(
    (nodeId: string, color: string) => {
      patchDeviceData(nodeId, { color });
    },
    [patchDeviceData],
  );

  const onCellChange = useCallback(
    (rowIndex: number, _columnId: string, value: string) => {
      const row = sorted[rowIndex];
      if (!row || !value.trim()) return;
      useSchematicStore.getState().updateDeviceLabel(row.nodeId, value.trim());
    },
    [sorted],
  );

  const onBatchChange = useCallback(
    (changes: { rowIndex: number; columnId: string; value: string }[]) => {
      const labelChanges = changes
        .map((c) => {
          const row = sorted[c.rowIndex];
          if (!row || !c.value.trim()) return null;
          return { nodeId: row.nodeId, label: c.value.trim() };
        })
        .filter((c): c is { nodeId: string; label: string } => c !== null);
      if (labelChanges.length > 0) {
        useSchematicStore.getState().batchUpdateDeviceLabels(labelChanges);
      }
    },
    [sorted],
  );

  const isCellEditable = useCallback(
    (_rowIndex: number, _columnId: string) => true,
    [],
  );

  const getCellValue = useCallback(
    (rowIndex: number, _columnId: string) => sorted[rowIndex]?.label ?? "",
    [sorted],
  );

  const spreadsheet = useSpreadsheetSelection({
    rowCount: sorted.length,
    columns: deviceColumns,
    isCellEditable,
    getCellValue,
    onCellChange,
    onBatchChange,
  });

  // Clear selection on sort/filter change
  useEffect(() => {
    spreadsheet.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortAsc, filter]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No devices in this schematic.
      </div>
    );
  }

  return (
    <>
      {/* Action bar */}
      {spreadsheet.selectedCells.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-xs font-medium text-blue-700">
            {spreadsheet.selectedCells.size} device name{spreadsheet.selectedCells.size > 1 ? "s" : ""} selected
          </span>
          <span className="text-[11px] text-blue-500">
            {spreadsheet.selectedCells.size > 1 ? "Type a name + Enter to fill series" : "Double-click or type to rename"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => spreadsheet.clearSelection()}
            className="px-2 py-1 text-xs rounded text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mb-3">
        <input
          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
          placeholder="Filter by name, type, manufacturer, or room..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div {...spreadsheet.getContainerProps()}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass} onClick={() => toggleSort("label")}>
                Device{sortArrow("label")}
              </th>
              <th className={thClass} onClick={() => toggleSort("deviceType")}>
                Type{sortArrow("deviceType")}
              </th>
              <th className={thClass} onClick={() => toggleSort("manufacturer")}>
                Manufacturer{sortArrow("manufacturer")}
              </th>
              <th className={thClass} onClick={() => toggleSort("model")}>
                Model{sortArrow("model")}
              </th>
              <th className={thClass} onClick={() => toggleSort("room")}>
                Room{sortArrow("room")}
              </th>
              <th className={thClass} onClick={() => toggleSort("portCount")}>
                Ports{sortArrow("portCount")}
              </th>
              <th className={thClass} style={{ width: 40 }}>Color</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <DeviceRow
                key={row.nodeId}
                row={row}
                rowIndex={i}
                altClass={rowClass(i)}
                spreadsheet={spreadsheet}
                onColorChange={handleColorChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {spreadsheet.fillSeriesRequest && (
        <FillSeriesDialog
          config={spreadsheet.fillSeriesRequest.config}
          startValue={spreadsheet.fillSeriesRequest.startValue}
          cellCount={spreadsheet.fillSeriesRequest.cellCount}
          onApply={(values) => spreadsheet.applyFillSeries(values)}
          onClose={() => spreadsheet.dismissFillSeries()}
        />
      )}
    </>
  );
}

const DeviceRow = memo(function DeviceRow({
  row,
  rowIndex,
  altClass,
  spreadsheet,
  onColorChange,
}: {
  row: DeviceReportRow;
  rowIndex: number;
  altClass: string;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<DeviceReportRow>>;
  onColorChange: (nodeId: string, color: string) => void;
}) {
  const cellProps = spreadsheet.getCellProps(rowIndex, "label");
  const hasSelection = cellProps.isSelected;

  return (
    <tr className={hasSelection ? "bg-blue-50" : altClass}>
      {cellProps.isEditing ? (
        <td className={`${tdClass} p-0.5`}>
          <input
            className="w-full bg-[var(--color-surface)] border border-blue-500 rounded px-1 py-0.5 text-xs outline-none"
            value={spreadsheet.editValue}
            onChange={(e) => spreadsheet.setEditValue(e.target.value)}
            onBlur={() => spreadsheet.commitEdit(spreadsheet.editValue)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
              else if (e.key === "Escape") { e.preventDefault(); spreadsheet.cancelEdit(); }
              else if (e.key === "Tab") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
            }}
            autoFocus
          />
        </td>
      ) : (
        <td
          className={`${tdClass} p-0.5 cursor-cell ${cellProps.isSelected ? "bg-blue-100 ring-1 ring-inset ring-blue-300" : ""}`}
          onMouseDown={cellProps.onMouseDown}
          onMouseEnter={cellProps.onMouseEnter}
          onDoubleClick={cellProps.onDoubleClick}
        >
          <span className="text-[10px] px-1 select-none">{row.label}</span>
        </td>
      )}
      <td className={tdClass}>{row.deviceType}</td>
      <td className={tdClass}>{row.manufacturer || "—"}</td>
      <td className={tdClass}>{row.model}</td>
      <td className={tdClass}>{row.room}</td>
      <td className={tdClass}>{row.portCount}</td>
      <td className={`${tdClass} p-0.5`}>
        <input
          type="color"
          value={row.color}
          onChange={(e) => onColorChange(row.nodeId, e.target.value)}
          className="w-6 h-5 p-0 border-0 cursor-pointer rounded"
        />
      </td>
    </tr>
  );
});

// ─── Cable Schedule Tab ────────────────────────────────────────

type CableSortKey = "cableId" | "sourceDevice" | "sourcePort" | "sourceConnector" | "targetDevice" | "targetPort" | "targetConnector" | "cableType" | "signalType" | "cableLength" | "sourceRoom" | "targetRoom" | "multicableLabel";
type CableGroupBy = "" | "sourceRoom" | "signalType" | "cableType" | "multicableLabel";

const cableScheduleColumns: SpreadsheetColumn<CableScheduleRow>[] = [
  { id: "cableId", header: "Cable ID", getValue: (r) => r.cableId, editable: true, fillType: "deviceName" },
  { id: "cableLength", header: "Length", getValue: (r) => r.cableLength, editable: true },
];

function CableScheduleTabInline() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const patchEdgeData = useSchematicStore((s) => s.patchEdgeData);
  const batchPatchEdgeData = useSchematicStore((s) => s.batchPatchEdgeData);

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<CableSortKey>("cableId");
  const [sortAsc, setSortAsc] = useState(true);
  const [groupByKey, setGroupByKey] = useState<CableGroupBy>("");

  const rows = useMemo(() => computeCableSchedule(nodes, edges), [nodes, edges]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.cableId.toLowerCase().includes(q) ||
        r.sourceDevice.toLowerCase().includes(q) ||
        r.sourcePort.toLowerCase().includes(q) ||
        r.sourceConnector.toLowerCase().includes(q) ||
        r.targetDevice.toLowerCase().includes(q) ||
        r.targetPort.toLowerCase().includes(q) ||
        r.targetConnector.toLowerCase().includes(q) ||
        r.cableType.toLowerCase().includes(q) ||
        r.signalType.toLowerCase().includes(q) ||
        r.cableLength.toLowerCase().includes(q) ||
        r.sourceRoom.toLowerCase().includes(q) ||
        r.targetRoom.toLowerCase().includes(q) ||
        r.multicableLabel.toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = a[sortKey].localeCompare(b[sortKey]);
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const toggleSort = (key: CableSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: CableSortKey) =>
    sortKey === key ? (sortAsc ? " ▴" : " ▾") : "";

  const onCellChange = useCallback(
    (rowIndex: number, columnId: string, value: string) => {
      const row = sorted[rowIndex];
      if (!row) return;
      if (columnId === "cableLength") {
        patchEdgeData(row.edgeId, { cableLength: value.trim() });
      } else {
        if (!value.trim()) return;
        patchEdgeData(row.edgeId, { cableId: value.trim() });
      }
    },
    [sorted, patchEdgeData],
  );

  const onBatchChange = useCallback(
    (changes: { rowIndex: number; columnId: string; value: string }[]) => {
      const edgeChanges = changes
        .map((c) => {
          const row = sorted[c.rowIndex];
          if (!row) return null;
          if (c.columnId === "cableLength") {
            return { edgeId: row.edgeId, patch: { cableLength: c.value.trim() } };
          }
          if (!c.value.trim()) return null;
          return { edgeId: row.edgeId, patch: { cableId: c.value.trim() } };
        })
        .filter((c) => c !== null) as { edgeId: string; patch: Partial<ConnectionData> }[];
      if (edgeChanges.length > 0) {
        batchPatchEdgeData(edgeChanges);
      }
    },
    [sorted, batchPatchEdgeData],
  );

  const isCellEditable = useCallback(
    (_rowIndex: number, _columnId: string) => true,
    [],
  );

  const getCellValue = useCallback(
    (rowIndex: number, columnId: string) => {
      const row = sorted[rowIndex];
      if (!row) return "";
      if (columnId === "cableLength") return row.cableLength;
      return row.cableId;
    },
    [sorted],
  );

  const spreadsheet = useSpreadsheetSelection({
    rowCount: sorted.length,
    columns: cableScheduleColumns,
    isCellEditable,
    getCellValue,
    onCellChange,
    onBatchChange,
  });

  // Clear selection on sort/filter change
  useEffect(() => {
    spreadsheet.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortAsc, filter]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No connections in this schematic.
      </div>
    );
  }

  const grouped = groupByKey
    ? groupCableScheduleRows(sorted, groupByKey)
    : null;

  return (
    <>
      {/* Action bar */}
      {spreadsheet.selectedCells.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-xs font-medium text-blue-700">
            {spreadsheet.selectedCells.size} cell{spreadsheet.selectedCells.size > 1 ? "s" : ""} selected
          </span>
          <span className="text-[11px] text-blue-500">
            {spreadsheet.selectedCells.size > 1 ? "Type a value + Enter to fill series" : "Double-click or type to edit"}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => spreadsheet.clearSelection()}
            className="px-2 py-1 text-xs rounded text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <input
          className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
          placeholder="Filter by device, port, cable type, signal, room..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <select
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none cursor-pointer"
          value={groupByKey}
          onChange={(e) => setGroupByKey(e.target.value as CableGroupBy)}
        >
          <option value="">No Grouping</option>
          <option value="sourceRoom">Source Room</option>
          <option value="signalType">Signal Type</option>
          <option value="cableType">Cable Type</option>
          <option value="multicableLabel">Snake</option>
        </select>
      </div>
      <div {...spreadsheet.getContainerProps()}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass} onClick={() => toggleSort("cableId")}>Cable ID{sortArrow("cableId")}</th>
              <th className={thClass} onClick={() => toggleSort("sourceDevice")}>Source{sortArrow("sourceDevice")}</th>
              <th className={thClass} onClick={() => toggleSort("sourcePort")}>Src Port{sortArrow("sourcePort")}</th>
              <th className={thClass} onClick={() => toggleSort("sourceConnector")}>Src Conn{sortArrow("sourceConnector")}</th>
              <th className={thClass} onClick={() => toggleSort("targetDevice")}>Target{sortArrow("targetDevice")}</th>
              <th className={thClass} onClick={() => toggleSort("targetPort")}>Tgt Port{sortArrow("targetPort")}</th>
              <th className={thClass} onClick={() => toggleSort("targetConnector")}>Tgt Conn{sortArrow("targetConnector")}</th>
              <th className={thClass} onClick={() => toggleSort("cableType")}>Cable Type{sortArrow("cableType")}</th>
              <th className={thClass} onClick={() => toggleSort("signalType")}>Signal{sortArrow("signalType")}</th>
              <th className={thClass} onClick={() => toggleSort("cableLength")}>Length{sortArrow("cableLength")}</th>
              <th className={thClass} onClick={() => toggleSort("sourceRoom")}>Src Room{sortArrow("sourceRoom")}</th>
              <th className={thClass} onClick={() => toggleSort("targetRoom")}>Tgt Room{sortArrow("targetRoom")}</th>
              <th className={thClass} onClick={() => toggleSort("multicableLabel")}>Snake{sortArrow("multicableLabel")}</th>
            </tr>
          </thead>
          <tbody>
            {grouped
              ? renderGroupedCableSchedule(grouped, spreadsheet)
              : sorted.map((r, i) => (
                  <CableScheduleRow_
                    key={r.edgeId}
                    row={r}
                    rowIndex={i}
                    altClass={rowClass(i)}
                    spreadsheet={spreadsheet}
                  />
                ))
            }
          </tbody>
        </table>
      </div>

      {spreadsheet.fillSeriesRequest && (
        <FillSeriesDialog
          config={spreadsheet.fillSeriesRequest.config}
          startValue={spreadsheet.fillSeriesRequest.startValue}
          cellCount={spreadsheet.fillSeriesRequest.cellCount}
          onApply={(values) => spreadsheet.applyFillSeries(values)}
          onClose={() => spreadsheet.dismissFillSeries()}
        />
      )}
    </>
  );
}

function EditableCell({ spreadsheet, rowIndex, columnId, value }: {
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<CableScheduleRow>>;
  rowIndex: number;
  columnId: string;
  value: string;
}) {
  const cellProps = spreadsheet.getCellProps(rowIndex, columnId);
  if (cellProps.isEditing) {
    return (
      <td className={`${tdClass} p-0.5`}>
        <input
          className="w-full bg-[var(--color-surface)] border border-blue-500 rounded px-1 py-0.5 text-xs outline-none"
          value={spreadsheet.editValue}
          onChange={(e) => spreadsheet.setEditValue(e.target.value)}
          onBlur={() => spreadsheet.commitEdit(spreadsheet.editValue)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
            else if (e.key === "Escape") { e.preventDefault(); spreadsheet.cancelEdit(); }
            else if (e.key === "Tab") { e.preventDefault(); spreadsheet.commitEdit(spreadsheet.editValue); }
          }}
          autoFocus
        />
      </td>
    );
  }
  return (
    <td
      className={`${tdClass} p-0.5 cursor-cell ${cellProps.isSelected ? "bg-blue-100 ring-1 ring-inset ring-blue-300" : ""}`}
      onMouseDown={cellProps.onMouseDown}
      onMouseEnter={cellProps.onMouseEnter}
      onDoubleClick={cellProps.onDoubleClick}
    >
      <span className="text-[10px] px-1 select-none">{value}</span>
    </td>
  );
}

const CableScheduleRow_ = memo(function CableScheduleRow_({
  row,
  rowIndex,
  altClass,
  spreadsheet,
}: {
  row: CableScheduleRow;
  rowIndex: number;
  altClass: string;
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<CableScheduleRow>>;
}) {
  const cableIdProps = spreadsheet.getCellProps(rowIndex, "cableId");
  const lengthProps = spreadsheet.getCellProps(rowIndex, "cableLength");
  const hasSelection = cableIdProps.isSelected || lengthProps.isSelected;

  return (
    <tr className={hasSelection ? "bg-blue-50" : altClass}>
      <EditableCell spreadsheet={spreadsheet} rowIndex={rowIndex} columnId="cableId" value={row.cableId} />
      <td className={tdClass}>{row.sourceDevice}</td>
      <td className={tdClass}>{row.sourcePort}</td>
      <td className={tdClass}>{row.sourceConnector}</td>
      <td className={tdClass}>{row.targetDevice}</td>
      <td className={tdClass}>{row.targetPort}</td>
      <td className={tdClass}>{row.targetConnector}</td>
      <td className={tdClass}>{row.cableType}</td>
      <td className={tdClass}>{row.signalType}</td>
      <EditableCell spreadsheet={spreadsheet} rowIndex={rowIndex} columnId="cableLength" value={row.cableLength} />
      <td className={tdClass}>{row.sourceRoom}</td>
      <td className={tdClass}>{row.targetRoom}</td>
      <td className={tdClass}>{row.multicableLabel}</td>
    </tr>
  );
});

function groupCableScheduleRows(rows: CableScheduleRow[], key: CableGroupBy): Map<string, CableScheduleRow[]> {
  const map = new Map<string, CableScheduleRow[]>();
  for (const r of rows) {
    const groupKey = key === "sourceRoom" ? r.sourceRoom : key === "signalType" ? r.signalType : key === "multicableLabel" ? (r.multicableLabel || "Ungrouped") : r.cableType;
    const arr = map.get(groupKey);
    if (arr) arr.push(r);
    else map.set(groupKey, [r]);
  }
  return map;
}

function renderGroupedCableSchedule(
  groups: Map<string, CableScheduleRow[]>,
  spreadsheet: ReturnType<typeof useSpreadsheetSelection<CableScheduleRow>>,
) {
  const elements: React.ReactNode[] = [];
  let idx = 0;
  for (const [group, rows] of groups) {
    elements.push(
      <tr key={`h-${group}`}>
        <td
          colSpan={13}
          className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--color-border)]"
        >
          {group}
        </td>
      </tr>,
    );
    for (const r of rows) {
      elements.push(
        <CableScheduleRow_
          key={r.edgeId}
          row={r}
          rowIndex={idx}
          altClass={rowClass(idx)}
          spreadsheet={spreadsheet}
        />,
      );
      idx++;
    }
  }
  return elements;
}

// ─── Pack List Tab (inline, reusing packList.ts logic) ─────────

function PackListTabInline() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);

  type SubTab = "devices" | "cables" | "accessories";
  const [subTab, setSubTab] = useState<SubTab>("devices");
  const [groupDevicesByRoom, setGroupDevicesByRoom] = useState(false);
  const [groupCablesByPath, setGroupCablesByPath] = useState(false);

  const data = useMemo(() => computePackList(nodes, edges), [nodes, edges]);

  const subTabClass = (t: SubTab) =>
    `px-2 py-1 text-[10px] rounded cursor-pointer transition-colors ${
      subTab === t
        ? "bg-blue-100 text-blue-700 font-semibold"
        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
    }`;

  const plThClass =
    "text-left text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-1.5 px-2 border-b border-[var(--color-border)]";

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button className={subTabClass("devices")} onClick={() => setSubTab("devices")}>
          Devices
        </button>
        <button className={subTabClass("cables")} onClick={() => setSubTab("cables")}>
          Cables
        </button>
        {data.accessories.length > 0 && (
          <button className={subTabClass("accessories")} onClick={() => setSubTab("accessories")}>
            Accessories
          </button>
        )}
        <div className="flex-1" />
        {subTab === "devices" && (
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupDevicesByRoom}
              onChange={(e) => setGroupDevicesByRoom(e.target.checked)}
              className="accent-blue-600"
            />
            Group by Room
          </label>
        )}
        {subTab === "cables" && (
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={groupCablesByPath}
              onChange={(e) => setGroupCablesByPath(e.target.checked)}
              className="accent-blue-600"
            />
            Group by Path
          </label>
        )}
      </div>

      {subTab === "devices" && (
        <>
          {data.devices.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No devices in this schematic.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={plThClass}>Qty</th>
                  <th className={plThClass}>Device</th>
                  <th className={plThClass}>Type</th>
                </tr>
              </thead>
              <tbody>
                {(groupDevicesByRoom
                  ? renderGroupedDevices(data.devices)
                  : mergeDevicesByModel(data.devices).map((d, i) => (
                      <tr key={i} className={rowClass(i)}>
                        <td className={tdClass}>{d.count}&times;</td>
                        <td className={tdClass}>{d.model}</td>
                        <td className={tdClass}>{d.deviceType}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {subTab === "cables" && (
        <>
          {data.summary.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No connections in this schematic.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={plThClass}>Qty</th>
                  <th className={plThClass}>Cable Type</th>
                  <th className={plThClass}>Signal</th>
                  <th className={plThClass}>Length</th>
                  {groupCablesByPath && <th className={plThClass}>Route</th>}
                </tr>
              </thead>
              <tbody>
                {(groupCablesByPath
                  ? data.summary.map((s, i) => (
                      <tr key={i} className={rowClass(i)}>
                        <td className={tdClass}>{s.count}&times;</td>
                        <td className={tdClass}>{s.cableType}</td>
                        <td className={tdClass}>{s.signalType}</td>
                        <td className={tdClass}>{s.cableLength}</td>
                        <td className={tdClass}>{s.route}</td>
                      </tr>
                    ))
                  : mergeCablesByType(data.summary).map((s, i) => (
                      <tr key={i} className={rowClass(i)}>
                        <td className={tdClass}>{s.count}&times;</td>
                        <td className={tdClass}>{s.cableType}</td>
                        <td className={tdClass}>{s.signalType}</td>
                        <td className={tdClass}>{s.cableLength}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {subTab === "accessories" && (
        <>
          {data.accessories.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No cable accessories in this schematic.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={plThClass}>Qty</th>
                  <th className={plThClass}>Accessory</th>
                  <th className={plThClass}>Type</th>
                  <th className={plThClass}>Room</th>
                </tr>
              </thead>
              <tbody>
                {data.accessories.map((a, i) => (
                  <tr key={i} className={rowClass(i)}>
                    <td className={tdClass}>{a.count}&times;</td>
                    <td className={tdClass}>{a.model}</td>
                    <td className={tdClass}>{a.accessoryType}</td>
                    <td className={tdClass}>{a.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

function renderGroupedDevices(devices: { model: string; deviceType: string; room: string; count: number }[]) {
  const groups = new Map<string, typeof devices>();
  for (const d of devices) {
    const arr = groups.get(d.room);
    if (arr) arr.push(d);
    else groups.set(d.room, [d]);
  }

  const elements: React.ReactNode[] = [];
  let idx = 0;
  for (const [room, rows] of groups) {
    elements.push(
      <tr key={`h-${room}`}>
        <td
          colSpan={99}
          className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--color-border)]"
        >
          {room}
        </td>
      </tr>,
    );
    for (const d of rows) {
      elements.push(
        <tr key={`${room}-${idx}`} className={rowClass(idx)}>
          <td className={tdClass}>{d.count}&times;</td>
          <td className={tdClass}>{d.model}</td>
          <td className={tdClass}>{d.deviceType}</td>
        </tr>,
      );
      idx++;
    }
  }
  return elements;
}

// ─── CSV export helpers ────────────────────────────────────────

function exportNetworkCsv(nodes: SchematicNode[], edges: import("../types").ConnectionEdge[], schematicName: string) {
  const rows = computeNetworkReport(nodes, edges);
  const header = ["Device", "Port", "Room", "Signal", "IP", "Subnet Mask", "Gateway", "VLAN", "DHCP", "DHCP Server"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.deviceLabel),
        csvEscape(r.portLabel),
        csvEscape(r.room),
        csvEscape(r.signalType),
        r.ip,
        r.subnetMask,
        r.gateway,
        r.vlan,
        r.dhcp ? "Yes" : "No",
        csvEscape(r.dhcpServerLabel),
      ].join(","),
    ),
  ];
  downloadCsv(lines.join("\n"), `${schematicName} - Network Report.csv`);
}

function exportDevicesCsv(nodes: SchematicNode[], schematicName: string) {
  const rows = computeDeviceReport(nodes);
  const header = ["Device", "Type", "Manufacturer", "Model", "Room", "Ports", "Color"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.label),
        csvEscape(r.deviceType),
        csvEscape(r.manufacturer),
        csvEscape(r.model),
        csvEscape(r.room),
        r.portCount,
        r.color,
      ].join(","),
    ),
  ];
  downloadCsv(lines.join("\n"), `${schematicName} - Device List.csv`);
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9-_ .]/g, "");
  a.click();
  URL.revokeObjectURL(url);
}
