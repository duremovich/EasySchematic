/**
 * Guards on the seeded test schematic (#307).
 *
 * The fixture only earns its keep if a test pass can trust it: the committed
 * JSON must match the builder, every connection must land on a handle the app
 * actually renders, and each of the scenarios #307 lists must really be present.
 * Without these, a fixture quietly loses coverage and a test pass silently stops
 * testing the thing it thinks it is testing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildTestSchematic } from "../testSchematic/build";
import committed from "../testSchematic/schematic.json";
import { CURRENT_SCHEMA_VERSION } from "../migrations";
import { computeDeviceHandles } from "../routingHarness/deviceHandleLayout";
import { inventoryKeyFromDeviceData, inventoryKeyFromTemplate } from "../inventoryKey";
import {
  areConnectorsCompatible,
  findAdaptersForConnectorBridge,
  findAdaptersForSignalBridge,
  needsAdapter,
} from "../connectorTypes";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import type { ConnectorType, DeviceData, Port, SchematicNode } from "../types";

const fixture = buildTestSchematic();
const devices = fixture.nodes.filter((n) => n.type === "device") as (SchematicNode & { data: DeviceData })[];
const rooms = fixture.nodes.filter((n) => n.type === "room");
const allPorts: Port[] = devices.flatMap((n) => n.data.ports);

const JSON_PATH = fileURLToPath(new URL("../testSchematic/schematic.json", import.meta.url));

describe("test schematic — generated JSON", () => {
  it("is in sync with the builder", () => {
    // Same comparison `npm run fixture:check` makes, so a forgotten regenerate
    // fails in CI rather than at the start of a manual test pass.
    expect(readFileSync(JSON_PATH, "utf8")).toBe(JSON.stringify(fixture, null, 2) + "\n");
  });

  it("is stamped at the current schema version", () => {
    expect(committed.version).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe("test schematic — structural integrity", () => {
  it("gives every node and edge a unique id", () => {
    const nodeIds = fixture.nodes.map((n) => n.id);
    const edgeIds = fixture.edges.map((e) => e.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });

  it("connects every edge to a handle DeviceNode actually renders", () => {
    // A stale handle id is dropped by removeOrphanedEdges on load, so the
    // connection would just silently vanish from the loaded fixture.
    const handlesByNode = new Map(
      devices.map((n) => [n.id, new Set(computeDeviceHandles(n).map((h) => h.id))]),
    );
    for (const e of fixture.edges) {
      expect(handlesByNode.get(e.source), `${e.id}: unknown source node ${e.source}`).toBeDefined();
      expect(handlesByNode.get(e.target), `${e.id}: unknown target node ${e.target}`).toBeDefined();
      expect(
        handlesByNode.get(e.source)!.has(e.sourceHandle!),
        `${e.id}: no source handle ${e.sourceHandle} on ${e.source}`,
      ).toBe(true);
      expect(
        handlesByNode.get(e.target)!.has(e.targetHandle!),
        `${e.id}: no target handle ${e.targetHandle} on ${e.target}`,
      ).toBe(true);
    }
  });

  it("keeps every device inside its room", () => {
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    for (const dev of devices) {
      if (!dev.parentId) continue;
      const room = roomById.get(dev.parentId)!;
      expect(room, `${dev.id} has no room`).toBeDefined();
      const right = dev.position.x + (dev.measured?.width ?? 0);
      const bottom = dev.position.y + (dev.measured?.height ?? 0);
      expect(right, `${dev.id} overflows ${room.id} horizontally`).toBeLessThanOrEqual(room.measured!.width!);
      expect(bottom, `${dev.id} overflows ${room.id} vertically`).toBeLessThanOrEqual(room.measured!.height!);
    }
  });

  it("never overlaps two devices in the same room column", () => {
    const seen: { id: string; x: number; y: number; w: number; h: number; parent?: string }[] = [];
    for (const dev of devices) {
      const box = {
        id: dev.id,
        x: dev.position.x,
        y: dev.position.y,
        w: dev.measured?.width ?? 0,
        h: dev.measured?.height ?? 0,
        parent: dev.parentId,
      };
      for (const other of seen) {
        if (other.parent !== box.parent) continue;
        const overlaps =
          box.x < other.x + other.w && other.x < box.x + box.w &&
          box.y < other.y + other.h && other.y < box.y + box.h;
        expect(overlaps, `${box.id} overlaps ${other.id}`).toBe(false);
      }
      seen.push(box);
    }
  });
});

describe("test schematic — #307 coverage", () => {
  it("carries fiber ports in all four terminations", () => {
    const fiberConnectors = new Set(
      allPorts.filter((p) => p.signalType === "fiber").map((p) => p.connectorType),
    );
    for (const c of ["lc", "sc", "st", "opticalcon"] as ConnectorType[]) {
      expect(fiberConnectors.has(c), `no fiber port terminated in ${c}`).toBe(true);
    }
  });

  it("wires mixed fiber runs in both directions", () => {
    // Two opposite LC↔SC runs are what force the pack list to collapse them into
    // a single "2x LC to SC Fiber" row instead of two mirrored rows.
    const portById = new Map(allPorts.map((p) => [p.id, p]));
    const connectorOf = (handle: string) =>
      portById.get(handle.replace(/-(in|out|rear|front)$/, ""))?.connectorType;
    const fiberPairs = fixture.edges
      .filter((e) => e.data?.signalType === "fiber")
      .map((e) => `${connectorOf(e.sourceHandle!)}→${connectorOf(e.targetHandle!)}`);
    expect(fiberPairs).toContain("lc→sc");
    expect(fiberPairs).toContain("sc→lc");
    expect(fiberPairs).toContain("st→opticalcon");
  });

  it("leaves a free input AND a free output on every fiber termination", () => {
    // Both directions, or a test pass has to delete a pre-wired run before it can
    // draw a mixed run *from* that termination — the 307-13 finding.
    const used = usedPortIds();
    for (const c of ["lc", "sc", "st", "opticalcon"] as ConnectorType[]) {
      const free = allPorts.filter(
        (p) => p.signalType === "fiber" && p.connectorType === c && !used.has(p.id),
      );
      expect(free.some((p) => p.direction === "output"), `no free ${c} fiber output`).toBe(true);
      expect(free.some((p) => p.direction === "input"), `no free ${c} fiber input`).toBe(true);
    }
  });

  it("offers an unwired USB-A ↔ Ethernet pair that auto-inserts in both directions", () => {
    const used = usedPortIds();
    const usbA = allPorts.find((p) => p.connectorType === "usb-a" && !used.has(p.id));
    const rj45 = allPorts.find((p) => p.connectorType === "rj45" && p.signalType === "ethernet" && !used.has(p.id));
    expect(usbA, "no free USB-A port").toBeDefined();
    expect(rj45, "no free RJ45 port").toBeDefined();
    // Both drag directions must resolve to exactly one adapter, or the user gets
    // the picker dialog instead of an auto-insert.
    expect(findAdaptersForSignalBridge("usb", "ethernet", DEVICE_TEMPLATES)).toHaveLength(1);
    expect(findAdaptersForSignalBridge("ethernet", "usb", DEVICE_TEMPLATES)).toHaveLength(1);
  });

  it("offers the mirrored XLR-3 ↔ 1/4\" TRS bench, unwired", () => {
    const used = usedPortIds();
    const free = (connector: ConnectorType, direction: Port["direction"]) =>
      allPorts.find((p) => p.connectorType === connector && p.direction === direction && !used.has(p.id));
    expect(free("xlr-3", "output"), "no free XLR-3 output").toBeDefined();
    expect(free("trs-quarter", "input"), "no free TRS input").toBeDefined();
    expect(free("trs-quarter", "output"), "no free TRS output").toBeDefined();
    expect(free("xlr-3", "input"), "no free XLR-3 input").toBeDefined();
    expect(findAdaptersForConnectorBridge("xlr-3", "trs-quarter", "analog-audio", DEVICE_TEMPLATES).length)
      .toBeGreaterThan(0);
    expect(findAdaptersForConnectorBridge("trs-quarter", "xlr-3", "analog-audio", DEVICE_TEMPLATES).length)
      .toBeGreaterThan(0);
  });

  it("offers the mirrored Edison ↔ IEC power bench, unwired", () => {
    const used = usedPortIds();
    const free = (connector: ConnectorType, direction: Port["direction"]) =>
      allPorts.find((p) => p.connectorType === connector && p.direction === direction && !used.has(p.id));
    expect(free("edison", "output"), "no free Edison output").toBeDefined();
    expect(free("iec", "input"), "no free IEC input").toBeDefined();
    expect(free("iec", "output"), "no free IEC output").toBeDefined();
    expect(free("edison", "input"), "no free Edison input").toBeDefined();
    expect(findAdaptersForConnectorBridge("edison", "iec", "power", DEVICE_TEMPLATES).length).toBeGreaterThan(0);
    expect(findAdaptersForConnectorBridge("iec", "edison", "power", DEVICE_TEMPLATES).length).toBeGreaterThan(0);
  });

  it("offers the EU/UK power bench, unwired (#390)", () => {
    const used = usedPortIds();
    const free = (connector: ConnectorType, direction: Port["direction"]) =>
      allPorts.find((p) => p.connectorType === connector && p.direction === direction && !used.has(p.id));
    expect(free("schuko", "output"), "no free Schuko output").toBeDefined();
    expect(free("schuko", "input"), "no free Schuko input").toBeDefined();
    expect(free("europlug", "input"), "no free Europlug input").toBeDefined();
    expect(free("uk-power", "input"), "no free UK Power input").toBeDefined();
    // Europlug → Schuko is a NATIVE mate: the bench run must connect with no
    // adapter and no dialog.
    expect(areConnectorsCompatible("europlug", "schuko")).toBe(true);
    expect(needsAdapter("europlug", "schuko")).toBe(false);
    // UK <-> Schuko needs an adapter, and the bundled library now carries the EU/UK power
    // adapters (#408), so both drag directions resolve to exactly one template, which is
    // what store.onConnect auto-inserts. euUkPowerAdapters.test.ts drives the real drop.
    expect(needsAdapter("uk-power", "schuko")).toBe(true);
    expect(findAdaptersForConnectorBridge("schuko", "uk-power", "power", DEVICE_TEMPLATES)).toHaveLength(1);
    expect(findAdaptersForConnectorBridge("uk-power", "schuko", "power", DEVICE_TEMPLATES)).toHaveLength(1);
  });

  it("has a patch panel with wide connector and gender combinations", () => {
    const panel = devices.find((d) => d.id === "device-8")!;
    const through = panel.data.ports.filter((p) => p.direction === "passthrough");
    expect(through.length).toBeGreaterThanOrEqual(8);
    // Distinct rear connectors, at least one front/rear mismatch and one gender split.
    expect(new Set(through.map((p) => p.rearConnectorType)).size).toBeGreaterThanOrEqual(6);
    expect(through.some((p) => p.rearConnectorType !== p.frontConnectorType)).toBe(true);
    expect(through.some((p) => p.rearGender !== p.frontGender)).toBe(true);
    expect(through.some((p) => p.normalledTo)).toBe(true);
  });

  it("patches at least two circuits end to end through the panel", () => {
    const patched = new Set(
      fixture.edges
        .filter((e) => e.source === "device-8" || e.target === "device-8")
        .map((e) => (e.source === "device-8" ? e.sourceHandle! : e.targetHandle!).replace(/-(rear|front)$/, "")),
    );
    // A circuit needs both a rear feed and a front feed on the same port.
    const complete = [...patched].filter((portId) =>
      fixture.edges.some((e) => e.targetHandle === `${portId}-rear`) &&
      fixture.edges.some((e) => e.sourceHandle === `${portId}-front`),
    );
    expect(complete.length).toBeGreaterThanOrEqual(2);
  });

  it("offers a compatible, unwired same-signal HDMI pair within one viewport (#378)", () => {
    // #366's verification had to substitute devices: the only HDMI source (Designer
    // Laptop) was 1900+ flow units from the nearest HDMI input. A connection drag
    // needs both ends on screen at 100% zoom, so the pair must fit one viewport.
    const used = usedPortIds();
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const abs = (d: SchematicNode) => {
      const room = d.parentId ? roomById.get(d.parentId) : undefined;
      return { x: d.position.x + (room?.position.x ?? 0), y: d.position.y + (room?.position.y ?? 0) };
    };
    const ownerOf = (portId: string) => devices.find((d) => d.data.ports.some((p) => p.id === portId))!;
    const outs = allPorts.filter((p) => p.connectorType === "hdmi" && p.direction === "output" && !used.has(p.id));
    const ins = allPorts.filter((p) => p.connectorType === "hdmi" && p.direction === "input" && !used.has(p.id));
    // A 1280x720 box is the small end of a real 100%-zoom canvas.
    const VIEW_W = 1280;
    const VIEW_H = 720;
    const pair = outs.flatMap((o) => ins.map((i) => [o, i] as const)).find(([o, i]) => {
      const a = ownerOf(o.id);
      const b = ownerOf(i.id);
      if (a.id === b.id || o.signalType !== i.signalType) return false;
      const pa = abs(a);
      const pb = abs(b);
      const w = Math.max(pa.x + (a.measured?.width ?? 0), pb.x + (b.measured?.width ?? 0)) - Math.min(pa.x, pb.x);
      const h = Math.max(pa.y + (a.measured?.height ?? 0), pb.y + (b.measured?.height ?? 0)) - Math.min(pa.y, pb.y);
      return w <= VIEW_W && h <= VIEW_H;
    });
    expect(pair, "no free same-signal HDMI out/in pair fits one 100%-zoom viewport").toBeDefined();
    const [outPort, inPort] = pair!;
    expect(areConnectorsCompatible(outPort.connectorType, inPort.connectorType)).toBe(true);
    expect(needsAdapter(outPort.connectorType, inPort.connectorType)).toBe(false);
  });

  it("carries an unwired patch panel that can be virtualized (#378)", () => {
    const panels = devices.filter((d) => d.data.deviceType === "patch-panel" && d.data.ports.some((p) => p.direction === "passthrough"));
    const unwired = panels.filter((d) => !fixture.edges.some((e) => e.source === d.id || e.target === d.id));
    expect(unwired.length, "no passthrough patch panel without connections").toBeGreaterThanOrEqual(1);
    // PP-01 is the wired one, so the unwired one has to be a different panel.
    expect(unwired.some((d) => d.id !== "device-8")).toBe(true);
    expect(unwired[0].data.ports.filter((p) => p.direction === "passthrough").length).toBeGreaterThanOrEqual(2);
  });

  it("names rooms so all four label-case modes are distinguishable", () => {
    const labels = rooms.map((r) => (r.data as { label: string }).label);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    // Mixed case: the only spelling where As-typed and Capitalize differ.
    expect(labels.some((l) => l !== l.toUpperCase() && l !== l.toLowerCase() && l[0] === l[0].toLowerCase()))
      .toBe(true);
    // All caps: As-typed must leave it alone.
    expect(labels.some((l) => l === l.toUpperCase())).toBe(true);
  });

  it("leaves devices deliberately roomless for the blank sentinel", () => {
    expect(devices.filter((d) => !d.parentId).length).toBeGreaterThanOrEqual(1);
  });

  it("mixes very short and very long device names, all with header aux rows", () => {
    const withHeaderAux = devices.filter((d) =>
      d.data.auxiliaryData?.some((row) => row.position === "header"),
    );
    // Every device carries one: the #249 dead-space bug is invisible without it,
    // because HEADER_BAND_MIN_PX clamps the band when the header is empty.
    expect(withHeaderAux.length).toBe(devices.length);
    const lengths = devices.map((d) => d.data.label.length);
    expect(Math.min(...lengths)).toBeLessThanOrEqual(6);
    expect(Math.max(...lengths)).toBeGreaterThanOrEqual(40);
  });

  it("instantiates at least one device genuinely from a bundled template", () => {
    // #332: every other fixture device is synthetic (no templateId), so the device
    // editor's template-family actions (Update as Custom, Save as Preset, Revert to
    // Template) had no fixture device to exercise them on.
    const templated = devices.find((d) => d.data.templateId);
    expect(templated, "no fixture device carries a templateId").toBeDefined();
    const template = DEVICE_TEMPLATES.find((t) => t.id === templated!.data.templateId);
    expect(template, `${templated!.id} points at an unknown template`).toBeDefined();
    // Ports must be genuine clones (new ids, but traceable back via templatePortId),
    // not the template's own port objects reused verbatim.
    expect(templated!.data.ports.length).toBe(template!.ports.length);
    for (const [i, p] of templated!.data.ports.entries()) {
      expect(p.id).not.toBe(template!.ports[i].id);
      expect(p.templatePortId).toBe(template!.ports[i].id);
    }
    // Dirty relative to the template (a hidden port) so Revert to Template is
    // reachable too, not just Update as Custom / Save as Preset.
    expect(templated!.data.hiddenPorts?.length ?? 0).toBeGreaterThan(0);
    // Metadata addDevice copies off the template. `category` in particular is set on
    // the template by deviceLibrary at import time, not present in the seed data, so
    // it's easy to omit and it silently degrades "Update as Custom".
    expect(templated!.data.category).toBe(template!.category);
    expect(templated!.data.manufacturer).toBe(template!.manufacturer);
    expect(templated!.data.modelNumber).toBe(template!.modelNumber);
    expect(templated!.data.searchTerms).toEqual(template!.searchTerms);
    expect(templated!.data.templateVersion).toBe(template!.version);
  });

  it("carries owned gear in all three stock states", () => {
    const owned = fixture.ownedGear ?? [];
    expect(owned.length).toBeGreaterThanOrEqual(3);
    const placedByKey = new Map<string, number>();
    for (const d of devices) {
      const key = inventoryKeyFromDeviceData(d.data);
      placedByKey.set(key, (placedByKey.get(key) ?? 0) + 1);
    }
    const states = owned.map((item) => {
      const placed = placedByKey.get(inventoryKeyFromTemplate(item.template)) ?? 0;
      expect(placed, `owned gear "${item.template.label}" matches no placed device`).toBeGreaterThan(0);
      return Math.sign(item.quantity - placed);
    });
    expect(states, "need a surplus, an exact match and a shortfall").toEqual(
      expect.arrayContaining([1, 0, -1]),
    );
  });
});

describe("test schematic — #368 adapter-bench spacing", () => {
  it("keeps every adapter-bench pair in different columns with clear space for insertAdapterBetween's free-slot search", () => {
    // store.ts insertAdapterBetween places the adapter via findFreeAdapterSlot
    // (adapterPlacement.ts), which prefers the midpoint between the pair. That
    // slot is only collision-free when the gap between the two paired devices
    // clears DEVICE_W_EST(144) + 2 * ADAPTER_GAP.x(80) = 304px (strict
    // inequality, so exactly 304 still fits) — below that the search falls
    // back to slots away from the bench (see README.md and the COL_GAP
    // comment in build.ts).
    const MIN_CLEAR = 304;
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const byId = new Map(devices.map((d) => [d.id, d]));
    const absX = (dev: SchematicNode) => {
      const room = dev.parentId ? roomById.get(dev.parentId) : undefined;
      return dev.position.x + (room?.position.x ?? 0);
    };
    // The three unwired adapter benches, plus the second Edison↔IEC pairing
    // Rack UPS sits between (Powered Speaker (IEC) 1 on one side, Utility Bar
    // on the other).
    const benches: [string, string][] = [
      ["device-10", "device-9"], // USB Hub ↔ Core Switch (USB-A ↔ RJ45)
      ["device-15", "device-17"], // FOH Console ↔ Playback Deck (XLR-3 ↔ TRS)
      ["device-12", "device-11"], // Powered Speaker (IEC) 1 ↔ Rack UPS (Edison ↔ IEC)
      ["device-11", "device-14"], // Rack UPS ↔ Utility Bar (IEC ↔ Edison)
    ];
    for (const [aId, bId] of benches) {
      const a = byId.get(aId)!;
      const b = byId.get(bId)!;
      expect(a.parentId, `${aId} has no room`).toBeDefined();
      expect(a.parentId, `${aId}/${bId} must share a room`).toBe(b.parentId);
      const ax = absX(a);
      const bx = absX(b);
      const aw = a.measured?.width ?? 0;
      const bw = b.measured?.width ?? 0;
      expect(ax, `${aId}/${bId} must sit in different columns`).not.toBe(bx);
      const gap = ax < bx ? bx - (ax + aw) : ax - (bx + bw);
      expect(gap, `${aId} ↔ ${bId} clear gap`).toBeGreaterThanOrEqual(MIN_CLEAR);
    }
  });
});

/** Port ids with at least one connection on them. */
function usedPortIds(): Set<string> {
  const used = new Set<string>();
  for (const e of fixture.edges) {
    for (const handle of [e.sourceHandle, e.targetHandle]) {
      if (handle) used.add(handle.replace(/-(in|out|rear|front)$/, ""));
    }
  }
  return used;
}
