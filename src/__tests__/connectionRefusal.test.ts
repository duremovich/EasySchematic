/**
 * A refused connection says why (#439).
 *
 * Dragging a connection onto a port the rules refuse used to paint the ghost red and then
 * end in silence. connectionRefusal now names the rule that fired, the ghost shows that
 * beside the red line, and connectOrExplain (the release path the canvas uses) raises it
 * as a toast whenever the store refused the drop without opening the adapter dialog.
 *
 * The store reads editor preferences from localStorage at import time, so a minimal
 * in-memory localStorage is installed before the store is imported.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Connection } from "@xyflow/react";
import type { ConnectionEdge, ConnectorType, DeviceNode, Port, SchematicNode } from "../types";

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
let connectionRefusal: typeof import("../store")["connectionRefusal"];

beforeAll(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as { crypto?: unknown }).crypto = {
      randomUUID: () => "test-" + Math.random().toString(36).slice(2),
    };
  }
  ({ useSchematicStore, connectionRefusal } = await import("../store"));
});

/** Analog line port on XLR — the shape from the Discord report. Ids end in -in/-out the
 *  way the seeded fixture's do, so handle resolution sees realistic ids. */
function port(id: string, overrides: Partial<Port> = {}): Port {
  return { id, label: id, signalType: "analog-audio", direction: "output", connectorType: "xlr-3", ...overrides };
}

function device(id: string, label: string, ports: Port[], x = 0, deviceType = "audio-mixer"): DeviceNode {
  return {
    id,
    type: "device",
    position: { x, y: 0 },
    data: { label, deviceType, ports },
  } as DeviceNode;
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): ConnectionEdge {
  return { id, source, target, sourceHandle, targetHandle, data: { signalType: "analog-audio" } } as ConnectionEdge;
}

function conn(source: string, sourceHandle: string, target: string, targetHandle: string): Connection {
  return { source, sourceHandle, target, targetHandle };
}

/** One-jack patch panel: a passthrough port whose faces carry the given connectors. */
function panel(id: string, front: ConnectorType, rear: ConnectorType): DeviceNode {
  return device(id, "Patchbay", [
    { id: "p1", label: "1", signalType: "analog-audio", direction: "passthrough", frontConnectorType: front, rearConnectorType: rear },
    { id: "p2", label: "2", signalType: "analog-audio", direction: "passthrough", frontConnectorType: front, rearConnectorType: rear },
  ], 200, "patch-panel");
}

/** Mixer (analog outs) → Amp (analog ins), nothing wired yet. */
function rig(): SchematicNode[] {
  return [
    device("mix", "Mixer", [
      port("main-l-out", { label: "Main L" }),
      port("main-r-out", { label: "Main R" }),
      port("aux-in", { label: "Aux In", direction: "input" }),
      port("snake-out", { label: "Snake", isMulticable: true, channelCount: 8, connectorType: "multipin" as ConnectorType }),
      port("hdmi-out", { label: "Video", signalType: "hdmi", connectorType: "hdmi" }),
      port("io-1", { label: "I/O 1", direction: "bidirectional" }),
    ]),
    device("amp", "Amp", [
      port("ch-a-in", { label: "Ch A", direction: "input" }),
      port("ch-b-in", { label: "Ch B", direction: "input" }),
      port("ch-a-out", { label: "Thru A" }),
      port("hdmi-in", { label: "HDMI In", direction: "input", signalType: "hdmi", connectorType: "hdmi" }),
      port("trs-in", { label: "Line In", direction: "input", connectorType: "trs-quarter" }),
    ], 400, "amplifier"),
  ];
}

const refusal = (nodes: SchematicNode[], edges: ConnectionEdge[], c: Connection) =>
  connectionRefusal(nodes, edges, c, null);

