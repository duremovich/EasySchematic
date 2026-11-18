/**
 * Hovering any leg or tag of a stubbed connection lights the whole stub (#405).
 *
 * Legs and tags all read one hovered link id; these pin the enter/leave rules the
 * pointer crossings rely on: only the leg or tag the pointer is on can clear the hover,
 * so a late leave from where it came from can't clear where it went, and an unmount
 * (deleted under the pointer, no mouseleave) clears it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { enterStubLink, leaveStubLink, useStubHover } from "../stubHover";

describe("stub hover", () => {
  beforeEach(() => useStubHover.setState({ linkId: null, owner: null }));

  it("entering a leg or tag marks its link hovered; leaving clears it", () => {
    enterStubLink("link-a", "edge:e1-src");
    expect(useStubHover.getState().linkId).toBe("link-a");
    leaveStubLink("edge:e1-src");
    expect(useStubHover.getState().linkId).toBeNull();
  });

  it("moving from one stub straight onto another keeps the new one lit", () => {
    // Enter B can fire before leave A when the two are adjacent.
    enterStubLink("link-a", "tag:stub-e1-src");
    enterStubLink("link-b", "tag:stub-e2-src");
    leaveStubLink("tag:stub-e1-src");
    expect(useStubHover.getState().linkId).toBe("link-b");
  });

  it("moving from a leg onto its own tag keeps the stub lit", () => {
    enterStubLink("link-a", "edge:e1-src");
    enterStubLink("link-a", "tag:stub-e1-src");
    leaveStubLink("edge:e1-src");
    expect(useStubHover.getState().linkId).toBe("link-a");
  });

  it("an ordinary cable (no link) leaves the hover alone", () => {
    enterStubLink("link-a", "tag:stub-e1-src");
    enterStubLink(undefined, "edge:e9");
    leaveStubLink("edge:e9");
    expect(useStubHover.getState().linkId).toBe("link-a");
  });

  it("a hovered tag that unmounts lets go (the unmount cleanup calls leave)", () => {
    enterStubLink("link-a", "tag:stub-e1-src");
    leaveStubLink("tag:stub-e1-src"); // what StubLabelNode's unmount cleanup does
    expect(useStubHover.getState()).toEqual({ linkId: null, owner: null });
  });
});
