CREATE TABLE IF NOT EXISTS admin_logs (id TEXT PRIMARY KEY, action TEXT, target TEXT, admin_id TEXT, details TEXT, created_at INTEGER DEFAULT (unixepoch()));
ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN suspended_at INTEGER;