describe("connectionRefusal names the rule that refused a connection (#439)", () => {
  it("allows a plain analog output → analog input", () => {
    expect(refusal(rig(), [], conn("mix", "main-l-out", "amp", "ch-a-in"))).toBeNull();
  });

  it("does not refuse a connector mismatch between ordinary ports (that goes to the adapter flow)", () => {
    expect(refusal(rig(), [], conn("mix", "main-l-out", "amp", "trs-in"))).toBeNull();
  });

  it("explains two outputs", () => {
    const r = refusal(rig(), [], conn("mix", "main-l-out", "amp", "ch-a-out"));
    expect(r).toEqual({ code: "direction", message: "Both ports are outputs. Connect an output to an input." });
  });

  it("explains two inputs", () => {
    const r = refusal(rig(), [], conn("mix", "aux-in", "amp", "ch-a-in"));
    expect(r?.code).toBe("direction");
    expect(r?.message).toBe("Both ports are inputs. Connect an output to an input.");
  });

  it("explains an input sourcing an output", () => {
    const r = refusal(rig(), [], conn("mix", "aux-in", "amp", "ch-a-out"));
    expect(r?.code).toBe("direction");
    expect(r?.message).toBe("Wrong direction. Connect an output to an input.");
  });

  it("names both signal types on a signal mismatch", () => {
    const r = refusal(rig(), [], conn("mix", "main-l-out", "amp", "hdmi-in"));
    expect(r).toEqual({ code: "signal", message: "Signal mismatch: Analog can't connect to HDMI." });
  });

  it("explains a multicable trunk meeting a single port, naming both", () => {
    const r = refusal(rig(), [], conn("mix", "snake-out", "amp", "ch-a-in"));
    expect(r?.code).toBe("multicable");
    expect(r?.message).toBe('"Snake" on Mixer is a multicable trunk and "Ch A" on Amp isn\'t. Trunks only connect to other trunks.');
  });

  it("names the occupied input", () => {
    const edges = [edge("e1", "mix", "main-l-out", "amp", "ch-a-in")];
    const r = refusal(rig(), edges, conn("mix", "main-r-out", "amp", "ch-a-in"));
    expect(r?.code).toBe("occupied");
    expect(r?.message).toBe('"Ch A" on Amp already has a connection. To allow more, turn on Multi-connect ("M") for that port in the device editor.');
  });

  it("names the occupied output", () => {
    const edges = [edge("e1", "mix", "main-l-out", "amp", "ch-a-in")];
    const r = refusal(rig(), edges, conn("mix", "main-l-out", "amp", "ch-b-in"));
    expect(r?.code).toBe("occupied");
    expect(r?.message).toContain('"Main L" on Mixer already has a connection');
  });

  it("lets the connection being re-routed off its own port", () => {
    const edges = [edge("e1", "mix", "main-l-out", "amp", "ch-a-in")];
    expect(connectionRefusal(rig(), edges, conn("mix", "main-r-out", "amp", "ch-a-in"), "e1")).toBeNull();
  });

  it("explains a bidirectional port already used on its other side", () => {
    // I/O 1 is already receiving on its -in face; driving out of it is refused.
    const edges = [edge("e1", "amp", "ch-a-out", "mix", "io-1-in")];
    const r = refusal(rig(), edges, conn("mix", "io-1-out", "amp", "ch-b-in"));
    expect(r?.code).toBe("occupied");
    expect(r?.message).toBe('"I/O 1" on Mixer is already connected on its other side.');
  });

  it("explains a pass-through face whose connector won't mate, naming both connectors", () => {
    const nodes = [...rig(), panel("pp", "trs-quarter", "db25")];
    const r = refusal(nodes, [], conn("mix", "main-l-out", "pp", "p1-rear"));
    expect(r?.code).toBe("connector");
    expect(r?.message).toBe("Connector mismatch: XLR-3 won't mate with DB25, and a pass-through port can't take an adapter.");
  });

  it("explains a pass-through signal mismatch", () => {
    // Analog patchbay with HDMI-shaped jacks, so the connector passes and the signal decides.
    const nodes = [...rig(), panel("pp", "hdmi", "hdmi")];
    const r = refusal(nodes, [], conn("mix", "hdmi-out", "pp", "p1-rear"));
    expect(r).toEqual({ code: "signal", message: "Signal mismatch: HDMI can't connect to Analog." });
  });

  it("explains a device patched to itself (anything but a patch panel's front jacks)", () => {
    const nodes = [...rig(), panel("pp", "trs-quarter", "xlr-3")];
    const r = refusal(nodes, [], conn("pp", "p1-rear", "pp", "p2-rear"));
    expect(r?.code).toBe("same-device");
    expect(refusal(nodes, [], conn("pp", "p1-front", "pp", "p2-front"))).toBeNull();
  });

  it("explains an occupied pass-through face", () => {
    const nodes = [...rig(), panel("pp", "xlr-3", "xlr-3")];
    const edges = [edge("e1", "mix", "main-l-out", "pp", "p1-rear")];
    const r = refusal(nodes, edges, conn("mix", "main-r-out", "pp", "p1-rear"));
    expect(r?.code).toBe("occupied");
    expect(r?.message).toContain('"1" on Patchbay already has a connection');
  });

  it("explains an end that isn't a port", () => {
    const r = refusal(rig(), [], conn("mix", "no-such-port", "amp", "ch-a-in"));
    expect(r?.code).toBe("not-a-port");
  });

  it("explains a stub leg whose link is broken", () => {
    const tag = { id: "tag1", type: "stub-label", position: { x: 0, y: 0 }, data: { signalType: "analog-audio", side: "source" } } as unknown as SchematicNode;
    const r = refusal([...rig(), tag], [], conn("mix", "main-l-out", "tag1", "l"));
    expect(r?.code).toBe("stub-link-broken");
  });

  it("names the signals when two outputs also carry different signals (what the drop's dialog talks about)", () => {
    const r = refusal(rig(), [], conn("mix", "hdmi-out", "amp", "ch-a-out"));
    expect(r).toEqual({ code: "signal", message: "Signal mismatch: HDMI can't connect to Analog." });
    // Two inputs never reach that dialog, so they keep the direction reason.
    expect(refusal(rig(), [], conn("amp", "hdmi-in", "mix", "aux-in"))?.code).toBe("direction");
  });
});

