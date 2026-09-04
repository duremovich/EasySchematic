import { describe, it, expect } from "vitest";
import {
  areConnectorsCompatible,
  needsAdapter,
  usbcPowerShortfallW,
  CONNECTOR_TO_CABLE,
  CONNECTOR_GENDER,
  CONNECTORS_WITH_GENDER_VARIATION,
  shouldDefaultMultiConnect,
} from "../connectorTypes";
import { CONNECTOR_LABELS, CONNECTOR_GROUPS } from "../types";

describe("1/4\" TS connector (#208)", () => {
  it("has a dropdown label, cable name, and the 6.35mm naming on TRS", () => {
    expect(CONNECTOR_LABELS["ts-quarter"]).toBe('1/4" TS (6.35mm)');
    expect(CONNECTOR_LABELS["trs-quarter"]).toBe('1/4" TRS (6.35mm)');
    expect(CONNECTOR_TO_CABLE["ts-quarter"]).toBe('1/4" TS');
  });

  it("appears in the Audio connector group next to TRS", () => {
    expect(CONNECTOR_GROUPS["Audio"]).toContain("ts-quarter");
  });

  it("mates with 1/4\" TRS natively — same barrel, no adapter", () => {
    expect(areConnectorsCompatible("ts-quarter", "trs-quarter")).toBe(true);
    expect(needsAdapter("ts-quarter", "trs-quarter")).toBe(false);
  });

  it("plugs into a combo XLR/TRS jack natively", () => {
    expect(areConnectorsCompatible("ts-quarter", "combo-xlr-trs")).toBe(true);
    expect(needsAdapter("ts-quarter", "combo-xlr-trs")).toBe(false);
  });

  it("needs an adapter to reach XLR or 3.5mm", () => {
    expect(areConnectorsCompatible("ts-quarter", "xlr-3")).toBe(true);
    expect(needsAdapter("ts-quarter", "xlr-3")).toBe(true);
    expect(needsAdapter("ts-quarter", "trs-eighth")).toBe(true);
  });

  it("carries a device-side gender and exposes a manual override", () => {
    expect(CONNECTOR_GENDER["ts-quarter"]).toBe("female");
    expect(CONNECTORS_WITH_GENDER_VARIATION.has("ts-quarter")).toBe(true);
  });
});

describe("USB-A to USB-B connections (#219)", () => {
  it("mates USB-A with USB-B natively — the standard host-to-peripheral cable", () => {
    expect(areConnectorsCompatible("usb-a", "usb-b")).toBe(true);
    expect(areConnectorsCompatible("usb-b", "usb-a")).toBe(true);
    expect(needsAdapter("usb-a", "usb-b")).toBe(false);
  });

  // The issue also asked for A-to-A and B-to-B to be REJECTED. Deliberately not
  // done — see the decision recorded on #219. A-to-A cables exist and get used,
  // and a strict rule would need gender to avoid rejecting an A-male to A-female
  // extension, so a false warning on a valid run would cost more than the missing
  // warning here. Asserted so the "fix" isn't reintroduced by accident.
  it("still allows A-to-A and B-to-B rather than warning on them (#219, by decision)", () => {
    expect(areConnectorsCompatible("usb-a", "usb-a")).toBe(true);
    expect(areConnectorsCompatible("usb-b", "usb-b")).toBe(true);
  });

  it("mates USB-A with mini/micro-B natively — same host-to-peripheral convention", () => {
    expect(areConnectorsCompatible("usb-a", "usb-mini")).toBe(true);
    expect(areConnectorsCompatible("usb-a", "usb-micro")).toBe(true);
    expect(needsAdapter("usb-a", "usb-mini")).toBe(false);
    expect(needsAdapter("usb-a", "usb-micro")).toBe(false);
  });

  it("still treats USB-B to mini/micro-B as incompatible — no such standard cable", () => {
    expect(areConnectorsCompatible("usb-b", "usb-mini")).toBe(false);
    expect(areConnectorsCompatible("usb-b", "usb-micro")).toBe(false);
  });

  it("keeps USB-C reaching USB-A/B via adapter", () => {
    expect(areConnectorsCompatible("usb-c", "usb-a")).toBe(true);
    expect(needsAdapter("usb-c", "usb-a")).toBe(true);
  });
});

describe("USB-C Power Delivery shortfall (#204)", () => {
  const src = (w: number) => ({ usbcPowerSourceW: w });
  const sink = (w: number) => ({ usbcPowerDrawW: w });

  it("returns null when either port is missing", () => {
    expect(usbcPowerShortfallW(undefined, sink(60))).toBeNull();
    expect(usbcPowerShortfallW(src(60), undefined)).toBeNull();
  });

  it("returns null when no source/draw pairing exists", () => {
    expect(usbcPowerShortfallW(src(60), src(100))).toBeNull(); // both source
    expect(usbcPowerShortfallW(sink(30), sink(30))).toBeNull(); // both sink
    expect(usbcPowerShortfallW({}, {})).toBeNull();
  });

  it("returns null when the source covers the sink", () => {
    expect(usbcPowerShortfallW(src(100), sink(60))).toBeNull();
    expect(usbcPowerShortfallW(src(60), sink(60))).toBeNull(); // exactly enough
  });

  it("reports the deficit in watts when undersupplied", () => {
    expect(usbcPowerShortfallW(src(60), sink(90))).toBe(30);
    // direction-agnostic: source may be on either end
    expect(usbcPowerShortfallW(sink(90), src(60))).toBe(30);
  });

  it("takes the worst deficit when both ends source and sink", () => {
    // a delivers 20 but draws 5; b delivers 0? model both knobs on each port
    const a = { usbcPowerSourceW: 20, usbcPowerDrawW: 100 };
    const b = { usbcPowerSourceW: 10, usbcPowerDrawW: 5 };
    // a→b: b draws 5, a delivers 20 → fine; b→a: a draws 100, b delivers 10 → 90 short
    expect(usbcPowerShortfallW(a, b)).toBe(90);
  });
});

