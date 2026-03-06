'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '../game.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_players (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL,
    name                TEXT NOT NULL,
    api_key             TEXT NOT NULL,
    model               TEXT DEFAULT 'openai/gpt-4o-mini',
    provider_base_url   TEXT DEFAULT 'https://openrouter.ai/api/v1',
    is_active           INTEGER DEFAULT 1,
    personality         TEXT DEFAULT 'You are a curious and resourceful adventurer. Explore, gather resources, build things, and survive!',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    player_id          INTEGER PRIMARY KEY,
    x                  REAL DEFAULT 0,
    y                  REAL DEFAULT 64,
    z                  REAL DEFAULT 0,
    health             REAL DEFAULT 20,
    hunger             REAL DEFAULT 20,
    inventory          TEXT DEFAULT '[]',
    last_action        TEXT DEFAULT '',
    last_thought       TEXT DEFAULT '',
    blocks_mined       INTEGER DEFAULT 0,
    distance_traveled  REAL DEFAULT 0,
    FOREIGN KEY (player_id) REFERENCES ai_players(id) ON DELETE CASCADE
  );
`);

module.exports = db;
