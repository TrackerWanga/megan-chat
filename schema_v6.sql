ALTER TABLE users ADD COLUMN megan_id TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS verification_codes (
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  method TEXT DEFAULT 'firebase',
  PRIMARY KEY (phone, code)
);
