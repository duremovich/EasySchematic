/**
 * Designation-strip PDF export for the Patch Panels view.
 *
 * Each panel with passthrough ports gets a strip printed at 100% physical scale:
 * the 19" rack opening is 450.85 mm wide, so port pitch = 450.85 / portCount.
 * A full strip is wider than any printable page, so it's chunked into runs that
 * fit the page width, stacked as rows with scissor cut-marks — print at 100%,
 * cut, join, and slide into the panel's label holder.
 *
 * Data comes from resolvePortDisplay — the same resolution the on-screen panel
 * view uses, so screen and paper never disagree.
 */
import { jsPDF } from "jspdf";
import type { ConnectionEdge, DeviceData, SchematicNode } from "./types";
import { getPanelOccupancy, resolvePortDisplay } from "./patchCircuits";
import { getPageDimensions, REPORT_MARGIN_MM } from "./reportLayout";

const { widthMm: PAGE_W, heightMm: PAGE_H } = getPageDimensions("letter", "landscape");
const MARGIN = REPORT_MARGIN_MM;
const STRIP_OPENING_MM = 450.85; // usable 19" rack opening
const CELL_H = 12;
const ROW_GAP = 10;

export function exportPatchPanelStripsPdf(
  nodes: SchematicNode[],
  edges: ConnectionEdge[],
  cableIdMap: Record<string, string>,
  schematicName: string,
): void {
  const panels = nodes
    .filter((n) => n.type === "device" && (n.data as DeviceData).deviceType === "patch-panel")
    .filter((n) => (n.data as DeviceData).ports.some((p) => p.direction === "passthrough"))
    .sort((a, b) => ((a.data as DeviceData).label || "").localeCompare((b.data as DeviceData).label || ""));
  if (panels.length === 0) return;

  const occupancy = getPanelOccupancy(nodes, edges);
  const baseIdFor = (edge: ConnectionEdge) =>
    cableIdMap[edge.id] ?? (edge.data?.cableId as string | undefined) ?? "—";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const printableW = PAGE_W - 2 * MARGIN;
  let y = MARGIN;
  let firstPanel = true;

  const ensureRoom = (needed: number) => {
    if (y + needed <= PAGE_H - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * 0.9);
  doc.text(`${schematicName} — Patch Panel Designation Strips`, MARGIN, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("Print at 100% scale (no fit-to-page). Cut along the marks and join runs in order.", MARGIN, y + 9);
  doc.setTextColor(0);
  y += 16;

  for (const panel of panels) {
    const data = panel.data as DeviceData;
    const hiddenPorts = new Set((data.hiddenPorts as string[] | undefined) ?? []);
    const ports = data.ports.filter((p) => p.direction === "passthrough" && !hiddenPorts.has(p.id));
    if (ports.length === 0) continue;

    const pitch = STRIP_OPENING_MM / ports.length;
    const perRow = Math.max(1, Math.floor(printableW / pitch));

    if (!firstPanel) y += 4;
    firstPanel = false;

    const rowCount = Math.ceil(ports.length / perRow);
    ensureRoom(6 + rowCount * (CELL_H + ROW_GAP));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9 * 0.95);
    doc.text(
      `${data.label || "Unnamed Panel"}  ·  ${ports.length} ports  ·  pitch ${pitch.toFixed(1)} mm`,
      MARGIN, y + 3,
    );
    y += 6;

    for (let start = 0; start < ports.length; start += perRow) {
      ensureRoom(CELL_H + ROW_GAP);
      const chunk = ports.slice(start, start + perRow);
      const rowW = chunk.length * pitch;

      // Strip outline
      doc.setDrawColor(60);
      doc.setLineWidth(0.25);
      doc.rect(MARGIN, y, rowW, CELL_H);

      chunk.forEach((port, i) => {
        const x = MARGIN + i * pitch;
        if (i > 0) doc.line(x, y, x, y + CELL_H);

        const display = resolvePortDisplay(panel.id, port.id, occupancy, nodes, edges, baseIdFor);
        const portNo = String(start + i + 1).padStart(2, "0");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5);
        doc.setTextColor(130);
        doc.text(portNo, x + pitch / 2, y + 2.6, { align: "center" });
        doc.setTextColor(0);

        const clip = (s: string, size: number): string => {
          const maxW = pitch - 1.6;
          doc.setFontSize(size);
          let out = s;
          while (out.length > 1 && doc.getTextWidth(out) > maxW) out = out.slice(0, -1);
          return out === s ? s : out.slice(0, -1) + "…";
        };

        if (display) {
          const top = display.rear?.farLabel ?? "—";
          const bottom = display.front?.farLabel ?? "—";
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.text(clip(top, 6.5), x + pitch / 2, y + 6.4, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.text(clip(bottom, 6), x + pitch / 2, y + 10.6, { align: "center" });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(170);
          doc.text("—", x + pitch / 2, y + 8.2, { align: "center" });
          doc.setTextColor(0);
        }
      });

      // Cut marks + run label
      doc.setDrawColor(150);
      doc.setLineWidth(0.15);
      doc.line(MARGIN - 3, y - 1.5, MARGIN + 3, y - 1.5);
      doc.line(MARGIN + rowW - 3, y - 1.5, MARGIN + rowW + 3, y - 1.5);
      doc.setFontSize(5);
      doc.setTextColor(150);
      doc.text(
        `ports ${start + 1}–${start + chunk.length}`,
        MARGIN + rowW + 2, y + CELL_H / 2, { baseline: "middle" },
      );
      doc.setTextColor(0);

      y += CELL_H + ROW_GAP;
    }
  }

  doc.save(`${schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")} - Patch Panel Strips.pdf`);
}
