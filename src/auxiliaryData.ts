import type { AuxRow, DeviceData, Port } from "./types";
import { effectiveThermalBtuh } from "./thermal";
import { GRID_SIZE } from "./gridConstants";
import { deviceTypeDisplay } from "./typeRegistry";

export interface AuxResolveContext {
  /** Number of connected port handles — only known at render time in DeviceNode. */
  connectedCount?: number;
  /** ISO 4217 currency code for formatting cost fields. Defaults to "USD". */
  currency?: string;
}

export interface AuxField {
  token: string;
  label: string;
  group: string;
  resolve: (device: DeviceData, ctx: AuxResolveContext) => string;
}

const str = (v: unknown): string => (v == null || v === "" ? "" : String(v));

/** Pretty-print a kebab-case device type: "network-switch" → "Network Switch".
 *  Matches the old hardcoded canvas rendering (`replace(/-/g, " ")` + CSS `capitalize`). */
const prettyDeviceType = (v: unknown): string => {
  const s = str(v);
  if (!s) return "";
  // A community / user type has a real label (and a user type's id is never shown).
  const label = deviceTypeDisplay(s);
  if (label !== s) return label;
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const fmtW = (v: unknown): string => (typeof v === "number" ? `${v.toLocaleString()} W` : "");
const fmtBtuh = (v: unknown, derived = false): string =>
  typeof v === "number" ? `${derived ? "~" : ""}${v.toLocaleString()} BTU/h` : "";
const fmtMm = (v: unknown): string => (typeof v === "number" ? `${v.toLocaleString()} mm` : "");
const fmtKg = (v: unknown): string => (typeof v === "number" ? `${v.toLocaleString()} kg` : "");
export const formatCurrency = (v: unknown, currency = "USD"): string =>
  typeof v === "number"
    ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v)
    : "";

export const AUX_FIELDS: AuxField[] = [
  // Identity
  { token: "label", label: "Device Name", group: "Identity", resolve: (d) => str(d.label) },
  { token: "hostname", label: "Hostname", group: "Identity", resolve: (d) => str(d.hostname) },
  { token: "manufacturer", label: "Manufacturer", group: "Identity", resolve: (d) => str(d.manufacturer) },
  { token: "modelNumber", label: "Model Number", group: "Identity", resolve: (d) => str(d.modelNumber) },
  { token: "deviceType", label: "Device Type", group: "Identity", resolve: (d) => prettyDeviceType(d.deviceType) },

  // Power
  { token: "powerDrawW", label: "Power Draw", group: "Power", resolve: (d) => fmtW(d.powerDrawW) },
  { token: "powerCapacityW", label: "Power Capacity", group: "Power", resolve: (d) => fmtW(d.powerCapacityW) },
  { token: "poeBudgetW", label: "PoE Budget", group: "Power", resolve: (d) => fmtW(d.poeBudgetW) },
  { token: "voltage", label: "Voltage", group: "Power", resolve: (d) => str(d.voltage) },
  {
    token: "thermalBtuh",
    label: "Thermal (BTU/h)",
    group: "Power",
    resolve: (d) => {
      const t = effectiveThermalBtuh(d);
      return t ? fmtBtuh(t.value, t.isDerived) : "";
    },
  },

  // Physical
  { token: "weightKg", label: "Weight", group: "Physical", resolve: (d) => fmtKg(d.weightKg) },
  { token: "widthMm", label: "Width", group: "Physical", resolve: (d) => fmtMm(d.widthMm) },
  { token: "heightMm", label: "Height", group: "Physical", resolve: (d) => fmtMm(d.heightMm) },
  { token: "depthMm", label: "Depth", group: "Physical", resolve: (d) => fmtMm(d.depthMm) },

  // Cost
  { token: "unitCost", label: "Unit Cost", group: "Cost", resolve: (d, ctx) => formatCurrency(d.unitCost, ctx?.currency) },

  // Ports (derived)
  {
    token: "totalPorts",
    label: "Total Ports",
    group: "Ports",
    resolve: (d) => String(d.ports?.length ?? 0),
  },
  {
    token: "inputPorts",
    label: "Input Ports",
    group: "Ports",
    resolve: (d) => String((d.ports ?? []).filter((p: Port) => p.direction === "input").length),
  },
  {
    token: "outputPorts",
    label: "Output Ports",
    group: "Ports",
    resolve: (d) => String((d.ports ?? []).filter((p: Port) => p.direction === "output").length),
  },
  {
    token: "bidirectionalPorts",
    label: "Bidirectional Ports",
    group: "Ports",
    resolve: (d) => String((d.ports ?? []).filter((p: Port) => p.direction === "bidirectional").length),
  },
  {
    token: "connectedPorts",
    label: "Connected Ports",
    group: "Ports",
    resolve: (_d, ctx) => (ctx.connectedCount == null ? "" : String(ctx.connectedCount)),
  },
];

const FIELD_BY_TOKEN: Record<string, AuxField> = AUX_FIELDS.reduce(
  (acc, f) => {
    acc[f.token] = f;
    return acc;
  },
  {} as Record<string, AuxField>,
);

/** Groups in stable display order. */
export const AUX_FIELD_GROUPS: { group: string; fields: AuxField[] }[] = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, AuxField[]>();
  for (const f of AUX_FIELDS) {
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      order.push(f.group);
    }
    byGroup.get(f.group)!.push(f);
  }
  return order.map((group) => ({ group, fields: byGroup.get(group)! }));
})();

