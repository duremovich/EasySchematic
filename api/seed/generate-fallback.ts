import { DEVICE_TEMPLATES, CARD_TEMPLATES } from "../../src/deviceLibrary";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { isCustomTypeKind, type CustomTypeRecord } from "../../src/customTypes/model";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "../../src/deviceLibrary.fallback.json");
const typesOutPath = path.resolve(__dirname, "../../src/communityTypes.fallback.json");

const allTemplates = [...DEVICE_TEMPLATES, ...CARD_TEMPLATES];
writeFileSync(outPath, JSON.stringify(allTemplates, null, 2), "utf-8");
console.log(`Generated ${outPath} (${DEVICE_TEMPLATES.length} devices + ${CARD_TEMPLATES.length} cards = ${allTemplates.length} templates)`);

// Community types live in D1, not in code, so they're baked from the live API. A failed
// fetch (offline, API down) keeps the committed file rather than wiping it.
// FALLBACK_TYPES_URL points it elsewhere (a local API, a self-hosted one), "off" skips it.
const typesUrl = process.env.FALLBACK_TYPES_URL ?? "https://api.easyschematic.live/types";

/** Only what a client needs to render a type: no creator names or timestamps in the
 *  public repo, and a stable order so an unchanged list leaves no diff. */
function slim(records: unknown[]): Pick<CustomTypeRecord, "kind" | "id" | "label" | "data" | "status">[] {
  return records
    .filter((r): r is CustomTypeRecord =>
      !!r && typeof r === "object" && isCustomTypeKind((r as CustomTypeRecord).kind) &&
      typeof (r as CustomTypeRecord).id === "string")
    .map(({ kind, id, label, data, status }) => ({ kind, id, label, data, status }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

async function bakeCommunityTypes(): Promise<void> {
  if (typesUrl === "off") {
    console.log(`Skipped community types (FALLBACK_TYPES_URL=off); kept ${typesOutPath}`);
    return;
  }
  try {
    const res = await fetch(typesUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error("response is not a list");
    const types = slim(body);
    writeFileSync(typesOutPath, JSON.stringify(types, null, 2) + "\n", "utf-8");
    console.log(`Generated ${typesOutPath} (${types.length} community types from ${typesUrl})`);
  } catch (err) {
    if (!existsSync(typesOutPath)) writeFileSync(typesOutPath, "[]\n", "utf-8");
    const kept = (JSON.parse(readFileSync(typesOutPath, "utf-8")) as unknown[]).length;
    console.warn(`Couldn't fetch community types from ${typesUrl} (${(err as Error).message}); kept ${kept} in ${typesOutPath}`);
  }
}

void bakeCommunityTypes();
