-- Soft-delete flag on templates. Moderators flag a template for deletion with a reason;
-- the flag hides it from public reads. Only admins can clear the flag (restore) or hard-delete.
-- Schema parallels the needs_review / needs_review_reason pair from migration 0026.

ALTER TABLE templates ADD COLUMN flagged_for_deletion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN flagged_for_deletion_reason TEXT;
ALTER TABLE templates ADD COLUMN flagged_for_deletion_at TEXT;
ALTER TABLE templates ADD COLUMN flagged_for_deletion_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_templates_flagged_deletion
  ON templates(flagged_for_deletion)
  WHERE flagged_for_deletion = 1;
