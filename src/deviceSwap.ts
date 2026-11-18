import type {
  ConnectionEdge,
  ConnectorType,
  DeviceData,
  DeviceTemplate,
  Port,
  PortDirection,
  SignalType,
  SlotDefinition,
} from "./types";
import { getCardsByFamily, getTemplateById } from "./templateApi";
import { applySlotOverride, dropBakedCardPorts, splitSlotOverrides } from "./slotDefinitions";

export type HandleSuffix = "" | "-in" | "-out" | "-rear" | "-front";

export type MatchSource =
  | "templatePortId"
  | "label"
  | "signal+connector+dir"
  | "signal+dir"
  | "carried-card"
  | "auto-installed-card"
  | "manual"
  | "none";

export type PortConflict =
  | { kind: "directionMismatch"; old: PortDirection; nw: PortDirection }
  | { kind: "signalMismatch"; old: SignalType; nw: SignalType }
  | { kind: "connectorMismatch"; old: ConnectorType | undefined; nw: ConnectorType | undefined }
  | { kind: "capacityExceeded" };

/** Stable reference to a port on the new device — resolved by the store at apply time. */
export type NewPortRef =
  | { kind: "base"; templatePortId: string }
  | { kind: "card"; slotId: string; cardTemplatePortId: string };

export interface PortMapping {
  oldPort: Port;                       // the port that owns oldHandle
  oldHandle: string;                   // exact React Flow handle id (with suffix)
  oldHandleSuffix: HandleSuffix;
  oldEndpoint: "source" | "target";    // which end of each edge equals the device
  edges: ConnectionEdge[];             // edges currently using this exact handle
  newPortRef: NewPortRef | null;       // null = drop these edges
  newPortPreview: Port | null;         // hydrated for UI display only
  conflict: PortConflict | null;
  matchSource: MatchSource;
}

export interface AutoInstalledCard {
  slotId: string;                      // new-template slot id (full path for nested)
  slotLabel: string;
  slotFamily: string;
  cardTemplateId: string;
  cardLabel: string;
  source: "carried-over" | "auto-installed";
  /** UI checkbox enables/disables. Defaults true on creation. */
  enabled: boolean;
  /** Old-port handles whose edges this card currently satisfies (for the dialog summary). */
  satisfiedHandles: string[];
}

export interface FactualChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface SwapPlan {
  oldNodeId: string;
  newTemplate: DeviceTemplate;
  /** Extra templates the planner is allowed to consult (e.g. customTemplates). */
  customTemplates: DeviceTemplate[];
  mappings: PortMapping[];
  /** Cards installed in the new device — carry-overs and auto-installs together. */
  installedCards: AutoInstalledCard[];
  /** Old-device installed cards that couldn't be carried over. */
  cardsLost: { slotLabel: string; cardLabel: string }[];
  factualChanges: FactualChange[];
  /** Cached pool of new ports (base + enabled-card ports) for the UI dropdowns. */
  newPortPool: Port[];
}

