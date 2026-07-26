import type {
  DeviceData,
  Port,
  ConnectorType,
  RackData,
  RackDevicePlacement,
  RackAccessory,
  RackDepthConflict,
} from "./types";

/** Millimeters per standard rack unit */
export const MM_PER_U = 44.45;

/** Convert millimeters to rack units (rounded to nearest whole U) */
export const mmToU = (mm: number): number => Math.round(mm / MM_PER_U);

/**
 * Minimal device shape needed to reason about rack sizing. Satisfied by both
 * placed devices (DeviceData) and library entries (DeviceTemplate), so rack
 * math can be shared between the schematic app and the devices site.
 */
export type RackSizable = Pick<DeviceData, "heightMm" | "widthMm" | "rackForm" | "deviceType" | "ports">;

/**
 * Get or infer a rack height in U for a device.
 * If heightMm is set, converts to U. Otherwise uses port count / device type heuristics.
 */
export function inferRackHeightU(data: RackSizable): number {
  if (data.heightMm) return Math.max(1, mmToU(data.heightMm));

  const portCount = data.ports?.length ?? 0;
  const dt = data.deviceType?.toLowerCase() ?? "";

  // Known multi-U device types
  if (dt.includes("matrix") || dt.includes("router")) return portCount > 32 ? 4 : portCount > 16 ? 3 : 2;
  if (dt.includes("mixing-console") || dt.includes("mixer")) return 3;
  if (dt.includes("amplifier") || dt.includes("amp")) return 2;
  if (dt.includes("power-distribution") || dt.includes("pdu")) return 1;
  if (dt.includes("media-server") || dt.includes("server")) return 2;
  if (dt.includes("network-switch")) return portCount > 24 ? 2 : 1;
  if (dt.includes("patch-panel")) return 1;

  // General heuristic: 1U for small devices, 2U for medium, up to 4U
  if (portCount <= 8) return 1;
  if (portCount <= 20) return 2;
  if (portCount <= 40) return 3;
  return 4;
}

/**
 * Classification of how a device mounts in a 19" rack.
 * - `full`: standard 19" rack-mount (panel ~482mm, height in whole U)
 * - `half`: 9.5" half-rack panel (~217–244mm wide, height in whole U)
 * - `shelf-only`: too small / non-standard for direct rack-mount; sits on a shelf
 * - `oversize`: too wide to fit on any shelf in a 19" rack — can't be racked at all
 * - `unknown`: missing dimensions; preserve historical behavior (allow direct placement)
 */
export type RackForm = "full" | "half" | "shelf-only" | "oversize" | "unknown";

/**
 * Infer how a device should mount in a rack, from its physical dimensions.
 * Honors an explicit `device.rackForm` override before applying the heuristic.
 */
export function inferRackForm(device: RackSizable): RackForm {
  if (device.rackForm) return device.rackForm;

  const w = device.widthMm;
  const h = device.heightMm;

  if (w == null && h == null) return "unknown";

  let fitsU = false;
  if (h != null) {
    const u = h / MM_PER_U;
    const nearest = Math.round(u);
    fitsU = Math.abs(u - nearest) < 0.15 && nearest >= 1 && nearest <= 12;
  }

  // Standard 19" rack-mount: panel width 440–510mm covers ~17.3"–20.1" with rack-ear tolerance
  if (fitsU && w != null && w >= 440 && w <= 510) return "full";

  // Half-rack: ~9.5" panel
  if (fitsU && w != null && w >= 200 && w <= 260) return "half";

  // Inner shelf width — anything wider than the rack interior can't sit on a shelf either
  const innerWMm = shelfInnerWidthMm();
  if (w != null && w > innerWMm + 1) return "oversize";

  // Has a width that fits on a shelf but isn't a rack-mount panel profile
  if (w != null) return "shelf-only";

  // Has heightMm but no widthMm — can't say
  return "unknown";
}

/**
 * Display label for a rack-mountable device's occupied height in rack units
 * (e.g. "2U"), or null when the device isn't a 19"/half-rack unit and so has no
 * meaningful U height. Derives U with the same math the rack builder uses
 * (`inferRackHeightU`), so a device's specs never disagree with how tall it
 * renders in the rack view.
 */
export function rackUnitLabel(device: RackSizable): string | null {
  const form = inferRackForm(device);
  if (form !== "full" && form !== "half") return null;
  return `${inferRackHeightU(device)}U`;
}

/** Pixels per rack unit at zoom=1 */
export const PX_PER_U = 24;

/** Standard rack width in pixels */
export const RACK_WIDTH_PX = 260;

/** Rail width — device inset from rack edges */
export const RAIL_WIDTH_PX = 8;

