import type { SchematicNode } from "./types";

export type AlignOperation =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "middle-v"
  | "bottom"
  | "distribute-h"
  | "distribute-v";

const DEFAULT_W = 180;
const DEFAULT_H = 60;

function w(n: SchematicNode) {
  return n.measured?.width ?? DEFAULT_W;
}
function h(n: SchematicNode) {
  return n.measured?.height ?? DEFAULT_H;
}

/** Returns a map of nodeId → new position for nodes that moved. */
export function computeAlignment(
  nodes: SchematicNode[],
  op: AlignOperation,
): Map<string, { x: number; y: number }> {
  if (nodes.length < 2) return new Map();
  if ((op === "distribute-h" || op === "distribute-v") && nodes.length < 3)
    return new Map();

  const updates = new Map<string, { x: number; y: number }>();

  switch (op) {
    case "left": {
      const minX = Math.min(...nodes.map((n) => n.position.x));
      for (const n of nodes) {
        if (n.position.x !== minX)
          updates.set(n.id, { x: minX, y: n.position.y });
      }
      break;
    }
    case "center-h": {
      const minX = Math.min(...nodes.map((n) => n.position.x));
      const maxX = Math.max(...nodes.map((n) => n.position.x + w(n)));
      const centerX = (minX + maxX) / 2;
      for (const n of nodes) {
        const nx = centerX - w(n) / 2;
        if (n.position.x !== nx)
          updates.set(n.id, { x: nx, y: n.position.y });
      }
      break;
    }
    case "right": {
      const maxX = Math.max(...nodes.map((n) => n.position.x + w(n)));
      for (const n of nodes) {
        const nx = maxX - w(n);
        if (n.position.x !== nx)
          updates.set(n.id, { x: nx, y: n.position.y });
      }
      break;
    }
    case "top": {
      const minY = Math.min(...nodes.map((n) => n.position.y));
      for (const n of nodes) {
        if (n.position.y !== minY)
          updates.set(n.id, { x: n.position.x, y: minY });
      }
      break;
    }
    case "middle-v": {
      const minY = Math.min(...nodes.map((n) => n.position.y));
      const maxY = Math.max(...nodes.map((n) => n.position.y + h(n)));
      const centerY = (minY + maxY) / 2;
      for (const n of nodes) {
        const ny = centerY - h(n) / 2;
        if (n.position.y !== ny)
          updates.set(n.id, { x: n.position.x, y: ny });
      }
      break;
    }
    case "bottom": {
      const maxY = Math.max(...nodes.map((n) => n.position.y + h(n)));
      for (const n of nodes) {
        const ny = maxY - h(n);
        if (n.position.y !== ny)
          updates.set(n.id, { x: n.position.x, y: ny });
      }
      break;
    }
    case "distribute-h": {
      const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
      const totalWidth = sorted.reduce((sum, n) => sum + w(n), 0);
      const minX = sorted[0].position.x;
      const maxRight = sorted[sorted.length - 1].position.x + w(sorted[sorted.length - 1]);
      const gap = (maxRight - minX - totalWidth) / (sorted.length - 1);
      let x = minX;
      for (const n of sorted) {
        if (n.position.x !== x)
          updates.set(n.id, { x, y: n.position.y });
        x += w(n) + gap;
      }
      break;
    }
    case "distribute-v": {
      const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
      const totalHeight = sorted.reduce((sum, n) => sum + h(n), 0);
      const minY = sorted[0].position.y;
      const maxBottom = sorted[sorted.length - 1].position.y + h(sorted[sorted.length - 1]);
      const gap = (maxBottom - minY - totalHeight) / (sorted.length - 1);
      let y = minY;
      for (const n of sorted) {
        if (n.position.y !== y)
          updates.set(n.id, { x: n.position.x, y });
        y += h(n) + gap;
      }
      break;
    }
  }

  return updates;
}
