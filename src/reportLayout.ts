import type { TitleBlockLayout, TitleBlockCell } from "./types";
import { nextCellId, normalizeSizes } from "./titleBlockLayout";
import { getFieldValue as tbGetFieldValue, getFieldLabel as tbGetFieldLabel } from "./titleBlockLayout";

// ─── Types ───

export interface ReportColumnDef {
  key: string;
  header: string;
  widthMm: number;
  visible: boolean;
}

export type TableBorderStyle = "none" | "horizontal" | "grid" | "outer";

export interface ReportTableDef {
  id: string;
  label: string;
  columns: ReportColumnDef[];
  groupBy: string | null;
  groupByOptions: { key: string; label: string }[];
  sortBy: string | null;
  sortDir: "asc" | "desc";
  borderStyle?: TableBorderStyle;
}

export type PaperSize = "letter" | "legal" | "a4" | "tabloid";

export interface ReportLayout {
  headerLayout: TitleBlockLayout;
  headerHeightMm: number;
  footerLayout: TitleBlockLayout;
  footerHeightMm: number;
  tables: ReportTableDef[];
  orientation: "landscape" | "portrait";
  paperSize: PaperSize;
  useGlobalHeader?: boolean;
  useGlobalFooter?: boolean;
}

// ─── Paper Sizes ───

const PAPER_DIMENSIONS: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  letter: { widthMm: 215.9, heightMm: 279.4 },
  legal: { widthMm: 215.9, heightMm: 355.6 },
  a4: { widthMm: 210, heightMm: 297 },
  tabloid: { widthMm: 279.4, heightMm: 431.8 },
};

export const PAPER_LABELS: Record<PaperSize, string> = {
  letter: "Letter",
  legal: "Legal",
  a4: "A4",
  tabloid: "Tabloid",
};

export function getPageDimensions(
  paperSize: PaperSize,
  orientation: "landscape" | "portrait",
): { widthMm: number; heightMm: number } {
  const { widthMm, heightMm } = PAPER_DIMENSIONS[paperSize];
  return orientation === "landscape"
    ? { widthMm: heightMm, heightMm: widthMm }
    : { widthMm, heightMm };
}

export const REPORT_MARGIN_MM = 14;

// ─── Layout Cell Helper ───

function layoutCell(
  row: number,
  col: number,
  content: TitleBlockCell["content"],
  opts: Partial<Pick<TitleBlockCell, "colSpan" | "rowSpan" | "fontSize" | "fontWeight" | "fontFamily" | "align" | "color">> = {},
): TitleBlockCell {
  return {
    id: nextCellId(),
    row,
    col,
    rowSpan: opts.rowSpan ?? 1,
    colSpan: opts.colSpan ?? 1,
    content,
    fontSize: opts.fontSize ?? 7,
    fontWeight: opts.fontWeight ?? "normal",
    fontFamily: opts.fontFamily ?? "sans-serif",
    align: opts.align ?? "left",
    color: opts.color ?? "#1e293b",
  };
}

// ─── Default Header ───

export function createDefaultPackListHeaderLayout(): TitleBlockLayout {
  return {
    columns: normalizeSizes([0.6, 0.4]),
    rows: normalizeSizes([0.55, 0.45]),
    widthIn: 8,
    heightIn: 0.8,
    cells: [
      layoutCell(0, 0, { type: "static", text: "Pack List" }, { fontSize: 14, fontWeight: "bold" }),
      layoutCell(0, 1, { type: "logo" }, { align: "right" }),
      layoutCell(1, 0, { type: "field", field: "showName" }, { fontSize: 8 }),
      layoutCell(1, 1, { type: "field", field: "date" }, { fontSize: 8, align: "right", color: "#666666" }),
    ],
  };
}

// ─── Default Footer ───

export function createDefaultPackListFooterLayout(): TitleBlockLayout {
  return {
    columns: normalizeSizes([0.6, 0.4]),
    rows: [1],
    widthIn: 8,
    heightIn: 0.3,
    cells: [
      layoutCell(0, 0, { type: "static", text: "" }, { fontSize: 7, color: "#888888" }),
      layoutCell(0, 1, { type: "pageNumber" }, { fontSize: 7, align: "right", color: "#888888" }),
    ],
  };
}

// ─── Network Report Defaults ───

