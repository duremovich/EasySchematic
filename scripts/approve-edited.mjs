#!/usr/bin/env node
/**
 * Approve a submission with edits applied to the data.
 * Usage: node approve-edited.mjs <submission-id> <json-edits>
 *
 * json-edits is a JSON object of fields to override in the submission data.
 * Special keys:
 *   _portEdits: array of {match: {label: "X"}, set: {signalType: "Y"}} to edit first matching port
 *   _portEditsAll: array of {match: {field: val}, set: {field: val}} to edit ALL matching ports
 *   _removePorts: array of port labels to remove
 *   _addPorts: array of port objects to add
 *   _trimLabels: true to trim whitespace from all port labels
 */
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const TMPFILE = join(process.cwd(), "__tmp_sql.sql");

function d1Read(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const out = execSync(`npx wrangler d1 execute easyschematic-db --remote --command "${escaped}"`, {
    cwd: process.cwd(), encoding: "utf-8", timeout: 90000, stdio: ["pipe", "pipe", "pipe"]
  });
  const match = out.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0])[0].results;
}

function d1Write(sql) {
  writeFileSync(TMPFILE, sql, "utf-8");
  try {
    execSync(`npx wrangler d1 execute easyschematic-db --remote --file="${TMPFILE}"`, {
      cwd: process.cwd(), encoding: "utf-8", timeout: 90000, stdio: ["pipe", "pipe", "pipe"]
    });
  } finally {
    try { unlinkSync(TMPFILE); } catch {}
  }
}

const CATEGORIES = {
  "camera": "Sources", "ptz-camera": "Sources", "camera-ccu": "Sources", "graphics": "Sources",
  "computer": "Sources", "media-player": "Sources",
  "mouse": "Peripherals", "keyboard": "Peripherals", "dock": "Peripherals",
  "video-bar": "Codecs", "codec": "Codecs",
  "touch-screen": "Control", "screen": "Projection",
  "switcher": "Switching", "router": "Switching",
  "presentation-system": "Switching", "wireless-presentation": "Switching",
  "converter": "Processing", "scaler": "Processing", "adapter": "Processing",
  "frame-sync": "Processing", "multiviewer": "Processing", "capture-card": "Processing", "chromakey": "Processing",
  "da": "Distribution", "video-wall-controller": "Distribution", "hdmi-splitter": "Distribution",
  "monitor": "Displays", "tv": "Displays",
  "projector": "Projection", "recorder": "Recording",
  "audio-mixer": "Mixing Consoles",
  "audio-embedder": "Audio I/O", "audio-interface": "Audio I/O", "stage-box": "Audio I/O",
  "audio-dsp": "Audio", "equalizer": "Audio", "headphone-amplifier": "Audio", "personal-monitor": "Audio",
  "wired-mic": "Microphones", "wireless-mic-receiver": "Microphones", "iem-transmitter": "Microphones",
  "speaker": "Speakers", "studio-monitor": "Speakers",
  "amplifier": "Amplifiers",
  "ndi-encoder": "Networking", "ndi-decoder": "Networking", "network-switch": "Networking",
  "streaming-encoder": "Networking", "av-over-ip": "Networking", "network-router": "Networking", "network-wifi": "Networking",
  "kvm-extender": "KVM / Extenders", "hdbaset-extender": "KVM / Extenders",
  "wireless-video": "Wireless",
  "intercom": "Intercom", "intercom-transceiver": "Intercom",
  "commentary-box": "Intercom", "phone-hybrid": "Intercom",
  "led-processor": "LED Video", "led-cabinet": "LED Video",
  "media-server": "Media Servers",
  "lighting-console": "Lighting", "moving-light": "Lighting", "led-fixture": "Lighting",
  "dmx-splitter": "Lighting", "dmx-node": "Lighting", "lighting-processor": "Lighting",
  "control-processor": "Control", "tally-system": "Control", "ptz-controller": "Control",
  "sync-generator": "Control", "timecode-generator": "Control", "midi-device": "Control",
  "control-expansion": "Control", "controller": "Control",
  "cable-accessory": "Cable Accessories",
  "power-distribution": "Infrastructure", "patch-panel": "Infrastructure", "company-switch": "Infrastructure",
  "expansion-chassis": "Audio Expansion",
  "expansion-card": "Expansion Cards",
  "cloud-service": "Cloud Services",
  "power-mixer": "Powered Mixers",
  "nas": "Storage", "external-storage": "Storage",
  "audio-meter": "Monitoring", "video-scope": "Monitoring",
};

