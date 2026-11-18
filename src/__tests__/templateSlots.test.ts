/**
 * Expansion slots through the template round trip:
 *
 *  - #421 — a slot's `defaultCardId` naming one of the user's own (custom) cards pre-installs
 *    it on placement, exactly like a library card. `processTemplateSlots` looked the card up
 *    in the bundled/community library only.
 *  - #422 — Save as Template on a modular chassis whose card brought its own sub-slots, then
 *    placing that template, gives exactly one of each slot (no duplicate `parent/child` ids),
 *    the same cards in the same slots, and each port once. The template used to list nested
 *    slots as extra top-level slots (colliding with the ones the parent card re-creates) and
 *    keep the cards' ports as chassis ports (so they arrived twice).
 *
 * Also pinned: templates saved by older builds (card ports baked into the chassis ports, nested
 * slots flattened) place each slot and port once, keeping baked ports whose card is gone; a card
 * the template names that can't be found is reported in a toast; a hand-written slot id with a
 * "/" can't be mistaken for a sub-slot.
 *
 * Driven through the store's real `addDevice` / `swapCard` / `addCustomTemplate` /
 * `swapDevice` and the editor's real `buildDeviceTemplate`. The store reads preferences from
 * localStorage at import time, so an in-memory localStorage is installed first.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { DeviceData, DeviceNode, DeviceTemplate, InstalledSlot } from "../types";
import type { TemplateFormValues } from "../deviceTemplateBuild";
import { parseJsonImport } from "../import/parseJson";
import { getBundledTemplates } from "../templateApi";
import { validateTemplate } from "../../api/src/validate";

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
let buildDeviceTemplate: typeof import("../deviceTemplateBuild")["buildDeviceTemplate"];
let planDeviceSwap: typeof import("../deviceSwap")["planDeviceSwap"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  ({ useSchematicStore } = await import("../store"));
  ({ buildDeviceTemplate } = await import("../deviceTemplateBuild"));
  ({ planDeviceSwap } = await import("../deviceSwap"));
});

// ── The user's own library: an SFP+ module, a network card with two SFP+ cages (the first
//    fitted by default), and a frame whose Slot A takes that card by default. All custom —
//    none of these ids exist in the bundled or community library.

const SFP: DeviceTemplate = {
  id: "custom-1730000000001",
  deviceType: "expansion-card",
  label: "10G SFP+ Module",
  slotFamily: "test-sfp-plus",
  ports: [{ id: "tpl-0", label: "SFP+", signalType: "fiber", direction: "bidirectional", connectorType: "lc" }],
};

const NET_CARD: DeviceTemplate = {
  id: "custom-1730000000002",
  deviceType: "expansion-card",
  label: "Network I/O Card",
  slotFamily: "test-frame-io",
  ports: [
    { id: "tpl-0", label: "MGMT", signalType: "ethernet", direction: "bidirectional", connectorType: "rj45" },
    { id: "tpl-1", label: "AES In", signalType: "aes", direction: "input", connectorType: "xlr-3" },
  ],
  slots: [
    { id: "sfp1", label: "SFP 1", slotFamily: "test-sfp-plus", defaultCardId: SFP.id },
    { id: "sfp2", label: "SFP 2", slotFamily: "test-sfp-plus" },
  ],
};

const FRAME: DeviceTemplate = {
  id: "custom-1730000000003",
  deviceType: "media-server",
  label: "Modular Frame",
  ports: [
    { id: "tpl-0", label: "Ref In", signalType: "genlock", direction: "input", connectorType: "bnc" },
    { id: "tpl-1", label: "PSU", signalType: "power", direction: "input", connectorType: "iec" },
  ],
  slots: [
    { id: "slot-a", label: "Slot A", slotFamily: "test-frame-io", defaultCardId: NET_CARD.id },
    { id: "slot-b", label: "Slot B", slotFamily: "test-frame-io" },
  ],
};

function lastDevice(): DeviceNode {
  const devices = useSchematicStore.getState().nodes.filter((n) => n.type === "device");
  return devices[devices.length - 1] as DeviceNode;
}

function device(id: string): DeviceData {
  return (useSchematicStore.getState().nodes.find((n) => n.id === id) as DeviceNode).data;
}

/** slotId → installed card id (or "-" for empty), in slot order. */
function slotCards(slots: InstalledSlot[] | undefined): [string, string][] {
  return (slots ?? []).map((s) => [s.slotId, s.cardTemplateId ?? "-"]);
}