export function createDefaultNetworkReportHeaderLayout(): TitleBlockLayout {
  return {
    columns: normalizeSizes([0.6, 0.4]),
    rows: normalizeSizes([0.55, 0.45]),
    widthIn: 8,
    heightIn: 0.8,
    cells: [
      layoutCell(0, 0, { type: "static", text: "Network Report" }, { fontSize: 14, fontWeight: "bold" }),
      layoutCell(0, 1, { type: "logo" }, { align: "right" }),
      layoutCell(1, 0, { type: "field", field: "showName" }, { fontSize: 8 }),
      layoutCell(1, 1, { type: "field", field: "date" }, { fontSize: 8, align: "right", color: "#666666" }),
    ],
  };
}

export function createDefaultNetworkReportLayout(): ReportLayout {
  return {
    headerLayout: createDefaultNetworkReportHeaderLayout(),
    headerHeightMm: 22,
    footerLayout: createDefaultPackListFooterLayout(),
    footerHeightMm: 8,
    tables: [
      {
        id: "network",
        label: "Network Addresses",
        columns: [
          { key: "deviceLabel", header: "Device",   widthMm: 36, visible: true },
          { key: "portLabel",   header: "Port",     widthMm: 26, visible: true },
          { key: "room",        header: "Room",     widthMm: 26, visible: true },
          { key: "signalType",  header: "Signal",   widthMm: 22, visible: true },
          { key: "hostname",    header: "Hostname", widthMm: 30, visible: true },
          { key: "ip",          header: "IP",       widthMm: 30, visible: true },
          { key: "subnetMask",  header: "Subnet",   widthMm: 30, visible: true },
          { key: "gateway",     header: "Gateway",  widthMm: 30, visible: true },
          { key: "vlan",        header: "VLAN",     widthMm: 14, visible: true },
          { key: "linkSpeed",   header: "Speed",    widthMm: 14, visible: false },
          { key: "poeDrawW",    header: "PoE (W)",  widthMm: 16, visible: false },
          { key: "dhcp",        header: "DHCP",     widthMm: 14, visible: true },
          { key: "notes",       header: "Notes",    widthMm: 30, visible: false },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "",           label: "None" },
          { key: "room",       label: "Room" },
          { key: "signalType", label: "Signal Type" },
        ],
        sortBy: null,
        sortDir: "asc",
      },
    ],
    orientation: "landscape",
    paperSize: "letter",
  };
}

// ─── Pack List Defaults ───

export function createDefaultPackListLayout(): ReportLayout {
  return {
    headerLayout: createDefaultPackListHeaderLayout(),
    headerHeightMm: 22,
    footerLayout: createDefaultPackListFooterLayout(),
    footerHeightMm: 8,
    tables: [
      {
        id: "devices",
        label: "Devices",
        columns: [
          { key: "count", header: "Qty", widthMm: 12, visible: true },
          { key: "model", header: "Device", widthMm: 60, visible: true },
          { key: "manufacturer", header: "Manufacturer", widthMm: 30, visible: false },
          { key: "modelNumber", header: "Model #", widthMm: 30, visible: false },
          { key: "deviceType", header: "Type", widthMm: 40, visible: true },
          { key: "room", header: "Room", widthMm: 50, visible: true },
          { key: "powerDrawW", header: "Power (W)", widthMm: 22, visible: false },
          { key: "unitCost", header: "Unit Cost", widthMm: 22, visible: false },
          { key: "extCost", header: "Ext. Cost", widthMm: 22, visible: false },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "", label: "None" },
          { key: "room", label: "Room" },
          { key: "deviceType", label: "Device Category" },
        ],
        sortBy: null,
        sortDir: "asc",
      },
      {
        id: "cables",
        label: "Cables",
        columns: [
          { key: "count", header: "Qty", widthMm: 12, visible: true },
          { key: "cableType", header: "Cable Type", widthMm: 30, visible: true },
          { key: "signalType", header: "Signal", widthMm: 28, visible: true },
          { key: "cableLength", header: "Length", widthMm: 18, visible: true },
          { key: "route", header: "Route", widthMm: 52, visible: true },
          { key: "unitCost", header: "Unit Cost", widthMm: 22, visible: false },
          { key: "extCost", header: "Ext. Cost", widthMm: 22, visible: false },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "", label: "None" },
          { key: "path", label: "Path" },
          { key: "category", label: "Category" },
        ],
        sortBy: null,
        sortDir: "asc",
      },
      {
        id: "accessories",
        label: "Cable Accessories",
        columns: [
          { key: "count", header: "Qty", widthMm: 12, visible: true },
          { key: "model", header: "Accessory", widthMm: 60, visible: true },
          { key: "accessoryType", header: "Type", widthMm: 40, visible: true },
          { key: "room", header: "Room", widthMm: 50, visible: true },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "", label: "None" },
          { key: "room", label: "Room" },
        ],
        sortBy: null,
        sortDir: "asc",
      },
    ],
    orientation: "portrait",
    paperSize: "letter",
  };
}

