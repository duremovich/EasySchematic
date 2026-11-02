import { describe, it, expect, afterEach } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICE_TEMPLATES, CARD_TEMPLATES } from "../deviceLibrary";
import { DEVICE_TYPE_TO_CATEGORY, DEVICE_TYPE_ALIASES, ALL_CATEGORIES, DEVICE_TYPE_LABELS, POWER_CAPACITY_DEVICE_TYPES, carriesPowerCapacity } from "../deviceTypeCategories";
import { checkDeviceTypeMapped, checkApprovalDeviceType } from "../../api/src/validate";
import { validateTemplate } from "../import/validate";
import { approveSubmission } from "../../devices/src/api";

// Ids that still carry two bundled templates. The #300 audit found 15 and left
// them here as a backlog; #339 re-ided all 15, so the set is empty and must stay
// that way — a new entry means a template the Device Library cannot show.
const KNOWN_COLLIDED_IDS: string[] = [];

function idCounts(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const t of [...DEVICE_TEMPLATES, ...CARD_TEMPLATES]) {
    if (!t.id) continue;
    if (!byId.has(t.id)) byId.set(t.id, []);
    byId.get(t.id)!.push(t.label);
  }
  return byId;
}

describe("#300 — TB (M) → RJ45 (F) Adapter id collision", () => {
  it("no longer shares an id with BMD Video Assist 12G HDR 7in", () => {
    const adapter = DEVICE_TEMPLATES.find((t) => t.label === "TB (M) → RJ45 (F) Adapter");
    const recorder = DEVICE_TEMPLATES.find((t) => t.label === "BMD Video Assist 12G HDR 7in");
    expect(adapter).toBeDefined();
    expect(recorder).toBeDefined();
    expect(recorder!.id).toBe("c0a80101-00f8-4000-8000-000000000324");
    expect(adapter!.id).not.toBe(recorder!.id);
  });

  it("gives the adapter an id no other bundled template holds", () => {
    const adapter = DEVICE_TEMPLATES.find((t) => t.label === "TB (M) → RJ45 (F) Adapter")!;
    expect(idCounts().get(adapter.id!)).toEqual(["TB (M) → RJ45 (F) Adapter"]);
  });

  it("has no duplicate template ids beyond the audited backlog", () => {
    const duplicates = [...idCounts()]
      .filter(([, labels]) => labels.length > 1)
      .map(([id]) => id)
      .sort();
    expect(duplicates).toEqual([...KNOWN_COLLIDED_IDS].sort());
  });
});

