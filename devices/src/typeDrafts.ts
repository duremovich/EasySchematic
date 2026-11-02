/** Shared bits of the Types page's forms (kept out of TypeFields.tsx for fast refresh). */
import { ALL_CATEGORIES } from "../../src/deviceTypeCategories";
import type { CustomTypeKind } from "../../src/customTypes";

export const TYPE_INPUT = "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
export const TYPE_LABEL = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

export type TypeData = Record<string, unknown>;

/** A fresh draft for a new type of this kind. */
export function emptyTypeData(kind: CustomTypeKind, category = ""): TypeData {
  switch (kind) {
    case "device": return { category: ALL_CATEGORIES.includes(category) ? category : "" };
    case "signal": return { color: "#2563eb", group: "", defaultConnector: "", cable: "", cablePrefix: "" };
    case "connector": return { group: "", cable: "", gender: "none", matesWith: [], adaptsTo: [] };
  }
}
