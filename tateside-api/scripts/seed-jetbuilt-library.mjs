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
const SANITIZED_OUTPUT_PATH = path.resolve(DATA_DIR, "jetbuilt", "devices-library-ready.json");

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

function compact(value) {
  return normalize(value).replace(/\s+/g, " ");
}

function stripDecorativePrefixes(value) {
  return compact(value)
    .replace(/^\*+\s*[^*]+\*+\s*/g, "")
    .replace(/^\(\d+\)\s*/g, "");
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
    label: compact(port.label),
  }));
}

const NETWORK_CONNECTORS = new Set(["rj45", "ethercon", "sfp", "lc", "sc", "opticalcon", "qsfp", "qsfp28", "mpo"]);
const DEVICE_TYPE_TO_CATEGORY = {
  "touch-screen": "Control",
  "stage-box": "Audio I/O",
  "adapter": "Processing",
  "audio-dsp": "Audio",
  "monitor": "Displays",
  "access-point": "Networking",
  "switcher": "Switching",
};
const VIRTUAL_NETWORK_SIGNALS = new Set([
  "dante",
  "aes67",
  "avb",
  "ndi",
  "srt",
  "st2110",
  "rtsp",
  "rtmp",
  "mpeg-ts",
  "soundgrid",
  "artnet",
  "sacn",
  "ultranet",
  "aes50",
  "stageconnect",
  "ydif",
  "dx5",
  "dxlink",
  "gigaace",
  "fibreace",
  "dsnake",
  "digilink",
  "blu-link",
  "cresnet",
  "ebus",
]);

function isNetworkConnector(port) {
  return NETWORK_CONNECTORS.has(normalize(port.connectorType).toLowerCase());
}

function hasPhysicalNetworkPort(ports) {
  return ports.some((port) => normalize(port.signalType).toLowerCase() === "ethernet" && isNetworkConnector(port));
}

function isVirtualNetworkChannelPort(port) {
  const signalType = normalize(port.signalType).toLowerCase();
  const label = compact(port.label).toLowerCase();
  if (!VIRTUAL_NETWORK_SIGNALS.has(signalType)) return false;
  if (!isNetworkConnector(port)) return false;
  return /\b(rx|tx|channel|ch)\s*\d+\b/.test(label) || /\b\d+\s*x\s*\d+\b/.test(label);
}

function sanitizePorts(ports) {
  const normalizedPorts = portIds(ports);
  const hasNetworkJack = hasPhysicalNetworkPort(normalizedPorts);
  const filteredPorts = normalizedPorts.filter((port) => !(hasNetworkJack && isVirtualNetworkChannelPort(port)));
  return filteredPorts.map((port, index) => ({
    ...port,
    id: `port-${index + 1}`,
  }));
}

function sanitizeModelNumber(value) {
  let modelNumber = stripDecorativePrefixes(value);
  modelNumber = modelNumber.replace(/\s*\((wework|supplied with[^)]*|purchased on[^)]*|for [^)]*|single)\)\s*$/i, "");
  modelNumber = compact(modelNumber);
  return modelNumber;
}

function isUsefulSearchTerm(value) {
  const term = compact(value);
  const lower = term.toLowerCase();
  if (!term) return false;
  if (term.length > 120) return false;
  if (/[*]{2}|purchased on|supplied with|to use dsp from|lectern content ingest|remote hdmi input plates|mass quantity pricing/i.test(term)) return false;
  if (/\bwework\b/i.test(term)) return false;
  if ((term.match(/[.,;:]/g) ?? []).length > 3) return false;
  if (lower.split(" ").length > 12) return false;
  return true;
}

function sanitizeSearchTerms(template) {
  const baseTerms = [
    compact(template.manufacturer),
    sanitizeModelNumber(template.modelNumber),
    compact(template.label),
    `${compact(template.manufacturer)} ${sanitizeModelNumber(template.modelNumber)}`.trim(),
    template.shortName ? compact(template.shortName) : "",
    ...(template.searchTerms ?? []).map(compact),
  ];

  const unique = [];
  const seen = new Set();
  for (const term of baseTerms) {
    if (!isUsefulSearchTerm(term)) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(term);
  }
  return unique;
}

function isCodeLikeLabel(value) {
  const term = compact(value);
  if (!term) return true;
  if (!/[a-z]/i.test(term)) return true;
  if (/^\d+(?:[-/]\d+)*$/.test(term)) return true;
  if (/^[a-z]{1,3}\d[\w-]*$/i.test(term) && !/\s/.test(term)) return true;
  return false;
}

