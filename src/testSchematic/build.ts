/**
 * Builder for the seeded test schematic (#307).
 *
 * A manual test pass used to start with several minutes of placing devices and
 * setting port types before anything could be verified. This builds one scene
 * that already covers everything those passes needed, so a test-report item can
 * name a starting state instead of describing how to construct one.
 *
 * What the fixture deliberately covers — keep this list and
 * `src/__tests__/testSchematic.test.ts` in step when editing:
 *
 *   - fiber ports in all four terminations (LC, SC, ST, opticalCON), some wired
 *     into mixed runs for hybrid-cable labels, the rest left free to draw new
 *     combinations by hand
 *   - a USB-A device and an Ethernet device, unwired, for adapter auto-insert
 *     in both drag directions
 *   - mirrored adapter families left unwired: XLR-3 ↔ 1/4" TRS and Edison ↔ IEC
 *   - a patch panel with passthrough circuits across a wide spread of
 *     connector and gender combinations, two of them patched end to end
 *   - a compatible same-signal HDMI pair (Designer Laptop out, Preview Monitor in)
 *     sitting within one 100%-zoom viewport of each other, unwired, so
 *     connection-drag / ghost scenarios don't need substitute devices (#378)
 *   - an unwired patch panel (PP-02), the only one `setPanelOffCanvas` will
 *     virtualize — PP-01 carries wired legs and is refused (#378)
 *   - three named rooms plus two deliberately roomless devices (blank sentinel)
 *   - a room named in mixed case ("main Hall"), one acronym room and one
 *     all-caps room, so all four label-case modes are distinguishable
 *   - devices with header auxiliary rows and a mix of very short and very long
 *     names, for label wrap and contrast. The dead-space bug in #249 is
 *     invisible without a header aux row, because HEADER_BAND_MIN_PX clamps it
 *   - owned gear in all three stock states (surplus, exact, short), without
 *     which the Devices report's inventory columns don't render at all
 *   - one device genuinely placed from a bundled template (templateId, ports
 *     cloned with templatePortId, one port hidden so it opens dirty) — every
 *     other device here is synthetic, so without this one the device
 *     editor's template-family actions have nothing to render for (#332)
 *
 * Positions are computed from the real DeviceNode height contract
 * (`deviceContentHeight`), so devices never overlap and rooms always fit their
 * contents even after ports are added or removed here.
 *
 * Regenerate the committed JSON with `npm run fixture:build`.
 */

import { CURRENT_SCHEMA_VERSION } from "../migrations";
import { GRID_SIZE } from "../gridConstants";
import { deviceContentHeight } from "../routingHarness/deviceHandleLayout";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import type {
  ConnectionData,
  ConnectionEdge,
  ConnectorType,
  DeviceData,
  DeviceTemplate,
  OwnedGearItem,
  Port,
  PortDirection,
  SchematicFile,
  SchematicNode,
  SignalType,
} from "../types";
import { signalCssColor } from "../typeRegistry";

// ─── Layout constants ────────────────────────────────────────────────

/** Device node width the app settles on for these port counts. */
const DEVICE_W = 176;
/**
 * Horizontal gap between device columns inside a room. Wide enough that an
 * auto-inserted adapter (~144-176px, placed near the midpoint between the two
 * devices it bridges) lands in open space instead of overlapping either
 * neighbor — the #368 complaint about the adapter benches having "no space to
 * awkwardly fit in". Adapter-bench pairs are laid out in adjacent columns
 * specifically so this gap is the room the auto-insert has to work with.
 */
const COL_GAP = 320;
/** Vertical gap between devices in the same column — also wide enough that a
 *  stub tag (or an adapter, for the rare vertically-stacked pair) has open
 *  space to render in without crowding the device above or below it. */
const ROW_GAP = 160;
const ROOM_PAD_X = 32;
/** Room header band sits above the first device row. */
const ROOM_PAD_TOP = 96;
const ROOM_PAD_BOTTOM = 48;
/** Horizontal gap between rooms. */
const ROOM_GAP = 192;

const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

// ─── Node/port builders ──────────────────────────────────────────────

function port(
  id: string,
  label: string,
  signalType: SignalType,
  direction: PortDirection,
  connectorType: ConnectorType,
  extra: Partial<Port> = {},
): Port {
  return { id, label, signalType, direction, connectorType, ...extra };
}

/** A passthrough (patch-panel) port. Rear is the field-termination side, front the patch side. */
function through(
  id: string,
  label: string,
  rear: ConnectorType,
  front: ConnectorType,
  extra: Partial<Port> = {},
): Port {
  return {
    id,
    label,
    signalType: "custom",
    inheritsSignal: true,
    direction: "passthrough",
    connectorType: front,
    rearConnectorType: rear,
    frontConnectorType: front,
    ...extra,
  };
}

/** Clone a bundled template's ports for a placed instance, the same shape the store's
 *  addDevice produces (new port ids, `templatePortId` pointing back at the template port)
 *  but with deterministic ids so the fixture regenerates byte-identical every run instead
 *  of drifting on addDevice's Date.now()-based ones. (#332) */
function cloneTemplatePorts(template: DeviceTemplate, idPrefix: string): Port[] {
  return template.ports.map((p, i) => ({ ...p, id: `${idPrefix}-${i}`, templatePortId: p.id }));
}