/** Port labels with their section, sorted — what the device shows, independent of minted ids. */
function portShape(d: DeviceData): string[] {
  return d.ports.map((p) => `${p.section ?? ""}|${p.label}`).sort();
}

/** The form state DeviceEditor hands `buildDeviceTemplate` for a placed device: its ports as
 *  the editor's port rows (store ids — card ports included, as the editor syncs them). */
function formFrom(d: DeviceData): TemplateFormValues {
  return {
    ports: d.ports.map((p) => ({ ...p })),
    label: d.label,
    shortName: "",
    deviceType: d.deviceType,
    color: undefined,
    headerColor: { deviceHeaderColor: undefined, edited: false, savedHeaderColor: undefined, projectDefault: undefined, appDefault: undefined },
    category: "",
    manufacturer: "",
    modelNumber: "",
    referenceUrl: "",
    hostname: "",
    powerDrawW: undefined,
    powerCapacityW: undefined,
    voltage: undefined,
    thermalBtuh: undefined,
    poeBudgetW: undefined,
    poeDrawW: undefined,
    unitCost: undefined,
    heightMm: undefined,
    widthMm: undefined,
    depthMm: undefined,
    weightKg: undefined,
    rackForm: undefined,
    isVenueProvided: false,
    auxiliaryData: [],
    searchTermsRaw: "",
    existing: d,
  };
}

beforeEach(() => {
  useSchematicStore.setState({ nodes: [], edges: [], customTemplates: [SFP, NET_CARD, FRAME] });
});

describe("custom default cards pre-install on placement (#421)", () => {
  it("installs a custom card named as a slot's defaultCardId, with its ports", () => {
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    const d = lastDevice().data;
    const slotA = d.slots!.find((s) => s.slotId === "slot-a")!;
    expect(slotA.cardTemplateId).toBe(NET_CARD.id);
    expect(slotA.cardLabel).toBe("Network I/O Card");
    expect(slotA.portIds).toHaveLength(2);
    const sectionA = d.ports.filter((p) => p.section === "Slot A").map((p) => p.label);
    expect(sectionA).toEqual(["MGMT", "AES In"]);
  });

  it("follows the custom card's own custom default into its sub-slot", () => {
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    expect(slotCards(lastDevice().data.slots)).toEqual([
      ["slot-a", NET_CARD.id],
      ["slot-a/sfp1", SFP.id],
      ["slot-a/sfp2", "-"],
      ["slot-b", "-"],
    ]);
  });

  it("swapping a custom card into an empty slot installs that card's custom sub-slot defaults too", () => {
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    const id = lastDevice().id;
    useSchematicStore.getState().swapCard(id, "slot-b", NET_CARD.id!);
    const b = device(id).slots!.filter((s) => s.slotId === "slot-b" || s.parentSlotId === "slot-b");
    expect(slotCards(b)).toEqual([
      ["slot-b", NET_CARD.id],
      ["slot-b/sfp1", SFP.id],
      ["slot-b/sfp2", "-"],
    ]);
  });
});

