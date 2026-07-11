/**
 * Fixture loading + the synthetic kitchen-sink fixture for the reports harness.
 *
 * Three fixture sources, all surfaced by allReportFixtures():
 *   1. the synthetic kitchen-sink schematic (code, below) — purpose-built to put at
 *      least one row in every section of every report
 *   2. the bundled defaultSchematic.json
 *   3. real user exports dropped into src/__tests__/fixtures/reports/*.json
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
  ConnectorType,
  SchematicPage,
  BundleMeta,
} from "../types";
import { migrateSchematic } from "../migrations";
import defaultSchematicJson from "../defaultSchematic.json";

export interface ReportFixture {
  name: string;
  nodes: SchematicNode[];
  edges: ConnectionEdge[];
  pages: SchematicPage[];
  bundles?: Record<string, BundleMeta>;
}

const FIXTURE_DIR = fileURLToPath(new URL("../__tests__/fixtures/reports", import.meta.url));

/** Load a fixture from a JSON file (full schematic export). */
export function loadReportFixture(path: string, name?: string): ReportFixture {
  let raw = JSON.parse(readFileSync(path, "utf8")) as {
    version?: number;
    nodes?: SchematicNode[];
    edges?: ConnectionEdge[];
    pages?: SchematicPage[];
    bundles?: Record<string, BundleMeta>;
  };
  if (typeof raw.version === "number") raw = migrateSchematic(raw);
  const base = name ?? path.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
  return {
    name: base,
    nodes: raw.nodes ?? [],
    edges: raw.edges ?? [],
    pages: raw.pages ?? [],
    bundles: raw.bundles,
  };
}

/** Real-export fixtures dropped into the fixtures dir (excludes the baselines/snapshots subdirs). */
export function loadFileFixtures(): ReportFixture[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => loadReportFixture(`${FIXTURE_DIR}/${f}`));
}

export function defaultSchematicReportFixture(): ReportFixture {
  // Clone before migrating — migrateSchematic mutates, and the JSON import is module-cached.
  const data = migrateSchematic(structuredClone(defaultSchematicJson)) as unknown as {
    nodes: SchematicNode[];
    edges: ConnectionEdge[];
    pages?: SchematicPage[];
  };
  return {
    name: "defaultSchematic",
    nodes: data.nodes,
    edges: data.edges,
    pages: data.pages ?? [],
  };
}

// --------------------------------------------------------------------------
// Synthetic kitchen-sink builders
// --------------------------------------------------------------------------

function port(
  id: string,
  label: string,
  signalType: SignalType,
  direction: PortDirection,
  connectorType: ConnectorType,
  extra: Partial<Port> = {},
): Port {
  return { id, label, signalType, direction, connectorType, ...extra } as Port;
}

function device(
  id: string,
  label: string,
  ports: Port[],
  extra: Partial<DeviceData> & { parentId?: string } = {},
): SchematicNode {
  const { parentId, ...data } = extra;
  return {
    id,
    type: "device",
    position: { x: 0, y: 0 },
    parentId,
    data: { label, deviceType: "custom", ports, ...data },
  } as unknown as SchematicNode;
}

function room(id: string, label: string): SchematicNode {
  return {
    id,
    type: "room",
    position: { x: 0, y: 0 },
    data: { label },
  } as unknown as SchematicNode;
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  signalType: SignalType,
  data: Record<string, unknown> = {},
): ConnectionEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: { signalType, ...data },
  } as unknown as ConnectionEdge;
}

/** Two stub-label nodes + two stub-leg edges sharing a linkedConnectionId. */
function stubbed(
  linkId: string,
  signalType: SignalType,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  data: Record<string, unknown> = {},
): { nodes: SchematicNode[]; edges: ConnectionEdge[] } {
  const stub = (id: string, side: "source" | "target"): SchematicNode =>
    ({
      id,
      type: "stub-label",
      position: { x: 0, y: 0 },
      data: { signalType, linkedConnectionId: linkId, side, placed: true },
    } as unknown as SchematicNode);
  return {
    nodes: [stub(`stub-${linkId}-src`, "source"), stub(`stub-${linkId}-tgt`, "target")],
    edges: [
      edge(`${linkId}-src`, source, sourceHandle, `stub-${linkId}-src`, "l", signalType, {
        linkedConnectionId: linkId,
        ...data,
      }),
      edge(`${linkId}-tgt`, `stub-${linkId}-tgt`, "r", target, targetHandle, signalType, {
        linkedConnectionId: linkId,
        ...data,
      }),
    ],
  };
}

