/**
 * Patch panels built from scratch in the device editor (#424), and port labels on the
 * Patch Bay face (#433).
 *
 * #424: "Create New Device" → Device Type Patch Panel → "+ Bulk Add" in Passthrough
 * Circuits → "Save as User Template" has to produce a template the Patch Bay treats exactly
 * like a bundled panel: offered by the "+ Add panel" picker, placed as a virtual panel, and
 * patchable. Driven through the editor's own data path (`buildBulkPorts` → the pure
 * `buildDeviceTemplate` the Save button calls) and the store's real `addCustomTemplate` /
 * `addOffCanvasPanel` / `addEdgePatchHop`, over the seeded test fixture whose port ids end
 * in -in/-out the way the app's really do.
 *
 * The store reads editor preferences from localStorage at import time, so a minimal
 * in-memory localStorage is installed before the store is imported.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fixture from "../testSchematic/schematic.json";
import { buildBulkPorts, type BulkPortSpec } from "../portBulk";
import { buildDeviceTemplate, type TemplateFormValues, type PortDraft } from "../deviceTemplateBuild";
import { patchPanelCircuits } from "../devices/_helpers";
import {
  checkHopConnectors,
  devicePoint,
  patchBayPortText,
  patchPanelPickerTemplates,
  PATCH_BAY_PORT_LABEL_CHARS,
} from "../patchCircuits";
import { getBundledTemplates } from "../templateApi";
import { connectorLabel } from "../typeRegistry";
import type { DeviceData, DeviceNode, DeviceTemplate, Port, SchematicFile } from "../types";

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

beforeEach(() => {
  useSchematicStore.getState().importFromJSON(structuredClone(file));
  useSchematicStore.getState().clearAllCustomTemplates();
});

/** What the Passthrough Circuits "+ Bulk Add" form submits with its defaults, for an
 *  8-way XLR tie-line panel named XLR1…XLR8. */
const XLR_SPEC: BulkPortSpec = {
  direction: "passthrough",
  prefix: "XLR",
  start: 1,
  count: 8,
  signalType: "sdi",
  connectorType: "xlr-3",
  spaceBeforeNumber: false,
  inheritsSignal: true,
  rearConnectorType: "xlr-3",
  frontConnectorType: "xlr-3",
};

/** The form DeviceEditor hands `buildDeviceTemplate` for a blank device retyped as a panel. */
function panelForm(ports: PortDraft[]): TemplateFormValues {
  return {
    ports,
    label: "Stage Left Tie Lines",
    shortName: "",
    deviceType: "patch-panel",
    color: undefined,
    headerColor: { deviceHeaderColor: undefined, edited: false, savedHeaderColor: undefined, projectDefault: undefined, appDefault: undefined },
    category: "Infrastructure",
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
    existing: undefined,
  };
}

const withoutId = ({ id: _id, ...rest }: Port | PortDraft) => rest;

describe("bulk-adding passthrough circuits (#424)", () => {
  it("builds circuits in patchPanelCircuits()' per-face shape", () => {
    const drafts = buildBulkPorts(XLR_SPEC, (i) => `draft-${i}`);
    const bundled = patchPanelCircuits("XLR", 8, { rearConnectorType: "xlr-3", frontConnectorType: "xlr-3" });
    expect(drafts.map(withoutId)).toEqual(bundled.map(withoutId));
    // Per-face connectors, no single connectorType: the editor rows show Rear/Front set.
    expect(drafts[0].connectorType).toBeUndefined();
    expect(drafts[0].rearConnectorType).toBe("xlr-3");
    expect(drafts[0].frontConnectorType).toBe("xlr-3");
  });

  it("keeps a fixed signal and different faces when asked", () => {
    const [d] = buildBulkPorts(
      { ...XLR_SPEC, count: 1, inheritsSignal: false, signalType: "dmx", rearConnectorType: "solder-cup", frontConnectorType: "xlr-5" },
      String,
    );
    expect(d).toMatchObject({ signalType: "dmx", rearConnectorType: "solder-cup", frontConnectorType: "xlr-5", direction: "passthrough" });
    expect(d.inheritsSignal).toBeUndefined();
  });

  it("reproduces a library panel's fixed-signal circuits when a signal is picked", () => {
    const drafts = buildBulkPorts(
      { ...XLR_SPEC, prefix: "Port", spaceBeforeNumber: true, count: 12, inheritsSignal: false, signalType: "ethernet", rearConnectorType: "rj45", frontConnectorType: "rj45" },
      String,
    );
    // The bundled "Patch Panel 12-Port" (src/devices/infrastructure.ts).
    const library = patchPanelCircuits("Port ", 12, { signalType: "ethernet", rearConnectorType: "rj45", frontConnectorType: "rj45" });
    expect(drafts.map(withoutId)).toEqual(library.map(withoutId));
  });

  it("leaves bulk-added inputs/outputs as they were", () => {
    const [d] = buildBulkPorts({ ...XLR_SPEC, direction: "input", count: 1 }, String);
    expect(d).toMatchObject({ direction: "input", signalType: "sdi", connectorType: "xlr-3" });
    expect(d.rearConnectorType).toBeUndefined();
    expect(d.inheritsSignal).toBeUndefined();
  });
});