const TOKEN_RE = /\{\{(\w+)\}\}/g;

/** The slot a row belongs to — defaults to "footer" when a row omits its position. */
export function rowPosition(row: AuxRow): "header" | "footer" {
  return row.position ?? "footer";
}

/**
 * Coerce any historical aux-data shape (v26 `string[]`, partially-migrated rows,
 * AuxRow[]) into a clean `AuxRow[]`. Lets us survive stale localStorage payloads and
 * pre-v27 imports without crashing the renderer.
 */
export function normalizeAuxRows(raw: unknown): AuxRow[] {
  if (!Array.isArray(raw)) return [];
  const out: AuxRow[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({ text: entry, position: "footer" });
    } else if (entry && typeof entry === "object" && "text" in entry) {
      const r = entry as { text: unknown; position?: unknown };
      out.push({
        text: typeof r.text === "string" ? r.text : "",
        position: r.position === "header" ? "header" : "footer",
      });
    }
  }
  return out;
}

/**
 * Drop rows where `text` is blank/whitespace AND no subsequent row in the same slot
 * contains content — i.e. trailing blank separators within each slot are removed while
 * interior blanks stay (they render as visual gaps).
 */
export function trimTrailingEmpty(rows: AuxRow[]): AuxRow[] {
  if (rows.length === 0) return rows;
  // Walk backwards per slot, mark last-non-blank index per slot, then keep anything
  // up to and including that index. Rows past the last-non-blank (in their slot) are dropped.
  const lastIdx: Record<"header" | "footer", number> = { header: -1, footer: -1 };
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].text.trim()) lastIdx[rowPosition(rows[i])] = i;
  }
  const keep: AuxRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const slot = rowPosition(rows[i]);
    if (i <= lastIdx[slot]) keep.push(rows[i]);
  }
  return keep.length === rows.length ? rows : keep;
}

/** Height in px of a single aux row — non-blank rows are 12px, blanks are 6px gaps. */
export function auxRowHeight(row: AuxRow): number {
  return row.text.trim() ? 12 : 6;
}

/** Height (in px) of the footer aux block — border-top (1) + Σ row heights, rounded up
 *  to the next GRID-multiple so device bottom stays grid-aligned. 0 when no footer rows.
 *  Header rows live in a different band (see `headerBandHeight`). */
export function auxBlockHeight(rows: unknown): number {
  const trimmed = trimTrailingEmpty(normalizeAuxRows(rows)).filter((r) => rowPosition(r) === "footer");
  if (trimmed.length === 0) return 0;
  const raw = 1 + trimmed.reduce((sum, r) => sum + auxRowHeight(r), 0);
  return Math.ceil(raw / GRID_SIZE) * GRID_SIZE;
}

/** Pixel height of the header "name + aux" band. Minimum 32 (bare name strip when no
 *  header aux rows). When aux rows are present the label zone + content is padded
 *  up to the next GRID-multiple, keeping the first port on the 16-px pathfinding grid.
 *
 *  `labelZone` defaults to HEADER_LABEL_ZONE_PX (16, single-line). Pass HEADER_LABEL_ZONE_2_PX
 *  (32, two-line) for wrapped device labels. */
export function headerBandHeight(rows: unknown, labelZone: number = HEADER_LABEL_ZONE_PX): number {
  const trimmed = trimTrailingEmpty(normalizeAuxRows(rows)).filter((r) => rowPosition(r) === "header");
  const content = labelZone + trimmed.reduce((sum, r) => sum + auxRowHeight(r), 0);
  return Math.max(HEADER_BAND_MIN_PX, Math.ceil(content / GRID_SIZE) * GRID_SIZE);
}

/** Label zone height inside the header band — label text centers vertically here. */
export const HEADER_LABEL_ZONE_PX = 16;
/** Two-line label zone height for wrapped device labels (2 lines × 14px leading + 4px slack). */
export const HEADER_LABEL_ZONE_2_PX = 32;
/** Minimum header band height (the bare name strip; 2 grid rows). */
export const HEADER_BAND_MIN_PX = 32;

/** Extra vertical space (vs the default 40-px name strip) contributed by aux rows + a
 *  possibly-wrapped device label — used by `estimateDeviceHeight`, which already accounts
 *  for the base 40 in its `60 + ports×20` baseline. Footer block height is additive as before. */
export function totalAuxHeight(rows: unknown, labelZone: number = HEADER_LABEL_ZONE_PX): number {
  const headerExtra = headerBandHeight(rows, labelZone) - HEADER_BAND_MIN_PX;
  return headerExtra + auxBlockHeight(rows);
}

/** Rows belonging to a given slot, with trailing blanks trimmed. Accepts any legacy shape. */
export function rowsInSlot(rows: unknown, slot: "header" | "footer"): AuxRow[] {
  return trimTrailingEmpty(normalizeAuxRows(rows)).filter((r) => rowPosition(r) === slot);
}

/**
 * Resolve `{{token}}` placeholders in an aux line against device data.
 * Unknown tokens are left as literal text so typos are visible.
 * Undefined/empty values resolve to an empty string.
 */
export function resolveAuxiliaryLine(
  line: string,
  device: DeviceData,
  ctx: AuxResolveContext = {},
): string {
  if (!line || line.indexOf("{{") === -1) return line;
  return line.replace(TOKEN_RE, (match, token: string) => {
    const field = FIELD_BY_TOKEN[token];
    if (!field) return match;
    return field.resolve(device, ctx);
  });
}