function esc(s) { return s ? s.replace(/'/g, "''") : ""; }

const [submissionId, editsJson] = process.argv.slice(2);
if (!submissionId) { console.error("Usage: node approve-edited.mjs <id> [json-edits]"); process.exit(1); }

const edits = editsJson ? JSON.parse(editsJson) : {};

// Fetch submission
const rows = d1Read(`SELECT * FROM submissions WHERE id = '${esc(submissionId)}' AND status IN ('pending', 'deferred')`);
if (!rows.length) { console.error("Not found or already reviewed"); process.exit(1); }

const sub = rows[0];
const data = JSON.parse(sub.data);

// Apply field overrides
const { _portEdits, _portEditsAll, _removePorts, _addPorts, _trimLabels, ...fieldOverrides } = edits;
Object.assign(data, fieldOverrides);

// Trim port labels
if (_trimLabels) {
  data.ports = data.ports.map(p => ({ ...p, label: p.label.trim() }));
}

// Apply port edits
if (_portEdits) {
  for (const edit of _portEdits) {
    const port = data.ports.find(p => {
      return Object.entries(edit.match).every(([k, v]) => p[k] === v);
    });
    if (port) Object.assign(port, edit.set);
  }
}

// Apply bulk port edits (all matches)
if (_portEditsAll) {
  for (const edit of _portEditsAll) {
    for (const port of data.ports) {
      if (Object.entries(edit.match).every(([k, v]) => port[k] === v)) {
        Object.assign(port, edit.set);
      }
    }
  }
}

// Remove ports
if (_removePorts) {
  data.ports = data.ports.filter(p => !_removePorts.includes(p.label));
}

// Add ports
if (_addPorts) {
  data.ports.push(..._addPorts);
}

const category = CATEGORIES[data.deviceType] || data.category || "Other";
console.log(`${sub.action}: ${data.label} (${data.deviceType} -> ${category})`);
console.log(`Ports: ${data.ports.length}`);

const numOrNull = (v) => (v != null ? v : "NULL");
const strOrNull = (v) => (v ? `'${esc(v)}'` : "NULL");
const jsonOrNull = (v) => (v ? `'${esc(JSON.stringify(v))}'` : "NULL");

if (sub.action === "update" && sub.template_id) {
  const sql = `UPDATE templates SET device_type = '${esc(data.deviceType)}', category = '${esc(category)}', label = '${esc(data.label)}', manufacturer = ${strOrNull(data.manufacturer)}, model_number = ${strOrNull(data.modelNumber)}, color = ${strOrNull(data.color)}, image_url = ${strOrNull(data.imageUrl)}, reference_url = ${strOrNull(data.referenceUrl)}, search_terms = ${jsonOrNull(data.searchTerms)}, ports = '${esc(JSON.stringify(data.ports))}', slots = ${jsonOrNull(data.slots)}, slot_family = ${strOrNull(data.slotFamily)}, power_draw_w = ${numOrNull(data.powerDrawW)}, power_capacity_w = ${numOrNull(data.powerCapacityW)}, voltage = ${strOrNull(data.voltage)}, poe_budget_w = ${numOrNull(data.poeBudgetW)}, poe_draw_w = ${numOrNull(data.poeDrawW)}, height_mm = ${numOrNull(data.heightMm)}, width_mm = ${numOrNull(data.widthMm)}, depth_mm = ${numOrNull(data.depthMm)}, weight_kg = ${numOrNull(data.weightKg)}, is_venue_provided = ${data.isVenueProvided ? 1 : "NULL"}, version = version + 1, updated_at = CURRENT_TIMESTAMP, last_edited_by = '${esc(sub.user_id)}' WHERE id = '${esc(sub.template_id)}';`;
  d1Write(sql);

} else if (sub.action === "create") {
  const templateId = crypto.randomUUID();
  const sql = `INSERT INTO templates (id, version, device_type, category, label, manufacturer, model_number, color, image_url, reference_url, search_terms, ports, slots, slot_family, power_draw_w, power_capacity_w, voltage, poe_budget_w, poe_draw_w, height_mm, width_mm, depth_mm, weight_kg, is_venue_provided, sort_order, submitted_by) VALUES ('${templateId}', 1, '${esc(data.deviceType)}', '${esc(category)}', '${esc(data.label)}', ${strOrNull(data.manufacturer)}, ${strOrNull(data.modelNumber)}, ${strOrNull(data.color)}, ${strOrNull(data.imageUrl)}, ${strOrNull(data.referenceUrl)}, ${jsonOrNull(data.searchTerms)}, '${esc(JSON.stringify(data.ports))}', ${jsonOrNull(data.slots)}, ${strOrNull(data.slotFamily)}, ${numOrNull(data.powerDrawW)}, ${numOrNull(data.powerCapacityW)}, ${strOrNull(data.voltage)}, ${numOrNull(data.poeBudgetW)}, ${numOrNull(data.poeDrawW)}, ${numOrNull(data.heightMm)}, ${numOrNull(data.widthMm)}, ${numOrNull(data.depthMm)}, ${numOrNull(data.weightKg)}, ${data.isVenueProvided ? 1 : "NULL"}, 0, '${esc(sub.user_id)}');`;
  d1Write(sql);
  console.log(`Template ID: ${templateId}`);
}

d1Write(`UPDATE submissions SET status='approved', reviewed_at=datetime('now') WHERE id='${esc(submissionId)}';`);
console.log("APPROVED");