describe("Save as Template keeps nested slots placeable (#422)", () => {
  /** A placed frame with the default card in Slot A, plus a second module the user fitted
   *  into SFP 2 — a nested choice that differs from the card's own defaults. */
  function configuredFrame(): DeviceNode {
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    const id = lastDevice().id;
    useSchematicStore.getState().swapCard(id, "slot-a/sfp2", SFP.id!);
    return useSchematicStore.getState().nodes.find((n) => n.id === id) as DeviceNode;
  }

  function saveAsTemplate(d: DeviceData): DeviceTemplate {
    const tpl = buildDeviceTemplate(formFrom(d), { id: "custom-1730000000099" });
    useSchematicStore.getState().addCustomTemplate(tpl);
    return tpl;
  }

  it("placing the saved template gives each slot once, with the cards it was saved with", () => {
    const original = configuredFrame().data;
    const saved = saveAsTemplate(original);

    useSchematicStore.getState().addDevice(saved, { x: 400, y: 0 });
    const placed = lastDevice().data;

    const ids = placed.slots!.map((s) => s.slotId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slotCards(placed.slots)).toEqual(slotCards(original.slots));
    expect(slotCards(placed.slots)).toEqual([
      ["slot-a", NET_CARD.id],
      ["slot-a/sfp1", SFP.id],
      ["slot-a/sfp2", SFP.id],
      ["slot-b", "-"],
    ]);
  });

  it("placing the saved template gives each port once", () => {
    const original = configuredFrame().data;
    const saved = saveAsTemplate(original);
    useSchematicStore.getState().addDevice(saved, { x: 400, y: 0 });
    const placed = lastDevice().data;

    expect(placed.ports).toHaveLength(original.ports.length);
    expect(portShape(placed)).toEqual(portShape(original));
    // Every card port is owned by exactly one slot on the placed copy.
    const owned = placed.slots!.flatMap((s) => s.portIds);
    expect(new Set(owned).size).toBe(owned.length);
    expect(owned.every((pid) => placed.ports.some((p) => p.id === pid))).toBe(true);
  });

  it("the saved template's own ports are the chassis' ports, not the cards'", () => {
    const saved = saveAsTemplate(configuredFrame().data);
    expect(saved.ports.map((p) => p.label)).toEqual(["Ref In", "PSU"]);
  });

  it("marks the sub-slot entries it writes as nested overrides", () => {
    const saved = saveAsTemplate(configuredFrame().data);
    expect(saved.slots!.map((s) => [s.id, s.nestedOverride === true])).toEqual([
      ["slot-a", false],
      ["slot-a/sfp1", true],
      ["slot-a/sfp2", true],
      ["slot-b", false],
    ]);
  });

  it("a hand-written slot id with a \"/\" next to a matching slot is not swallowed as a sub-slot (JSON import)", () => {
    const { templates } = parseJsonImport(JSON.stringify({
      label: "Hand-written Frame",
      deviceType: "media-server",
      manufacturer: "Generic",
      ports: [{ label: "PSU", signalType: "power", direction: "input" }],
      slots: [
        { id: "a", label: "Slot A", slotFamily: "test-frame-io" },
        { id: "a/b", label: "Slot A/B", slotFamily: "test-frame-io" },
      ],
    }));
    const tpl = templates[0].template;
    expect(tpl.slots!.map((s) => s.id)).toEqual(["a", "a-b"]);
    useSchematicStore.getState().addDevice(tpl, { x: 0, y: 0 });
    expect(lastDevice().data.slots!.map((s) => s.slotId)).toEqual(["a", "a-b"]);
  });

  it("JSON re-import of a saved template keeps its marked sub-slot entries working", () => {
    const saved = saveAsTemplate(configuredFrame().data);
    const { templates } = parseJsonImport(JSON.stringify(saved));
    const reimported = templates[0].template;
    useSchematicStore.getState().addDevice(reimported, { x: 0, y: 0 });
    expect(slotCards(lastDevice().data.slots)).toEqual([
      ["slot-a", NET_CARD.id],
      ["slot-a/sfp1", SFP.id],
      ["slot-a/sfp2", SFP.id],
      ["slot-b", "-"],
    ]);
  });

  it("swapping a device to the saved template also gives each slot once (Swap Device)", () => {
    const saved = saveAsTemplate(configuredFrame().data);
    // A plain device to swap from.
    useSchematicStore.getState().addDevice({ id: "custom-1730000000097", deviceType: "converter", label: "Old Box", ports: [] }, { x: 0, y: 300 });
    const old = lastDevice();
    const state = useSchematicStore.getState();
    const plan = planDeviceSwap(old.data, old.id, saved, state.edges, state.customTemplates);
    useSchematicStore.getState().swapDevice(old.id, plan);
    const swapped = device(old.id);
    const ids = swapped.slots!.map((s) => s.slotId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slotCards(swapped.slots)).toEqual([
      ["slot-a", NET_CARD.id],
      ["slot-a/sfp1", SFP.id],
      ["slot-a/sfp2", SFP.id],
      ["slot-b", "-"],
    ]);
  });
});

/**
 * A user template exactly as master's `buildDeviceTemplate` (before this fix) wrote it from a
 * placed device: every editor port row — the installed cards' ports included, still sectioned
 * under their slot — renumbered onto `tpl-N`, and every installed slot, nested ones included,
 * flattened into the top-level list with its card as the default. No `nestedOverride` marker.
 */
