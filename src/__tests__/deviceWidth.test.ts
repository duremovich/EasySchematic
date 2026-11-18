// #418 — the A&H SQ-5's outputs rendered as "Analog Ou…": since the v41 16-px grid
// rescale every device was a fixed 144 px, which leaves a column port label 59 px
// (half the inner width less its 12-px inset) — about ten characters at 10 px.
//
// Rollout: a device flagged `fitWidth` widens, in whole grid cells, just far enough
// that no label truncates; every newly placed device gets the flag, and devices from
// existing files (no flag) stay exactly 144 so opening an old file never reflows it.
// The rendered box, the pre-measurement estimate and the routing harness all apply
// the same gate.
//
// Store-driven cases go through the real addDevice / insertAdapterBetween / CSV import /
// swap / copy-paste / export-import paths over the seeded test fixture (#307), with a
// minimal in-memory localStorage installed before the store is imported.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fixture from "../testSchematic/schematic.json";
import defaultSchematic from "../defaultSchematic.json";
import {
  deviceWidthForLabels,
  estimateDeviceWidth,
  DEVICE_MIN_WIDTH_PX,
  DEVICE_MAX_WIDTH_PX,
} from "../deviceWidth";
import { estimateTextWidthPx } from "../textWidth";
import { templates as audioTemplates } from "../devices/audio";
import { computeDeviceHandles } from "../routingHarness/deviceHandleLayout";
import { getPortAbsolutePositions } from "../snapUtils";
import { buildImportResult, matchDevices, type ParsedConnection } from "../csvImport";
import { planDeviceSwap } from "../deviceSwap";
import { GRID_SIZE } from "../gridConstants";
import { portSide } from "../types";
import type { ConnectionEdge, DeviceData, DeviceNode, DeviceTemplate, Port, SchematicFile, SchematicNode } from "../types";
import type { ReactFlowInstance } from "@xyflow/react";
import DxfParser from "dxf-parser";
import { refitDeviceWidths } from "../deviceWidthRefit";
import { getBundledTemplates } from "../templateApi";
import { syntheticFixtures } from "../routingHarness/syntheticFixtures";
import { DxfWriter } from "../dxfExport/writer";
import { emitDevice } from "../dxfExport/nodes";
import { CANONICAL_LAYERS, LTYPE_DEFS } from "../dxfExport/layers";

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

function sq5Template(): DeviceTemplate {
  const tpl = audioTemplates.find((t) => t.modelNumber === "SQ-5");
  if (!tpl) throw new Error("SQ-5 template missing from the bundled library");
  return tpl;
}

function sq5Data(extra: Partial<DeviceData> = {}): DeviceData {
  const tpl = sq5Template();
  return {
    label: tpl.label,
    deviceType: tpl.deviceType,
    modelNumber: tpl.modelNumber,
    ports: tpl.ports.map((p) => ({ ...p })),
    slots: [],
    ...extra,
  } as DeviceData;
}

/** Room a column port label gets at device width `w` (mirrors DeviceNode's flex halves). */
const columnRoom = (w: number) => (w - 2) / 2 - 12;
const labelPx = (s: string) => estimateTextWidthPx(s, 10);

function port(id: string, label: string, direction: Port["direction"], extra: Partial<Port> = {}): Port {
  return { id, label, signalType: "analog-audio", direction, ...extra } as Port;
}

function lastDevice(): DeviceNode {
  const nodes = useSchematicStore.getState().nodes;
  return nodes[nodes.length - 1] as DeviceNode;
}

function deviceById(id: string): DeviceNode {
  return useSchematicStore.getState().nodes.find((n) => n.id === id) as DeviceNode;
}

