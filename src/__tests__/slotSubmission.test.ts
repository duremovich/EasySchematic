/**
 * #427 — a device submission was rejected with "slots[0].id must be a string".
 *
 * The device editor's Submit to Community sent the placed device's INSTALLED slots
 * (`{ slotId, portIds, cardTemplateId, … }`) where the API wants slot DEFINITIONS
 * (`{ id, label, slotFamily }`), so every device with an expansion slot failed. The draft
 * lands on the devices site's submit form, which posted the slots on unchanged; deleting and
 * re-adding the slot there "fixed" it only because that form mints an `id`.
 *
 * Pinned here: the conversion, the repair applied on every submit path (createDraft /
 * createSubmission / the devices-site form), and the API's error naming the slot in the
 * submitter's terms.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { InstalledSlot } from "../types";
import { installedSlotsToDefinitions, repairSlotDefinitions } from "../slotDefinitions";
import { validateTemplate } from "../../api/src/validate";
import { createDraft, createSubmission } from "../templateApi";

/** Installed slots exactly as the store keeps them on a placed modular device: one added
 *  with "+ Add Slot" (empty), one holding a card that brought a nested sub-slot. */
const INSTALLED: InstalledSlot[] = [
  { slotId: "slot-1731000000000-k3x9", label: "Slot A", slotFamily: "test-frame-io", portIds: [] },
  {
    slotId: "slot-b",
    label: "Slot B",
    slotFamily: "test-frame-io",
    cardTemplateId: "test-net-card",
    cardLabel: "Network I/O Card",
    portIds: ["slot-slot-b-1731000000000-0-0"],
  },
  {
    slotId: "slot-b/sfp1",
    label: "SFP 1",
    slotFamily: "test-sfp-plus",
    parentSlotId: "slot-b",
    portIds: [],
  },
];

/** A submission body the way the API sees it — all the other required fields valid. */
function body(slots: unknown): Record<string, unknown> {
  return {
    label: "Modular Frame",
    deviceType: "media-server",
    category: "Video",
    manufacturer: "Generic",
    ports: [{ id: "tpl-0", label: "Ref In", signalType: "genlock", direction: "input" }],
    slots,
  };
}

describe("installed slots → slot definitions (#427)", () => {
  it("sending installed slots as-is is what the API rejected", () => {
    const r = validateTemplate(body(INSTALLED));
    expect(r.ok).toBe(false);
  });

  it("the converted top-level slots pass validation", () => {
    const defs = installedSlotsToDefinitions(INSTALLED, { keepCard: () => false });
    expect(defs).toEqual([
      { id: "slot-1731000000000-k3x9", label: "Slot A", slotFamily: "test-frame-io" },
      { id: "slot-b", label: "Slot B", slotFamily: "test-frame-io" },
    ]);
    expect(validateTemplate(body(defs))).toMatchObject({ ok: true });
  });
});

describe("repairSlotDefinitions (#427)", () => {
  it("repairs a stale installed-slot draft into submittable definitions", () => {
    const repaired = repairSlotDefinitions(INSTALLED)!;
    expect(repaired).toEqual([
      { id: "slot-1731000000000-k3x9", label: "Slot A", slotFamily: "test-frame-io" },
      { id: "slot-b", label: "Slot B", slotFamily: "test-frame-io" },
    ]);
    expect(validateTemplate(body(repaired))).toMatchObject({ ok: true });
  });

  it("gives a slot with no id a stable one that is unique within the device", () => {
    const raw = [
      { label: "Slot 1", slotFamily: "fam" },
      { id: "slot-2", label: "Slot 2", slotFamily: "fam" },
      { label: "Slot 3", slotFamily: "fam" },
      { id: "slot-2", label: "Dup", slotFamily: "fam" },
    ];
    const once = repairSlotDefinitions(raw)!;
    const ids = once.map((s) => s.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[1]).toBe("slot-2"); // a good id is kept
    expect(repairSlotDefinitions(raw)!.map((s) => s.id)).toEqual(ids); // stable
    expect(repairSlotDefinitions(once)).toEqual(once); // idempotent
  });

  it("drops a user template's sub-slot overrides and swaps any other \"/\" in an id for \"-\"", () => {
    const repaired = repairSlotDefinitions([
      { id: "a", label: "Slot A", slotFamily: "fam", defaultCardId: "custom-1" },
      { id: "a/sfp1", label: "SFP 1", slotFamily: "sfp", nestedOverride: true },
      { id: "a/sfp2", label: "SFP 2", slotFamily: "sfp" }, // unmarked, as older builds saved it
      { id: "x/y", label: "Odd", slotFamily: "fam" },
    ])!;
    expect(repaired.map((s) => s.id)).toEqual(["a", "x-y"]);
    expect(validateTemplate(body(repaired))).toMatchObject({ ok: true });
  });

  it("keeps a default card and drops installed-slot bookkeeping", () => {
    const [s] = repairSlotDefinitions([
      { id: "a", label: "A", slotFamily: "fam", defaultCardId: "card-1", portIds: ["x"], cardLabel: "Card" },
    ])!;
    expect(s).toEqual({ id: "a", label: "A", slotFamily: "fam", defaultCardId: "card-1" });
  });
});

describe("submit paths post repaired slots (#427)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "draft-1" }), { status: 200 });
    }));
    return calls;
  }

  it("createDraft (Submit to Community / the pending-submission banner)", async () => {
    const calls = stubFetch();
    await createDraft(body(INSTALLED));
    const sent = calls[0].body.data as { slots: unknown };
    expect(sent.slots).toEqual([
      { id: "slot-1731000000000-k3x9", label: "Slot A", slotFamily: "test-frame-io" },
      { id: "slot-b", label: "Slot B", slotFamily: "test-frame-io" },
    ]);
  });

  it("createSubmission (Import Devices → Add & submit)", async () => {
    const calls = stubFetch();
    await createSubmission("create", body([{ label: "Slot A", slotFamily: "fam" }]) as never);
    const sent = calls[0].body.data as { slots: { id: string }[] };
    expect(typeof sent.slots[0].id).toBe("string");
    expect(validateTemplate(sent)).toMatchObject({ ok: true });
  });
});

describe("API slot errors name the slot (#427)", () => {
  const err = (slots: unknown) => {
    const r = validateTemplate(body(slots));
    return r.ok ? null : r.error;
  };

  it("a missing id", () => {
    expect(err([{ label: "Slot A", slotFamily: "fam" }])).toBe('Expansion slot 1 ("Slot A") is missing an id');
  });

  it("a missing slot family, on the second slot", () => {
    expect(err([
      { id: "a", label: "Slot A", slotFamily: "fam" },
      { id: "b", label: "VFC Slot B", slotFamily: "" },
    ])).toBe('Expansion slot 2 ("VFC Slot B") is missing a slot family');
  });

  it("a missing name", () => {
    expect(err([{ id: "a", slotFamily: "fam" }])).toBe("Expansion slot 1 is missing a name");
  });

  it("two slots sharing an id", () => {
    expect(err([
      { id: "a", label: "Slot A", slotFamily: "fam" },
      { id: "a", label: "Slot B", slotFamily: "fam" },
    ])).toBe('Expansion slot 2 ("Slot B") has the same id as Expansion slot 1 ("Slot A") ("a") — slot ids must be unique');
  });
});
