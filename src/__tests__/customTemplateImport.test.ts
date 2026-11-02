// #251 — "importing an archive of 3 new devices wiped every device imported before and kept
// only the 3". Import is meant to be additive, and every single-tab path below already was.
// The report was not reproduced as described; the stale-second-tab case is the one way found
// to produce exactly that symptom, so the store now guards against it. These cases drive the
// real store against an in-memory localStorage and reload the store between steps the way a
// page refresh (or a second tab) would.

import { describe, it, expect, vi } from "vitest";
import { parseTemplateArchive, parseTemplateFile, type TemplateExportFile } from "../templateExport";
import type { DeviceTemplate } from "../types";

const TEMPLATES_KEY = "easyschematic-custom-templates";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

type Store = typeof import("../store")["useSchematicStore"];

/** Load a fresh store module over the given storage — a page load (or a second tab). */
async function loadStore(storage: MemStorage): Promise<Store> {
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  vi.resetModules();
  return (await import("../store")).useSchematicStore;
}

const tpl = (id: string, label: string, deviceType = "converter"): DeviceTemplate => ({
  id,
  label,
  deviceType,
  ports: [{ id: "p1", label: "HDMI In", signalType: "hdmi", direction: "input", connectorType: "hdmi" }],
} as DeviceTemplate);

/** What File → Save Device Archive writes, read back the way File → Open Device Archive reads it. */
const archive = (templates: DeviceTemplate[]): DeviceTemplate[] =>
  parseTemplateFile(JSON.stringify({ version: 1, templates } satisfies TemplateExportFile));

const ids = (ts: DeviceTemplate[]) => ts.map((t) => t.id ?? t.deviceType).sort();
const stored = (s: MemStorage) => JSON.parse(s.getItem(TEMPLATES_KEY) ?? "[]") as DeviceTemplate[];

const RELOAD_TIMEOUT = 60000;

