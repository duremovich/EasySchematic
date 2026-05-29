import { describe, expect, it } from "vitest";

import { generateIncrementingLabelSeries } from "../spreadsheet/fillSeries";

describe("generateIncrementingLabelSeries", () => {
  it("increments a trailing numeric suffix", () => {
    expect(generateIncrementingLabelSeries("Output 1", 3, 1)).toEqual([
      "Output 1",
      "Output 2",
      "Output 3",
    ]);
  });

  it("increments the last numeric chunk even when text follows it", () => {
    expect(generateIncrementingLabelSeries("SPK-101-HL", 3, 1)).toEqual([
      "SPK-101-HL",
      "SPK-102-HL",
      "SPK-103-HL",
    ]);
  });

  it("preserves zero padding", () => {
    expect(generateIncrementingLabelSeries("SPK-001-HL", 3, 1)).toEqual([
      "SPK-001-HL",
      "SPK-002-HL",
      "SPK-003-HL",
    ]);
  });

  it("falls back to appending numbers when no digits are present", () => {
    expect(generateIncrementingLabelSeries("Output", 3, 1)).toEqual([
      "Output 1",
      "Output 2",
      "Output 3",
    ]);
  });
});
