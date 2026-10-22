-- Fails safely if existing accounts have duplicate links; resolve those before applying.
CREATE UNIQUE INDEX members_discord_id_unique ON members(discord_id) WHERE discord_id IS NOT NULL;
CREATE TABLE registration_confirmations (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  guild_id TEXT,
  name TEXT NOT NULL,
  chapter_id INTEGER NOT NULL,
  candidate_ids TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
);
