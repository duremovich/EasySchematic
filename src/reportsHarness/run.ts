/**
 * Reports harness CLI. Run with tsx:
 *   npm run reports:report     -> compute all report outputs, write snapshot JSON + CSVs to snapshots/
 *   npm run reports:check      -> invariants + diff vs committed goldens (exit 1 on any failure)
 *   npm run reports:baseline   -> overwrite goldens with current outputs
 *
 * Extra flags: --filter <substr> (only matching fixtures).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allReportFixtures } from "./fixtures";
import { computeReportsSnapshot } from "./snapshot";
import { checkInvariants } from "./invariants";
import { loadGolden, saveGolden, diffSnapshots } from "./baseline";

const SNAPSHOT_DIR = fileURLToPath(
  new URL("../__tests__/fixtures/reports/snapshots", import.meta.url),
);

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const mode = has("--check") ? "check" : has("--update-baselines") ? "baseline" : "report";
  const filter = arg("--filter");

  const fixtures = (await allReportFixtures()).filter((f) => !filter || f.name.includes(filter));
  if (fixtures.length === 0) {
    console.error("No fixtures matched.");
    process.exit(1);
  }

  let failures = 0;
  console.log(`Reports harness — ${mode} — ${fixtures.length} fixture(s)\n`);

  for (const fx of fixtures) {
    const start = Date.now();
    const snap = computeReportsSnapshot(fx);
    const problems = checkInvariants(fx, snap);
    const elapsed = Date.now() - start;

    if (mode === "baseline") {
      if (problems.length > 0) {
        failures++;
        console.log(`  ${fx.name}: NOT baselined — ${problems.length} invariant problem(s):`);
        for (const p of problems) console.log(`    ✗ ${p}`);
        continue;
      }
      saveGolden(fx.name, snap);
      console.log(`  ${fx.name}: golden written (${elapsed}ms)`);
      continue;
    }

    if (mode === "check") {
      const golden = loadGolden(fx.name);
      const diffs = golden ? diffSnapshots(golden, snap) : [];
      const ok = problems.length === 0 && diffs.length === 0;
      if (!ok) failures++;
      const goldenNote = golden ? "" : " (no golden — invariants only)";
      console.log(`  ${fx.name}: ${ok ? "OK" : "FAIL"}${goldenNote} (${elapsed}ms)`);
      for (const p of problems) console.log(`    ✗ invariant: ${p}`);
      for (const d of diffs) console.log(`    ✗ golden: ${d}`);
      continue;
    }

    // report mode: write the snapshot JSON plus each CSV as a real file so it can
    // be opened in Excel/Numbers for eyeballing — this replaces a chunk of the
    // manual export-and-check QA loop.
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(`${SNAPSHOT_DIR}/${fx.name}.snapshot.json`, JSON.stringify(snap, null, 2) + "\n");
    writeFileSync(`${SNAPSHOT_DIR}/${fx.name}.cable-schedule.csv`, snap.cableSchedule.csv);
    writeFileSync(`${SNAPSHOT_DIR}/${fx.name}.pack-list.csv`, snap.packList.csv);
    writeFileSync(`${SNAPSHOT_DIR}/${fx.name}.power-report.csv`, snap.powerReport.csv);
    writeFileSync(`${SNAPSHOT_DIR}/${fx.name}.network-report.csv`, "\uFEFF" + snap.networkReport.csv);
    writeFileSync(`${SNAPSHOT_DIR}/${fx.name}.patch-panel-schedule.csv`, snap.patchPanelSchedule.csv);

    const counts = [
      `${snap.cableSchedule.rows.length} cables`,
      `${snap.networkReport.rows.length} net ports`,
      `${(snap.packList.data as { devices: unknown[] }).devices.length} device rows`,
      `${snap.patchPanelSchedule.rows.length} patch ports`,
      `${snap.warnings.dhcp.length + snap.warnings.subnetConflicts.length} warnings`,
    ].join(", ");
    const flag = problems.length > 0 ? `  ✗ ${problems.length} invariant problem(s)` : "";
    if (problems.length > 0) failures++;
    console.log(`  ${fx.name}: ${counts} (${elapsed}ms)${flag}`);
    for (const p of problems) console.log(`    ✗ ${p}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} fixture(s) failed.`);
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
