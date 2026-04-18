CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_path TEXT NOT NULL,
  original_name TEXT,
  imported_at INTEGER NOT NULL,
  last_opened_at INTEGER,
  open_count INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  thumbnail_path TEXT,
  size_bytes INTEGER NOT NULL,
  tags TEXT
);

CREATE INDEX IF NOT EXISTS idx_artifacts_last_opened ON artifacts(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_pinned ON artifacts(pinned DESC, last_opened_at DESC);

CREATE TABLE IF NOT EXISTS storage (
  artifact_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, scope, key),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watched_folders (
  path TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
