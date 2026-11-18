/**
 * Copy/paste of a whole schematic must produce an independent copy (#395).
 *
 * Reported as "select all → copy → paste: the devices copy fine, but the pasted connections
 * get mixed up with the original ones". Driven through the same store actions the canvas
 * uses (selectAll / copySelected / pasteClipboard, i.e. Ctrl+A / Ctrl+C / Ctrl+V) on the
 * seeded test fixture, enriched through real actions with everything that carries ids or
 * absolute coordinates: manual waypoints, a stubbed connection, a bundle with a dragged
 * trunk, a text stub, an expansion-card device wired through a card port, and an
 * auto-inserted adapter.
 *
 * Every pasted connection must land on pasted devices, on the SAME port of each (the
 * fixture's switch and patch panel are bidirectional / passthrough, so their handles carry
 * "-in"/"-out"/"-rear"/"-front" face suffixes on top of the port id), and anything
 * positional must move with the pasted devices instead of staying on the originals.
 *
 * The store reads editor preferences from localStorage at import time, so a minimal
 * in-memory localStorage is installed before the store is imported.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fixture from "../testSchematic/schematic.json";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import { findPortByHandle, strippedHandleId } from "../portHandles";
import type {
  ConnectionEdge,
  DeviceData,
  Port,
  SchematicFile,
  SchematicNode,
  StubLabelData,
  TextStubData,
} from "../types";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  get length() { return this.m.size; }
}

let useSchematicStore: typeof import("../store").useSchematicStore;
const S = () => useSchematicStore.getState();

beforeAll(async () => {
  vi.stubGlobal("localStorage", new MemStorage());
  ({ useSchematicStore } = await import("../store"));
});
afterAll(() => { vi.unstubAllGlobals(); });

/** Node types copySelected skips (re-spawned on paste from edge / bundle data). */
const DERIVED = new Set(["waypoint", "bundle-junction"]);

function loadFixture() {
  S().importFromJSON(structuredClone(fixture) as unknown as SchematicFile);
  useSchematicStore.setState({ toasts: [] });
}

const node = (id: string) => S().nodes.find((n) => n.id === id)!;
const edge = (id: string) => S().edges.find((e) => e.id === id)!;
const dev = (n: SchematicNode) => n.data as DeviceData;

function absPos(n: SchematicNode, nodes: SchematicNode[]): { x: number; y: number } {
  let x = n.position.x;
  let y = n.position.y;
  let pid = n.parentId;
  while (pid) {
    const p = nodes.find((m) => m.id === pid);
    if (!p) break;
    x += p.position.x;
    y += p.position.y;
    pid = p.parentId;
  }
  return { x, y };
}

/** Enrich the fixture through real actions with every id-/coordinate-bearing feature. */
function enrich() {
  // Manual waypoints on a bidirectional → passthrough run (Core Switch → PP-01 rear).
  S().setManualWaypoints("edge-5", [{ x: 700, y: 300 }, { x: 700, y: 520 }]);
  // A stubbed connection: two tags + two legs sharing one linkedConnectionId.
  S().convertEdgeToStubs("edge-11", { silentBundleToast: true });
  // A bundle (the FOH snake) with a user-dragged trunk.
  S().createBundle(["edge-7", "edge-8"]);
  const bundleId = edge("edge-7").data!.bundleId!;
  S().setBundleTrunkWaypoints(bundleId, [{ x: 4000, y: 200 }, { x: 2600, y: 200 }]);
  // A text stub anchored to a bidirectional switch port.
  S().addTextStub("device-9", "sw-port-3");
  // An expansion-card device (Disguise VX 1, HDMI VFC card) wired through a card port.
  const vx1 = DEVICE_TEMPLATES.find((t) => t.label === "Disguise VX 1" && t.slots?.some((s) => s.defaultCardId));
  expect(vx1, "slotted template present in the library").toBeTruthy();
  const before = new Set(S().nodes.map((n) => n.id));
  S().addDevice(vx1!, { x: 0, y: 1500 });
  const vx = S().nodes.find((n) => !before.has(n.id) && n.type === "device")!;
  const slot = dev(vx).slots!.find((s) => s.portIds.length > 0)!;
  const cardOut = dev(vx).ports.find((p) => slot.portIds.includes(p.id) && p.signalType === "hdmi" && p.direction === "output")!;
  S().onConnect({ source: vx.id, sourceHandle: cardOut.id, target: "device-25", targetHandle: "pvmon-hdmi-in" });
  // An auto-inserted adapter on the USB ↔ Ethernet bench (USB Hub → Core Switch).
  // A single library match auto-inserts; several would leave the picker pending.
  S().onConnect({ source: "device-10", sourceHandle: "hub-usb-out-1", target: "device-9", targetHandle: "sw-port-4-in" });
  if (S().pendingIncompatibleConnection) {
    S().insertAdapterBetween(DEVICE_TEMPLATES.find((t) => t.label === "USB-A (M) → RJ45 (F) Adapter")!);
  }
  expect(S().nodes.some((n) => n.type === "device" && dev(n).deviceType === "adapter"), "adapter inserted").toBe(true);
  useSchematicStore.setState({ toasts: [] });
  return { vxId: vx.id, bundleId };
}

