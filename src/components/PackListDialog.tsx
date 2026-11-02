import { memo, useMemo, useState } from "react";
import { useSchematicStore } from "../store";
import {
  computePackList,
  mergeDevicesByModel,
  mergeCablesByType,
  exportPackListCsv,
  getPackListTableData,
  routeRoomKey,
  type PackListDevice,
  type PackListSummaryRow,
  type PackListAdapter,
} from "../packList";
import { createDefaultPackListLayout } from "../reportLayout";
import ReportPreviewDialog from "./ReportPreviewDialog";
import { deviceTypeDisplay } from "../typeRegistry";

type Tab = "devices" | "cables";

interface PackListDialogProps {
  onClose: () => void;
}

const REPORT_LAYOUT_KEY = "easyschematic-packlist-layout";

function PackListDialog({ onClose }: PackListDialogProps) {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const schematicName = useSchematicStore((s) => s.schematicName);
  const titleBlock = useSchematicStore((s) => s.titleBlock);

  const [tab, setTab] = useState<Tab>("devices");
  const [groupDevicesByRoom, setGroupDevicesByRoom] = useState(false);
  const [groupCablesByPath, setGroupCablesByPath] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const pages = useSchematicStore((s) => s.pages);
  const data = useMemo(() => computePackList(nodes, edges, pages), [nodes, edges, pages]);

  const defaultLayout = useMemo(() => createDefaultPackListLayout(), []);

  const tabClass = (t: Tab) =>
    `px-3 py-1.5 text-xs rounded-t cursor-pointer border border-b-0 transition-colors ${
      tab === t
        ? "bg-white text-[var(--color-text-heading)] font-semibold border-[var(--color-border)]"
        : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]"
    }`;

  const btnClass =
    "px-3 py-1 text-xs rounded bg-[var(--color-surface)] text-[var(--color-text)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors cursor-pointer";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        onClick={onClose}
      >
        <div
          className="bg-white border border-[var(--color-border)] rounded-lg shadow-2xl w-[700px] max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
              Pack List
            </h2>
            <div className="flex-1" />
            <button
              onClick={() => exportPackListCsv(data, schematicName)}
              className={btnClass}
            >
              CSV
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className={btnClass}
            >
              PDF
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
            <button className={tabClass("devices")} onClick={() => setTab("devices")}>
              Devices
            </button>
            <button className={tabClass("cables")} onClick={() => setTab("cables")}>
              Cables
            </button>
          </div>

          {/* Body */}
          <div className="overflow-auto flex-1 p-4">
            {tab === "devices" && (
              <>
                <div className="flex justify-end mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={groupDevicesByRoom}
                      onChange={(e) => setGroupDevicesByRoom(e.target.checked)}
                      className="accent-blue-600"
                    />
                    Group by Room
                  </label>
                </div>
                <DevicesTab devices={data.devices} groupByRoom={groupDevicesByRoom} />
              </>
            )}
            {tab === "cables" && (
              <>
                <div className="flex justify-end mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={groupCablesByPath}
                      onChange={(e) => setGroupCablesByPath(e.target.checked)}
                      className="accent-blue-600"
                    />
                    Group by Path
                  </label>
                </div>
                <CablesTab summary={data.summary} adapters={data.adapters} groupByPath={groupCablesByPath} />
              </>
            )}
          </div>
        </div>
      </div>

      {showPreview && (
        <ReportPreviewDialog
          reportKey={REPORT_LAYOUT_KEY}
          defaultLayout={defaultLayout}
          titleBlock={titleBlock}
          getTableData={(layout) => getPackListTableData(data, layout)}
          onClose={() => setShowPreview(false)}
          filename={`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Pack List.pdf`}
        />
      )}
    </>
  );
}

export default memo(PackListDialog);

// ─── Table styling ───

const thClass =
  "text-left text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-1.5 px-2 border-b border-[var(--color-border)]";
const tdClass = "py-1 px-2 text-xs text-[var(--color-text)]";
const rowClass = (i: number) =>
  i % 2 === 1 ? "bg-[var(--color-surface)]" : "";

function RoomHeader({ room }: { room: string }) {
  return (
    <tr>
      <td
        colSpan={99}
        className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--color-border)]"
      >
        {room}
      </td>
    </tr>
  );
}

// ─── Tabs ───