/**
 * Accept/refuse pinned port pair by port pair through the store's isValidConnection —
 * the boolean the canvas, the ghost and React Flow all consult — alongside the refusal
 * kind. Expected validity is master's (pre-#439) behaviour for each pair; the rewrite
 * must not move any of them.
 */
describe("validity table (fixture port pairs)", () => {
  const cases: Array<[string, Connection, string | null]> = [
    ["analog out → analog in", conn("mix", "main-r-out", "amp", "ch-b-in"), null],
    ["XLR out → TRS in (connector mismatch goes to the adapter flow)", conn("mix", "main-r-out", "amp", "trs-in"), null],
    ["output → occupied input", conn("mix", "main-r-out", "amp", "ch-a-in"), "occupied"],
    ["occupied output → free input", conn("mix", "main-l-out", "amp", "ch-b-in"), "occupied"],
    ["output → output, same signal", conn("mix", "main-r-out", "amp", "ch-a-out"), "direction"],
    ["input → input", conn("mix", "aux-in", "amp", "ch-b-in"), "direction"],
    ["output → output, different signals", conn("mix", "hdmi-out", "amp", "ch-a-out"), "signal"],
    ["analog out → HDMI in", conn("mix", "main-r-out", "amp", "hdmi-in"), "signal"],
    ["multicable trunk → single input", conn("mix", "snake-out", "amp", "ch-b-in"), "multicable"],
    ["bidirectional out face → free input", conn("mix", "io-1-out", "amp", "ch-b-in"), null],
    ["XLR out → DB25 patch panel rear", conn("mix", "main-r-out", "pp", "p1-rear"), "connector"],
    ["XLR out → TRS patch panel front (compatible face)", conn("mix", "main-r-out", "pp", "p1-front"), null],
    ["patch panel rear → its own rear", conn("pp", "p1-rear", "pp", "p2-rear"), "same-device"],
    ["patch panel front → its own front", conn("pp", "p1-front", "pp", "p2-front"), null],
    ["unknown port", conn("mix", "nope-out", "amp", "ch-b-in"), "not-a-port"],
  ];

  it.each(cases)("%s", (_name, c, expected) => {
    const nodes = [...rig(), panel("pp", "trs-quarter", "db25")];
    const edges = [edge("e1", "mix", "main-l-out", "amp", "ch-a-in")];
    useSchematicStore.setState({ nodes, edges });
    const s = useSchematicStore.getState();
    expect(s.isValidConnection(c)).toBe(expected === null);
    expect(s.explainConnectionRefusal(c)?.code ?? null).toBe(expected);
  });
});