interface Snap { nodes: SchematicNode[]; edges: ConnectionEdge[] }
const snap = (): Snap => structuredClone({ nodes: S().nodes, edges: S().edges });

/** Rooms first, otherwise stable — the order sortNodesParentFirst leaves a flat room set in. */
const roomsFirst = (ns: SchematicNode[]) => [...ns.filter((n) => n.type === "room"), ...ns.filter((n) => n.type !== "room")];

/**
 * Pair every copied original with its paste. Paste appends nodes and connections in
 * clipboard order (= store order of the selection); a reparent pass may then hoist rooms
 * ahead, so compare both sides rooms-first and zip by position.
 */
function pairUp(before: Snap, copiedNodeIds: Set<string>) {
  const beforeNodeIds = new Set(before.nodes.map((n) => n.id));
  const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
  const origNodes = roomsFirst(before.nodes.filter((n) => copiedNodeIds.has(n.id)));
  const newNodes = roomsFirst(S().nodes.filter((n) => !beforeNodeIds.has(n.id) && !DERIVED.has(n.type!)));
  expect(newNodes.length).toBe(origNodes.length);
  const nodeMap = new Map(origNodes.map((n, i) => [n.id, newNodes[i]]));
  const newEdges = S().edges.filter((e) => !beforeEdgeIds.has(e.id));
  return { nodeMap, newNodes, newEdges };
}

/** Same port on the paste: same index in the port list (clonePorts keeps order) and
 *  the same face suffix on the handle. */
function expectSamePort(origDev: SchematicNode, origHandle: string, pasteDev: SchematicNode, pasteHandle: string) {
  const origPort = findPortByHandle(dev(origDev), origHandle)!;
  expect(origPort, `original handle ${origHandle} resolves on ${origDev.id}`).toBeTruthy();
  const pastePort = findPortByHandle(dev(pasteDev), pasteHandle);
  expect(pastePort, `pasted handle ${pasteHandle} resolves on ${pasteDev.id} (orig ${origDev.id}.${origHandle})`).toBeTruthy();
  expect(dev(pasteDev).ports.indexOf(pastePort!)).toBe(dev(origDev).ports.indexOf(origPort));
  expect(pastePort!.label).toBe(origPort.label);
  const origSuffix = origPort.id === origHandle ? "" : origHandle.slice(origPort.id.length);
  const pasteSuffix = pastePort!.id === pasteHandle ? "" : pasteHandle.slice(pastePort!.id.length);
  expect(pasteSuffix).toBe(origSuffix);
}

function expectEdgeCopied(orig: ConnectionEdge, pasted: ConnectionEdge, before: Snap, nodeMap: Map<string, SchematicNode>) {
  const src = nodeMap.get(orig.source)!;
  const tgt = nodeMap.get(orig.target)!;
  expect(pasted.source, `${orig.id} source`).toBe(src.id);
  expect(pasted.target, `${orig.id} target`).toBe(tgt.id);
  const origSrc = before.nodes.find((n) => n.id === orig.source)!;
  const origTgt = before.nodes.find((n) => n.id === orig.target)!;
  if (origSrc.type === "device") expectSamePort(origSrc, orig.sourceHandle!, src, pasted.sourceHandle!);
  else expect(pasted.sourceHandle).toBe(orig.sourceHandle);
  if (origTgt.type === "device") expectSamePort(origTgt, orig.targetHandle!, tgt, pasted.targetHandle!);
  else expect(pasted.targetHandle).toBe(orig.targetHandle);
  // A pasted connection is a new cable (#88).
  expect(pasted.data?.cableId).toBeUndefined();
}

