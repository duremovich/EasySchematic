import { describe, it, expect, afterEach, vi } from "vitest";
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
  connectorsByLabel,
  isBuiltinConnector,
  isBuiltinSignal,
  isKnownConnector,
  isKnownSignal,
  registerTypes,
  signalCable,
  signalColor,
  signalCssColor,
  signalGroup,
  signalGroups,
  signalLabel,
  signalsByLabel,
  typeRegistryVersion,
} from "../typeRegistry";
import type { ConnectorTypeDef, CustomTypeRecord, SignalTypeDef } from "../customTypes/model";
import { parseSignalType } from "../csvImport";
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

// P4: community types registered from GET /types (and the cache / bundled fallback).
const COMMS: SignalTypeDef = {
  id: "shadow-comms", label: "Shadow Comms", color: "#2f855a", group: "Control",
  defaultConnector: "weco-3", cable: "Comms", cablePrefix: "SHC",
};
const WECO: ConnectorTypeDef = {
  id: "weco-3", label: "WECO 3-pin", group: "Power", cable: "WECO", gender: "female", matesWith: [], adaptsTo: [],
};
const HDBNC: ConnectorTypeDef = {
  id: "shadow-hdbnc", label: "Shadow HD-BNC", group: "Video", cable: "Mini coax", gender: "none",
  matesWith: [], adaptsTo: ["bnc"],
};

describe("typeRegistry: community types", () => {
  afterEach(() => registerTypes("community", {}));

  it("registering community types makes the picker lists, labels and colours include them", () => {
    const before = typeRegistryVersion();
    registerTypes("community", { signals: [COMMS], connectors: [WECO, HDBNC] });
    expect(typeRegistryVersion()).toBeGreaterThan(before);

    // The lists that used to be frozen at module load now see the registration.
    expect(allSignals()).toContain("shadow-comms");
    expect(signalsByLabel()).toContain("shadow-comms");
    expect(signalGroups().Control).toContain("shadow-comms");
    expect(connectorsByLabel()).toContain("weco-3");
    expect(connectorGroups().Video).toContain("shadow-hdbnc");
    expect(parseSignalType("Shadow Comms")).toBe("shadow-comms");
    expect(parseSignalType("shadow_comms")).toBe("shadow-comms");

    expect(isKnownSignal("shadow-comms")).toBe(true);
    expect(signalLabel("shadow-comms")).toBe("Shadow Comms");
    expect(signalColor("shadow-comms")).toBe("#2f855a");
    expect(signalCssColor("shadow-comms")).toBe("#2f855a"); // literal, no --color-* var
    expect(cablePrefix("shadow-comms")).toBe("SHC");
    expect(defaultConnector("shadow-comms")).toBe("weco-3");
    expect(connectorLabel("weco-3")).toBe("WECO 3-pin");
    expect(connectorGender("weco-3")).toBe("female");
    expect(needsAdapter("shadow-hdbnc", "bnc")).toBe(true);
    expect(needsAdapter("bnc", "shadow-hdbnc")).toBe(true);
    expect(matesNatively("weco-3", "bnc")).toBe(false);
  });

  it("re-registering replaces the layer", () => {
    registerTypes("community", { signals: [COMMS], connectors: [WECO] });
    registerTypes("community", { connectors: [{ ...HDBNC, retired: true }] });
    expect(isKnownSignal("shadow-comms")).toBe(false);
    expect(signalLabel("shadow-comms")).toBe("shadow-comms");
    expect(signalColor("shadow-comms")).toBe(GREY);
    expect(signalsByLabel()).not.toContain("shadow-comms");
    expect(parseSignalType("Shadow Comms")).toBe("custom");
    expect(isKnownConnector("weco-3")).toBe(false);
    // Retired: still resolves, but out of the pickers.
    expect(connectorLabel("shadow-hdbnc")).toBe("Shadow HD-BNC");
    expect(connectorsByLabel()).not.toContain("shadow-hdbnc");
  });
});

describe("templateApi: community types cache", () => {
  const record: CustomTypeRecord = {
    kind: "signal", id: COMMS.id, label: COMMS.label, status: "active",
    data: { color: COMMS.color, group: COMMS.group, defaultConnector: "bnc", cable: COMMS.cable, cablePrefix: COMMS.cablePrefix },
  };

  function stubStorage(initial: Record<string, string>) {
    const store = new Map(Object.entries(initial));
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    return store;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("a 304 keeps the cached types", async () => {
    stubStorage({ "easyschematic-community-types": JSON.stringify([record]) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 304 })));
    vi.resetModules();
    const api = await import("../templateApi");
    const registry = await import("../typeRegistry");
    await api.loadCommunityTypes();
    expect(registry.signalLabel("shadow-comms")).toBe("Shadow Comms");
    expect(registry.cablePrefix("shadow-comms")).toBe("SHC");
  });

  it("a fresh answer replaces and caches them; a failed fetch keeps the last good copy", async () => {
    const store = stubStorage({});
    let fail = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (fail) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify([record]), { status: 200 });
    }));
    vi.resetModules();
    const api = await import("../templateApi");
    const registry = await import("../typeRegistry");
    api.initCommunityTypes(); // empty cache: the bundled fallback
    expect(registry.isKnownSignal("shadow-comms")).toBe(false);
    await api.loadCommunityTypes();
    expect(registry.signalLabel("shadow-comms")).toBe("Shadow Comms");
    expect(JSON.parse(store.get("easyschematic-community-types")!)).toEqual([record]);

    vi.resetModules(); // next page load, API down
    fail = true;
    const api2 = await import("../templateApi");
    const registry2 = await import("../typeRegistry");
    api2.initCommunityTypes();
    await api2.loadCommunityTypes();
    expect(registry2.signalLabel("shadow-comms")).toBe("Shadow Comms");
  });
});