describe("device width geometry (#418)", () => {
  it("the SQ-5's real output labels do not fit the standard 144-px box", () => {
    const longestOut = Math.max(
      ...sq5Data().ports.filter((p) => p.direction === "output").map((p) => labelPx(p.label)),
    );
    expect(longestOut).toBeGreaterThan(columnRoom(144)); // "Analog Out 10" ≈ 66 px vs 59
  });

  it("an unflagged device is 144 px regardless of its labels", () => {
    expect(estimateDeviceWidth(sq5Data())).toBe(144);
    const huge = { label: "X", deviceType: "converter", ports: [port("a", "x".repeat(80), "output")] } as DeviceData;
    expect(estimateDeviceWidth(huge)).toBe(144);
  });

  it("a flagged SQ-5 widens to a grid multiple that fits every label", () => {
    const data = sq5Data({ fitWidth: true });
    const w = estimateDeviceWidth(data);
    expect(w).toBe(176);
    expect(w % GRID_SIZE).toBe(0);
    for (const p of data.ports) {
      if (p.direction === "bidirectional") {
        expect(labelPx(`↔ ${p.label}`)).toBeLessThanOrEqual(w - 2);
      } else {
        expect(labelPx(p.label), p.label).toBeLessThanOrEqual(columnRoom(w));
      }
    }
  });

  it("a flagged device whose labels already fit stays 144 px", () => {
    const data = {
      label: "Short",
      deviceType: "converter",
      fitWidth: true,
      ports: [port("a", "SDI In", "input"), port("b", "HDMI Out 1", "output"), port("c", "LAN", "bidirectional")],
    } as DeviceData;
    expect(estimateDeviceWidth(data)).toBe(144);
    expect(deviceWidthForLabels({ leftPorts: [], rightPorts: [] })).toBe(144);
  });

  it("sizes off the wider side, not the input+output sum (columns are equal halves)", () => {
    const wideOut = deviceWidthForLabels({ leftPorts: ["In"], rightPorts: ["Analog Out 12"] });
    const wideBoth = deviceWidthForLabels({ leftPorts: ["Analog In 12"], rightPorts: ["Analog Out 12"] });
    expect(wideOut).toBe(wideBoth);
  });

  it("counts section headers, bidirectional and passthrough labels", () => {
    const long = "Program Return Feed";
    expect(deviceWidthForLabels({ leftPorts: [], rightPorts: [], leftSections: [long] })).toBeGreaterThan(144);
    expect(deviceWidthForLabels({ leftPorts: [], rightPorts: [], bidirPorts: [`${long} ${long}`] })).toBeGreaterThan(144);
    expect(deviceWidthForLabels({ leftPorts: [], rightPorts: [], passthroughPorts: [`${long} 12`] })).toBeGreaterThan(144);
  });

  it("caps at the max width — longer labels truncate with an ellipsis instead", () => {
    expect(deviceWidthForLabels({ leftPorts: ["x".repeat(200)], rightPorts: [] })).toBe(DEVICE_MAX_WIDTH_PX);
  });

  it("ignores ports hidden on the device", () => {
    const data = {
      label: "Hidden",
      deviceType: "converter",
      fitWidth: true,
      ports: [port("a", "In", "input"), port("b", "A Very Long Output Label 12", "output")],
      hiddenPorts: ["b"],
    } as DeviceData;
    expect(estimateDeviceWidth(data)).toBe(144);
    expect(estimateDeviceWidth({ ...data, hiddenPorts: [] })).toBeGreaterThan(144);
  });

  it("re-fits when a flagged device's labels change (a mode, not a frozen number)", () => {
    const data = sq5Data({ fitWidth: true });
    const shortened = { ...data, ports: data.ports.map((p) => ({ ...p, label: p.label.replace("Analog ", "") })) };
    expect(estimateDeviceWidth(shortened)).toBe(DEVICE_MIN_WIDTH_PX);
  });
});

