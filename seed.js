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
  { id: 'tag-family',     name: 'Family',     icon: '🏠', color: '#10b981' },
  { id: 'tag-friends',    name: 'Friends',    icon: '🫂', color: '#6366f1' },
  { id: 'tag-mentor',     name: 'Mentor',     icon: '🎓', color: '#f59e0b' },
  { id: 'tag-colleagues', name: 'Colleagues', icon: '💼', color: '#0ea5e9' },
]

for (const tag of tags) {
  insertTag.run(tag.id, tag.name, tag.icon, tag.color)
}

// Tag defaults per tool:
// family:     grove=reader,       think=none
// friends:    grove=follower,     think=follower
// mentor:     grove=collaborator, think=collaborator
// colleagues: grove=reader,       think=none
insertTagDefault.run('tag-family',     'grove', 'reader')
insertTagDefault.run('tag-friends',    'grove', 'follower')
insertTagDefault.run('tag-friends',    'think', 'follower')
insertTagDefault.run('tag-mentor',     'grove', 'collaborator')
insertTagDefault.run('tag-mentor',     'think', 'collaborator')
insertTagDefault.run('tag-colleagues', 'grove', 'reader')

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
  // Family
  { id: 'member-alice', name: 'Alice Chen',        email: 'alice@example.com',  emoji: '🌸', tag: 'tag-family',     freq: 'daily',  joined_at: '2026-02-01 10:00:00' },
  { id: 'member-dad',   name: 'Arun',               email: 'arun@example.com',   emoji: '🧓', tag: 'tag-family',     freq: 'weekly', joined_at: '2026-02-01 10:05:00' },
  // Friends
  { id: 'member-bob',   name: 'Bob Ramirez',        email: 'bob@example.com',    emoji: '🎸', tag: 'tag-friends',    freq: 'weekly', joined_at: '2026-02-10 12:00:00' },
  { id: 'member-kavya', name: 'Kavya Nair',         email: 'kavya@example.com',  emoji: '📖', tag: 'tag-friends',    freq: 'daily',  joined_at: '2026-02-10 12:30:00' },
  { id: 'member-maya',  name: 'Maya Torres',        email: 'maya@example.com',   emoji: '🌙', tag: 'tag-friends',    freq: 'weekly', joined_at: '2026-02-15 09:00:00' },
  // Mentor
  { id: 'member-priya', name: 'Priya Sharma',       email: 'priya@example.com',  emoji: '📚', tag: 'tag-mentor',     freq: 'daily',  joined_at: '2026-01-20 08:00:00' },
  // Colleagues
  { id: 'member-david', name: 'David Kim',          email: 'david@example.com',  emoji: '💻', tag: 'tag-colleagues', freq: 'never',  joined_at: '2026-03-01 14:00:00' },
  // No tag
  { id: 'member-test',  name: '🧪 Village Tester',  email: 'test@example.com',   emoji: '🧪', tag: null,             freq: 'never',  joined_at: '2026-03-10 00:00:00' },
]

for (const m of members) {
  insertMember.run(m.id, m.name, m.email, m.emoji, m.tag, m.joined_at)
  insertNotif.run(m.id, m.freq)
}

// Access overrides (take precedence over tag defaults):
// Alice: grove=commenter (overrides family default of reader)
insertAccess.run('member-alice', 'grove', 'commenter')
// Kavya: grove=commenter, think=commenter (overrides friends default of follower)
insertAccess.run('member-kavya', 'grove', 'commenter')
insertAccess.run('member-kavya', 'think', 'commenter')
// Tester: grove=reader (no tag, explicit grant)
insertAccess.run('member-test', 'grove', 'reader')

console.log(`✓ Inserted ${members.length} village members`)

// ── Village activity (sample feed items) ──────────────────────────────────────

const insertActivity = db.prepare(`
  INSERT OR IGNORE INTO village_activity (id, source_tool, activity_type, payload, created_at)
  VALUES (?, ?, ?, ?, ?)
`)

