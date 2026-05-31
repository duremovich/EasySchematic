import type { DeviceTemplate } from "./types";

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function compareTemplatesByModel(a: Pick<DeviceTemplate, "manufacturer" | "modelNumber" | "label">, b: Pick<DeviceTemplate, "manufacturer" | "modelNumber" | "label">): number {
  const manufacturerCmp = COLLATOR.compare(normalize(a.manufacturer), normalize(b.manufacturer));
  if (manufacturerCmp !== 0) return manufacturerCmp;

  const modelCmp = COLLATOR.compare(normalize(a.modelNumber), normalize(b.modelNumber));
  if (modelCmp !== 0) return modelCmp;

  return COLLATOR.compare(normalize(a.label), normalize(b.label));
}

