-- Soft claim system for review queue — prevents mods from duplicating review work
ALTER TABLE submissions ADD COLUMN claimed_by TEXT REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN claimed_at TEXT;
