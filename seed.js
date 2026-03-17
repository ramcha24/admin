/**
 * seed.js — Populate admin.db with sample data for manual testing
 *
 * Usage: node seed.js
 *
 * Safe to re-run: inserts with OR IGNORE, so no duplicates.
 * Does NOT touch tool_registry or settings.
 */

const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')

const dbPath = path.join(
  os.homedir(),
  'Library/Application Support/admin/admin.db'
)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

console.log('Seeding admin.db at:', dbPath)

// ── Ideas ──────────────────────────────────────────────────────────────────────

const insertIdea = db.prepare(`
  INSERT OR IGNORE INTO ideas (title, summary, raw_text, tags, source, created_at)
  VALUES (?, ?, ?, ?, 'seed', ?)
`)

const ideas = [
  {
    title: 'Build a daily writing habit tracker',
    summary: 'A lightweight tool that lets you log daily writing sessions, track word counts, and visualise streaks over time. Integrates with an LLM to suggest prompts when you\'re stuck.',
    tags: ['writing', 'habits', 'tool-idea'],
    created_at: '2026-03-10 09:00:00',
  },
  {
    title: 'Research note-taking with graph view',
    summary: 'An extension to Think that renders all concluded nodes across all sessions as a knowledge graph. Nodes cluster by topic similarity; clicking navigates to the source session.',
    tags: ['think', 'research', 'graph', 'tool-idea'],
    created_at: '2026-03-12 14:30:00',
  },
  {
    title: 'Automated weekly review digest',
    summary: 'A workflow that runs every Sunday at 7pm, pulls the past week\'s Grove sessions and Think conclusions, and sends a structured email summary to yourself.',
    tags: ['automation', 'grove', 'think', 'workflow'],
    created_at: '2026-03-13 11:15:00',
  },
  {
    title: 'Village reaction emoji bar',
    summary: 'Add emoji reactions (👍❤️🔥💡) to village feed items so followers can react without leaving a full comment. Reactions stored in village_interactions with type = "reaction".',
    tags: ['village', 'ui', 'feature'],
    created_at: '2026-03-14 16:45:00',
  },
  {
    title: 'Pomodoro timer integrated with Grove sessions',
    summary: 'A floating Pomodoro timer that auto-creates a Grove session when a focus block starts and auto-ends it when the block finishes. Duration and breaks configurable in Settings.',
    tags: ['grove', 'focus', 'tool-idea'],
    created_at: '2026-03-15 08:00:00',
  },
]

for (const idea of ideas) {
  insertIdea.run(idea.title, idea.summary, idea.summary, JSON.stringify(idea.tags), idea.created_at)
}
console.log(`✓ Inserted ${ideas.length} sample ideas`)

// ── Village tags ───────────────────────────────────────────────────────────────

const insertTag = db.prepare(`
  INSERT OR IGNORE INTO village_tags (id, name, icon, color) VALUES (?, ?, ?, ?)
`)
const insertTagDefault = db.prepare(`
  INSERT OR IGNORE INTO village_tag_defaults (tag_id, tool_id, level) VALUES (?, ?, ?)
`)

const tags = [
  { id: 'tag-family',  name: 'Family',  icon: '🏠', color: '#10b981' },
  { id: 'tag-friends', name: 'Friends', icon: '🫂', color: '#6366f1' },
  { id: 'tag-mentor',  name: 'Mentor',  icon: '🎓', color: '#f59e0b' },
]

for (const tag of tags) {
  insertTag.run(tag.id, tag.name, tag.icon, tag.color)
}

// Tag defaults: family gets reader access; friends get follower; mentor gets collaborator
for (const tool of ['grove', 'think']) {
  insertTagDefault.run('tag-family',  tool, 'reader')
  insertTagDefault.run('tag-friends', tool, 'follower')
  insertTagDefault.run('tag-mentor',  tool, 'collaborator')
}
console.log(`✓ Inserted ${tags.length} village tags with defaults`)

// ── Village members ────────────────────────────────────────────────────────────