/** Pixels per millimeter at rack scale (1U = 44.45mm) */
export const PX_PER_MM = PX_PER_U / 44.45;

/** Full-width device width in rack view */
export const DEVICE_WIDTH_PX = RACK_WIDTH_PX - 2 * RAIL_WIDTH_PX;

// ── Auto-layout for connector face-plates ──────────────────────────

export interface LayoutPort {
  id: string;
  label: string;
  connectorType?: ConnectorType;
  signalType: string;
  direction: string;
  section?: string;
  /** Percentage position (0-100) on the face-plate */
  x: number;
  y: number;
}

/**
 * Generate a default face-plate layout for a device's ports.
 *
 * Groups ports by section, arranges them in rows left-to-right.
 * Inputs tend toward the left, outputs toward the right.
 * Power connectors go to the far right.
 */
export function autoLayoutPorts(ports: Port[], _faceWidth: number, _faceHeight: number): LayoutPort[] {
  if (ports.length === 0) return [];

  // Separate power ports — they go to the right edge
  const isPower = (p: Port) => p.signalType.startsWith("power");
  const signalPorts = ports.filter((p) => !isPower(p));
  const powerPorts = ports.filter(isPower);

  // Group signal ports by section
  const sections = new Map<string, Port[]>();
  for (const p of signalPorts) {
    const key = p.section ?? "_default";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(p);
  }

  const result: LayoutPort[] = [];

  // Calculate available width (leave right margin for power if needed)
  const powerMargin = powerPorts.length > 0 ? 15 : 0; // percentage
  const usableWidth = 100 - powerMargin;

  // Lay out each section as a row
  const sectionKeys = [...sections.keys()];
  const totalSections = sectionKeys.length;
  const rowHeight = 100 / (totalSections + 1); // +1 for top/bottom padding

  sectionKeys.forEach((sectionKey, sectionIdx) => {
    const sectionPorts = sections.get(sectionKey)!;
    const cy = rowHeight * (sectionIdx + 1); // center Y of this row
    const portCount = sectionPorts.length;
    const spacing = usableWidth / (portCount + 1);

    sectionPorts.forEach((p, portIdx) => {
      result.push({
        id: p.id,
        label: p.label,
        connectorType: p.connectorType,
        signalType: p.signalType,
        direction: p.direction,
        section: p.section,
        x: spacing * (portIdx + 1),
        y: cy,
      });
    });
  });

  // Lay out power ports in a column on the right
  if (powerPorts.length > 0) {
    const powerSpacing = 100 / (powerPorts.length + 1);
    powerPorts.forEach((p, i) => {
      result.push({
        id: p.id,
        label: p.label,
        connectorType: p.connectorType,
        signalType: p.signalType,
        direction: p.direction,
        section: p.section,
        x: 100 - powerMargin / 2,
        y: powerSpacing * (i + 1),
      });
    });
  }

  return result;
}

// ── Depth collision detection ──────────────────────────────────────

/**
 * Find front + rear placement pairs whose summed depth exceeds the rack's
 * internal depth at overlapping U positions. Conflicts are flagged on a
 * pairwise basis (the smallest unit a UI can show).
 *
 * Skipped:
 *  - 2-post racks (no rear face → impossible)
 *  - Pairs where either device is shelf-mounted (the shelf claims the U slot)
 *  - Pairs where either device is missing depthMm — the renderer falls back to
 *    rack.depthMm * 0.6 there, but we don't want that fallback creating false
 *    positives. The caller may surface "N devices have unknown depth" instead.
 */
export function getRackDepthConflicts(
  rack: RackData,
  placements: RackDevicePlacement[],
  deviceDataMap: Map<string, DeviceData>,
): RackDepthConflict[] {
  if (rack.rackType === "open-2post") return [];

  const onRack = placements.filter((p) => p.rackId === rack.id && !p.mountedOnShelfId);
  const front = onRack.filter((p) => p.face === "front");
  const rear = onRack.filter((p) => p.face === "rear");
  if (front.length === 0 || rear.length === 0) return [];

  const conflicts: RackDepthConflict[] = [];
  for (const a of front) {
    const ad = deviceDataMap.get(a.deviceNodeId);
    if (!ad || ad.depthMm == null) continue;
    const aHeightU = inferRackHeightU(ad);
    const aBottom = a.uPosition;
    const aTop = a.uPosition + aHeightU - 1;
    for (const b of rear) {
      const bd = deviceDataMap.get(b.deviceNodeId);
      if (!bd || bd.depthMm == null) continue;
      const bHeightU = inferRackHeightU(bd);
      const bBottom = b.uPosition;
      const bTop = b.uPosition + bHeightU - 1;
      const overlapStart = Math.max(aBottom, bBottom);
      const overlapEnd = Math.min(aTop, bTop);
      if (overlapStart > overlapEnd) continue;
      const overhang = ad.depthMm + bd.depthMm - rack.depthMm;
      if (overhang <= 0) continue;
      conflicts.push({
        aId: a.id,
        bId: b.id,
        uOverlapStart: overlapStart,
        uOverlapEnd: overlapEnd,
        depthOverhangMm: overhang,
      });
    }
  }
  return conflicts;
}

