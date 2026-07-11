/**
 * Golden-snapshot storage + diffing for the reports harness.
 *
 * Goldens live in src/__tests__/fixtures/reports/baselines/<fixture>.json.
 * Only the committed fixtures' goldens are whitelisted in .gitignore; goldens
 * for dropped-in client exports stay local.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReportsSnapshot } from "./snapshot";

const BASELINE_DIR = fileURLToPath(
  new URL("../__tests__/fixtures/reports/baselines", import.meta.url),
);

export function baselinePath(name: string): string {
  return `${BASELINE_DIR}/${name}.json`;
}

export function loadGolden(name: string): ReportsSnapshot | null {
  const path = baselinePath(name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ReportsSnapshot;
}

export function saveGolden(name: string, snap: ReportsSnapshot): void {
  if (!existsSync(BASELINE_DIR)) mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(baselinePath(name), JSON.stringify(snap, null, 2) + "\n");
}

const MAX_DIFFS = 30;

/** Structural deep-diff. Returns human-readable "path: golden → current" lines, capped. */
export function diffSnapshots(golden: unknown, current: unknown): string[] {
  const diffs: string[] = [];
  walk(golden, current, "", diffs);
  return diffs;
}

function fmt(v: unknown): string {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
}

/** Multi-line strings (the CSVs) get a per-line diff so the report is readable. */
function diffMultilineString(a: string, b: string, path: string, out: string[]): void {
  const al = a.split("\n");
  const bl = b.split("\n");
  if (al.length !== bl.length) {
    out.push(`${path}: line count ${al.length} → ${bl.length}`);
  }
  const n = Math.min(al.length, bl.length);
  for (let i = 0; i < n && out.length < MAX_DIFFS; i++) {
    if (al[i] !== bl[i]) {
      out.push(`${path} line ${i + 1}:\n      - ${al[i]}\n      + ${bl[i]}`);
    }
  }
}

function walk(a: unknown, b: unknown, path: string, out: string[]): void {
  if (out.length >= MAX_DIFFS) return;
  if (a === b) return;

  if (typeof a === "string" && typeof b === "string") {
    if (a.includes("\n") || b.includes("\n")) diffMultilineString(a, b, path, out);
    else out.push(`${path}: ${fmt(a)} → ${fmt(b)}`);
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: array length ${a.length} → ${b.length}`);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`, out);
    return;
  }

  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      if (out.length >= MAX_DIFFS) return;
      const p = path ? `${path}.${k}` : k;
      if (!(k in ao)) out.push(`${p}: (absent) → ${fmt(bo[k])}`);
      else if (!(k in bo)) out.push(`${p}: ${fmt(ao[k])} → (absent)`);
      else walk(ao[k], bo[k], p, out);
    }
    return;
  }

  out.push(`${path}: ${fmt(a)} → ${fmt(b)}`);
}
