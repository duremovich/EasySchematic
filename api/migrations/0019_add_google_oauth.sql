-- OAuth state parameters for CSRF protection (10-min TTL)
CREATE TABLE oauth_states (
  id TEXT PRIMARY KEY,
  return_to TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Track Google OAuth identity on users
ALTER TABLE users ADD COLUMN google_id TEXT;
CREATE UNIQUE INDEX idx_users_google_id ON users(google_id);
