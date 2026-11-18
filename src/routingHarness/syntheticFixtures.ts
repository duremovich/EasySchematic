/**
 * Synthetic adversarial routing fixtures, built in code so they read as intent
 * rather than opaque JSON. Each targets a known weak spot the Phase-2 robustness
 * work must improve without regressing.
 */

import type { SchematicNode, SignalType, DeviceData, Port, ConnectionEdge } from "../types";
import { computeDeviceHandles } from "./deviceHandleLayout";
import { makeDevice, makeEdge, makePort, makeStubPair, makeFixture, type Fixture } from "./fixtures";

/** Absolute position of a top-level device's named handle. */
function handleAbs(node: SchematicNode, handleId: string): { x: number; y: number } {
  const device = node as { data: DeviceData; measured?: { width?: number; height?: number } };
  const h = computeDeviceHandles(device).find((x) => x.id === handleId);
  const base = node.position;
  return { x: base.x + (h?.relX ?? 0), y: base.y + (h?.relY ?? 0) };
}

/** Source device with N outputs fanning to N stacked targets on the right. */
function fanOutDense(): Fixture {
  const outs = Array.from({ length: 8 }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const src = makeDevice({ id: "src", label: "Router", x: 0, y: 160, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges = outs.map((p, i) => {
    const tgtIn = makePort("In", "sdi", "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Display ${i + 1}`, x: 560, y: i * 88, ports: [tgtIn] });
    nodes.push(tgt);
    return makeEdge({ id: `e${i}`, source: "src", sourceHandle: p.id, target: `tgt${i}`, targetHandle: tgtIn.id, signalType: "sdi" });
  });
  return makeFixture("fan-out-dense", nodes, edges);
}

/** Targets sit to the LEFT of the source — every edge must route backward. */
function backwardEdges(): Fixture {
  const outs = Array.from({ length: 5 }, (_, i) => makePort(`Out ${i + 1}`, "hdmi", "output"));
  const src = makeDevice({ id: "src", label: "Source", x: 640, y: 120, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges = outs.map((p, i) => {
    const tIn = makePort("In", "hdmi", "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Sink ${i + 1}`, x: 0, y: i * 104, ports: [tIn] });
    nodes.push(tgt);
    return makeEdge({ id: `b${i}`, source: "src", sourceHandle: p.id, target: `tgt${i}`, targetHandle: tIn.id, signalType: "hdmi" });
  });
  return makeFixture("backward-edges", nodes, edges);
}

/** Devices nested in room nodes; edges cross room boundaries (rooms are not obstacles). */
function nestedRooms(): Fixture {
  const roomA = { id: "roomA", type: "room", position: { x: 0, y: 0 }, data: { label: "Booth" }, measured: { width: 320, height: 480 } } as unknown as SchematicNode;
  const roomB = { id: "roomB", type: "room", position: { x: 560, y: 0 }, data: { label: "Stage" }, measured: { width: 320, height: 480 } } as unknown as SchematicNode;
  const aOut = makePort("Out", "dante", "output");
  const aOut2 = makePort("Out 2", "ndi", "output");
  const devA = makeDevice({ id: "devA", label: "Mixer", x: 48, y: 64, ports: [aOut, aOut2], parentId: "roomA" });
  const bIn = makePort("In", "dante", "input");
  const bIn2 = makePort("In", "ndi", "input");
  const devB = makeDevice({ id: "devB", label: "Amp", x: 48, y: 80, ports: [bIn], parentId: "roomB" });
  const devC = makeDevice({ id: "devC", label: "Decoder", x: 48, y: 288, ports: [bIn2], parentId: "roomB" });
  const edges = [
    makeEdge({ id: "n1", source: "devA", sourceHandle: aOut.id, target: "devB", targetHandle: bIn.id, signalType: "dante" }),
    makeEdge({ id: "n2", source: "devA", sourceHandle: aOut2.id, target: "devC", targetHandle: bIn2.id, signalType: "ndi" }),
  ];
  return makeFixture("nested-rooms", [roomA, roomB, devA, devB, devC], edges);
}

/** Two stubbed connections from one device — exercises stub-leg routing. */
function stubsSpread(): Fixture {
  const o1 = makePort("Out 1", "sdi", "output");
  const o2 = makePort("Out 2", "sdi", "output");
  const src = makeDevice({ id: "src", label: "Camera", x: 0, y: 96, ports: [o1, o2] });
  const tIn1 = makePort("In", "sdi", "input");
  const tIn2 = makePort("In", "sdi", "input");
  const tgt1 = makeDevice({ id: "tgt1", label: "Switcher A", x: 720, y: 48, ports: [tIn1] });
  const tgt2 = makeDevice({ id: "tgt2", label: "Switcher B", x: 720, y: 288, ports: [tIn2] });

  const pair1 = makeStubPair({
    linkId: "lc1", signalType: "sdi",
    source: "src", sourceHandle: o1.id, srcHandlePos: handleAbs(src, o1.id), srcPortSide: "right",
    target: "tgt1", targetHandle: tIn1.id, tgtHandlePos: handleAbs(tgt1, tIn1.id), tgtPortSide: "left",
  });
  const pair2 = makeStubPair({
    linkId: "lc2", signalType: "sdi",
    source: "src", sourceHandle: o2.id, srcHandlePos: handleAbs(src, o2.id), srcPortSide: "right",
    target: "tgt2", targetHandle: tIn2.id, tgtHandlePos: handleAbs(tgt2, tIn2.id), tgtPortSide: "left",
  });

  return makeFixture(
    "stubs-spread",
    [src, tgt1, tgt2, ...pair1.nodes, ...pair2.nodes],
    [...pair1.edges, ...pair2.edges],
  );
}

/** Parallel edges of different signal types competing for one vertical corridor (R11). */
function mixedSignalCorridor(): Fixture {
  const sigs: SignalType[] = ["sdi", "hdmi", "dante", "ndi", "aes", "usb"];
  const outs = sigs.map((s, i) => makePort(`Out ${i + 1}`, s, "output"));
  const src = makeDevice({ id: "src", label: "Hub", x: 0, y: 240, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges = sigs.map((s, i) => {
    const tIn = makePort("In", s, "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Node ${i + 1}`, x: 480, y: i * 104, ports: [tIn] });
    nodes.push(tgt);
    return makeEdge({ id: `m${i}`, source: "src", sourceHandle: outs[i].id, target: `tgt${i}`, targetHandle: tIn.id, signalType: s });
  });
  return makeFixture("mixed-signal-corridor", nodes, edges);
}

/**
 * Multiple sources at different Y feeding ONE shared vertical stack of targets,
 * wired interleaved so the vertical spans overlap. This is the user's reported
 * defect: edges to vertically-stacked targets run down the same/adjacent X corridor
 * and overlap instead of nesting into concentric channels. The auto-router should
 * order the corridors concentrically (inner = shortest vertical span).
 */
function multiSourceStack(): Fixture {
  const s1Outs = Array.from({ length: 3 }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const s2Outs = Array.from({ length: 3 }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const s1 = makeDevice({ id: "s1", label: "Camera A", x: 0, y: 32, ports: s1Outs });
  const s2 = makeDevice({ id: "s2", label: "Camera B", x: 0, y: 416, ports: s2Outs });
  const nodes: SchematicNode[] = [s1, s2];
  const tgts = Array.from({ length: 6 }, (_, i) => {
    const tin = makePort("In", "sdi", "input");
    const t = makeDevice({ id: `t${i}`, label: `Monitor ${i + 1}`, x: 656, y: i * 104, ports: [tin] });
    nodes.push(t);
    return { t, tin };
  });
  // Interleave so spans cross: S1(top) → T0,T2,T4 ; S2(bottom) → T1,T3,T5.
  const edges: ConnectionEdge[] = [];
  const wire = (src: SchematicNode, outs: Port[], oi: number, ti: number) =>
    edges.push(makeEdge({
      id: `${src.id}-t${ti}`, source: src.id, sourceHandle: outs[oi].id,
      target: `t${ti}`, targetHandle: tgts[ti].tin.id, signalType: "sdi",
    }));
  wire(s1, s1Outs, 0, 0); wire(s1, s1Outs, 1, 2); wire(s1, s1Outs, 2, 4);
  wire(s2, s2Outs, 0, 1); wire(s2, s2Outs, 1, 3); wire(s2, s2Outs, 2, 5);
  return makeFixture("multi-source-stack", nodes, edges);
}

/**
 * Single source fanning to stacked targets with a tall obstacle device sitting
 * between them, so the clean L-shape is blocked and the multi-leg corridor
 * assembly must navigate around it. Exercises the "odd unneeded bends near the
 * target" path: leg1 + vertical + leg3 assembly and simplifyWaypoints cleanup.
 */
function fanThroughGap(): Fixture {
  const outs = Array.from({ length: 5 }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const src = makeDevice({ id: "src", label: "Router", x: 0, y: 224, ports: outs });
  // A tall wall device spanning the vertical extent, blocking direct horizontals.
  const wallPorts = Array.from({ length: 14 }, (_, i) => makePort(`P${i + 1}`, "sdi", i % 2 ? "output" : "input"));
  const wall = makeDevice({ id: "wall", label: "Patch Wall", x: 336, y: 0, ports: wallPorts });
  const nodes: SchematicNode[] = [src, wall];
  const edges = outs.map((p, i) => {
    const tin = makePort("In", "sdi", "input");
    const t = makeDevice({ id: `t${i}`, label: `Display ${i + 1}`, x: 656, y: i * 120, ports: [tin] });
    nodes.push(t);
    return makeEdge({ id: `g${i}`, source: "src", sourceHandle: p.id, target: `t${i}`, targetHandle: tin.id, signalType: "sdi" });
  });
  return makeFixture("fan-through-gap", nodes, edges);
}

/** A grid of devices wired diagonally so naive routing produces many crossings. */
function crossingGrid(): Fixture {
  const nodes: SchematicNode[] = [];
  const lefts = Array.from({ length: 4 }, (_, i) => {
    const o = makePort("Out", "sdi", "output");
    const d = makeDevice({ id: `L${i}`, label: `L${i}`, x: 0, y: i * 112, ports: [o] });
    nodes.push(d);
    return { d, o };
  });
  const rights = Array.from({ length: 4 }, (_, i) => {
    const inp = makePort("In", "sdi", "input");
    const d = makeDevice({ id: `R${i}`, label: `R${i}`, x: 480, y: i * 112, ports: [inp] });
    nodes.push(d);
    return { d, inp };
  });
  // Wire L[i] -> R[3-i] so connections want to cross.
  const edges = lefts.map((l, i) =>
    makeEdge({ id: `x${i}`, source: l.d.id, sourceHandle: l.o.id, target: rights[3 - i].d.id, targetHandle: rights[3 - i].inp.id, signalType: "sdi" }),
  );
  return makeFixture("crossing-grid", nodes, edges);
}

/** 6 connections, one source region → one target region, all bundled onto one trunk. */
function bundle6SamePair(): Fixture {
  const outs = Array.from({ length: 6 }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const src = makeDevice({ id: "src", label: "Router", x: 0, y: 160, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges = outs.map((p, i) => {
    const tIn = makePort("In", "sdi", "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Display ${i + 1}`, x: 560, y: i * 88, ports: [tIn] });
    nodes.push(tgt);
    return makeEdge({
      id: `e${i}`, source: "src", sourceHandle: p.id, target: `tgt${i}`, targetHandle: tIn.id,
      signalType: "sdi", data: { bundleId: "b1" },
    });
  });
  return makeFixture("bundle-6-same-pair", nodes, edges, { b1: { id: "b1" } });
}

/** 3 sources at different Y → 1 target device, bundled (gather-heavy at the target). */
function bundleFanIn(): Fixture {
  const nodes: SchematicNode[] = [];
  const tIns = Array.from({ length: 3 }, (_, i) => makePort(`In ${i + 1}`, "sdi", "input"));
  const tgt = makeDevice({ id: "tgt", label: "Switcher", x: 640, y: 160, ports: tIns });
  nodes.push(tgt);
  const edges = tIns.map((tIn, i) => {
    const out = makePort("Out", "sdi", "output");
    const src = makeDevice({ id: `src${i}`, label: `Camera ${i + 1}`, x: 0, y: i * 128, ports: [out] });
    nodes.push(src);
    return makeEdge({
      id: `f${i}`, source: `src${i}`, sourceHandle: out.id, target: "tgt", targetHandle: tIn.id,
      signalType: "sdi", data: { bundleId: "b1" },
    });
  });
  return makeFixture("bundle-fan-in", nodes, edges, { b1: { id: "b1" } });
}

/** Mixed signal types bundled together — trunk is neutral; R11 must be suppressed inside. */
function bundleMixedSignal(): Fixture {
  const sigs: SignalType[] = ["sdi", "hdmi", "dante", "ndi"];
  const outs = sigs.map((s, i) => makePort(`Out ${i + 1}`, s, "output"));
  const src = makeDevice({ id: "src", label: "Hub", x: 0, y: 200, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges = sigs.map((s, i) => {
    const tIn = makePort("In", s, "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Node ${i + 1}`, x: 520, y: i * 104, ports: [tIn] });
    nodes.push(tgt);
    return makeEdge({
      id: `x${i}`, source: "src", sourceHandle: outs[i].id, target: `tgt${i}`, targetHandle: tIn.id,
      signalType: s, data: { bundleId: "b1" },
    });
  });
  return makeFixture("bundle-mixed-signal", nodes, edges, { b1: { id: "b1" } });
}

/**
 * A bundle sharing the channel with un-bundled traffic. One source fans to 8 stacked targets;
 * the even connections are bundled, the odd ones are not. The un-bundled connections must route
 * AROUND the bundle's reserved gather/fan spines rather than sharing their vertical corridors —
 * this is the regression guard for "the bundle doesn't follow corridor rules".
 */
function bundleWithTraffic(): Fixture {
  const outs = Array.from({ length: 8 }, (_, i) => makePort(`Out ${i + 1}`, "sdi", "output"));
  const src = makeDevice({ id: "src", label: "Router", x: 0, y: 240, ports: outs });
  const nodes: SchematicNode[] = [src];
  const edges = outs.map((p, i) => {
    const tIn = makePort("In", "sdi", "input");
    const tgt = makeDevice({ id: `tgt${i}`, label: `Display ${i + 1}`, x: 608, y: i * 80, ports: [tIn] });
    nodes.push(tgt);
    return makeEdge({
      id: `e${i}`, source: "src", sourceHandle: p.id, target: `tgt${i}`, targetHandle: tIn.id,
      signalType: "sdi", data: i % 2 === 0 ? { bundleId: "b1" } : undefined,
    });
  });
  return makeFixture("bundle-with-traffic", nodes, edges, { b1: { id: "b1" } });
}

/**
 * A fit-width console (#418): an SQ-5-shaped mixer flagged `fitWidth`, so its real
 * "Analog Out 10" labels widen it from 144 to 176 px. Sources feed its inputs from the
 * left, amps hang off its outputs on the right. Guards the widened geometry end to end:
 * handles on the wide right edge, no endpoint running through the body, no overlap.
 */
function fitWidthConsole(): Fixture {
  const ins = Array.from({ length: 6 }, (_, i) => makePort(`Analog In ${i + 11}`, "analog-audio", "input"));
  const outs = Array.from({ length: 6 }, (_, i) => makePort(`Analog Out ${i + 7}`, "analog-audio", "output"));
  const mixer = makeDevice({ id: "mixer", label: "A&H SQ-5", x: 320, y: 96, ports: [...ins, ...outs], fitWidth: true });
  const nodes: SchematicNode[] = [mixer];
  const edges: ConnectionEdge[] = [];
  ins.forEach((p, i) => {
    const sOut = makePort("Out", "analog-audio", "output");
    nodes.push(makeDevice({ id: `mic${i}`, label: `Mic RX ${i + 1}`, x: 0, y: i * 64, ports: [sOut] }));
    edges.push(makeEdge({ id: `i${i}`, source: `mic${i}`, sourceHandle: sOut.id, target: "mixer", targetHandle: p.id, signalType: "analog-audio" }));
  });
  outs.forEach((p, i) => {
    const aIn = makePort("In", "analog-audio", "input");
    nodes.push(makeDevice({ id: `amp${i}`, label: `Amp ${i + 1}`, x: 768, y: i * 64, ports: [aIn] }));
    edges.push(makeEdge({ id: `o${i}`, source: "mixer", sourceHandle: p.id, target: `amp${i}`, targetHandle: aIn.id, signalType: "analog-audio" }));
  });
  return makeFixture("fit-width-console", nodes, edges);
}

export function syntheticFixtures(): Fixture[] {
  return [
    fanOutDense(),
    backwardEdges(),
    nestedRooms(),
    stubsSpread(),
    mixedSignalCorridor(),
    multiSourceStack(),
    fanThroughGap(),
    crossingGrid(),
    bundle6SamePair(),
    bundleFanIn(),
    bundleMixedSignal(),
    bundleWithTraffic(),
    fitWidthConsole(), // keep last: makePort ids are sequential across fixtures
  ];
}

/**
 * Reset all routes: strip every manualWaypoint so each edge re-auto-routes from scratch.
 * Real exports are often partly hand-routed (WeirdRoom = 27/42 edges manual) and several have
 * `autoRoute: false` saved — so their as-saved geometry measures USER routes, not the auto-router.
 * The harness ALWAYS routes with A* (auto), so resetting routes here gives a clean, apples-to-apples
 * auto-router quality signal on every schematic regardless of its saved routing/autoRoute state —
 * which is what the violation metrics are meant to gate. Returns the same fixture when it had no
 * manual routes (synthetic fixtures, defaultSchematic).
 */
function resetRoutes(fx: Fixture): Fixture {
  let changed = false;
  const edges = fx.edges.map((e) => {
    if (e.data?.manualWaypoints?.length) {
      changed = true;
      const data = { ...e.data };
      delete (data as { manualWaypoints?: unknown }).manualWaypoints;
      delete (data as { autoRouteWaypoints?: unknown }).autoRouteWaypoints;
      return { ...e, data } as ConnectionEdge;
    }
    return e;
  });
  return changed ? { ...fx, edges } : fx;
}

/**
 * All fixtures: synthetic + the bundled default schematic + any real exports on disk, every one
 * with its routes RESET so the harness measures the pure auto-router (see resetRoutes). The harness
 * forces A* auto-routing, so this is the accurate violation signal across all schematics.
 */
export async function allFixtures(): Promise<Fixture[]> {
  const { defaultSchematicFixture, loadFileFixtures } = await import("./fixtures");
  const base = [...syntheticFixtures(), defaultSchematicFixture(), ...loadFileFixtures()];
  return base.map(resetRoutes);
}