// ─── Cable Schedule Defaults ───

export function createDefaultCableScheduleHeaderLayout(): TitleBlockLayout {
  return {
    columns: normalizeSizes([0.6, 0.4]),
    rows: normalizeSizes([0.55, 0.45]),
    widthIn: 8,
    heightIn: 0.8,
    cells: [
      layoutCell(0, 0, { type: "static", text: "Cable Schedule" }, { fontSize: 14, fontWeight: "bold" }),
      layoutCell(0, 1, { type: "logo" }, { align: "right" }),
      layoutCell(1, 0, { type: "field", field: "showName" }, { fontSize: 8 }),
      layoutCell(1, 1, { type: "field", field: "date" }, { fontSize: 8, align: "right", color: "#666666" }),
    ],
  };
}

export function createDefaultCableScheduleLayout(): ReportLayout {
  return {
    headerLayout: createDefaultCableScheduleHeaderLayout(),
    headerHeightMm: 22,
    footerLayout: createDefaultPackListFooterLayout(),
    footerHeightMm: 8,
    tables: [
      {
        id: "cableSchedule",
        label: "Cable Schedule",
        columns: [
          { key: "cableId",         header: "Cable ID",   widthMm: 18, visible: true },
          { key: "sourceDevice",    header: "Source",      widthMm: 30, visible: true },
          { key: "sourcePort",      header: "Src Port",    widthMm: 22, visible: true },
          { key: "sourceConnector", header: "Src Conn",    widthMm: 18, visible: true },
          { key: "targetDevice",    header: "Target",      widthMm: 30, visible: true },
          { key: "targetPort",      header: "Tgt Port",    widthMm: 22, visible: true },
          { key: "targetConnector", header: "Tgt Conn",    widthMm: 18, visible: true },
          { key: "cableType",       header: "Cable Type",  widthMm: 22, visible: true },
          { key: "signalType",      header: "Signal",      widthMm: 20, visible: true },
          { key: "cableLength",     header: "Length",      widthMm: 16, visible: true },
          { key: "sourceRoom",      header: "Src Room",    widthMm: 24, visible: true },
          { key: "targetRoom",      header: "Tgt Room",    widthMm: 24, visible: true },
          { key: "multicableLabel", header: "Snake",       widthMm: 24, visible: true },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "",           label: "None" },
          { key: "sourceRoom", label: "Source Room" },
          { key: "signalType", label: "Signal Type" },
          { key: "cableType",  label: "Cable Type" },
          { key: "multicableLabel", label: "Snake" },
        ],
        sortBy: "cableId",
        sortDir: "asc",
      },
    ],
    orientation: "landscape",
    paperSize: "letter",
  };
}

// ─── Patch Panel Schedule Defaults ───

export function createDefaultPatchPanelScheduleHeaderLayout(): TitleBlockLayout {
  return {
    columns: normalizeSizes([0.6, 0.4]),
    rows: normalizeSizes([0.55, 0.45]),
    widthIn: 8,
    heightIn: 0.8,
    cells: [
      layoutCell(0, 0, { type: "static", text: "Patch Panel Schedule" }, { fontSize: 14, fontWeight: "bold" }),
      layoutCell(0, 1, { type: "logo" }, { align: "right" }),
      layoutCell(1, 0, { type: "field", field: "showName" }, { fontSize: 8 }),
      layoutCell(1, 1, { type: "field", field: "date" }, { fontSize: 8, align: "right", color: "#666666" }),
    ],
  };
}

export function createDefaultPatchPanelScheduleLayout(): ReportLayout {
  return {
    headerLayout: createDefaultPatchPanelScheduleHeaderLayout(),
    headerHeightMm: 22,
    footerLayout: createDefaultPackListFooterLayout(),
    footerHeightMm: 8,
    tables: [
      {
        id: "patchPanelSchedule",
        label: "Patch Panel Schedule",
        columns: [
          { key: "panel",           header: "Panel",         widthMm: 30, visible: true },
          { key: "panelRoom",       header: "Panel Room",    widthMm: 24, visible: true },
          { key: "face",            header: "Face",          widthMm: 14, visible: true },
          { key: "position",        header: "Position",      widthMm: 20, visible: true },
          { key: "connector",       header: "Connector",     widthMm: 18, visible: true },
          { key: "gender",          header: "M/F",           widthMm: 10, visible: true },
          { key: "remoteDevice",    header: "Remote Device", widthMm: 30, visible: true },
          { key: "remotePort",      header: "Remote Port",   widthMm: 22, visible: true },
          { key: "remoteRoom",      header: "Remote Room",   widthMm: 24, visible: true },
          { key: "cableId",         header: "Cable ID",      widthMm: 18, visible: true },
          { key: "cableType",       header: "Cable Type",    widthMm: 22, visible: true },
          { key: "signalType",      header: "Signal",        widthMm: 20, visible: true },
          { key: "cableLength",     header: "Length",        widthMm: 16, visible: true },
          { key: "multicableLabel", header: "Snake",         widthMm: 20, visible: false },
        ],
        groupBy: "panel",
        groupByOptions: [
          { key: "",           label: "None" },
          { key: "panel",      label: "Panel" },
          { key: "panelRoom",  label: "Panel Room" },
          { key: "signalType", label: "Signal Type" },
          { key: "face",       label: "Face" },
        ],
        sortBy: "position",
        sortDir: "asc",
      },
    ],
    orientation: "landscape",
    paperSize: "letter",
  };
}

