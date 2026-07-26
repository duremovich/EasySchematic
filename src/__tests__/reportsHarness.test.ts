import { describe, it, expect } from "vitest";
import {
  kitchenSinkFixture,
  defaultSchematicReportFixture,
  loadFileFixtures,
  type ReportFixture,
} from "../reportsHarness/fixtures";
import { computeReportsSnapshot, type ReportsSnapshot } from "../reportsHarness/snapshot";
import { checkInvariants } from "../reportsHarness/invariants";
import { loadGolden, diffSnapshots } from "../reportsHarness/baseline";
import type { PackListData } from "../packList";
import type { CableScheduleRow } from "../cableSchedule";
import type { NetworkReportRow } from "../networkReport";
import type { PowerReportData } from "../powerReport";

const committedFixtures = [kitchenSinkFixture(), defaultSchematicReportFixture()];
const fileFixtures = loadFileFixtures();

function snapshotOf(fx: ReportFixture): ReportsSnapshot {
  return computeReportsSnapshot(fx);
}

describe("reports harness — invariants hold on every fixture", () => {
  for (const fx of [...committedFixtures, ...fileFixtures]) {
    it(`${fx.name}: CSVs well-formed, layouts consistent, totals double-enter`, () => {
      const problems = checkInvariants(fx, snapshotOf(fx));
      if (problems.length) throw new Error(`\n  ${problems.join("\n  ")}`);
      expect(problems).toHaveLength(0);
    });
  }
});

describe("reports harness — no drift vs committed goldens", () => {
  for (const fx of committedFixtures) {
    it(`${fx.name} matches its golden snapshot`, () => {
      const golden = loadGolden(fx.name);
      expect(
        golden,
        `missing golden for "${fx.name}" — run \`npm run reports:baseline\``,
      ).not.toBeNull();
      const diffs = diffSnapshots(golden, snapshotOf(fx));
      if (diffs.length) {
        throw new Error(
          `\nReport output changed vs golden (run \`npm run reports:baseline\` if intended):\n  ${diffs.join("\n  ")}`,
        );
      }
      expect(diffs).toHaveLength(0);
    });
  }
});

describe("reports harness — kitchen sink exercises every report section", () => {
  const snap = snapshotOf(kitchenSinkFixture());
  const pack = snap.packList.data as PackListData;
  const cableRows = snap.cableSchedule.rows as CableScheduleRow[];
  const netRows = snap.networkReport.rows as NetworkReportRow[];
  const power = snap.powerReport.data as PowerReportData;

  it("pack list has devices, adapters, accessories, racks, cable summary", () => {
    expect(pack.devices.length).toBeGreaterThan(0);
    expect(pack.adapters.length).toBeGreaterThan(0);
    expect(pack.accessories.length).toBeGreaterThan(0);
    expect(pack.racks.length).toBeGreaterThan(0);
    expect(pack.summary.length).toBeGreaterThan(0);
  });

  it("groups the two identical cameras and the two identical racks", () => {
    const cams = pack.devices.find((d) => d.model === "ProCam 4K");
    expect(cams?.count).toBe(2);
    expect(cams?.serialNumbers.sort()).toEqual(["SN-001", "SN-002"]);
    const mainRack = pack.racks.find((r) => r.label === "Main Rack");
    expect(mainRack?.count).toBe(2);
    expect(mainRack?.unitCost).toBe(1200);
  });

  it("counts the cold spare and excludes the venue-provided device", () => {
    const mixers = pack.devices.find((d) => d.model === "MixDesk 24");
    expect(mixers?.count).toBe(2);
    expect(mixers?.spareCount).toBe(1);
    expect(pack.devices.some((d) => d.model === "House PA")).toBe(false);
  });

  it("cable schedule collapses the stubbed runs and carries the v0.42 columns", () => {
    const v001 = cableRows.find((r) => r.cableId === "V001");
    expect(v001?.gaugeAwg).toBe("22");
    expect(v001?.cableAlias).toBe("CAM-A");
    expect(v001?.tested).toBe("✓ 2026-06-01");
    expect(v001?.cableUse).toBe("field");
    // Stubbed runs appear once with real endpoints on both ends
    const stubRow = cableRows.find((r) => r.cableId === "E010");
    expect(stubRow?.sourceDevice).toBe("Core Router");
    expect(stubRow?.targetDevice).toBe("Show PC");
    expect(cableRows.some((r) => r.bundle === "Camera Loom")).toBe(true);
    expect(cableRows.some((r) => r.multicableLabel === "Audio Snake")).toBe(true);
  });

  it("network report resolves the DHCP server across the stub (#220)", () => {
    const pcRow = netRows.find((r) => r.deviceLabel === "Show PC");
    expect(pcRow?.dhcp).toBe(true);
    expect(pcRow?.dhcpServerLabel).toBe("Core Router");
    expect(snap.networkReport.dhcpServers.length).toBe(1);
    expect(snap.networkReport.poeBudget.length).toBe(1);
  });

  it("raises the duplicate-IP, ip-in-range, and subnet-conflict warnings", () => {
    expect(Object.keys(snap.warnings.duplicateIps)).toContain("10.10.10.150");
    const dhcp = snap.warnings.dhcp as { type: string }[];
    expect(dhcp.some((w) => w.type === "ip-in-range")).toBe(true);
    expect((snap.warnings.subnetConflicts as unknown[]).length).toBeGreaterThan(0);
  });

  it("power report counts the stubbed feed into the distro load (#172)", () => {
    expect(power.distros).toHaveLength(1);
    // Switcher 350W (direct) + Show PC 150W (via stub)
    expect(power.distros[0].loadW).toBe(500);
  });

  it("patch panel schedule has front and rear rows for the passthrough port", () => {
    expect(snap.patchPanelSchedule.rows.length).toBeGreaterThan(0);
  });
});