beforeEach(() => {
  S().newSchematic();
  useSchematicStore.setState({ toasts: [], cableIdMap: {} });
});

describe("select all → copy → paste (#395)", () => {
  it("every pasted connection lands on the pasted devices' matching ports; originals untouched", () => {
    loadFixture();
    // Stack the FOH room below everything else, as a real layout would: its devices'
    // positions are room-relative (small y) while the room itself sits far down, so a
    // selection height measured from raw positions comes out far too short.
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => (n.id === "room-3" ? { ...n, position: { x: 0, y: 1600 } } : n)),
    });
    const { vxId, bundleId } = enrich();
    const before = snap();

    S().selectAll();
    S().copySelected();
    S().pasteClipboard();

    // Select All never selects rooms, but every room whose contents are all copied comes along.
    const hasKids = (id: string) => before.nodes.some((n) => n.parentId === id);
    const copied = new Set(
      before.nodes.filter((n) => !DERIVED.has(n.type!) && (n.type !== "room" || hasKids(n.id))).map((n) => n.id),
    );
    expect(S().nodes.filter((n) => n.type === "room").length).toBe(6);
    const { nodeMap, newNodes, newEdges } = pairUp(before, copied);
    const pastedIds = new Set(newNodes.map((n) => n.id));
    const origIds = new Set(before.nodes.map((n) => n.id));

    // Room membership: the copy lives in the pasted rooms, never in an original one, and
    // each pasted node sits inside its room's box.
    for (const [oid, p] of nodeMap) {
      const o = before.nodes.find((n) => n.id === oid)!;
      expect(p.parentId === undefined || !origIds.has(p.parentId), `${p.id} (copy of ${oid}) parented to original ${p.parentId}`).toBe(true);
      expect(p.parentId).toBe(o.parentId ? nodeMap.get(o.parentId)!.id : undefined);
      if (!p.parentId || p.type !== "device") continue;
      const room = node(p.parentId);
      const ra = absPos(room, S().nodes);
      const pa = absPos(p, S().nodes);
      const cx = pa.x + (p.measured?.width ?? 144) / 2;
      const cy = pa.y + (p.measured?.height ?? 48) / 2;
      const rw = room.measured?.width ?? (room.style?.width as number);
      const rh = room.measured?.height ?? (room.style?.height as number);
      expect(cx >= ra.x && cx <= ra.x + rw && cy >= ra.y && cy <= ra.y + rh, `${p.id} inside pasted room ${room.id}`).toBe(true);
    }

    // Originals are exactly as they were.
    for (const o of before.edges) {
      const now = edge(o.id);
      expect(now, `original ${o.id} still present`).toBeTruthy();
      expect([now.source, now.sourceHandle, now.target, now.targetHandle]).toEqual([o.source, o.sourceHandle, o.target, o.targetHandle]);
      expect(now.data?.manualWaypoints).toEqual(o.data?.manualWaypoints);
    }

    // Every original connection between copied devices has a paste, pairwise.
    const origEdges = before.edges.filter((e) => copied.has(e.source) && copied.has(e.target));
    expect(newEdges.length).toBe(origEdges.length);
    origEdges.forEach((o, i) => {
      const p = newEdges[i];
      expect(pastedIds.has(p.source) && pastedIds.has(p.target), `${p.id} touches only pasted devices`).toBe(true);
      expectEdgeCopied(o, p, before, nodeMap);
    });

    // Every pasted device moved by the same absolute offset (so the copy is not overlaid
    // on, or tangled into, the original).
    const shifts = new Set<string>();
    for (const [oid, p] of nodeMap) {
      const o = before.nodes.find((n) => n.id === oid)!;
      const a = absPos(o, before.nodes);
      const b = absPos(p, S().nodes);
      shifts.add(`${b.x - a.x},${b.y - a.y}`);
    }
    expect(shifts.size).toBe(1);
    const [dx, dy] = [...shifts][0].split(",").map(Number);
    expect(dx).toBe(0);
    expect(dy).toBeGreaterThan(0);

    // The copy sits entirely below the original: no overlap with any original device.
    const origMaxY = Math.max(...before.nodes.filter((n) => copied.has(n.id)).map((n) => absPos(n, before.nodes).y + (n.measured?.height ?? 48)));
    const pasteMinY = Math.min(...newNodes.map((n) => absPos(n, S().nodes).y));
    expect(pasteMinY).toBeGreaterThan(origMaxY);

    // Manual waypoints move with the copy.
    const wpOrigIdx = origEdges.findIndex((e) => e.id === "edge-5");
    const wpPaste = newEdges[wpOrigIdx];
    expect(wpPaste.data?.manualWaypoints).toEqual(
      edge("edge-5").data!.manualWaypoints!.map((w) => ({ x: w.x + dx, y: w.y + dy })),
    );
    // ...and their draggable waypoint handles are spawned at the moved positions.
    const wpNodes = S().nodes.filter((n) => n.type === "waypoint" && (n.data as { edgeId: string }).edgeId === wpPaste.id);
    expect(wpNodes.map((n) => n.position)).toEqual(wpPaste.data!.manualWaypoints);

    // Stubbed connection: re-keyed link, both tags + both legs share it, none shared with the original.
    const origLink = before.edges.find((e) => e.data?.linkedConnectionId)!.data!.linkedConnectionId!;
    const pastedLegs = newEdges.filter((e) => e.data?.linkedConnectionId);
    expect(pastedLegs.length).toBe(2);
    const newLink = pastedLegs[0].data!.linkedConnectionId!;
    expect(newLink).not.toBe(origLink);
    expect(pastedLegs[1].data!.linkedConnectionId).toBe(newLink);
    const pastedTags = newNodes.filter((n) => n.type === "stub-label");
    expect(pastedTags.length).toBe(2);
    for (const t of pastedTags) expect((t.data as StubLabelData).linkedConnectionId).toBe(newLink);
    for (const leg of pastedLegs) {
      const tagEnd = pastedIds.has(leg.source) && node(leg.source).type === "stub-label" ? leg.source : leg.target;
      expect(pastedTags.map((t) => t.id)).toContain(tagEnd);
    }

    // Bundle: new id, its own meta, trunk override moved with the copy.
    const pastedBundleIds = new Set(newEdges.map((e) => e.data?.bundleId).filter(Boolean));
    expect(pastedBundleIds.size).toBe(1);
    const newBundle = [...pastedBundleIds][0]!;
    expect(newBundle).not.toBe(bundleId);
    expect(S().bundles[newBundle]?.trunkWaypoints).toEqual(
      S().bundles[bundleId].trunkWaypoints!.map((w) => ({ x: w.x + dx, y: w.y + dy })),
    );

    // Text stub follows its pasted device and port.
    const origStub = before.nodes.find((n) => n.type === "text-stub")!;
    const pasteStub = nodeMap.get(origStub.id)!;
    const sd = pasteStub.data as TextStubData;
    const pastedSwitch = nodeMap.get("device-9")!;
    expect(sd.anchorNodeId).toBe(pastedSwitch.id);
    const anchored = dev(pastedSwitch).ports.find((p) => p.id === sd.anchorPortId);
    expect(anchored?.label).toBe(dev(node("device-9")).ports.find((p) => p.id === "sw-port-3")!.label);

    // Expansion-card slot bookkeeping points at the pasted device's own ports.
    const vxPaste = nodeMap.get(vxId)!;
    const vxOrig = node(vxId);
    const pasteIds = new Set(dev(vxPaste).ports.map((p) => p.id));
    dev(vxPaste).slots!.forEach((s, i) => {
      const o = dev(vxOrig).slots![i];
      expect(s.slotId).toBe(o.slotId);
      expect(s.portIds.length).toBe(o.portIds.length);
      for (const pid of s.portIds) expect(pasteIds.has(pid), `slot ${s.slotId} port ${pid} exists on paste`).toBe(true);
      expect(s.portIds.map((pid) => dev(vxPaste).ports.findIndex((p) => p.id === pid)))
        .toEqual(o.portIds.map((pid) => dev(vxOrig).ports.findIndex((p) => p.id === pid)));
    });

    // Hidden ports remain the same ports, on the paste's own ids.
    for (const [oid, p] of nodeMap) {
      const o = node(oid);
      if (o.type !== "device" || !dev(o).hiddenPorts?.length) continue;
      expect(dev(p).hiddenPorts!.map((h) => dev(p).ports.findIndex((q) => q.id === h)))
        .toEqual(dev(o).hiddenPorts!.map((h) => dev(o).ports.findIndex((q) => q.id === h)));
    }

    // No pasted connection references a port id that exists only on an original device.
    const origPortIds = new Set(before.nodes.flatMap((n) => (n.type === "device" ? dev(n).ports.map((p) => p.id) : [])));
    for (const e of newEdges) {
      for (const h of [e.sourceHandle, e.targetHandle]) {
        if (!h) continue;
        expect(origPortIds.has(h) || origPortIds.has(strippedHandleId(h) ?? ""), `${e.id} handle ${h} is an original's port`).toBe(false);
      }
    }

    // Dragging an original room moves none of the copy (React Flow moves a room's children
    // with it, so a pasted device still parented to an original room would be dragged along).
    const pastedAbs = new Map(newNodes.map((n) => [n.id, absPos(n, S().nodes)]));
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => (n.id === "room-3" ? { ...n, position: { x: n.position.x + 700, y: n.position.y + 300 } } : n)),
    });
    for (const n of newNodes) expect(absPos(node(n.id), S().nodes), `${n.id} unmoved`).toEqual(pastedAbs.get(n.id));
  });

  it("pasting twice yields two independent copies, each offset again", () => {
    loadFixture();
    const { bundleId } = enrich();
    S().selectAll();
    S().copySelected();
    const before1 = snap();
    S().pasteClipboard();
    const after1 = snap();
    S().pasteClipboard();

    const hasKids = (id: string) => before1.nodes.some((n) => n.parentId === id);
    const copied = new Set(
      before1.nodes.filter((n) => !DERIVED.has(n.type!) && (n.type !== "room" || hasKids(n.id))).map((n) => n.id),
    );
    const first = (() => {
      const ids = new Set(before1.nodes.map((n) => n.id));
      return after1.nodes.filter((n) => !ids.has(n.id) && !DERIVED.has(n.type!));
    })();
    const { nodeMap, newEdges } = pairUp(after1, new Set(first.map((n) => n.id)));
    // Second paste mirrors the first paste one offset further down.
    const firstEdges = after1.edges.filter((e) => !before1.edges.some((b) => b.id === e.id));
    expect(newEdges.length).toBe(firstEdges.length);
    expect(first.length).toBe(copied.size);
    const dys = new Set<number>();
    for (const [fid, p] of nodeMap) {
      const f = after1.nodes.find((n) => n.id === fid)!;
      const a = absPos(f, after1.nodes);
      const b = absPos(p, S().nodes);
      expect(b.x).toBe(a.x);
      dys.add(b.y - a.y);
    }
    expect(dys.size).toBe(1);
    const dy = [...dys][0];
    expect(dy).toBeGreaterThan(0);
    firstEdges.forEach((o, i) => {
      expectEdgeCopied(o, newEdges[i], after1, nodeMap);
      const wps = o.data?.manualWaypoints;
      if (wps) expect(newEdges[i].data?.manualWaypoints).toEqual(wps.map((w) => ({ x: w.x, y: w.y + dy })));
      if (o.data?.linkedConnectionId) expect(newEdges[i].data?.linkedConnectionId).not.toBe(o.data.linkedConnectionId);
      if (o.data?.bundleId) expect(newEdges[i].data?.bundleId).not.toBe(o.data.bundleId);
    });
    // Each copy's bundle trunk sits one offset below the previous one — the second copy's
    // snake must not be drawn on top of the first copy's.
    const firstBundle = firstEdges.find((e) => e.data?.bundleId)!.data!.bundleId!;
    const secondBundle = newEdges.find((e) => e.data?.bundleId)!.data!.bundleId!;
    const orig = S().bundles[bundleId].trunkWaypoints!;
    expect(S().bundles[firstBundle].trunkWaypoints).toEqual(orig.map((w) => ({ x: w.x, y: w.y + dy })));
    expect(S().bundles[secondBundle].trunkWaypoints).toEqual(orig.map((w) => ({ x: w.x, y: w.y + 2 * dy })));
  });

  it("a pasted bundle keeps its label after the original is ungrouped", () => {
    loadFixture();
    const { bundleId } = enrich();
    S().setBundleMeta(bundleId, { label: "FOH Snake" });
    S().selectAll();
    S().copySelected();
    S().dissolveBundle(bundleId);
    const before = snap();
    S().pasteClipboard();
    const pasted = S().edges.filter((e) => !before.edges.some((b) => b.id === e.id) && e.data?.bundleId);
    expect(pasted.length).toBe(2);
    const meta = S().bundles[pasted[0].data!.bundleId!];
    expect(meta.label).toBe("FOH Snake");
    expect(meta.trunkWaypoints).toHaveLength(2);
  });
});

