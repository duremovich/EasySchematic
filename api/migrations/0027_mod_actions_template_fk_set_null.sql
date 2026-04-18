-- Allow deleting a template without losing its audit history.
-- mod_actions.template_id originally had REFERENCES templates(id) with no ON DELETE action,
-- which blocked template deletion whenever any mod_actions row referenced it.
-- Recreate the table with ON DELETE SET NULL so the audit log is preserved after delete.

CREATE TABLE mod_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moderator_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  submission_id TEXT REFERENCES submissions(id),
  template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
  before_data TEXT,
  after_data TEXT,
  submission_data_override TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO mod_actions_new (id, moderator_id, action, submission_id, template_id, before_data, after_data, submission_data_override, note, created_at)
SELECT id, moderator_id, action, submission_id, template_id, before_data, after_data, submission_data_override, note, created_at
FROM mod_actions;

DROP TABLE mod_actions;
ALTER TABLE mod_actions_new RENAME TO mod_actions;

CREATE INDEX IF NOT EXISTS idx_mod_actions_moderator ON mod_actions(moderator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_submission ON mod_actions(submission_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_created ON mod_actions(created_at DESC);