describe("#339 — the 15 remaining bundled id collisions", () => {
  // For each collided id the *later* bundled template wins: seed.ts writes the
  // library in array order with INSERT OR REPLACE, so D1 holds the last one, and
  // effectiveTemplates() lets D1 shadow the bundle. Keeping the winner on the old
  // id is what stops saved schematics resolving to a different device than they
  // did before; the shadowed template is the one that moves.
  const RE_IDED = [
    { collidedId: "c0a80101-003d-4000-8000-000000000061", keeper: "PowerCON Distro", moved: "ATEM Mini", newId: "c0a80101-030e-4000-8000-000000000736" },
    { collidedId: "c0a80101-003e-4000-8000-000000000062", keeper: "PowerCON Thru Distro", moved: "ATEM Mini Pro", newId: "c0a80101-030f-4000-8000-000000000737" },
    { collidedId: "c0a80101-00ce-4000-8000-000000000206", keeper: "Panasonic RZ12K", moved: "USB-C (M) → USB-A (F) Adapter", newId: "c0a80101-0310-4000-8000-000000000738" },
    { collidedId: "c0a80101-00cf-4000-8000-000000000207", keeper: "D'San Perfect Cue", moved: "USB-C (M) → USB-B (F) Adapter", newId: "c0a80101-0311-4000-8000-000000000739" },
    { collidedId: "c0a80101-00d0-4000-8000-000000000208", keeper: "Brainstorm SR-112", moved: "mini-XLR (M) → XLR-3 (F) Adapter", newId: "c0a80101-0312-4000-8000-000000000740" },
    { collidedId: "c0a80101-00d1-4000-8000-000000000209", keeper: "MIDI Merge 4x2", moved: "IEC (M) → Edison (F) Adapter", newId: "c0a80101-0313-4000-8000-000000000741" },
    { collidedId: "c0a80101-00d2-4000-8000-000000000210", keeper: "MIDI Thru 1x4", moved: "IEC (M) → powerCON (F) Adapter", newId: "c0a80101-0314-4000-8000-000000000742" },
    { collidedId: "c0a80101-010c-4000-8000-000000000344", keeper: "Dataton WATCHPAX 64", moved: "Disguise VX 1", newId: "c0a80101-0315-4000-8000-000000000743" },
    { collidedId: "c0a80101-010d-4000-8000-000000000345", keeper: "Disguise VX 2", moved: "Novastar NovaPro UHD Jr", newId: "c0a80101-0316-4000-8000-000000000744" },
    { collidedId: "c0a80101-010e-4000-8000-000000000346", keeper: "Disguise VX 3", moved: "Brompton Tessera S8", newId: "c0a80101-0317-4000-8000-000000000745" },
    { collidedId: "c0a80101-010f-4000-8000-000000000347", keeper: "Disguise GX 1", moved: "Brompton Tessera R2+", newId: "c0a80101-0318-4000-8000-000000000746" },
    { collidedId: "c0a80101-0110-4000-8000-000000000348", keeper: "ETC Eos Apex", moved: "Disguise GX 2", newId: "c0a80101-0319-4000-8000-000000000747" },
    { collidedId: "c0a80101-0111-4000-8000-000000000349", keeper: "grandMA3 full-size", moved: "Disguise GX 2C", newId: "c0a80101-031a-4000-8000-000000000748" },
    { collidedId: "c0a80101-0112-4000-8000-000000000350", keeper: "grandMA3 compact XT", moved: "Disguise GX 3", newId: "c0a80101-031b-4000-8000-000000000749" },
    { collidedId: "c0a80101-0240-4000-8000-000000000721", keeper: "Wall Plate 1-Port Keystone", moved: "BMD Videohub 80x80 12G", newId: "c0a80101-031c-4000-8000-000000000750" },
  ];

  const byLabel = (label: string) =>
    [...DEVICE_TEMPLATES, ...CARD_TEMPLATES].find((t) => t.label === label);

  it.each(RE_IDED)("$collidedId now belongs to $keeper alone", ({ collidedId, keeper }) => {
    expect(byLabel(keeper)?.id).toBe(collidedId);
    expect(idCounts().get(collidedId)).toEqual([keeper]);
  });

  it.each(RE_IDED)("$moved moves to $newId", ({ moved, newId }) => {
    expect(byLabel(moved)?.id).toBe(newId);
    expect(idCounts().get(newId)).toEqual([moved]);
  });

  it("allocates the new ids above the previous high-water mark", () => {
    // Both halves of the id are running counters (see the #300 re-id): the last
    // one issued was c0a80101-030d-…-735, so 736+ was free in the bundle and in
    // live D1, where every non-bundled row is a random UUID.
    for (const { newId } of RE_IDED) {
      const [, mid, , , num] = newId.split("-");
      expect(parseInt(mid, 16)).toBeGreaterThan(0x030d);
      expect(parseInt(num, 10)).toBeGreaterThan(735);
    }
    expect(new Set(RE_IDED.map((r) => r.newId)).size).toBe(RE_IDED.length);
  });

  it("frees five adapters the connector matcher can now stamp correctly", () => {
    // Auto-insert reads the bundled library, so the matcher always saw these
    // five; what was broken is the templateId it stamped on the inserted device,
    // which resolved through D1 to a projector or a control device instead.
    const adapters = RE_IDED.filter(({ moved }) => byLabel(moved)?.deviceType === "adapter");
    expect(adapters.map((a) => a.moved)).toEqual([
      "USB-C (M) → USB-A (F) Adapter",
      "USB-C (M) → USB-B (F) Adapter",
      "mini-XLR (M) → XLR-3 (F) Adapter",
      "IEC (M) → Edison (F) Adapter",
      "IEC (M) → powerCON (F) Adapter",
    ]);
    for (const { moved, newId } of adapters) {
      const resolved = DEVICE_TEMPLATES.find((t) => t.id === newId);
      expect(resolved?.label).toBe(moved);
      expect(resolved?.deviceType).toBe("adapter");
    }
  });
});