describe("custom device archive import is additive (#251)", () => {
  it("keeps every existing custom device when an archive of new ones is imported, across a reload", async () => {
    const storage = new MemStorage();
    const existing = [
      tpl("custom-1700000000001", "Rack Tie Line"),
      tpl("import-1700000000002-abc123", "Imported Scaler"),
      // Legacy shape: no id, key carried in deviceType (migrated on load).
      { ...tpl("", "Legacy Box", "custom-1600000000000"), id: undefined } as unknown as DeviceTemplate,
    ];
    storage.setItem(TEMPLATES_KEY, JSON.stringify(existing));

    let store = await loadStore(storage);
    expect(store.getState().customTemplates).toHaveLength(3);

    store.getState().importCustomTemplates(archive([
      tpl("custom-1800000000001", "New A"),
      tpl("custom-1800000000002", "New B"),
      tpl("custom-1800000000003", "New C"),
    ]));

    expect(store.getState().customTemplates).toHaveLength(6);
    expect(stored(storage)).toHaveLength(6);

    store = await loadStore(storage);
    expect(store.getState().customTemplates).toHaveLength(6);
    // Every device is reachable from the library's order list (what the sidebar renders).
    const order = new Set(store.getState().customTemplateOrder);
    for (const t of store.getState().customTemplates) expect(order.has(t.id ?? t.deviceType)).toBe(true);
  }, RELOAD_TIMEOUT);

  it("merges a coworker's archive into my library", async () => {
    const mine = new MemStorage();
    const theirs = new MemStorage();

    let a = await loadStore(mine);
    a.getState().addCustomTemplate(tpl("custom-1700000000101", "My DSP"));
    a.getState().addCustomTemplate(tpl("custom-1700000000102", "My Amp"));

    const b = await loadStore(theirs);
    b.getState().addCustomTemplate(tpl("custom-1700000000201", "Their Cam"));
    b.getState().addCustomTemplate(tpl("custom-1700000000202", "Their Encoder"));
    b.getState().addCustomTemplate(tpl("custom-1700000000203", "Their Decoder"));
    const sent = archive(JSON.parse(JSON.stringify(b.getState().exportCustomTemplates())));

    a = await loadStore(mine);
    a.getState().importCustomTemplates(sent);
    a = await loadStore(mine);
    expect(ids(a.getState().customTemplates)).toEqual([
      "custom-1700000000101", "custom-1700000000102",
      "custom-1700000000201", "custom-1700000000202", "custom-1700000000203",
    ]);
  }, RELOAD_TIMEOUT);

  it("keeps existing custom devices when a schematic file carrying templates is opened", async () => {
    const storage = new MemStorage();
    storage.setItem(TEMPLATES_KEY, JSON.stringify([tpl("custom-1", "Old 1"), tpl("custom-2", "Old 2")]));
    let store = await loadStore(storage);
    const file = store.getState().exportToJSON();
    file.customTemplates = [tpl("custom-3", "New 3")];
    store.getState().importFromJSON(file);
    store = await loadStore(storage);
    expect(ids(store.getState().customTemplates)).toEqual(["custom-1", "custom-2", "custom-3"]);
  }, RELOAD_TIMEOUT);

  it("keeps devices imported in another tab when a stale tab imports an archive", async () => {
    // Two tabs (or the installed app plus a browser tab) share one localStorage. Tab 1 was
    // opened before the team's devices were imported; it never hears about them.
    const storage = new MemStorage();
    const tab1 = await loadStore(storage);
    const tab2 = await loadStore(storage);

    tab2.getState().importCustomTemplates(archive([
      tpl("custom-1", "Team 1"), tpl("custom-2", "Team 2"), tpl("custom-3", "Team 3"), tpl("custom-4", "Team 4"),
    ]));
    expect(stored(storage)).toHaveLength(4);

    // Later, the three new devices are imported from the stale tab.
    tab1.getState().importCustomTemplates(archive([
      tpl("custom-5", "New 5"), tpl("custom-6", "New 6"), tpl("custom-7", "New 7"),
    ]));

    const reloaded = await loadStore(storage);
    expect(ids(reloaded.getState().customTemplates)).toEqual([
      "custom-1", "custom-2", "custom-3", "custom-4", "custom-5", "custom-6", "custom-7",
    ]);
  }, RELOAD_TIMEOUT);

  it("doesn't resurrect a device deleted in another tab when a stale tab next saves", async () => {
    const storage = new MemStorage();
    storage.setItem(TEMPLATES_KEY, JSON.stringify([tpl("custom-1", "A"), tpl("custom-2", "B"), tpl("custom-3", "C")]));
    const tab1 = await loadStore(storage);
    const tab2 = await loadStore(storage);

    tab2.getState().removeCustomTemplate("custom-2");
    // tab1 missed the storage event (e.g. it was frozen in the back/forward cache).
    tab1.getState().addCustomTemplate(tpl("custom-4", "D"));

    expect(ids(stored(storage))).toEqual(["custom-1", "custom-3", "custom-4"]);
    expect(ids(tab1.getState().customTemplates)).toEqual(["custom-1", "custom-3", "custom-4"]);
  }, RELOAD_TIMEOUT);

  it("treats a cleared library as empty, not never-saved, when a stale tab imports", async () => {
    const storage = new MemStorage();
    storage.setItem(TEMPLATES_KEY, JSON.stringify([tpl("custom-1", "A"), tpl("custom-2", "B")]));
    const tab1 = await loadStore(storage);
    const tab2 = await loadStore(storage);

    tab2.getState().clearAllCustomTemplates();
    expect(storage.getItem(TEMPLATES_KEY)).toBe("[]");
    tab1.getState().importCustomTemplates(archive([tpl("custom-9", "New")]));

    expect(ids(stored(storage))).toEqual(["custom-9"]);
  }, RELOAD_TIMEOUT);

  it("re-reads the library when a page is restored from the back/forward cache", async () => {
    const storage = new MemStorage();
    storage.setItem(TEMPLATES_KEY, JSON.stringify([tpl("custom-1", "A")]));
    const g = globalThis as Record<string, unknown>;
    const win = new EventTarget();
    // Just enough DOM for the store's import-time side effects (signal colour CSS vars).
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      documentElement: {
        style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        dataset: {},
      },
    });
    g.window = win;
    g.document = doc;
    try {
      const tab = await loadStore(storage);
      expect(ids(tab.getState().customTemplates)).toEqual(["custom-1"]);

      // Another tab changed the library while this one sat frozen.
      storage.setItem(TEMPLATES_KEY, JSON.stringify([tpl("custom-1", "A"), tpl("custom-2", "B")]));

      const notRestored = Object.assign(new Event("pageshow"), { persisted: false });
      win.dispatchEvent(notRestored);
      expect(ids(tab.getState().customTemplates)).toEqual(["custom-1"]);

      win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
      expect(ids(tab.getState().customTemplates)).toEqual(["custom-1", "custom-2"]);
    } finally {
      delete g.window;
      delete g.document;
    }
  }, RELOAD_TIMEOUT);
});