/** Front (or rear) devices that are individually deeper than the rack itself.
 *  These don't show up in the conflict checker (which needs a front+rear *pair*),
 *  but they're still a real problem — the device pokes out the back of the rack. */
export function getOversizedDevices(
  rack: RackData,
  placements: RackDevicePlacement[],
  deviceDataMap: Map<string, DeviceData>,
): { placementId: string; depthMm: number; overhangMm: number }[] {
  const out: { placementId: string; depthMm: number; overhangMm: number }[] = [];
  for (const p of placements) {
    if (p.rackId !== rack.id || p.mountedOnShelfId) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd || dd.depthMm == null) continue;
    if (dd.depthMm > rack.depthMm) {
      out.push({ placementId: p.id, depthMm: dd.depthMm, overhangMm: dd.depthMm - rack.depthMm });
    }
  }
  return out;
}

/** Devices on a rack that are missing the depthMm field used by the conflict checker. */
export function countUnknownDepthDevices(
  rack: RackData,
  placements: RackDevicePlacement[],
  deviceDataMap: Map<string, DeviceData>,
): number {
  let n = 0;
  for (const p of placements) {
    if (p.rackId !== rack.id || p.mountedOnShelfId) continue;
    const dd = deviceDataMap.get(p.deviceNodeId);
    if (!dd) continue;
    if (dd.depthMm == null) n++;
  }
  return n;
}

// ── Shelf-mounted devices ──────────────────────────────────────────

/** Effective shelf depth — falls back to ~60% of rack depth when unset. */
export function shelfDepthMm(shelf: RackAccessory, rack: RackData): number {
  return shelf.shelfDepthMm ?? rack.depthMm * 0.6;
}