/** Handle id for the source end of a connection — mirrors DeviceNode's Handle ids. */
function from(nodeId: string, p: Port): { source: string; sourceHandle: string } {
  const suffix = p.direction === "bidirectional" ? "-out" : p.direction === "passthrough" ? "-front" : "";
  return { source: nodeId, sourceHandle: `${p.id}${suffix}` };
}

/** Handle id for the target end of a connection. */
function to(nodeId: string, p: Port): { target: string; targetHandle: string } {
  const suffix = p.direction === "bidirectional" ? "-in" : p.direction === "passthrough" ? "-rear" : "";
  return { target: nodeId, targetHandle: `${p.id}${suffix}` };
}

interface DeviceSpec {
  id: string;
  label: string;
  ports: Port[];
  /** `deviceType` is required — reports group by it, and an unrecognised value
   *  falls out of every category bucket in deviceTypeCategories.ts. */
  data: Partial<DeviceData> & { deviceType: string };
}

/** One device node, positioned by the room packer below. */
function device(spec: DeviceSpec, parentId: string | undefined, x: number, y: number): SchematicNode {
  const data: DeviceData = {
    label: spec.label,
    ports: spec.ports,
    ...spec.data,
  };
  return {
    id: spec.id,
    type: "device",
    position: { x: snap(x), y: snap(y) },
    ...(parentId ? { parentId } : {}),
    measured: { width: DEVICE_W, height: deviceContentHeight({ data, measured: { width: DEVICE_W } }) },
    data,
  } as unknown as SchematicNode;
}

interface RoomSpec {
  id: string;
  label: string;
  /** Devices laid out column by column, top to bottom within each column. */
  columns: DeviceSpec[][];
}

/**
 * Lay a room out around its devices: each column is stacked top-to-bottom using
 * the device's real rendered height, and the room is sized to contain them.
 */
function layoutRoom(spec: RoomSpec, originX: number, originY: number): { nodes: SchematicNode[]; width: number } {
  const nodes: SchematicNode[] = [];
  let tallest = 0;

  spec.columns.forEach((column, colIndex) => {
    let y = ROOM_PAD_TOP;
    const x = ROOM_PAD_X + colIndex * (DEVICE_W + COL_GAP);
    for (const dev of column) {
      const node = device(dev, spec.id, x, y);
      nodes.push(node);
      y = snap(y + (node.measured?.height ?? 0) + ROW_GAP);
    }
    tallest = Math.max(tallest, y - ROW_GAP);
  });

  const width = snap(ROOM_PAD_X * 2 + spec.columns.length * DEVICE_W + (spec.columns.length - 1) * COL_GAP);
  const height = snap(tallest + ROOM_PAD_BOTTOM);

  const room: SchematicNode = {
    id: spec.id,
    type: "room",
    position: { x: snap(originX), y: snap(originY) },
    data: { label: spec.label, locked: true },
    style: { width, height },
    zIndex: -1,
    measured: { width, height },
  } as unknown as SchematicNode;

  return { nodes: [room, ...nodes], width };
}

function edge(id: string, ends: { source: string; sourceHandle: string } & { target: string; targetHandle: string }, signalType: SignalType, extra: Partial<ConnectionData> = {}): ConnectionEdge {
  const data: ConnectionData = { signalType, ...extra };
  return {
    id,
    ...ends,
    data,
    style: { stroke: signalCssColor(signalType), strokeWidth: 2 },
  } as unknown as ConnectionEdge;
}

// ─── Ports ───────────────────────────────────────────────────────────
//
// Named up front so the connection list below can reference the same objects
// the devices carry — a typo in a handle id becomes a type error, not a
// silently orphaned edge that removeOrphanedEdges drops on load.

// Fiber bench — all four terminations.
//
// Each termination carries a spare input AND a spare output that the connection
// list below never touches, so any of the twelve mixed pairings can be drawn by
// hand without first deleting a pre-wired run. Before that, both the SC and ST
// outputs were consumed by the wired runs, and a test pass had to delete one to
// draw a run *from* SC or ST.
const lcOut1 = port("lc-out-1", "LC Out 1", "fiber", "output", "lc");
const lcOut2 = port("lc-out-2", "LC Out 2", "fiber", "output", "lc");
const lcIn1 = port("lc-in-1", "LC In 1", "fiber", "input", "lc");
const lcIn2 = port("lc-in-2", "LC In 2", "fiber", "input", "lc");
const scIn1 = port("sc-in-1", "SC In 1", "fiber", "input", "sc");
const scIn2 = port("sc-in-2", "SC In 2", "fiber", "input", "sc");
const scOut1 = port("sc-out-1", "SC Out 1", "fiber", "output", "sc");
const scOut2 = port("sc-out-2", "SC Out 2", "fiber", "output", "sc");
const stIn1 = port("st-in-1", "ST In 1", "fiber", "input", "st");
const stOut1 = port("st-out-1", "ST Out 1", "fiber", "output", "st");
const stOut2 = port("st-out-2", "ST Out 2", "fiber", "output", "st");
const opticalIn1 = port("optical-in-1", "opticalCON In 1", "fiber", "input", "opticalcon");
const opticalIn2 = port("optical-in-2", "opticalCON In 2", "fiber", "input", "opticalcon");
const opticalOut1 = port("optical-out-1", "opticalCON Out 1", "fiber", "output", "opticalcon");