const activities = [
  // Week 1 — ML fundamentals start
  {
    id: 'act-grove-ml-1',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'Machine Learning Fundamentals',
      duration_minutes: 45,
      notes: 'Covered the math prerequisites — linear algebra refresher, dot products, matrix multiplication. Slow going but necessary.',
    },
    created_at: '2026-03-01 19:00:00',
  },
  {
    id: 'act-grove-ml-2',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'Machine Learning Fundamentals',
      duration_minutes: 60,
      notes: 'Gradient descent finally makes intuitive sense. The "roll a ball down a hill" analogy clicked.',
    },
    created_at: '2026-03-03 20:30:00',
  },
  {
    id: 'act-grove-streak-3',
    source: 'grove',
    type: 'streak_update',
    payload: {
      owner: 'Ram',
      streak_days: 3,
      total_hours_this_week: 1.75,
      total_sessions: 3,
    },
    created_at: '2026-03-03 20:45:00',
  },
  {
    id: 'act-grove-ml-3',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'Machine Learning Fundamentals',
      duration_minutes: 45,
      notes: 'Backpropagation and the chain rule. Had to watch 3Blue1Brown twice.',
    },
    created_at: '2026-03-05 21:00:00',
  },
  // Week 2 — TypeScript deep dive + RAG research
  {
    id: 'act-grove-ts-1',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'TypeScript Advanced Patterns',
      duration_minutes: 60,
      notes: 'Conditional types and the infer keyword. Mind-bending but powerful — especially for building type-safe parsers.',
    },
    created_at: '2026-03-09 10:00:00',
  },
  {
    id: 'act-think-rag-1',
    source: 'think',
    type: 'research_started',
    payload: {
      owner: 'Ram',
      topic: 'Retrieval-Augmented Generation',
      session_title: 'RAG Architecture Deep Dive',
      node_count: 1,
      goal: 'Understand when to use RAG vs fine-tuning, and how to pick a vector DB',
    },
    created_at: '2026-03-10 14:00:00',
  },
  {
    id: 'act-think-rag-2',
    source: 'think',
    type: 'node_concluded',
    payload: {
      owner: 'Ram',
      topic: 'Vector DB comparison',
      session_title: 'RAG Architecture Deep Dive',
      takeaway: 'Pinecone is quickest to prototype with, but pgvector is sufficient for < 1M vectors and avoids an extra service. Weaviate wins on hybrid BM25 + vector search. For this project: pgvector.',
    },
    created_at: '2026-03-10 16:00:00',
  },
  {
    id: 'act-grove-ts-2',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'TypeScript Advanced Patterns',
      duration_minutes: 90,
      notes: 'Mapped types and template literal types. Built a type-safe event emitter as an exercise.',
    },
    created_at: '2026-03-12 11:00:00',
  },
  {
    id: 'act-grove-streak-7',
    source: 'grove',
    type: 'streak_update',
    payload: {
      owner: 'Ram',
      streak_days: 7,
      total_hours_this_week: 3.5,
      total_sessions: 8,
    },
    created_at: '2026-03-12 11:30:00',
  },
  // Week 3 — current week
  {
    id: 'act-grove-alg-1',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'Algorithms & Data Structures',
      duration_minutes: 50,
      notes: 'Dynamic programming fundamentals — tabulation vs memoisation. Classic coin-change problem.',
    },
    created_at: '2026-03-14 19:30:00',
  },
  {
    id: 'act-grove-ml-4',
    source: 'grove',
    type: 'session_logged',
    payload: {
      owner: 'Ram',
      course_title: 'Machine Learning Fundamentals',
      duration_minutes: 30,
      notes: 'Neural network architectures — feedforward, activation functions. Quick session before dinner.',
    },
    created_at: '2026-03-16 08:45:00',
  },
  {
    id: 'act-grove-streak-11',
    source: 'grove',
    type: 'streak_update',
    payload: {
      owner: 'Ram',
      streak_days: 11,
      total_hours_this_week: 2.25,
      total_sessions: 11,
    },
    created_at: '2026-03-16 09:00:00',
  },
]

for (const a of activities) {
  insertActivity.run(a.id, a.source, a.type, JSON.stringify(a.payload), a.created_at)
}
console.log(`✓ Inserted ${activities.length} village activity items`)

// ── Village interactions (comments) ───────────────────────────────────────────

