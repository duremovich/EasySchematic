# Reports harness

Headless oracle for the reports/CSV pipeline (cable schedule, pack list, network report,
power report, patch panel schedule). Runs the real `compute*` / `build*Csv` /
`get*TableData` production code with no browser and pins the outputs, so report/column
work no longer needs a manual export-and-eyeball playtest pass (#217).

Three layers of protection:

1. **Golden snapshots** — for the committed fixtures, the full output of every report
   (rows, exact CSV text, print-table data, network warnings) is stored in
   `src/__tests__/fixtures/reports/baselines/` and diffed on every run. Any change to
   report content is a visible, reviewable diff.
2. **Invariants** — structural checks that run on *every* fixture, including gitignored
   client exports: CSVs carry the UTF-8 BOM (the v0.42 mojibake bug), parse cleanly with
   consistent column counts, and contain no `undefined`/`NaN`/`[object Object]` cells;
   every print-layout column key exists in the table data (the "column added on-screen
   but missing from the print report" bug); pack-list/power totals double-enter against
   the raw schematic; cable IDs are unique.
3. **Vitest gate** — `reportsHarness.test.ts` runs both layers as part of `npm test`.

## Add a new example schematic

Adding a fixture is drop-in — no code:

1. In the app, export the schematic to JSON.
2. Drop the file into `src/__tests__/fixtures/reports/`. Real client exports are
   **gitignored** on purpose (public repo); only the synthetic `kitchen-sink` and
   `defaultSchematic` goldens are committed. `loadFileFixtures` auto-discovers any
   `*.json` there.
3. `npm run reports:report -- --filter "<file stem>"` writes the snapshot JSON **plus
   each CSV as a real file** into `snapshots/` — open them in Excel/Numbers to eyeball.
4. Dropped-in fixtures are checked against the invariants automatically; run
   `npm run reports:baseline` if you also want local golden pinning for them.

## The kitchen-sink fixture

`fixtures.ts#kitchenSinkFixture` is a synthetic schematic purpose-built to put at least
one row in every section of every report: grouped devices, serials, cold spares, notes,
unit costs, adapters, cable accessories, venue-provided exclusion, costed racks, bundles,
snakes/multicable, gauge/alias/tested/use cable columns, DHCP server + client-behind-a-stub
(#220), VLANs, PoE budgets, duplicate-IP / ip-in-range / subnet-conflict warnings, distro
loading through a stubbed power feed (#172), and a patch-panel passthrough port.

**When you add a report feature, extend the kitchen sink to exercise it**, then
`npm run reports:baseline` and commit the golden diff — the diff *is* the review artifact.

## Commands

| Command | Does |
|---|---|
| `npm run reports:report` | Compute all reports → write snapshot JSON + openable CSVs to `snapshots/`. |
| `npm run reports:check`  | Invariants + diff vs committed goldens; exit 1 on any failure (the gate). |
| `npm run reports:baseline` | Overwrite goldens with current outputs (after an *intended* change). Refuses if invariants fail. |

Extra flag: `-- --filter <substr>` (only matching fixtures).

## Determinism

Snapshots pass a fixed `generatedDate` to the CSV builders, so goldens don't churn
daily. Same input → same snapshot.
