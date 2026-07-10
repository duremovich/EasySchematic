import { describe, expect, it } from "vitest";
import { normalizeShortcutKey } from "../keyUtils";

describe("normalizeShortcutKey", () => {
  it("lowercases single letter keys so shortcuts match", () => {
    expect(normalizeShortcutKey("c")).toBe("c");
    expect(normalizeShortcutKey("v")).toBe("v");
    expect(normalizeShortcutKey("a")).toBe("a");
  });

  it("lowercases uppercase letters reported under Caps Lock (#179)", () => {
    // With Caps Lock on the browser reports "C" for the C key; copy/paste and
    // other letter shortcuts must still resolve to their lowercase form.
    expect(normalizeShortcutKey("C")).toBe("c");
    expect(normalizeShortcutKey("V")).toBe("v");
    expect(normalizeShortcutKey("Z")).toBe("z");
    expect(normalizeShortcutKey("S")).toBe("s");
  });

  it("leaves multi-character key names untouched", () => {
    for (const key of ["Enter", "Escape", "Delete", "Backspace", "ArrowUp", "F9"]) {
      expect(normalizeShortcutKey(key)).toBe(key);
    }
  });

  it("does not alter non-letter single characters", () => {
    expect(normalizeShortcutKey(" ")).toBe(" ");
    expect(normalizeShortcutKey("/")).toBe("/");
  });
});