// Custom types P5: a file carries the definitions of the non-built-in types it uses, so it
// opens with the right labels and colours on a client (a fresh profile) that never saw them.
describe("custom types travel with files and archives (custom-types P5)", () => {
  const SIG = "x-show-comms-k3f9";
  const CON = "x-weco-3-pin-a1b2";
  const signalDef = { id: SIG, label: "Show Comms", color: "#008848", group: "Control", defaultConnector: CON, cable: "Comms", cablePrefix: "SC" };
  const connectorDef = { id: CON, label: "WECO 3-pin", group: "Power", cable: "WECO", gender: "female" as const, matesWith: [], adaptsTo: ["bnc"] };
  const device = {
    id: "d1", type: "device", position: { x: 0, y: 0 },
    data: { label: "Comms Box", deviceType: "converter", ports: [{ id: "p1", label: "COMMS", signalType: SIG, connectorType: CON, direction: "output" }] },
  };

  /** A fresh page load: store, user-type library and registry over `storage`. */
  async function loadApp(storage: MemStorage) {
    const store = await loadStore(storage);
    const userTypes = await import("../userTypes");
    const registry = await import("../typeRegistry");
    const { needsAdapter } = await import("../connectorTypes");
    userTypes.initUserTypes();
    return { store, userTypes, registry, needsAdapter };
  }

  it("customTypes survives save → open in a fresh profile, and the reload after", async () => {
    const mine = await loadApp(new MemStorage());
    mine.userTypes.saveUserType("connector", connectorDef);
    mine.userTypes.saveUserType("signal", signalDef);
    const file = mine.store.getState().exportToJSON();
    file.nodes = [device as unknown as (typeof file.nodes)[number]];
    const saved = JSON.parse(JSON.stringify({ ...file, customTypes: undefined }));
    // What File → Save writes for that drawing:
    mine.store.getState().importFromJSON(saved);
    const written = JSON.parse(JSON.stringify(mine.store.getState().exportToJSON()));
    expect(written.version).toBe(44);
    expect(written.customTypes).toEqual({ signals: [signalDef], connectors: [connectorDef] });

    const freshStorage = new MemStorage();
    const fresh = await loadApp(freshStorage);
    expect(fresh.registry.signalLabel(SIG)).toBe(SIG); // never seen: raw id
    fresh.store.getState().importFromJSON(written);
    expect(fresh.registry.signalLabel(SIG)).toBe("Show Comms");
    expect(fresh.registry.signalColor(SIG)).toBe("#008848");
    expect(fresh.registry.connectorLabel(CON)).toBe("WECO 3-pin");
    expect(fresh.needsAdapter(CON, "bnc")).toBe(true);
    // Opening a file registers its types for the document; it doesn't join the library.
    expect(fresh.userTypes.userTypeLibrary().signals).toEqual([]);
    expect(fresh.store.getState().exportToJSON().customTypes).toEqual(written.customTypes);

    // Reload: the autosave carries the document's types too.
    const reloaded = await loadApp(freshStorage);
    expect(reloaded.registry.signalLabel(SIG)).toBe(SIG);
    reloaded.store.getState().loadFromLocalStorage();
    expect(reloaded.registry.signalLabel(SIG)).toBe("Show Comms");
    reloaded.store.getState().newSchematic();
    expect(reloaded.registry.signalLabel(SIG)).toBe(SIG);
  }, RELOAD_TIMEOUT);

  it("a colliding id: the file's definition wins in that document, the library keeps its own", async () => {
    const storage = new MemStorage();
    const app = await loadApp(storage);
    app.userTypes.saveUserType("signal", signalDef);
    const file = app.store.getState().exportToJSON();
    file.nodes = [device as unknown as (typeof file.nodes)[number]];
    file.customTypes = { signals: [{ ...signalDef, label: "Their Comms", color: "#2563eb" }] };
    app.store.getState().importFromJSON(JSON.parse(JSON.stringify(file)));
    expect(app.registry.signalLabel(SIG)).toBe("Their Comms");
    expect(app.registry.signalColor(SIG)).toBe("#2563eb");
    expect(app.userTypes.findUserType("signal", SIG)?.label).toBe("Show Comms");
    expect(JSON.parse(storage.getItem("easyschematic-custom-types")!).signals[0].color).toBe("#008848");
    app.store.getState().newSchematic();
    expect(app.registry.signalLabel(SIG)).toBe("Show Comms");
  }, RELOAD_TIMEOUT);

  it("a file's junk definitions are dropped or defanged, never registered as-is", async () => {
    const app = await loadApp(new MemStorage());
    const file = app.store.getState().exportToJSON();
    file.customTypes = JSON.parse(JSON.stringify({
      signals: [
        { id: "x-ok-aaaa", label: "OK", color: "url(javascript:alert(1))", group: "Control" },
        { id: "Not An Id", label: "Bad id" },
        { id: "x-nolabel-bbbb" },
      ],
    }));
    app.store.getState().importFromJSON(file);
    expect(app.registry.signalLabel("x-ok-aaaa")).toBe("OK");
    expect(app.registry.signalColor("x-ok-aaaa")).toBe("#71717a");
    expect(app.registry.isKnownSignal("Not An Id")).toBe(false);
    expect(app.registry.isKnownSignal("x-nolabel-bbbb")).toBe(false);
  }, RELOAD_TIMEOUT);

  it("a device archive carries the library's types; a stale tab doesn't drop another tab's types", async () => {
    const storage = new MemStorage();
    const tab1 = await loadApp(storage);
    const tab2 = await loadApp(storage);
    tab2.userTypes.saveUserType("signal", signalDef);
    // tab1 never heard about it, then imports an archive with a connector type.
    const parsed = parseTemplateArchive(JSON.stringify({ version: 1, templates: [tpl("custom-1", "Box")], customTypes: { connectors: [connectorDef] } }));
    tab1.store.getState().importCustomTemplates(parsed.templates, parsed.customTypes);
    const lib = JSON.parse(storage.getItem("easyschematic-custom-types")!);
    expect(lib.signals.map((d: { id: string }) => d.id)).toEqual([SIG]);
    expect(lib.connectors.map((d: { id: string }) => d.id)).toEqual([CON]);
    expect(tab1.registry.connectorLabel(CON)).toBe("WECO 3-pin");
  }, RELOAD_TIMEOUT);
});
