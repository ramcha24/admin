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

    -- Stored ideas (from Store flow or ingestion)
    CREATE TABLE IF NOT EXISTS ideas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL DEFAULT '',
      summary     TEXT NOT NULL DEFAULT '',
      raw_text    TEXT NOT NULL DEFAULT '',
      tags        TEXT NOT NULL DEFAULT '[]',
      source      TEXT NOT NULL DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- Village: identity (singleton)
    CREATE TABLE IF NOT EXISTS village_identity (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      username     TEXT NOT NULL DEFAULT 'ram',
      display_name TEXT NOT NULL DEFAULT 'Ram',
      platform_url TEXT NOT NULL DEFAULT 'http://localhost:7700',
      avatar_emoji TEXT NOT NULL DEFAULT '🌿'
    );

    -- Village: relationship tags
    CREATE TABLE IF NOT EXISTS village_tags (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      icon        TEXT DEFAULT '🏷️',
      color       TEXT DEFAULT '#6366f1',
      description TEXT DEFAULT ''
    );

    -- Village: default tool access per tag
    CREATE TABLE IF NOT EXISTS village_tag_defaults (
      tag_id  TEXT NOT NULL REFERENCES village_tags(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL,
      level   TEXT NOT NULL,
      PRIMARY KEY (tag_id, tool_id)
    );

    -- Village: members
    CREATE TABLE IF NOT EXISTS village_members (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL DEFAULT '',
      village_handle TEXT DEFAULT '',
      avatar_emoji TEXT DEFAULT '👤',
      tag_id       TEXT REFERENCES village_tags(id),
      notes        TEXT DEFAULT '',
      joined_at    TEXT DEFAULT (datetime('now'))
    );

    -- Village: per-person access overrides (NULL level = explicit revoke)
    CREATE TABLE IF NOT EXISTS village_access (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id  TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
      tool_id    TEXT NOT NULL,
      level      TEXT,
      granted_at TEXT DEFAULT (datetime('now')),
      UNIQUE(member_id, tool_id)
    );

    -- Village: activity feed (source of truth, local)
    CREATE TABLE IF NOT EXISTS village_activity (
      id            TEXT PRIMARY KEY,
      source_tool   TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      payload       TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT DEFAULT (datetime('now')),
      synced_at     TEXT
    );

    -- Village: interactions from members (comments, reactions, collaborator actions)
    CREATE TABLE IF NOT EXISTS village_interactions (
      id          TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      member_id   TEXT NOT NULL,
      member_name TEXT NOT NULL,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now')),
      read_at     TEXT
    );

    -- Village: notification preferences
    CREATE TABLE IF NOT EXISTS village_notifications (
      member_id    TEXT PRIMARY KEY REFERENCES village_members(id) ON DELETE CASCADE,
      frequency    TEXT DEFAULT 'daily',
      last_sent_at TEXT
    );
  `)

  // Seed default LLM settings if not present
  const setDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  setDefault.run('llm_provider', 'ollama')
  setDefault.run('llm_model', 'claude-haiku-4-5-20251001')
  setDefault.run('ollama_base_url', 'http://localhost:11434')
  setDefault.run('ollama_model', 'gemma3:latest')
  // Supabase (placeholder — fill in Admin Settings to enable cloud sync)
  setDefault.run('supabase_url', 'https://YOUR_PROJECT.supabase.co')
  setDefault.run('supabase_anon_key', 'YOUR_ANON_KEY')
  // Email digest (SMTP) — placeholder, fill in Settings to enable
  setDefault.run('smtp_host', '')
  setDefault.run('smtp_port', '587')
  setDefault.run('smtp_user', '')
  setDefault.run('smtp_pass', '')
  setDefault.run('smtp_from', '')

  // Seed default village identity
  db.prepare(`
    INSERT OR IGNORE INTO village_identity (id, username, display_name, avatar_emoji)
    VALUES (1, 'ram', 'Ram', '🌿')
  `).run()
}

function getDb() { return db }

module.exports = { initDatabase, getDb }
