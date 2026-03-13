const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

const dbPath = path.join(app.getPath('userData'), 'admin.db')
let db

function initDatabase() {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema()
  return db
}

function createSchema() {
  db.exec(`
    -- Tool registry (populated from tool.json manifests at startup)
    CREATE TABLE IF NOT EXISTS tool_registry (
      id           TEXT PRIMARY KEY,
      name         TEXT,
      icon         TEXT,
      description  TEXT,
      color        TEXT,
      version      TEXT,
      status       TEXT,
      dir_path     TEXT,
      launch_dev   TEXT,
      launch_app   TEXT,
      capabilities TEXT,
      emits        TEXT,
      listens      TEXT,
      last_seen_at TEXT
    );

    -- Event bus (Level 2 — seeded now, used when tools are ready)
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      source_tool  TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      payload      TEXT,
      consumed_by  TEXT DEFAULT '[]',
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- Workflow rules (Level 3 — schema created now, UI built later)
    CREATE TABLE IF NOT EXISTS workflows (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT,
      trigger_tool    TEXT,
      trigger_event   TEXT,
      action_tool     TEXT,
      action_type     TEXT,
      action_payload  TEXT,
      enabled         INTEGER DEFAULT 1,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Settings
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)
}

function getDb() { return db }

module.exports = { initDatabase, getDb }