const insertInteraction = db.prepare(`
  INSERT OR IGNORE INTO village_interactions (id, activity_id, member_id, member_name, type, payload, created_at, read_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const interactions = [
  // act-grove-ml-3 (backprop session, March 5) — read
  {
    id: 'int-alice-1',
    activity_id: 'act-grove-ml-3',
    member_id: 'member-alice',
    member_name: 'Alice Chen',
    type: 'comment',
    payload: { body: "Wait you're learning ML?? that's so cool. is it hard?" },
    created_at: '2026-03-05 22:15:00',
    read_at: '2026-03-06 09:00:00',
  },
  {
    id: 'int-priya-1',
    activity_id: 'act-grove-ml-3',
    member_id: 'member-priya',
    member_name: 'Priya Sharma',
    type: 'comment',
    payload: { body: 'Good milestone. One tip: implement backprop from scratch in numpy before moving to PyTorch. Forces you to understand every gradient.' },
    created_at: '2026-03-06 07:30:00',
    read_at: '2026-03-06 09:00:00',
  },
  // act-grove-ts-1 (conditional types, March 9) — read
  {
    id: 'int-kavya-1',
    activity_id: 'act-grove-ts-1',
    member_id: 'member-kavya',
    member_name: 'Kavya Nair',
    type: 'comment',
    payload: { body: 'The infer keyword was a game-changer for me too! Try using it to extract the return type of async functions — super practical.' },
    created_at: '2026-03-09 11:30:00',
    read_at: '2026-03-09 19:00:00',
  },
  {
    id: 'int-priya-2',
    activity_id: 'act-grove-ts-1',
    member_id: 'member-priya',
    member_name: 'Priya Sharma',
    type: 'comment',
    payload: { body: 'Conditional types + infer is where TypeScript starts feeling like a proper type-level language. Total Type Safety (book by Matt Pocock) is excellent for this.' },
    created_at: '2026-03-09 13:00:00',
    read_at: '2026-03-09 19:00:00',
  },
  // act-grove-streak-3 (3-day streak, March 3) — read
  {
    id: 'int-dad-1',
    activity_id: 'act-grove-streak-3',
    member_id: 'member-dad',
    member_name: 'Arun',
    type: 'comment',
    payload: { body: '3 days in a row! Keep going beta 💪' },
    created_at: '2026-03-03 21:30:00',
    read_at: '2026-03-04 08:00:00',
  },
  // act-think-rag-2 (Vector DB conclusion, March 10) — read
  {
    id: 'int-priya-3',
    activity_id: 'act-think-rag-2',
    member_id: 'member-priya',
    member_name: 'Priya Sharma',
    type: 'comment',
    payload: { body: 'Good call on pgvector. Also worth evaluating Qdrant — Rust-based, extremely fast for < 5M vectors, and has a good Python client. But pgvector is the right pragmatic choice to start.' },
    created_at: '2026-03-10 16:45:00',
    read_at: '2026-03-11 09:00:00',
  },
  {
    id: 'int-kavya-2',
    activity_id: 'act-think-rag-2',
    member_id: 'member-kavya',
    member_name: 'Kavya Nair',
    type: 'comment',
    payload: { body: 'Did you look at LlamaIndex for the orchestration layer? Works well with pgvector.' },
    created_at: '2026-03-10 17:00:00',
    read_at: '2026-03-11 09:00:00',
  },
  // act-grove-streak-7 (7-day streak, March 12) — UNREAD
  {
    id: 'int-alice-2',
    activity_id: 'act-grove-streak-7',
    member_id: 'member-alice',
    member_name: 'Alice Chen',
    type: 'comment',
    payload: { body: '7 days 🔥🔥 how are you keeping this up with work??' },
    created_at: '2026-03-12 14:00:00',
    read_at: null,
  },
  {
    id: 'int-david-1',
    activity_id: 'act-grove-streak-7',
    member_id: 'member-david',
    member_name: 'David Kim',
    type: 'comment',
    payload: { body: "Impressive. I've been meaning to study TS patterns too — let me know if you want to do a review session." },
    created_at: '2026-03-12 15:30:00',
    read_at: null,
  },
  // act-grove-streak-11 (11-day streak, March 16) — UNREAD
  {
    id: 'int-dad-2',
    activity_id: 'act-grove-streak-11',
    member_id: 'member-dad',
    member_name: 'Arun',
    type: 'comment',
    payload: { body: '11 days! You are very dedicated. Proud of you 🙏' },
    created_at: '2026-03-16 10:00:00',
    read_at: null,
  },
]

for (const i of interactions) {
  insertInteraction.run(
    i.id, i.activity_id, i.member_id, i.member_name,
    i.type, JSON.stringify(i.payload), i.created_at, i.read_at
  )
}
const unreadCount = interactions.filter(i => i.read_at === null).length
console.log(`✓ Inserted ${interactions.length} village interactions (${unreadCount} unread)`)

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
  VALUES ('2026-03-16', 11, 2.25, datetime('now'))
`).run()
console.log('✓ Set streak snapshot: 11 days, 2.25h this week')

console.log('\n✅ Seeding complete. Restart Admin to see the data.')
db.close()
