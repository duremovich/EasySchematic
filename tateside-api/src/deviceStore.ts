import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DeviceTemplate } from "../../src/types.js";
import { normalizeDeviceTemplate, validateDeviceTemplate } from "./validation.js";

export interface SaveTemplatesInput {
  templates: unknown[];
  note?: string;
  source?: string;
  actorEmail?: string | null;
}

export interface UpdateTemplateInput {
  template: unknown;
  note?: string;
  source?: string;
  actorEmail?: string | null;
}

interface DeviceRow {
  id: string;
  unique_key: string;
  label: string;
  manufacturer: string | null;
  model_number: string | null;
  device_type: string;
  category: string | null;
  template_json: string;
  version: number;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function templateUniqueKey(template: Omit<DeviceTemplate, "id" | "version">): string {
  const maker = template.manufacturer?.trim() || "generic";
  const model = template.modelNumber?.trim() || template.label;
  return [maker, model, template.deviceType].map(slug).filter(Boolean).join(":");
}

function makeDeviceId(template: Omit<DeviceTemplate, "id" | "version">): string {
  const maker = slug(template.manufacturer || "generic");
  const model = slug(template.modelNumber || template.label);
  const prefix = ["tateside", maker, model].filter(Boolean).join("-");
  return `${prefix || "tateside-device"}-${randomUUID().slice(0, 8)}`;
}

function asDeviceTemplate(row: DeviceRow): DeviceTemplate {
  const parsed = JSON.parse(row.template_json) as DeviceTemplate;
  return {
    ...parsed,
    id: row.id,
    version: row.version,
  };
}

function getActiveDeviceRow(db: DatabaseSync, deviceId: string): DeviceRow | undefined {
  return db
    .prepare(`
      SELECT
        d.id,
        d.unique_key,
        d.label,
        d.manufacturer,
        d.model_number,
        d.device_type,
        d.category,
        v.template_json,
        v.version
      FROM devices d
      JOIN device_versions v ON v.id = d.current_version_id
      WHERE d.id = ? AND d.deleted_at IS NULL
    `)
    .get(deviceId) as DeviceRow | undefined;
}

function saveNormalizedTemplate(
  db: DatabaseSync,
  template: Omit<DeviceTemplate, "id" | "version">,
  options: {
    deviceId?: string;
    note?: string;
    source?: string;
    actorEmail?: string | null;
  },
): DeviceTemplate {
  const uniqueKey = templateUniqueKey(template);
  const existing = options.deviceId
    ? getActiveDeviceRow(db, options.deviceId)
    : db
      .prepare("SELECT id, unique_key, label, manufacturer, model_number, device_type, category, '' AS template_json, 0 AS version FROM devices WHERE unique_key = ? AND deleted_at IS NULL")
      .get(uniqueKey) as DeviceRow | undefined;

  if (options.deviceId && !existing) {
    throw new Error("Template not found");
  }

  const conflicting = db
    .prepare("SELECT id FROM devices WHERE unique_key = ? AND deleted_at IS NULL")
    .get(uniqueKey) as { id: string } | undefined;
  if (conflicting && conflicting.id !== (existing?.id ?? options.deviceId)) {
    throw new Error("Another shared template already uses that manufacturer/model/device type");
  }

  const deviceId = existing?.id ?? options.deviceId ?? makeDeviceId(template);
  const previousVersion = db
    .prepare("SELECT max(version) AS version FROM device_versions WHERE device_id = ?")
    .get(deviceId) as { version: number | null } | undefined;
  const nextVersion = (previousVersion?.version ?? 0) + 1;
  const versionId = randomUUID();
  const templateJson = JSON.stringify(template);
  const actor = options.actorEmail ?? null;

  if (!existing) {
    db.prepare(`
      INSERT INTO devices (
        id, unique_key, label, manufacturer, model_number, device_type, category,
        created_by_email, updated_by_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deviceId,
      uniqueKey,
      template.label,
      template.manufacturer ?? null,
      template.modelNumber ?? null,
      template.deviceType,
      template.category ?? null,
      actor,
      actor,
    );
  }

  db.prepare(`
    INSERT INTO device_versions (
      id, device_id, version, template_json, source, note, created_by_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    versionId,
    deviceId,
    nextVersion,
    templateJson,
    options.source ?? null,
    options.note ?? null,
    actor,
  );

  db.prepare(`
    UPDATE devices
    SET
      unique_key = ?,
      label = ?,
      manufacturer = ?,
      model_number = ?,
      device_type = ?,
      category = ?,
      current_version_id = ?,
      updated_at = datetime('now'),
      updated_by_email = ?,
      deleted_at = NULL
    WHERE id = ?
  `).run(
    uniqueKey,
    template.label,
    template.manufacturer ?? null,
    template.modelNumber ?? null,
    template.deviceType,
    template.category ?? null,
    versionId,
    actor,
    deviceId,
  );

  db.prepare(`
    INSERT INTO device_audit_log (id, device_id, action, actor_email, details_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    deviceId,
    existing ? "update" : "create",
    actor,
    JSON.stringify({ version: nextVersion, source: options.source ?? null }),
  );

  return { ...template, id: deviceId, version: nextVersion };
}

export function listCurrentTemplates(db: DatabaseSync): DeviceTemplate[] {
  const rows = db
    .prepare(`
      SELECT
        d.id,
        d.unique_key,
        d.label,
        d.manufacturer,
        d.model_number,
        d.device_type,
        d.category,
        v.template_json,
        v.version
      FROM devices d
      JOIN device_versions v ON v.id = d.current_version_id
      WHERE d.deleted_at IS NULL
      ORDER BY
        lower(coalesce(d.category, '')),
        lower(coalesce(d.manufacturer, '')),
        lower(coalesce(d.model_number, d.label, '')),
        lower(d.label)
    `)
    .all() as unknown as DeviceRow[];

  return rows.map(asDeviceTemplate);
}

export function saveTemplates(db: DatabaseSync, input: SaveTemplatesInput): DeviceTemplate[] {
  if (!Array.isArray(input.templates)) {
    throw new Error("templates must be an array");
  }
  if (input.templates.length === 0) return [];
  if (input.templates.length > 100) {
    throw new Error("A maximum of 100 templates can be saved at once");
  }

  const normalized = input.templates.map((raw, index) => {
    const validation = validateDeviceTemplate(raw);
    if (!validation.ok) {
      throw new Error(`Template ${index + 1} is invalid: ${validation.errors.join("; ")}`);
    }
    return normalizeDeviceTemplate(raw);
  });

  const saved: DeviceTemplate[] = [];
  db.exec("BEGIN");
  try {
    for (const template of normalized) {
      saved.push(saveNormalizedTemplate(db, template, {
        note: input.note,
        source: input.source,
        actorEmail: input.actorEmail,
      }));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return saved;
}

export function updateTemplate(db: DatabaseSync, deviceId: string, input: UpdateTemplateInput): DeviceTemplate {
  const validation = validateDeviceTemplate(input.template);
  if (!validation.ok) {
    throw new Error(`Template is invalid: ${validation.errors.join("; ")}`);
  }
  const normalized = normalizeDeviceTemplate(input.template);

  db.exec("BEGIN");
  try {
    const saved = saveNormalizedTemplate(db, normalized, {
      deviceId,
      note: input.note,
      source: input.source ?? "manual-edit",
      actorEmail: input.actorEmail,
    });
    db.exec("COMMIT");
    return saved;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function deleteTemplate(
  db: DatabaseSync,
  deviceId: string,
  input: { actorEmail?: string | null; note?: string } = {},
): void {
  const existing = getActiveDeviceRow(db, deviceId);
  if (!existing) {
    throw new Error("Template not found");
  }

  db.exec("BEGIN");
  try {
    db.prepare(`
      UPDATE devices
      SET
        deleted_at = datetime('now'),
        updated_at = datetime('now'),
        updated_by_email = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(input.actorEmail ?? null, deviceId);

    db.prepare(`
      INSERT INTO device_audit_log (id, device_id, action, actor_email, details_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      deviceId,
      "delete",
      input.actorEmail ?? null,
      JSON.stringify({ note: input.note ?? null }),
    );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