describe("a panel saved from the device editor reaches the Patch Bay (#424)", () => {
  function saveFromEditor(): DeviceTemplate {
    const drafts = buildBulkPorts(XLR_SPEC, (i) => `draft-${i}`);
    const tpl = buildDeviceTemplate(panelForm(drafts), { id: "custom-xlr-tie" });
    useSchematicStore.getState().addCustomTemplate(tpl);
    return tpl;
  }

  it("is offered by the + Add panel picker", () => {
    const tpl = saveFromEditor();
    const offered = patchPanelPickerTemplates(useSchematicStore.getState().customTemplates, getBundledTemplates());
    expect(offered.map((t) => t.id)).toContain(tpl.id);
    expect(offered[0].id).toBe(tpl.id); // the user's own panels list first
    // Bundled panels are still there, and non-panels aren't.
    expect(offered.some((t) => t.label === "Patch Panel 24-Port")).toBe(true);
    expect(offered.every((t) => t.deviceType === "patch-panel")).toBe(true);
  });

  it("is not offered when saved with another device type", () => {
    const drafts = buildBulkPorts(XLR_SPEC, (i) => `draft-${i}`);
    const tpl = buildDeviceTemplate({ ...panelForm(drafts), deviceType: "custom" }, { id: "custom-not-a-panel" });
    useSchematicStore.getState().addCustomTemplate(tpl);
    const offered = patchPanelPickerTemplates(useSchematicStore.getState().customTemplates, getBundledTemplates());
    expect(offered.map((t) => t.id)).not.toContain(tpl.id);
  });

  it("places as a virtual panel the Patch Bay draws and can patch a connection through", () => {
    const tpl = saveFromEditor();
    const store = useSchematicStore.getState();
    const panelId = store.addOffCanvasPanel(tpl);
    const panel = useSchematicStore.getState().nodes.find((n) => n.id === panelId) as DeviceNode;
    const data = panel.data as DeviceData;
    expect(data.deviceType).toBe("patch-panel");
    expect(data.offCanvas).toBe(true);
    // The Patch Bay draws a jack per passthrough port.
    const jacks = data.ports.filter((p) => p.direction === "passthrough");
    expect(jacks.map((p) => p.label)).toEqual(["XLR1", "XLR2", "XLR3", "XLR4", "XLR5", "XLR6", "XLR7", "XLR8"]);

    // edge-7: FOH Console XLR out → Amp XLR in — the same check the Patch Bay's click runs.
    const { nodes, edges } = useSchematicStore.getState();
    const edge = edges.find((e) => e.id === "edge-7")!;
    const hop = { panelNodeId: panelId, portId: jacks[2].id };
    expect(checkHopConnectors(
      edge, nodes, hop,
      devicePoint(nodes, edge.source, edge.sourceHandle),
      devicePoint(nodes, edge.target, edge.targetHandle),
    )).toBeNull();
    expect(useSchematicStore.getState().addEdgePatchHop("edge-7", hop)).toBe(true);
    const patched = useSchematicStore.getState().edges.find((e) => e.id === "edge-7")!;
    expect(patched.data?.patchHops).toEqual([hop]);
  });
});

describe("Patch Bay port captions (#433)", () => {
  const dmx: Port = {
    id: "p1", label: "DMX1", signalType: "custom", direction: "passthrough", inheritsSignal: true,
    rearConnectorType: "solder-cup", frontConnectorType: "xlr-5",
  };

  it("prints the port's own label over the jack, connector inside it", () => {
    const t = patchBayPortText(dmx, 0);
    expect(t.position).toBe("01");
    expect(t.label).toBe("DMX1");
    expect(t.shortLabel).toBe("DMX1");
    expect(t.connector).toBe(connectorLabel("xlr-5"));
  });

  it("tells identical connectors apart", () => {
    const a = patchBayPortText({ ...dmx, label: "XLR3" }, 2);
    const b = patchBayPortText({ ...dmx, label: "XLR4" }, 3);
    expect(a.connector).toBe(b.connector);
    expect(a.shortLabel).not.toBe(b.shortLabel);
  });

  it("cuts long labels to fit and keeps the full label in the tooltip", () => {
    const long = "Stage Left DMX Universe 12";
    const t = patchBayPortText({ ...dmx, label: long }, 9);
    expect(t.shortLabel.length).toBe(PATCH_BAY_PORT_LABEL_CHARS);
    expect(t.shortLabel.endsWith("…")).toBe(true);
    expect(t.tooltip).toContain(`10 · ${long}`);
    expect(t.tooltip).toContain(`Rear: ${connectorLabel("solder-cup")} · Front: ${connectorLabel("xlr-5")}`);
  });

  it("applies the display-case transform and tolerates unlabeled ports", () => {
    expect(patchBayPortText(dmx, 0, (s) => s.toLowerCase()).label).toBe("dmx1");
    const blank = patchBayPortText({ ...dmx, label: "" }, 4);
    expect(blank.shortLabel).toBe("");
    expect(blank.tooltip.startsWith("05\n")).toBe(true);
  });

  it("falls back to the single connector on legacy-shaped circuits", () => {
    const t = patchBayPortText({ id: "q", label: "Port 1", signalType: "ethernet", direction: "passthrough", connectorType: "rj45" }, 0);
    expect(t.connector).toBe(connectorLabel("rj45"));
  });
});
