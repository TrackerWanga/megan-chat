-- Reactions table
CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (message_id, user_id, reaction),
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Read receipts
CREATE TABLE IF NOT EXISTS read_receipts (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Thread replies (parent_message_id added to messages)
ALTER TABLE messages ADD COLUMN parent_message_id TEXT;
ALTER TABLE messages ADD COLUMN edited INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN edited_at INTEGER;
ALTER TABLE messages ADD COLUMN deleted INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN deleted_at INTEGER;

-- User blocks
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_uid TEXT NOT NULL,
  blocked_uid TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (blocker_uid, blocked_uid),
  FOREIGN KEY (blocker_uid) REFERENCES users(uid),
  FOREIGN KEY (blocked_uid) REFERENCES users(uid)
);

-- Polls
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  creator_uid TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL, -- JSON array
  multiple_choice INTEGER DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (creator_uid) REFERENCES users(uid)
);

-- Poll votes
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (poll_id, user_id),
  FOREIGN KEY (poll_id) REFERENCES polls(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Scheduled messages
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  sent INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Admin roles
ALTER TABLE room_members ADD COLUMN permissions TEXT DEFAULT '{"can_send":true,"can_delete":false,"can_ban":false,"can_pin":false}';
