import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Runtime verification for the Discord bug batch (#173–#182). Each test reproduces
 * the reported symptom against the real app so a regression would fail here.
 */

async function boot(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("easyschematic-skip-landing", "1"));
  await page.goto("/");
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30_000 });
  // Let the default schematic mount + routing settle.
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
}

// #179 — copy/paste must still work when Caps Lock is on. Caps Lock makes
// KeyboardEvent.key uppercase ('C'/'V'/'A'), which the old lowercase comparisons missed.
// We simulate that exact condition by dispatching uppercase-key ctrl shortcuts.
test("#179 caps-lock: uppercase Ctrl+A/C/V still copies and pastes", async ({ page }) => {
  await boot(page);
  // Focus the canvas pane (not a node) so the global keydown handler is in play.
  await page.locator(".react-flow__pane").click({ position: { x: 40, y: 40 } });

  const before = await page.locator(".react-flow__node").count();
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => {
    const fire = (key: string) =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));
    fire("A"); // select all  (uppercase = Caps Lock on)
    fire("C"); // copy
    fire("V"); // paste
  });

  await page.waitForTimeout(800);
  const after = await page.locator(".react-flow__node").count();
  expect(after, "uppercase Ctrl+C/V should have pasted at least one node").toBeGreaterThan(before);
});

// #181 — when the device-library fetch fails, the app must surface a visible
// "some community devices may be missing" notice with a Retry, instead of
// silently dropping to the bundled subset.
test("#181 degraded device library shows a retry banner instead of failing silently", async ({ page }) => {
  await page.route("**/templates", (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem("easyschematic-skip-landing", "1"));
  await page.goto("/");
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText(/community devices may be missing/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
});

// #176 — a valid schematic whose import pipeline throws AFTER the schematic is
// loaded must NOT surface a false "Invalid schematic file." alert. We craft a file
// with a print-sheet page missing its arrays, which (pre-fix) threw in
// syncRackCounters after set() had already loaded the schematic.
test("#176 valid file with a malformed page does not trigger a false 'Invalid schematic' alert", async ({ page }) => {
  await boot(page);

  const dialogs: string[] = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });

  const fileJson = JSON.stringify({
    version: 41,
    name: "es176-probe",
    nodes: [],
    edges: [],
    pages: [{ id: "printsheet-1", type: "print-sheet" }], // no viewports/racks/etc — old throw site
  });

  // The first hidden .json input is the schematic importer (onChange={handleImport}).
  await page
    .locator('input[type=file][accept=".json"]')
    .first()
    .setInputFiles({ name: "es176-probe.json", mimeType: "application/json", buffer: Buffer.from(fileJson) });

  await page.waitForTimeout(1_000);

  expect(dialogs.join(" | "), "no false 'Invalid schematic' alert should fire").not.toContain("Invalid schematic");
  // And the file actually loaded (default device nodes replaced by our empty set).
  expect(await page.locator(".react-flow__node").count()).toBe(0);

  // #174 — the browser tab title tracks the loaded schematic's name.
  await expect.poll(() => page.title()).toBe("es176-probe — EasySchematic");
});

// #176 (other half) — random JSON that ISN'T a schematic (no `nodes` array) must be
// REJECTED with the "Invalid schematic file." alert, not silently loaded as an empty
// schematic that wipes the canvas.
test("#176 non-schematic JSON is rejected with an Invalid alert", async ({ page }) => {
  await boot(page);

  const before = await page.locator(".react-flow__node").count();
  expect(before, "default schematic should have nodes to begin with").toBeGreaterThan(0);

  const dialogs: string[] = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });

  // Valid JSON, but not a schematic (no `nodes` array).
  const junk = JSON.stringify({ hello: "world", foo: [1, 2, 3] });
  await page
    .locator('input[type=file][accept=".json"]')
    .first()
    .setInputFiles({ name: "not-a-schematic.json", mimeType: "application/json", buffer: Buffer.from(junk) });

  await page.waitForTimeout(800);

  expect(dialogs.join(" | "), "non-schematic JSON should trigger the Invalid alert").toContain("Invalid schematic file.");
  // The canvas must be untouched — the junk file should NOT have wiped the nodes.
  expect(await page.locator(".react-flow__node").count(), "junk import must not blank the canvas").toBe(before);
});

