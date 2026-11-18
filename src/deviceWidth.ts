/**
 * Canvas device width — THE one width rule (#418):
 *
 *     width = data.fitWidth ? fitted-to-labels : 144
 *
 * DeviceNode renders it, and the pre-measurement estimates (snapUtils), the DXF
 * export fallback and the headless routing harness all call the same function, so
 * the router's view of a device can never disagree with what's drawn.
 *
 * Unflagged devices (everything saved before the flag existed) stay exactly 144 px,
 * so opening an old file never reflows it. New devices are stamped through
 * `stampNewDevice` (the single helper every creation path uses).
 *
 * The fit is sized from every port the device itself shows by default: per-device
 * `hiddenPorts` are respected, but connection state and global view toggles ("hide
 * unconnected ports", hidden pin signal types) are NOT — so a device doesn't change
 * width, dragging its right-side connections with it, as ports get connected.
 *
 * DeviceNode renders every port row as two equal `flex-1` halves (inputs left,
 * outputs right), so a long label on EITHER side needs the whole box to widen;
 * the room a label gets is half the inner width less its `pl-3`/`pr-3` inset.
 * Bidirectional and passthrough rows span the full width instead. Each rule
 * below mirrors one row type's real DOM box — keep them in lockstep with
 * DeviceNode.tsx.
 *
 * Deterministic on purpose (see textWidth.ts): the same width has to come out in
 * the browser, under vitest and in the plain-Node routing harness.
 *
 * Labels that fit the standard box stay at 144; past that the width steps up in
 * whole grid cells, so right-side handles stay on the 16-px grid. Past
 * DEVICE_MAX_WIDTH_PX labels truncate with an ellipsis (full text in the hover title).
 */

import type { DeviceData, Port } from "./types";
import { portSide } from "./types";
import { estimateTextWidthPx } from "./textWidth";
import { GRID_SIZE } from "./gridConstants";

/** The standard device width, and the minimum for a fitted one — 9 grid cells. */
export const DEVICE_MIN_WIDTH_PX = 144;
/** Widest a device grows to fit its labels — 20 grid cells. Beyond this a label
 *  truncates rather than turning the device into a banner. */
export const DEVICE_MAX_WIDTH_PX = 320;

/** 1-px left + right border on the device box. */
const BORDER_X = 2;
/** `pl-3` / `pr-3` on a column port row (the handle is absolutely positioned). */
const PORT_INSET = 12;
/** Column section header: `pl-2` (or `pr-2`) on the row + `mr-1` (or `ml-1`) on the label. */
const COLUMN_SECTION_INSET = 12;
/** Passthrough label: `px-3` on both sides. */
const PASSTHROUGH_INSET = 24;
/** Full-width section header (bidir / passthrough blocks): `mx-1` on both sides. */
const WIDE_SECTION_INSET = 8;
/** Port labels are `text-[10px]`, section headers `text-[9px]`. */
const PORT_FONT_PX = 10;
const SECTION_FONT_PX = 9;
/** A couple of percent of slack for kerning and sub-pixel rounding — the same margin
 *  displayName.ts uses for the header label — applied only once a device actually
 *  needs to grow. A device whose labels fit the standard box by the raw estimate stays
 *  at 144 (the slack never pushes a fitting device a cell wider). */
const FIT_TOLERANCE = 0.98;

/** Display-ready label text for each row type DeviceNode renders. */
export interface DeviceLabelColumns {
  /** Port labels in the left (input-side) column. */
  leftPorts: readonly string[];
  /** Port labels in the right (output-side) column. */
  rightPorts: readonly string[];
  /** Section header names in the left column (incl. a patch panel's "Rear"). */
  leftSections?: readonly string[];
  /** Section header names in the right column (incl. a patch panel's "Front"). */
  rightSections?: readonly string[];
  /** Bidirectional port labels, WITHOUT the "↔ " prefix. */
  bidirPorts?: readonly string[];
  /** Passthrough port labels, WITHOUT the "⇔ " prefix. */
  passthroughPorts?: readonly string[];
  /** Section headers inside the bidirectional / passthrough blocks. */
  wideSections?: readonly string[];
}

function widest(labels: readonly string[] | undefined, fontPx: number, scale: number, prefix = ""): number {
  let max = 0;
  for (const l of labels ?? []) {
    if (!l) continue;
    max = Math.max(max, estimateTextWidthPx(prefix + l, fontPx) * scale);
  }
  return max;
}

