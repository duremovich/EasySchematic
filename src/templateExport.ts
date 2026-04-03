import type { DeviceTemplate } from "./types";

export interface TemplateExportFile {
  version: 1;
  templates: DeviceTemplate[];
}

/** Export custom templates as a standalone JSON file download */
export function exportTemplatesToFile(templates: DeviceTemplate[]): void {
  const data: TemplateExportFile = {
    version: 1,
    templates,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "custom-templates.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse and validate a template export file. Returns templates or throws on invalid input. */
export function parseTemplateFile(json: string): DeviceTemplate[] {
  const data = JSON.parse(json);
  if (
    typeof data !== "object" ||
    data === null ||
    data.version !== 1 ||
    !Array.isArray(data.templates)
  ) {
    throw new Error("Invalid template file format");
  }
  const templates: DeviceTemplate[] = [];
  for (const t of data.templates) {
    if (
      typeof t !== "object" ||
      t === null ||
      typeof t.deviceType !== "string" ||
      typeof t.label !== "string" ||
      !Array.isArray(t.ports)
    ) {
      throw new Error(`Invalid template: ${JSON.stringify(t?.label ?? t)}`);
    }
    templates.push(t as DeviceTemplate);
  }
  return templates;
}

/** Read a File object and parse it as a template export file */
export async function readTemplateFile(file: File): Promise<DeviceTemplate[]> {
  const text = await file.text();
  return parseTemplateFile(text);
}

/** Import templates from multiple files, merging into the store via the provided callback */
export async function importTemplateFiles(
  files: FileList | File[],
  importFn: (templates: DeviceTemplate[]) => void,
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  const skipped = 0;
  for (const file of files) {
    const templates = await readTemplateFile(file);
    const before = templates.length;
    importFn(templates);
    // importCustomTemplates merges and deduplicates, so we approximate counts
    imported += before;
  }
  return { imported, skipped };
}
