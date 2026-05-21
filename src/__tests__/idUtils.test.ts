import { describe, expect, it } from "vitest";
import { allocateEdgeId, maxEdgeCounterFromIds, newLinkedConnectionId, uniquifyEdgeIds } from "../idUtils";

describe("edge id utilities", () => {
  it("counts stub-leg ids as consuming their numeric base", () => {
    expect(maxEdgeCounterFromIds(["edge-7-src", "edge-19-tgt"], 0)).toBe(19);
  });

  it("does not allocate an id whose stub-leg ids already exist", () => {
    expect(allocateEdgeId(["edge-1-src", "edge-2"], 0).id).toBe("edge-3");
  });

  it("renames duplicate edge ids while preserving the first occurrence", () => {
    const original = [{ id: "edge-1" }, { id: "edge-1" }, { id: "edge-2" }];
    const result = uniquifyEdgeIds(original, 0);

    expect(result.changed).toBe(true);
    expect(result.edges.map((edge) => edge.id)).toEqual(["edge-1", "edge-3", "edge-2"]);
  });

  it("mints a distinct linked-connection id on every call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newLinkedConnectionId()));
    expect(ids.size).toBe(100);
  });
});
