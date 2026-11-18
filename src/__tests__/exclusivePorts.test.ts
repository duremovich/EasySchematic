/**
 * Mutually exclusive ports (#414).
 *
 * A template marks alternative jacks on one signal path with a shared `exclusiveGroup` — the
 * reporter's case is a front-panel AUX input that overrides the matching rear input. These
 * pin three things: the field survives every hop a port makes (template save → placement →
 * schematic save/load → JSON and CSV import → template archive export), the validators accept
 * it and reject bad values, and connecting a second port of one group warns without blocking.
 *
 * The store half is driven through the real `addDevice` / `onConnect` / `exportToJSON` /
 * `importFromJSON` over the seeded test fixture. The store reads localStorage at import time,
 * so a minimal in-memory one is installed first.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fixture from "../testSchematic/schematic.json";
import { parseJsonImport } from "../import/parseJson";
import { parseCsvImport } from "../import/parseCsv";
import { validateTemplate as validateClientTemplate } from "../import/validate";
import { validateTemplate as validateApiTemplate } from "../../api/src/validate";
import { parseTemplateArchive } from "../templateExport";
import { buildDeviceTemplate, type TemplateFormValues } from "../deviceTemplateBuild";
import {
  conflictingExclusivePortIds,
  exclusiveConflictMessage,
  exclusiveGroupConflicts,
  newExclusiveConflicts,
  normalizeExclusiveGroup,
} from "../exclusivePorts";
import { editorPortsMatch, visibleSaveActions } from "../deviceEditorActions";
import type { ConnectionEdge, DeviceNode, DeviceTemplate, InstalledSlot, Port, SchematicFile, SchematicNode } from "../types";

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
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as { crypto?: unknown }).crypto = {
      randomUUID: () => "test-" + Math.random().toString(36).slice(2),
    };
  }
  ({ useSchematicStore } = await import("../store"));
});

const file = fixture as unknown as SchematicFile;

/** The reporter's device: a front 3.5mm AUX in that overrides the rear RCA in, plus an
 *  independent mic input that must stay unaffected. */
const MIXER: DeviceTemplate = {
  id: "test-exclusive-amp",
  deviceType: "amplifier",
  label: "Test Mini Amp",
  manufacturer: "Test Co",
  modelNumber: "MA-1",
  referenceUrl: "https://example.com/ma-1",
  ports: [
    { id: "amp-aux-front-in", label: "AUX IN (Front)", signalType: "analog-audio", direction: "input", connectorType: "trs-eighth", exclusiveGroup: "in1" },
    { id: "amp-rca-rear-in", label: "IN (Rear)", signalType: "analog-audio", direction: "input", connectorType: "rca", exclusiveGroup: "in1" },
    { id: "amp-mic-in", label: "MIC IN", signalType: "analog-audio", direction: "input", connectorType: "rca" },
    { id: "amp-spk-out", label: "SPK OUT", signalType: "speaker-level", direction: "output", connectorType: "speakon" },
  ],
};

/** A source with one output matching each of the amp's input connectors. */
const PLAYER: DeviceTemplate = {
  id: "test-exclusive-player",
  deviceType: "media-player",
  label: "Test Player",
  ports: [
    { id: "player-aux-out", label: "Headphone Out", signalType: "analog-audio", direction: "output", connectorType: "trs-eighth" },
    { id: "player-rca-out", label: "Line Out", signalType: "analog-audio", direction: "output", connectorType: "rca" },
    { id: "player-rca-out-2", label: "Line Out 2", signalType: "analog-audio", direction: "output", connectorType: "rca" },
    { id: "player-rca-out-3", label: "Line Out 3", signalType: "analog-audio", direction: "output", connectorType: "rca" },
  ],
};

// ─── pure predicate ────────────────────────────────────────────────

const port = (id: string, exclusiveGroup?: string, direction: Port["direction"] = "input"): Port => ({
  id,
  label: id.toUpperCase(),
  signalType: "analog-audio",
  direction,
  ...(exclusiveGroup !== undefined ? { exclusiveGroup } : {}),
});