describe("pre-measurement estimates apply the same gate (#418)", () => {
  it("routing harness and snap/placement put a flagged SQ-5's outputs on the widened edge", () => {
    const data = sq5Data({ fitWidth: true });
    const out = data.ports.find((p) => p.label === "Analog Out 12")!;
    expect(portSide(out)).toBe("right");

    expect(computeDeviceHandles({ data }).find((h) => h.id === out.id)!.relX).toBe(176);

    const node = { id: "sq5", type: "device", position: { x: 160, y: 96 }, data } as unknown as SchematicNode;
    const abs = getPortAbsolutePositions(node, new Map([["sq5", node]])).find((p) => p.portId === out.id)!;
    expect(abs.absX).toBe(160 + 176);
  });

  it("…and keep an unflagged SQ-5 at 144", () => {
    const data = sq5Data();
    const out = data.ports.find((p) => p.label === "Analog Out 12")!;
    expect(computeDeviceHandles({ data }).find((h) => h.id === out.id)!.relX).toBe(144);
    const node = { id: "sq5", type: "device", position: { x: 160, y: 96 }, data } as unknown as SchematicNode;
    expect(getPortAbsolutePositions(node, new Map([["sq5", node]])).find((p) => p.portId === out.id)!.absX).toBe(304);
  });

  it("no device in the bundled default schematic or the seeded test fixture is flagged", () => {
    const all = [
      ...(defaultSchematic as unknown as SchematicFile).nodes,
      ...file.nodes,
    ].filter((n) => n.type === "device");
    expect(all.length).toBeGreaterThan(0);
    for (const n of all) expect((n.data as DeviceData).fitWidth).toBeUndefined();
  });
});

describe("fit-width flag — new placements only (#418)", () => {
  beforeEach(() => {
    useSchematicStore.getState().importFromJSON(structuredClone(file));
    useSchematicStore.setState({ templatePresets: {}, pendingIncompatibleConnection: null });
  });

  it("loading an existing file leaves its devices unflagged", () => {
    const devices = useSchematicStore.getState().nodes.filter((n) => n.type === "device");
    expect(devices.length).toBeGreaterThan(0);
    for (const n of devices) expect((n.data as DeviceData).fitWidth).toBeUndefined();
  });

  it("a library placement via addDevice gets the flag, and the SQ-5 then estimates 176", () => {
    useSchematicStore.getState().addDevice(sq5Template(), { x: 0, y: 0 });
    const placed = lastDevice();
    expect(placed.data.fitWidth).toBe(true);
    expect(estimateDeviceWidth(placed.data)).toBe(176);
  });

  it("Create New Device (createAndEditDevice) gets the flag", () => {
    useSchematicStore.getState().createAndEditDevice(sq5Template(), { x: 0, y: 0 });
    expect(lastDevice().data.fitWidth).toBe(true);
  });

  it("an auto-inserted adapter gets the flag", () => {
    const before = new Set(useSchematicStore.getState().nodes.map((n) => n.id));
    useSchematicStore.getState().onConnect({
      source: "device-16",
      sourceHandle: "combo-ts-out",
      target: "device-6",
      targetHandle: "amp-xlr-in-2",
    });
    expect(useSchematicStore.getState().pendingIncompatibleConnection).toBeTruthy();
    const adapterTpl: DeviceTemplate = {
      id: "test-ts-xlr",
      deviceType: "cable-accessory",
      label: "TS → XLR Adapter",
      ports: [
        { id: "adapter-ts-in", label: "TS In", signalType: "analog-audio", direction: "input", connectorType: "ts-quarter" },
        { id: "adapter-xlr-out", label: "XLR Out", signalType: "analog-audio", direction: "output", connectorType: "xlr-3" },
      ],
    };
    expect(useSchematicStore.getState().insertAdapterBetween(adapterTpl)).not.toBe(false);
    const adapter = useSchematicStore.getState().nodes.find((n) => !before.has(n.id) && n.type === "device") as DeviceNode;
    expect(adapter.data.fitWidth).toBe(true);
  });

  it("every device a CSV import creates gets the flag", () => {
    const connections: ParsedConnection[] = [{
      sourceDevice: "Wireless Mic RX", sourcePort: "XLR Out",
      destDevice: "Mixer", destPort: "In 1",
      signalType: "analog-audio", sourceRoom: "", destRoom: "",
    }];
    const { nodes } = buildImportResult(connections, matchDevices(connections, []));
    const devices = nodes.filter((n) => n.type === "device") as DeviceNode[];
    expect(devices.length).toBe(2);
    for (const d of devices) expect(d.data.fitWidth).toBe(true);
  });

  it("the flag survives export → import (save/load)", () => {
    useSchematicStore.getState().addDevice(sq5Template(), { x: 0, y: 0 });
    const id = lastDevice().id;
    const saved = JSON.parse(JSON.stringify(useSchematicStore.getState().exportToJSON())) as SchematicFile;
    useSchematicStore.getState().importFromJSON(saved);
    expect(deviceById(id).data.fitWidth).toBe(true);
    // …and an unflagged device stays unflagged through the same trip.
    const unflaggedId = saved.nodes.find((n) => n.type === "device" && !(n.data as DeviceData).fitWidth)!.id;
    expect(deviceById(unflaggedId).data.fitWidth).toBeUndefined();
  });

  it("copy/paste preserves whatever the source has", () => {
    useSchematicStore.getState().addDevice(sq5Template(), { x: 0, y: 0 });
    const flaggedId = lastDevice().id;
    const unflaggedId = useSchematicStore.getState().nodes.find(
      (n) => n.type === "device" && !(n.data as DeviceData).fitWidth,
    )!.id;
    for (const [srcId, expected] of [[flaggedId, true], [unflaggedId, undefined]] as const) {
      useSchematicStore.setState({
        nodes: useSchematicStore.getState().nodes.map((n) => ({ ...n, selected: n.id === srcId })),
      });
      useSchematicStore.getState().copySelected();
      const before = new Set(useSchematicStore.getState().nodes.map((n) => n.id));
      useSchematicStore.getState().pasteClipboard();
      const pasted = useSchematicStore.getState().nodes.find((n) => !before.has(n.id) && n.type === "device") as DeviceNode;
      expect(pasted.data.fitWidth).toBe(expected);
    }
  });

  it("a device swap keeps the instance's width mode", () => {
    const state = useSchematicStore.getState();
    const legacy = state.nodes.find((n) => n.type === "device" && !(n.data as DeviceData).fitWidth) as DeviceNode;
    useSchematicStore.getState().swapDevice(legacy.id, planDeviceSwap(legacy.data, legacy.id, sq5Template(), state.edges));
    expect(deviceById(legacy.id).data.fitWidth).toBeUndefined();

    useSchematicStore.getState().addDevice(sq5Template(), { x: 0, y: 0 });
    const fresh = lastDevice();
    const s2 = useSchematicStore.getState();
    useSchematicStore.getState().swapDevice(fresh.id, planDeviceSwap(fresh.data, fresh.id, sq5Template(), s2.edges));
    expect(deviceById(fresh.id).data.fitWidth).toBe(true);
  });

  it("setDevicesFitWidth opts a multi-selection in and out in one undo step each", () => {
    const ids = useSchematicStore.getState().nodes.filter((n) => n.type === "device").slice(0, 3).map((n) => n.id);
    useSchematicStore.getState().setDevicesFitWidth(ids, true);
    for (const id of ids) expect(deviceById(id).data.fitWidth).toBe(true);

    useSchematicStore.getState().setDevicesFitWidth(ids, false);
    for (const id of ids) expect("fitWidth" in deviceById(id).data).toBe(false);

    useSchematicStore.getState().undo();
    for (const id of ids) expect(deviceById(id).data.fitWidth).toBe(true);
    useSchematicStore.getState().undo();
    for (const id of ids) expect(deviceById(id).data.fitWidth).toBeUndefined();
  });
});