// ALL_CATEGORIES as it stood at 97f9fc7, before the #315 mappings landed. Every
// new type had to reuse one of these — a 33rd entry means a bucket was invented.
const PRE_315_CATEGORIES = [
  "Amplifiers", "Audio", "Audio Expansion", "Audio I/O", "Cable Accessories",
  "Cloud Services", "Codecs", "Control", "Displays", "Distribution",
  "Expansion Cards", "Infrastructure", "Intercom", "KVM / Extenders", "LED Video",
  "Lighting", "Media Servers", "Microphones", "Mixing Consoles", "Monitoring",
  "Networking", "Peripherals", "Powered Mixers", "Processing", "Projection",
  "Recording", "Sources", "Speakers", "Storage", "Storage Media", "Switching",
  "Wireless",
];

describe("#315(a) — device types that were only ever free-typed into D1", () => {
  // The canonical slug for each concept the issue's group 3 covers.
  const NEWLY_MAPPED = [
    "siren",
    "door-strike",
    "magnetic-sensor",
    "v-lock",
    "turret-camera",
    "pir-sensor",
    "keypad",
    "dry-contact",
    "bus-power-supply",
    "24vdc-power-supply",
    "dali-power-supply-and-line-break",
    "ups",
    "hard-drive",
    "rf-to-ethernet-integrator",
    "subwoofer",
    "hdmi-extender",
    "audio-over-cat-extender",
    "audio-matrix",
    "streaming-decoder",
    "streaming-transceiver",
    "video-transceiver",
    "avoip-encoder",
    "avoip-decoder",
    "conferencing-bridge",
    "digital-signage-player",
  ];

  it.each(NEWLY_MAPPED)("maps %s to a category", (type) => {
    expect(DEVICE_TYPE_TO_CATEGORY[type]).toBeTruthy();
  });

  it("reuses existing categories rather than inventing new buckets", () => {
    // Every category the new types land in must already be in live use; the
    // counts come from https://api.easyschematic.live/templates/summary.
    const LIVE_CATEGORIES = new Set([
      "Monitoring",
      "Control",
      "Lighting",
      "Infrastructure",
      "Storage",
      "Networking",
      "Speakers",
      "KVM / Extenders",
      "Audio",
      "Media Servers",
    ]);
    for (const type of NEWLY_MAPPED) {
      expect(LIVE_CATEGORIES.has(DEVICE_TYPE_TO_CATEGORY[type])).toBe(true);
    }
    // ALL_CATEGORIES is derived from DEVICE_TYPE_TO_CATEGORY, so asserting the
    // new types appear in it can never fail. What can regress is the catalogue
    // growing a bucket, so pin the whole set to what it was before #315.
    expect(ALL_CATEGORIES).toEqual(PRE_315_CATEGORIES);
  });

  it("collapses the near-duplicate pairs instead of cementing the split", () => {
    expect(DEVICE_TYPE_ALIASES).toEqual({
      "pir-motion-sensor": "pir-sensor",
      "passive-subwoofer": "subwoofer",
      "AVoIP Encoder": "avoip-encoder",
    });
    for (const [alias, canonical] of Object.entries(DEVICE_TYPE_ALIASES)) {
      // The alias must stay unpickable, or the picker offers both spellings.
      expect(DEVICE_TYPE_TO_CATEGORY[alias]).toBeUndefined();
      expect(DEVICE_TYPE_TO_CATEGORY[canonical]).toBeTruthy();
    }
  });

  it("renders the new acronym-bearing slugs as AV labels, not Title Case mush", () => {
    expect(DEVICE_TYPE_LABELS["ups"]).toBe("UPS");
    expect(DEVICE_TYPE_LABELS["pir-sensor"]).toBe("PIR Sensor");
    expect(DEVICE_TYPE_LABELS["avoip-encoder"]).toBe("AVoIP Encoder");
    expect(DEVICE_TYPE_LABELS["24vdc-power-supply"]).toBe("24VDC Power Supply");
    expect(DEVICE_TYPE_LABELS["rf-to-ethernet-integrator"]).toBe("RF To Ethernet Integrator");
    expect(DEVICE_TYPE_LABELS["dali-power-supply-and-line-break"]).toBe("DALI Power Supply And Line Break");
    expect(DEVICE_TYPE_LABELS["hdmi-extender"]).toBe("HDMI Extender");
  });
});

