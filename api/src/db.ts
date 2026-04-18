/** Lightweight output type — matches DeviceTemplate from the main app */
interface TemplateOutput {
  id: string;
  version: number;
  deviceType: string;
  category: string;
  label: string;
  hostname?: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  referenceUrl?: string;
  searchTerms?: string[];
  ports: unknown[];
  slots?: unknown[];
  slotFamily?: string;
  powerDrawW?: number;
  powerCapacityW?: number;
  voltage?: string;
  poeBudgetW?: number;
  poeDrawW?: number;
  isVenueProvided?: boolean;
  heightMm?: number;
  widthMm?: number;
  depthMm?: number;
  weightKg?: number;
}

export interface TemplateRow {
  id: string;
  version: number;
  device_type: string;
  category: string;
  label: string;
  hostname: string | null;
  manufacturer: string | null;
  model_number: string | null;
  color: string | null;
  image_url: string | null;
  reference_url: string | null;
  search_terms: string | null;
  ports: string;
  slots: string | null;
  slot_family: string | null;
  power_draw_w: number | null;
  power_capacity_w: number | null;
  voltage: string | null;
  poe_budget_w: number | null;
  poe_draw_w: number | null;
  is_venue_provided: number | null;
  height_mm: number | null;
  width_mm: number | null;
  depth_mm: number | null;
  weight_kg: number | null;
  sort_order: number;
  flagged_for_deletion?: number;
  flagged_for_deletion_reason?: string | null;
  flagged_for_deletion_at?: string | null;
  flagged_for_deletion_by?: string | null;
}

interface TemplateInput {
  id?: string;
  label: string;
  hostname?: string;
  deviceType: string;
  category: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  referenceUrl?: string;
  searchTerms?: string[];
  ports: unknown[];
  slots?: unknown[];
  slotFamily?: string;
  powerDrawW?: number;
  powerCapacityW?: number;
  voltage?: string;
  poeBudgetW?: number;
  poeDrawW?: number;
  isVenueProvided?: boolean;
  heightMm?: number;
  widthMm?: number;
  depthMm?: number;
  weightKg?: number;
  sortOrder?: number;
}

export function templateToRow(input: TemplateInput): Omit<TemplateRow, "version"> {
  return {
    id: input.id ?? "",
    device_type: input.deviceType,
    category: input.category,
    label: input.label,
    hostname: input.hostname ?? null,
    manufacturer: input.manufacturer ?? null,
    model_number: input.modelNumber ?? null,
    color: input.color ?? null,
    image_url: input.imageUrl ?? null,
    reference_url: input.referenceUrl ?? null,
    search_terms: input.searchTerms ? JSON.stringify(input.searchTerms) : null,
    ports: JSON.stringify(input.ports),
    slots: input.slots ? JSON.stringify(input.slots) : null,
    slot_family: input.slotFamily ?? null,
    power_draw_w: input.powerDrawW ?? null,
    power_capacity_w: input.powerCapacityW ?? null,
    voltage: input.voltage ?? null,
    poe_budget_w: input.poeBudgetW ?? null,
    poe_draw_w: input.poeDrawW ?? null,
    is_venue_provided: input.isVenueProvided ? 1 : null,
    height_mm: input.heightMm ?? null,
    width_mm: input.widthMm ?? null,
    depth_mm: input.depthMm ?? null,
    weight_kg: input.weightKg ?? null,
    sort_order: input.sortOrder ?? 0,
  };
}

export interface TemplateSummaryOutput {
  id: string;
  label: string;
  deviceType: string;
  category: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  searchTerms?: string[];
  portCount: number;
  signalTypes: string[];
  slotCount: number;
}

export function rowToSummary(row: TemplateRow): TemplateSummaryOutput {
  const ports = JSON.parse(row.ports) as { signalType: string }[];
  const slots = row.slots ? JSON.parse(row.slots) as unknown[] : [];
  return {
    id: row.id,
    label: row.label,
    deviceType: row.device_type,
    category: row.category,
    ...(row.manufacturer && { manufacturer: row.manufacturer }),
    ...(row.model_number && { modelNumber: row.model_number }),
    ...(row.color && { color: row.color }),
    ...(row.search_terms && { searchTerms: JSON.parse(row.search_terms) as string[] }),
    portCount: ports.length,
    signalTypes: [...new Set(ports.map((p) => p.signalType))],
    slotCount: slots.length,
  };
}

export function rowToTemplate(row: TemplateRow): TemplateOutput {
  return {
    id: row.id,
    version: row.version,
    deviceType: row.device_type,
    category: row.category,
    label: row.label,
    ...(row.hostname && { hostname: row.hostname }),
    ...(row.manufacturer && { manufacturer: row.manufacturer }),
    ...(row.model_number && { modelNumber: row.model_number }),
    ...(row.color && { color: row.color }),
    ...(row.image_url && { imageUrl: row.image_url }),
    ...(row.reference_url && { referenceUrl: row.reference_url }),
    ...(row.search_terms && { searchTerms: JSON.parse(row.search_terms) as string[] }),
    ports: JSON.parse(row.ports) as unknown[],
    ...(row.slots && { slots: JSON.parse(row.slots) as unknown[] }),
    ...(row.slot_family && { slotFamily: row.slot_family }),
    ...(row.power_draw_w != null && { powerDrawW: row.power_draw_w }),
    ...(row.power_capacity_w != null && { powerCapacityW: row.power_capacity_w }),
    ...(row.voltage && { voltage: row.voltage }),
    ...(row.poe_budget_w != null && { poeBudgetW: row.poe_budget_w }),
    ...(row.poe_draw_w != null && { poeDrawW: row.poe_draw_w }),
    ...(row.is_venue_provided && { isVenueProvided: true }),
    ...(row.height_mm != null && { heightMm: row.height_mm }),
    ...(row.width_mm != null && { widthMm: row.width_mm }),
    ...(row.depth_mm != null && { depthMm: row.depth_mm }),
    ...(row.weight_kg != null && { weightKg: row.weight_kg }),
  };
}
