// LC/SC/ST/opticalCON were made natively compatible, so a mixed fiber run carries NO
// adapter and the single cable spans two different terminations. Deriving the pack-list
// label from one end packs a cable that only lands at one device — "if Joe AV only packs
// an LC fiber cable he won't be able to connect the SC to LC ports."
//
// The rule is deliberately narrow: a combined label is only correct where the two ends
// genuinely need different terminations on ONE cord. Everywhere else a mismatch is
// resolved by an inserted adapter (two separately-labelled cables) or by one connector
// being a superset jack that an ordinary single-type cable already fits. Both halves are
// pinned below so a future "generalisation" can't invent parts that don't exist.

import { describe, it, expect } from "vitest";
import { getCableType, hybridCableLabel } from "../cableTypes";
import {
  needsAdapter,
  HYBRID_CABLE_FAMILY,
  BARE_WIRE_CONNECTORS,
  BARE_WIRE_HYBRID_PARTNERS,
  FIELD_TERMINATED_CONNECTORS,
  TERMINABLE_BARE_WIRE_CONNECTORS,
} from "../connectorTypes";
import type { ConnectorType, Port, SignalType } from "../types";

const FIBER: ConnectorType[] = ["lc", "sc", "st", "opticalcon"];

const port = (connectorType: ConnectorType, signalType: SignalType = "fiber"): Port =>
  ({ id: connectorType, label: connectorType, signalType, direction: "output", connectorType }) as Port;

const cable = (a: ConnectorType, b: ConnectorType, signal: SignalType = "fiber"): string =>
  getCableType(port(a, signal), port(b, signal), signal);

describe("mixed fiber runs name both ends", () => {
  it("labels every mismatched fiber pair with both terminations", () => {
    expect(cable("lc", "sc")).toBe("LC to SC Fiber");
    expect(cable("lc", "st")).toBe("LC to ST Fiber");
    expect(cable("sc", "st")).toBe("SC to ST Fiber");
    expect(cable("lc", "opticalcon")).toBe("LC to opticalCON Fiber");
    expect(cable("sc", "opticalcon")).toBe("SC to opticalCON Fiber");
    expect(cable("st", "opticalcon")).toBe("ST to opticalCON Fiber");
  });

  it("reads the same whichever way the connection was drawn", () => {
    // A hybrid cord is a symmetric part. If LC→SC and SC→LC produced different strings
    // the pack list would bill one cable as two SKUs and neither count would be right.
    for (const a of FIBER) {
      for (const b of FIBER) {
        expect(cable(a, b), `${a} ↔ ${b}`).toBe(cable(b, a));
      }
    }
  });

  it("keeps the single-termination label when both ends match", () => {
    expect(cable("lc", "lc")).toBe("LC Fiber");
    expect(cable("sc", "sc")).toBe("SC Fiber");
    expect(cable("st", "st")).toBe("ST Fiber");
    expect(cable("opticalcon", "opticalcon")).toBe("opticalCON Fiber");
  });

  it("names each end exactly as its own single-end cable label does", () => {
    // "LC Fiber" and "SC Fiber" are the established style; the combined label factors the
    // family word out rather than inventing a second naming scheme.
    for (const a of FIBER) {
      for (const b of FIBER) {
        if (a === b) continue;
        const label = cable(a, b);
        expect(label.endsWith(" Fiber"), label).toBe(true);
        expect(label.split(" to ")).toHaveLength(2);
      }
    }
  });

  it("covers every fiber pair — no mismatched pair falls through to one end", () => {
    for (const a of FIBER) {
      for (const b of FIBER) {
        if (a === b) continue;
        expect(needsAdapter(a, b), `${a} ↔ ${b} should need no adapter`).toBe(false);
        expect(hybridCableLabel(a, b), `${a} ↔ ${b}`).toBeDefined();
      }
    }
  });

  it("applies to any signal riding the fiber connectors, not just the fiber signal", () => {
    // fibreACE defaults to opticalCON; an SDI-over-fiber run may sit on LC.
    expect(cable("lc", "sc", "fibreace")).toBe("LC to SC Fiber");
    expect(cable("st", "opticalcon", "sdi")).toBe("ST to opticalCON Fiber");
  });
});

describe("pairs that must NOT get a combined label", () => {
  it("leaves superset jacks naming the cable after the other end", () => {
    // A combo XLR/TRS jack takes an ordinary XLR or 1/4" cord — there is no
    // "XLR to 1/4\" TRS" hybrid to pack.
    expect(cable("xlr-3", "combo-xlr-trs", "analog-audio")).toBe("XLR");
    expect(cable("combo-xlr-trs", "trs-quarter", "analog-audio")).toBe('1/4" TRS');
    expect(cable("combo-xlr-trs", "ts-quarter", "analog-audio")).toBe('1/4" TS');
    // 1/4" TS is the same barrel as TRS; one cord seats in either jack.
    expect(cable("trs-quarter", "ts-quarter", "analog-audio")).toBe('1/4" TS');
    // An EtherCon chassis jack accepts a bare RJ45 plug, so a plain Cat6 patch works.
    expect(cable("rj45", "ethercon", "ethernet")).toBe("Cat6");
    // Binding-post/banana all resolve to the same wire anyway.
    expect(cable("binding-post-banana", "banana", "speaker-level")).toBe("Speaker Wire");
    // The standard host-to-peripheral USB cable, not a hybrid.
    expect(cable("usb-a", "usb-b", "usb")).toBe("USB");
    expect(cable("usb-a", "usb-micro", "usb")).toBe("Micro USB");
  });

  it("still labels adapter-needed runs as adapter cables", () => {
    expect(cable("usb-c", "usb-a", "usb")).toBe("USB-C to USB-A Adapter");
    expect(cable("hdmi", "dvi", "hdmi")).toBe("HDMI to DVI Adapter");
  });

  it("refuses a combined label for family members that do not actually mate", () => {
    // MPO/QSFP ribbon and SFP cages are outside the family on purpose — nothing bridges
    // them to a simplex LC/SC/ST, so no hybrid cord should ever be named.
    for (const outsider of ["mpo", "qsfp", "qsfp28", "sfp"] as const) {
      for (const f of FIBER) {
        expect(hybridCableLabel(f, outsider), `${f} ↔ ${outsider}`).toBeUndefined();
        expect(HYBRID_CABLE_FAMILY[outsider], outsider).toBeUndefined();
      }
    }
  });

  it("refuses a combined label for identical or missing connectors", () => {
    expect(hybridCableLabel("lc", "lc")).toBeUndefined();
    expect(hybridCableLabel("lc", undefined)).toBeUndefined();
    expect(hybridCableLabel(undefined, "sc")).toBeUndefined();
  });
});