// #173 — Chromium's html-to-image drops connection lines because edge strokes are
// inlined as `var(--color-<signal>)`, which the isolated clone document can't resolve.
// After the fix, the exported SVG must carry CONCRETE stroke colors (no unresolved
// `stroke: var(...)`). Default boot already has var-stroked edges (style.stroke).
test("#173 SVG export keeps connection-line colors (no unresolved var() strokes)", async ({ page }) => {
  await boot(page);
  await expect(page.locator(".react-flow__edge").first()).toBeVisible({ timeout: 30_000 });

  // Sanity: the vulnerable condition actually exists on the live canvas — at least
  // one edge path has a `var(--color-…)` inline stroke before export.
  const varStrokesBefore = await page.evaluate(() =>
    [...document.querySelectorAll<SVGPathElement>(".react-flow__edge path")]
      .filter((p) => p.style.stroke.includes("var(")).length,
  );
  expect(varStrokesBefore, "default schematic should have var(--color) edge strokes").toBeGreaterThan(0);

  // Fit into view so all edges are inside the captured viewport.
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(400);

  // File → Export → Export as SVG, capturing the resulting download.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Export as SVG", exact: true }).click();
  const download = await downloadPromise;
  const svg = readFileSync(await download.path(), "utf8");

  expect(svg.length, "exported SVG should not be empty").toBeGreaterThan(1000);
  // The regression: pre-fix, edge strokes serialized as unresolved `var(--color-…)`.
  expect(svg, "no edge stroke should serialize as an unresolved CSS var").not.toMatch(
    /stroke\s*[:=]\s*["']?\s*var\(--color/i,
  );
  // And concrete colors must be present (the lines actually got a color).
  expect(svg, "exported SVG should carry concrete stroke colors").toMatch(/stroke\s*[:=]\s*["']?\s*(rgb\(|#)/i);
});

// #176 (File→Open path) — the showOpenFilePicker "Open..." path must also reject
// non-schematic JSON. This was the real gap: it had no shape check AND a catch that
// swallowed errors silently, so junk files showed no error at all.
test("#176 File→Open of non-schematic JSON shows the Invalid alert (picker path)", async ({ page }) => {
  // Mock the File System Access picker before load — return valid-but-non-schematic JSON.
  await page.addInitScript(() => {
    // @ts-expect-error test shim
    window.showOpenFilePicker = async () => [{
      name: "junk.json",
      getFile: async () =>
        new File([JSON.stringify({ hello: "world" })], "junk.json", { type: "application/json" }),
    }];
  });
  await boot(page);

  const before = await page.locator(".react-flow__node").count();
  expect(before).toBeGreaterThan(0);

  const dialogs: string[] = [];
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: /^Open\.\.\./ }).click();
  await page.waitForTimeout(600);

  expect(dialogs.join(" | "), "File→Open of junk JSON should alert").toContain("Invalid schematic file.");
  expect(await page.locator(".react-flow__node").count(), "junk Open must not wipe the canvas").toBe(before);
});

// #180 (regression from the first fix) — installing an expansion card must add ports
// that SURVIVE Apply. The editor's local port state went stale after swapCard, so Apply
// wrote the old list back and the card's ports vanished. The fix re-syncs ports on the
// live port-id signature.
test("#180 installing a card adds ports that survive Apply", async ({ page }) => {
  await boot(page);
  await page.locator(".react-flow__node").first().dblclick({ force: true });
  await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });

  const portRows = page.locator('input[placeholder="Port label"]');
  const initial = await portRows.count();

  await page.getByRole("button", { name: "+ Add Slot" }).click();
  await page.locator('input[placeholder="family"]').first().fill("disguise-vfc");
  await page.waitForTimeout(300);

  // Install a bundled card from that family — its ports should appear in the editor.
  const cardSelect = page.locator("select").filter({ has: page.locator('option[value="vfc-card-hdmi20"]') });
  await cardSelect.selectOption("vfc-card-hdmi20");
  await page.waitForTimeout(400);

  const afterInstall = await portRows.count();
  expect(afterInstall, "card ports should show in the editor after install").toBeGreaterThan(initial);

  // Apply (handleSave) — the regression clobbered the card's ports here.
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForTimeout(400);

  // Reopen — the card's ports must still be present.
  await page.locator(".react-flow__node").first().dblclick({ force: true });
  await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });
  expect(await portRows.count(), "card ports must persist after Apply (#180)").toBe(afterInstall);
});

