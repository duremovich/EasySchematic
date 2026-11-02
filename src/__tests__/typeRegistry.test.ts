import { describe, it, expect } from "vitest";
import {
  allConnectors,
  allDeviceTypes,
  allSignals,
  builtinEntry,
  cablePrefix,
  connectorAccepts,
  connectorCable,
  connectorGender,
  connectorGroup,
  connectorGroups,
  connectorLabel,
  defaultConnector,
  deviceTypeCategory,
  deviceTypeLabel,
  isBuiltinConnector,
  isBuiltinSignal,
  signalCable,
  signalColor,
  signalCssColor,
  signalGroup,
  signalGroups,
  signalLabel,
} from "../typeRegistry";
import { CONNECTOR_LABELS, SIGNAL_LABELS } from "../types";
import { areConnectorsCompatible, matesNatively, needsAdapter } from "../connectorTypes";

// The unknown-id fallbacks are the contract P4 (community types) and P5 (user types) lean
// on: an old, offline or self-hosted client meeting an id it doesn't know must degrade,
// never throw or render "undefined".
const UNKNOWN = "x-show-comms-k3f9";
const GREY = "#71717a";

describe("typeRegistry: signals", () => {
  it("built-ins read their tables", () => {
    expect(signalLabel("sdi")).toBe("SDI");
    expect(signalColor("sdi")).toBe("#2563eb");
    expect(signalCssColor("sdi")).toBe("var(--color-sdi)");
    expect(signalGroup("dante")).toBe("Audio");
    expect(defaultConnector("sdi")).toBe("bnc");
    expect(cablePrefix("sdi")).toBe("S");
    expect(signalCable("sdi")).toBe("SDI");
  });

  it("unknown ids fall back to raw id, grey, Other, connector other", () => {
    expect(signalLabel(UNKNOWN)).toBe(UNKNOWN);
    expect(signalColor(UNKNOWN)).toBe(GREY);
    // No CSS variable exists for a non-built-in, so the stroke is the literal color.
    expect(signalCssColor(UNKNOWN)).toBe(GREY);
    expect(signalGroup(UNKNOWN)).toBe("Other");
    expect(defaultConnector(UNKNOWN)).toBe("other");
    expect(cablePrefix(UNKNOWN)).toBe("X");
    expect(signalCable(UNKNOWN)).toBe(UNKNOWN);
  });

  it("ignores Object.prototype members as ids", () => {
    expect(signalLabel("constructor")).toBe("constructor");
    expect(signalCssColor("toString")).toBe(GREY);
    expect(isBuiltinSignal("constructor")).toBe(false);
  });
});

describe("typeRegistry: connectors", () => {
  it("built-ins read their tables", () => {
    expect(connectorLabel("bnc")).toBe("BNC");
    expect(connectorGroup("bnc")).toBe("Video");
    expect(connectorCable("rj45")).toBe("Cat6");
    expect(connectorCable("none")).toBe("");
    expect(connectorGender("hdmi")).toBe("female");
    expect(connectorAccepts("ethercon").native).toContain("rj45");
  });

  it("unknown ids fall back to raw id, Other, no gender, no mating", () => {
    expect(connectorLabel(UNKNOWN)).toBe(UNKNOWN);
    expect(connectorGroup(UNKNOWN)).toBe("Other");
    expect(connectorCable(UNKNOWN)).toBe(UNKNOWN);
    expect(connectorGender(UNKNOWN)).toBeUndefined();
    expect(connectorAccepts(UNKNOWN)).toEqual({});
  });

  it("an unknown connector mates only with itself and bare wire", () => {
    expect(areConnectorsCompatible(UNKNOWN, UNKNOWN)).toBe(true);
    expect(areConnectorsCompatible(UNKNOWN, "bnc")).toBe(false);
    expect(areConnectorsCompatible("bnc", UNKNOWN)).toBe(false);
    expect(areConnectorsCompatible(UNKNOWN, "phoenix")).toBe(true);
    expect(matesNatively(UNKNOWN, "rj45")).toBe(false);
    expect(needsAdapter(UNKNOWN, "bnc")).toBe(false);
  });
});

describe("typeRegistry: device types", () => {
  it("built-ins read their tables", () => {
    expect(deviceTypeLabel("ptz-camera")).toBe("PTZ Camera");
    expect(deviceTypeCategory("ptz-camera")).toBe("Sources");
  });

  it("unknown ids fall back to raw id and Other", () => {
    expect(deviceTypeLabel(UNKNOWN)).toBe(UNKNOWN);
    expect(deviceTypeCategory(UNKNOWN)).toBe("Other");
  });
});

describe("typeRegistry: pickers", () => {
  it("list every built-in exactly once", () => {
    expect(allSignals()).toEqual(Object.keys(SIGNAL_LABELS));
    expect(allConnectors()).toEqual(Object.keys(CONNECTOR_LABELS));
    expect(allDeviceTypes()).toContain("ptz-camera");
    expect(allSignals().every(isBuiltinSignal)).toBe(true);
    expect(allConnectors().every(isBuiltinConnector)).toBe(true);
  });

  it("groups hand out copies, so a picker can't mutate the built-in groups", () => {
    signalGroups().Video.push(UNKNOWN);
    connectorGroups().Video.push(UNKNOWN);
    expect(signalGroups().Video).not.toContain(UNKNOWN);
    expect(connectorGroups().Video).not.toContain(UNKNOWN);
  });

  it("builtinEntry reads own keys only", () => {
    const table: Partial<Record<string, number>> = { a: 1 };
    expect(builtinEntry(table, "a")).toBe(1);
    expect(builtinEntry(table, "hasOwnProperty")).toBeUndefined();
  });
});