// Bare wire is compatible with EVERY connector, so a mismatched pair used to fall through
// to the source-connector default: a DSP euroblock out → speaker XLR in packed as
// "Phoenix", the identical run drawn the other way packed as "XLR" (#308).
describe("bare-wire ends label independently of drag direction", () => {
  it("labels a screw-terminal end against a plausible partner with both ends, either way", () => {
    expect(cable("phoenix", "xlr-3", "analog-audio")).toBe("XLR to Phoenix");
    expect(cable("xlr-3", "phoenix", "analog-audio")).toBe("XLR to Phoenix");
    expect(cable("terminal-block", "trs-quarter", "analog-audio")).toBe('1/4" TRS to Terminal Block');
    expect(cable("speakon", "phoenix", "speaker-level")).toBe("speakON to Phoenix");
  });

  it("labels a field-terminated end as bulk cable of the far end's family, either way", () => {
    expect(cable("punch-down-110", "rj45", "ethernet")).toBe("Bulk Cat6");
    expect(cable("rj45", "punch-down-110", "ethernet")).toBe("Bulk Cat6");
    expect(cable("krone-idc", "rj45", "ethernet")).toBe("Bulk Cat6");
    expect(cable("solder-cup", "xlr-3", "analog-audio")).toBe("Bulk XLR");
    // Even against a plausible screw-terminal partner: no connector means bulk, not hybrid.
    expect(cable("punch-down-66", "phoenix", "analog-audio")).toBe("Bulk Cable");
    expect(cable("solder-cup", "punch-down-110", "analog-audio")).toBe("Bulk Cable");
  });

  it("keeps an implausible screw-terminal pairing on the far end's own label", () => {
    // hdmi↔phoenix passes the compatibility check but no such cable exists — no
    // "HDMI to Phoenix" hybrid may be minted, and no direction dependence either.
    expect(cable("hdmi", "phoenix", "hdmi")).toBe("HDMI");
    expect(cable("phoenix", "hdmi", "hdmi")).toBe("HDMI");
    expect(cable("db9", "terminal-block", "serial")).toBe("DB9");
    expect(BARE_WIRE_HYBRID_PARTNERS.has("hdmi")).toBe(false);
  });

  it("keeps matched bare ends on their single-end labels", () => {
    expect(cable("phoenix", "phoenix", "analog-audio")).toBe("Phoenix");
    expect(cable("phoenix", "terminal-block", "analog-audio")).toBe("Phoenix");
    expect(cable("terminal-block", "phoenix", "analog-audio")).toBe("Phoenix");
    expect(cable("punch-down-110", "punch-down-110", "ethernet")).toBe("Bulk Cable");
  });

  it("gives the same label in both drag directions for every bare-wire pairing", () => {
    const partners: ConnectorType[] = ["xlr-3", "trs-quarter", "rca", "speakon", "rj45", "hdmi", "db9", "bnc"];
    for (const bare of BARE_WIRE_CONNECTORS) {
      for (const other of [...partners, ...BARE_WIRE_CONNECTORS]) {
        expect(cable(bare, other), `${bare} ↔ ${other}`).toBe(cable(other, bare));
      }
    }
  });

  it("splits the bare-wire class exactly in two", () => {
    // areConnectorsCompatible/needsAdapter still wave the whole class through; only the
    // pack-list label distinguishes a screw terminal from a field termination.
    for (const c of BARE_WIRE_CONNECTORS) {
      expect(
        TERMINABLE_BARE_WIRE_CONNECTORS.has(c) !== FIELD_TERMINATED_CONNECTORS.has(c),
        c,
      ).toBe(true);
    }
    expect(BARE_WIRE_CONNECTORS.size).toBe(
      TERMINABLE_BARE_WIRE_CONNECTORS.size + FIELD_TERMINATED_CONNECTORS.size,
    );
  });
});

describe("the hybrid family stays consistent with the cable-name table", () => {
  it("every member's single-end cable label ends with its family word", () => {
    // The combined label is built by stripping that word off each end, so a member whose
    // label breaks the pattern would produce something like "LC Fiber to SFP Fiber Fiber".
    for (const [connector, family] of Object.entries(HYBRID_CABLE_FAMILY)) {
      const label = cable(connector as ConnectorType, connector as ConnectorType);
      expect(label.endsWith(` ${family}`), `${connector} → "${label}"`).toBe(true);
    }
  });

  it("every member mates natively with every other member", () => {
    const members = Object.keys(HYBRID_CABLE_FAMILY) as ConnectorType[];
    for (const a of members) {
      for (const b of members) {
        if (a === b) continue;
        expect(hybridCableLabel(a, b), `${a} ↔ ${b}`).toBeDefined();
      }
    }
  });
});