describe("exclusiveGroupConflicts (#414)", () => {
  const ports = [port("front-in", "in1"), port("rear-in", "in1"), port("mic-in"), port("b-front-in", "in2"), port("b-rear-in", "in2")];

  it("fires when two ports of one group are both connected", () => {
    const c = exclusiveGroupConflicts(ports, new Set(["front-in", "rear-in"]));
    expect(c).toHaveLength(1);
    expect(c[0].group).toBe("in1");
    expect(c[0].ports.map((p) => p.id)).toEqual(["front-in", "rear-in"]);
  });

  it("does not fire for one connected port in a group", () => {
    expect(exclusiveGroupConflicts(ports, new Set(["front-in", "mic-in"]))).toEqual([]);
  });

  it("does not fire for connected ports in different groups", () => {
    expect(exclusiveGroupConflicts(ports, new Set(["front-in", "b-rear-in"]))).toEqual([]);
  });

  it("ignores ports with no group — the default stays independent", () => {
    const plain = [port("a"), port("b"), port("c")];
    expect(exclusiveGroupConflicts(plain, new Set(["a", "b", "c"]))).toEqual([]);
  });

  it("treats a blank group as unset and trims the value", () => {
    expect(exclusiveGroupConflicts([port("a", "  "), port("b", "")], new Set(["a", "b"]))).toEqual([]);
    const c = exclusiveGroupConflicts([port("a", "in1 "), port("b", " in1")], new Set(["a", "b"]));
    expect(c.map((x) => x.group)).toEqual(["in1"]);
  });

  it("counts two-sided ports by either face", () => {
    const bidir = [port("x", "g", "bidirectional"), port("y", "g", "passthrough")];
    expect(exclusiveGroupConflicts(bidir, new Set(["x-out", "y-front"]))).toHaveLength(1);
  });

  it("does not let one bidirectional port conflict with itself when both faces are connected", () => {
    const bidir = [port("x", "g", "bidirectional"), port("z", "g")];
    expect(exclusiveGroupConflicts(bidir, new Set(["x-in", "x-out"]))).toEqual([]);
    expect(exclusiveGroupConflicts(bidir, new Set(["x-in", "x-out", "z"]))).toHaveLength(1);
  });

  it("keeps a card's groups to its own slot — two identical cards don't flag each other", () => {
    // Two copies of one card template: each carries the template's "ch1" verbatim.
    const cardPorts = [port("a-front", "ch1"), port("a-rear", "ch1"), port("b-front", "ch1"), port("b-rear", "ch1")];
    const slots: InstalledSlot[] = [
      { slotId: "slot-a", label: "Slot A", portIds: ["a-front", "a-rear"] },
      { slotId: "slot-b", label: "Slot B", portIds: ["b-front", "b-rear"] },
    ];
    expect(exclusiveGroupConflicts(cardPorts, new Set(["a-front", "b-rear"]), slots)).toEqual([]);
    const c = exclusiveGroupConflicts(cardPorts, new Set(["a-front", "a-rear", "b-rear"]), slots);
    expect(c).toHaveLength(1);
    expect(c[0].slotId).toBe("slot-a");
    expect(c[0].ports.map((p) => p.id)).toEqual(["a-front", "a-rear"]);
  });

  it("keeps a chassis port's group apart from a card port with the same name", () => {
    const ports = [port("chassis-in", "ch1"), port("card-in", "ch1")];
    const slots: InstalledSlot[] = [{ slotId: "slot-a", label: "Slot A", portIds: ["card-in"] }];
    expect(exclusiveGroupConflicts(ports, new Set(["chassis-in", "card-in"]), slots)).toEqual([]);
  });

  it("normalizes a whitespace-only group to no group", () => {
    expect(normalizeExclusiveGroup("   ")).toBeUndefined();
    expect(normalizeExclusiveGroup(undefined)).toBeUndefined();
    expect(normalizeExclusiveGroup(" in1 ")).toBe("in1");
  });

  it("marks every port in a conflict for the canvas indicator", () => {
    expect([...conflictingExclusivePortIds(ports, new Set(["front-in", "rear-in", "mic-in"]))].sort())
      .toEqual(["front-in", "rear-in"]);
  });
});