describe("port ids shared between devices (#395)", () => {
  it("each pasted connection resolves on its own pasted device", () => {
    // Port ids are only unique within a device. CSV import numbers its port prefixes from a
    // per-page-load counter ("p1-0", "p2-0", …), so two imports in two sessions produce
    // different devices carrying identical port ids — here, two encoders both "p1-*".
    const mk = (id: string, x: number, ports: Port[]): SchematicNode =>
      ({ id, type: "device", position: { x, y: 0 }, measured: { width: 160, height: 120 }, data: { label: id, deviceType: "encoder", ports } }) as SchematicNode;
    const enc = (id: string, x: number) => mk(id, x, [
      { id: "p1-0", label: "HDMI In", signalType: "hdmi", direction: "input", connectorType: "hdmi" },
      { id: "p1-1", label: "LAN", signalType: "ethernet", direction: "bidirectional", connectorType: "rj45" },
    ]);
    const sw = mk("device-90", 600, [
      { id: "p3-0", label: "Port 1", signalType: "ethernet", direction: "bidirectional", connectorType: "rj45" },
      { id: "p3-1", label: "Port 2", signalType: "ethernet", direction: "bidirectional", connectorType: "rj45" },
    ]);
    const src = mk("device-89", -600, [
      { id: "p4-0", label: "HDMI Out 1", signalType: "hdmi", direction: "output", connectorType: "hdmi" },
      { id: "p4-1", label: "HDMI Out 2", signalType: "hdmi", direction: "output", connectorType: "hdmi" },
    ]);
    useSchematicStore.setState({
      nodes: [enc("device-91", 0), enc("device-92", 0), sw, src].map((n, i) => ({ ...n, position: { x: n.position.x, y: i === 1 ? 200 : 0 } })),
      edges: [
        { id: "edge-91", source: "device-91", sourceHandle: "p1-1-out", target: "device-90", targetHandle: "p3-0-in", data: { signalType: "ethernet" } },
        { id: "edge-92", source: "device-92", sourceHandle: "p1-1-out", target: "device-90", targetHandle: "p3-1-in", data: { signalType: "ethernet" } },
        // Bare (unsuffixed) handles on the shared ids: one global old→new port map let the
        // second encoder overwrite the first, wiring both pasted feeds into one copy.
        { id: "edge-93", source: "device-89", sourceHandle: "p4-0", target: "device-91", targetHandle: "p1-0", data: { signalType: "hdmi" } },
        { id: "edge-94", source: "device-89", sourceHandle: "p4-1", target: "device-92", targetHandle: "p1-0", data: { signalType: "hdmi" } },
      ] as ConnectionEdge[],
    });
    const before = snap();
    S().selectAll();
    S().copySelected();
    S().pasteClipboard();
    const { nodeMap, newEdges } = pairUp(before, new Set(["device-91", "device-92", "device-90", "device-89"]));
    expect(newEdges.length).toBe(4);
    before.edges.forEach((o, i) => expectEdgeCopied(o, newEdges[i], before, nodeMap));
  });
});