// Port duplication: adding a port then Apply→reopen used to clone it. A just-saved
// draft port lingered in local editor state and got merged back in on every reopen,
// so the count grew by one each Apply→reopen cycle (1 → 2 → 3 …).
test("adding a port does not duplicate it on Apply→reopen", async ({ page }) => {
  await boot(page);
  await page.locator(".react-flow__node").first().dblclick({ force: true });
  await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });

  const portRows = page.locator('input[placeholder="Port label"]');
  const initial = await portRows.count();

  // Add an input port and name it (unnamed ports are dropped on save). The new row
  // lands inside the Inputs section, not necessarily last in the DOM, so name the
  // freshly-added empty-valued row rather than `.last()`.
  await page.getByRole("button", { name: "+ Add", exact: true }).first().click();
  await expect(portRows).toHaveCount(initial + 1);
  const count = await portRows.count();
  let named = false;
  for (let i = 0; i < count; i++) {
    if ((await portRows.nth(i).inputValue()) === "") {
      await portRows.nth(i).fill("DupProbe");
      named = true;
      break;
    }
  }
  expect(named, "a fresh empty port row should exist to name").toBe(true);

  // Apply + reopen twice — the bug added one extra copy on every cycle.
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator(".react-flow__node").first().dblclick({ force: true });
    await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });
    expect(
      await portRows.count(),
      "the added port must persist exactly once, not duplicate on reopen",
    ).toBe(initial + 1);
  }
});

// #211 — an empty expansion slot renders a "(empty)" bay on the device, and the
// slot's eye toggle in the editor hides that bay from the canvas.
test("#211 empty-slot bay shows on the device and can be hidden via the slot toggle", async ({ page }) => {
  await boot(page);
  await page.locator(".react-flow__node").first().dblclick({ force: true });
  await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "+ Add Slot" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForTimeout(300);

  const withSlot = await page.getByText(/\(empty\)/).count();
  expect(withSlot, "the empty slot's bay row should render on the device").toBeGreaterThan(0);

  // Reopen and hide the empty slot via its eye toggle.
  await page.locator(".react-flow__node").first().dblclick({ force: true });
  await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });
  await page.getByTitle("Hide empty slot on the device").click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForTimeout(300);

  expect(
    await page.getByText(/\(empty\)/).count(),
    "the hidden empty slot should no longer render on the device",
  ).toBeLessThan(withSlot);
});

// #210 — the minimap is optional: an ✕ hides it, and View ▸ Minimap restores it
// (preference persisted to localStorage).
test("#210 minimap hides via ✕ and restores from the View menu", async ({ page }) => {
  await boot(page);

  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible();

  // Dismiss via the ✕ button on the minimap.
  await page.getByRole("button", { name: "Hide minimap" }).click();
  await expect(minimap).toHaveCount(0);

  // Bring it back from View ▸ Minimap.
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: /Minimap/ }).click();
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
});

// #180 — adding an expansion slot in the device editor must NOT wipe the other fields.
test("#180 adding an expansion slot keeps the Device Name field", async ({ page }) => {
  await boot(page);

  // Open the device editor for the first device node. force: a child label inside
  // the node intercepts the hit-test, but the dblclick still bubbles to the node.
  await page.locator(".react-flow__node").first().dblclick({ force: true });

  const nameInput = page.getByPlaceholder("e.g. Camera 1");
  await expect(nameInput).toBeVisible({ timeout: 10_000 });

  const probe = "ZZ-slot-probe";
  await nameInput.fill(probe);
  await expect(nameInput).toHaveValue(probe);

  // Add an expansion slot — this used to reset the whole form.
  await page.getByRole("button", { name: "+ Add Slot" }).click();
  await page.waitForTimeout(400);

  await expect(nameInput, "Device Name should survive adding a slot (#180)").toHaveValue(probe);

  // The new slot row must actually appear in the editor's Expansion Slots list
  // (a fresh empty slot adds no ports, so it's invisible on the canvas device until
  // a card is installed — that's by design, not the bug).
  await expect(
    page.locator('input[placeholder="Slot label"]'),
    "the added slot should show up in the editor's slot list",
  ).toHaveValue("Slot 1");
});

