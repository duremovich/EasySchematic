/** Lightweight output type — matches DeviceTemplate from the main app */
interface TemplateOutput {
  id: string;
  version: number;
  deviceType: string;
  label: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  searchTerms?: string[];
  ports: unknown[];
}

export interface TemplateRow {
  id: string;
  version: number;
  device_type: string;
  label: string;
  manufacturer: string | null;
  model_number: string | null;
  color: string | null;
  image_url: string | null;
  search_terms: string | null;
  ports: string;
  sort_order: number;
}

interface TemplateInput {
  id?: string;
  label: string;
  deviceType: string;
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  searchTerms?: string[];
  ports: unknown[];
  sortOrder?: number;
}

export function templateToRow(input: TemplateInput): Omit<TemplateRow, "version"> {
  return {
    id: input.id ?? "",
    device_type: input.deviceType,
    label: input.label,
    manufacturer: input.manufacturer ?? null,
    model_number: input.modelNumber ?? null,
    color: input.color ?? null,
    image_url: input.imageUrl ?? null,
    search_terms: input.searchTerms ? JSON.stringify(input.searchTerms) : null,
    ports: JSON.stringify(input.ports),
    sort_order: input.sortOrder ?? 0,
  };
}

export function rowToTemplate(row: TemplateRow): TemplateOutput {
  return {
    id: row.id,
    version: row.version,
    deviceType: row.device_type,
    label: row.label,
    ...(row.manufacturer && { manufacturer: row.manufacturer }),
    ...(row.model_number && { modelNumber: row.model_number }),
    ...(row.color && { color: row.color }),
    ...(row.image_url && { imageUrl: row.image_url }),
    ...(row.search_terms && { searchTerms: JSON.parse(row.search_terms) as string[] }),
    ports: JSON.parse(row.ports) as unknown[],
  };
}
