/**
 * Secondary per-port controls in the device editor (#303).
 *
 * The badges used to sit on the port's primary row, to the right of the name
 * input, and every one of them stole width from it. They now render on a second
 * line; these cases pin what that line contains and in what order. The other
 * half of "nothing went missing in the move" is compile-time: the renderer's
 * switch has a `never` default, so an id listed here without a badge to draw
 * fails the build.
 */
import { describe, it, expect } from "vitest";
import {
  visiblePortRowControls,
  PORT_ROW_CONTROL_TITLES,
  type PortRowControlId,
} from "../portRowControls";

const base = { deviceType: "converter", isMulticable: false };

describe("visiblePortRowControls", () => {
  it("offers trunk, multi-connect, section, exclusive group, notes and flip on every port", () => {
    expect(visiblePortRowControls(base)).toEqual([
      "trunk",
      "multi-connect",
      "section",
      "exclusive-group",
      "notes",
      "flip",
    ]);
  });

  it("reveals the channel count only once the port is a trunk, right after the toggle", () => {
    expect(visiblePortRowControls(base)).not.toContain("channel-count");
    const trunk = visiblePortRowControls({ ...base, isMulticable: true });
    expect(trunk).toContain("channel-count");
    expect(trunk.indexOf("channel-count")).toBe(trunk.indexOf("trunk") + 1);
  });

  it("offers direct attach on adapters only", () => {
    expect(visiblePortRowControls({ ...base, deviceType: "adapter" })).toContain("direct-attach");
    for (const deviceType of ["converter", "switch", "display", "camera"]) {
      expect(visiblePortRowControls({ ...base, deviceType })).not.toContain("direct-attach");
    }
  });

  it("keeps a stable order as controls appear and disappear", () => {
    expect(visiblePortRowControls({ deviceType: "adapter", isMulticable: true })).toEqual([
      "trunk",
      "channel-count",
      "multi-connect",
      "direct-attach",
      "section",
      "exclusive-group",
      "notes",
      "flip",
    ]);
  });

  it("gives every control a tooltip — the badges are one or two characters wide", () => {
    const all = visiblePortRowControls({ deviceType: "adapter", isMulticable: true });
    const ids = Object.keys(PORT_ROW_CONTROL_TITLES) as PortRowControlId[];
    expect([...all].sort()).toEqual([...ids].sort());
    for (const id of ids) expect(PORT_ROW_CONTROL_TITLES[id].length).toBeGreaterThan(0);
  });
});
