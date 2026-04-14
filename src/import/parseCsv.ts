import type { DeviceTemplate, Port } from "../types";
import { DEVICE_TYPE_TO_CATEGORY } from "../deviceTypeCategories";
import { validateTemplate } from "./validate";
import { generatePortId, generateTemplateId, type ParseResult, type ParsedTemplate } from "./types";

const REQUIRED_COLUMNS = ["model_number", "label", "device_type", "port_label", "port_signal_type", "port_direction"];

const DEVICE_FIELDS = [
  "manufacturer", "label", "device_type", "category", "reference_url",
  "height_mm", "width_mm", "depth_mm", "weight_kg", "power_draw_w", "voltage",
] as const;

/** Parse a row-per-port CSV into device templates.
 *
 * Required columns: model_number, label, device_type, port_label, port_signal_type, port_direction
 * Optional device columns: manufacturer, category, reference_url, height_mm, width_mm, depth_mm, weight_kg, power_draw_w, voltage
 * Optional port columns: port_connector_type, port_section
 */
export function parseCsvImport(raw: string): ParseResult {
  const rows = parseCsvRows(raw);
  if (rows.length === 0) {
    return { templates: [], fatalErrors: ["CSV is empty"] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missingCols = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length > 0) {
    return {
      templates: [],
      fatalErrors: [`CSV missing required columns: ${missingCols.join(", ")}`],
    };
  }

  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));

  // Group rows by (manufacturer + model_number)
  const groups = new Map<string, { rows: string[][]; rowNumbers: number[] }>();
  const fatalErrors: string[] = [];

  dataRows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const get = (col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };
    const model = get("model_number");
    const mfr = get("manufacturer") || "Generic";
    if (!model && mfr.toLowerCase() !== "generic") {
      fatalErrors.push(`Row ${rowNum}: missing model_number`);
      return;
    }
    const key = `${mfr}|${model || get("label")}`;
    const group = groups.get(key) ?? { rows: [], rowNumbers: [] };
    group.rows.push(row);
    group.rowNumbers.push(rowNum);
    groups.set(key, group);
  });

  const templates: ParsedTemplate[] = [];

  for (const [, group] of groups) {
    const first = group.rows[0];
    const get = (row: string[], col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    // Device-level fields come from the first row; warn if they disagree across rows
    const deviceData: Record<string, string> = {};
    for (const field of DEVICE_FIELDS) {
      deviceData[field] = get(first, field);
    }

    const ports: Partial<Port>[] = group.rows.map((row, i) => ({
      id: generatePortId(i),
      label: get(row, "port_label"),
      signalType: get(row, "port_signal_type") as Port["signalType"],
      direction: (get(row, "port_direction") || "input") as Port["direction"],
      connectorType: (get(row, "port_connector_type") || undefined) as Port["connectorType"],
      section: get(row, "port_section") || undefined,
    }));

    const deviceType = deviceData.device_type;
    const derivedCategory = DEVICE_TYPE_TO_CATEGORY[deviceType];
    const category = deviceData.category || derivedCategory || "Uncategorized";

    const template: Partial<DeviceTemplate> = {
      id: generateTemplateId(),
      label: deviceData.label || undefined,
      deviceType,
      category,
      manufacturer: get(first, "manufacturer") || "Generic",
      modelNumber: get(first, "model_number") || undefined,
      referenceUrl: deviceData.reference_url || undefined,
      voltage: deviceData.voltage || undefined,
      heightMm: numField(deviceData.height_mm),
      widthMm: numField(deviceData.width_mm),
      depthMm: numField(deviceData.depth_mm),
      weightKg: numField(deviceData.weight_kg),
      powerDrawW: numField(deviceData.power_draw_w),
      ports: ports as Port[],
    };

    const validation = validateTemplate(template);
    const start = group.rowNumbers[0];
    const end = group.rowNumbers[group.rowNumbers.length - 1];
    templates.push({
      template: template as DeviceTemplate,
      validation,
      source: start === end ? `row ${start}` : `rows ${start}–${end}`,
    });
  }

  return { templates, fatalErrors };
}

function numField(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : undefined;
}

/** Minimal CSV parser — handles quoted fields and embedded commas/newlines/quotes.
 *  No external dependency. Sufficient for the import format we control. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  // Final field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
