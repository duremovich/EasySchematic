/**
 * #348 — a stub tag on an adapted connection named the ADAPTER.
 *
 * Stubbing the device→adapter half of an adapted connection leaves the partner leg
 * terminating on the adapter, so the tag at the other end read "→ BNC(F)→BNC(M) Barrel".
 * With the adapter hidden, that names a device the reader cannot see anywhere on the
 * drawing, while the connection visibly runs on to the switcher. The tag now reads
 * through a hidden adapter to the device, port and room the run really ends at — the
 * same hop tagHostId already made when pairing the tag for a drag (#334).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { resolveStubLabelParts } from "../stubLabelResolve";
import { buildStubLabelText } from "../stubLabelText";
import { resolveHiddenAdapterIds } from "../adapterVisibility";
import type { ConnectionEdge, SchematicNode, StubLabelData } from "../types";

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

beforeAll(async () => {
  installLocalStorageStub();
  ({ useSchematicStore } = await import("../store"));
});
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
  useSchematicStore.getState().newSchematic();
  // newSchematic keeps the drawing preferences, and hideAdapters is one of them — reset
  // it so a case that leaves the toggle on cannot decide the next case's outcome.
  useSchematicStore.getState().setHideAdapters(false);
  useSchematicStore.setState({ toasts: [] });
});

/**
 * CAM-01 ──▶ [BNC barrel adapter] ──▶ SWITCHER (in RACK ROOM)
 *
 * The switcher end is a bidirectional port, so the connection lands on a real
 * `-in`-suffixed handle rather than a bare port id.
 */
function seedAdaptedRun() {
  const nodes: SchematicNode[] = [
    { id: "room-rack", type: "room", position: { x: 800, y: 0 },
      style: { width: 400, height: 300 },
      data: { label: "Rack Room" } } as unknown as SchematicNode,
    { id: "dev-cam", type: "device", position: { x: 0, y: 100 },
      measured: { width: 144, height: 48 },
      data: { label: "CAM-01", deviceType: "camera", ports: [
        { id: "sdi-out-1", label: "SDI Out 1", signalType: "sdi", direction: "output", connectorType: "bnc" },
      ] } } as unknown as SchematicNode,
    { id: "dev-adapter", type: "device", position: { x: 400, y: 100 },
      measured: { width: 144, height: 48 },
      data: { label: "BNC (F) → BNC (M) Barrel", deviceType: "adapter", ports: [
        { id: "bnc-f-1", label: "BNC (F)", signalType: "sdi", direction: "input", connectorType: "bnc" },
        { id: "bnc-m-1", label: "BNC (M)", signalType: "sdi", direction: "output", connectorType: "bnc" },
      ] } } as unknown as SchematicNode,
    { id: "dev-switcher", type: "device", position: { x: 100, y: 100 }, parentId: "room-rack",
      measured: { width: 144, height: 48 },
      data: { label: "SWITCHER", deviceType: "misc", ports: [
        { id: "sdi-io-1", label: "SDI I/O 1", signalType: "sdi", direction: "bidirectional", connectorType: "bnc" },
      ] } } as unknown as SchematicNode,
  ];
  const edges: ConnectionEdge[] = [
    { id: "e-cam-adapter", source: "dev-cam", sourceHandle: "sdi-out-1",
      target: "dev-adapter", targetHandle: "bnc-f-1",
      data: { signalType: "sdi", cableId: "SDI-001" } } as unknown as ConnectionEdge,
    { id: "e-adapter-switcher", source: "dev-adapter", sourceHandle: "bnc-m-1",
      target: "dev-switcher", targetHandle: "sdi-io-1-in",
      data: { signalType: "sdi", cableId: "SDI-002" } } as unknown as ConnectionEdge,
  ];
  useSchematicStore.setState({ nodes, edges });
  // The real gesture: right-click the camera→adapter connection, "Stub Connection".
  useSchematicStore.getState().convertEdgeToStubs("e-cam-adapter");
}