// ─── Power Report Defaults ───

export function createDefaultPowerReportHeaderLayout(): TitleBlockLayout {
  return {
    columns: normalizeSizes([0.6, 0.4]),
    rows: normalizeSizes([0.55, 0.45]),
    widthIn: 8,
    heightIn: 0.8,
    cells: [
      layoutCell(0, 0, { type: "static", text: "Power Report" }, { fontSize: 14, fontWeight: "bold" }),
      layoutCell(0, 1, { type: "logo" }, { align: "right" }),
      layoutCell(1, 0, { type: "field", field: "showName" }, { fontSize: 8 }),
      layoutCell(1, 1, { type: "field", field: "date" }, { fontSize: 8, align: "right", color: "#666666" }),
    ],
  };
}

export function createDefaultPowerReportLayout(): ReportLayout {
  return {
    headerLayout: createDefaultPowerReportHeaderLayout(),
    headerHeightMm: 22,
    footerLayout: createDefaultPackListFooterLayout(),
    footerHeightMm: 8,
    tables: [
      {
        id: "powerDevices",
        label: "Device Power Draw",
        columns: [
          { key: "count", header: "Qty", widthMm: 12, visible: true },
          { key: "model", header: "Device", widthMm: 50, visible: true },
          { key: "deviceType", header: "Type", widthMm: 35, visible: true },
          { key: "room", header: "Room", widthMm: 35, visible: true },
          { key: "powerDrawW", header: "Power (W)", widthMm: 22, visible: true },
          { key: "totalPowerW", header: "Total (W)", widthMm: 22, visible: true },
          { key: "voltage", header: "Voltage", widthMm: 25, visible: true },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "", label: "None" },
          { key: "room", label: "Room" },
        ],
        sortBy: null,
        sortDir: "asc",
      },
      {
        id: "powerDistros",
        label: "Distribution Loading",
        columns: [
          { key: "label", header: "Distro", widthMm: 45, visible: true },
          { key: "room", header: "Room", widthMm: 35, visible: true },
          { key: "capacityW", header: "Capacity (W)", widthMm: 28, visible: true },
          { key: "loadW", header: "Load (W)", widthMm: 24, visible: true },
          { key: "loadPercent", header: "Load %", widthMm: 20, visible: true },
          { key: "status", header: "Status", widthMm: 20, visible: true },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "", label: "None" },
          { key: "room", label: "Room" },
        ],
        sortBy: null,
        sortDir: "asc",
      },
    ],
    orientation: "portrait",
    paperSize: "letter",
  };
}

// ─── Helpers ───

/**
 * Get visible columns, optionally scaled to fill the available page width.
 * When availableWidthMm is provided, column widths are proportionally scaled
 * so they fill the space — hiding a column lets others expand automatically.
 */
export function getVisibleColumns(table: ReportTableDef, availableWidthMm?: number, colGap = 0): ReportColumnDef[] {
  const visible = table.columns.filter((c) => c.visible);
  if (!availableWidthMm || visible.length === 0) return visible;
  const totalW = visible.reduce((s, c) => s + c.widthMm, 0);
  if (totalW <= 0) return visible;
  // Subtract inter-column gaps from available space so columns + gaps fit exactly
  const usableW = availableWidthMm - colGap * Math.max(0, visible.length - 1);
  const scale = usableW / totalW;
  if (Math.abs(scale - 1) < 0.001) return visible; // already fills
  return visible.map((c) => ({ ...c, widthMm: c.widthMm * scale }));
}

// Re-export titleBlockLayout helpers for convenience
export { tbGetFieldValue as getFieldValue, tbGetFieldLabel as getFieldLabel };

