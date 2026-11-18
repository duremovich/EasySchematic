/**
 * Fixture loading + synthetic-fixture builders for the routing harness.
 *
 * Three fixture sources, all surfaced by allFixtures():
 *   1. synthetic adversarial cases (code, see syntheticFixtures.ts)
 *   2. the bundled defaultSchematic.json (imported)
 *   3. real user exports dropped into src/__tests__/fixtures/routing/*.json
 *      (gitignore'd if proprietary; sanitize before committing)
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  SchematicNode,
  ConnectionEdge,
  DeviceData,
  Port,
  SignalType,
  PortDirection,
  BundleMeta,
} from "../types";
import { deviceContentHeight } from "./deviceHandleLayout";
import { estimateDeviceWidth } from "../deviceWidth";
import { defaultStubPlacement, snapStubHandleY, STUB_W_EST, STUB_H_EST } from "../stubPlacement";
import { reconcileBundleJunctions } from "../bundles";
import { migrateSchematic } from "../migrations";
import defaultSchematicJson from "../defaultSchematic.json";

export interface Fixture {
  name: string;
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  /** Connection bundles, keyed by id — threaded to routeAllEdges for bundle fixtures. */
  bundles?: Record<string, BundleMeta>;
}

const FIXTURE_DIR = fileURLToPath(new URL("../__tests__/fixtures/routing", import.meta.url));

/** Strip transient UI flags and synthesize missing measured boxes for devices.
 *  Device WIDTH always comes from the app's one width rule (estimateDeviceWidth: 144, or
 *  fitted to labels when the device is flagged fitWidth, #418) rather than a saved
 *  `measured.width`, so the harness routes exactly the box DeviceNode renders — a stale
 *  saved width can't hide a geometry change from the oracle. */
function normalize(nodes: SchematicNode[]): SchematicNode[] {
  return nodes.map((n) => {
    const clean = { ...n, selected: false, dragging: false } as SchematicNode;
    // A hidden adapter renders as a 1×1 box (DeviceNode); keep that saved box as-is rather
    // than turning it into a full-width obstacle.
    const hiddenBox = clean.measured?.width != null && clean.measured.width <= 1;
    if (clean.type === "device" && !hiddenBox) {
      const data = clean.data as DeviceData;
      const width = estimateDeviceWidth(data);
      const height = clean.measured?.height ?? deviceContentHeight({ data, measured: { width } });
      clean.measured = { width, height };
    }
    if (clean.type === "stub-label") {
      if (!clean.measured) clean.measured = { width: STUB_W_EST, height: STUB_H_EST };
      // Mirror the app's load heal: the connecting handle (box center) must sit on a
      // grid line; legacy saves often have the box TOP grid-aligned → handle at +7.
      clean.position = {
        x: clean.position.x,
        y: snapStubHandleY(clean.position.y, clean.measured.height),
      };
    }
    return clean;
  });
}

export function makeFixture(
  name: string,
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  bundles?: Record<string, BundleMeta>,
): Fixture {
  // Mirror the app's heal-on-load: spawn break-in/out junction anchors for any live bundle so
  // the harness measures the real Phase-3 router path (entry/exit read from junction positions),
  // not the computeBundleTrunk fallback.
  const nodesWithJunctions = reconcileBundleJunctions(normalize(nodes), edges);
  return { name, nodes: nodesWithJunctions, edges, bundles };
}

/** Load a fixture from a JSON file (full schematic or thin {nodes,edges}). */
export function loadFixture(path: string, name?: string): Fixture {
  let raw = JSON.parse(readFileSync(path, "utf8")) as {
    version?: number;
    nodes: SchematicNode[];
    edges: ConnectionEdge[];
  };
  // Versioned exports run the app's migration chain (e.g. the v41 x0.8 grid rescale) so
  // the harness measures exactly what the app would route. Thin {nodes,edges} fixtures
  // carry no version and are assumed current-world.
  if (typeof raw.version === "number") raw = migrateSchematic(raw);
  const base = name ?? path.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
  return makeFixture(base, raw.nodes ?? [], raw.edges ?? []);
}

/** Real-export fixtures dropped into the fixtures dir (excludes the baselines/reports subdirs). */
export function loadFileFixtures(): Fixture[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => loadFixture(`${FIXTURE_DIR}/${f}`));
}