function legacySave(d: DeviceData, id: string): DeviceTemplate {
  return {
    id,
    deviceType: d.deviceType,
    label: `${d.label} (old save)`,
    ports: d.ports
      .filter((p) => p.label.trim())
      .map((p, i) => {
        const { templatePortId: _t, ...draft } = p;
        void _t;
        return { ...draft, id: `tpl-${i}`, label: p.label.trim() };
      }),
    slots: (d.slots ?? []).map((s) => ({
      id: s.slotId,
      label: s.label,
      slotFamily: s.slotFamily ?? "",
      ...(s.cardTemplateId ? { defaultCardId: s.cardTemplateId } : {}),
    })),
  };
}

describe("templates saved by older builds (#422)", () => {
  function configured(): DeviceData {
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    const id = lastDevice().id;
    useSchematicStore.getState().swapCard(id, "slot-a/sfp2", SFP.id!);
    return device(id);
  }

  it("the realistic legacy fixture really does bake the card ports into the chassis ports", () => {
    const legacy = legacySave(configured(), "custom-1730000000098");
    expect(legacy.ports.map((p) => `${p.section ?? ""}|${p.label}`)).toEqual([
      "|Ref In",
      "|PSU",
      "Slot A|MGMT",
      "Slot A|AES In",
      "Slot A > SFP 1|SFP+",
      "Slot A > SFP 2|SFP+",
    ]);
  });

  it("places each slot once and each port once", () => {
    const original = configured();
    const legacy = legacySave(original, "custom-1730000000098");
    useSchematicStore.getState().addDevice(legacy, { x: 400, y: 0 });
    const placed = lastDevice().data;
    expect(slotCards(placed.slots)).toEqual(slotCards(original.slots));
    expect(portShape(placed)).toEqual(portShape(original));
    // The surviving card ports are owned by their slots, not left as loose chassis ports.
    const owned = new Set(placed.slots!.flatMap((s) => s.portIds));
    expect(placed.ports.filter((p) => p.section && !owned.has(p.id))).toEqual([]);
  });

  it("keeps the baked ports when the card can't be found, so nothing vanishes", () => {
    const original = configured();
    const legacy = legacySave(original, "custom-1730000000098");
    // The user deleted the network card from their templates since.
    useSchematicStore.setState({ customTemplates: [SFP, FRAME] });
    useSchematicStore.getState().addDevice(legacy, { x: 400, y: 0 });
    const placed = lastDevice().data;
    expect(slotCards(placed.slots)).toEqual([["slot-a", "-"], ["slot-b", "-"]]);
    // All six ports are still there, as chassis ports.
    expect(portShape(placed)).toEqual(portShape(original));
  });

  it("a hand-built chassis port that only shares a section name with a slot is kept", () => {
    const legacy: DeviceTemplate = {
      ...FRAME,
      id: "custom-1730000000095",
      // Same section and label as the card's MGMT port, but a different connector: not a copy.
      ports: [...FRAME.ports, { id: "tpl-2", label: "MGMT", section: "Slot A", signalType: "ethernet", direction: "bidirectional", connectorType: "ethercon" }],
    };
    useSchematicStore.getState().addDevice(legacy, { x: 0, y: 0 });
    const mgmt = lastDevice().data.ports.filter((p) => p.label === "MGMT");
    expect(mgmt.map((p) => p.connectorType).sort()).toEqual(["ethercon", "rj45"]);
  });

  it("Swap Device to a legacy template gives each port once", () => {
    const original = configured();
    const legacy = legacySave(original, "custom-1730000000098");
    useSchematicStore.getState().addCustomTemplate(legacy);
    useSchematicStore.getState().addDevice({ id: "custom-1730000000097", deviceType: "converter", label: "Old Box", ports: [] }, { x: 0, y: 300 });
    const old = lastDevice();
    const state = useSchematicStore.getState();
    const plan = planDeviceSwap(old.data, old.id, legacy, state.edges, state.customTemplates);
    // The planner's port pool offers each port once too.
    const poolShape = plan.newPortPool.map((p) => `${p.section ?? ""}|${p.label}`);
    expect(new Set(poolShape).size).toBe(poolShape.length);
    useSchematicStore.getState().swapDevice(old.id, plan);
    const swapped = device(old.id);
    expect(slotCards(swapped.slots)).toEqual(slotCards(original.slots));
    expect(portShape(swapped)).toEqual(portShape(original));
  });
});

