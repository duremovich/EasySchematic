// Shared constants + helper for placing stub-label nodes. Used by:
//   - convertEdgeToStubs (store.ts) for newly stubbed connections
//   - migrateStubsToNodes (migrations.ts) for legacy schematics with no stub-end coords
//   - onNodeDrag/onNodeDragStop (App.tsx) to center-snap the box on the 20px grid
//   - StubLabelNode.tsx re-exports the constants for cohesion

import { GRID_SIZE } from "./gridConstants";
import type { SchematicNode, ConnectionEdge } from "./types";
import type { HandleSnapshot } from "./routing/handleSnapshot";

export const STUB_GAP = 64;       // gap between device port and the stub box edge facing it
                                  // (large enough for a midpoint cable-ID badge to fit between)
export const STUB_W_EST = 80;     // estimated box width before React Flow has measured the DOM
export const STUB_H_EST = 14;     // estimated box height (9px line-height + 1.5×2 padding + 1×2 border)

/**
 * Snap a stub box top so its connecting HANDLE (vertical center of the box) lands on the
 * nearest grid line. The box is 14px tall with the handle at top+7, so a grid-aligned box
 * TOP puts the handle 7px off-grid — the source of the ~7px endpoint jogs (the paired
 * device port is on-grid in the layout model). Used by the routing-harness normalize,
 * where mock ports ARE the model. The app heals against the REAL port instead (below) —
 * DOM-measured ports can sit a few px off the model grid, and grid-snapping a stub whose
 * port is off-grid breaks colinearity (visible kink at the label).
 */
export function snapStubHandleY(top: number, height: number = STUB_H_EST): number {
  const half = height / 2;
  return Math.round((top + half) / GRID_SIZE) * GRID_SIZE - half;
}

/**
 * Align every stub-label's connecting handle with its partner device port's TRUE
 * (DOM-measured) row. Only sub-grid drift is corrected (0.75px ≤ |dy| < half a cell):
 * smaller is already colinear, larger is a deliberate user offset. Returns the corrected
 * nodes array, or null when nothing needed fixing. Idempotent — corrected stubs measure
 * within the dead-band on the next pass.
 */
export function healStubPortAlignment(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  handles: HandleSnapshot,
): SchematicNode[] | null {
  const stubIds = new Set(nodes.filter((n) => n.type === "stub-label").map((n) => n.id));
  if (stubIds.size === 0) return null;

  const fixes = new Map<string, number>(); // stub node id → absolute dy to apply
  for (const e of edges) {
    const srcIsStub = stubIds.has(e.source);
    const tgtIsStub = stubIds.has(e.target);
    if (srcIsStub === tgtIsStub) continue; // not a stub leg
    const stubId = srcIsStub ? e.source : e.target;
    if (fixes.has(stubId)) continue;
    const devId = srcIsStub ? e.target : e.source;
    const devHandleId = (srcIsStub ? e.targetHandle : e.sourceHandle) ?? "";
    const stubSnap = handles[stubId];
    const devSnap = handles[devId];
    if (!stubSnap || !devSnap) continue;
    // Same bare↔directional healing the router's resolveHandle does.
    const all = [...devSnap.source, ...devSnap.target];
    const dh =
      all.find((h) => h.id === devHandleId) ??
      all.find((h) => h.id === `${devHandleId}-out`) ??
      all.find((h) => h.id === `${devHandleId}-in`) ??
      (devHandleId.endsWith("-in") || devHandleId.endsWith("-out")
        ? all.find((h) => h.id === devHandleId.replace(/-(in|out)$/, ""))
        : undefined);
    if (!dh) continue;
    const portY = devSnap.positionAbsolute.y + dh.y + dh.height / 2;
    const stubHandleY = stubSnap.positionAbsolute.y + (stubSnap.measuredHeight ?? STUB_H_EST) / 2;
    const dy = portY - stubHandleY;
    if (Math.abs(dy) >= 0.75 && Math.abs(dy) < GRID_SIZE / 2) fixes.set(stubId, dy);
  }
  if (fixes.size === 0) return null;

  return nodes.map((n) => {
    const dy = fixes.get(n.id);
    if (dy === undefined) return n;
    return { ...n, position: { x: n.position.x, y: Math.round(n.position.y + dy) } };
  });
}

/**
 * Place the stub box so the BOX EDGE facing the device is `STUB_GAP` from the
 * device port, and the box CENTER aligns with the port's Y. Returns the absolute
 * top-left position plus which side ("l"|"r") of the box is the connecting handle.
 */
export function defaultStubPlacement(
  handlePos: { x: number; y: number },
  portSide: "left" | "right",
): { pos: { x: number; y: number }; handle: "l" | "r" } {
  if (portSide === "right") {
    // Stub sits to the right of device; connecting handle is on the stub's LEFT side.
    return {
      pos: { x: handlePos.x + STUB_GAP, y: handlePos.y - STUB_H_EST / 2 },
      handle: "l",
    };
  }
  // Stub sits to the left of device; connecting handle is on the stub's RIGHT side.
  return {
    pos: { x: handlePos.x - STUB_GAP - STUB_W_EST, y: handlePos.y - STUB_H_EST / 2 },
    handle: "r",
  };
}
