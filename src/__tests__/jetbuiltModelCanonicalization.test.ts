import { describe, expect, it } from "vitest";
import { canonicalizeJetbuiltModel } from "../../tateside-api/src/jetbuilt.ts";

describe("Jetbuilt model canonicalization", () => {
  it("strips bundle-style numeric SKU suffixes when the device family is present in the product text", () => {
    expect(canonicalizeJetbuiltModel("A40-031", {
      description: "MeetingBarA40 (includes CTP25 touchpad)",
      productName: "A40 Meeting Bar",
      shortDescription: "Yealink A40-031 MeetingBarA40",
    })).toBe("A40");
  });

  it("keeps the raw model when there is no evidence that the suffix is just a commercial SKU", () => {
    expect(canonicalizeJetbuiltModel("VB-TVMount-01", {
      description: "VESA TV Mount for A50/A40/SmartVision 40",
      productName: "VB-TVMount-01",
      shortDescription: "Yealink VB-TVMount-01",
    })).toBe("VB-TVMount-01");
  });
});
