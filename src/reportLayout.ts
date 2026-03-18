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

export interface ReportTableDef {
  id: string;
  label: string;
  columns: ReportColumnDef[];
  groupBy: string | null;
  groupByOptions: { key: string; label: string }[];
  sortBy: string | null;
  sortDir: "asc" | "desc";
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
          { key: "deviceLabel", header: "Device",  widthMm: 40, visible: true },
          { key: "portLabel",   header: "Port",    widthMm: 30, visible: true },
          { key: "room",        header: "Room",    widthMm: 30, visible: true },
          { key: "signalType",  header: "Signal",  widthMm: 25, visible: true },
          { key: "ip",          header: "IP",      widthMm: 32, visible: true },
          { key: "subnetMask",  header: "Subnet",  widthMm: 32, visible: true },
          { key: "gateway",     header: "Gateway", widthMm: 32, visible: true },
          { key: "vlan",        header: "VLAN",    widthMm: 16, visible: true },
          { key: "dhcp",        header: "DHCP",    widthMm: 14, visible: true },
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
          { key: "deviceType", header: "Type", widthMm: 40, visible: true },
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
      {
        id: "cables",
        label: "Cables",
        columns: [
          { key: "count", header: "Qty", widthMm: 12, visible: true },
          { key: "cableType", header: "Cable Type", widthMm: 30, visible: true },
          { key: "signalType", header: "Signal", widthMm: 28, visible: true },
          { key: "cableLength", header: "Length", widthMm: 18, visible: true },
          { key: "route", header: "Route", widthMm: 52, visible: true },
        ],
        groupBy: null,
        groupByOptions: [
          { key: "", label: "None" },
          { key: "path", label: "Path" },
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

// ─── Helpers ───

export function getVisibleColumns(table: ReportTableDef): ReportColumnDef[] {
  return table.columns.filter((c) => c.visible);
}

// Re-export titleBlockLayout helpers for convenience
export { tbGetFieldValue as getFieldValue, tbGetFieldLabel as getFieldLabel };

