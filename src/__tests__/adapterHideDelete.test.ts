/**
 * Adapter visibility end to end, through the store actions the context menus call.
 *
 * #425 — on a freshly auto-inserted adapter the menu said "Show Adapter" while the
 * adapter was drawn, and "Hide Adapter" then did nothing. The menus label the adapter
 * from its override + the View Options toggle, but the canvas only hides what is in
 * `hiddenAdapterNodeIds`, and that set was published by the A* routing result alone.
 * With auto-route off (or after a big schematic tripped the routing budget) nothing
 * ever hid, while the label already said it had. computeSimpleRoutes now publishes the
 * same resolved set and splices the hidden adapter's legs, exactly as the A* path does.
 *
 * #426 — hide an adapter, delete the (power) connection: only the visible leg went, and
 * the far leg stayed behind on an invisible adapter, still holding the device's port.
 * Deleting a connection through a hidden adapter now takes the adapter and both legs.
 *
 * #409 — "Follow View Setting" clears the per-adapter override.
 *
 * The store reads editor preferences from localStorage at import time, so a minimal
 * in-memory localStorage is installed before the store is imported.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  canHideAdapter,
  connectionAdapterId,
  isAdapterNodeHidden,
  resolveHiddenAdapterIds,
  toggleAdapterVisibility,
} from "../adapterVisibility";
import type { ConnectionEdge, DeviceData, Port, SchematicNode } from "../types";

function installLocalStorageStub() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  });
}

let useSchematicStore: typeof import("../store").useSchematicStore;
let handlers: typeof import("../mcpBridge").handlers;

beforeAll(async () => {
  installLocalStorageStub();
  ({ useSchematicStore } = await import("../store"));
  ({ handlers } = await import("../mcpBridge"));
});
afterAll(() => { vi.unstubAllGlobals(); });

const st = () => useSchematicStore.getState();

/** Minimal ReactFlowInstance stand-in built off the live store: every device sits at
 *  its position, and every port renders its bare, -in and -out handle ids (DeviceNode's
 *  shapes), stacked one row per port. computeSimpleRoutes only calls getInternalNode. */
function rf(): ReactFlowInstance {
  return {
    getInternalNode: (id: string) => {
      const n = st().nodes.find((x) => x.id === id);
      if (!n || n.type !== "device") return undefined;
      const ports = (n.data as DeviceData).ports;
      const bounds = ports.flatMap((p, i) =>
        [p.id, `${p.id}-in`, `${p.id}-out`].map((hid) => ({ id: hid, x: 0, y: 30 + i * 20, width: 10, height: 10 })),
      );
      return {
        id, type: n.type, measured: { width: 144, height: 80 },
        internals: { positionAbsolute: n.position, handleBounds: { source: bounds, target: bounds } },
      };
    },
  } as unknown as ReactFlowInstance;
}

/** What the canvas does after every edit with auto-route off. */
const route = () => st().computeSimpleRoutes(rf());

function device(id: string, label: string, ports: Port[], x: number): SchematicNode {
  return { id, type: "device", position: { x, y: 0 }, data: { label, deviceType: "generic", ports } } as SchematicNode;
}

const CONSOLE_OUT: Port = { id: "mix-l-out", label: "Main L", signalType: "analog-audio", direction: "output", connectorType: "xlr-3" };
const CARD_IN: Port = { id: "card-in-1", label: "Line In 1", signalType: "analog-audio", direction: "input", connectorType: "trs-quarter" };
const STRIP_OUT: Port = { id: "strip-out-1", label: "Outlet 1", signalType: "power", direction: "output", connectorType: "edison" };
const AMP_PWR_IN: Port = { id: "amp-pwr-in", label: "AC In", signalType: "power", direction: "input", connectorType: "iec" };

/** Draw a connection the way the canvas does (onConnect), letting the adapter auto-insert. */
function drawAdapted(src: string, srcHandle: string, tgt: string, tgtHandle: string) {
  st().onConnect({ source: src, sourceHandle: srcHandle, target: tgt, targetHandle: tgtHandle });
  const adapter = st().nodes.find((n) => n.type === "device" && (n.data as DeviceData).deviceType === "adapter");
  expect(adapter, "an adapter auto-inserted").toBeDefined();
  const inbound = st().edges.find((e) => e.target === adapter!.id)!;
  const outbound = st().edges.find((e) => e.source === adapter!.id)!;
  expect(inbound.source).toBe(src);
  expect(outbound.target).toBe(tgt);
  return { adapterId: adapter!.id, inboundId: inbound.id, outboundId: outbound.id };
}

