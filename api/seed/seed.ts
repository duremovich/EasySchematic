import { DEVICE_TEMPLATES, CARD_TEMPLATES } from "../../src/deviceLibrary";
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

const allTemplates = [...DEVICE_TEMPLATES, ...CARD_TEMPLATES];
const lines: string[] = [];

allTemplates.forEach((t, i) => {
  const id = t.id ?? `auto-${i}`;
  const version = t.version ?? 1;
  const deviceType = escapeSQL(t.deviceType);
  const category = escapeSQL(t.category ?? "Other");
  const label = escapeSQL(t.label);
  const manufacturer = t.manufacturer ? `'${escapeSQL(t.manufacturer)}'` : "NULL";
  const modelNumber = t.modelNumber ? `'${escapeSQL(t.modelNumber)}'` : "NULL";
  const color = t.color ? `'${escapeSQL(t.color)}'` : "NULL";
  const imageUrl = t.imageUrl ? `'${escapeSQL(t.imageUrl)}'` : "NULL";
  const searchTerms = t.searchTerms
    ? `'${escapeSQL(JSON.stringify(t.searchTerms))}'`
    : "NULL";
  const ports = escapeSQL(JSON.stringify(t.ports));
  const slots = t.slots ? `'${escapeSQL(JSON.stringify(t.slots))}'` : "NULL";
  const slotFamily = t.slotFamily ? `'${escapeSQL(t.slotFamily)}'` : "NULL";
  const referenceUrl = t.referenceUrl ? `'${escapeSQL(t.referenceUrl)}'` : "NULL";
  const powerDrawW = t.powerDrawW != null ? `${t.powerDrawW}` : "NULL";
  const powerCapacityW = t.powerCapacityW != null ? `${t.powerCapacityW}` : "NULL";
  const voltage = t.voltage ? `'${escapeSQL(t.voltage)}'` : "NULL";
  const isVenueProvided = t.isVenueProvided ? "1" : "NULL";
  const heightMm = t.heightMm != null ? `${t.heightMm}` : "NULL";
  const widthMm = t.widthMm != null ? `${t.widthMm}` : "NULL";
  const depthMm = t.depthMm != null ? `${t.depthMm}` : "NULL";
  const weightKg = t.weightKg != null ? `${t.weightKg}` : "NULL";

  lines.push(
    `INSERT OR REPLACE INTO templates (id, version, device_type, category, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, slots, slot_family, power_draw_w, power_capacity_w, voltage, is_venue_provided, height_mm, width_mm, depth_mm, weight_kg, sort_order) VALUES ('${escapeSQL(id)}', ${version}, '${deviceType}', '${category}', '${label}', ${manufacturer}, ${modelNumber}, ${color}, ${imageUrl}, ${referenceUrl}, ${searchTerms}, '${ports}', ${slots}, ${slotFamily}, ${powerDrawW}, ${powerCapacityW}, ${voltage}, ${isVenueProvided}, ${heightMm}, ${widthMm}, ${depthMm}, ${weightKg}, ${i});`
  );
});

const sql = lines.join("\n");
const seedFile = path.join(__dirname, "seed-data.sql");
writeFileSync(seedFile, sql, "utf-8");
console.log(`Generated ${seedFile} with ${lines.length} templates`);

if (process.argv.includes("--sql-only")) {
  process.exit(0);
}

const isRemote = process.argv.includes("--remote");
const flag = isRemote ? "--remote" : "--local";

console.log(`Applying migrations (${flag})...`);
execSync(`npx wrangler d1 migrations apply easyschematic-db ${flag}`, {
  cwd: apiDir,
  stdio: "inherit",
});

console.log(`Seeding data (${flag})...`);
execSync(
  `npx wrangler d1 execute easyschematic-db ${flag} --file=seed/seed-data.sql`,
  { cwd: apiDir, stdio: "inherit" }
);

// --- Drift check: detect orphan templates in DB ---
console.log("\nChecking for drift...");
const result = execSync(
  `npx wrangler d1 execute easyschematic-db ${flag} --json --command="SELECT id, label, submitted_by FROM templates"`,
  { cwd: apiDir, encoding: "utf-8" }
);

const parsed = JSON.parse(result);
const rows: { id: string; label: string; submitted_by: string | null }[] =
  parsed[0]?.results ?? [];

const bundledIds = new Set(
  allTemplates.map((t, i) => t.id ?? `auto-${i}`)
);

const communityTemplates = rows.filter(
  (r) => !bundledIds.has(r.id) && r.submitted_by != null
);
const orphanTemplates = rows.filter(
  (r) => !bundledIds.has(r.id) && r.submitted_by == null
);
const bundledCount = rows.filter((r) => bundledIds.has(r.id)).length;

console.log(
  `\n✅ ${bundledCount} bundled + ${communityTemplates.length} community = ${rows.length} total templates`
);

if (orphanTemplates.length > 0) {
  console.log(
    `\n⚠️  ${orphanTemplates.length} template(s) in DB not in deviceLibrary.ts (and not community-submitted):`
  );
  for (const t of orphanTemplates) {
    console.log(`   - ${t.id}: ${t.label}`);
  }
  console.log("   Run DELETE manually if these should be removed.");
}

console.log("\nDone!");
