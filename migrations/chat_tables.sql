CREATE TABLE chat_users (uid TEXT PRIMARY KEY, username TEXT, avatar_url TEXT, status TEXT DEFAULT 'offline', last_seen INTEGER, created_at INTEGER);

CREATE TABLE chat_rooms (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'group', created_by TEXT, created_at INTEGER, updated_at INTEGER, last_message_at INTEGER);

CREATE TABLE room_members (room_id TEXT, user_id TEXT, role TEXT DEFAULT 'member', joined_at INTEGER, PRIMARY KEY(room_id, user_id));

CREATE TABLE chat_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT, type TEXT DEFAULT 'text', reply_to TEXT, deleted INTEGER DEFAULT 0, created_at INTEGER);

CREATE TABLE chat_reactions (message_id TEXT, user_id TEXT, reaction TEXT, created_at INTEGER, PRIMARY KEY(message_id, user_id));

CREATE TABLE chat_read_receipts (room_id TEXT, user_id TEXT, last_read_at INTEGER, PRIMARY KEY(room_id, user_id));

CREATE TABLE chat_friends (user_uid TEXT, friend_uid TEXT, created_at INTEGER, PRIMARY KEY(user_uid, friend_uid));

CREATE INDEX idx_chat_msg_room ON chat_messages(room_id, created_at DESC);
CREATE INDEX idx_chat_msg_user ON chat_messages(user_id);
CREATE INDEX idx_room_member ON room_members(user_id);