// Label-rendering devices
const projHdmiIn = port("proj-hdmi-in", "HDMI In", "hdmi", "input", "hdmi");
const projSdiIn = port("proj-sdi-in", "SDI In", "sdi", "input", "bnc");
const projPower = port("proj-power", "AC In", "power", "input", "edison");
const ampXlrIn1 = port("amp-xlr-in-1", "XLR In 1", "analog-audio", "input", "xlr-3");
const ampXlrIn2 = port("amp-xlr-in-2", "XLR In 2", "analog-audio", "input", "xlr-3");
const ampSpkOut1 = port("amp-spk-out-1", "Spk Out 1", "speaker-level", "output", "speakon");
const ampSpkOut2 = port("amp-spk-out-2", "Spk Out 2", "speaker-level", "output", "speakon");
const ampPower = port("amp-power", "AC In", "power", "input", "iec");
const monHdmiIn = port("mon-hdmi-in", "HDMI In", "hdmi", "input", "hdmi");
const monPower = port("mon-power", "AC In", "power", "input", "edison");

// Patch panel — deliberately wide connector and gender spread
const ppRj45 = through("pp-1", "1 — Cat6", "rj45", "rj45", { rearGender: "female", frontGender: "female" });
const ppEtherCon = through("pp-2", "2 — etherCON", "ethercon", "rj45", { rearGender: "female", frontGender: "female" });
const ppBnc = through("pp-3", "3 — BNC", "bnc", "bnc", { rearGender: "female", frontGender: "female" });
const ppXlr = through("pp-4", "4 — XLR-3", "xlr-3", "xlr-3", { rearGender: "female", frontGender: "male" });
const ppFiber = through("pp-5", "5 — LC Fiber", "lc", "lc");
const ppTrsA = through("pp-6", "6 — TRS A", "trs-quarter", "trs-quarter", { normalledTo: "pp-7", normalling: "half" });
const ppTrsB = through("pp-7", "7 — TRS B", "trs-quarter", "trs-quarter");
const ppTerminal = through("pp-8", "8 — Phoenix", "terminal-block", "phoenix", { rearGender: "female", frontGender: "male" });

// Ethernet / USB bench
const swPort1 = port("sw-port-1", "Port 1", "ethernet", "bidirectional", "rj45", {
  networkConfig: { ip: "10.20.0.1", subnetMask: "255.255.255.0", gateway: "10.20.0.1", vlan: 20 },
});
const swPort2 = port("sw-port-2", "Port 2", "ethernet", "bidirectional", "rj45");
const swPort3 = port("sw-port-3", "Port 3", "ethernet", "bidirectional", "rj45");
const swPort4 = port("sw-port-4", "Port 4", "ethernet", "bidirectional", "rj45");
const swUplink = port("sw-uplink", "Uplink (SFP)", "fiber", "bidirectional", "lc");
const swPower = port("sw-power", "AC In", "power", "input", "iec");
const hubUsbOut1 = port("hub-usb-out-1", "USB-A Out 1", "usb", "output", "usb-a");
const hubUsbOut2 = port("hub-usb-out-2", "USB-A Out 2", "usb", "output", "usb-a");
const hubUsbIn = port("hub-usb-in", "USB-A In", "usb", "input", "usb-a");

// Power bench — the Edison ↔ IEC mirrored pair
const upsIecIn = port("ups-iec-in", "IEC AC In", "power", "input", "iec");
const upsEdisonOut1 = port("ups-edison-out-1", "Edison Out 1", "power", "output", "edison");
const upsEdisonOut2 = port("ups-edison-out-2", "Edison Out 2", "power", "output", "edison");
const upsEdisonOut3 = port("ups-edison-out-3", "Edison Out 3", "power", "output", "edison");
const upsIecOut1 = port("ups-iec-out-1", "IEC Out 1", "power", "output", "iec");
const spkIecIn = port("spk-iec-in", "IEC AC In", "power", "input", "iec");
const spkXlrIn = port("spk-xlr-in", "XLR In", "analog-audio", "input", "xlr-3");
const barEdisonIn = port("bar-edison-in", "Edison In", "power", "input", "edison");
const barEdisonOut1 = port("bar-edison-out-1", "Edison Out 1", "power", "output", "edison");
const barEdisonOut2 = port("bar-edison-out-2", "Edison Out 2", "power", "output", "edison");

// EU / UK power bench (#390) — Schuko native-mates Europlug (direct connect, no
// adapter, no dialog), while UK BS 1363 needs an adapter for everything. The
// library carries no EU/UK power adapter template yet, so UK ↔ Schuko exercises
// the zero-match incompatible-connection dialog rather than an auto-insert.
const euStripSchukoIn = port("eustrip-schuko-in", "Schuko In", "power", "input", "schuko");
const euStripSchukoOut1 = port("eustrip-schuko-out-1", "Schuko Out 1", "power", "output", "schuko");
const euStripSchukoOut2 = port("eustrip-schuko-out-2", "Schuko Out 2", "power", "output", "schuko");
const euPsuEuroplugIn = port("eupsu-europlug-in", "Europlug AC In", "power", "input", "europlug");
const ukPlayerUkIn = port("ukplayer-uk-in", "UK AC In", "power", "input", "uk-power");
const ukPlayerHdmiOut = port("ukplayer-hdmi-out", "HDMI Out", "hdmi", "output", "hdmi");

