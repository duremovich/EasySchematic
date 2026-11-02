import { useCallback } from "react";
import type { LabelCaseMode } from "./types";
import { allConnectors, allSignals, connectorLabel, perRegistryVersion, signalLabel } from "./typeRegistry";
import { useSchematicStore } from "./store";

/** Hand-curated acronyms the connector/signal tables don't cover: rack and trade
 *  vocabulary, plus a few manufacturer product-line codes that show up in device
 *  names. **Add new entries here** — ALL-UPPERCASE, no digits (a word with a digit
 *  is already left alone), and only things that would look wrong title-cased.
 *  Deliberately short: an unlisted acronym is only ever mangled under "Capitalize
 *  Words", and over-listing risks wrecking real words that collide with acronyms. */
const EXTRA_ACRONYMS = [
  // Facility / room vocabulary
  "AV", "IT", "IDF", "MDF", "FOH", "BOH", "HVAC",
  // Gear categories
  "DSP", "UPS", "PDU", "PSU", "KVM", "NVR", "DVR", "PTZ", "LED", "LCD", "OLED",
  // Signal + network terms the label tables don't spell out
  "EDID", "HDCP", "CEC", "ARC", "UHD", "HDR", "POE", "IP", "LAN", "WAN", "VLAN",
  "DHCP", "SSID", "NIC", "TX", "RX",
  // Manufacturer product lines seen in device names
  "DTP", "XTP", "DXP", "NVX", "SVSI",
];

/** A "word" for casing purposes: letters/digits, with apostrophes kept *inside* the
 *  word so `joe's` capitalizes to `Joe's` and not `Joe'S`. Everything else — spaces,
 *  hyphens, slashes, parentheses, quotes — is a separator and passes through
 *  untouched, so each side of `HDMI-OUT` is cased on its own. */
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const HAS_DIGIT = /\p{N}/u;

/** Acronyms that survive "Capitalize Words" as typed. Derived from the real
 *  vocabulary in the connector and signal labels — every ALL-UPPERCASE, digit-free
 *  word of those display names (HDMI, SDI, XLR, TRS, BNC, USB, IEC, MADI, …) —
 *  then topped up with EXTRA_ACRONYMS. Rebuilt after a registration, so community
 *  and user type labels count too. */
const acronyms: () => ReadonlySet<string> = perRegistryVersion(() => new Set([
  ...allConnectors().map(connectorLabel)
    .concat(allSignals().map(signalLabel))
    .flatMap((label) => label.match(WORD_RE) ?? [])
    .filter((w) => w.length > 1 && !HAS_DIGIT.test(w) && isAllUpper(w)),
  ...EXTRA_ACRONYMS,
]));

/** True when the word has at least one cased letter and no lowercase ones. */
function isAllUpper(word: string): boolean {
  return word === word.toUpperCase() && word !== word.toLowerCase();
}

/** `hall` / `HALL` -> `Hall`. The `u` flag makes `.` a whole code point. */
function titleCase(word: string): string {
  return word.replace(/^(.)(.*)$/su, (_m, first: string, rest: string) =>
    first.toUpperCase() + rest.toLowerCase());
}

/** Acronym-aware title case (#294). Plain title case is unusable on AV labels —
 *  `HDMI In 1` would become `Hdmi In 1` — so each word is handled on its own:
 *
 *  1. A word containing a digit is left completely alone: `RJ45`, `84`, `L21-30`, `4K`.
 *     Part codes and model numbers are never re-cased.
 *  2. An ALL-UPPERCASE word is kept as typed if it's a known acronym (`HDMI In 1`),
 *     otherwise title-cased (`TECH TABLE` -> `Tech Table`, `SDI OUT 2` -> `SDI Out 2`).
 *  3. A word with an internal capital is kept as typed: `DisplayPort`, `HDBaseT`,
 *     `powerCON`, `iMac`, `O'Brien`. The capital was deliberate; flattening it is the
 *     same failure the acronym list exists to prevent.
 *  4. Anything else is title-cased: `main hall` -> `Main Hall`.
 *
 *  Lowercase is never promoted to uppercase — `dsp rack` becomes `Dsp Rack`, not
 *  `DSP Rack`. The transform protects capitalization the user typed; it never invents
 *  any, which keeps it predictable around words that collide with acronyms (led, dip, pan). */
function capitalizeWords(text: string): string {
  return text.replace(WORD_RE, (word) => {
    if (HAS_DIGIT.test(word)) return word;
    if (isAllUpper(word)) return acronyms().has(word) ? word : titleCase(word);
    if (word.slice(1) !== word.slice(1).toLowerCase()) return word;
    return titleCase(word);
  });
}

/** Transform a label for display. Data is never mutated — callers apply this at render/serialize time only. */
export function transformLabel(text: string | null | undefined, mode: LabelCaseMode): string {
  if (text == null) return "";
  switch (mode) {
    case "uppercase": return text.toUpperCase();
    case "lowercase": return text.toLowerCase();
    case "capitalize": return capitalizeWords(text);
    case "as-typed":
    default: return text;
  }
}

/** React hook — returns a memoized transform bound to the current labelCase preference.
 *  Use inside components that display labels. Don't use inside <input> values. */
export function useDisplayLabel(): (text: string | null | undefined) => string {
  const mode = useSchematicStore((s) => s.labelCase);
  return useCallback((text) => transformLabel(text, mode), [mode]);
}

/** While true, transformLabelNow passes labels through as stored. Only ever set
 *  inside withRawLabels — never directly. */
let rawLabels = false;

/** Run fn with the display-case transform suspended, so every label comes out as
 *  stored (#309). For exports that are DATA rather than a rendered document — a
 *  re-importable CSV must round-trip stored names, not bake in the display case.
 *  Covers all of fn's transitive transformLabelNow calls (device, room, port, and
 *  patch-panel labels alike); rendered surfaces (canvas, PDF, DXF) stay outside. */
export function withRawLabels<T>(fn: () => T): T {
  const prev = rawLabels;
  rawLabels = true;
  try {
    return fn();
  } finally {
    rawLabels = prev;
  }
}

/** True while withRawLabels is active. For export code that must choose a
 *  machine-parseable form over the display one — not just skip the case
 *  transform — e.g. room-path separators in the cable-schedule CSV (#324). */
export function labelsAreRaw(): boolean {
  return rawLabels;
}

/** Non-component helper — reads current preference from the store and transforms.
 *  Use inside report/export functions that run outside React. */
export function transformLabelNow(text: string | null | undefined): string {
  if (rawLabels) return text ?? "";
  return transformLabel(text, useSchematicStore.getState().labelCase);
}
