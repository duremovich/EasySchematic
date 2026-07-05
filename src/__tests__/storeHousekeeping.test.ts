import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import type { DeviceTemplate, DeviceData, Port } from "../types";

// A card template resolved by processTemplateSlots via getTemplateById(defaultCardId). Mock the
// lookup (not the library data) so the slotted-device test doesn't depend on the community fallback.
const { CARD_TEMPLATE } = vi.hoisted(() => ({
  CARD_TEMPLATE: {
    id: "test-slot-card",
    deviceType: "misc",
    label: "Test Card",
    ports: [
      { id: "cp1", label: "CP1", signalType: "custom", direction: "input" },
      { id: "cp2", label: "CP2", signalType: "custom", direction: "output" },
    ],
  } as DeviceTemplate,
}));

vi.mock("../templateApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../templateApi")>();
  return {
    ...actual,
    getTemplateById: (id: string, extra: DeviceTemplate[] = []) =>
      id === CARD_TEMPLATE.id ? CARD_TEMPLATE : actual.getTemplateById(id, extra),
  };
});

// The store calls saveToLocalStorage() / reads a couple of prefs on creation. Vitest runs in the
// node environment where localStorage is absent, so install a minimal in-memory stub before the
// store module is imported.
function installLocalStorageStub() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  });
}

let useSchematicStore: typeof import("../store").useSchematicStore;

beforeAll(async () => {
  installLocalStorageStub();
  ({ useSchematicStore } = await import("../store"));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  useSchematicStore.getState().newSchematic();
});

function port(id: string, direction: Port["direction"] = "input"): Port {
  return { id, label: id, signalType: "custom" as Port["signalType"], direction };
}

function template(id: string, ports: Port[]): DeviceTemplate {
  return { id, deviceType: "misc", label: id, ports };
}

describe("store housekeeping", () => {
  // Fix A — clonePorts must not produce colliding port IDs when two devices are cloned in the same
  // millisecond (the multi-device paste scenario). Date.now() is frozen so both addDevice() calls
  // share a timestamp; only the monotonic counter differentiates them. Without the fix both devices
  // get identical IDs and this fails.
  it("gives unique port IDs when two devices are added in the same millisecond", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const tpl = template("dev-a", [port("in"), port("out", "output")]);
      useSchematicStore.getState().addDevice(tpl, { x: 0, y: 0 });
      useSchematicStore.getState().addDevice(tpl, { x: 200, y: 0 });
    } finally {
      now.mockRestore();
    }
    const devices = useSchematicStore.getState().nodes.filter((n) => n.type === "device");
    expect(devices.length).toBe(2);
    const ids = devices.flatMap((n) => (n.data as DeviceData).ports.map((p) => p.id));
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Fix A (card ports) — cloneCardPorts must not collide either. Its slotId is template-local, so
  // two copies of the same slotted template added in one frozen millisecond would mint identical
  // card-port IDs without the shared counter. The 6 IDs below (2 devices × [1 host + 2 card ports])
  // must all be unique.
  it("gives unique port IDs for card ports when two slotted devices are added in the same millisecond", () => {
    const slotted: DeviceTemplate = {
      id: "test-chassis",
      deviceType: "misc",
      label: "Test Chassis",
      ports: [port("host-in")],
      slots: [{ id: "slotA", label: "Slot A", slotFamily: "test-fam", defaultCardId: "test-slot-card" }],
    };
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      useSchematicStore.getState().addDevice(slotted, { x: 0, y: 0 });
      useSchematicStore.getState().addDevice(slotted, { x: 300, y: 0 });
    } finally {
      now.mockRestore();
    }
    const devices = useSchematicStore.getState().nodes.filter((n) => n.type === "device");
    expect(devices.length).toBe(2);
    const ids = devices.flatMap((n) => (n.data as DeviceData).ports.map((p) => p.id));
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Fix B — newSchematic must reset wrapDeviceLabels to false (matching the initial state and every
  // load path), not the stray `true`.
  it("newSchematic resets wrapDeviceLabels to false", () => {
    useSchematicStore.setState({ wrapDeviceLabels: true });
    useSchematicStore.getState().newSchematic();
    expect(useSchematicStore.getState().wrapDeviceLabels).toBe(false);
  });

  // Fix C — addOwnedGear must accumulate into a NEW item object, never mutate the live state object
  // in place (immutable-update contract).
  it("addOwnedGear accumulates without mutating the previous state object", () => {
    useSchematicStore.setState({ ownedGear: [] });
    const tpl = template("gear-1", [port("in")]);

    useSchematicStore.getState().addOwnedGear(tpl, 2);
    const before = useSchematicStore.getState().ownedGear;
    const beforeItem = before[0];
    expect(beforeItem.quantity).toBe(2);

    useSchematicStore.getState().addOwnedGear(tpl, 3);
    const after = useSchematicStore.getState().ownedGear;

    // Old references are untouched...
    expect(beforeItem.quantity).toBe(2);
    expect(after).not.toBe(before);
    expect(after[0]).not.toBe(beforeItem);
    // ...and the new state carries the accumulated quantity in a single entry.
    expect(after.length).toBe(1);
    expect(after[0].quantity).toBe(5);
  });

  it("addOwnedGear bumps only the first row when duplicates share a template key", () => {
    // Load/import paths take `ownedGear` verbatim (`data.ownedGear ?? []`), so a hand-edited or
    // imported file can carry two rows with the same key. The immutable rewrite must keep the
    // original find()-based semantics and touch only the first of them, not both.
    const tpl = template("gear-dup", [port("in")]);
    useSchematicStore.setState({
      ownedGear: [
        { template: tpl, quantity: 1 },
        { template: tpl, quantity: 1 },
      ],
    });

    useSchematicStore.getState().addOwnedGear(tpl, 4);
    const after = useSchematicStore.getState().ownedGear;

    expect(after.length).toBe(2);
    expect(after[0].quantity).toBe(5);
    expect(after[1].quantity).toBe(1);
  });
});
