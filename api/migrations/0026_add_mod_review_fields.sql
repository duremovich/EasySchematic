-- Moderator review interface upgrades:
--   * Approval metadata stamped on templates (date, approver, schema version).
--   * needs_review flag + reason for the "send back to review" flow.
--   * template_notes table for internal, moderator-only notes.

ALTER TABLE templates ADD COLUMN approved_at TEXT;
ALTER TABLE templates ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE templates ADD COLUMN approved_schema_version TEXT;
ALTER TABLE templates ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN needs_review_reason TEXT;

-- Backfill approved_at from the most recent mod_actions.approve row per template.
-- Falls back to the template's updated_at for rows that predate mod_actions.
UPDATE templates
SET approved_at = COALESCE(
  (SELECT MAX(ma.created_at)
     FROM mod_actions ma
    WHERE ma.template_id = templates.id
      AND ma.action = 'approve'),
  updated_at
);

CREATE INDEX IF NOT EXISTS idx_templates_needs_review ON templates(needs_review) WHERE needs_review = 1;

-- Internal moderator notes. One row per note. Any moderator can read/edit any row.
CREATE TABLE IF NOT EXISTS template_notes (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_template_notes_template ON template_notes(template_id, created_at DESC);