// Audio bench — the XLR-3 ↔ 1/4" TRS mirrored pair
const fohXlrOutL = port("foh-xlr-out-l", "XLR Out L", "analog-audio", "output", "xlr-3");
const fohXlrOutR = port("foh-xlr-out-r", "XLR Out R", "analog-audio", "output", "xlr-3");
const fohTrsIn1 = port("foh-trs-in-1", "TRS In 1", "analog-audio", "input", "trs-quarter");
const fohTrsIn2 = port("foh-trs-in-2", "TRS In 2", "analog-audio", "input", "trs-quarter");
const fohPower = port("foh-power", "AC In", "power", "input", "iec");
const deckTrsOutL = port("deck-trs-out-l", "TRS Out L", "analog-audio", "output", "trs-quarter");
const deckTrsOutR = port("deck-trs-out-r", "TRS Out R", "analog-audio", "output", "trs-quarter");
const deckXlrIn1 = port("deck-xlr-in-1", "XLR In 1", "analog-audio", "input", "xlr-3");
const deckPower = port("deck-power", "AC In", "power", "input", "iec");
const comboIn1 = port("combo-in-1", "Combo In 1", "analog-audio", "input", "combo-xlr-trs");
const comboIn2 = port("combo-in-2", "Combo In 2", "analog-audio", "input", "combo-xlr-trs");
const comboXlrOut = port("combo-xlr-out", "XLR Out", "analog-audio", "output", "xlr-3");
const comboTsOut = port("combo-ts-out", "TS Out", "analog-audio", "output", "ts-quarter");
const laptopUsbOut = port("laptop-usb-out", "USB-A", "usb", "output", "usb-a");
const laptopLan = port("laptop-lan", "LAN", "ethernet", "bidirectional", "rj45", {
  networkConfig: { dhcp: true },
});
const laptopHdmiOut = port("laptop-hdmi-out", "HDMI Out", "hdmi", "output", "hdmi");

// HDMI sink for the close-range drag pair (#378). The only other HDMI source in
// the fixture, Designer Laptop's out port, now has a same-signal input within one
// viewport of it; before this the nearest was the projector, 1900+ flow units away.
const pvMonHdmiIn = port("pvmon-hdmi-in", "HDMI In", "hdmi", "input", "hdmi");

// Second patch panel, deliberately left with no connections (#378). A wired panel
// can't be virtualized (setPanelOffCanvas refuses), and PP-01 carries four legs.
const pp2Rj45 = through("pp2-1", "1 — Cat6", "rj45", "rj45", { rearGender: "female", frontGender: "female" });
const pp2Bnc = through("pp2-2", "2 — BNC", "bnc", "bnc", { rearGender: "female", frontGender: "female" });
const pp2Xlr = through("pp2-3", "3 — XLR-3", "xlr-3", "xlr-3", { rearGender: "female", frontGender: "male" });
const pp2Fiber = through("pp2-4", "4 — LC Fiber", "lc", "lc");

// Roomless devices — the blank room sentinel
const csL1 = port("cs-l1", "Feed L1", "power-l1", "output", "cam-lok");
const csL2 = port("cs-l2", "Feed L2", "power-l2", "output", "cam-lok");
const csL3 = port("cs-l3", "Feed L3", "power-l3", "output", "cam-lok");
const csNeutral = port("cs-n", "Feed N", "power-neutral", "output", "cam-lok");
const csGround = port("cs-g", "Feed G", "power-ground", "output", "cam-lok");
const probeLan = port("probe-lan", "LAN", "ethernet", "bidirectional", "rj45", {
  networkConfig: { ip: "10.20.0.50", subnetMask: "255.255.255.0", gateway: "10.20.0.1" },
});
const probePower = port("probe-power", "AC In", "power", "input", "edison");

// A genuine template instance (#332) — every other device above is synthetic (no
// templateId), so the editor's template-family actions (Update as Custom, Save as
// Preset, Revert to Template) never appear for them. This one is placed the way
// addDevice places it: ports cloned from the bundled template with templatePortId
// set, templateId pointing back at it. One port is hidden relative to the template
// so it also opens dirty, exercising Revert to Template.
const BMD_AUDIO_EMBEDDER = DEVICE_TEMPLATES.find((t) => t.id === "c0a80101-0031-4000-8000-000000000049")!;
const bmdPorts = cloneTemplatePorts(BMD_AUDIO_EMBEDDER, "device-21");
const bmdHiddenPortId = bmdPorts.find((p) => p.label === "S/PDIF Out")!.id;

// ─── Rooms ───────────────────────────────────────────────────────────

/** Mixed case on purpose: "main Hall" is the only spelling that tells As-typed
 *  and Capitalize apart. A caps-or-lowercase-only fixture silently passes. */
const ROOM_MIXED = "main Hall";
/** Acronym-aware Capitalize should leave "BOH" alone. */
const ROOM_ACRONYM = "BOH Rack Room";
/** Genuinely all-caps — As-typed must not lowercase it. */
const ROOM_CAPS = "TECH TABLE";

