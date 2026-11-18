/**
 * Converting between a placed device's installed slots (`InstalledSlot[]`, keyed `slotId`, with
 * nested slots flattened to `parent/child` path ids) and a template's slot blueprint
 * (`SlotDefinition[]`, keyed `id`).
 *
 * A template's `slots` lists the chassis' own slots. A user template saved from a placed device
 * can also carry NESTED-SLOT OVERRIDES: entries marked `nestedOverride` whose id is a
 * `parent/child` path into a slot the parent's card brings with it, recording which card (if
 * any) sat in that sub-slot when it was saved. Those are not extra chassis slots — every walker
 * over a template's slots must split them off with `splitSlotOverrides` and apply them where the
 * path comes up (#422). Templates saved by older builds wrote the same entries unmarked.
 *
 * Because "/" means a sub-slot path, user-authored slot ids never keep one: JSON import swaps it
 * for "-" (`sanitizeSlotId`), submissions are repaired the same way, and the API rejects it.
 *
 * Pure (no store, no fetch) so the devices site can import it too.
 */

import type { InstalledSlot, Port, SlotDefinition } from "./types";

/** A user-authored slot id with any "/" (the sub-slot path separator) replaced by "-". */
export function sanitizeSlotId(id: string): string {
  return id.replace(/\//g, "-");
}

/**
 * Split a template's slot list into the chassis' own slots and the nested-slot overrides.
 * An entry is an override when it is marked `nestedOverride`, or — the unmarked shape older
 * builds saved — when its id is a path whose first segment is another slot's id.
 */
export function splitSlotOverrides(slots: SlotDefinition[] | undefined): {
  topLevel: SlotDefinition[];
  overrides: Map<string, SlotDefinition>;
} {
  const topLevel: SlotDefinition[] = [];
  const overrides = new Map<string, SlotDefinition>();
  if (!slots) return { topLevel, overrides };
  const ids = new Set(slots.map((s) => s.id));
  for (const s of slots) {
    const cut = typeof s.id === "string" ? s.id.indexOf("/") : -1;
    if (s.nestedOverride === true || (cut > 0 && ids.has(s.id.slice(0, cut)))) {
      if (!overrides.has(s.id)) overrides.set(s.id, s);
    } else {
      topLevel.push(s);
    }
  }
  return { topLevel, overrides };
}

/**
 * The effective definition of a slot at `fullId` — the card's own definition, with a saved
 * override (if any) replacing its default card, label and empty-slot visibility. An override
 * without a `defaultCardId` means the sub-slot was empty when the template was saved.
 */
export function applySlotOverride(
  def: SlotDefinition,
  fullId: string,
  overrides: ReadonlyMap<string, SlotDefinition> | undefined,
): SlotDefinition {
  const o = overrides?.get(fullId);
  if (!o) return def;
  const { defaultCardId: _drop, ...rest } = def;
  void _drop;
  return {
    ...rest,
    label: o.label?.trim() ? o.label : def.label,
    ...(o.defaultCardId ? { defaultCardId: o.defaultCardId } : {}),
    ...(o.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
  };
}

/** Count of a template's chassis slots, not counting nested-slot overrides. */
export function topLevelSlotCount(slots: SlotDefinition[] | undefined): number {
  return splitSlotOverrides(slots).topLevel.length;
}

/** Ids of every port a device's installed cards brought with them (the card's, not the chassis'). */
export function slotOwnedPortIds(slots: InstalledSlot[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const s of slots ?? []) for (const pid of s.portIds ?? []) ids.add(pid);
  return ids;
}

function toDefinition(s: InstalledSlot, keepCard: (cardId: string) => boolean): SlotDefinition {
  return {
    id: s.slotId,
    label: s.label,
    slotFamily: s.slotFamily ?? "",
    ...(s.cardTemplateId && keepCard(s.cardTemplateId) ? { defaultCardId: s.cardTemplateId } : {}),
    ...(s.hideWhenEmpty ? { hideWhenEmpty: true } : {}),
    ...(s.parentSlotId ? { nestedOverride: true } : {}),
  };
}

/**
 * Turn a placed device's installed slots back into a template's slot blueprint.
 *
 * Top-level slots become the template's slots, with the installed card as the default card.
 * With `includeNested`, each nested slot (one a card brought along) is written as a
 * `parent/child` override entry recording its card, so the saved template re-installs exactly
 * what was there; without it nested slots are left out — the parent card's own definition
 * re-creates them. `keepCard` decides whether an installed card may become a default
 * (e.g. a community submission can't reference a card that only exists in your library).
 */
export function installedSlotsToDefinitions(
  slots: InstalledSlot[] | undefined,
  opts: { includeNested?: boolean; keepCard?: (cardId: string) => boolean } = {},
): SlotDefinition[] {
  const keepCard = opts.keepCard ?? (() => true);
  const out: SlotDefinition[] = [];
  for (const s of slots ?? []) {
    if (s.parentSlotId && !opts.includeNested) continue;
    out.push(toDefinition(s, keepCard));
  }
  return out;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Repair a slot list headed for the community API so every slot has a string id that is unique
 * within the template, a label and a string slot family — and nothing else. Accepts the
 * installed-slot shape too (`slotId`, `portIds`, …) that older device-editor drafts carried
 * (#427): its nested slots (`parentSlotId`) are dropped, since the card brings those itself.
 * Nested-slot overrides from a user template are dropped too — they describe one user's
 * configuration, not the hardware — and a "/" left in any id becomes "-".
 *
 * Ids are kept when present and unique; a missing one is derived from the slot's position
 * (`slot-1`, `slot-2`, …), so repairing the same list twice gives the same ids. A missing
 * slot family is left blank for the validator to report against the slot by name.
 */
export function repairSlotDefinitions(raw: unknown): SlotDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const objects = raw.filter(
    (s): s is Record<string, unknown> =>
      !!s && typeof s === "object" && !str((s as Record<string, unknown>).parentSlotId),
  );
  // Drop nested-slot overrides (marked, or the unmarked shape older builds saved).
  const idOf = (s: Record<string, unknown>) => str(s.id) ?? str(s.slotId);
  const { overrides } = splitSlotOverrides(
    objects.map((s) => ({ id: idOf(s) ?? "", nestedOverride: s.nestedOverride === true }) as SlotDefinition),
  );
  const kept = objects.filter((s) => {
    const id = idOf(s);
    return s.nestedOverride !== true && !(id && overrides.has(id));
  });
  const used = new Set<string>();
  // Claim the ids that are already good first, so a generated id never steals one.
  const given = kept.map((s) => {
    const id = idOf(s);
    return id ? sanitizeSlotId(id) : undefined;
  });
  const claimed = given.map((id) => {
    if (!id || used.has(id)) return undefined;
    used.add(id);
    return id;
  });
  const out = kept.map((s, i): SlotDefinition => {
    let id = claimed[i];
    if (!id) {
      const base = given[i] ?? `slot-${i + 1}`;
      id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
    }
    const defaultCardId = str(s.defaultCardId);
    return {
      id,
      label: str(s.label) ?? `Slot ${i + 1}`,
      slotFamily: typeof s.slotFamily === "string" ? s.slotFamily : "",
      ...(defaultCardId ? { defaultCardId } : {}),
      ...(s.hideWhenEmpty === true ? { hideWhenEmpty: true } : {}),
    };
  });
  return out;
}

/** `data` with its `slots` (if any) put through `repairSlotDefinitions`. */
export function withRepairedSlots<T extends object>(data: T): T {
  const slots = (data as { slots?: unknown }).slots;
  if (slots == null) return data;
  const repaired = repairSlotDefinitions(slots);
  return { ...data, slots: repaired && repaired.length > 0 ? repaired : undefined };
}

/** What a card port and a copy of it baked into a chassis' own port list have in common. */
function bakedKey(p: Port): string | undefined {
  const section = p.section?.trim();
  if (!section) return undefined;
  return [section, (p.label ?? "").trim(), p.signalType, p.connectorType ?? "", p.direction].join("\u0000");
}

/**
 * Find the chassis ports that are copies of ports an installed card just brought.
 *
 * Templates saved by older builds (and presets saved from a fitted chassis) kept every installed
 * card's ports in their own port list, sectioned under the slot. When the card installs again on
 * placement those copies would show every card port twice (#422). A chassis port is a copy when
 * it matches a card port on section (the slot's label), label, signal, connector and direction;
 * matches are one-for-one, so a chassis can only lose as many ports as the card brings. A card
 * that doesn't resolve installs nothing, so its copies are kept and the ports don't vanish.
 *
 * Returns the chassis ports to keep, and the card port that replaces each dropped copy (keyed by
 * the copy's id) so references to it — hidden ports, connection remaps — can follow.
 */
export function dropBakedCardPorts<T extends Port>(
  chassisPorts: T[],
  cardPorts: Port[],
): { kept: T[]; replacedBy: Map<string, Port> } {
  const replacedBy = new Map<string, Port>();
  if (cardPorts.length === 0) return { kept: chassisPorts, replacedBy };
  const pool = new Map<string, Port[]>();
  for (const cp of cardPorts) {
    const k = bakedKey(cp);
    if (!k) continue;
    const list = pool.get(k);
    if (list) list.push(cp); else pool.set(k, [cp]);
  }
  const kept: T[] = [];
  for (const p of chassisPorts) {
    const k = bakedKey(p);
    const match = k ? pool.get(k)?.shift() : undefined;
    if (match) replacedBy.set(p.id, match);
    else kept.push(p);
  }
  return { kept, replacedBy };
}
