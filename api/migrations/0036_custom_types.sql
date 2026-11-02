-- Community types: device types (P1), signals and connectors (P3) that
-- moderators add on the devices site without a code deploy.
-- See .claude/plans/custom-types.md.
--
-- One table for all three kinds. Kind-specific fields live in `data` (JSON):
--   device:    { category, description? }
--   signal:    (P3) { color, group, defaultConnector, cable, cablePrefix, description? }
--   connector: (P3) { group, cable, gender, matesWith[], adaptsTo[], description? }
--
-- `id` is permanent once created (guardrail 3): label and data stay editable,
-- a type in use is retired (hidden from pickers, still renders), never renamed.
-- Writes bump library_meta.version, which also backs GET /types' ETag.
CREATE TABLE IF NOT EXISTS custom_types (
  kind TEXT NOT NULL CHECK (kind IN ('device', 'signal', 'connector')),
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  reason_or_url TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, id)
);
