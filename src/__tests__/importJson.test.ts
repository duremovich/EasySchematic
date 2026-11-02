import { describe, it, expect } from "vitest";
import { parseJsonImport } from "../import/parseJson";

const plainDevice = {
  label: "Sony BRC-X400",
  deviceType: "ptz-camera",
  manufacturer: "Sony",
  modelNumber: "BRC-X400",
  referenceUrl: "https://pro.sony/product/brc-x400",
  ports: [{ label: "HDMI", signalType: "hdmi", direction: "output", connectorType: "hdmi" }],
};

const chassis = {
  label: "Acme Modular Matrix",
  deviceType: "switcher",
  manufacturer: "Acme",
  modelNumber: "AMM-1600",
  referenceUrl: "https://acme.example/amm-1600",
  slots: [
    { id: "in-1", label: "Input Slot 1", slotFamily: "acme-frame-input" },
    { id: "out-1", label: "Output Slot 1", slotFamily: "acme-frame-output" },
  ],
  ports: [{ label: "AC Power", signalType: "power", direction: "input" }],
};

const card = {
  label: "Acme 4-Input HDMI Card",
  deviceType: "expansion-card",
  manufacturer: "Acme",
  modelNumber: "AMM-4I-HDMI",
  referenceUrl: "https://acme.example/amm-4i-hdmi",
  slotFamily: "acme-frame-input",
  ports: [{ label: "Input 1", signalType: "hdmi", direction: "input", connectorType: "hdmi" }],
};

function parseOne(raw: unknown) {
  const { templates } = parseJsonImport(JSON.stringify(raw));
  expect(templates).toHaveLength(1);
  return templates[0];
}

function withPort(port: Record<string, unknown>) {
  return { ...plainDevice, ports: [{ label: "P", signalType: "ethernet", direction: "bidirectional", ...port }] };
}

// The importer copies an explicit allow-list. These pin that every field a template author
// can set survives the import, and that unknown / instance-only fields still do not.
describe("parseJsonImport — template fields", () => {
  it("carries shortName, hostname and poeDrawW", () => {
    const t = parseOne({ ...plainDevice, shortName: "BRC-X400", hostname: "cam-1", poeDrawW: 15.4 });
    expect(t.validation.ok).toBe(true);
    expect(t.template.shortName).toBe("BRC-X400");
    expect(t.template.hostname).toBe("cam-1");
    expect(t.template.poeDrawW).toBe(15.4);
  });

  it("carries rackForm only when it is a valid value", () => {
    expect(parseOne({ ...plainDevice, rackForm: "shelf-only" }).template.rackForm).toBe("shelf-only");
    expect(parseOne({ ...plainDevice, rackForm: "bogus" }).template.rackForm).toBeUndefined();
  });

  it("keeps aux rows with text, drops rows without a string text", () => {
    const t = parseOne({
      ...plainDevice,
      auxiliaryData: [{ text: "Model: {{modelNumber}}", position: "header" }, { position: "footer" }, { text: 42 }, { text: "" }],
    });
    expect(t.template.auxiliaryData).toEqual([{ text: "Model: {{modelNumber}}", position: "header" }, { text: "" }]);
  });

  it("still strips unknown fields and does not import the library version", () => {
    const t = parseOne({ ...plainDevice, bogusField: "drop me", version: 7 }).template as unknown as Record<string, unknown>;
    expect(t.bogusField).toBeUndefined();
    expect(t.version).toBeUndefined();
  });

  it("leaves a plain device without the optional fields", () => {
    const t = parseOne(plainDevice);
    expect(t.validation.ok).toBe(true);
    expect(t.template.slots).toBeUndefined();
    expect(t.template.slotFamily).toBeUndefined();
    expect(t.template.auxiliaryData).toBeUndefined();
    const set = Object.entries(t.template.ports[0]).filter(([, v]) => v !== undefined).map(([k]) => k);
    expect(set.sort()).toEqual(["connectorType", "direction", "id", "label", "signalType"]);
  });
});

