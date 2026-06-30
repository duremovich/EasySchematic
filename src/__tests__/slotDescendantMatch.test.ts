/**
 * Regression tests for the slot descendant-match in `swapCard` and `removeSlot`.
 *
 * Both actions remove a slot's card together with the cards/ports of its DESCENDANT
 * slots. Descendants were matched with a raw `parentSlotId.startsWith(slotId)`, which
 * also matched a sibling whose id merely shares the prefix (e.g. "p1" vs "p10", or
 * nested "p1/sub" vs "p10/sub") — wrongly dropping that sibling's card, ports and
 * edges. The match now compares whole path segments (`=== slotId` or `slotId + "/"`).
 *
 * The store reads editor preferences from localStorage at import time, so we install a
 * minimal in-memory localStorage and import the store dynamically afterwards.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { DeviceData, InstalledSlot, SchematicNode } from "../types";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

let useSchematicStore: typeof import("../store")["useSchematicStore"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
});

/** A chassis whose slots include the prefix-colliding pair p1 / p10, where p10 holds a
 *  card with a nested sub-slot "p10/sub" carrying its own card + port. */
function chassisWithSiblings(): SchematicNode {
  return {
    id: "chassis-1",
    type: "device",
    position: { x: 0, y: 0 },
    data: {
      label: "chassis-1",
      deviceType: "chassis",
      ports: [
        { id: "port-p1", label: "P1 card", direction: "input", signalType: "hdmi" },
        { id: "port-y", label: "Y", direction: "input", signalType: "hdmi" },
      ],
      slots: [
        { slotId: "p1", label: "P1", slotFamily: "fam-a", cardTemplateId: "card-p1", cardLabel: "P1 card", portIds: ["port-p1"] },
        { slotId: "p10", label: "P10", slotFamily: "fam-a", cardTemplateId: "card-x", cardLabel: "X", portIds: [] },
        { slotId: "p10/sub", label: "Sub", slotFamily: "fam-b", parentSlotId: "p10", cardTemplateId: "card-y", cardLabel: "Y", portIds: ["port-y"] },
      ] as InstalledSlot[],
    } as DeviceData,
  } as SchematicNode;
}

function slotsOf(nodeId: string): InstalledSlot[] {
  const node = useSchematicStore.getState().nodes.find((n) => n.id === nodeId)!;
  return (node.data as DeviceData).slots ?? [];
}
function portIds(nodeId: string): string[] {
  const node = useSchematicStore.getState().nodes.find((n) => n.id === nodeId)!;
  return (node.data as DeviceData).ports.map((p) => p.id);
}

describe("slot descendant-match is segment-safe (swapCard / removeSlot)", () => {
  it("swapCard on p1 does not sweep sibling p10's nested slot (id prefix collision)", () => {
    useSchematicStore.setState({ nodes: [chassisWithSiblings()], edges: [] });
    // Remove p1's own card. p10/sub (parentSlotId "p10") must NOT be treated as a
    // descendant of p1 just because "p10".startsWith("p1").
    useSchematicStore.getState().swapCard("chassis-1", "p1", null);
    const slots = slotsOf("chassis-1");
    expect(slots.find((s) => s.slotId === "p1")!.cardTemplateId).toBeUndefined(); // p1 cleared
    expect(portIds("chassis-1")).not.toContain("port-p1"); // p1's card port removed
    expect(slots.some((s) => s.slotId === "p10/sub")).toBe(true); // sibling's nested slot intact
    expect(slots.find((s) => s.slotId === "p10/sub")!.cardTemplateId).toBe("card-y");
    expect(portIds("chassis-1")).toContain("port-y"); // sibling's nested card port intact
  });

  it("removeSlot on p1 leaves sibling p10's nested slot and port intact", () => {
    useSchematicStore.setState({ nodes: [chassisWithSiblings()], edges: [] });
    useSchematicStore.getState().removeSlot("chassis-1", "p1");
    const slots = slotsOf("chassis-1");
    expect(slots.some((s) => s.slotId === "p1")).toBe(false); // p1 removed
    expect(slots.find((s) => s.slotId === "p10/sub")!.cardTemplateId).toBe("card-y"); // sibling intact
    expect(portIds("chassis-1")).toContain("port-y");
  });

  it("still sweeps REAL descendants: removing a parent removes its direct child AND a deeper grandchild", () => {
    // p10 (parent) -> p10/sub (direct child, parentSlotId "p10") -> p10/sub/leaf
    // (grandchild, parentSlotId "p10/sub"). Removing p10 must remove both — covering both
    // arms of the predicate (`=== slotId` for the direct child, `slotId + "/"` for the deeper one).
    useSchematicStore.setState({
      nodes: [
        {
          id: "chassis-1",
          type: "device",
          position: { x: 0, y: 0 },
          data: {
            label: "chassis-1",
            deviceType: "chassis",
            ports: [
              { id: "port-sub", label: "Sub", direction: "input", signalType: "hdmi" },
              { id: "port-leaf", label: "Leaf", direction: "input", signalType: "hdmi" },
            ],
            slots: [
              { slotId: "p10", label: "P10", slotFamily: "fam-a", cardTemplateId: "card-x", cardLabel: "X", portIds: [] },
              { slotId: "p10/sub", label: "Sub", slotFamily: "fam-b", parentSlotId: "p10", cardTemplateId: "card-s", cardLabel: "S", portIds: ["port-sub"] },
              { slotId: "p10/sub/leaf", label: "Leaf", slotFamily: "fam-c", parentSlotId: "p10/sub", cardTemplateId: "card-l", cardLabel: "L", portIds: ["port-leaf"] },
            ] as InstalledSlot[],
          } as DeviceData,
        } as SchematicNode,
      ],
      edges: [],
    });
    useSchematicStore.getState().removeSlot("chassis-1", "p10");
    const slots = slotsOf("chassis-1");
    expect(slots.some((s) => s.slotId === "p10")).toBe(false);
    expect(slots.some((s) => s.slotId === "p10/sub")).toBe(false); // direct child swept
    expect(slots.some((s) => s.slotId === "p10/sub/leaf")).toBe(false); // deeper descendant swept
    expect(portIds("chassis-1")).not.toContain("port-sub");
    expect(portIds("chassis-1")).not.toContain("port-leaf");
  });
});