describe("newExclusiveConflicts (#414)", () => {
  const dev = (id: string, label: string, ports: Port[]): SchematicNode =>
    ({ id, type: "device", position: { x: 0, y: 0 }, data: { label, deviceType: "amplifier", ports } }) as DeviceNode;
  const edge = (id: string, target: string, targetHandle: string): ConnectionEdge =>
    ({ id, source: "src", sourceHandle: "out", target, targetHandle, data: { signalType: "analog-audio" } }) as ConnectionEdge;
  const nodes = [
    dev("amp-a", "Amp A", [port("front-in", "in1"), port("rear-in", "in1")]),
    dev("amp-b", "Amp B", [port("front-in", "in1"), port("rear-in", "in1")]),
  ];

  it("reports the connection that makes the second port of a group live", () => {
    const before = [edge("e1", "amp-a", "front-in")];
    const after = [...before, edge("e2", "amp-a", "rear-in")];
    const out = newExclusiveConflicts(nodes, before, after);
    expect(out).toHaveLength(1);
    expect(out[0].nodeId).toBe("amp-a");
    expect(exclusiveConflictMessage(out[0].deviceLabel, out[0].conflict)).toBe(
      'Amp A: "FRONT-IN" and "REAR-IN" are both connected, but share exclusive group "in1" — only one can be in use at a time.',
    );
  });

  it("does not fire for the same group name on different devices", () => {
    const before = [edge("e1", "amp-a", "front-in")];
    const after = [...before, edge("e2", "amp-b", "rear-in")];
    expect(newExclusiveConflicts(nodes, before, after)).toEqual([]);
  });

  it("treats a reconnected end (same id, new port) as new", () => {
    const before = [edge("e1", "amp-a", "front-in"), edge("e2", "amp-b", "front-in")];
    const after = [before[0], edge("e2", "amp-a", "rear-in")];
    const out = newExclusiveConflicts(nodes, before, after);
    expect(out.map((o) => o.nodeId)).toEqual(["amp-a"]);
  });

  it("does not repeat an existing conflict for an unrelated connection", () => {
    const before = [edge("e1", "amp-a", "front-in"), edge("e2", "amp-a", "rear-in")];
    const after = [...before, edge("e3", "amp-b", "front-in")];
    expect(newExclusiveConflicts(nodes, before, after)).toEqual([]);
  });
});

// ─── store: placement, connect warning, save/load ──────────────────

function placed(templateId: string): DeviceNode {
  const nodes = useSchematicStore.getState().nodes;
  return [...nodes].reverse().find((n) => n.type === "device" && n.data.templateId === templateId) as DeviceNode;
}

function portByLabel(node: DeviceNode, label: string): Port {
  return node.data.ports.find((p) => p.label === label)!;
}

beforeEach(() => {
  useSchematicStore.getState().importFromJSON(structuredClone(file));
  useSchematicStore.setState({ toasts: [], pendingIncompatibleConnection: null, defaultConnectionType: "wire" });
});