/** The connection context menu's Show/Hide label, as EdgeContextMenu derives it. */
function menuLabel(edgeId: string): string | null {
  const s = st();
  const edge = s.edges.find((e) => e.id === edgeId);
  const adapterId = connectionAdapterId(edge, s.nodes);
  if (!adapterId) return null;
  const node = s.nodes.find((n) => n.id === adapterId);
  const hidden = isAdapterNodeHidden(node, s.hideAdapters, s.edges);
  if (!hidden && !canHideAdapter(adapterId, s.edges)) return null;
  return hidden ? "Show Adapter" : "Hide Adapter";
}

/** Click the connection menu's Show/Hide item — EdgeContextMenu.toggleAdapterVisibility. */
function clickToggle(edgeId: string) {
  const s = st();
  const adapterId = connectionAdapterId(s.edges.find((e) => e.id === edgeId), s.nodes)!;
  const data = s.nodes.find((n) => n.id === adapterId)!.data as DeviceData;
  s.patchDeviceData(adapterId, { adapterVisibility: toggleAdapterVisibility(data.adapterVisibility, s.hideAdapters) });
  route();
}

/** Click "Follow View Setting" — both menus patch the override away. */
function clickFollow(adapterId: string) {
  st().patchDeviceData(adapterId, { adapterVisibility: undefined });
  route();
}

/** Press Delete with only this connection selected (App.tsx → removeSelected). */
function pressDeleteOn(edgeId: string) {
  useSchematicStore.setState({
    nodes: st().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    edges: st().edges.map((e) => ({ ...e, selected: e.id === edgeId })),
  });
  st().removeSelected();
}

const drawnHidden = (adapterId: string) => st().hiddenAdapterNodeIds.has(adapterId);
const wrapperInvisible = (adapterId: string) =>
  st().nodes.find((n) => n.id === adapterId)!.style?.opacity === 0;

beforeEach(() => {
  st().newSchematic();
  st().setHideAdapters(false);
  useSchematicStore.setState({
    autoRoute: false,
    toasts: [],
    nodes: [
      device("console", "FOH Console", [CONSOLE_OUT], 0),
      device("card", "Sound Card", [CARD_IN], 600),
      device("strip", "Power Strip", [STRIP_OUT], 0),
      device("amp", "Amp", [AMP_PWR_IN], 600),
    ].map((n, i) => (i >= 2 ? { ...n, position: { x: n.position.x, y: 400 } } : n)),
    edges: [],
    pendingIncompatibleConnection: null,
  });
});