describe("one width rule, stable sizing (#418 review)", () => {
  it("a flagged device whose labels fit the standard box by the raw estimate stays 144 (no slack-only growth)", () => {
    // Every bundled template whose port and section labels all fit their row's room at
    // 144 px must stay 144 when flagged. The 0.98 slack used to push five of them a cell
    // wider (Disguise GX 3+, BMD Streaming Decoder 4K, Video Assist 12G HDR 5in, …).
    const fitsAt144 = (t: DeviceTemplate) => t.ports.every((p) => {
      if (p.direction === "bidirectional") return labelPx(`↔ ${p.label}`) <= 142;
      if (p.direction === "passthrough") return labelPx(`⇔ ${p.label}`) <= 142 - 24;
      return labelPx(p.label) <= columnRoom(144) && (!p.section || estimateTextWidthPx(p.section, 9) <= columnRoom(144));
    });
    const fitting = getBundledTemplates().filter((t) => t.deviceType !== "patch-panel" && fitsAt144(t));
    expect(fitting.length).toBeGreaterThan(100);
    const grown = fitting
      .map((t) => ({ label: t.label, w: estimateDeviceWidth({ label: t.label, deviceType: t.deviceType, ports: t.ports, fitWidth: true } as DeviceData) }))
      .filter((x) => x.w !== 144);
    expect(grown).toEqual([]);
  });

  it("width ignores connection-dependent visibility, so connecting ports never resizes a device", () => {
    const data = sq5Data({ fitWidth: true });
    expect(estimateDeviceWidth({ ...data, showOnlyConnectedPorts: true })).toBe(estimateDeviceWidth(data));
  });

  it("follows the label-case transform it is given (DeviceNode passes displayLabel)", () => {
    const data = sq5Data({ fitWidth: true });
    expect(estimateDeviceWidth(data, (s) => s.toUpperCase())).toBeGreaterThan(estimateDeviceWidth(data));
    expect(estimateDeviceWidth(sq5Data(), (s) => s.toUpperCase())).toBe(144); // unflagged: always standard
  });

  it("the routing harness fixture with a flagged console routes the widened box", () => {
    const fx = syntheticFixtures().find((f) => f.name === "fit-width-console")!;
    const mixer = fx.nodes.find((n) => n.id === "mixer")!;
    expect((mixer.data as DeviceData).fitWidth).toBe(true);
    expect(mixer.measured?.width).toBe(176);
    const out = (mixer.data as DeviceData).ports.find((p) => p.direction === "output")!;
    expect(computeDeviceHandles(mixer as unknown as { data: DeviceData }).find((h) => h.id === out.id)!.relX).toBe(176);
    // Every other synthetic fixture device is unflagged and stays 144.
    for (const f of syntheticFixtures()) {
      for (const n of f.nodes) {
        if (n.type !== "device" || (n.data as DeviceData).fitWidth) continue;
        expect(n.measured?.width).toBe(144);
      }
    }
  });
});

