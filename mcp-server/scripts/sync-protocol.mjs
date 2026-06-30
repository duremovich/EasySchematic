// Copies the canonical wire protocol from the app into this package so there is
// exactly ONE source of truth (src/mcp/protocol.ts). The copy is gitignored and
// regenerated on every build/test, so it can never silently drift.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../src/mcp/protocol.ts");
const dest = resolve(here, "../src/protocol.generated.ts");

const banner =
  "// AUTO-GENERATED from src/mcp/protocol.ts — do not edit. Regenerate with `npm run sync`.\n";
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, banner + readFileSync(src, "utf8"));
process.stderr.write(`[sync-protocol] wrote ${dest}\n`);