describe("copying within one room doesn't duplicate the room (#395 follow-up)", () => {
  const roomCount = () => S().nodes.filter((n) => n.type === "room").length;

  it("all of one room's devices paste as devices, back into that room", () => {
    loadFixture();
    const kids = new Set(S().nodes.filter((n) => n.parentId === "room-3").map((n) => n.id));
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: kids.has(n.id) })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    const rooms = roomCount();
    S().copySelected();
    S().pasteClipboard();
    expect(roomCount()).toBe(rooms);
    const { nodeMap, newEdges } = pairUp(before, kids);
    // Copies whose centre is inside the room's box join it; ones that fall out the bottom
    // land loose. (The paste offset is the whole selection's height, so with every device
    // in the room selected, here they all fall below it.) Never a new room.
    const room = node("room-3");
    const ra = absPos(room, S().nodes);
    for (const p of nodeMap.values()) {
      const pa = absPos(p, S().nodes);
      const cx = pa.x + (p.measured?.width ?? 144) / 2;
      const cy = pa.y + (p.measured?.height ?? 48) / 2;
      const inside = cx >= ra.x && cx <= ra.x + room.measured!.width! && cy >= ra.y && cy <= ra.y + room.measured!.height!;
      expect(p.parentId, `${p.id}`).toBe(inside ? "room-3" : undefined);
    }
    // Their wiring still comes along, onto the copies' own ports.
    const origEdges = before.edges.filter((e) => kids.has(e.source) && kids.has(e.target));
    expect(newEdges.length).toBe(origEdges.length);
    origEdges.forEach((o, i) => expectEdgeCopied(o, newEdges[i], before, nodeMap));
  });

  it("a device alone in its room pastes into that room, not a new one", () => {
    loadFixture();
    S().addRoom("Booth", { x: 6000, y: 0 }, { width: 600, height: 600 });
    const booth = S().nodes.find((n) => n.type === "room" && (n.data as { label: string }).label === "Booth")!;
    expect(S().placeDeviceInRoom("device-19", booth.id)).toBe(true);
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: n.id === "device-19" })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    const rooms = roomCount();
    S().copySelected();
    S().pasteClipboard();
    expect(roomCount()).toBe(rooms);
    const { nodeMap } = pairUp(before, new Set(["device-19"]));
    expect(nodeMap.get("device-19")!.parentId).toBe(booth.id);
  });

  it("Select All still copies the rooms", () => {
    loadFixture();
    const rooms = roomCount();
    S().selectAll();
    S().copySelected();
    S().pasteClipboard();
    expect(roomCount()).toBe(rooms * 2);
  });
});