describe("#425 Hide/Show Adapter on an auto-inserted adapter, auto-route off", () => {
  it("Hide Adapter hides it and the connection draws straight through", () => {
    const { adapterId, inboundId, outboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    route();
    expect(drawnHidden(adapterId)).toBe(false);
    expect(menuLabel(inboundId)).toBe("Hide Adapter");

    clickToggle(inboundId);
    expect(drawnHidden(adapterId)).toBe(true);
    expect(menuLabel(inboundId)).toBe("Show Adapter");
    // The far leg is drawn by the spliced connection, not on its own.
    expect(st().hiddenVirtualEdgeIds.has(outboundId)).toBe(true);
    const wp = st().routedEdges[inboundId].waypoints;
    const card = st().nodes.find((n) => n.id === "card")!;
    expect(wp[wp.length - 1].x).toBe(card.position.x + 5);

    clickToggle(inboundId);
    expect(drawnHidden(adapterId)).toBe(false);
    expect(menuLabel(inboundId)).toBe("Hide Adapter");
  });

  it("with View Options 'hide adapters' on, a fresh adapter is drawn hidden and labelled Show — then Show and Hide both take", () => {
    st().setHideAdapters(true);
    const { adapterId, inboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    route();
    // The reported state: label "Show Adapter" over a drawn adapter. Label and canvas agree now.
    expect(menuLabel(inboundId)).toBe("Show Adapter");
    expect(drawnHidden(adapterId)).toBe(true);

    clickToggle(inboundId); // Show Adapter
    expect(drawnHidden(adapterId)).toBe(false);
    expect(wrapperInvisible(adapterId)).toBe(false);
    expect(menuLabel(inboundId)).toBe("Hide Adapter");

    clickToggle(inboundId); // Hide Adapter — the click that "did nothing"
    expect(drawnHidden(adapterId)).toBe(true);
    expect(menuLabel(inboundId)).toBe("Show Adapter");
  });

  it("Show Adapter clears the invisible wrapper style the global toggle put on it", () => {
    const { adapterId, inboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    route();
    st().setHideAdapters(true);
    route();
    expect(wrapperInvisible(adapterId)).toBe(true);

    clickToggle(inboundId); // Show Adapter → force-show
    expect(drawnHidden(adapterId)).toBe(false);
    // Was left at opacity 0 / click-through, so a "shown" adapter stayed invisible.
    expect(wrapperInvisible(adapterId)).toBe(false);
  });

  it("an adapter without a leg on each side is never drawn hidden and offers no Hide", () => {
    const { adapterId, inboundId, outboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    useSchematicStore.setState({ edges: st().edges.filter((e) => e.id !== outboundId) });
    st().setHideAdapters(true);
    route();
    expect(drawnHidden(adapterId)).toBe(false);
    expect(wrapperInvisible(adapterId)).toBe(false);
    expect(menuLabel(inboundId)).toBeNull();
  });
});

describe("#426 deleting a connection through a hidden adapter", () => {
  function hiddenPowerRun() {
    const run = drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    route();
    clickToggle(run.inboundId); // Hide Adapter
    expect(drawnHidden(run.adapterId)).toBe(true);
    return run;
  }

  it("takes the adapter and both legs, so power can be reconnected", () => {
    const { adapterId, inboundId } = hiddenPowerRun();
    pressDeleteOn(inboundId); // the one connection the user sees
    route();

    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);
    expect(st().edges).toHaveLength(0);
    // Nothing is left holding the amp's AC In.
    expect(st().edges.some((e) => e.target === "amp" || e.source === "amp")).toBe(false);

    drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    expect(st().edges.filter((e) => e.target === "amp" && e.targetHandle === "amp-pwr-in")).toHaveLength(1);
  });

  it("the same cascade runs for deleteConnection (MCP delete_connection, drag-off disconnect)", () => {
    const { adapterId, outboundId } = hiddenPowerRun();
    st().deleteConnection(outboundId);
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);
    expect(st().edges).toHaveLength(0);
  });

  it("undo restores the adapter and both legs, redo removes them again", () => {
    const { adapterId, inboundId, outboundId } = hiddenPowerRun();
    pressDeleteOn(inboundId);
    st().undo();
    route();
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(true);
    expect(st().edges.map((e) => e.id).sort()).toEqual([inboundId, outboundId].sort());
    expect(drawnHidden(adapterId)).toBe(true);

    st().redo();
    route();
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);
    expect(st().edges).toHaveLength(0);
  });

  it("a drawn adapter still loses only the leg that was deleted", () => {
    const { adapterId, inboundId, outboundId } = drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    route();
    pressDeleteOn(inboundId);
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(true);
    expect(st().edges.map((e) => e.id)).toEqual([outboundId]);
  });

  it("a ghost already saved in a file (hidden adapter, one leg left) is drawn again so it can be deleted", () => {
    const { adapterId, inboundId, outboundId } = drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    st().patchDeviceData(adapterId, { adapterVisibility: "force-hide" });
    // What the old delete left behind: the far leg on a force-hidden adapter.
    useSchematicStore.setState({ edges: st().edges.filter((e) => e.id !== inboundId) });
    route();
    // The one rule both route builders (A* and auto-route-off) hide by.
    expect(resolveHiddenAdapterIds(st().nodes, st().hideAdapters, st().edges).has(adapterId)).toBe(false);
    expect(drawnHidden(adapterId)).toBe(false);
    expect(wrapperInvisible(adapterId)).toBe(false);

    pressDeleteOn(outboundId);
    expect(st().edges.some((e) => e.target === "amp")).toBe(false);
  });
});

describe("auto-route off draws a hidden run the way the UI edits it", () => {
  const MIC_OUT: Port = { id: "mic-out", label: "Out", signalType: "analog-audio", direction: "output", connectorType: "xlr-3" };
  const STAGEBOX_IN: Port = { id: "sb-in-1", label: "In 1", signalType: "analog-audio", direction: "input", connectorType: "xlr-3" };

  it("a hidden run in a 2-member bundle leaves both members routed", () => {
    const { adapterId, inboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    useSchematicStore.setState({
      nodes: [
        ...st().nodes,
        { ...device("mic", "Mic", [MIC_OUT], 0), position: { x: 0, y: 60 } },
        { ...device("stagebox", "Stage Box", [STAGEBOX_IN], 600), position: { x: 600, y: 60 } },
      ],
      edges: [
        ...st().edges.map((e) => (e.id === inboundId ? { ...e, data: { ...e.data!, bundleId: "b1" } } : e)),
        { id: "mic-run", source: "mic", sourceHandle: "mic-out", target: "stagebox", targetHandle: "sb-in-1",
          data: { signalType: "analog-audio", bundleId: "b1" } } as ConnectionEdge,
      ],
      bundles: { b1: { id: "b1" } } as unknown as ReturnType<typeof st>["bundles"],
    });
    st().patchDeviceData(adapterId, { adapterVisibility: "force-hide" });
    route();
    expect(drawnHidden(adapterId)).toBe(true);
    // The bundle-mate used to wait for a partner the spliced pass never handed over, and
    // came out with no route at all: invisible and unclickable.
    expect(st().routedEdges["mic-run"]).toBeDefined();
    expect(st().routedEdges[inboundId]).toBeDefined();
    expect(st().routedEdges[inboundId].turns).toBe("bundle");
    expect(st().routedEdges["mic-run"].turns).toBe("bundle");
  });

  it("keep-routes freezes the merged line onto its inbound leg, and the line follows those handles", () => {
    const { adapterId, inboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    st().patchDeviceData(adapterId, { adapterVisibility: "force-hide" });
    // Auto-route on: the A* result for a hidden run is published under the inbound leg.
    useSchematicStore.setState({
      autoRoute: true,
      routedEdges: {
        [inboundId]: {
          edgeId: inboundId, svgPath: "", segments: [], labelX: 0, labelY: 0, turns: "", crossingPoints: [],
          waypoints: [{ x: 5, y: 35 }, { x: 300, y: 35 }, { x: 300, y: 220 }, { x: 420, y: 220 }, { x: 420, y: 35 }, { x: 605, y: 35 }],
        },
      } as unknown as ReturnType<typeof st>["routedEdges"],
    });
    st().confirmAutoRouteOff(true); // View > Auto-Route Edges off, keep routes
    const frozen = st().edges.find((e) => e.id === inboundId)!.data!.manualWaypoints!;
    expect(frozen).toEqual([{ x: 300, y: 35 }, { x: 300, y: 220 }, { x: 420, y: 220 }, { x: 420, y: 35 }]);

    route();
    const wp = st().routedEdges[inboundId].waypoints;
    for (const p of frozen) expect(wp).toContainEqual(p);

    // A drag that rewrites the inbound leg's waypoints moves the merged line.
    const moved = [{ x: 260, y: 35 }, { x: 260, y: 300 }, { x: 460, y: 300 }, { x: 460, y: 35 }];
    useSchematicStore.setState({
      edges: st().edges.map((e) => (e.id === inboundId ? { ...e, data: { ...e.data!, manualWaypoints: moved } } : e)),
    });
    route();
    for (const p of moved) expect(st().routedEdges[inboundId].waypoints).toContainEqual(p);
  });
});

describe("#426 the delete cascade completes from any part of a hidden run", () => {
  const stubTags = () => st().nodes.filter((n) => n.type === "stub-label");

  /** console -> tag | tag -> [hidden adapter] -> card: the console-to-adapter leg stubbed. */
  function stubbedHiddenRun() {
    const run = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    st().patchDeviceData(run.adapterId, { adapterVisibility: "force-hide" });
    st().convertEdgeToStubs(run.inboundId);
    expect(stubTags()).toHaveLength(2);
    const s = st();
    expect(resolveHiddenAdapterIds(s.nodes, s.hideAdapters, s.edges).has(run.adapterId)).toBe(true);
    return run;
  }

  it("deleting the stub half that is not merged takes the adapter, its far leg and both tags", () => {
    const { adapterId } = stubbedHiddenRun();
    const deviceHalf = st().edges.find((e) => e.source === "console")!;
    pressDeleteOn(deviceHalf.id);
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);
    expect(stubTags()).toHaveLength(0);
    expect(st().edges).toHaveLength(0);
  });

  it("deleting the far device of a stubbed hidden run takes the whole run", () => {
    const { adapterId } = stubbedHiddenRun();
    st().deleteNode("card");
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);
    expect(stubTags()).toHaveLength(0);
    expect(st().edges).toHaveLength(0);
  });

  it("deleting the source device of a hidden run takes the adapter and its far leg", () => {
    const { adapterId } = drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    st().patchDeviceData(adapterId, { adapterVisibility: "force-hide" });
    st().deleteNode("strip");
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);
    expect(st().edges.some((e) => e.target === "amp")).toBe(false);
  });

  it("a hidden adapter with a third connection only loses the deleted leg", () => {
    const ADAPTER_PORTS: Port[] = [
      { id: "ad-in", label: "XLR (F)", signalType: "analog-audio", direction: "input", connectorType: "xlr-3" },
      { id: "ad-out", label: "TRS (M)", signalType: "analog-audio", direction: "output", connectorType: "trs-quarter" },
      { id: "ad-out-2", label: "TRS (M) 2", signalType: "analog-audio", direction: "output", connectorType: "trs-quarter" },
    ];
    const CARD_IN_2: Port = { ...CARD_IN, id: "card-in-2", label: "Line In 2" };
    useSchematicStore.setState({
      nodes: [
        ...st().nodes.map((n) => (n.id === "card"
          ? ({ ...n, data: { ...(n.data as DeviceData), ports: [CARD_IN, CARD_IN_2] } } as SchematicNode)
          : n)),
        { id: "splitter", type: "device", position: { x: 300, y: 0 },
          data: { label: "Custom Splitter", deviceType: "adapter", ports: ADAPTER_PORTS, adapterVisibility: "force-hide" } } as SchematicNode,
      ],
      edges: [
        { id: "in", source: "console", sourceHandle: "mix-l-out", target: "splitter", targetHandle: "ad-in", data: { signalType: "analog-audio" } },
        { id: "out-1", source: "splitter", sourceHandle: "ad-out", target: "card", targetHandle: "card-in-1", data: { signalType: "analog-audio" } },
        { id: "out-2", source: "splitter", sourceHandle: "ad-out-2", target: "card", targetHandle: "card-in-2", data: { signalType: "analog-audio" } },
      ] as ConnectionEdge[],
    });
    route();
    expect(drawnHidden("splitter")).toBe(true);

    pressDeleteOn("in");
    route();
    expect(st().nodes.some((n) => n.id === "splitter")).toBe(true);
    expect(st().edges.map((e) => e.id).sort()).toEqual(["out-1", "out-2"]);
    // No longer inline, so it is drawn again rather than left as an invisible speck.
    expect(drawnHidden("splitter")).toBe(false);
  });

  it("MCP delete_connection reports the adapter cascade", () => {
    const { adapterId, inboundId } = drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    st().patchDeviceData(adapterId, { adapterVisibility: "force-hide" });
    expect(handlers.delete_connection({ connectionId: inboundId })).toEqual({
      deleted: true, connectionId: inboundId, cascadedAdapter: true,
    });
    expect(st().nodes.some((n) => n.id === adapterId)).toBe(false);

    // A plain delete still reports exactly what it did before.
    const run = drawAdapted("strip", "strip-out-1", "amp", "amp-pwr-in");
    expect(handlers.delete_connection({ connectionId: run.inboundId })).toEqual({
      deleted: true, connectionId: run.inboundId,
    });
  });
});

describe("#409 Follow View Setting", () => {
  it("returns a manually shown adapter to the View Options toggle", () => {
    const { adapterId, inboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    route();
    clickToggle(inboundId); // Hide → force-hide
    clickToggle(inboundId); // Show → force-show
    st().setHideAdapters(true);
    route();
    // The override wins over the toggle, which is the stuck state the issue describes.
    expect(drawnHidden(adapterId)).toBe(false);

    clickFollow(adapterId);
    const data = st().nodes.find((n) => n.id === adapterId)!.data as DeviceData;
    expect(data.adapterVisibility).toBeUndefined();
    expect(drawnHidden(adapterId)).toBe(true);

    st().setHideAdapters(false);
    route();
    expect(drawnHidden(adapterId)).toBe(false);
  });

  it("the cleared override does not ride into a saved file", () => {
    const { adapterId, inboundId } = drawAdapted("console", "mix-l-out", "card", "card-in-1");
    clickToggle(inboundId);
    clickFollow(adapterId);
    const saved = JSON.parse(JSON.stringify(st().nodes.find((n) => n.id === adapterId))) as SchematicNode;
    expect("adapterVisibility" in (saved.data as DeviceData)).toBe(false);
  });
});