describe("parseJsonImport — port fields", () => {
  // The documented "switch with a pre-configured management port" example.
  it("preserves a port's networkConfig", () => {
    const t = parseOne(withPort({ networkConfig: { ip: "192.168.1.1", subnetMask: "255.255.255.0", vlan: 10, dhcp: false } }));
    expect(t.validation.ok).toBe(true);
    expect(t.template.ports[0].networkConfig).toEqual({ ip: "192.168.1.1", subnetMask: "255.255.255.0", vlan: 10, dhcp: false });
  });

  it("drops malformed networkConfig leaves rather than carrying them", () => {
    const t = parseOne(withPort({ networkConfig: { ip: 42, gateway: "10.0.0.1", dhcp: "yes", junk: true } }));
    expect(t.template.ports[0].networkConfig).toEqual({ gateway: "10.0.0.1" });
    expect(parseOne(withPort({ networkConfig: "nope" })).template.ports[0].networkConfig).toBeUndefined();
  });

  it("preserves capabilities, keeping only string colorSpaces", () => {
    const t = parseOne(withPort({ capabilities: { maxResolution: "4K", maxFrameRate: 60, maxBitDepth: 10, colorSpaces: ["Rec.709", 42, "Rec.2020"] } }));
    expect(t.template.ports[0].capabilities).toEqual({ maxResolution: "4K", maxFrameRate: 60, maxBitDepth: 10, colorSpaces: ["Rec.709", "Rec.2020"] });
  });

  it("carries the remaining optional port fields", () => {
    const fields = {
      section: "Rear",
      notes: "Uplink",
      linkSpeed: "10G",
      gender: "female",
      multiConnect: true,
      addressable: true,
      isMulticable: true,
      directAttach: true,
      flipped: true,
      channelCount: 8,
      poeDrawW: 12.5,
      usbcPowerSourceW: 100,
      usbcPowerDrawW: 15,
    };
    const t = parseOne(withPort(fields));
    expect(t.validation.ok).toBe(true);
    expect(t.template.ports[0]).toMatchObject(fields);
  });

  it("carries the passthrough-only port fields", () => {
    const fields = {
      rearConnectorType: "bnc",
      frontConnectorType: "bnc",
      rearGender: "female",
      frontGender: "male",
    };
    const t = parseOne({
      ...plainDevice,
      ports: [{ label: "TIE 1", signalType: "sdi", direction: "passthrough", ...fields }],
    });
    expect(t.validation.ok).toBe(true);
    expect(t.template.ports[0]).toMatchObject(fields);
  });

  it("keeps an explicit false, and an explicit inheritsSignal", () => {
    const off = { multiConnect: false, addressable: false, flipped: false };
    expect(parseOne(withPort(off)).template.ports[0]).toMatchObject(off);

    const inherited = parseOne(withPort({ signalType: "custom", inheritsSignal: true }));
    expect(inherited.validation.ok).toBe(true);
    expect(inherited.template.ports[0]).toMatchObject({ signalType: "custom", inheritsSignal: true });
  });

  it("does not import wrongly typed scalars", () => {
    const p = parseOne(withPort({ multiConnect: "true", channelCount: "eight", notes: 5 })).template.ports[0];
    expect(p.multiConnect).toBeUndefined();
    expect(p.channelCount).toBeUndefined();
    expect(p.notes).toBeUndefined();
  });

  it("does not import instance-only fields (templatePortId, activeConfig)", () => {
    const p = parseOne(withPort({ templatePortId: "tpl-1", activeConfig: { resolution: "1080p" } })).template.ports[0];
    expect(p.templatePortId).toBeUndefined();
    expect(p.activeConfig).toBeUndefined();
  });

  it("canonicalizes a passthrough port that omits signalType", () => {
    const t = parseOne({ ...plainDevice, ports: [{ label: "TIE 1", direction: "passthrough", rearConnectorType: "bnc", frontConnectorType: "bnc" }] });
    expect(t.validation.ok).toBe(true);
    expect(t.template.ports[0]).toMatchObject({ direction: "passthrough", signalType: "custom", inheritsSignal: true });
  });

  it("respects an explicit signalType on a passthrough port", () => {
    const t = parseOne({ ...plainDevice, ports: [{ label: "TIE", signalType: "sdi", direction: "passthrough" }] });
    expect(t.validation.ok).toBe(true);
    expect(t.template.ports[0].signalType).toBe("sdi");
    expect(t.template.ports[0].inheritsSignal).toBeUndefined();
  });

  it("still requires a signalType on a non-passthrough port", () => {
    const t = parseOne({ ...plainDevice, ports: [{ label: "IN", direction: "input" }] });
    expect(t.validation.ok).toBe(false);
    expect(t.validation.errors.join(" ")).toMatch(/signalType is required/);
  });
});