/**
 * The kitchen-sink fixture. One schematic that puts at least one row into every
 * section of every report:
 *
 * - Pack list: grouped devices (2× camera), serials, spares, notes, unit costs,
 *   expansion-card-free devices, adapters, cable accessories, venue-provided
 *   exclusion, costed racks (grouped 2×), cable summary with routes.
 * - Cable schedule: stored + generated cable IDs, gauge/alias/tested/use columns,
 *   bundles, multicable (snake), stubbed connection collapsed to one row.
 * - Network report: static IPs, DHCP server + client (client behind a stub — #220),
 *   VLANs, PoE draw + budget, duplicate-IP warning, ip-in-range warning,
 *   subnet-conflict warning.
 * - Power report: distro loading incl. a stubbed power feed (#172), voltage,
 *   unconnected power.
 * - Patch panel schedule: passthrough port with front + rear connections.
 */
export function kitchenSinkFixture(): ReportFixture {
  const nodes: SchematicNode[] = [
    room("room-cr", "Control Room"),
    room("room-stage", "Stage"),

    // Two identical cameras (grouping), serials, PoE draw, one duplicate static IP
    device(
      "cam-1",
      "Camera 1",
      [
        port("cam1-sdi", "SDI Out", "sdi", "output", "bnc"),
        port("cam1-eth", "LAN", "ethernet", "bidirectional", "rj45", { poeDrawW: 25 }),
      ],
      {
        parentId: "room-stage",
        model: "ProCam 4K",
        manufacturer: "CamCo",
        modelNumber: "PC-4K",
        unitCost: 1500,
        serialNumber: "SN-001",
        note: "Check lens before load-in",
        powerDrawW: 45,
      },
    ),
    device(
      "cam-2",
      "Camera 2",
      [
        port("cam2-sdi", "SDI Out", "sdi", "output", "bnc"),
        port("cam2-eth", "LAN", "ethernet", "bidirectional", "rj45", {
          poeDrawW: 25,
          networkConfig: { ip: "10.10.10.150" }, // duplicate of legacy encoder's IP
        }),
      ],
      {
        parentId: "room-stage",
        model: "ProCam 4K",
        manufacturer: "CamCo",
        modelNumber: "PC-4K",
        unitCost: 1500,
        serialNumber: "SN-002",
        powerDrawW: 45,
      },
    ),

    // Switcher with static IP + VLAN, analog inputs for the snake, power inlet
    device(
      "switcher",
      "Vision Switcher",
      [
        port("sw-sdi1", "SDI In 1", "sdi", "input", "bnc"),
        port("sw-sdi2", "SDI In 2", "sdi", "input", "bnc"),
        port("sw-hdmi", "PGM Out", "hdmi", "output", "hdmi"),
        port("sw-aud1", "Audio In 1", "analog-audio", "input", "xlr-3"),
        port("sw-aud2", "Audio In 2", "analog-audio", "input", "xlr-3"),
        port("sw-eth", "Control", "ethernet", "bidirectional", "rj45", {
          networkConfig: { ip: "10.10.10.5", subnetMask: "255.255.255.0", gateway: "10.10.10.1", vlan: 10 },
        }),
        port("sw-pwr", "AC In", "power", "input", "powercon"),
      ],
      {
        parentId: "room-cr",
        model: "VS-800",
        manufacturer: "SwitchCorp",
        modelNumber: "VS-800",
        unitCost: 8000,
        powerDrawW: 350,
        voltage: "120V",
        hostname: "vs-800",
      },
    ),

    // Core router: DHCP server + PoE budget
    device(
      "router",
      "Core Router",
      [
        port("rt-eth1", "Port 1", "ethernet", "bidirectional", "rj45", {
          networkConfig: { ip: "10.10.10.1", subnetMask: "255.255.255.0", vlan: 10 },
        }),
        port("rt-eth2", "Port 2", "ethernet", "bidirectional", "rj45"),
        port("rt-eth3", "Port 3", "ethernet", "bidirectional", "rj45"),
        port("rt-eth4", "Port 4", "ethernet", "bidirectional", "rj45", {
          // /24 vs the legacy encoder's /16 across e-legacy → subnet-conflict warning
          networkConfig: { ip: "10.10.10.4", subnetMask: "255.255.255.0" },
        }),
      ],
      {
        parentId: "room-cr",
        model: "NetHub 8",
        manufacturer: "NetCo",
        powerDrawW: 60,
        poeBudgetW: 120,
        hostname: "core-rt",
        dhcpServer: {
          enabled: true,
          rangeStart: "10.10.10.100",
          rangeEnd: "10.10.10.200",
          subnetMask: "255.255.255.0",
          gateway: "10.10.10.1",
        },
      },
    ),

    // DHCP client reached through a STUBBED connection (#220)
    device(
      "show-pc",
      "Show PC",
      [
        port("pc-eth", "LAN", "ethernet", "bidirectional", "rj45", { networkConfig: { dhcp: true } }),
        port("pc-pwr", "AC In", "power", "input", "edison"),
      ],
      { parentId: "room-cr", model: "Show PC", powerDrawW: 150 },
    ),

    // Static IP inside the DHCP pool + mismatched subnet (two warnings)
    device(
      "legacy",
      "Legacy Encoder",
      [
        port("leg-eth", "LAN", "ethernet", "bidirectional", "rj45", {
          networkConfig: { ip: "10.10.10.150", subnetMask: "255.255.0.0" },
        }),
      ],
      { parentId: "room-stage", model: "Encoder X", powerDrawW: 30 },
    ),

    // FOH mixer ×2 — one is a cold spare with a serial
    device(
      "mixer",
      "FOH Mixer",
      [
        port("mx-out1", "Main L", "analog-audio", "output", "xlr-3"),
        port("mx-out2", "Main R", "analog-audio", "output", "xlr-3"),
      ],
      { parentId: "room-stage", model: "MixDesk 24", manufacturer: "AudioCo", unitCost: 3200, serialNumber: "SN-MIX-1", powerDrawW: 90 },
    ),
    device(
      "mixer-spare",
      "FOH Mixer (spare)",
      [
        port("mxs-out1", "Main L", "analog-audio", "output", "xlr-3"),
        port("mxs-out2", "Main R", "analog-audio", "output", "xlr-3"),
      ],
      { parentId: "room-stage", model: "MixDesk 24", manufacturer: "AudioCo", unitCost: 3200, serialNumber: "SN-MIX-2", isSpare: true, powerDrawW: 90 },
    ),

    // Patch panel with a passthrough port (rear: switcher PGM, front: display)
    device(
      "pp-01",
      "PP-01",
      [port("pp-p1", "Port 1", "hdmi", "passthrough", "hdmi")],
      { parentId: "room-cr", model: "HDMI Panel 8", deviceType: "patch-panel" },
    ),

    // Display fed from the patch panel front
    device(
      "display",
      "Stage Display",
      [port("disp-hdmi", "HDMI In", "hdmi", "input", "hdmi")],
      { parentId: "room-stage", model: "BigScreen 85", powerDrawW: 120 },
    ),

    // Venue-provided device — must NOT appear in the pack list device section
    device(
      "house-pa",
      "House PA",
      [port("pa-in", "Input", "analog-audio", "input", "xlr-3")],
      { parentId: "room-stage", model: "House PA", isVenueProvided: true },
    ),

    // Passive adapter — its own pack-list section
    device(
      "adapt-1",
      "SDI-HDMI Adapter",
      [
        port("ad-in", "SDI In", "sdi", "input", "bnc"),
        port("ad-out", "HDMI Out", "hdmi", "output", "hdmi"),
      ],
      { parentId: "room-cr", model: "SDI2HDMI", manufacturer: "AdaptCo", modelNumber: "A-100", deviceType: "adapter" },
    ),

    // Cable accessory — its own pack-list section
    device("ramp-1", "Cable Ramp", [], {
      parentId: "room-stage",
      model: "Ramp 5ch",
      deviceType: "cable-ramp",
      isCableAccessory: true,
    }),

    // Power distro feeding the switcher directly and the Show PC via a stub (#172)
    device(
      "distro",
      "Power Distro",
      [
        port("pd-out1", "Circuit 1", "power", "output", "powercon"),
        port("pd-out2", "Circuit 2", "power", "output", "edison"),
      ],
      { parentId: "room-cr", model: "PD-2000", deviceType: "power", powerCapacityW: 2000 },
    ),
  ];

  const stubNet = stubbed("stub-net", "ethernet", "router", "rt-eth2-out", "show-pc", "pc-eth-in", {
    cableId: "E010",
  });
  const stubPwr = stubbed("stub-pwr", "power", "distro", "pd-out2-out", "show-pc", "pc-pwr-in");

  const edges: ConnectionEdge[] = [
    // Video: camera 1 through the adapter, camera 2 direct. Stored + generated IDs,
    // gauge/alias/tested/use columns exercised.
    edge("e-cam1-ad", "cam-1", "cam1-sdi-out", "adapt-1", "ad-in-in", "sdi", {
      cableId: "V001",
      cableLength: "25 ft",
      gaugeAwg: "22",
      cableAlias: "CAM-A",
      tested: true,
      testedDate: "2026-06-01",
      cableUse: "field",
    }),
    edge("e-ad-sw", "adapt-1", "ad-out-out", "switcher", "sw-sdi1-in", "hdmi", { cableUse: "patch" }),
    edge("e-cam2-sw", "cam-2", "cam2-sdi-out", "switcher", "sw-sdi2-in", "sdi", { cableLength: "50 ft" }),

    // Audio snake (multicable) from the mixer
    edge("e-aud1", "mixer", "mx-out1-out", "switcher", "sw-aud1-in", "analog-audio", { multicableLabel: "Audio Snake" }),
    edge("e-aud2", "mixer", "mx-out2-out", "switcher", "sw-aud2-in", "analog-audio", { multicableLabel: "Audio Snake" }),

    // Network: bundled camera loom, direct legacy link, switcher control,
    // and the stubbed Show PC drop (#220)
    edge("e-cam1-net", "cam-1", "cam1-eth-out", "router", "rt-eth1-in", "ethernet", { bundleId: "bundle-1" }),
    edge("e-cam2-net", "cam-2", "cam2-eth-out", "router", "rt-eth3-in", "ethernet", { bundleId: "bundle-1" }),
    edge("e-legacy", "legacy", "leg-eth-out", "router", "rt-eth4-in", "ethernet"),
    edge("e-sw-net", "switcher", "sw-eth-out", "router", "rt-eth1-in", "ethernet"),
    ...stubNet.edges,

    // Patch panel: rear feed in, front feed out
    edge("e-sw-pp", "switcher", "sw-hdmi-out", "pp-01", "pp-p1-rear", "hdmi"),
    edge("e-pp-disp", "pp-01", "pp-p1-front", "display", "disp-hdmi-in", "hdmi"),

    // Power: direct + stubbed
    edge("e-pwr-sw", "distro", "pd-out1-out", "switcher", "sw-pwr-in", "power"),
    ...stubPwr.edges,
  ];

  const pages: SchematicPage[] = [
    {
      id: "page-racks",
      label: "Racks",
      type: "rack-elevation",
      racks: [
        {
          id: "rack-a",
          label: "Main Rack",
          rackType: "floor-19",
          heightU: 42,
          depthMm: 800,
          widthClass: "19in",
          position: { x: 0, y: 0 },
          linkedRoomId: "room-cr",
          unitCost: 1200,
        },
        {
          id: "rack-b",
          label: "Main Rack",
          rackType: "floor-19",
          heightU: 42,
          depthMm: 800,
          widthClass: "19in",
          position: { x: 600, y: 0 },
          linkedRoomId: "room-cr",
          unitCost: 1200,
        },
        {
          id: "rack-c",
          label: "Stage Rack",
          rackType: "wall-mount",
          heightU: 12,
          depthMm: 600,
          widthClass: "19in",
          position: { x: 1200, y: 0 },
          linkedRoomId: "room-stage",
        },
      ],
      placements: [],
      accessories: [],
    },
  ];

  return {
    name: "kitchen-sink",
    nodes: [...nodes, ...stubNet.nodes, ...stubPwr.nodes],
    edges,
    pages,
    bundles: { "bundle-1": { id: "bundle-1", label: "Camera Loom" } },
  };
}

export async function allReportFixtures(): Promise<ReportFixture[]> {
  return [kitchenSinkFixture(), defaultSchematicReportFixture(), ...loadFileFixtures()];
}
