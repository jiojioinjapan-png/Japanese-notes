-- Opaque session tokens are kept only in HttpOnly cookies. D1 stores their hashes.
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  signature TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);

-- Atomic login budgets survive Worker restarts and work across isolates.
CREATE TABLE auth_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_expiry ON auth_attempts(reset_at);
