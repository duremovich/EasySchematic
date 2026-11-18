/**
 * Pure replication of DeviceNode's port→handle layout, for the headless routing
 * harness. The app resolves handle positions from the live DOM (getHandlePositions
 * in edgeRouter.ts reads the ReactFlow instance). Here we synthesize the same
 * positions from the port list so routeAllEdges can run with no browser.
 *
 * Keep this in lockstep with src/components/DeviceNode.tsx. The geometry contract
 * (16px grid since schema v41):
 *
 *   device height = 1 (top border) + headerBand + 1 (header border-b)
 *                   + 6 (port-area pt) + rows*16 + 7 (port-area pb)
 *                   + footerBlock + 1 (bottom border)
 *                 = headerBand + rows*16 + 16 + footerBlock
 *
 *   first handle center Y = 1 + headerBand + 1 + 6 + 8 = headerBand + 16
 *   row pitch = 16px (each port row is `h-4`)
 *
 * Row order in the port area mirrors DeviceNode's render order:
 *   I/O ports (sectioned = independent L/R columns, else paired rows)
 *   → empty expansion slots → passthrough (with a Rear/Front header row)
 *   → bidirectional → (port-count row) → footer aux block.
 */

import type { DeviceData, Port } from "../types";
import { portSide } from "../types";
import {
  auxBlockHeight,
  headerBandHeight,
  HEADER_LABEL_ZONE_PX,
  HEADER_LABEL_ZONE_2_PX,
} from "../auxiliaryData";
import { resolveDeviceLabel } from "../displayName";
import { estimateDeviceWidth } from "../deviceWidth";

const ROW_H = 16;
const PORT_AREA_PT = 6;
const PORT_AREA_PB = 7;
const TOP_BORDER = 1;
const HEADER_BORDER = 1;
const BOTTOM_BORDER = 1;

export interface DeviceHandle {
  /** Handle id as referenced by edge.sourceHandle/targetHandle. */
  id: string;
  /** Node-local center X (0 = left edge, width = right edge). */
  relX: number;
  /** Node-local center Y. */
  relY: number;
}

type ColumnItem = { type: "port"; port: Port } | { type: "section"; name: string };

/** Interleave section headers where the section changes — mirrors DeviceNode.buildColumnItems. */
function buildColumnItems(ports: Port[]): ColumnItem[] {
  const items: ColumnItem[] = [];
  let lastSection: string | undefined;
  for (const port of ports) {
    if (port.section && port.section !== lastSection) {
      items.push({ type: "section", name: port.section });
    }
    items.push({ type: "port", port });
    lastSection = port.section;
  }
  return items;
}

function labelZoneFor(data: DeviceData): number {
  // Harness assumes default display settings (no global short-name/wrap overrides).
  const { wrapsInHeader } = resolveDeviceLabel(data, {});
  return wrapsInHeader ? HEADER_LABEL_ZONE_2_PX : HEADER_LABEL_ZONE_PX;
}

/** Y (node-local) of the first port row's handle center. */
export function firstHandleCenterY(data: DeviceData): number {
  const bandH = headerBandHeight(data.auxiliaryData, labelZoneFor(data));
  return TOP_BORDER + bandH + HEADER_BORDER + PORT_AREA_PT + ROW_H / 2; // = bandH + 16
}

/** Ports the device renders by default (respecting per-device hides, ignoring global toggles). */
function visiblePorts(data: DeviceData): Port[] {
  if (data.showAllPorts) return data.ports;
  const hidden = data.hiddenPorts?.length ? new Set(data.hiddenPorts) : null;
  return hidden ? data.ports.filter((p) => !hidden.has(p.id)) : data.ports;
}

interface RowLayout {
  handles: DeviceHandle[];
  /** Total port-area rows (drives device height). Excludes the optional port-count row. */
  totalRows: number;
}

