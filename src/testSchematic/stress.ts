/**
 * Generated stress fixture (#383/#384 test-report follow-up, 2026-09-05).
 *
 * The seeded test schematic (#307) is a curated small scene; it can't exercise
 * the failure modes that only appear at scale — mass-selection drags, marquee
 * sweeps over ~100 objects, and large-bounds exports. This scene exists for
 * those: a deterministic grid of SCALE_COLS × SCALE_ROWS two-port devices,
 * chained with connections, spanning wide enough bounds that the export raster
 * caps engage.
 *
 * It is generated in code rather than committed as JSON: nothing in it is
 * hand-curated, and the interesting property is only its size. Load it with
 * `?fixture=stress` (any build) — File ▸ Load Test Schematic stays the curated
 * fixture.
 */
import { CURRENT_SCHEMA_VERSION } from "../migrations";
import type {
  ConnectionEdge,
  Port,
  SchematicFile,
  SchematicNode,
  SignalType,
} from "../types";
import { signalCssColor } from "../typeRegistry";

export const STRESS_FIXTURE_NAME = "EasySchematic Stress Fixture";

const SCALE_COLS = 12;
const SCALE_ROWS = 10;
const COL_GAP = 320;
const ROW_GAP = 224;

const SIGNALS: SignalType[] = ["hdmi", "sdi", "ethernet", "analog-audio", "fiber"];

export function buildStressSchematic(): SchematicFile {
  const nodes: SchematicNode[] = [];
  const edges: ConnectionEdge[] = [];

  for (let row = 0; row < SCALE_ROWS; row++) {
    for (let col = 0; col < SCALE_COLS; col++) {
      const i = row * SCALE_COLS + col;
      const signal = SIGNALS[i % SIGNALS.length];
      const ports: Port[] = [
        { id: `s${i}-in`, label: "In 1", signalType: signal, direction: "input", connectorType: "bnc" },
        { id: `s${i}-out`, label: "Out 1", signalType: signal, direction: "output", connectorType: "bnc" },
      ];
      nodes.push({
        id: `stress-${i}`,
        type: "device",
        position: { x: col * COL_GAP, y: row * ROW_GAP },
        data: {
          label: `Stress Device ${i + 1}`,
          deviceType: "converter",
          ports,
        },
      } as SchematicNode);
    }
  }

  // Chain each device's output to the next device of the SAME signal type, so
  // every wire is signal-valid and the router gets long multi-column runs.
  for (let i = 0; i + SIGNALS.length < nodes.length; i++) {
    const j = i + SIGNALS.length;
    // Shape matches schematic.json exactly — the 2026-09-05-2 pass caught two
    // divergences as wireless PNG exports: an unregistered `type` falls back to
    // React Flow's default bezier, and a missing inline `style.stroke` leaves
    // the wire on React Flow's stylesheet var() default, which Chromium's
    // html-to-image clone drops (#173 — freezeSvgColors freezes inline strokes
    // only, because every app-created edge carries one).
    const signal = SIGNALS[i % SIGNALS.length];
    edges.push({
      id: `stress-edge-${i}`,
      source: `stress-${i}`,
      sourceHandle: `s${i}-out`,
      target: `stress-${j}`,
      targetHandle: `s${j}-in`,
      style: { stroke: signalCssColor(signal), strokeWidth: 2 },
      data: { signalType: signal },
    } as ConnectionEdge);
  }

  return {
    version: CURRENT_SCHEMA_VERSION,
    name: STRESS_FIXTURE_NAME,
    nodes,
    edges,
  };
}
