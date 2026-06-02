import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getOpenAiWorkflowConfig } from "../../tateside-api/src/openaiResponses.ts";
import { getEscalationReason, getHighRiskDeviceTypes } from "../../tateside-api/src/deviceResearch.ts";
import { openDatabase, runMigrations } from "../../tateside-api/src/db.ts";
import { saveTemplates, listCurrentTemplates } from "../../tateside-api/src/deviceStore.ts";
import type { DeviceTemplate } from "../types";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.OPENAI_QUOTE_EXTRACTION_MODEL;
  delete process.env.OPENAI_DEVICE_RESEARCH_MODEL;
  delete process.env.OPENAI_DEVICE_ESCALATION_MODEL;
  delete process.env.OPENAI_QUOTE_EXTRACTION_REASONING_EFFORT;
  delete process.env.OPENAI_DEVICE_RESEARCH_REASONING_EFFORT;
  delete process.env.OPENAI_DEVICE_ESCALATION_REASONING_EFFORT;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("quote import research config", () => {
  it("uses the required default model routing and reasoning effort", () => {
    const config = getOpenAiWorkflowConfig();
    expect(config.quoteExtractionModel).toBe("gpt-5.4-nano");
    expect(config.deviceResearchModel).toBe("gpt-5.4-mini");
    expect(config.deviceEscalationModel).toBe("gpt-5.4");
    expect(config.quoteExtractionReasoningEffort).toBe("low");
    expect(config.deviceResearchReasoningEffort).toBe("medium");
    expect(config.deviceEscalationReasoningEffort).toBe("medium");
  });

  it("flags low-confidence and high-risk drafts for escalation", () => {
    const highRiskTemplate: Omit<DeviceTemplate, "id" | "version"> = {
      label: "Q-SYS Core 110f",
      manufacturer: "QSC",
      modelNumber: "Core 110f",
      deviceType: "audio-dsp",
      category: "Audio",
      referenceUrl: "https://www.qsys.com/",
      ports: [],
    };

    expect(getHighRiskDeviceTypes()).toContain("audio-dsp");
    expect(getEscalationReason(highRiskTemplate, "high", true, [], { ok: true, errors: [], warnings: [] }))
      .toMatch(/High-risk device type/);
    expect(getEscalationReason(highRiskTemplate, "medium", true, [], { ok: true, errors: [], warnings: [] }))
      .toBe("Confidence is medium");
    expect(getEscalationReason(highRiskTemplate, "high", false, [], { ok: true, errors: [], warnings: [] }))
      .toBe("No official manufacturer source was found");
  });

  it("preserves AI provenance when an approved draft is saved through the normal library path", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "quote-import-ai-save-"));
    tempDirs.push(dir);

    const db = openDatabase(path.join(dir, "tateside.db"));
    runMigrations(db);

    saveTemplates(db, {
      templates: [
        {
          label: "Sony SRG-A40",
          manufacturer: "Sony",
          modelNumber: "SRG-A40",
          deviceType: "ptz-camera",
          category: "Sources",
          referenceUrl: "https://pro.sony/",
          ports: [
            {
              id: "port-1",
              label: "HDMI",
              signalType: "hdmi",
              connectorType: "hdmi",
              direction: "output",
            },
          ],
          aiMetadata: {
            origin: "ai_quote_import",
            quoteFilename: "sample-quote.pdf",
            extractedManufacturer: "Sony",
            extractedModel: "SRG-A40",
            modelUsed: "gpt-5.4-mini",
            reasoningEffort: "medium",
            researchedAt: "2026-06-02T12:00:00.000Z",
            confidence: "high",
            officialSourceFound: true,
            sourceReferences: [
              {
                title: "Sony SRG-A40",
                url: "https://pro.sony/",
                sourceType: "manufacturer_product_page",
              },
            ],
            warnings: [],
            escalationRequired: false,
            escalationReason: null,
            approvedAt: "2026-06-02T12:05:00.000Z",
          },
        },
      ],
      source: "ai-quote-import-approval",
    });

    const saved = listCurrentTemplates(db)[0];
    expect(saved?.aiMetadata?.origin).toBe("ai_quote_import");
    expect(saved?.aiMetadata?.quoteFilename).toBe("sample-quote.pdf");
    expect(saved?.aiMetadata?.modelUsed).toBe("gpt-5.4-mini");
    expect(saved?.aiMetadata?.sourceReferences[0]?.url).toBe("https://pro.sony/");

    db.close();
  });
});