describe("exclusive groups in the store (#414)", () => {
  function placeBoth() {
    useSchematicStore.getState().addDevice(MIXER, { x: 0, y: 0 });
    useSchematicStore.getState().addDevice(PLAYER, { x: -400, y: 0 });
    return { amp: placed(MIXER.id!), player: placed(PLAYER.id!) };
  }

  function connect(player: DeviceNode, outLabel: string, amp: DeviceNode, inLabel: string) {
    useSchematicStore.getState().onConnect({
      source: player.id,
      sourceHandle: portByLabel(player, outLabel).id,
      target: amp.id,
      targetHandle: portByLabel(amp, inLabel).id,
    });
  }

  it("carries the group onto the placed device's cloned ports", () => {
    const { amp } = placeBoth();
    expect(portByLabel(amp, "AUX IN (Front)").exclusiveGroup).toBe("in1");
    expect(portByLabel(amp, "IN (Rear)").exclusiveGroup).toBe("in1");
    expect(portByLabel(amp, "MIC IN").exclusiveGroup).toBeUndefined();
    // Cloned ids, not the template's — the group has to ride along on the copy.
    expect(portByLabel(amp, "AUX IN (Front)").id).not.toBe("amp-aux-front-in");
  });

  it("warns, without blocking, when the second port of a group is connected", () => {
    const { amp, player } = placeBoth();
    const edgesAtStart = useSchematicStore.getState().edges.length;

    connect(player, "Headphone Out", amp, "AUX IN (Front)");
    expect(useSchematicStore.getState().toasts).toEqual([]);

    connect(player, "Line Out", amp, "IN (Rear)");
    const s = useSchematicStore.getState();
    expect(s.edges.length).toBe(edgesAtStart + 2); // both connections exist
    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0].message).toContain("Test Mini Amp");
    expect(s.toasts[0].message).toContain('"AUX IN (Front)"');
    expect(s.toasts[0].message).toContain('"IN (Rear)"');
    expect(s.toasts[0].message).toContain('"in1"');
  });

  it("stays quiet for a port outside the group", () => {
    const { amp, player } = placeBoth();
    connect(player, "Headphone Out", amp, "AUX IN (Front)");
    connect(player, "Line Out 2", amp, "MIC IN");
    expect(useSchematicStore.getState().toasts).toEqual([]);
  });

  it("still warns when new connections arrive stubbed", () => {
    useSchematicStore.setState({ defaultConnectionType: "stub" });
    const { amp, player } = placeBoth();
    connect(player, "Headphone Out", amp, "AUX IN (Front)");
    connect(player, "Line Out", amp, "IN (Rear)");
    expect(useSchematicStore.getState().toasts).toHaveLength(1);
  });

  it("warns when an existing connection's end is dragged onto the second grouped port", () => {
    const { amp, player } = placeBoth();
    connect(player, "Headphone Out", amp, "AUX IN (Front)");
    connect(player, "Line Out", amp, "MIC IN");
    expect(useSchematicStore.getState().toasts).toEqual([]);
    const micId = portByLabel(amp, "MIC IN").id;
    const moving = useSchematicStore.getState().edges.find((e) => e.target === amp.id && e.targetHandle === micId)!;
    const result = useSchematicStore.getState().reconnectConnectionEnd(moving, {
      source: moving.source,
      sourceHandle: moving.sourceHandle ?? null,
      target: amp.id,
      targetHandle: portByLabel(amp, "IN (Rear)").id,
    });
    expect(result).toBe("reconnected");
    const toasts = useSchematicStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('"IN (Rear)"');
  });

  it("does not warn across two identical cards in one frame", () => {
    const CARD: DeviceTemplate = {
      id: "test-exclusive-card",
      deviceType: "expansion-card",
      label: "Test Line Card",
      slotFamily: "test-exclusive-fam",
      ports: [
        { id: "card-front-in", label: "Line In (Front)", signalType: "analog-audio", direction: "input", connectorType: "rca", exclusiveGroup: "ch1" },
        { id: "card-rear-in", label: "Line In (Rear)", signalType: "analog-audio", direction: "input", connectorType: "rca", exclusiveGroup: "ch1" },
      ],
    };
    const FRAME: DeviceTemplate = {
      id: "test-exclusive-frame",
      deviceType: "audio-interface",
      label: "Test Frame",
      ports: [],
      slots: [
        { id: "slot-a", label: "Slot A", slotFamily: "test-exclusive-fam" },
        { id: "slot-b", label: "Slot B", slotFamily: "test-exclusive-fam" },
      ],
    };
    useSchematicStore.getState().addCustomTemplate(CARD);
    useSchematicStore.getState().addDevice(FRAME, { x: 0, y: 0 });
    useSchematicStore.getState().addDevice(PLAYER, { x: -400, y: 0 });
    const frameId = placed(FRAME.id!).id;
    useSchematicStore.getState().swapCard(frameId, "slot-a", CARD.id!);
    useSchematicStore.getState().swapCard(frameId, "slot-b", CARD.id!);
    const frame = useSchematicStore.getState().nodes.find((n) => n.id === frameId) as DeviceNode;
    const player = placed(PLAYER.id!);
    const slotPort = (slotId: string, label: string) => {
      const ids = new Set(frame.data.slots!.find((x) => x.slotId === slotId)!.portIds);
      return frame.data.ports.find((p) => ids.has(p.id) && p.label === label)!;
    };
    // The group really was copied verbatim onto both cards.
    expect(slotPort("slot-a", "Line In (Front)").exclusiveGroup).toBe("ch1");
    expect(slotPort("slot-b", "Line In (Rear)").exclusiveGroup).toBe("ch1");
    const wire = (outLabel: string, slotId: string, inLabel: string) =>
      useSchematicStore.getState().onConnect({
        source: player.id,
        sourceHandle: portByLabel(player, outLabel).id,
        target: frameId,
        targetHandle: slotPort(slotId, inLabel).id,
      });

    wire("Line Out", "slot-a", "Line In (Front)");
    wire("Line Out 2", "slot-b", "Line In (Rear)");
    expect(useSchematicStore.getState().edges.filter((e) => e.target === frameId)).toHaveLength(2);
    expect(useSchematicStore.getState().toasts).toEqual([]);

    // The same card's other jack is still a conflict.
    wire("Line Out 3", "slot-a", "Line In (Rear)");
    expect(useSchematicStore.getState().toasts).toHaveLength(1);
  });

  it("survives schematic save and load", () => {
    placeBoth();
    const saved = useSchematicStore.getState().exportToJSON();
    useSchematicStore.getState().importFromJSON(JSON.parse(JSON.stringify(saved)));
    const amp = placed(MIXER.id!);
    expect(portByLabel(amp, "AUX IN (Front)").exclusiveGroup).toBe("in1");
    expect(portByLabel(amp, "IN (Rear)").exclusiveGroup).toBe("in1");
  });
});