// #180 — the reporter's exact flow: while CREATING a NEW device (not editing an
// existing one), fill in Name/Manufacturer and some I/O, then add an expansion slot.
// Adding the slot must not reset ANY in-progress field. This exercises the
// creating-node path (createAndEditDevice → editingNodeId === creatingNodeId) and
// asserts Name, Manufacturer AND a freshly-typed I/O port all survive — the previous
// #180 test only covered an already-placed device and only the Name field.
test("#180 new-device: adding an expansion slot keeps name, manufacturer and I/O", async ({ page }) => {
  await boot(page);

  // Double-click empty canvas → QuickAdd → Create New Device → Start Blank.
  await page.locator(".react-flow__pane").dblclick({ position: { x: 220, y: 220 } });
  await page.locator("span").filter({ hasText: /^Create New Device$/ }).click();
  await page.getByText("Start Blank", { exact: true }).click();

  const nameInput = page.getByPlaceholder("e.g. Camera 1");
  const mfrInput = page.getByPlaceholder("e.g. Sony");
  await expect(nameInput).toBeVisible({ timeout: 10_000 });

  await nameInput.fill("Field Recorder 9000");
  await mfrInput.fill("Atomos");

  // Add an input port and label it (the reporter's "add in all the I/O" step).
  await page.getByRole("button", { name: "+ Add", exact: true }).first().click();
  const portLabel = page.getByPlaceholder("Port label").first();
  await portLabel.fill("SDI In 1");
  await expect(portLabel).toHaveValue("SDI In 1");

  // Now add an expansion slot — the reported symptom was a full form reset here.
  await page.getByRole("button", { name: "+ Add Slot" }).click();
  await page.waitForTimeout(400);

  await expect(nameInput, "Device Name must survive adding a slot on a new device (#180)").toHaveValue("Field Recorder 9000");
  await expect(mfrInput, "Manufacturer must survive adding a slot on a new device (#180)").toHaveValue("Atomos");
  await expect(
    page.getByPlaceholder("Port label").first(),
    "the typed I/O port must survive adding a slot on a new device (#180)",
  ).toHaveValue("SDI In 1");
  await expect(
    page.locator('input[placeholder="Slot label"]'),
    "the added slot should show up in the editor's slot list",
  ).toHaveValue("Slot 1");
});

// #194 — bulk-add expansion slots: one form adds a numbered range of slots in a
// single step (the slot analog of bulk-add I/O), for large modular frames.
test("#194 bulk-add creates a numbered range of expansion slots", async ({ page }) => {
  await boot(page);
  await page.locator(".react-flow__node").first().dblclick({ force: true });
  await expect(page.getByPlaceholder("e.g. Camera 1")).toBeVisible({ timeout: 10_000 });

  // Open the slots Bulk Add form — scope to the Expansion Slots controls so it
  // doesn't pick up the I/O section's own "+ Bulk Add".
  const slotControls = page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "+ Add Slot" }) })
    .last();
  await slotControls.getByRole("button", { name: "+ Bulk Add" }).click();

  // Defaults add Slot 1..4 → the submit button reads "Add 4".
  await page.getByRole("button", { name: "Add 4" }).click();
  await page.waitForTimeout(300);

  const slotLabels = page.locator('input[placeholder="Slot label"]');
  await expect(slotLabels, "bulk add should create 4 slot rows").toHaveCount(4);
  await expect(slotLabels.nth(0)).toHaveValue("Slot 1");
  await expect(slotLabels.nth(3)).toHaveValue("Slot 4");
});
