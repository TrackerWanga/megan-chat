-- Users (reuse Firebase Auth, this is for chat profiles)
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline',
  last_seen INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- API Keys for developers
CREATE TABLE IF NOT EXISTS api_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  rate_limit INTEGER DEFAULT 1000,
  active BOOLEAN DEFAULT true,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Chat rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('direct','group','channel')) DEFAULT 'group',
  created_by TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (created_by) REFERENCES users(uid)
);

-- Room members
CREATE TABLE IF NOT EXISTS room_members (
  room_id TEXT,
  user_id TEXT,
  role TEXT DEFAULT 'member',
  joined_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Friend requests
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_uid TEXT NOT NULL,
  to_uid TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending','accepted','rejected')) DEFAULT 'pending',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (from_uid) REFERENCES users(uid),
  FOREIGN KEY (to_uid) REFERENCES users(uid)
);

-- Friends
CREATE TABLE IF NOT EXISTS friends (
  user_uid TEXT,
  friend_uid TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (user_uid, friend_uid),
  FOREIGN KEY (user_uid) REFERENCES users(uid),
  FOREIGN KEY (friend_uid) REFERENCES users(uid)
);

-- Push notification tokens
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id TEXT,
  token TEXT NOT NULL,
  platform TEXT DEFAULT 'web',
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, token),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);