function DeviceRows({ devices, keyPrefix }: { devices: PackListDevice[]; keyPrefix?: string }) {
  let rowIdx = 0;
  return (
    <>
      {devices.map((d, di) => (
        <>
          <tr key={`${keyPrefix ?? ""}d-${di}`} className={rowClass(rowIdx++)}>
            <td className={tdClass}>{d.count}×</td>
            <td className={tdClass}>
              {d.model}
              {d.cards.length > 0 && <span className="text-[9px] text-[var(--color-text-muted)] ml-1">*</span>}
            </td>
            <td className={tdClass}>{deviceTypeDisplay(d.deviceType)}</td>
          </tr>
          {d.cards.map((c, ci) => (
            <tr key={`${keyPrefix ?? ""}d-${di}-c-${ci}`} className="bg-[var(--color-surface)]">
              <td className={`${tdClass} pl-6 text-[var(--color-text-muted)]`}>{c.count}×</td>
              <td className={`${tdClass} text-[var(--color-text-muted)]`}>
                <span className="pl-3">{c.cardLabel}</span>
                {c.manufacturer && (
                  <span className="text-[10px] opacity-60 ml-1">{c.manufacturer} {c.modelNumber}</span>
                )}
              </td>
              <td className={tdClass} />
            </tr>
          ))}
        </>
      ))}
    </>
  );
}

function DevicesTab({
  devices,
  groupByRoom,
}: {
  devices: PackListDevice[];
  groupByRoom: boolean;
}) {
  if (devices.length === 0) {
    return <Empty>No devices in this schematic.</Empty>;
  }

  if (groupByRoom) {
    const groups = groupBy(devices, (d) => d.room);
    return (
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={thClass}>Qty</th>
            <th className={thClass}>Device</th>
            <th className={thClass}>Type</th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([room, rows]) => (
            <>
              <RoomHeader key={`h-${room}`} room={room} />
              <DeviceRows devices={rows} keyPrefix={`${room}-`} />
            </>
          ))}
        </tbody>
      </table>
    );
  }

  const merged = mergeDevicesByModel(devices);
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={thClass}>Qty</th>
          <th className={thClass}>Device</th>
          <th className={thClass}>Type</th>
        </tr>
      </thead>
      <tbody>
        <DeviceRows devices={merged} />
      </tbody>
    </table>
  );
}

function CablesTab({
  summary,
  adapters,
  groupByPath,
}: {
  summary: PackListSummaryRow[];
  adapters: PackListAdapter[];
  groupByPath: boolean;
}) {
  if (summary.length === 0 && adapters.length === 0) {
    return <Empty>No connections in this schematic.</Empty>;
  }

  const adapterRows = adapters.length > 0 && (
    <>
      <tr>
        <td
          colSpan={99}
          className="pt-3 pb-1 px-2 text-xs font-semibold text-[var(--color-text-heading)] border-b border-[var(--color-border)]"
        >
          Adapters ({adapters.reduce((sum, a) => sum + a.count, 0)})
        </td>
      </tr>
      {adapters.map((a, i) => (
        <tr key={`adapter-${i}`} className={rowClass(i)}>
          <td className={tdClass}>{a.count}×</td>
          <td className={tdClass}>{a.model}</td>
          <td className={tdClass}></td>
        </tr>
      ))}
    </>
  );

  if (groupByPath) {
    const groups = groupBy(summary, (s) => routeRoomKey(s.route));

    return (
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={thClass}>Qty</th>
            <th className={thClass}>Cable Type</th>
            <th className={thClass}>Signal</th>
            <th className={thClass}>Route</th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([room, rows]) => (
            <>
              <RoomHeader key={`h-${room}`} room={room} />
              {rows.map((s, i) => (
                <tr key={`${room}-${i}`} className={rowClass(i)}>
                  <td className={tdClass}>{s.count}×</td>
                  <td className={tdClass}>{s.cableType}</td>
                  <td className={tdClass}>{s.signalType}</td>
                  <td className={tdClass}>{s.route}</td>
                </tr>
              ))}
            </>
          ))}
          {adapterRows}
        </tbody>
      </table>
    );
  }

  const merged = mergeCablesByType(summary);
  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={thClass}>Qty</th>
            <th className={thClass}>Cable Type</th>
            <th className={thClass}>Signal</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((s, i) => (
            <tr key={i} className={rowClass(i)}>
              <td className={tdClass}>{s.count}×</td>
              <td className={tdClass}>{s.cableType}</td>
              <td className={tdClass}>{s.signalType}</td>
            </tr>
          ))}
          {adapterRows}
        </tbody>
      </table>
    </>
  );
}

// ─── Helpers ───

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
      {children}
    </div>
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}