function layoutRows(data: DeviceData, width: number): RowLayout {
  const leftX = 0;
  const rightX = width;
  const ports = visiblePorts(data);

  const leftPorts: Port[] = [];
  const rightPorts: Port[] = [];
  const bidir: Port[] = [];
  const passthrough: Port[] = [];
  for (const p of ports) {
    if (p.direction === "passthrough") passthrough.push(p);
    else if (p.direction === "bidirectional") bidir.push(p);
    else if (portSide(p) === "left") leftPorts.push(p);
    else rightPorts.push(p);
  }

  const isPatchPanel = data.deviceType === "patch-panel";
  let leftItems = buildColumnItems(leftPorts);
  let rightItems = buildColumnItems(rightPorts);
  if (isPatchPanel && leftPorts.length > 0) {
    leftItems = [{ type: "section", name: "Rear" }, ...leftItems];
  }
  if (isPatchPanel && rightPorts.length > 0) {
    rightItems = [{ type: "section", name: "Front" }, ...rightItems];
  }
  const hasSections =
    leftItems.some((i) => i.type === "section") ||
    rightItems.some((i) => i.type === "section");

  const first = firstHandleCenterY(data);
  const centerY = (row: number) => first + row * ROW_H;
  const handles: DeviceHandle[] = [];
  let cursor = 0;

  // ---- I/O ports ----
  if (leftPorts.length > 0 || rightPorts.length > 0) {
    if (hasSections) {
      // Independent L/R columns — each port's row is its index within its column.
      leftItems.forEach((it, k) => {
        if (it.type === "port") handles.push({ id: it.port.id, relX: leftX, relY: centerY(k) });
      });
      rightItems.forEach((it, k) => {
        if (it.type === "port") handles.push({ id: it.port.id, relX: rightX, relY: centerY(k) });
      });
      cursor = Math.max(leftItems.length, rightItems.length);
    } else {
      // Paired rows — left[i] and right[i] share row i.
      const rows = Math.max(leftPorts.length, rightPorts.length, 1);
      for (let i = 0; i < rows; i++) {
        if (leftPorts[i]) handles.push({ id: leftPorts[i].id, relX: leftX, relY: centerY(i) });
        if (rightPorts[i]) handles.push({ id: rightPorts[i].id, relX: rightX, relY: centerY(i) });
      }
      cursor = rows;
    }
  }

  // ---- Empty expansion slots (no handles) ----
  const emptySlots = (data.slots ?? []).filter((s) => !s.cardTemplateId && !s.hideWhenEmpty);
  cursor += emptySlots.length;

  // ---- Passthrough ports (one Rear/Front header row, then one row per item) ----
  if (passthrough.length > 0) {
    cursor += 1; // Rear/Front header row
    for (const it of buildColumnItems(passthrough)) {
      if (it.type === "port") {
        handles.push({ id: `${it.port.id}-rear`, relX: leftX, relY: centerY(cursor) });
        handles.push({ id: `${it.port.id}-front`, relX: rightX, relY: centerY(cursor) });
      }
      cursor += 1;
    }
  }

  // ---- Bidirectional ports (in handle left, out handle right) ----
  if (bidir.length > 0) {
    for (const it of buildColumnItems(bidir)) {
      if (it.type === "port") {
        handles.push({ id: `${it.port.id}-in`, relX: leftX, relY: centerY(cursor) });
        handles.push({ id: `${it.port.id}-out`, relX: rightX, relY: centerY(cursor) });
      }
      cursor += 1;
    }
  }

  return { handles, totalRows: cursor };
}

/** Node-local handle centers for a device node, keyed by edge handle id. */
export function computeDeviceHandles(node: {
  data: DeviceData;
  measured?: { width?: number; height?: number };
}): DeviceHandle[] {
  const width = node.measured?.width ?? estimateDeviceWidth(node.data);
  return layoutRows(node.data, width).handles;
}

/**
 * Expected rendered height of a device node, assuming default display toggles
 * (no port-count row). Used by the harness pin test to detect DeviceNode layout
 * drift: this must equal node.measured.height for a device saved with defaults.
 */
export function deviceContentHeight(node: {
  data: DeviceData;
  measured?: { width?: number; height?: number };
}): number {
  const width = node.measured?.width ?? estimateDeviceWidth(node.data);
  const { totalRows } = layoutRows(node.data, width);
  const bandH = headerBandHeight(node.data.auxiliaryData, labelZoneFor(node.data));
  const footer = auxBlockHeight(node.data.auxiliaryData);
  return (
    TOP_BORDER +
    bandH +
    HEADER_BORDER +
    PORT_AREA_PT +
    totalRows * ROW_H +
    PORT_AREA_PB +
    footer +
    BOTTOM_BORDER
  );
}