/** Unsnapped box width the labels need, with every label width multiplied by `scale`. */
function neededWidth(c: DeviceLabelColumns, scale: number): number {
  // Column rows: each side gets (W - border) / 2, less its inset.
  const columnLabel = Math.max(
    widest(c.leftPorts, PORT_FONT_PX, scale) + PORT_INSET,
    widest(c.rightPorts, PORT_FONT_PX, scale) + PORT_INSET,
    widest(c.leftSections, SECTION_FONT_PX, scale) + COLUMN_SECTION_INSET,
    widest(c.rightSections, SECTION_FONT_PX, scale) + COLUMN_SECTION_INSET,
  );
  return Math.max(
    2 * columnLabel + BORDER_X,
    // Bidirectional rows: the centered label spans the full inner width.
    widest(c.bidirPorts, PORT_FONT_PX, scale, "↔ ") + BORDER_X,
    widest(c.passthroughPorts, PORT_FONT_PX, scale, "⇔ ") + PASSTHROUGH_INSET + BORDER_X,
    widest(c.wideSections, SECTION_FONT_PX, scale) + WIDE_SECTION_INSET + BORDER_X,
  );
}

/** Device box width (px) that fits every label — a 16-multiple in
 *  [DEVICE_MIN_WIDTH_PX, DEVICE_MAX_WIDTH_PX]. */
export function deviceWidthForLabels(c: DeviceLabelColumns): number {
  // Labels that fit the standard box as estimated stay standard — no slack-only growth.
  if (neededWidth(c, 1) <= DEVICE_MIN_WIDTH_PX) return DEVICE_MIN_WIDTH_PX;
  const snapped = Math.ceil(neededWidth(c, 1 / FIT_TOLERANCE) / GRID_SIZE) * GRID_SIZE;
  return Math.min(DEVICE_MAX_WIDTH_PX, Math.max(DEVICE_MIN_WIDTH_PX, snapped));
}

function sectionNames(ports: Port[]): string[] {
  const names: string[] = [];
  let last: string | undefined;
  for (const p of ports) {
    if (p.section && p.section !== last) names.push(p.section);
    last = p.section;
  }
  return names;
}

const asTyped = (s: string) => s;

/**
 * The width a device renders at — the single rule shared by DeviceNode, snapUtils,
 * the DXF export and the routing harness: 144 unless the device is flagged `fitWidth`,
 * then fitted to every port it shows by default (per-device hides respected; connection
 * state and global view toggles deliberately not, see the module comment).
 *
 * `display` is the label-case transform (DeviceNode passes its `displayLabel`); callers
 * without one get labels as typed. React Flow's measured width equals this once the
 * device has rendered.
 */
export function estimateDeviceWidth(
  data: DeviceData,
  display: (s: string) => string = asTyped,
): number {
  if (!data.fitWidth) return DEVICE_MIN_WIDTH_PX;
  const all = data.ports ?? [];
  const hidden = !data.showAllPorts && data.hiddenPorts?.length ? new Set(data.hiddenPorts) : null;
  const visible = hidden ? all.filter((p) => !hidden.has(p.id)) : all;

  const left: Port[] = [];
  const right: Port[] = [];
  const bidir: Port[] = [];
  const passthrough: Port[] = [];
  for (const p of visible) {
    if (p.direction === "passthrough") passthrough.push(p);
    else if (p.direction === "bidirectional") bidir.push(p);
    else if (portSide(p) === "left") left.push(p);
    else right.push(p);
  }

  const isPatchPanel = data.deviceType === "patch-panel";
  const leftSections = sectionNames(left);
  const rightSections = sectionNames(right);
  if (isPatchPanel && left.length > 0) leftSections.unshift("Rear");
  if (isPatchPanel && right.length > 0) rightSections.unshift("Front");

  const labels = (ports: Port[]) => ports.map((p) => display(p.label));
  return deviceWidthForLabels({
    leftPorts: labels(left),
    rightPorts: labels(right),
    leftSections: leftSections.map(display),
    rightSections: rightSections.map(display),
    bidirPorts: labels(bidir),
    passthroughPorts: labels(passthrough),
    wideSections: [...sectionNames(bidir), ...sectionNames(passthrough)].map(display),
  });
}

/**
 * Mark freshly created device data as fit-width (#418). Every path that creates a NEW
 * device — store.addDevice (library drag, Quick Add, Create New Device, MCP add,
 * off-canvas patch panels), store.insertAdapterBetween, and the CSV / cable-schedule
 * import — builds its data through this, so none can forget. Loading, pasting,
 * duplicating and swapping existing devices must NOT call it: they keep whatever the
 * source device had.
 */
export function stampNewDevice<T extends DeviceData>(data: T): T {
  return { ...data, fitWidth: true };
}
