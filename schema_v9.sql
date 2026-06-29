CREATE TABLE IF NOT EXISTS report_notifications (message_id TEXT, reported_by TEXT, room_owner TEXT, reason TEXT, email_sent INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS developer_terms (user_id TEXT PRIMARY KEY, terms_text TEXT, auto_block_keywords TEXT);
CREATE TABLE IF NOT EXISTS device_pairing (user_id TEXT, pair_code TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS linked_devices (id TEXT PRIMARY KEY, user_id TEXT, device_name TEXT, device_type TEXT, linked_at INTEGER);