const FACTUAL_FIELDS = [
  "manufacturer",
  "modelNumber",
  "model",
  "heightMm",
  "widthMm",
  "depthMm",
  "weightKg",
  "powerDrawW",
  "powerCapacityW",
  "voltage",
  "thermalBtuh",
  "poeBudgetW",
  "poeDrawW",
  "unitCost",
  "isCableAccessory",
  "integratedWithCable",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Handle parsing — mirrors store.ts:getPortFromHandle so we stay in lockstep.
// ─────────────────────────────────────────────────────────────────────────────

function parseHandle(handle: string): { basePortId: string; suffix: HandleSuffix } {
  const m = handle.match(/^(.*)-(in|out|rear|front)$/);
  if (m) return { basePortId: m[1], suffix: `-${m[2]}` as HandleSuffix };
  return { basePortId: handle, suffix: "" };
}

function suffixesForDirection(dir: PortDirection): HandleSuffix[] {
  if (dir === "bidirectional") return ["-in", "-out"];
  if (dir === "passthrough") return ["-rear", "-front"];
  return [""];
}

/** Choose the best handle on a new port for an old handle suffix. Returns null if no sensible mapping. */
export function chooseNewHandleSuffix(oldSuffix: HandleSuffix, newDir: PortDirection): HandleSuffix | null {
  const newSuffixes = suffixesForDirection(newDir);
  if (newSuffixes.includes(oldSuffix)) return oldSuffix;
  // Cross-direction translation: best-effort
  if (oldSuffix === "-in" || oldSuffix === "-out") {
    if (newDir === "input" || newDir === "output") return "";
    if (newDir === "passthrough") return oldSuffix === "-in" ? "-rear" : "-front";
  }
  if (oldSuffix === "-rear" || oldSuffix === "-front") {
    if (newDir === "input" || newDir === "output") return "";
    if (newDir === "bidirectional") return oldSuffix === "-rear" ? "-in" : "-out";
  }
  if (oldSuffix === "") {
    if (newDir === "bidirectional") return "-in"; // arbitrary; user can remap
    if (newDir === "passthrough") return "-rear";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic port IDs for the planner. Real IDs are assigned by the store at
// apply time; here we just need stable references for the UI and re-matching.
// ─────────────────────────────────────────────────────────────────────────────

function basePortId(templatePortId: string): string {
  return `base:${templatePortId}`;
}

function cardPortId(slotId: string, cardTemplatePortId: string): string {
  return `card:${slotId}:${cardTemplatePortId}`;
}

function refForPort(p: Port): NewPortRef {
  if (p.id.startsWith("card:")) {
    const rest = p.id.slice("card:".length);
    const idx = rest.lastIndexOf(":");
    return { kind: "card", slotId: rest.slice(0, idx), cardTemplatePortId: rest.slice(idx + 1) };
  }
  // "base:<templatePortId>"
  return { kind: "base", templatePortId: p.id.slice("base:".length) };
}

function hydrateBasePorts(template: DeviceTemplate): Port[] {
  return template.ports.map((p) => ({
    ...p,
    id: basePortId(p.id),
    templatePortId: p.id,
  }));
}

function hydrateCardPorts(cardTemplate: DeviceTemplate, slotId: string, slotLabel: string): Port[] {
  return cardTemplate.ports.map((p) => ({
    ...p,
    id: cardPortId(slotId, p.id),
    section: slotLabel,
    templatePortId: p.id,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot walker — flattens nested slot definitions to a path-id list so the
// auto-installer can address them.
// ─────────────────────────────────────────────────────────────────────────────

interface FlatSlot {
  slotId: string;       // full path id ("parent/child")
  slotLabel: string;    // full display label ("Parent > Child")
  slotFamily: string;
  defaultCardId?: string;
}

function flattenSlots(
  slots: SlotDefinition[] | undefined,
  customTemplates: DeviceTemplate[],
  parentId?: string,
  parentLabel?: string,
  inheritedOverrides?: ReadonlyMap<string, SlotDefinition>,
): FlatSlot[] {
  if (!slots) return [];
  // A user template's nested-slot overrides (`parent/child` ids) apply where the walk reaches
  // that path; they are not extra top-level slots (#422).
  let defs = slots;
  let overrides = inheritedOverrides;
  if (!parentId) ({ topLevel: defs, overrides } = splitSlotOverrides(slots));
  const out: FlatSlot[] = [];
  for (const raw of defs) {
    const fullId = parentId ? `${parentId}/${raw.id}` : raw.id;
    const s = parentId ? applySlotOverride(raw, fullId, overrides) : raw;
    const fullLabel = parentLabel ? `${parentLabel} > ${s.label}` : s.label;
    out.push({ slotId: fullId, slotLabel: fullLabel, slotFamily: s.slotFamily, defaultCardId: s.defaultCardId });
    // Recurse into the default card's sub-slots (one level — matches store.ts:processTemplateSlots).
    if (s.defaultCardId) {
      const card = getTemplateById(s.defaultCardId, customTemplates);
      if (card?.slots) out.push(...flattenSlots(card.slots, customTemplates, fullId, fullLabel, overrides));
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching passes
// ─────────────────────────────────────────────────────────────────────────────

interface HandleEntry {
  oldPort: Port;
  oldHandle: string;
  oldHandleSuffix: HandleSuffix;
  oldEndpoint: "source" | "target";
  edges: ConnectionEdge[];
}

function collectHandles(oldDevice: DeviceData, oldNodeId: string, edges: ConnectionEdge[]): HandleEntry[] {
  const byKey = new Map<string, HandleEntry>();
  const portsById = new Map(oldDevice.ports.map((p) => [p.id, p]));

  function addEdge(edge: ConnectionEdge, endpoint: "source" | "target", handle: string | null | undefined) {
    if (!handle) return;
    const { basePortId } = parseHandle(handle);
    const port = portsById.get(basePortId);
    if (!port) return; // orphan handle; nothing to map
    const { suffix } = parseHandle(handle);
    const key = `${handle}|${endpoint}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        oldPort: port,
        oldHandle: handle,
        oldHandleSuffix: suffix,
        oldEndpoint: endpoint,
        edges: [],
      };
      byKey.set(key, entry);
    }
    entry.edges.push(edge);
  }

  for (const e of edges) {
    if (e.source === oldNodeId) addEdge(e, "source", e.sourceHandle);
    if (e.target === oldNodeId) addEdge(e, "target", e.targetHandle);
  }

  return [...byKey.values()];
}

function computeConflict(entry: HandleEntry, candidate: Port): PortConflict | null {
  if (entry.oldPort.direction !== candidate.direction) {
    return { kind: "directionMismatch", old: entry.oldPort.direction, nw: candidate.direction };
  }
  if (entry.oldPort.signalType !== candidate.signalType) {
    return { kind: "signalMismatch", old: entry.oldPort.signalType, nw: candidate.signalType };
  }
  if (entry.oldPort.connectorType && candidate.connectorType && entry.oldPort.connectorType !== candidate.connectorType) {
    return { kind: "connectorMismatch", old: entry.oldPort.connectorType, nw: candidate.connectorType };
  }
  if (entry.edges.length > 1 && !candidate.multiConnect && entry.oldEndpoint === "target") {
    return { kind: "capacityExceeded" };
  }
  return null;
}

function findMatch(
  entry: HandleEntry,
  pool: Port[],
  claimed: Set<string>,
  pass: "templatePortId" | "label" | "signal+connector+dir" | "signal+dir",
): { port: Port; conflict: PortConflict | null } | null {
  for (const candidate of pool) {
    if (claimed.has(candidate.id)) continue;
    // Auto-suggester never crosses directions (user can override manually).
    if (chooseNewHandleSuffix(entry.oldHandleSuffix, candidate.direction) === null) continue;

    if (pass === "templatePortId") {
      if (!entry.oldPort.templatePortId || candidate.templatePortId !== entry.oldPort.templatePortId) continue;
    } else if (pass === "label") {
      if (entry.oldPort.label.trim().toLowerCase() !== candidate.label.trim().toLowerCase()) continue;
      if (entry.oldPort.direction !== candidate.direction) continue;
    } else if (pass === "signal+connector+dir") {
      if (entry.oldPort.signalType !== candidate.signalType) continue;
      if (entry.oldPort.direction !== candidate.direction) continue;
      if (entry.oldPort.connectorType !== candidate.connectorType) continue;
    } else if (pass === "signal+dir") {
      if (entry.oldPort.signalType !== candidate.signalType) continue;
      if (entry.oldPort.direction !== candidate.direction) continue;
    }

    return { port: candidate, conflict: computeConflict(entry, candidate) };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card carry-over + auto-install
// ─────────────────────────────────────────────────────────────────────────────

interface AvailableSlot {
  slot: FlatSlot;
  occupiedBy: AutoInstalledCard | null; // null = empty
}

function buildSlots(newTemplate: DeviceTemplate, customTemplates: DeviceTemplate[]): AvailableSlot[] {
  return flattenSlots(newTemplate.slots, customTemplates).map((s) => ({ slot: s, occupiedBy: null }));
}

function carryOverCards(
  oldDevice: DeviceData,
  slots: AvailableSlot[],
  customTemplates: DeviceTemplate[],
): { cards: AutoInstalledCard[]; lost: { slotLabel: string; cardLabel: string }[] } {
  const cards: AutoInstalledCard[] = [];
  const lost: { slotLabel: string; cardLabel: string }[] = [];
  for (const oldSlot of oldDevice.slots ?? []) {
    if (!oldSlot.cardTemplateId) continue;
    const target = slots.find((s) => !s.occupiedBy && s.slot.slotFamily === oldSlot.slotFamily);
    if (!target) {
      lost.push({ slotLabel: oldSlot.label, cardLabel: oldSlot.cardLabel ?? "(unknown card)" });
      continue;
    }
    const cardTpl = getTemplateById(oldSlot.cardTemplateId, customTemplates);
    if (!cardTpl) {
      lost.push({ slotLabel: oldSlot.label, cardLabel: oldSlot.cardLabel ?? "(unknown card)" });
      continue;
    }
    const card: AutoInstalledCard = {
      slotId: target.slot.slotId,
      slotLabel: target.slot.slotLabel,
      slotFamily: target.slot.slotFamily,
      cardTemplateId: oldSlot.cardTemplateId,
      cardLabel: cardTpl.label,
      source: "carried-over",
      enabled: true,
      satisfiedHandles: [],
    };
    target.occupiedBy = card;
    cards.push(card);
  }
  return { cards, lost };
}

/** Score how many unmapped handles a given card would satisfy if installed in the given slot. */
function scoreCardCandidate(
  cardTemplate: DeviceTemplate,
  slot: FlatSlot,
  unmappedEntries: HandleEntry[],
): { score: number; satisfiedHandles: string[] } {
  const ports = hydrateCardPorts(cardTemplate, slot.slotId, slot.slotLabel);
  const claimed = new Set<string>();
  const satisfied: string[] = [];
  // Greedy: try each pass against the card's ports.
  for (const pass of ["templatePortId", "label", "signal+connector+dir", "signal+dir"] as const) {
    for (const entry of unmappedEntries) {
      if (satisfied.includes(entry.oldHandle + "|" + entry.oldEndpoint)) continue;
      const m = findMatch(entry, ports, claimed, pass);
      if (m) {
        claimed.add(m.port.id);
        satisfied.push(entry.oldHandle + "|" + entry.oldEndpoint);
      }
    }
  }
  return { score: satisfied.length, satisfiedHandles: satisfied };
}

function autoInstallCards(
  slots: AvailableSlot[],
  unmappedEntries: HandleEntry[],
  customTemplates: DeviceTemplate[],
): AutoInstalledCard[] {
  const installed: AutoInstalledCard[] = [];
  // Loop: pick the (slot, card) with highest score; install; recompute unmapped; repeat.
  // Each iteration consumes at least one slot AND at least one unmapped entry, so the
  // loop is bounded by min(slots.length, unmappedEntries.length).
  while (true) {
    const emptySlots = slots.filter((s) => !s.occupiedBy);
    if (emptySlots.length === 0) break;
    if (unmappedEntries.length === 0) break;

    let best: { slot: AvailableSlot; card: DeviceTemplate; score: number; satisfiedHandles: string[] } | null = null;
    for (const slot of emptySlots) {
      const candidates = getCardsByFamily(slot.slot.slotFamily, customTemplates);
      for (const card of candidates) {
        const { score, satisfiedHandles } = scoreCardCandidate(card, slot.slot, unmappedEntries);
        if (score === 0) continue;
        if (!best || score > best.score) {
          best = { slot, card, score, satisfiedHandles };
        }
      }
    }
    if (!best) break; // no card helps anymore

    const installedCard: AutoInstalledCard = {
      slotId: best.slot.slot.slotId,
      slotLabel: best.slot.slot.slotLabel,
      slotFamily: best.slot.slot.slotFamily,
      cardTemplateId: best.card.id ?? best.card.deviceType,
      cardLabel: best.card.label,
      source: "auto-installed",
      enabled: true,
      satisfiedHandles: best.satisfiedHandles,
    };
    best.slot.occupiedBy = installedCard;
    installed.push(installedCard);

    // Remove satisfied entries from unmapped pool.
    const satisfiedKeys = new Set(best.satisfiedHandles);
    unmappedEntries = unmappedEntries.filter(
      (e) => !satisfiedKeys.has(e.oldHandle + "|" + e.oldEndpoint),
    );
  }
  return installed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool assembly + final match
// ─────────────────────────────────────────────────────────────────────────────

function assemblePool(
  newTemplate: DeviceTemplate,
  installedCards: AutoInstalledCard[],
  customTemplates: DeviceTemplate[],
): Port[] {
  const cardPorts: Port[] = [];
  for (const card of installedCards) {
    if (!card.enabled) continue;
    const tpl = getTemplateById(card.cardTemplateId, customTemplates);
    if (!tpl) continue;
    cardPorts.push(...hydrateCardPorts(tpl, card.slotId, card.slotLabel));
  }
  // A template saved by an older build lists its installed cards' ports as its own too; the
  // card's ports win, so the pool offers each port once (#422).
  return [...dropBakedCardPorts(hydrateBasePorts(newTemplate), cardPorts).kept, ...cardPorts];
}

function finalizeMappings(
  entries: HandleEntry[],
  pool: Port[],
  installedCards: AutoInstalledCard[],
): PortMapping[] {
  const claimed = new Set<string>();
  const cardsBySatisfiedHandle = new Map<string, AutoInstalledCard>();
  for (const card of installedCards) {
    for (const h of card.satisfiedHandles) cardsBySatisfiedHandle.set(h, card);
  }

  // Pass per match-source priority. Each pass tries every unmapped entry.
  const result: (PortMapping | null)[] = entries.map(() => null);

  const passes: Array<{
    source: MatchSource;
    pass: "templatePortId" | "label" | "signal+connector+dir" | "signal+dir";
  }> = [
    { source: "templatePortId", pass: "templatePortId" },
    { source: "label", pass: "label" },
    { source: "signal+connector+dir", pass: "signal+connector+dir" },
    { source: "signal+dir", pass: "signal+dir" },
  ];

  for (const { source, pass } of passes) {
    entries.forEach((entry, i) => {
      if (result[i]) return;
      const m = findMatch(entry, pool, claimed, pass);
      if (!m) return;
      claimed.add(m.port.id);
      const handleKey = entry.oldHandle + "|" + entry.oldEndpoint;
      const card = cardsBySatisfiedHandle.get(handleKey);
      result[i] = {
        oldPort: entry.oldPort,
        oldHandle: entry.oldHandle,
        oldHandleSuffix: entry.oldHandleSuffix,
        oldEndpoint: entry.oldEndpoint,
        edges: entry.edges,
        newPortRef: refForPort(m.port),
        newPortPreview: m.port,
        conflict: m.conflict,
        matchSource: card?.source === "carried-over" ? "carried-card"
          : card?.source === "auto-installed" ? "auto-installed-card"
          : source,
      };
    });
  }

  // Remaining entries get null mapping (drop).
  return entries.map((entry, i) => {
    if (result[i]) return result[i]!;
    return {
      oldPort: entry.oldPort,
      oldHandle: entry.oldHandle,
      oldHandleSuffix: entry.oldHandleSuffix,
      oldEndpoint: entry.oldEndpoint,
      edges: entry.edges,
      newPortRef: null,
      newPortPreview: null,
      conflict: null,
      matchSource: "none",
    };
  });
}

function computeFactualChanges(oldDevice: DeviceData, newTemplate: DeviceTemplate): FactualChange[] {
  const out: FactualChange[] = [];
  for (const field of FACTUAL_FIELDS) {
    const before = (oldDevice as Record<string, unknown>)[field];
    const after = (newTemplate as unknown as Record<string, unknown>)[field];
    if (before !== after) out.push({ field, before, after });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function planDeviceSwap(
  oldDevice: DeviceData,
  oldNodeId: string,
  newTemplate: DeviceTemplate,
  edges: ConnectionEdge[],
  customTemplates: DeviceTemplate[] = [],
): SwapPlan {
  const entries = collectHandles(oldDevice, oldNodeId, edges);

  const slots = buildSlots(newTemplate, customTemplates);

  // Carry over installed cards from the old device.
  const carriedOver = carryOverCards(oldDevice, slots, customTemplates);

  // Now figure out which entries are *not yet satisfied* by base ports + carried-over cards.
  // We do a dry run of finalizeMappings to learn what's unmapped, then auto-install cards
  // greedily to plug the gaps.
  const initialPool = assemblePool(newTemplate, carriedOver.cards, customTemplates);
  // First, mark which carried-over cards actually satisfy specific entries (for the dialog).
  for (const card of carriedOver.cards) {
    const cardPortIds = new Set(initialPool.filter((p) => p.section === card.slotLabel).map((p) => p.id));
    const claimed = new Set<string>();
    const satisfied: string[] = [];
    for (const pass of ["templatePortId", "label", "signal+connector+dir", "signal+dir"] as const) {
      for (const entry of entries) {
        const handleKey = entry.oldHandle + "|" + entry.oldEndpoint;
        if (satisfied.includes(handleKey)) continue;
        // Only check this card's ports.
        const cardPortPool = initialPool.filter((p) => cardPortIds.has(p.id));
        const m = findMatch(entry, cardPortPool, claimed, pass);
        if (m) {
          claimed.add(m.port.id);
          satisfied.push(handleKey);
        }
      }
    }
    card.satisfiedHandles = satisfied;
  }

  const dryRun = finalizeMappings(entries, initialPool, carriedOver.cards);
  const stillUnmapped = entries.filter((_, i) => dryRun[i].newPortRef === null);

  const autoInstalled = autoInstallCards(slots, stillUnmapped, customTemplates);

  const installedCards = [...carriedOver.cards, ...autoInstalled];
  const finalPool = assemblePool(newTemplate, installedCards, customTemplates);
  const mappings = finalizeMappings(entries, finalPool, installedCards);

  return {
    oldNodeId,
    newTemplate,
    customTemplates,
    mappings,
    installedCards,
    cardsLost: carriedOver.lost,
    factualChanges: computeFactualChanges(oldDevice, newTemplate),
    newPortPool: finalPool,
  };
}

/** User manually picks a different new port (or null = drop) for a given old handle.
 *  Returns a new plan with conflicts/match-source recomputed for that row. */
export function applyManualMapping(
  plan: SwapPlan,
  oldHandle: string,
  oldEndpoint: "source" | "target",
  newPortId: string | null,
): SwapPlan {
  const newMappings = plan.mappings.map((m) => {
    if (m.oldHandle !== oldHandle || m.oldEndpoint !== oldEndpoint) return m;
    if (newPortId === null) {
      return { ...m, newPortRef: null, newPortPreview: null, conflict: null, matchSource: "manual" as MatchSource };
    }
    const newPort = plan.newPortPool.find((p) => p.id === newPortId);
    if (!newPort) return m;
    const conflict = computeConflict(
      { oldPort: m.oldPort, oldHandle: m.oldHandle, oldHandleSuffix: m.oldHandleSuffix, oldEndpoint: m.oldEndpoint, edges: m.edges },
      newPort,
    );
    return {
      ...m,
      newPortRef: refForPort(newPort),
      newPortPreview: newPort,
      conflict,
      matchSource: "manual" as MatchSource,
    };
  });
  return { ...plan, mappings: newMappings };
}

/** Enable/disable a card in an installed slot. Re-runs the rest of the plan accordingly. */
export function toggleAutoInstalledCard(plan: SwapPlan, slotId: string, enabled: boolean): SwapPlan {
  const installedCards = plan.installedCards.map((c) =>
    c.slotId === slotId ? { ...c, enabled } : c,
  );
  const pool = assemblePool(plan.newTemplate, installedCards, plan.customTemplates);

  // Rebuild mappings, preserving manual overrides where the user-selected port still exists.
  // Strategy: re-do the auto matching, then re-apply any matchSource==="manual" rows.
  const fakeEntries: HandleEntry[] = plan.mappings.map((m) => ({
    oldPort: m.oldPort,
    oldHandle: m.oldHandle,
    oldHandleSuffix: m.oldHandleSuffix,
    oldEndpoint: m.oldEndpoint,
    edges: m.edges,
  }));
  let newMappings = finalizeMappings(fakeEntries, pool, installedCards);
  // Replay manual overrides
  for (const original of plan.mappings) {
    if (original.matchSource !== "manual") continue;
    const idx = newMappings.findIndex(
      (m) => m.oldHandle === original.oldHandle && m.oldEndpoint === original.oldEndpoint,
    );
    if (idx < 0) continue;
    if (original.newPortRef === null) {
      newMappings = newMappings.map((m, i) =>
        i === idx ? { ...m, newPortRef: null, newPortPreview: null, conflict: null, matchSource: "manual" } : m,
      );
      continue;
    }
    const stillExists = pool.find(
      (p) => refForPort(p).kind === original.newPortRef!.kind &&
        JSON.stringify(refForPort(p)) === JSON.stringify(original.newPortRef),
    );
    if (stillExists) {
      newMappings = newMappings.map((m, i) =>
        i === idx ? { ...m, newPortRef: original.newPortRef, newPortPreview: stillExists, conflict: original.conflict, matchSource: "manual" } : m,
      );
    }
  }
  return { ...plan, installedCards, newPortPool: pool, mappings: newMappings };
}

/** Convenience: how many edges will be remapped vs. dropped. */
export function summarizePlan(plan: SwapPlan): { remapped: number; dropped: number } {
  let remapped = 0;
  let dropped = 0;
  for (const m of plan.mappings) {
    if (m.newPortRef === null) dropped += m.edges.length;
    else remapped += m.edges.length;
  }
  return { remapped, dropped };
}