const insertMember = db.prepare(`
  INSERT OR IGNORE INTO village_members (id, name, email, avatar_emoji, tag_id, joined_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const insertAccess = db.prepare(`
  INSERT OR IGNORE INTO village_access (member_id, tool_id, level) VALUES (?, ?, ?)
`)
const insertNotif = db.prepare(`
  INSERT OR IGNORE INTO village_notifications (member_id, frequency) VALUES (?, ?)
`)

const members = [
  { id: 'member-alice', name: 'Alice Chen',    email: 'alice@example.com',  emoji: '🌸', tag: 'tag-family',  freq: 'daily'  },
  { id: 'member-bob',   name: 'Bob Ramirez',   email: 'bob@example.com',    emoji: '🎸', tag: 'tag-friends', freq: 'weekly' },
  { id: 'member-priya', name: 'Priya Sharma',  email: 'priya@example.com',  emoji: '📚', tag: 'tag-mentor',  freq: 'daily'  },
  { id: 'member-test',  name: '🧪 Village Tester', email: 'test@example.com', emoji: '🧪', tag: null,         freq: 'never'  },
]

for (const m of members) {
  insertMember.run(m.id, m.name, m.email, m.emoji, m.tag, new Date().toISOString())
  insertNotif.run(m.id, m.freq)
}

// Override: tester gets reader access to grove
insertAccess.run('member-test', 'grove', 'reader')
// Alice gets commenter on grove
insertAccess.run('member-alice', 'grove', 'commenter')
// Priya gets collaborator on everything
for (const tool of ['grove', 'think']) {
  insertAccess.run('member-priya', tool, 'collaborator')
}

console.log(`✓ Inserted ${members.length} village members`)

// ── Village activity (sample feed items) ──────────────────────────────────────

const insertActivity = db.prepare(`
  INSERT OR IGNORE INTO village_activity (id, source_tool, activity_type, payload, created_at)
  VALUES (?, ?, ?, ?, ?)
`)

const activities = [
  {
    id: 'act-grove-1',
    source: 'grove',
    type: 'session_logged',
    payload: { owner: 'Ram', course: 'Machine Learning Fundamentals', duration: 45, notes: 'Covered backpropagation and gradient descent. The chain rule finally clicked.' },
    created_at: '2026-03-14 19:30:00',
  },
  {
    id: 'act-grove-2',
    source: 'grove',
    type: 'session_logged',
    payload: { owner: 'Ram', course: 'TypeScript Advanced Patterns', duration: 60, notes: 'Deep dived into conditional types and infer keyword.' },
    created_at: '2026-03-15 10:00:00',
  },
  {
    id: 'act-grove-3',
    source: 'grove',
    type: 'session_logged',
    payload: { owner: 'Ram', course: 'Machine Learning Fundamentals', duration: 30, notes: '' },
    created_at: '2026-03-16 08:45:00',
  },
  {
    id: 'act-think-1',
    source: 'think',
    type: 'research_started',
    payload: { owner: 'Ram', topic: 'Retrieval-Augmented Generation', session_title: 'RAG Architecture Deep Dive', node_count: 1, goal: '' },
    created_at: '2026-03-13 14:00:00',
  },
  {
    id: 'act-think-2',
    source: 'think',
    type: 'node_concluded',
    payload: { owner: 'Ram', topic: 'Vector databases comparison', session_title: 'RAG Architecture Deep Dive', takeaway: 'Pinecone is easiest to start with, but pgvector is sufficient for < 1M vectors and avoids an extra service.' },
    created_at: '2026-03-13 15:30:00',
  },
]

for (const a of activities) {
  insertActivity.run(a.id, a.source, a.type, JSON.stringify(a.payload), a.created_at)
}
console.log(`✓ Inserted ${activities.length} village activity items`)

// ── Sample village interactions (comments) ────────────────────────────────────

const insertInteraction = db.prepare(`
  INSERT OR IGNORE INTO village_interactions (id, activity_id, member_id, member_name, type, payload, created_at, read_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const interactions = [
  {
    id: 'int-1',
    activity_id: 'act-grove-1',
    member_id: 'member-alice',
    member_name: 'Alice Chen',
    type: 'comment',
    payload: { body: 'Backprop finally clicking is such a great feeling! Do you use 3Blue1Brown\'s videos?' },
    created_at: '2026-03-14 20:15:00',
    read_at: null,
  },
  {
    id: 'int-2',
    activity_id: 'act-grove-2',
    member_id: 'member-priya',
    member_name: 'Priya Sharma',
    type: 'comment',
    payload: { body: 'The `infer` keyword was a game-changer for me too. Try applying it to discriminated unions next!' },
    created_at: '2026-03-15 11:00:00',
    read_at: null,
  },
  {
    id: 'int-3',
    activity_id: 'act-think-2',
    member_id: 'member-priya',
    member_name: 'Priya Sharma',
    type: 'comment',
    payload: { body: 'Good conclusion. Also worth checking out Weaviate for built-in BM25 hybrid search.' },
    created_at: '2026-03-13 16:00:00',
    read_at: null,
  },
]

for (const i of interactions) {
  insertInteraction.run(i.id, i.activity_id, i.member_id, i.member_name, i.type, JSON.stringify(i.payload), i.created_at, i.read_at)
}
console.log(`✓ Inserted ${interactions.length} village interactions (all unread)`)

// ── Sample workflows ───────────────────────────────────────────────────────────

const insertWorkflow = db.prepare(`
  INSERT OR IGNORE INTO workflows (name, trigger_tool, trigger_event, action_tool, action_type, action_payload, enabled, created_at)
  SELECT ?, ?, ?, ?, ?, ?, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name = ?)
`)

const workflows = [
  {
    name: 'Auto-sync village on Grove session',
    trigger_tool: 'grove',
    trigger_event: 'session_logged',
    action_type: 'sync_village',
    action_payload: '{}',
    enabled: 1,
  },
  {
    name: 'Log Think conclusions to console',
    trigger_tool: 'think',
    trigger_event: 'node_concluded',
    action_type: 'log_to_console',
    action_payload: '{}',
    enabled: 1,
  },
  {
    name: 'Weekly digest on Grove session (disabled)',
    trigger_tool: 'grove',
    trigger_event: 'session_logged',
    action_type: 'send_email_digest',
    action_payload: '{}',
    enabled: 0,
  },
]

for (const w of workflows) {
  insertWorkflow.run(
    w.name, w.trigger_tool, w.trigger_event, null, w.action_type, w.action_payload, w.enabled,
    new Date().toISOString(),
    w.name  // for the WHERE NOT EXISTS check
  )
}
console.log(`✓ Inserted ${workflows.length} sample workflows`)

// ── Streak snapshot ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS village_streak (
    date TEXT PRIMARY KEY,
    streak_days INTEGER DEFAULT 0,
    hours_this_week REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

db.prepare(`
  INSERT OR REPLACE INTO village_streak (date, streak_days, hours_this_week, updated_at)
  VALUES ('2026-03-16', 3, 2.25, datetime('now'))
`).run()
console.log('✓ Set streak snapshot: 3 days, 2.25h this week')

console.log('\n✅ Seeding complete. Restart Admin to see the data.')
db.close()
