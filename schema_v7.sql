-- Group calls
CREATE TABLE IF NOT EXISTS group_calls (
  id TEXT PRIMARY KEY,
  creator_uid TEXT NOT NULL,
  participants TEXT NOT NULL,
  call_type TEXT DEFAULT 'video',
  status TEXT DEFAULT 'ringing',
  started_at INTEGER,
  ended_at INTEGER
);

-- Stories
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  content TEXT,
  caption TEXT,
  bg_color TEXT DEFAULT '#6C63FF',
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL,
  viewer_uid TEXT NOT NULL,
  viewed_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (story_id, viewer_uid)
);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Add disappearing messages to rooms
ALTER TABLE chat_rooms ADD COLUMN disappearing_duration INTEGER DEFAULT 0;