describe("Fit Width to Labels / Reset re-anchor the right edge (#418 review)", () => {
  /** An unflagged SQ-5 at (160, 96) with: a stub tag hanging off "Analog Out 12", a
   *  manually routed connection from "Analog Out 11" whose first waypoint sits 16 px past
   *  the device's right edge, and a stub on the left (input) side that must not move. */
  function scene() {
    const data = sq5Data();
    const out12 = data.ports.find((p) => p.label === "Analog Out 12")!;
    const out11 = data.ports.find((p) => p.label === "Analog Out 11")!;
    const in1 = data.ports.find((p) => p.label === "Analog In 1")!;
    const device = { id: "sq5", type: "device", position: { x: 160, y: 96 }, data } as unknown as SchematicNode;
    const amp = {
      id: "amp", type: "device", position: { x: 640, y: 96 },
      data: { label: "Amp", deviceType: "amplifier", ports: [{ id: "amp-in", label: "In", direction: "input", signalType: "analog-audio" }] },
    } as unknown as SchematicNode;
    const rightTag = {
      id: "tag-r", type: "stub-label", position: { x: 160 + 144 + 64, y: 300 },
      data: { side: "target", linkedConnectionId: "L1", placed: true },
    } as unknown as SchematicNode;
    const leftTag = {
      id: "tag-l", type: "stub-label", position: { x: 0, y: 120 },
      data: { side: "source", linkedConnectionId: "L2", placed: true },
    } as unknown as SchematicNode;
    const right = 160 + 144;
    const edges = [
      { id: "e-tag-r", source: "sq5", sourceHandle: out12.id, target: "tag-r", targetHandle: "l", data: { signalType: "analog-audio", linkedConnectionId: "L1" } },
      { id: "e-tag-l", source: "tag-l", sourceHandle: "r", target: "sq5", targetHandle: in1.id, data: { signalType: "analog-audio", linkedConnectionId: "L2" } },
      {
        id: "e-wp", source: "sq5", sourceHandle: out11.id, target: "amp", targetHandle: "amp-in",
        data: { signalType: "analog-audio", manualWaypoints: [{ x: right + 16, y: 296 }, { x: right + 16, y: 112 }, { x: 600, y: 112 }] },
      },
    ] as unknown as ConnectionEdge[];
    return { nodes: [device, amp, rightTag, leftTag], edges };
  }

  it("Fit shifts the right-side tag and the swallowed waypoints by the width delta; the left tag stays", () => {
    const { nodes, edges } = scene();
    const r = refitDeviceWidths(nodes, edges, ["sq5"], true);
    expect(r.changedIds).toEqual(["sq5"]);
    expect(r.clearedRouteEdgeIds).toEqual([]);
    const delta = 176 - 144;
    const byId = new Map(r.nodes.map((n) => [n.id, n]));
    expect(byId.get("tag-r")!.position.x).toBe(160 + 144 + 64 + delta); // 64-px gap kept
    expect(byId.get("tag-l")!.position.x).toBe(0);
    const wps = r.edges.find((e) => e.id === "e-wp")!.data!.manualWaypoints!;
    // The vertical pair right of the edge moves together; the far waypoint stays.
    expect(wps).toEqual([{ x: 160 + 176 + 16, y: 296 }, { x: 160 + 176 + 16, y: 112 }, { x: 600, y: 112 }]);
  });

  it("Reset to Standard Width moves them back exactly", () => {
    const { nodes, edges } = scene();
    const fitted = refitDeviceWidths(nodes, edges, ["sq5"], true);
    const reset = refitDeviceWidths(fitted.nodes, fitted.edges, ["sq5"], false);
    expect(reset.nodes.find((n) => n.id === "tag-r")!.position).toEqual(nodes.find((n) => n.id === "tag-r")!.position);
    expect(reset.edges.find((e) => e.id === "e-wp")!.data!.manualWaypoints).toEqual(edges.find((e) => e.id === "e-wp")!.data!.manualWaypoints);
    expect("fitWidth" in (reset.nodes.find((n) => n.id === "sq5")!.data as DeviceData)).toBe(false);
  });

  it("clears (rather than folds back) a manual route the shift would reverse", () => {
    const { nodes, edges } = scene();
    // First leg right, then a horizontal run that turns back left just past the band:
    // shifting the first waypoint right by 32 would put it beyond the next one.
    const right = 160 + 144;
    const folded = edges.map((e) => e.id !== "e-wp" ? e : {
      ...e, data: { ...e.data!, manualWaypoints: [{ x: right + 40, y: 296 }, { x: right + 56, y: 296 }, { x: right + 56, y: 112 }] },
    }) as ConnectionEdge[];
    const r = refitDeviceWidths(nodes, folded, ["sq5"], true);
    expect(r.clearedRouteEdgeIds).toEqual(["e-wp"]);
    expect(r.edges.find((e) => e.id === "e-wp")!.data!.manualWaypoints).toBeUndefined();
  });

  it("leaves everything alone when the width doesn't change (labels already fit)", () => {
    const short = {
      id: "s", type: "device", position: { x: 0, y: 0 },
      data: { label: "S", deviceType: "converter", ports: [port("o", "Out", "output")] },
    } as unknown as SchematicNode;
    const r = refitDeviceWidths([short], [], ["s"], true);
    expect((r.nodes[0].data as DeviceData).fitWidth).toBe(true);
    expect(r.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("the store action does it all as one undo step", () => {
    const { nodes, edges } = scene();
    useSchematicStore.setState({ nodes, edges });
    useSchematicStore.getState().setDevicesFitWidth(["sq5"], true);
    expect(deviceById("sq5").data.fitWidth).toBe(true);
    expect(useSchematicStore.getState().nodes.find((n) => n.id === "tag-r")!.position.x).toBe(160 + 176 + 64);
    expect(useSchematicStore.getState().edges.find((e) => e.id === "e-wp")!.data!.manualWaypoints![0].x).toBe(160 + 176 + 16);
    // Waypoint handles are re-derived from the shifted manual waypoints (one per waypoint).
    expect(useSchematicStore.getState().nodes.filter((n) => n.type === "waypoint").length).toBe(3);
    useSchematicStore.getState().undo();
    expect(deviceById("sq5").data.fitWidth).toBeUndefined();
    expect(useSchematicStore.getState().nodes.find((n) => n.id === "tag-r")!.position.x).toBe(160 + 144 + 64);
    expect(useSchematicStore.getState().edges.find((e) => e.id === "e-wp")!.data!.manualWaypoints![0].x).toBe(160 + 144 + 16);
  });
});

describe("new-device placement surfaces use the fitted width (#418 review)", () => {
  const conn = (sourcePort: string): ParsedConnection[] => [{
    sourceDevice: "Console", sourcePort,
    destDevice: "Amp", destPort: "In 1",
    signalType: "analog-audio", sourceRoom: "FOH", destRoom: "FOH",
  }];

  it("CSV import spaces columns and sizes rooms by the imported devices' real widths", () => {
    const longPort = "Program Return Feed Out 12";
    const { nodes } = buildImportResult(conn(longPort), matchDevices(conn(longPort), []));
    const consoleNode = nodes.find((n) => n.type === "device" && (n.data as DeviceData).label === "Console") as DeviceNode;
    const ampNode = nodes.find((n) => n.type === "device" && (n.data as DeviceData).label === "Amp") as DeviceNode;
    const w = estimateDeviceWidth(consoleNode.data);
    expect(w).toBeGreaterThan(144);
    // Same room, so both positions are room-relative: the next column starts the
    // standard 176-px gap past the wide device, not 320 px from its left edge.
    expect(ampNode.position.x - consoleNode.position.x).toBe(w + 176);
    const room = nodes.find((n) => n.type === "room")!;
    const roomW = (room.style as { width: number }).width;
    expect(roomW).toBeGreaterThanOrEqual(ampNode.position.x + estimateDeviceWidth(ampNode.data));
    expect(roomW).toBeGreaterThanOrEqual(consoleNode.position.x + w);
  });

  it("CSV import with standard-width devices keeps the historical 320-px column pitch", () => {
    const { nodes } = buildImportResult(conn("Out 1"), matchDevices(conn("Out 1"), []));
    const xs = nodes.filter((n) => n.type === "device").map((n) => n.position.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBe(320);
  });
});

describe("DXF export uses the same width (#418 review)", () => {
  function dxfPortTexts(data: DeviceData, measured?: { width: number; height: number }): string[] {
    const node = { id: "sq5", type: "device", position: { x: 0, y: 0 }, data, ...(measured ? { measured } : {}) } as unknown as SchematicNode;
    // handleBounds from the harness layout — the exporter reads label rows off them.
    const handles = computeDeviceHandles({ data });
    const rf = {
      getInternalNode: () => ({
        internals: {
          positionAbsolute: { x: 0, y: 0 },
          handleBounds: { source: handles.map((h) => ({ id: h.id, x: h.relX - 5, y: h.relY - 5, width: 10, height: 10 })), target: [] },
        },
      }),
    } as unknown as ReactFlowInstance;
    const w = new DxfWriter();
    w.setExtents({ x: 0, y: 0 }, { x: 10, y: 10 });
    w.writeHeader(); w.writeClasses(); w.writeTables([{ name: "0", color: 7 }], LTYPE_DEFS);
    w.writeBlocks(); w.startEntities();
    emitDevice(w, node, rf, [], undefined, "USD", {});
    w.endEntities(); w.writeObjects(); w.writeEof();
    const parsed = new DxfParser().parseSync(w.toString()) as { entities: { type: string; layer: string; text?: string }[] };
    return parsed.entities.filter((e) => e.type === "TEXT" && e.layer === CANONICAL_LAYERS.PORTS).map((e) => e.text!);
  }

  it("a flagged SQ-5 exports every output label in full (measured or not)", () => {
    const data = sq5Data({ fitWidth: true });
    for (const texts of [dxfPortTexts(data), dxfPortTexts(data, { width: 176, height: 400 })]) {
      for (let n = 1; n <= 12; n++) expect(texts).toContain(`Analog Out ${n}`);
      expect(texts.some((t) => t.endsWith("..."))).toBe(false);
    }
  });

  it("an unflagged SQ-5 still clips its long outputs at 144, as on the canvas", () => {
    const texts = dxfPortTexts(sq5Data());
    expect(texts).not.toContain("Analog Out 12");
    expect(texts.some((t) => t.startsWith("Analog Ou") && t.endsWith("..."))).toBe(true);
  });
});