describe("parseJsonImport — modular chassis", () => {
  it("preserves chassis slots and a card's slotFamily, linked by the family string", () => {
    const { templates } = parseJsonImport(JSON.stringify([chassis, card]));
    expect(templates.every((t) => t.validation.ok)).toBe(true);
    expect(templates[0].template.slots).toEqual(chassis.slots);
    expect(templates[1].template.slotFamily).toBe("acme-frame-input");
  });

  it("backfills a missing slot id and label, and keeps defaultCardId / hideWhenEmpty", () => {
    const t = parseOne({ ...chassis, slots: [{ slotFamily: "acme-frame-input", defaultCardId: "card-1", hideWhenEmpty: true }] });
    expect(t.validation.ok).toBe(true);
    const slot = t.template.slots![0];
    expect(slot.id).toBeTruthy();
    expect(slot).toMatchObject({ label: "Slot 1", slotFamily: "acme-frame-input", defaultCardId: "card-1", hideWhenEmpty: true });
  });

  it("keeps hideWhenEmpty: false", () => {
    const slot = parseOne({ ...chassis, slots: [{ id: "s1", label: "Slot 1", slotFamily: "fam", hideWhenEmpty: false }] }).template.slots![0];
    expect(slot.hideWhenEmpty).toBe(false);
  });

  it("gives backfilled slots distinct ids", () => {
    const slots = parseOne({ ...chassis, slots: [{ slotFamily: "a" }, { slotFamily: "a" }] }).template.slots!;
    expect(slots[0].id).not.toBe(slots[1].id);
  });

  // The editor's own "+ Add Slot" creates a slot with a blank family, so that is a state to
  // flag, not to refuse.
  it("warns on a blank slotFamily instead of rejecting it", () => {
    const slot = parseOne({ ...chassis, slots: [{ id: "s1", label: "Slot 1", slotFamily: "  " }] });
    expect(slot.validation.ok).toBe(true);
    expect(slot.validation.warnings.join(" ")).toMatch(/slots\[0\].*slotFamily/);

    const blankCard = parseOne({ ...card, slotFamily: "" });
    expect(blankCard.validation.ok).toBe(true);
    expect(blankCard.validation.warnings.join(" ")).toMatch(/slotFamily/);
  });

  it("rejects malformed slots rather than silently dropping them", () => {
    const bad = parseOne({ ...chassis, slots: [null, "x", { id: "s1", label: "Slot 1", slotFamily: "fam" }] });
    expect(bad.template.slots).toHaveLength(3);
    expect(bad.validation.ok).toBe(false);
    expect(bad.validation.errors.join(" ")).toMatch(/slots\[0\] must be an object/);

    expect(parseOne({ ...chassis, slots: "oops" }).validation.errors.join(" ")).toMatch(/slots must be an array/);
    expect(parseOne({ ...card, slotFamily: 42 }).validation.errors.join(" ")).toMatch(/slotFamily must be a string/);
    expect(parseOne({ ...chassis, slots: [{ id: "s1", label: "Slot 1", slotFamily: 42 }] }).validation.errors.join(" "))
      .toMatch(/slots\[0\]\.slotFamily must be a string/);
    expect(parseOne({ ...chassis, slots: [{ id: "s1", label: "Slot 1", slotFamily: "fam", defaultCardId: 42 }] }).validation.errors.join(" "))
      .toMatch(/defaultCardId must be a string/);
  });

  it("rejects duplicate slot ids", () => {
    const t = parseOne({ ...chassis, slots: [{ id: "s", label: "A", slotFamily: "fam" }, { id: "s", label: "B", slotFamily: "fam" }] });
    expect(t.validation.ok).toBe(false);
    expect(t.validation.errors.join(" ")).toMatch(/Duplicate slot ids: s/);
  });
});