describe("#343 — orphan-type sweep (power-supply, fog-machine, camera-tracker)", () => {
  const NEWLY_MAPPED_343 = ["power-supply", "fog-machine", "camera-tracker"];

  it.each(NEWLY_MAPPED_343)("maps %s to a category", (type) => {
    expect(DEVICE_TYPE_TO_CATEGORY[type]).toBeTruthy();
  });

  it("reuses existing categories rather than inventing new buckets", () => {
    expect(DEVICE_TYPE_TO_CATEGORY["power-supply"]).toBe("Infrastructure");
    expect(DEVICE_TYPE_TO_CATEGORY["fog-machine"]).toBe("Lighting");
    expect(DEVICE_TYPE_TO_CATEGORY["camera-tracker"]).toBe("Sources");
    // All three land in categories already live before #343, so the pinned
    // #315 category set (still the full catalogue) does not grow.
    expect(ALL_CATEGORIES).toEqual(PRE_315_CATEGORIES);
  });

  it("does not collide with the scope-specific power-supply slugs already mapped", () => {
    // The generic power-supply slug must not overwrite the Control4/security-bus
    // and DALI-specific supplies it was deliberately kept separate from.
    expect(DEVICE_TYPE_TO_CATEGORY["24vdc-power-supply"]).toBe("Control");
    expect(DEVICE_TYPE_TO_CATEGORY["bus-power-supply"]).toBe("Control");
    expect(DEVICE_TYPE_TO_CATEGORY["dali-power-supply-and-line-break"]).toBe("Lighting");
  });

  it("renders the new slugs as AV labels, not Title Case mush", () => {
    expect(DEVICE_TYPE_LABELS["power-supply"]).toBe("Power Supply");
    expect(DEVICE_TYPE_LABELS["fog-machine"]).toBe("Fog Machine");
    expect(DEVICE_TYPE_LABELS["camera-tracker"]).toBe("Camera Tracker");
  });

  it("does not let any DEVICE_TYPE_ALIASES key resolve as a canonical type", () => {
    // Regression guard: #343 must not re-offer pir-motion-sensor,
    // passive-subwoofer, or "AVoIP Encoder" in the picker.
    for (const alias of Object.keys(DEVICE_TYPE_ALIASES)) {
      expect(DEVICE_TYPE_TO_CATEGORY[alias]).toBeUndefined();
    }
  });
});

describe("#315(b) — approval refuses unmapped device types", () => {
  it("accepts a mapped type", () => {
    expect(checkDeviceTypeMapped("streaming-decoder")).toBeNull();
    expect(checkDeviceTypeMapped("network-switch")).toBeNull();
  });

  it("rejects a free-typed slug and points at the Types page", () => {
    // "Camera Tracker" is one of the real orphans this gate exists to stop.
    const err = checkDeviceTypeMapped("Camera Tracker");
    expect(err).toContain("Camera Tracker");
    expect(err).toContain("/admin/types");
  });

  it("rejects the folded aliases and names the spelling that won", () => {
    expect(checkDeviceTypeMapped("pir-motion-sensor")).toContain('"pir-sensor"');
    expect(checkDeviceTypeMapped("passive-subwoofer")).toContain('"subwoofer"');
    expect(checkDeviceTypeMapped("AVoIP Encoder")).toContain('"avoip-encoder"');
  });

  it("rejects missing and non-string values", () => {
    expect(checkDeviceTypeMapped(undefined)).not.toBeNull();
    expect(checkDeviceTypeMapped(null)).not.toBeNull();
    expect(checkDeviceTypeMapped(42)).not.toBeNull();
    expect(checkDeviceTypeMapped("")).not.toBeNull();
  });

  it("does not let Object.prototype keys pass as mapped types", () => {
    expect(checkDeviceTypeMapped("toString")).not.toBeNull();
    expect(checkDeviceTypeMapped("constructor")).not.toBeNull();
  });
});

describe("#315(b) — the gate blocks new orphans without blocking repairs", () => {
  // "Power Amplifier" is one of the 101 unmapped types already live in D1,
  // spread across 9 templates. Corrections to those must stay approvable.
  it("lets an update through when it leaves the unmapped type alone", () => {
    expect(checkApprovalDeviceType("update", "Power Amplifier", "Power Amplifier")).toBeNull();
  });

  it("still blocks an update that changes the type to an unmapped one", () => {
    expect(checkApprovalDeviceType("update", "Camera Tracker", "network-switch")).not.toBeNull();
  });

  it("blocks a create with an unmapped type even when nothing changed", () => {
    expect(checkApprovalDeviceType("create", "Power Amplifier", null)).not.toBeNull();
  });

  it("lets an update onto a mapped type through", () => {
    expect(checkApprovalDeviceType("update", "amplifier", "Power Amplifier")).toBeNull();
  });

  it("lets a create with a mapped type through", () => {
    expect(checkApprovalDeviceType("create", "streaming-decoder", null)).toBeNull();
  });
});