const mainHall: RoomSpec = {
  id: "room-1",
  label: ROOM_MIXED,
  columns: [
    [
      {
        id: "device-1",
        label: "Fiber TX — LC",
        ports: [lcOut1, lcOut2, lcIn1, lcIn2],
        data: {
          deviceType: "converter",
          model: "Fiber TX — LC",
          manufacturer: "Fibrelink",
          modelNumber: "FX-LC4",
          powerDrawW: 18,
          unitCost: 450,
          serialNumber: "TS-LC-001",
          auxiliaryData: [
            { text: "{{deviceType}}", position: "header" },
            { text: "{{modelNumber}}", position: "header" },
          ],
        },
      },
      {
        id: "device-2",
        label: "ST Fiber Bulkhead",
        ports: [stIn1, stOut1, stOut2],
        data: {
          deviceType: "patch-panel",
          model: "ST Fiber Bulkhead",
          manufacturer: "Fibrelink",
          modelNumber: "BK-ST2",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        id: "device-3",
        label: "Fiber RX — SC",
        ports: [scIn1, scIn2, scOut1, scOut2],
        data: {
          deviceType: "converter",
          model: "Fiber RX — SC",
          manufacturer: "Fibrelink",
          modelNumber: "FX-SC4",
          powerDrawW: 18,
          unitCost: 450,
          auxiliaryData: [
            { text: "{{deviceType}}", position: "header" },
            { text: "{{modelNumber}}", position: "header" },
          ],
        },
      },
      {
        id: "device-4",
        label: "opticalCON Stage Box",
        ports: [opticalIn1, opticalIn2, opticalOut1],
        data: {
          deviceType: "fiber-transmitter",
          model: "opticalCON Stage Box",
          manufacturer: "Fibrelink",
          modelNumber: "SB-OPT",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        // Deliberately long: wraps in the header when wrapping is on, and is the
        // contrast/truncation case when it isn't.
        id: "device-5",
        label: "Christie Griffyn 4K35-RGB Laser Projector (House Left)",
        ports: [projHdmiIn, projSdiIn, projPower],
        data: {
          deviceType: "projector",
          model: "Christie Griffyn 4K35-RGB Laser Projector (House Left)",
          shortName: "Griffyn 4K35",
          wrapLabel: true,
          manufacturer: "Christie",
          modelNumber: "Griffyn 4K35-RGB",
          powerDrawW: 1600,
          unitCost: 68000,
          auxiliaryData: [
            { text: "{{manufacturer}}", position: "header" },
            { text: "{{modelNumber}}", position: "header" },
            { text: "{{powerDrawW}}", position: "footer" },
          ],
        },
      },
      {
        // Deliberately short: a one-word label with a header aux row is the case
        // where HEADER_BAND_MIN_PX used to leave dead space (#249).
        id: "device-6",
        label: "Amp",
        ports: [ampXlrIn1, ampXlrIn2, ampSpkOut1, ampSpkOut2, ampPower],
        data: {
          deviceType: "amplifier",
          model: "Amp",
          manufacturer: "Powersoft",
          modelNumber: "T604A",
          powerDrawW: 900,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        id: "device-7",
        label: 'Confidence Monitor 32"',
        ports: [monHdmiIn, monPower],
        data: {
          deviceType: "monitor",
          model: 'Confidence Monitor 32"',
          manufacturer: "TestCo",
          modelNumber: "CM-32",
          powerDrawW: 65,
          unitCost: 520,
          auxiliaryData: [
            { text: "{{deviceType}}", position: "header" },
            { text: "{{powerDrawW}}", position: "footer" },
          ],
        },
      },
    ],
  ],
};

// Three columns, not one per device: the room only has two real adapter-bench
// adjacencies to satisfy (Speaker 1 ↔ Rack UPS, Rack UPS ↔ Utility Bar) plus
// the unrelated USB Hub ↔ Core Switch bench, and Rack UPS sitting between its
// two partners covers both power benches in a single middle column (#368).
// Column order also follows the room's actual wiring instead of fighting it:
// Rack UPS (edge-11/edge-12) only ever talks to main Hall devices, which sit
// in the room to the *left*, so it anchors column 0 rather than column 2;
// PP-01 (edge-6/edge-9/edge-10) only ever talks to TECH TABLE devices, which
// sit in the room to the *right*, so it's parked in column 2, nearest that
// room, instead of column 0 where a purely bench-driven layout would put it.
const rackRoom: RoomSpec = {
  id: "room-2",
  label: ROOM_ACRONYM,
  columns: [
    [
      {
        // Edison Out → this IEC In is the Edison (M) → IEC (F) auto-insert,
        // with Rack UPS in the next column over (#368: side by side, not
        // stacked, so the adapter has the COL_GAP to land in).
        id: "device-12",
        label: "Powered Speaker (IEC) 1",
        ports: [spkIecIn, spkXlrIn],
        data: {
          deviceType: "speaker",
          model: "Powered Speaker (IEC)",
          baseLabel: "Powered Speaker (IEC)",
          manufacturer: "TestCo",
          modelNumber: "PS-12",
          powerDrawW: 300,
          unitCost: 1100,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        id: "device-9",
        label: "Core Switch 48-Port",
        ports: [swPort1, swPort2, swPort3, swPort4, swUplink, swPower],
        data: {
          deviceType: "network-switch",
          model: "Core Switch 48-Port",
          manufacturer: "TestCo",
          modelNumber: "SW-48P",
          hostname: "core-sw",
          powerDrawW: 120,
          poeBudgetW: 370,
          unitCost: 2400,
          serialNumber: "TS-SW-001",
          dhcpServer: {
            enabled: true,
            rangeStart: "10.20.0.100",
            rangeEnd: "10.20.0.200",
            subnetMask: "255.255.255.0",
            gateway: "10.20.0.1",
          },
          auxiliaryData: [
            { text: "{{deviceType}}", position: "header" },
            { text: "{{hostname}}", position: "header" },
          ],
        },
      },
      {
        // Not part of either adapter bench — just the second placed unit for
        // the owned-gear "short" state. Parked below Core Switch, off the
        // bench rows, so it can't land between two adapter partners and crowd
        // an auto-insert.
        id: "device-13",
        label: "Powered Speaker (IEC) 2",
        ports: [
          port("spk2-iec-in", "IEC AC In", "power", "input", "iec"),
          port("spk2-xlr-in", "XLR In", "analog-audio", "input", "xlr-3"),
        ],
        data: {
          deviceType: "speaker",
          model: "Powered Speaker (IEC)",
          baseLabel: "Powered Speaker (IEC)",
          manufacturer: "TestCo",
          modelNumber: "PS-12",
          powerDrawW: 300,
          unitCost: 1100,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        // Sits between its two adapter partners (Powered Speaker (IEC) 1 to
        // the left, Utility Bar to the right) so BOTH auto-insert benches get
        // a clear adjacent-column gap instead of one of them having to reach
        // past a third device (#368).
        id: "device-11",
        label: "Rack UPS",
        ports: [upsIecIn, upsEdisonOut1, upsEdisonOut2, upsEdisonOut3, upsIecOut1],
        data: {
          deviceType: "power-distribution",
          model: "Rack UPS",
          manufacturer: "TestCo",
          modelNumber: "UPS-1500",
          powerCapacityW: 1500,
          voltage: "120V",
          unitCost: 890,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        // Unwired on purpose — this plus Core Switch (one column to the left)
        // is the USB ↔ Ethernet adapter auto-insert bench, in both drag
        // directions. Side by side rather than stacked, so the auto-inserted
        // adapter lands in the COL_GAP between them instead of squeezing into
        // the ROW_GAP a single stacked column would leave (#368).
        id: "device-10",
        label: "USB Hub (USB-A)",
        ports: [hubUsbOut1, hubUsbOut2, hubUsbIn],
        data: {
          deviceType: "usb",
          model: "USB Hub (USB-A)",
          manufacturer: "TestCo",
          modelNumber: "HUB-4A",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        // IEC Out → this Edison In is the IEC (M) → Edison (F) auto-insert,
        // the mirror of the Edison↔IEC pair one column over.
        id: "device-14",
        label: "Utility Bar (Edison)",
        ports: [barEdisonIn, barEdisonOut1, barEdisonOut2],
        data: {
          deviceType: "power-distribution",
          model: "Utility Bar (Edison)",
          manufacturer: "TestCo",
          modelNumber: "UB-6",
          powerCapacityW: 1800,
          voltage: "120V",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        // Every wired connection PP-01 carries (edge-6, edge-9, edge-10) runs
        // to TECH TABLE, the room immediately to the right — parked in this
        // room's rightmost column, nearest that room, instead of the bench
        // layout's leftmost slot, so those runs don't cross the whole room.
        id: "device-8",
        label: "PP-01",
        ports: [ppRj45, ppEtherCon, ppBnc, ppXlr, ppFiber, ppTrsA, ppTrsB, ppTerminal],
        data: {
          deviceType: "patch-panel",
          model: "PP-01",
          manufacturer: "TestCo",
          modelNumber: "PP-8U",
          unitCost: 240,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        // Schuko side of the EU/UK power bench (#390). Unwired, adjacent to its
        // two sinks one column over, so a future adapter auto-insert has the
        // COL_GAP to land in — same shape as the Edison ↔ IEC bench.
        id: "device-22",
        label: "Euro Power Strip (Schuko)",
        ports: [euStripSchukoIn, euStripSchukoOut1, euStripSchukoOut2],
        data: {
          deviceType: "power-distribution",
          model: "Euro Power Strip (Schuko)",
          manufacturer: "TestCo",
          modelNumber: "EPS-3",
          voltage: "230V",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        // Europlug native-mates into a Schuko socket — Schuko Out → this port
        // must connect directly, with no adapter and no dialog.
        id: "device-23",
        label: "EU PSU (Europlug)",
        ports: [euPsuEuroplugIn],
        data: {
          deviceType: "power-supply",
          model: "EU PSU (Europlug)",
          manufacturer: "TestCo",
          modelNumber: "PSU-EU-65",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        // Shuttered BS 1363 sockets have no native mate — Schuko Out → this
        // port must flag adapter-needed (today: the zero-match dialog, since
        // no EU/UK adapter template exists in the library yet).
        id: "device-24",
        label: "UK Media Player (BS 1363)",
        ports: [ukPlayerUkIn, ukPlayerHdmiOut],
        data: {
          deviceType: "media-player",
          model: "UK Media Player (BS 1363)",
          manufacturer: "TestCo",
          modelNumber: "MP-UK-4K",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
  ],
};

const techTable: RoomSpec = {
  id: "room-3",
  label: ROOM_CAPS,
  columns: [
    [
      {
        // Row 0 here sits directly beside Playback Deck's row 0 in the next
        // column — the mirrored XLR-3 ↔ 1/4" TRS adapter bench (#368) — so the
        // auto-inserted adapter lands in the COL_GAP between them.
        id: "device-15",
        label: "FOH Console",
        ports: [fohXlrOutL, fohXlrOutR, fohTrsIn1, fohTrsIn2, fohPower],
        data: {
          deviceType: "audio-mixer",
          model: "FOH Console",
          manufacturer: "TestCo",
          modelNumber: "MX-32",
          powerDrawW: 180,
          unitCost: 6400,
          serialNumber: "TS-MX-001",
          auxiliaryData: [
            { text: "{{deviceType}}", position: "header" },
            { text: "{{modelNumber}}", position: "header" },
          ],
        },
      },
      {
        id: "device-16",
        label: "Combo Jack Box",
        ports: [comboIn1, comboIn2, comboXlrOut, comboTsOut],
        data: {
          deviceType: "stage-box",
          model: "Combo Jack Box",
          manufacturer: "TestCo",
          modelNumber: "CJB-4",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        // Unwired on purpose (#378): the panel to virtualize / drag legs onto.
        // Kept apart from PP-01, whose wired legs make setPanelOffCanvas refuse.
        id: "device-26",
        label: "PP-02",
        ports: [pp2Rj45, pp2Bnc, pp2Xlr, pp2Fiber],
        data: {
          deviceType: "patch-panel",
          model: "PP-02",
          manufacturer: "TestCo",
          modelNumber: "PP-4U",
          unitCost: 120,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
    [
      {
        // Unwired against the console on purpose — TRS Out → XLR In and
        // XLR Out → TRS In are the mirrored audio adapter pair.
        id: "device-17",
        label: "Playback Deck",
        ports: [deckTrsOutL, deckTrsOutR, deckXlrIn1, deckPower],
        data: {
          deviceType: "media-player",
          model: "Playback Deck",
          manufacturer: "TestCo",
          modelNumber: "PB-2",
          powerDrawW: 90,
          isSpare: true,
          serialNumber: "TS-PB-002",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        id: "device-18",
        label: "Designer Laptop",
        ports: [laptopUsbOut, laptopLan, laptopHdmiOut],
        data: {
          deviceType: "computer",
          model: "Designer Laptop",
          manufacturer: "TestCo",
          modelNumber: "LT-16",
          powerDrawW: 90,
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        // Same-signal partner for Designer Laptop's HDMI Out, one ROW_GAP below
        // it in the same column — well inside one 100%-zoom viewport, unwired, so
        // a connection drag between the two needs no substitute devices (#378).
        id: "device-25",
        label: "Preview Monitor (HDMI)",
        ports: [pvMonHdmiIn],
        data: {
          deviceType: "monitor",
          model: "Preview Monitor (HDMI)",
          manufacturer: "TestCo",
          modelNumber: "PM-HD",
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
      {
        // Placed from the bundled BMD template (#332) — see BMD_AUDIO_EMBEDDER above.
        // Renders 7 of its 8 ports on purpose: "S/PDIF Out" is in hiddenPorts below,
        // which is what makes this device dirty against its template. Counted as a
        // dropped port twice already (#344, and once while chasing DXF omissions), so
        // if you are here because a port is missing from the canvas or an export —
        // that is this, not a layout bug.
        id: "device-21",
        label: BMD_AUDIO_EMBEDDER.label,
        ports: bmdPorts,
        data: {
          deviceType: BMD_AUDIO_EMBEDDER.deviceType,
          model: BMD_AUDIO_EMBEDDER.label,
          baseLabel: BMD_AUDIO_EMBEDDER.label,
          templateId: BMD_AUDIO_EMBEDDER.id,
          manufacturer: BMD_AUDIO_EMBEDDER.manufacturer,
          modelNumber: BMD_AUDIO_EMBEDDER.modelNumber,
          referenceUrl: BMD_AUDIO_EMBEDDER.referenceUrl,
          // deviceLibrary mutates `category` onto every template at import time, so a
          // real placement carries it; without it "Update as Custom" on this fixture
          // device would mint an uncategorised template the real flow never produces.
          category: BMD_AUDIO_EMBEDDER.category,
          powerDrawW: BMD_AUDIO_EMBEDDER.powerDrawW,
          searchTerms: [...(BMD_AUDIO_EMBEDDER.searchTerms ?? [])],
          heightMm: BMD_AUDIO_EMBEDDER.heightMm,
          widthMm: BMD_AUDIO_EMBEDDER.widthMm,
          depthMm: BMD_AUDIO_EMBEDDER.depthMm,
          weightKg: BMD_AUDIO_EMBEDDER.weightKg,
          hiddenPorts: [bmdHiddenPortId],
          auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
        },
      },
    ],
  ],
};

/** Devices with no parent room — the blank-room sentinel in every report. */
const ROOMLESS: DeviceSpec[] = [
  {
    id: "device-19",
    label: "Company Switch 400A 3-Phase",
    ports: [csL1, csL2, csL3, csNeutral, csGround],
    data: {
      deviceType: "company-switch",
      model: "Company Switch 400A 3-Phase",
      manufacturer: "TestCo",
      modelNumber: "CS-400",
      powerCapacityW: 144000,
      voltage: "208V 3-Phase",
      auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
    },
  },
  {
    id: "device-20",
    label: "Roomless Wall Plate",
    ports: [probeLan, probePower],
    data: {
      deviceType: "wall-plate",
      model: "Roomless Wall Plate",
      manufacturer: "TestCo",
      modelNumber: "RP-1",
      powerDrawW: 12,
      auxiliaryData: [{ text: "{{deviceType}}", position: "header" }],
    },
  },
];

// ─── Owned gear ──────────────────────────────────────────────────────
//
// Matched against placed devices by `manufacturer|modelNumber|model`
// (inventoryKey.ts). Quantities are chosen to produce all three stock states,
// so the Devices report's inventory columns have something to show in each.

const OWNED_GEAR: OwnedGearItem[] = [
  // Surplus: 4 owned, 1 placed.
  {
    quantity: 4,
    template: {
      deviceType: "converter",
      label: "Fiber RX — SC",
      manufacturer: "Fibrelink",
      modelNumber: "FX-SC4",
      unitCost: 450,
      ports: [scIn1, scIn2, scOut1, scOut2],
    },
  },
  // Exact: 1 owned, 1 placed.
  {
    quantity: 1,
    template: {
      deviceType: "network-switch",
      label: "Core Switch 48-Port",
      manufacturer: "TestCo",
      modelNumber: "SW-48P",
      unitCost: 2400,
      ports: [swPort1, swPort2, swPort3, swPort4, swUplink, swPower],
    },
  },
  // Short: 1 owned, 2 placed.
  {
    quantity: 1,
    template: {
      deviceType: "speaker",
      label: "Powered Speaker (IEC)",
      manufacturer: "TestCo",
      modelNumber: "PS-12",
      unitCost: 1100,
      ports: [spkIecIn, spkXlrIn],
    },
  },
];

// ─── Assembly ────────────────────────────────────────────────────────

export function buildTestSchematic(): SchematicFile {
  const nodes: SchematicNode[] = [];

  let x = 0;
  for (const spec of [mainHall, rackRoom, techTable]) {
    const laid = layoutRoom(spec, x, 0);
    nodes.push(...laid.nodes);
    x += laid.width + ROOM_GAP;
  }

  // Roomless devices sit in their own band below the rooms, so it's obvious at a
  // glance that they belong to no room.
  const roomlessY = Math.max(
    ...nodes.filter((n) => n.type === "room").map((n) => n.position.y + (n.measured?.height ?? 0)),
  ) + 160;
  ROOMLESS.forEach((spec, i) => {
    nodes.push(device(spec, undefined, i * (DEVICE_W + COL_GAP), roomlessY));
  });

  const edges: ConnectionEdge[] = [
    // Fiber: a mixed LC↔SC run in each direction, so the pack list must collapse
    // them into one "2x LC to SC Fiber" row rather than two mirrored rows.
    edge("edge-1", { ...from("device-1", lcOut1), ...to("device-3", scIn1) }, "fiber", { cableLength: "150 ft" }),
    edge("edge-2", { ...from("device-3", scOut1), ...to("device-1", lcIn1) }, "fiber", { cableLength: "150 ft" }),
    // ST ↔ opticalCON — the other hybrid pairing.
    edge("edge-3", { ...from("device-2", stOut1), ...to("device-4", opticalIn1) }, "fiber"),

    // Ethernet: one cross-room run to a roomless device (blank room in the
    // cable schedule) and one run patched through PP-01.
    edge("edge-4", { ...from("device-9", swPort1), ...to("device-20", probeLan) }, "ethernet", {
      cableId: "N001",
      cableLength: "75 ft",
      gaugeAwg: "23",
      tested: true,
    }),
    edge("edge-5", { ...from("device-9", swPort2), ...to("device-8", ppRj45) }, "ethernet"),
    edge("edge-6", { ...from("device-8", ppRj45), ...to("device-18", laptopLan) }, "ethernet"),

    // Audio: one console feed to the amp, one into the combo jack (which must
    // report as plain "XLR", not a combined connector label).
    edge("edge-7", { ...from("device-15", fohXlrOutL), ...to("device-6", ampXlrIn1) }, "analog-audio", {
      multicableLabel: "FOH Snake",
    }),
    edge("edge-8", { ...from("device-15", fohXlrOutR), ...to("device-16", comboIn1) }, "analog-audio", {
      multicableLabel: "FOH Snake",
    }),
    // A second patch circuit, this one on the half-normalled TRS pair.
    edge("edge-9", { ...from("device-17", deckTrsOutL), ...to("device-8", ppTrsA) }, "analog-audio"),
    edge("edge-10", { ...from("device-8", ppTrsA), ...to("device-15", fohTrsIn1) }, "analog-audio"),

    // Power: two loads on the UPS, so the distro shows real loading.
    edge("edge-11", { ...from("device-11", upsEdisonOut1), ...to("device-7", monPower) }, "power"),
    edge("edge-12", { ...from("device-11", upsEdisonOut2), ...to("device-5", projPower) }, "power"),
  ];

  return {
    version: CURRENT_SCHEMA_VERSION,
    name: "EasySchematic Test Fixture",
    nodes,
    edges,
    ownedGear: OWNED_GEAR,
    titleBlock: {
      showName: "EasySchematic Test Fixture",
      venue: ROOM_MIXED,
      designer: "Test Pass",
      engineer: "",
      date: "",
      drawingTitle: "Seeded Test Schematic",
      company: "EasySchematic",
      revision: "A",
      logo: "",
      customFields: [],
    },
  };
}