describe("partial selections (#395)", () => {
  it("a device copied from inside a room lands in whichever room it ends up inside, or none", () => {
    loadFixture();
    // FOH Console sits near the top of the FOH room: one offset down is still inside it.
    // The SDI audio embedder is the room's bottom row: one offset down drops its centre
    // out the bottom of the room box, so it lands loose.
    const parents: (string | undefined)[] = [];
    for (const id of ["device-15", "device-21"]) {
      useSchematicStore.setState({
        nodes: S().nodes.map((n) => ({ ...n, selected: n.id === id })),
        edges: S().edges.map((e) => ({ ...e, selected: false })),
      });
      const before = snap();
      S().copySelected();
      S().pasteClipboard();
      const { nodeMap } = pairUp(before, new Set([id]));
      const p = nodeMap.get(id)!;
      const room = node("room-3");
      const ra = absPos(room, S().nodes);
      const pa = absPos(p, S().nodes);
      const cy = pa.y + (p.measured?.height ?? 48) / 2;
      const cx = pa.x + (p.measured?.width ?? 144) / 2;
      const inside = cx >= ra.x && cx <= ra.x + room.measured!.width! && cy >= ra.y && cy <= ra.y + room.measured!.height!;
      expect(p.parentId).toBe(inside ? "room-3" : undefined);
      parents.push(p.parentId);
      // Absolute placement is one offset straight down either way.
      const oa = absPos(node(id), S().nodes);
      expect(pa.x).toBe(oa.x);
      expect(pa.y).toBeGreaterThan(oa.y);
    }
    // Both branches really ran.
    expect(parents).toEqual(["room-3", undefined]);
  });

  it("Select All minus one device: that room isn't copied, and none of its copied devices stay under the original", () => {
    loadFixture();
    S().selectAll();
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => (n.id === "device-21" ? { ...n, selected: false } : n)),
    });
    const before = snap();
    S().copySelected();
    S().pasteClipboard();
    const beforeIds = new Set(before.nodes.map((n) => n.id));
    const added = S().nodes.filter((n) => !beforeIds.has(n.id));
    // room-1 and room-2 come along; room-3 (one child left behind) does not.
    expect(added.filter((n) => n.type === "room").length).toBe(2);
    for (const n of added) {
      if (!n.parentId) continue;
      expect(beforeIds.has(n.parentId), `${n.id} parented to original ${n.parentId}`).toBe(false);
    }
  });

  it("a text stub copied without its device is left out", () => {
    loadFixture();
    S().addTextStub("device-9", "sw-port-3");
    const stubId = S().nodes.find((n) => n.type === "text-stub")!.id;
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: n.id === stubId || n.id === "device-12" })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    S().copySelected();
    S().pasteClipboard();
    const added = S().nodes.filter((n) => !before.nodes.some((b) => b.id === n.id));
    expect(added.map((n) => n.type)).toEqual(["device"]);
  });

  it("pasting only a stubbed connection's tags adds nothing and no undo step", () => {
    loadFixture();
    S().convertEdgeToStubs("edge-11", { silentBundleToast: true });
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: n.type === "stub-label" })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    const undoBefore = S().undoSize;
    S().copySelected();
    S().pasteClipboard();
    expect(S().nodes.length).toBe(before.nodes.length);
    expect(S().edges.length).toBe(before.edges.length);
    expect(S().undoSize).toBe(undoBefore);
    expect(S().canUndo()).toBe(undoBefore > 0);
  });

  it("copies only connections with both ends selected, on the right ports", () => {
    loadFixture();
    // Core Switch (bidirectional ports) + PP-01 (passthrough rear/front) only.
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: n.id === "device-9" || n.id === "device-8" })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    S().copySelected();
    S().pasteClipboard();
    const { nodeMap, newEdges } = pairUp(before, new Set(["device-9", "device-8"]));
    expect(newEdges.length).toBe(1);
    expectEdgeCopied(edge("edge-5"), newEdges[0], before, nodeMap);
  });

  it("a stubbed connection with only one end copied doesn't paste a half-link", () => {
    loadFixture();
    S().convertEdgeToStubs("edge-11", { silentBundleToast: true });
    // Select the UPS and both tags, but not the monitor at the far end.
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: n.id === "device-11" || n.type === "stub-label" })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    S().copySelected();
    S().pasteClipboard();
    const beforeIds = new Set(before.nodes.map((n) => n.id));
    const added = S().nodes.filter((n) => !beforeIds.has(n.id));
    // The UPS is pasted; the broken stub link (one leg, two tags) is not.
    expect(added.filter((n) => n.type === "device").length).toBe(1);
    expect(added.filter((n) => n.type === "stub-label").length).toBe(0);
    expect(S().edges.length).toBe(before.edges.length);
  });

  it("a room copied with its devices keeps them in the pasted room", () => {
    loadFixture();
    const kids = new Set(S().nodes.filter((n) => n.parentId === "room-1").map((n) => n.id));
    useSchematicStore.setState({
      nodes: S().nodes.map((n) => ({ ...n, selected: n.id === "room-1" || kids.has(n.id) })),
      edges: S().edges.map((e) => ({ ...e, selected: false })),
    });
    const before = snap();
    S().copySelected();
    S().pasteClipboard();
    const { nodeMap, newEdges } = pairUp(before, new Set(["room-1", ...kids]));
    const newRoom = nodeMap.get("room-1")!;
    expect(newRoom.type).toBe("room");
    for (const k of kids) {
      const p = nodeMap.get(k)!;
      expect(p.parentId, `${k} reparented to the pasted room`).toBe(newRoom.id);
      // Relative position inside the room is preserved; the room carries the offset.
      expect(p.position).toEqual(node(k).position);
    }
    expect(newRoom.position.y).toBeGreaterThan(node("room-1").position.y + (node("room-1").measured?.height ?? 0) - 1);
    const origEdges = before.edges.filter((e) => kids.has(e.source) && kids.has(e.target));
    expect(newEdges.length).toBe(origEdges.length);
    origEdges.forEach((o, i) => expectEdgeCopied(o, newEdges[i], before, nodeMap));
  });
});
