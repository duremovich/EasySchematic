import { DEVICE_TEMPLATES } from "../../src/deviceLibrary";
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

const lines: string[] = [];

DEVICE_TEMPLATES.forEach((t, i) => {
  const id = t.id ?? `auto-${i}`;
  const version = t.version ?? 1;
  const deviceType = escapeSQL(t.deviceType);
  const label = escapeSQL(t.label);
  const manufacturer = t.manufacturer ? `'${escapeSQL(t.manufacturer)}'` : "NULL";
  const modelNumber = t.modelNumber ? `'${escapeSQL(t.modelNumber)}'` : "NULL";
  const color = t.color ? `'${escapeSQL(t.color)}'` : "NULL";
  const imageUrl = t.imageUrl ? `'${escapeSQL(t.imageUrl)}'` : "NULL";
  const searchTerms = t.searchTerms
    ? `'${escapeSQL(JSON.stringify(t.searchTerms))}'`
    : "NULL";
  const ports = escapeSQL(JSON.stringify(t.ports));

  lines.push(
    `INSERT OR REPLACE INTO templates (id, version, device_type, label, manufacturer, model_number, color, image_url, search_terms, ports, sort_order) VALUES ('${escapeSQL(id)}', ${version}, '${deviceType}', '${label}', ${manufacturer}, ${modelNumber}, ${color}, ${imageUrl}, ${searchTerms}, '${ports}', ${i});`
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

console.log("Done!");
