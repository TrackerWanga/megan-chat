-- Calls table for WebRTC signaling
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  caller_uid TEXT NOT NULL,
  callee_uid TEXT NOT NULL,
  status TEXT DEFAULT 'ringing',
  call_type TEXT DEFAULT 'video',
  started_at INTEGER,
  answered_at INTEGER,
  ended_at INTEGER,
  FOREIGN KEY (caller_uid) REFERENCES users(uid),
  FOREIGN KEY (callee_uid) REFERENCES users(uid)
);