/** Devices currently sitting on a given shelf, sorted by id (stable). */
export function getShelfOccupants(
  shelfId: string,
  placements: RackDevicePlacement[],
): RackDevicePlacement[] {
  return placements
    .filter((p) => p.mountedOnShelfId === shelfId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Inner usable shelf width in mm (rack inner width). */
export function shelfInnerWidthMm(): number {
  return DEVICE_WIDTH_PX / PX_PER_MM;
}

/**
 * Can a new device fit on this shelf? Depth-only gate — width is not capped here
 * because auto-placement walks upward to a second row when the bottom row fills,
 * and per-drag overlap is enforced by isShelfOffsetValid.
 */
export function canFitOnShelf(
  shelf: RackAccessory,
  _occupants: RackDevicePlacement[],
  newDevice: DeviceData,
  rack: RackData,
  _deviceDataMap: Map<string, DeviceData>,
): boolean {
  if (newDevice.depthMm != null && newDevice.depthMm > shelfDepthMm(shelf, rack) + 0.5) return false;
  return true;
}

/** Effective on-shelf footprint for a placement (in mm). Accounts for rotation. */
export function shelfFootprintMm(
  placement: RackDevicePlacement,
  device: DeviceData,
): { wMm: number; hMm: number } {
  const wMm = placement.rotated ? (device.heightMm ?? 44.45) : (device.widthMm ?? shelfInnerWidthMm());
  const hMm = placement.rotated ? (device.widthMm ?? shelfInnerWidthMm()) : (device.heightMm ?? 44.45);
  return { wMm, hMm };
}

/**
 * Is a candidate (x, y, w, h) shelf placement valid?
 * Constraints: stays within shelf inner width horizontally; doesn't overlap any
 * other occupant on the same shelf. Vertical overflow above the shelf row is
 * allowed (devices can stack and poke up).
 */
export function isShelfOffsetValid(
  shelf: RackAccessory,
  occupants: RackDevicePlacement[],
  excludePlacementId: string,
  candidate: { xMm: number; yMm: number; wMm: number; hMm: number },
  deviceDataMap: Map<string, DeviceData>,
): boolean {
  const innerW = shelfInnerWidthMm();
  if (candidate.xMm < -0.5) return false;
  if (candidate.xMm + candidate.wMm > innerW + 0.5) return false;
  if (candidate.yMm < -0.5) return false;
  for (const occ of occupants) {
    if (occ.id === excludePlacementId) continue;
    if (occ.mountedOnShelfId !== shelf.id) continue;
    const dd = deviceDataMap.get(occ.deviceNodeId);
    if (!dd) continue;
    const { wMm: ow, hMm: oh } = shelfFootprintMm(occ, dd);
    const ox = occ.shelfOffsetMm?.x ?? 0;
    const oy = occ.shelfOffsetMm?.y ?? 0;
    // AABB overlap (with a tiny epsilon so touching edges aren't flagged)
    const eps = 0.01;
    const overlapsX = candidate.xMm + candidate.wMm > ox + eps && ox + ow > candidate.xMm + eps;
    const overlapsY = candidate.yMm + candidate.hMm > oy + eps && oy + oh > candidate.yMm + eps;
    if (overlapsX && overlapsY) return false;
  }
  return true;
}

export interface ShelfSnapGuides {
  /** mm from left rail — draw vertical guide at this x */
  xMm?: number;
  /** mm above shelf surface — draw horizontal guide at this y */
  yMm?: number;
}

/**
 * Compute snapped shelf offset + active guide positions.
 * Snaps to: shelf walls, left/right edges of other devices (align or butt), tops of other
 * devices (stacking), and the shelf floor (y=0).
 */
export function computeShelfSnaps(
  shelf: RackAccessory,
  occupants: RackDevicePlacement[],
  excludePlacementId: string,
  rawOffset: { x: number; y: number },
  dims: { wMm: number },
  deviceDataMap: Map<string, DeviceData>,
  snapThresholdMm = 3,
): { offset: { x: number; y: number }; guides: ShelfSnapGuides } {
  const innerW = shelfInnerWidthMm();
  const { wMm } = dims;

  // [snap_target, guide_line_position] pairs
  const xSnaps: [number, number][] = [
    [0, 0],                       // flush left wall
    [innerW - wMm, innerW],       // flush right wall (right edge)
  ];
  const ySnaps: [number, number][] = [
    [0, 0],                       // floor
  ];

  for (const occ of occupants) {
    if (occ.id === excludePlacementId) continue;
    if (occ.mountedOnShelfId !== shelf.id) continue;
    const dd = deviceDataMap.get(occ.deviceNodeId);
    if (!dd) continue;
    const { wMm: ow, hMm: oh } = shelfFootprintMm(occ, dd);
    const ox = occ.shelfOffsetMm?.x ?? 0;
    const oy = occ.shelfOffsetMm?.y ?? 0;
    xSnaps.push(
      [ox, ox],                   // align left edges
      [ox + ow, ox + ow],         // butt against their right edge
      [ox - wMm, ox],             // butt against their left edge
      [ox + ow - wMm, ox + ow],   // align right edges
    );
    ySnaps.push(
      [oy + oh, oy + oh],         // stack: sit on top
      [oy, oy],                   // align floors
    );
  }

  let snappedX = rawOffset.x;
  let guideXMm: number | undefined;
  let bestX = snapThresholdMm;
  for (const [target, guide] of xSnaps) {
    const d = Math.abs(rawOffset.x - target);
    if (d < bestX) { bestX = d; snappedX = target; guideXMm = guide; }
  }

  let snappedY = rawOffset.y;
  let guideYMm: number | undefined;
  let bestY = snapThresholdMm;
  for (const [target, guide] of ySnaps) {
    const d = Math.abs(rawOffset.y - target);
    if (d < bestY) { bestY = d; snappedY = target; guideYMm = guide; }
  }

  return { offset: { x: snappedX, y: snappedY }, guides: { xMm: guideXMm, yMm: guideYMm } };
}

/**
 * Gravity-snap: returns the y (mm above shelf surface) at which the candidate
 * device should rest — 0 if the column is clear, or directly on top of the
 * tallest overlapping occupant.
 */
export function gravitySnapShelfY(
  shelf: RackAccessory,
  occupants: RackDevicePlacement[],
  excludePlacementId: string,
  candidate: { xMm: number; wMm: number },
  deviceDataMap: Map<string, DeviceData>,
): number {
  let stackTopY = 0;
  const eps = 0.01;
  for (const occ of occupants) {
    if (occ.id === excludePlacementId) continue;
    if (occ.mountedOnShelfId !== shelf.id) continue;
    const dd = deviceDataMap.get(occ.deviceNodeId);
    if (!dd) continue;
    const { wMm: ow, hMm: oh } = shelfFootprintMm(occ, dd);
    const ox = occ.shelfOffsetMm?.x ?? 0;
    const oy = occ.shelfOffsetMm?.y ?? 0;
    const overlapsX = candidate.xMm + candidate.wMm > ox + eps && ox + ow > candidate.xMm + eps;
    if (overlapsX) stackTopY = Math.max(stackTopY, oy + oh);
  }
  return stackTopY;
}