describe("connectOrExplain — the canvas release path (#439)", () => {
  beforeEach(() => {
    useSchematicStore.setState({ nodes: rig(), edges: [], toasts: [], pendingIncompatibleConnection: null });
  });

  it("toasts the reason when the drop is refused outright, and adds nothing", () => {
    useSchematicStore.setState({ edges: [edge("e1", "mix", "main-l-out", "amp", "ch-a-in")] });
    const before = useSchematicStore.getState().edges;
    useSchematicStore.getState().connectOrExplain(conn("mix", "main-r-out", "amp", "ch-a-in"));
    const s = useSchematicStore.getState();
    expect(s.edges).toBe(before);
    expect(s.toasts.map((t) => [t.type, t.message])).toEqual([
      ["error", '"Ch A" on Amp already has a connection. To allow more, turn on Multi-connect ("M") for that port in the device editor.'],
    ]);
  });

  it("toasts two outputs (the red line from the Discord report)", () => {
    useSchematicStore.getState().connectOrExplain(conn("mix", "main-l-out", "amp", "ch-a-out"));
    expect(useSchematicStore.getState().toasts.map((t) => t.message)).toEqual([
      "Both ports are outputs. Connect an output to an input.",
    ]);
  });

  it("words the toast for a re-route drag, which goes on to act on the original connection", () => {
    useSchematicStore.setState({ edges: [edge("e1", "mix", "main-l-out", "amp", "ch-a-in")] });
    useSchematicStore.getState().connectOrExplain(conn("mix", "main-r-out", "amp", "ch-a-in"), { rerouting: true });
    expect(useSchematicStore.getState().toasts.map((t) => t.message)).toEqual([
      `Can't re-route to that port. "Ch A" on Amp already has a connection. To allow more, turn on Multi-connect ("M") for that port in the device editor.`,
    ]);
  });

  it("stays quiet when two outputs with different signals open the adapter flow", () => {
    useSchematicStore.getState().connectOrExplain(conn("mix", "hdmi-out", "amp", "ch-a-out"));
    const s = useSchematicStore.getState();
    expect(!!s.pendingIncompatibleConnection || s.edges.length > 0).toBe(true);
    expect(s.toasts).toEqual([]);
  });

  it("connects a valid drop with no toast", () => {
    useSchematicStore.getState().connectOrExplain(conn("mix", "main-l-out", "amp", "ch-a-in"));
    const s = useSchematicStore.getState();
    expect(s.edges).toHaveLength(1);
    expect(s.toasts).toEqual([]);
  });

  it("stays quiet when the store takes a signal mismatch into the adapter flow instead", () => {
    useSchematicStore.getState().connectOrExplain(conn("mix", "main-l-out", "amp", "hdmi-in"));
    const s = useSchematicStore.getState();
    // Either the dialog opened or a single matching adapter was inserted — both explain
    // themselves, so no refusal toast on top.
    expect(!!s.pendingIncompatibleConnection || s.edges.length > 0).toBe(true);
    expect(s.toasts).toEqual([]);
  });
});