describe("a slot's card that can't be found at placement is reported (#422 review)", () => {
  const toasts = () => useSchematicStore.getState().toasts.map((t) => t.message);
  beforeEach(() => useSchematicStore.setState({ toasts: [] }));

  it("names the device, the slot and the missing card", () => {
    const saved = (() => {
      useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
      return buildDeviceTemplate(formFrom(lastDevice().data), { id: "custom-1730000000094" });
    })();
    // The custom network card was deleted since the template was saved.
    useSchematicStore.setState({ customTemplates: [SFP, FRAME, saved], toasts: [] });
    useSchematicStore.getState().addDevice(saved, { x: 400, y: 0 });
    expect(slotCards(lastDevice().data.slots)).toEqual([["slot-a", "-"], ["slot-b", "-"]]);
    expect(toasts()).toEqual([
      `Modular Frame: couldn't find card "${NET_CARD.id}" for Slot A — slot left empty`,
    ]);
  });

  it("says nothing when every card resolves", () => {
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    expect(toasts()).toEqual([]);
  });

  it("says nothing for a library device whose built-in default card isn't in the library", () => {
    // A known library data gap (follow-up issue): Disguise EX 3's SFP defaults name cards
    // that don't exist. Nothing the user can act on, so no toast on every placement.
    const ex3 = getBundledTemplates().find((t) => t.slots?.some((s) => s.defaultCardId === "sfp-25g-sr"));
    expect(ex3).toBeDefined();
    useSchematicStore.getState().addDevice(ex3!, { x: 0, y: 0 });
    expect(toasts()).toEqual([]);
  });
});

describe("slot ids with \"/\" (#422 review)", () => {
  it("the API rejects a chassis slot id containing \"/\"", () => {
    const r = validateTemplate({
      label: "Frame", deviceType: "media-server", category: "Video", manufacturer: "Generic",
      ports: [],
      slots: [{ id: "a", label: "Slot A", slotFamily: "fam" }, { id: "a/b", label: "Slot B", slotFamily: "fam" }],
    });
    expect(r).toEqual({ ok: false, error: 'Expansion slot 2 ("Slot B") has an id containing "/", which is reserved for sub-slots' });
  });
});

describe("library cards only (#422)", () => {

  it("library cards only: a disguise-style chassis saved with an IP-VFC (four SFP28 cages) places cleanly", () => {
    // Bundled library cards end to end, so this pins #422 on its own (no custom-card lookup
    // involved). IP-VFC brings four nested SFP28 sub-slots; Quad DVI VFC brings four ports.
    const chassis: DeviceTemplate = {
      id: "custom-1730000000096",
      deviceType: "media-server",
      label: "VFC Chassis",
      ports: [{ id: "tpl-0", label: "PSU", signalType: "power", direction: "input", connectorType: "iec" }],
      slots: [
        { id: "vfc-a", label: "VFC Slot A", slotFamily: "disguise-vfc", defaultCardId: "vfc-card-ip" },
        { id: "vfc-b", label: "VFC Slot B", slotFamily: "disguise-vfc", defaultCardId: "vfc-card-quad-dvi" },
      ],
    };
    useSchematicStore.getState().addDevice(chassis, { x: 0, y: 0 });
    const original = lastDevice().data;
    expect(original.slots!.map((s) => s.slotId)).toEqual([
      "vfc-a", "vfc-a/vfc-ip-sfp-1", "vfc-a/vfc-ip-sfp-2", "vfc-a/vfc-ip-sfp-3", "vfc-a/vfc-ip-sfp-4", "vfc-b",
    ]);

    const saved = buildDeviceTemplate(formFrom(original), { id: "custom-1730000000093" });
    useSchematicStore.getState().addDevice(saved, { x: 400, y: 0 });
    const placed = lastDevice().data;

    expect(slotCards(placed.slots)).toEqual(slotCards(original.slots));
    expect(portShape(placed)).toEqual(portShape(original));

    // And the same chassis saved by an older build places cleanly too.
    useSchematicStore.getState().addDevice(legacySave(original, "custom-1730000000092"), { x: 800, y: 0 });
    const legacyPlaced = lastDevice().data;
    expect(slotCards(legacyPlaced.slots)).toEqual(slotCards(original.slots));
    expect(portShape(legacyPlaced)).toEqual(portShape(original));
  });
});
