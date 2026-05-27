import { describe, expect, it } from "vitest";
import { getWheelNavigationAction } from "../navigationPreferences";
import { DEFAULT_SCROLL_CONFIG } from "../types";

describe("wheel navigation input mode", () => {
  it("pans from the first pure-vertical gesture in trackpad mode", () => {
    const action = getWheelNavigationAction(
      "trackpad",
      { ctrlKey: false, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
    );

    expect(action).toBe("pan-free");
  });

  it("uses configured wheel behavior in mouse mode", () => {
    const action = getWheelNavigationAction(
      "mouse",
      { ctrlKey: false, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
    );

    expect(action).toBe("zoom");
  });

  it("recognises synthetic Ctrl trackpad pinch as zoom in trackpad and automatic modes", () => {
    expect(getWheelNavigationAction(
      "trackpad",
      { ctrlKey: true, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
    )).toBe("pinch-zoom");
    expect(getWheelNavigationAction(
      "auto",
      { ctrlKey: true, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
    )).toBe("pinch-zoom");
  });

  it("preserves existing automatic detection when a gesture has trackpad evidence", () => {
    expect(getWheelNavigationAction(
      "auto",
      { ctrlKey: false, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
      true,
    )).toBe("pan-free");
    expect(getWheelNavigationAction(
      "auto",
      { ctrlKey: false, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
      false,
    )).toBe("zoom");
  });

  it("leaves physical Ctrl + scroll under the configured mapping", () => {
    const action = getWheelNavigationAction(
      "trackpad",
      { ctrlKey: true, shiftKey: false },
      true,
      DEFAULT_SCROLL_CONFIG,
    );

    expect(action).toBe(DEFAULT_SCROLL_CONFIG.ctrlScroll);
  });

  it("leaves synthetic Ctrl input under mappings in explicit mouse mode", () => {
    const action = getWheelNavigationAction(
      "mouse",
      { ctrlKey: true, shiftKey: false },
      false,
      DEFAULT_SCROLL_CONFIG,
    );

    expect(action).toBe(DEFAULT_SCROLL_CONFIG.ctrlScroll);
  });
});
