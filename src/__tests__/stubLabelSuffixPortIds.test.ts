/**
 * #355 at the altitude it was reported — stub tags printing raw port ids.
 *
 * On the seeded fixture the tags read `Confidence Monitor 32" [mon-hdmi-in]` and, after
 * the read-through hop a hidden inline adapter forces (#348), `Powered Speaker (IEC) 1
 * [spk-iec-in]`. Those port ids are real, but the handle→port resolver stripped a
 * trailing -in/-out/-rear/-front before looking them up, so the lookup missed and
 * resolvePortLabel fell back to echoing the handle id. Ports without the suffix
 * ([Edison Out 1], [Edison In]) resolved fine, which is what made it look cosmetic.
 *
 * The unit-level rule lives in portHandleResolution.test.ts; these cases pin the whole
 * canvas/DXF/PDF path — resolveStubLabelParts, including the adapter hop — so the tag
 * text cannot regress independently of the resolver.
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
  useSchematicStore.getState().setHideAdapters(false);
  useSchematicStore.setState({ toasts: [] });
});

/**
 * The two runs from the repro, with the fixture's own port ids:
 *
 *   SWITCHER ─▶ CONFIDENCE MONITOR 32" [mon-hdmi-in]        (direct)
 *   AMP ─▶ [IEC power adapter] ─▶ POWERED SPEAKER (IEC) 1 [spk-iec-in]
 */
function seedRuns() {
  const nodes: SchematicNode[] = [
    { id: "room-foh", type: "room", position: { x: 800, y: 0 },
      style: { width: 400, height: 400 },
      data: { label: "FOH" } } as unknown as SchematicNode,
    { id: "dev-switcher", type: "device", position: { x: 0, y: 0 },
      measured: { width: 144, height: 48 },
      data: { label: "SWITCHER", deviceType: "misc", ports: [
        { id: "laptop-hdmi-out", label: "HDMI Out", signalType: "hdmi", direction: "output", connectorType: "hdmi" },
      ] } } as unknown as SchematicNode,
    { id: "dev-monitor", type: "device", position: { x: 100, y: 0 }, parentId: "room-foh",
      measured: { width: 144, height: 48 },
      data: { label: "CONFIDENCE MONITOR 32\"", deviceType: "display", ports: [
        { id: "mon-hdmi-in", label: "HDMI In", signalType: "hdmi", direction: "input", connectorType: "hdmi" },
      ] } } as unknown as SchematicNode,
    { id: "dev-amp", type: "device", position: { x: 0, y: 200 },
      measured: { width: 144, height: 48 },
      data: { label: "AMP", deviceType: "amplifier", ports: [
        { id: "amp-iec-out", label: "IEC AC Out", signalType: "power", direction: "output", connectorType: "iec-c13" },
      ] } } as unknown as SchematicNode,
    { id: "dev-adapter", type: "device", position: { x: 400, y: 200 },
      measured: { width: 144, height: 48 },
      data: { label: "IEC (F) → IEC (M) Jumper", deviceType: "adapter", ports: [
        { id: "iec-f-in", label: "IEC (F)", signalType: "power", direction: "input", connectorType: "iec-c13" },
        { id: "iec-m-out", label: "IEC (M)", signalType: "power", direction: "output", connectorType: "iec-c14" },
      ] } } as unknown as SchematicNode,
    { id: "dev-speaker", type: "device", position: { x: 100, y: 200 }, parentId: "room-foh",
      measured: { width: 144, height: 48 },
      data: { label: "POWERED SPEAKER (IEC) 1", deviceType: "speaker", ports: [
        { id: "spk-iec-in", label: "IEC AC In", signalType: "power", direction: "input", connectorType: "iec-c14" },
      ] } } as unknown as SchematicNode,
  ];
  const edges: ConnectionEdge[] = [
    { id: "e-switcher-monitor", source: "dev-switcher", sourceHandle: "laptop-hdmi-out",
      target: "dev-monitor", targetHandle: "mon-hdmi-in",
      data: { signalType: "hdmi", cableId: "HDMI-001" } } as unknown as ConnectionEdge,
    { id: "e-amp-adapter", source: "dev-amp", sourceHandle: "amp-iec-out",
      target: "dev-adapter", targetHandle: "iec-f-in",
      data: { signalType: "power", cableId: "PWR-001" } } as unknown as ConnectionEdge,
    { id: "e-adapter-speaker", source: "dev-adapter", sourceHandle: "iec-m-out",
      target: "dev-speaker", targetHandle: "spk-iec-in",
      data: { signalType: "power", cableId: "PWR-002" } } as unknown as ConnectionEdge,
  ];
  useSchematicStore.setState({ nodes, edges });
  useSchematicStore.getState().convertEdgeToStubs("e-switcher-monitor");
  useSchematicStore.getState().convertEdgeToStubs("e-amp-adapter");
}

/** What StubLabelNode's label selector resolves, with the hidden-adapter set republished
 *  the way applyRoutingResult does (recomputeRoutes needs a React Flow instance). */
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

const opts = { showArrow: true, showPort: true, showRoom: false, pageMode: "never" } as const;

describe("stub tags name ports whose real id ends in a face token (#355)", () => {
  it("labels a directly connected -in port instead of echoing its id", () => {
    seedRuns();
    const parts = tagParts("stub-e-switcher-monitor-src")!;
    expect(parts.farPort).toBe("HDMI In");
    expect(buildStubLabelText(parts, opts)).toBe("→ CONFIDENCE MONITOR 32\" [HDMI In]");
  });

  it("labels an -out port on the tag at the other end of the same connection", () => {
    seedRuns();
    const parts = tagParts("stub-e-switcher-monitor-tgt")!;
    expect(parts.farPort).toBe("HDMI Out");
    expect(buildStubLabelText(parts, opts)).toBe("← SWITCHER [HDMI Out]");
  });

  it("labels the -in port reached through a hidden inline adapter", () => {
    seedRuns();
    useSchematicStore.getState().setHideAdapters(true);
    const parts = tagParts("stub-e-amp-adapter-src")!;
    expect(parts).toMatchObject({
      farLabel: "POWERED SPEAKER (IEC) 1",
      farPort: "IEC AC In",
      farRoom: "FOH",
    });
    expect(buildStubLabelText(parts, opts)).toBe("→ POWERED SPEAKER (IEC) 1 [IEC AC In]");
  });

  it("still resolves a genuine bidirectional handle back to its one port", () => {
    seedRuns();
    // Retarget the video run at a bidirectional port, where the -in really is a suffix
    // the handle added on top of the port id.
    const s = useSchematicStore.getState();
    useSchematicStore.setState({
      nodes: s.nodes.map((n) =>
        n.id === "dev-monitor"
          ? ({ ...n, data: { ...n.data, ports: [
              { id: "mon-sdi-io", label: "SDI I/O", signalType: "sdi", direction: "bidirectional", connectorType: "bnc" },
            ] } } as unknown as SchematicNode)
          : n),
      edges: s.edges.map((e) =>
        e.target === "dev-monitor" ? { ...e, targetHandle: "mon-sdi-io-in" } : e),
    });
    expect(tagParts("stub-e-switcher-monitor-src")!.farPort).toBe("SDI I/O");
  });
});