describe("multi-connect defaults (#273)", () => {
  it("defaults SRT and Custom signal ports to multi-connect", () => {
    expect(shouldDefaultMultiConnect("srt")).toBe(true);
    expect(shouldDefaultMultiConnect("custom")).toBe(true);
  });

  it("defaults wireless-connector ports to multi-connect regardless of signal", () => {
    expect(shouldDefaultMultiConnect("analog-audio", "wireless")).toBe(true);
  });

  it("leaves Dante ports single-connection by default — 1:many flows need the M toggle", () => {
    expect(shouldDefaultMultiConnect("dante")).toBe(false);
    expect(shouldDefaultMultiConnect("dante", "rj45")).toBe(false);
  });

  it("leaves ordinary wired ports single-connection by default", () => {
    expect(shouldDefaultMultiConnect("sdi", "bnc")).toBe(false);
    expect(shouldDefaultMultiConnect("hdmi", "hdmi")).toBe(false);
  });
});

describe("CEE 7 European power connectors", () => {
  it("has dropdown labels and pack-list cable names", () => {
    expect(CONNECTOR_LABELS["schuko"]).toBe("CEE Schuko (7/3/4)");
    expect(CONNECTOR_LABELS["french-power"]).toBe("CEE French Power (7/5/7)");
    expect(CONNECTOR_LABELS["europlug"]).toBe("CEE Europlug (7/16)");
    expect(CONNECTOR_TO_CABLE["schuko"]).toBe("Schuko");
    expect(CONNECTOR_TO_CABLE["french-power"]).toBe("French Power");
    expect(CONNECTOR_TO_CABLE["europlug"]).toBe("Europlug");
  });

  it("follows the IEC-style direction-conditional gender, with an override exposed", () => {
    expect(CONNECTOR_GENDER["schuko"]).toEqual({ input: "male", output: "female" });
    expect(CONNECTOR_GENDER["french-power"]).toEqual({ input: "male", output: "female" });
    expect(CONNECTORS_WITH_GENDER_VARIATION.has("schuko")).toBe(true);
    expect(CONNECTORS_WITH_GENDER_VARIATION.has("french-power")).toBe(true);
  });

  it("follows the same direction-conditional gender as the rest of the power family — europlug sockets exist on power strips", () => {
    expect(CONNECTOR_GENDER["europlug"]).toEqual({ input: "male", output: "female" });
    expect(CONNECTORS_WITH_GENDER_VARIATION.has("europlug")).toBe(true);
  });

  it("mates a europlug into either socket shape with no adapter", () => {
    expect(areConnectorsCompatible("europlug", "schuko")).toBe(true);
    expect(needsAdapter("europlug", "schuko")).toBe(false);
    expect(areConnectorsCompatible("europlug", "french-power")).toBe(true);
    expect(needsAdapter("europlug", "french-power")).toBe(false);
  });

  it("requires an adapter between Schuko and the French system, and to reach IEC/Edison", () => {
    expect(needsAdapter("schuko", "french-power")).toBe(true);
    expect(needsAdapter("schuko", "iec")).toBe(true);
    expect(needsAdapter("french-power", "edison")).toBe(true);
  });
});

describe("BS 1363 UK power connector", () => {
  it("has a dropdown label and pack-list cable name", () => {
    expect(CONNECTOR_LABELS["uk-power"]).toBe("UK Power (BS 1363)");
    expect(CONNECTOR_TO_CABLE["uk-power"]).toBe("UK Power");
  });

  it("appears in the Power connector group", () => {
    expect(CONNECTOR_GROUPS["Power"]).toContain("uk-power");
  });

  it("follows the IEC-style direction-conditional gender, with an override exposed", () => {
    expect(CONNECTOR_GENDER["uk-power"]).toEqual({ input: "male", output: "female" });
    expect(CONNECTORS_WITH_GENDER_VARIATION.has("uk-power")).toBe(true);
  });

  it("has no native mate — shuttered sockets need the earth pin to unlock, so even a Europlug needs an adapter", () => {
    expect(needsAdapter("uk-power", "europlug")).toBe(true);
    expect(needsAdapter("uk-power", "schuko")).toBe(true);
    expect(needsAdapter("uk-power", "french-power")).toBe(true);
    expect(needsAdapter("uk-power", "iec")).toBe(true);
    expect(needsAdapter("uk-power", "edison")).toBe(true);
  });

  it("is still flagged compatible (via adapter), not rejected outright", () => {
    expect(areConnectorsCompatible("uk-power", "iec")).toBe(true);
  });
});