/** What StubLabelNode's label selector resolves: the same call, off the store's own
 *  `hiddenAdapterNodeIds`. That field is published by recomputeRoutes, which needs a
 *  React Flow instance and the routing worker, so republish it here the one way
 *  applyRoutingResult does — resolveHiddenAdapterIds over the current devices. */
function tagParts(tagId: string) {
  const pre = useSchematicStore.getState();
  useSchematicStore.setState({
    hiddenAdapterNodeIds: resolveHiddenAdapterIds(pre.nodes, pre.hideAdapters, pre.edges),
  });
  const s = useSchematicStore.getState();
  const tag = s.nodes.find((n) => n.id === tagId)!;
  return resolveStubLabelParts(tagId, tag.data as StubLabelData, {
    nodes: s.nodes,
    edges: s.edges,
    hiddenAdapterIds: s.hiddenAdapterNodeIds,
  });
}

const setAdapterVisibility = (v: "default" | "force-show" | "force-hide") =>
  useSchematicStore.getState().patchDeviceData("dev-adapter", { adapterVisibility: v });

describe("a stub tag names the far device, not a hidden inline adapter (#348)", () => {
  it("names the adapter while the adapter is drawn", () => {
    seedAdaptedRun();
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "BNC (F) → BNC (M) Barrel",
      farPort: "BNC (F)",
      farRoom: "",
    });
  });

  it("names the device beyond it once the global toggle hides adapters", () => {
    seedAdaptedRun();
    useSchematicStore.getState().setHideAdapters(true);
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "SWITCHER",
      // The port the adapter's far leg lands in — and it survives the -in suffix.
      farPort: "SDI I/O 1",
      farRoom: "Rack Room",
    });
  });

  it("names the device beyond it for a per-adapter Hide Adapter", () => {
    seedAdaptedRun();
    setAdapterVisibility("force-hide");
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "SWITCHER",
      farPort: "SDI I/O 1",
      farRoom: "Rack Room",
    });
  });

  it("goes back to naming an adapter that opts out of the global toggle", () => {
    seedAdaptedRun();
    useSchematicStore.getState().setHideAdapters(true);
    setAdapterVisibility("force-show");
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "BNC (F) → BNC (M) Barrel",
      farPort: "BNC (F)",
    });
  });

  it("leaves the near tag naming the camera either way", () => {
    seedAdaptedRun();
    expect(tagParts("stub-e-cam-adapter-tgt")).toMatchObject({
      farLabel: "CAM-01", farPort: "SDI Out 1",
    });
    useSchematicStore.getState().setHideAdapters(true);
    expect(tagParts("stub-e-cam-adapter-tgt")).toMatchObject({
      farLabel: "CAM-01", farPort: "SDI Out 1",
    });
  });

  it("reads through a chain of hidden adapters to the device at the end", () => {
    seedAdaptedRun();
    // A second barrel between the first adapter and the switcher — both hidden.
    const s = useSchematicStore.getState();
    useSchematicStore.setState({
      nodes: [...s.nodes,
        { id: "dev-adapter-2", type: "device", position: { x: 600, y: 100 },
          measured: { width: 144, height: 48 },
          data: { label: "BNC → SDI Barrel 2", deviceType: "adapter", ports: [
            { id: "bnc-f-2", label: "BNC (F)", signalType: "sdi", direction: "input", connectorType: "bnc" },
            { id: "bnc-m-2", label: "BNC (M)", signalType: "sdi", direction: "output", connectorType: "bnc" },
          ] } } as unknown as SchematicNode,
      ],
      edges: [
        ...s.edges.map((e) =>
          e.id === "e-adapter-switcher"
            ? { ...e, target: "dev-adapter-2", targetHandle: "bnc-f-2" }
            : e),
        { id: "e-adapter2-switcher", source: "dev-adapter-2", sourceHandle: "bnc-m-2",
          target: "dev-switcher", targetHandle: "sdi-io-1-in",
          data: { signalType: "sdi", cableId: "SDI-003" } } as unknown as ConnectionEdge,
      ],
    });
    useSchematicStore.getState().setHideAdapters(true);
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "SWITCHER", farPort: "SDI I/O 1", farRoom: "Rack Room",
    });
  });

  it("stops at the adapter when nothing is plugged into its far side", () => {
    seedAdaptedRun();
    useSchematicStore.getState().deleteConnection("e-adapter-switcher");
    useSchematicStore.getState().setHideAdapters(true);
    // Nowhere to read through to — the tag keeps naming the leg's real endpoint
    // rather than resolving to nothing and rendering "?".
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "BNC (F) → BNC (M) Barrel", farPort: "BNC (F)",
    });
  });

  // The walk can only follow a connection onward to another DEVICE. Stub the adapter's
  // far side too and every connection leaving it lands on a tag, which names nothing the
  // reader can follow — and a tag is not a device, so it has no label or port to lend.
  it("stops at the adapter when its far side is stubbed as well", () => {
    seedAdaptedRun();
    useSchematicStore.getState().convertEdgeToStubs("e-adapter-switcher");
    useSchematicStore.getState().setHideAdapters(true);
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "BNC (F) → BNC (M) Barrel", farPort: "BNC (F)",
    });
    expect(tagParts("stub-e-adapter-switcher-tgt")).toMatchObject({
      farLabel: "BNC (F) → BNC (M) Barrel", farPort: "BNC (M)",
    });
  });

  // Three legs on one hidden adapter: the tag must not pick the stubbed one just because
  // it comes first in the connection list.
  it("reads past a stubbed leg to the device still wired to the adapter", () => {
    seedAdaptedRun();
    const s = useSchematicStore.getState();
    useSchematicStore.setState({
      nodes: [...s.nodes,
        { id: "dev-monitor", type: "device", position: { x: 400, y: 400 },
          measured: { width: 144, height: 48 },
          data: { label: "MONITOR", deviceType: "display", ports: [
            { id: "sdi-in-1", label: "SDI In 1", signalType: "sdi", direction: "input", connectorType: "bnc" },
          ] } } as unknown as SchematicNode,
      ],
    });
    useSchematicStore.getState().convertEdgeToStubs("e-adapter-switcher");
    useSchematicStore.setState({
      edges: [...useSchematicStore.getState().edges,
        { id: "e-adapter-monitor", source: "dev-adapter", sourceHandle: "bnc-m-1",
          target: "dev-monitor", targetHandle: "sdi-in-1",
          data: { signalType: "sdi", cableId: "SDI-004" } } as unknown as ConnectionEdge,
      ],
    });
    useSchematicStore.getState().setHideAdapters(true);
    expect(tagParts("stub-e-cam-adapter-src")).toMatchObject({
      farLabel: "MONITOR", farPort: "SDI In 1",
    });
  });

  it("keeps the port and room content options in charge of what is shown (#297)", () => {
    seedAdaptedRun();
    useSchematicStore.getState().setHideAdapters(true);
    const parts = tagParts("stub-e-cam-adapter-src")!;
    // The hop supplies the parts; the toggles still decide which of them reach the box.
    expect(buildStubLabelText(parts, { showArrow: true, showPort: false, showRoom: false, pageMode: "never" }))
      .toBe("→ SWITCHER");
    expect(buildStubLabelText(parts, { showArrow: true, showPort: true, showRoom: true, pageMode: "never" }))
      .toBe("→ SWITCHER [SDI I/O 1] (Rack Room)");
  });
});

describe("resolveHiddenAdapterIds is the one rule for what counts as hidden", () => {
  it("hides only adapters, and only when told to", () => {
    seedAdaptedRun();
    const { nodes, edges } = useSchematicStore.getState();
    expect(resolveHiddenAdapterIds(nodes, false, edges)).toEqual(new Set());
    expect(resolveHiddenAdapterIds(nodes, true, edges)).toEqual(new Set(["dev-adapter"]));

    setAdapterVisibility("force-hide");
    expect(resolveHiddenAdapterIds(useSchematicStore.getState().nodes, false, edges))
      .toEqual(new Set(["dev-adapter"]));

    setAdapterVisibility("force-show");
    expect(resolveHiddenAdapterIds(useSchematicStore.getState().nodes, true, edges)).toEqual(new Set());
  });
});
