import type { DeviceTemplate } from "./types";

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function compareTemplatesByModel(a: Pick<DeviceTemplate, "manufacturer" | "modelNumber" | "label">, b: Pick<DeviceTemplate, "manufacturer" | "modelNumber" | "label">): number {
  const labelCmp = COLLATOR.compare(normalize(a.label), normalize(b.label));
  if (labelCmp !== 0) return labelCmp;

  const manufacturerCmp = COLLATOR.compare(normalize(a.manufacturer), normalize(b.manufacturer));
  if (manufacturerCmp !== 0) return manufacturerCmp;

  return COLLATOR.compare(normalize(a.modelNumber), normalize(b.modelNumber));
}
