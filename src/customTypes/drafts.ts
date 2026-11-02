/**
 * Draft helpers shared by every form that creates a custom type: the devices site's mod
 * Types page (P3) and the app's "+ New … type" dialog (P5).
 */
import { ALL_CATEGORIES } from "../deviceTypeCategories";
import { CABLE_PREFIX_RE } from "./validate";
import type { CustomTypeKind } from "./model";

export type TypeData = Record<string, unknown>;

/** A fresh draft `data` object for a new type of this kind. */
export function emptyTypeData(kind: CustomTypeKind, category = ""): TypeData {
  switch (kind) {
    case "device": return { category: ALL_CATEGORIES.includes(category) ? category : "" };
    case "signal": return { color: "#2563eb", group: "", defaultConnector: "", cable: "", cablePrefix: "" };
    case "connector": return { group: "", cable: "", gender: "none", matesWith: [], adaptsTo: [] };
  }
}

/**
 * A cable-ID prefix for a new signal labelled `label` that `isFree` accepts: the initials
 * ("Show Comms" → SC), then the first letters, then the initials plus each later letter,
 * then any free pair. Empty when nothing passes (the user types one).
 */
export function suggestCablePrefix(label: string, isFree: (prefix: string) => boolean): string {
  const words = label.toUpperCase().replace(/[^A-Z ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const letters = words.join("");
  const tries: string[] = [];
  const initials = words.map((w) => w[0]).join("").slice(0, 4);
  if (initials.length >= 2) tries.push(initials);
  for (let n = 2; n <= 4; n++) if (letters.length >= n) tries.push(letters.slice(0, n));
  const head = initials.length >= 2 ? initials.slice(0, 3) : letters.slice(0, 1);
  for (const c of letters.slice(1)) tries.push(head + c);
  for (const a of letters.slice(0, 1) || "X") for (let c = 65; c <= 90; c++) tries.push(a + String.fromCharCode(c));
  return tries.find((p) => CABLE_PREFIX_RE.test(p) && isFree(p)) ?? "";
}