describe("#315(b) — the refusal actually reaches the moderator", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function respondWith(body: string, status: number, contentType = "application/json") {
    globalThis.fetch = (async () =>
      new Response(body, { status, headers: { "Content-Type": contentType } })) as typeof fetch;
  }

  it("surfaces the guard's message instead of a bare status code", async () => {
    respondWith(JSON.stringify({ error: checkDeviceTypeMapped("Camera Tracker") }), 400);
    await expect(approveSubmission("sub-1")).rejects.toThrow("/admin/types");
  });

  it("falls back to the status when the body carries no error text", async () => {
    respondWith("<html>gateway timeout</html>", 504, "text/html");
    await expect(approveSubmission("sub-1")).rejects.toThrow("Failed to approve: 504");
  });

  it("resolves on success", async () => {
    respondWith(JSON.stringify({ ok: true }), 200);
    await expect(approveSubmission("sub-1")).resolves.toBeUndefined();
  });
});

describe("stray compiled .js beside the TypeScript sources", () => {
  // Vite and esbuild resolve .js before .ts, so a stale `tsc` emit next to a
  // source file silently overrides it — a checkout carrying src/deviceTypeCategories.js
  // loads the pre-#315 map in `npm run dev`, the devices site and `wrangler dev`
  // while CI stays green, because .gitignore hides the file. Fail loudly instead.
  it("does not exist in any of the three source trees .gitignore guards", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const strays: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js")) strays.push(relative(root, full));
      }
    };
    for (const tree of ["src", "devices/src", "docs/src"]) walk(join(root, tree));
    expect(strays, "Stale tsc emit shadowing a .ts source — delete these files").toEqual([]);
  });
});

describe("#315 — CSV/JSON import points at the canonical spelling too", () => {
  function templateWith(deviceType: string) {
    return {
      label: "Triad SlimSub Bronze-4",
      deviceType,
      manufacturer: "Triad",
      modelNumber: "SLIMSUB-BRONZE-4",
      ports: [],
    };
  }

  it("names the winning slug for a known alias", () => {
    const errors = validateTemplate(templateWith("passive-subwoofer")).errors.join(" ");
    expect(errors).toContain('use "subwoofer"');
  });

  it("leaves the plain unknown-type error alone", () => {
    const errors = validateTemplate(templateWith("Camera Tracker")).errors.join(" ");
    expect(errors).toContain('Unknown deviceType "Camera Tracker"');
    expect(errors).not.toContain("use \"");
  });
});

describe("#345 — carriesPowerCapacity", () => {
  it("accepts exactly the three types that state an output wattage", () => {
    expect([...POWER_CAPACITY_DEVICE_TYPES].sort()).toEqual([
      "company-switch",
      "power-distribution",
      "power-supply",
    ]);
    for (const type of POWER_CAPACITY_DEVICE_TYPES) expect(carriesPowerCapacity(type)).toBe(true);
  });

  it("rejects the scope-specific supplies a substring test used to sweep in", () => {
    // These three are deliberately separate types (#343) that distribute no
    // wattage of their own; giving them a capacity produced spurious rows in
    // the power report's distribution loading table.
    expect(carriesPowerCapacity("bus-power-supply")).toBe(false);
    expect(carriesPowerCapacity("24vdc-power-supply")).toBe(false);
    expect(carriesPowerCapacity("dali-power-supply-and-line-break")).toBe(false);
  });

  it("rejects unrelated types, blanks, and undefined", () => {
    expect(carriesPowerCapacity("power-mixer")).toBe(false);
    expect(carriesPowerCapacity("converter")).toBe(false);
    expect(carriesPowerCapacity("")).toBe(false);
    expect(carriesPowerCapacity(undefined)).toBe(false);
  });

  it("every accepted type is a canonical device type", () => {
    for (const type of POWER_CAPACITY_DEVICE_TYPES) {
      expect(DEVICE_TYPE_TO_CATEGORY[type]).toBeTruthy();
    }
  });
});