// ─── template build, import/export, validation ─────────────────────

describe("exclusiveGroup round-trips through templates (#414)", () => {
  it("is kept by the device editor's Save as User Template builder", () => {
    const form: TemplateFormValues = {
      ports: MIXER.ports.map((p) => ({ ...p })),
      label: MIXER.label,
      shortName: "",
      deviceType: MIXER.deviceType,
      color: undefined,
      headerColor: { deviceHeaderColor: undefined, edited: false, savedHeaderColor: undefined, projectDefault: undefined, appDefault: undefined },
      category: "",
      manufacturer: "Test Co",
      modelNumber: "MA-1",
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
      existing: undefined,
    };
    const tpl = buildDeviceTemplate(form, { id: "custom-1" });
    expect(tpl.ports.map((p) => p.exclusiveGroup)).toEqual(["in1", "in1", undefined, undefined]);

    // …and a device placed from that saved template still has it.
    useSchematicStore.getState().addDevice(tpl, { x: 0, y: 0 });
    const amp = placed("custom-1");
    expect(portByLabel(amp, "IN (Rear)").exclusiveGroup).toBe("in1");
  });

  it("is read from a JSON import", () => {
    const { templates, fatalErrors } = parseJsonImport(JSON.stringify(MIXER));
    expect(fatalErrors).toEqual([]);
    expect(templates[0].validation.errors).toEqual([]);
    expect(templates[0].template.ports.map((p) => p.exclusiveGroup)).toEqual(["in1", "in1", undefined, undefined]);
  });

  it("is read from the optional CSV column port_exclusive_group", () => {
    const head = "model_number,manufacturer,label,device_type,reference_url,port_label,port_direction,port_signal_type,port_connector_type,port_exclusive_group";
    const row = (label: string, conn: string, group: string) =>
      `MA-1,Test Co,Test Mini Amp,amplifier,https://example.com/ma-1,${label},input,analog-audio,${conn},${group}`;
    const csv = [head, row("AUX IN (Front)", "trs-eighth", "in1"), row("IN (Rear)", "rca", "in1"), row("MIC IN", "rca", "")].join("\n");
    const { templates, fatalErrors } = parseCsvImport(csv);
    expect(fatalErrors).toEqual([]);
    expect(templates).toHaveLength(1);
    expect(templates[0].validation.errors).toEqual([]);
    expect(templates[0].template.ports.map((p) => p.exclusiveGroup)).toEqual(["in1", "in1", undefined]);
  });

  it("leaves CSVs without the column unchanged", () => {
    const csv = [
      "model_number,manufacturer,label,device_type,reference_url,port_label,port_direction,port_signal_type",
      "MA-1,Test Co,Test Mini Amp,amplifier,https://example.com/ma-1,IN,input,analog-audio",
    ].join("\n");
    expect(parseCsvImport(csv).templates[0].template.ports[0].exclusiveGroup).toBeUndefined();
  });

  it("survives the template archive export → import", () => {
    // exportTemplatesToFile writes exactly this shape (JSON.stringify of the archive).
    const json = JSON.stringify({ version: 1, templates: [MIXER] }, null, 2);
    const { templates } = parseTemplateArchive(json);
    expect(templates[0].ports.map((p) => p.exclusiveGroup)).toEqual(["in1", "in1", undefined, undefined]);
  });
});

