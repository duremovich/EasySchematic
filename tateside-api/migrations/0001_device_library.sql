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