function compressProductName(value) {
  let term = compact(value).replace(/\s*\([^)]*\)\s*$/g, "");
  term = term.replace(/\s*[-–—]\s*(white|black|silver|grey|gray|pearl|ivory|w|b|wh|bk|blk|hz|lz|eu|us|uk|jp)\b.*$/i, "");
  const tokens = term.split(/\s+/);
  const stopWords = new Set([
    "loudspeaker",
    "loudspeakers",
    "speaker",
    "speakers",
    "amplifier",
    "amplifiers",
    "processor",
    "processors",
    "controller",
    "controllers",
    "adapter",
    "adapters",
    "encoder",
    "encoders",
    "decoder",
    "decoders",
    "switcher",
    "switchers",
    "module",
    "modules",
    "receiver",
    "receivers",
    "transmitter",
    "transmitters",
    "subwoofer",
    "system",
  ]);
  const stopIndex = tokens.findIndex((token, index) => index > 0 && stopWords.has(token.toLowerCase().replace(/[^a-z]/g, "")));
  if (stopIndex > 0) term = tokens.slice(0, stopIndex).join(" ");
  return compact(term);
}

function chooseCanonicalModelName(template) {
  const manufacturer = compact(template.manufacturer);
  const rawModelNumber = sanitizeModelNumber(template.modelNumber);
  const rawLabel = compact(template.label);

  if (rawModelNumber && /[a-z]/i.test(rawModelNumber)) return rawModelNumber;

  const candidates = [rawLabel, ...(template.searchTerms ?? []).map(compact)].filter(Boolean);
  for (const candidate of candidates) {
    const compressed = compressProductName(candidate);
    const lower = compressed.toLowerCase();
    if (!isCodeLikeLabel(compressed) && lower !== manufacturer.toLowerCase()) {
      return compressed;
    }
  }

  if (rawModelNumber) return rawModelNumber;
  if (rawLabel) return compressProductName(rawLabel) || rawLabel;
  return manufacturer || "Unknown Device";
}

function normalizeClassification(template) {
  const manufacturer = compact(template.manufacturer).toLowerCase();
  const modelNumber = sanitizeModelNumber(template.modelNumber).toLowerCase();
  const label = compact(template.label).toLowerCase();
  const searchBlob = (template.searchTerms ?? []).join(" ").toLowerCase();
  const ports = template.ports ?? [];

  const analogInputs = ports.filter((port) => normalize(port.signalType).toLowerCase() === "analog-audio" && normalize(port.direction).toLowerCase() === "input").length;
  const analogOutputs = ports.filter((port) => normalize(port.signalType).toLowerCase() === "analog-audio" && normalize(port.direction).toLowerCase() === "output").length;
  const hasEthernet = ports.some((port) => normalize(port.signalType).toLowerCase() === "ethernet");
  const hasVideoSignals = ports.some((port) => ["hdmi", "sdi", "displayport", "hdbaset", "ndi"].includes(normalize(port.signalType).toLowerCase()));

  let deviceType = template.deviceType;

  if ((manufacturer.includes("apple") && (label.includes("ipad") || modelNumber.includes("ipad") || searchBlob.includes("ipad"))) || label.includes("neat pad") || modelNumber.includes("neatpad")) {
    deviceType = "touch-screen";
  } else if (
    (manufacturer.includes("allen & heath") && /^ar\d+/i.test(template.modelNumber ?? "")) ||
    (deviceType === "switcher" && analogInputs >= 8 && analogOutputs >= 4 && hasEthernet && !hasVideoSignals)
  ) {
    deviceType = "stage-box";
  } else if (deviceType === "access-point" && /adapter/.test(`${label} ${modelNumber}`) && !/wireless access point|wifi|wi-fi|unifi|wap|ap\b/.test(`${label} ${searchBlob}`)) {
    deviceType = "adapter";
  }

  return {
    ...template,
    deviceType,
    category: DEVICE_TYPE_TO_CATEGORY[deviceType] ?? template.category,
  };
}

function makeDisplayLabel(template) {
  return chooseCanonicalModelName(template);
}

function sanitizeTemplate(template) {
  const canonicalModelName = chooseCanonicalModelName(template);
  return normalizeClassification({
    ...template,
    label: canonicalModelName,
    shortName: canonicalModelName,
    manufacturer: template.manufacturer != null ? compact(template.manufacturer) : undefined,
    modelNumber: canonicalModelName,
    category: template.category != null ? compact(template.category) : undefined,
    referenceUrl: template.referenceUrl != null ? compact(template.referenceUrl) : undefined,
    searchTerms: sanitizeSearchTerms(template),
    ports: sanitizePorts(template.ports),
  });
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
const templates = raw.filter(isEnriched).map((template) => sanitizeTemplate({
  ...template,
  label: compact(template.label),
  deviceType: normalize(template.deviceType),
  manufacturer: template.manufacturer != null ? compact(template.manufacturer) : undefined,
  modelNumber: template.modelNumber != null ? sanitizeModelNumber(template.modelNumber) : undefined,
  category: template.category != null ? compact(template.category) : undefined,
  shortName: template.shortName != null ? compact(template.shortName) : undefined,
  referenceUrl: template.referenceUrl != null ? compact(template.referenceUrl) : undefined,
  ports: template.ports,
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
writeFileSync(SANITIZED_OUTPUT_PATH, JSON.stringify(uniqueTemplates, null, 2) + "\n", "utf8");

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
  db.exec("DELETE FROM devices");
  db.exec("DELETE FROM device_versions");
  db.exec("DELETE FROM device_audit_log");

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
  sanitizedOutputPath: SANITIZED_OUTPUT_PATH,
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