export function defaultSchematicFixture(): Fixture {
  // Clone before migrating — migrateSchematic mutates, and the JSON import is module-cached.
  const data = migrateSchematic(
    structuredClone(defaultSchematicJson),
  ) as unknown as { nodes: SchematicNode[]; edges: ConnectionEdge[] };
  return makeFixture("defaultSchematic", data.nodes, data.edges);
}

// --------------------------------------------------------------------------
// Synthetic builders
// --------------------------------------------------------------------------

let portSeq = 0;

export function makePort(
  label: string,
  signalType: SignalType,
  direction: PortDirection,
  extra: Partial<Port> = {},
): Port {
  return { id: `p${portSeq++}`, label, signalType, direction, ...extra };
}

export function makeDevice(opts: {
  id: string;
  label?: string;
  x: number;
  y: number;
  ports: Port[];
  parentId?: string;
  deviceType?: string;
  auxiliaryData?: DeviceData["auxiliaryData"];
  /** Fit-width device (#418) — what every newly placed device is. */
  fitWidth?: boolean;
}): SchematicNode {
  const data = {
    label: opts.label ?? opts.id,
    deviceType: opts.deviceType ?? "generic",
    ports: opts.ports,
    auxiliaryData: opts.auxiliaryData,
    ...(opts.fitWidth ? { fitWidth: true } : {}),
  } as unknown as DeviceData;
  const width = estimateDeviceWidth(data);
  const height = deviceContentHeight({ data, measured: { width } });
  return {
    id: opts.id,
    type: "device",
    position: { x: opts.x, y: opts.y },
    parentId: opts.parentId,
    data,
    measured: { width, height },
  } as unknown as SchematicNode;
}

export function makeEdge(opts: {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  signalType: SignalType;
  data?: Partial<ConnectionEdge["data"]>;
}): ConnectionEdge {
  return {
    id: opts.id,
    type: "smoothstep",
    source: opts.source,
    sourceHandle: opts.sourceHandle,
    target: opts.target,
    targetHandle: opts.targetHandle,
    data: { signalType: opts.signalType, ...opts.data },
  } as unknown as ConnectionEdge;
}

/**
 * Build a stubbed connection: two stub-label nodes + two stub-leg edges sharing a
 * linkedConnectionId. srcHandlePos/tgtHandlePos are the absolute device handle
 * positions the stub boxes are placed relative to.
 */
export function makeStubPair(opts: {
  linkId: string;
  signalType: SignalType;
  source: string;
  sourceHandle: string;
  srcHandlePos: { x: number; y: number };
  srcPortSide: "left" | "right";
  target: string;
  targetHandle: string;
  tgtHandlePos: { x: number; y: number };
  tgtPortSide: "left" | "right";
}): { nodes: SchematicNode[]; edges: ConnectionEdge[] } {
  const srcPlace = defaultStubPlacement(opts.srcHandlePos, opts.srcPortSide);
  const tgtPlace = defaultStubPlacement(opts.tgtHandlePos, opts.tgtPortSide);
  const srcStubId = `stub-${opts.linkId}-src`;
  const tgtStubId = `stub-${opts.linkId}-tgt`;
  const stubNode = (id: string, pos: { x: number; y: number }, side: "source" | "target"): SchematicNode =>
    ({
      id,
      type: "stub-label",
      position: pos,
      data: { signalType: opts.signalType, linkedConnectionId: opts.linkId, side, placed: true },
      measured: { width: STUB_W_EST, height: STUB_H_EST },
    } as unknown as SchematicNode);

  return {
    nodes: [
      stubNode(srcStubId, srcPlace.pos, "source"),
      stubNode(tgtStubId, tgtPlace.pos, "target"),
    ],
    edges: [
      makeEdge({
        id: `${opts.linkId}-src`,
        source: opts.source,
        sourceHandle: opts.sourceHandle,
        target: srcStubId,
        targetHandle: srcPlace.handle,
        signalType: opts.signalType,
        data: { linkedConnectionId: opts.linkId },
      }),
      makeEdge({
        id: `${opts.linkId}-tgt`,
        source: tgtStubId,
        sourceHandle: tgtPlace.handle,
        target: opts.target,
        targetHandle: opts.targetHandle,
        signalType: opts.signalType,
        data: { linkedConnectionId: opts.linkId },
      }),
    ],
  };
}
