import { describe, it, expect } from "vitest";
import {
  areConnectorsCompatible,
  needsAdapter,
  usbcPowerShortfallW,
  CONNECTOR_TO_CABLE,
  CONNECTOR_GENDER,
  CONNECTORS_WITH_GENDER_VARIATION,
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
