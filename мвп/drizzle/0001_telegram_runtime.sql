CREATE TABLE IF NOT EXISTS bot_runtime (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS telegram_updates (
  id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
