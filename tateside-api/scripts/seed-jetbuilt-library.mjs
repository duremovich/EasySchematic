#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, ".tateside-data");
const INPUT_PATH = process.env.JETBUILT_ENRICHED_PATH
  ? path.resolve(process.env.JETBUILT_ENRICHED_PATH)
  : path.resolve(DATA_DIR, "jetbuilt", "devices-final-enriched.json");
const DB_PATH = process.env.TATESIDE_DB_PATH
  ? path.resolve(process.env.TATESIDE_DB_PATH)
  : path.resolve(DATA_DIR, "tateside.db");
const SUMMARY_PATH = path.resolve(DATA_DIR, "jetbuilt", "seed-summary.json");

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  unique_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  manufacturer TEXT,
  model_number TEXT,
  device_type TEXT NOT NULL,
  category TEXT,
  current_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_email TEXT,
  updated_by_email TEXT,
  deleted_at TEXT,
  FOREIGN KEY (current_version_id) REFERENCES device_versions(id)
);

CREATE TABLE IF NOT EXISTS device_versions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  template_json TEXT NOT NULL,
  source TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_email TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE (device_id, version)
);

CREATE TABLE IF NOT EXISTS device_audit_log (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devices_updated_at ON devices(updated_at);
CREATE INDEX IF NOT EXISTS idx_device_versions_device_id ON device_versions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_audit_log_device_id ON device_audit_log(device_id);
`;

function normalize(value) {
  return String(value ?? "").trim();
}

function slug(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function templateUniqueKey(template) {
  const maker = normalize(template.manufacturer) || "generic";
  const model = normalize(template.modelNumber) || template.label;
  return [maker, model, template.deviceType].map(slug).filter(Boolean).join(":");
}

function makeDeviceId(template) {
  const maker = slug(template.manufacturer || "generic");
  const model = slug(template.modelNumber || template.label);
  const prefix = ["tateside", maker, model].filter(Boolean).join("-");
  return `${prefix || "tateside-device"}-${randomUUID().slice(0, 8)}`;
}

function portIds(ports) {
  return (ports ?? []).map((port, index) => ({
    ...port,
    id: normalize(port.id) || `port-${index + 1}`,
    label: normalize(port.label),
  }));
}

function mergePorts(basePorts, overridePorts) {
  const seen = new Set();
  const merged = [];
  for (const port of [...(basePorts ?? []), ...(overridePorts ?? [])]) {
    const signature = [
      normalize(port.label),
      normalize(port.signalType),
      normalize(port.direction),
      normalize(port.connectorType),
      normalize(port.section),
      normalize(port.gender),
      normalize(port.rearConnectorType),
      normalize(port.frontConnectorType),
    ].join("::");
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push({ ...port });
  }
  return merged.map((port, index) => ({ ...port, id: normalize(port.id) || `port-${index + 1}` }));
}

function isEnriched(template) {
  return !!template?.referenceUrl && !String(template.referenceUrl).includes("app.jetbuilt.com");
}

const raw = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
const templates = raw.filter(isEnriched).map((template) => ({
  ...template,
  label: normalize(template.label),
  deviceType: normalize(template.deviceType),
  manufacturer: template.manufacturer != null ? normalize(template.manufacturer) : undefined,
  modelNumber: template.modelNumber != null ? normalize(template.modelNumber) : undefined,
  category: template.category != null ? normalize(template.category) : undefined,
  shortName: template.shortName != null ? normalize(template.shortName) : undefined,
  referenceUrl: template.referenceUrl != null ? normalize(template.referenceUrl) : undefined,
  ports: portIds(template.ports),
}));

const deduped = new Map();
for (const template of templates) {
  const key = templateUniqueKey(template);
  const existing = deduped.get(key);
  if (!existing) {
    deduped.set(key, template);
    continue;
  }
  const merged = {
    ...existing,
    ...template,
    ports: mergePorts(existing.ports, template.ports),
  };
  const existingScore = (existing.ports?.length ?? 0) * 1000 + normalize(existing.label).length;
  const incomingScore = (template.ports?.length ?? 0) * 1000 + normalize(template.label).length;
  deduped.set(key, incomingScore >= existingScore ? merged : {
    ...template,
    ports: mergePorts(template.ports, existing.ports),
  });
}

const uniqueTemplates = [...deduped.values()];

if (!uniqueTemplates.length) {
  throw new Error(`No enriched templates found in ${INPUT_PATH}`);
}

mkdirSync(path.dirname(DB_PATH), { recursive: true });
mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(SCHEMA_SQL);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

const insertDevice = db.prepare(`
  INSERT INTO devices (
    id, unique_key, label, manufacturer, model_number, device_type, category,
    created_by_email, updated_by_email
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertVersion = db.prepare(`
  INSERT INTO device_versions (
    id, device_id, version, template_json, source, note, created_by_email
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertAudit = db.prepare(`
  INSERT INTO device_audit_log (
    id, device_id, action, actor_email, details_json
  )
  VALUES (?, ?, ?, ?, ?)
`);

db.exec("BEGIN");
try {
  db.exec("DELETE FROM device_audit_log");
  db.exec("DELETE FROM device_versions");
  db.exec("DELETE FROM devices");

  let inserted = 0;
  for (const template of uniqueTemplates) {
    const deviceId = makeDeviceId(template);
    const versionId = randomUUID();
    const uniqueKey = templateUniqueKey(template);
    const templateJson = JSON.stringify(template);

    insertDevice.run(
      deviceId,
      uniqueKey,
      template.label,
      template.manufacturer ?? null,
      template.modelNumber ?? null,
      template.deviceType,
      template.category ?? null,
      null,
      null,
    );

    insertVersion.run(
      versionId,
      deviceId,
      1,
      templateJson,
      "jetbuilt-enriched",
      "Imported from Jetbuilt-enriched official-spec set",
      null,
    );

    insertAudit.run(
      randomUUID(),
      deviceId,
      "create",
      null,
      JSON.stringify({ source: "jetbuilt-enriched", version: 1 }),
    );

    db.prepare("UPDATE devices SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?").run(versionId, deviceId);
    inserted += 1;
  }

  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const summary = {
  dbPath: DB_PATH,
  sourcePath: INPUT_PATH,
  importedCount: uniqueTemplates.length,
  sourceCount: raw.length,
  matchedCount: uniqueTemplates.length,
  unmatchedCount: raw.length - uniqueTemplates.length,
  timestamp: new Date().toISOString(),
};

writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log("Jetbuilt library seed complete");
console.log(`Database: ${DB_PATH}`);
console.log(`Imported: ${uniqueTemplates.length}`);
console.log(`Summary: ${SUMMARY_PATH}`);