describe("parseJsonImport — validation of the carried fields", () => {
  it("accepts a passthrough direction", () => {
    expect(parseOne({ ...plainDevice, ports: [{ label: "TIE", signalType: "sdi", direction: "passthrough" }] }).validation.ok).toBe(true);
    expect(parseOne(withPort({ direction: "sideways" })).validation.errors.join(" ")).toMatch(/direction must be input, output, bidirectional, or passthrough/);
  });

  it("rejects a negative poeDrawW", () => {
    expect(parseOne({ ...plainDevice, poeDrawW: -5 }).validation.errors.join(" ")).toMatch(/poeDrawW must be a non-negative number/);
  });

  it("rejects a negative per-port number", () => {
    for (const field of ["poeDrawW", "usbcPowerSourceW", "usbcPowerDrawW", "channelCount"]) {
      const t = parseOne(withPort({ [field]: -3 }));
      expect(t.validation.errors.join(" "), field).toMatch(new RegExp(`ports\\[0\\]\\.${field} must be a non-negative number`));
    }
  });

  it("rejects unknown rear/front connector types and genders", () => {
    expect(parseOne(withPort({ rearConnectorType: "not-a-connector" })).validation.errors.join(" ")).toMatch(/unknown rearConnectorType "not-a-connector"/);
    expect(parseOne(withPort({ frontConnectorType: "not-a-connector" })).validation.errors.join(" ")).toMatch(/unknown frontConnectorType "not-a-connector"/);
    for (const field of ["gender", "rearGender", "frontGender"]) {
      expect(parseOne(withPort({ [field]: "other" })).validation.errors.join(" "), field).toMatch(new RegExp(`${field} must be male or female`));
    }
  });

  it("rejects an out-of-range VLAN", () => {
    for (const vlan of [-1, 4095, 10.5]) {
      expect(parseOne(withPort({ networkConfig: { vlan } })).validation.errors.join(" "), String(vlan)).toMatch(/networkConfig\.vlan must be an integer 0–4094/);
    }
    expect(parseOne(withPort({ networkConfig: { vlan: 4094 } })).validation.ok).toBe(true);
  });

  it("rejects negative capabilities numbers", () => {
    expect(parseOne(withPort({ capabilities: { maxFrameRate: -1 } })).validation.errors.join(" ")).toMatch(/capabilities\.maxFrameRate must be a non-negative number/);
    expect(parseOne(withPort({ capabilities: { maxBitDepth: -1 } })).validation.errors.join(" ")).toMatch(/capabilities\.maxBitDepth must be a non-negative number/);
  });

  // Ports sharing an id imported before and still do: placing a device re-ids every port.
  it("still accepts ports that share an id", () => {
    const t = parseOne({
      ...plainDevice,
      ports: [
        { id: "p1", label: "A", signalType: "hdmi", direction: "input" },
        { id: "p1", label: "B", signalType: "hdmi", direction: "output" },
      ],
    });
    expect(t.validation.ok).toBe(true);
  });
});
