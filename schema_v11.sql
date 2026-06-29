CREATE TABLE IF NOT EXISTS room_invites (room_id TEXT, created_by TEXT, invite_code TEXT UNIQUE, expires_at INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS notification_prefs (user_id TEXT PRIMARY KEY, preferences TEXT);
