/**
 * Rack side view in the PDF carries device labels, like the on-screen side view (#416).
 *
 * The on-screen side view (RackRenderer SideViewRack / RackFaceSVG face="side")
 * draws each device's name inside its depth bar; the PDF side view drew only the
 * bars. This drives the real `exportRackPdf` (fonts read from public/, jsPDF's
 * save intercepted, every `text()` call recorded) and checks the text drawn
 * after the side view's "Side" heading — i.e. inside the side view.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
import { exportRackPdf, drawSideView, loadInterFont } from "../rackPdf";
import type { DeviceData, RackElevationPage, SchematicNode } from "../types";

// Every text() call on every jsPDF the export builds, in draw order. `drawn`
// pairs each string with its rendered width and the width of the most recent
// rect — for a device label, that rect is the device's own bar.
const textCalls: string[] = [];
const drawn: { text: string; widthMm: number; lastRectWMm: number }[] = [];
vi.mock("jspdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jspdf")>();
  class RecordingJsPDF extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      this.save = (() => this) as unknown as typeof this.save;
      let lastRectWMm = NaN;
      const origRect = this.rect.bind(this);
      this.rect = ((x: number, y: number, w: number, ...rest: unknown[]) => {
        lastRectWMm = w;
        return (origRect as (...a: unknown[]) => jsPDF)(x, y, w, ...rest);
      }) as typeof this.rect;
      const origText = this.text.bind(this);
      this.text = ((text: string | string[], ...rest: unknown[]) => {
        for (const t of Array.isArray(text) ? text : [text]) {
          textCalls.push(t);
          drawn.push({ text: t, widthMm: this.getTextWidth(t), lastRectWMm });
        }
        return (origText as (...a: unknown[]) => jsPDF)(text, ...rest);
      }) as typeof this.text;
    }
  }
  return { ...actual, jsPDF: RecordingJsPDF };
});
const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (async (url: string) => {
    const buf = readFileSync(resolve(__dirname, "../../public", String(url).replace(/^\//, "")));
    return new Response(buf);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function device(id: string, data: Partial<DeviceData> & { label: string }): SchematicNode {
  return {
    id,
    type: "device",
    position: { x: 0, y: 0 },
    data: { deviceType: "network-switch", ports: [], ...data } as DeviceData,
  } as SchematicNode;
}

// The issue's repro: a 42U rack with 1100 mm frame depth, several devices of
// differing heights and depths on both faces, plus one shelf-mounted unit.
const nodes: SchematicNode[] = [
  device("sw1", { label: "Core Switch", heightMm: 44.45, depthMm: 300, headerColor: "#1d4ed8" }),
  device("srv1", { label: "Web Server", deviceType: "server", heightMm: 44.45, depthMm: 700 }),
  device("srv2", { label: "Database Server", deviceType: "server", heightMm: 88.9, depthMm: 900, headerColor: "#fde047" }),
  device("srv3", { label: "Backup Server", deviceType: "server", heightMm: 88.9, depthMm: 750 }),
  device("nuc", { label: "Mac Mini Server", deviceType: "computer", heightMm: 36, widthMm: 197, depthMm: 120 }),
];

const rackPage: RackElevationPage = {
  id: "rack-page-1",
  type: "rack-elevation",
  label: "Racks",
  racks: [
    { id: "rack-1", label: "Rack A", rackType: "floor-19", heightU: 42, depthMm: 1100, widthClass: "19in", position: { x: 0, y: 0 } },
  ],
  placements: [
    { id: "p1", rackId: "rack-1", deviceNodeId: "sw1", uPosition: 40, face: "front" },
    { id: "p2", rackId: "rack-1", deviceNodeId: "srv1", uPosition: 30, face: "front" },
    { id: "p3", rackId: "rack-1", deviceNodeId: "srv2", uPosition: 20, face: "rear" },
    { id: "p4", rackId: "rack-1", deviceNodeId: "srv3", uPosition: 10, face: "front" },
    { id: "p5", rackId: "rack-1", deviceNodeId: "nuc", uPosition: 5, face: "front", mountedOnShelfId: "shelf-1" },
  ],
  accessories: [
    { id: "shelf-1", rackId: "rack-1", type: "shelf", uPosition: 5, heightU: 2, face: "front", shelfDepthMm: 500 },
  ],
};

describe("rack PDF side view labels (#416)", () => {
  it("Export Rack PDF draws every device's label inside the side view", async () => {
    textCalls.length = 0;
    drawn.length = 0;
    await exportRackPdf({ pages: [rackPage], nodes, schematicName: "Rack Test" });

    // The side view is drawn after both elevations, headed by "Side"; the stats
    // footer follows it. Text drawn between them belongs to the side view.
    const sideIdx = textCalls.indexOf("Side");
    expect(sideIdx).toBeGreaterThan(-1);
    const sideText = textCalls.slice(sideIdx + 1);

    // The shelf unit's 120 mm depth bar is too short for its full name at this
    // scale, so the screen's trim rule shortens it — match on the prefix.
    for (const label of ["Core Switch", "Web Server", "Database Server", "Backup Server", "Mac Mini"]) {
      expect(sideText.join("\n")).toContain(label);
    }
  });

  it("side-view labels fit inside their device bars on Letter (no font floor overflow)", async () => {
    drawn.length = 0;
    await exportRackPdf({ pages: [rackPage], nodes, schematicName: "Rack Test" });
    const sideIdx = drawn.findIndex((d) => d.text === "Side");
    expect(sideIdx).toBeGreaterThan(-1);
    const deviceNames = ["Core Switch", "Web Server", "Database Server", "Backup Server", "Mac Mini"];
    const labels = drawn.slice(sideIdx + 1).filter((d) => deviceNames.some((n) => d.text.startsWith(n)));
    // One label per device (none wrap at this size), the shelf unit's included.
    expect(labels).toHaveLength(5);
    for (const l of labels) {
      expect(l.widthMm, `"${l.text}" overflows its bar`).toBeLessThanOrEqual(l.lastRectWMm);
    }
  });

  it("print-sheet side viewports (no face label) carry labels and honour short names", async () => {
    textCalls.length = 0;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    await loadInterFont(doc);
    const shortNodes = [
      device("sw1", { label: "Cisco Catalyst 9300 48-Port Switch", shortName: "C9300-48", heightMm: 44.45, depthMm: 450 }),
    ];
    const deviceDataMap = new Map(shortNodes.map((n) => [n.id, n.data as DeviceData]));
    textCalls.length = 0;
    drawSideView(
      doc, rackPage.racks[0], [rackPage.placements[0]], [], deviceDataMap,
      10, 10, 120, 200, false, { useShortNames: true },
    );
    expect(textCalls).toContain("C9300-48");
    expect(textCalls).not.toContain("Side");
  });
});