describe("exclusiveGroup validation (#414)", () => {
  const withGroup = (g: unknown) => ({
    ...MIXER,
    category: "Audio",
    ports: [{ ...MIXER.ports[0], exclusiveGroup: g }, MIXER.ports[1]],
  });

  it("is accepted by the API validator", () => {
    expect(validateApiTemplate(withGroup("in1")).ok).toBe(true);
    expect(validateApiTemplate({ ...MIXER, category: "Audio" }).ok).toBe(true);
  });

  it("is rejected by the API validator when not a non-empty string or too long", () => {
    for (const bad of [42, "", "x".repeat(101), ["in1"]]) {
      const r = validateApiTemplate(withGroup(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("ports[0].exclusiveGroup");
    }
  });

  it("is checked by the client import validator", () => {
    expect(validateClientTemplate(withGroup("in1") as Partial<DeviceTemplate>).errors).toEqual([]);
    expect(validateClientTemplate(withGroup("x".repeat(101)) as Partial<DeviceTemplate>).errors)
      .toContain("ports[0].exclusiveGroup exceeds 100 chars");
    expect(validateClientTemplate(withGroup(7) as Partial<DeviceTemplate>).errors)
      .toContain("ports[0].exclusiveGroup must be a string");
    expect(validateClientTemplate(withGroup("   ") as Partial<DeviceTemplate>).errors)
      .toContain("ports[0].exclusiveGroup must be non-empty");
  });
});

describe("device editor dirty check (#414)", () => {
  const tplPorts: Port[] = MIXER.ports.map((p) => ({ ...p }));

  it("counts an exclusive-group-only edit as a change", () => {
    expect(editorPortsMatch(tplPorts, tplPorts)).toBe(true);
    const added = tplPorts.map((p, i) => (i === 2 ? { ...p, exclusiveGroup: "in2" } : p));
    expect(editorPortsMatch(added, tplPorts)).toBe(false);
    const cleared = tplPorts.map((p, i) => (i === 0 ? { ...p, exclusiveGroup: undefined } : p));
    expect(editorPortsMatch(cleared, tplPorts)).toBe(false);
  });

  it("treats a blank group the same as none", () => {
    const blank = tplPorts.map((p, i) => (i === 2 ? { ...p, exclusiveGroup: "  " } : p));
    expect(editorPortsMatch(blank, tplPorts)).toBe(true);
  });

  it("so the save menu offers Submit to Community and Revert to Template", () => {
    const edited = tplPorts.map((p, i) => (i === 2 ? { ...p, exclusiveGroup: "in2" } : p));
    const actions = visibleSaveActions({
      templateId: MIXER.id,
      isUserTemplate: false,
      hasLabeledPort: true,
      hasPreset: false,
      dirtyVsPreset: false,
      dirtyVsTemplate: !editorPortsMatch(edited, tplPorts),
    });
    expect(actions).toContain("submit-community");
    expect(actions).toContain("revert-template");
  });
});
