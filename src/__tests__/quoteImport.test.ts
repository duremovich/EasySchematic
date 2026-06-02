import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDatabase, runMigrations } from "../../tateside-api/src/db.ts";
import { inspectQuoteDevicesAgainstLibrary, matchQuoteDevicesAgainstLibrary, normalizedLookupKey } from "../../tateside-api/src/quoteImport.ts";
import { saveTemplates } from "../../tateside-api/src/deviceStore.ts";
import type { DeviceTemplate } from "../types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTemplate(overrides: Partial<DeviceTemplate> = {}): Omit<DeviceTemplate, "id" | "version"> {
  return {
    label: "Shure ULXD4Q",
    manufacturer: "Shure",
    modelNumber: "ULXD4Q",
    deviceType: "wireless-receiver",
    category: "Audio",
    ports: [
      {
        id: "port-1",
        label: "Dante",
        signalType: "dante",
        connectorType: "rj45",
        direction: "bidirectional",
      },
    ],
    ...overrides,
  };
}

describe("quote import matching", () => {
  it("classifies exact, possible, and missing results", () => {
    const templates = [
      { id: "shure-ulxd4q", version: 1, ...createTemplate() },
      { id: "qsys-core", version: 1, ...createTemplate({
        label: "Q-SYS Core 110f",
        manufacturer: "QSC",
        modelNumber: "Core 110f",
        deviceType: "audio-processor",
      }) },
    ];

    const results = matchQuoteDevicesAgainstLibrary(
      [
        {
          manufacturer: "Shure",
          model: "ULXD4Q",
          description: null,
          quantity: 2,
          sourceLineText: "Shure ULXD4Q receiver",
          normalizedLookupKey: normalizedLookupKey("Shure", "ULXD4Q"),
        },
        {
          manufacturer: "QSC",
          model: "Core 110",
          description: null,
          quantity: null,
          sourceLineText: "QSC Core 110",
          normalizedLookupKey: normalizedLookupKey("QSC", "Core 110"),
        },
        {
          manufacturer: "Biamp",
          model: "TesiraFORTE X 400",
          description: null,
          quantity: null,
          sourceLineText: "Biamp TesiraFORTE X 400",
          normalizedLookupKey: normalizedLookupKey("Biamp", "TesiraFORTE X 400"),
        },
      ],
      templates,
    );

    expect(results[0]?.status).toBe("already_in_library");
    expect(results[0]?.exactMatch?.id).toBe("shure-ulxd4q");

    expect(results[1]?.status).toBe("possible_match");
    expect(results[1]?.possibleMatches[0]?.id).toBe("qsys-core");

    expect(results[2]?.status).toBe("missing");
    expect(results[2]?.possibleMatches).toHaveLength(0);
  });

  it("does not write to SQLite when only inspecting quote matches", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "quote-import-test-"));
    tempDirs.push(dir);

    const db = openDatabase(path.join(dir, "tateside.db"));
    runMigrations(db);

    saveTemplates(db, {
      templates: [createTemplate()],
      source: "test-seed",
    });

    const count = (sql: string): number => {
      const row = db.prepare(sql).get() as { n: number };
      return row.n;
    };

    const before = {
      devices: count("SELECT COUNT(*) AS n FROM devices"),
      versions: count("SELECT COUNT(*) AS n FROM device_versions"),
      audit: count("SELECT COUNT(*) AS n FROM device_audit_log"),
    };

    const results = inspectQuoteDevicesAgainstLibrary(db, [
      {
        manufacturer: "Shure",
        model: "ULXD4Q",
        description: null,
        quantity: 1,
        sourceLineText: "Shure ULXD4Q",
        normalizedLookupKey: normalizedLookupKey("Shure", "ULXD4Q"),
      },
    ]);

    const after = {
      devices: count("SELECT COUNT(*) AS n FROM devices"),
      versions: count("SELECT COUNT(*) AS n FROM device_versions"),
      audit: count("SELECT COUNT(*) AS n FROM device_audit_log"),
    };

    expect(results[0]?.status).toBe("already_in_library");
    expect(after).toEqual(before);

    db.close();
  });
});
