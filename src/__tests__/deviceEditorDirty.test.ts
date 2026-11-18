/**
 * Device editor unsaved-changes detection (#413).
 *
 * A click outside the Device Properties editor closed it and silently dropped every
 * edit. It now asks first when — and only when — the form differs from what it loaded.
 * Data comes from the seeded test fixture (#307).
 */
import { describe, it, expect } from "vitest";
import { buildTestSchematic } from "../testSchematic/build";
import { deviceEditorFields, isDeviceEditorDirty, stableStringify, type DeviceEditorFields } from "../deviceEditorDirty";
import type { PortDraft } from "../deviceTemplateBuild";
import type { DeviceData, SchematicNode } from "../types";

const fixture = buildTestSchematic();
const device = (id: string) => (fixture.nodes.find((n) => n.id === id) as SchematicNode & { data: DeviceData }).data;
const amp = device("device-6");

/** The editor's state right after opening the Amp. */
function opened(data: DeviceData = amp) {
  const fields = deviceEditorFields(data);
  const ports: PortDraft[] = data.ports.map((p) => ({ ...p }));
  return {
    baseline: { fields, ports: { ports, hiddenPorts: data.hiddenPorts ?? [] } },
    current: (patch: Partial<DeviceEditorFields> = {}, p: PortDraft[] = ports, hiddenPorts: string[] = data.hiddenPorts ?? []) => ({
      fields: { ...fields, ...patch },
      ports: { ports: p, hiddenPorts },
    }),
    ports,
  };
}

describe("device editor dirty check (#413)", () => {
  it("is clean right after opening", () => {
    for (const n of fixture.nodes) {
      if (n.type !== "device") continue;
      const o = opened(n.data as DeviceData);
      expect(isDeviceEditorDirty(o.baseline, o.current()), n.id).toBe(false);
    }
  });

  it("is dirty after a field edit, and clean again once it is put back", () => {
    const o = opened();
    expect(isDeviceEditorDirty(o.baseline, o.current({ label: "Amp — Stage Left" }))).toBe(true);
    expect(isDeviceEditorDirty(o.baseline, o.current({ label: amp.label }))).toBe(false);
    expect(isDeviceEditorDirty(o.baseline, o.current({ powerDrawW: 450 }))).toBe(true);
    expect(isDeviceEditorDirty(o.baseline, o.current({ note: "spare in truck" }))).toBe(true);
  });

  it("is dirty after a port edit, add, delete or reorder", () => {
    const o = opened();
    const renamed = o.ports.map((p) => (p.id === "amp-xlr-in-1" ? { ...p, label: "Lectern" } : p));
    expect(isDeviceEditorDirty(o.baseline, o.current({}, renamed))).toBe(true);
    const added = [...o.ports, { id: "draft-1-abcd", label: "", signalType: "sdi", direction: "input" } as PortDraft];
    expect(isDeviceEditorDirty(o.baseline, o.current({}, added))).toBe(true);
    expect(isDeviceEditorDirty(o.baseline, o.current({}, o.ports.slice(1)))).toBe(true);
    expect(isDeviceEditorDirty(o.baseline, o.current({}, [o.ports[1], o.ports[0], ...o.ports.slice(2)]))).toBe(true);
  });

  it("treats a badge ticked and unticked again as no change", () => {
    // Unticking writes `multiConnect: undefined` rather than deleting the key.
    const o = opened();
    const toggled = o.ports.map((p) => (p.id === "amp-spk-out-1" ? { ...p, multiConnect: undefined } : p));
    expect(isDeviceEditorDirty(o.baseline, o.current({}, toggled))).toBe(false);
  });

  it("treats the port hide list as a set", () => {
    const o = opened({ ...amp, hiddenPorts: ["amp-power", "amp-xlr-in-2"] });
    expect(isDeviceEditorDirty(o.baseline, o.current({}, o.ports, ["amp-xlr-in-2", "amp-power"]))).toBe(false);
    expect(isDeviceEditorDirty(o.baseline, o.current({}, o.ports, ["amp-xlr-in-2"]))).toBe(true);
  });

  it("ignores a blank auxiliary line that Apply would drop anyway", () => {
    // The fixture Amp carries a "{{deviceType}}" header line; typing into the footer row
    // below it and clearing it again leaves a blank trailing footer row behind.
    const o = opened();
    const aux = o.baseline.fields.auxiliaryData;
    expect(aux.length).toBeGreaterThan(0);
    expect(isDeviceEditorDirty(o.baseline, o.current({ auxiliaryData: [...aux, { text: "", position: "footer" }] }))).toBe(false);
    expect(isDeviceEditorDirty(o.baseline, o.current({ auxiliaryData: [...aux, { text: "{{hostname}}", position: "footer" }] }))).toBe(true);
    expect(isDeviceEditorDirty(o.baseline, o.current({ auxiliaryData: [] }))).toBe(true);
  });

  it("loads the template's reference URL and category when the device has none", () => {
    const f = deviceEditorFields({ ...amp, referenceUrl: undefined, category: undefined }, { referenceUrl: "https://example.com/amp", category: "audio" });
    expect(f.referenceUrl).toBe("https://example.com/amp");
    expect(f.category).toBe("audio");
  });

  it("stableStringify ignores key order and undefined members", () => {
    expect(stableStringify({ a: 1, b: undefined, c: { y: 2, x: 1 } })).toBe(stableStringify({ c: { x: 1, y: 2 }, a: 1 }));
    expect(stableStringify([1, undefined])).toBe("[1,null]");
  });
});
