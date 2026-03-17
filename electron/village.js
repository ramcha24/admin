/**
 * Village — local HTTP server + tool sync pipeline
 *
 * Serves the village web app on port 7700.
 * Reads from grove.db and think.db (read-only) and tantu ledger files
 * to generate activity feed entries.
 * No external dependencies — uses Node built-ins + better-sqlite3.
 */

const http  = require('http')
const fs    = require('fs')
const path  = require('path')
const os    = require('os')

const VILLAGE_PORT  = 7700
const WEB_APP_PATH  = path.join(__dirname, '../village-web/index.html')

function resolveAdminParent() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'admin-parent.json'), 'utf8'))
    return cfg.adminParent
  } catch {
    return path.resolve(__dirname, '../../')
  }
}
const ADMIN_PARENT = resolveAdminParent()

let server = null

// ─── Tool DB helper ───────────────────────────────────────────────────────────

function openToolDb(toolId) {
  const Database = require('better-sqlite3')
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', toolId, `${toolId}.db`)
  if (!fs.existsSync(dbPath)) return null
  try { return new Database(dbPath, { readonly: true }) } catch { return null }
}

function loadToolVillageConfig(toolId) {
  const toolJsonPath = path.join(ADMIN_PARENT, toolId, 'tool.json')
  if (!fs.existsSync(toolJsonPath)) return {}
  try {
    const j = JSON.parse(fs.readFileSync(toolJsonPath, 'utf8'))
    const types = {}
    for (const at of (j.village?.activity_types ?? [])) types[at.id] = at
    return types
  } catch { return {} }
}

// ─── Template rendering ───────────────────────────────────────────────────────

function render(template, payload) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => payload[k] ?? '')
}

// ─── Streak computation (mirrors grove logic) ─────────────────────────────────

function computeStreak(groveDb) {
  const days = groveDb.prepare(
    "SELECT DISTINCT date(started_at) as day FROM sessions ORDER BY day DESC"
  ).all().map(r => r.day)

  if (!days.length) return 0
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  if (days[0] !== today && days[0] !== yesterday) return 0

  let streak = 0
  let cursor = days[0]
  for (const day of days) {
    if (day === cursor) {
      streak++
      cursor = new Date(new Date(cursor).getTime() - 86400000).toISOString().split('T')[0]
    } else break
  }
  return streak
}

// ─── Grove sync pipeline ──────────────────────────────────────────────────────

function syncGroveActivity() {
  const { getDb } = require('./database')
  const adminDb = getDb()
  const groveDb = openToolDb('grove')
  if (!groveDb) return

  const identity = adminDb.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const owner = identity?.display_name ?? 'Ram'

  const lastSyncRow = adminDb.prepare(
    "SELECT value FROM settings WHERE key='village_grove_last_sync'"
  ).get()
  const since = lastSyncRow?.value ?? '1970-01-01 00:00:00'

  // Sync new sessions
  const sessions = groveDb.prepare(`
    SELECT s.id, s.course_id, s.started_at, s.duration_minutes, s.notes, s.created_at,
           c.title as course_title
    FROM sessions s
    LEFT JOIN courses c ON c.id = s.course_id
    WHERE s.created_at > ?
    ORDER BY s.created_at ASC
    LIMIT 200
  `).all(since)

  const insertAct = adminDb.prepare(`
    INSERT OR IGNORE INTO village_activity (id, source_tool, activity_type, payload, created_at)
    VALUES (?, 'grove', ?, ?, ?)
  `)

  for (const s of sessions) {
    insertAct.run(
      `grove-session-${s.id}`,
      'session_logged',
      JSON.stringify({
        owner,
        course_title:      s.course_title ?? 'a course',
        duration_minutes:  s.duration_minutes ?? 0,
        duration_hours:    parseFloat(((s.duration_minutes ?? 0) / 60).toFixed(1)),
        notes:             s.notes ?? '',
      }),
      s.created_at
    )
  }

  // Upsert today's streak snapshot
  const streak = computeStreak(groveDb)
  const totalMinWeek = groveDb.prepare(
    "SELECT COALESCE(SUM(duration_minutes),0) as t FROM sessions WHERE started_at >= datetime('now','-7 days')"
  ).get().t
  const totalSessionsAllTime = groveDb.prepare(
    'SELECT COUNT(*) as n FROM sessions'
  ).get().n

  if (streak > 0) {
    const today = new Date().toISOString().split('T')[0]
    adminDb.prepare(`
      INSERT OR REPLACE INTO village_activity (id, source_tool, activity_type, payload, created_at)
      VALUES (?, 'grove', 'streak_update', ?, datetime('now'))
    `).run(
      `grove-streak-${today}`,
      JSON.stringify({
        owner,
        streak_days:            streak,
        total_hours_this_week:  parseFloat((totalMinWeek / 60).toFixed(1)),
        total_sessions:         totalSessionsAllTime,
      })
    )
  }

  adminDb.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('village_grove_last_sync', datetime('now'))"
  ).run()

  groveDb.close()
}

// ─── Think sync pipeline ──────────────────────────────────────────────────────

function syncThinkActivity() {
  const { getDb } = require('./database')
  const adminDb = getDb()
  const thinkDb = openToolDb('think')
  if (!thinkDb) return

  const identity = adminDb.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const owner = identity?.display_name ?? 'Ram'

  const lastSyncRow = adminDb.prepare(
    "SELECT value FROM settings WHERE key='village_think_last_sync'"
  ).get()
  const since = lastSyncRow?.value ?? '1970-01-01 00:00:00'

  // Sync concluded nodes (node_concluded activity type)
  const concluded = thinkDb.prepare(`
    SELECT n.id, n.title, n.context_artifact, n.concluded_at,
           s.title as session_title
    FROM nodes n
    LEFT JOIN sessions s ON s.id = n.session_id
    WHERE n.status = 'concluded' AND n.concluded_at > ?
    ORDER BY n.concluded_at ASC
    LIMIT 100
  `).all(since)

  const insertAct = adminDb.prepare(`
    INSERT OR IGNORE INTO village_activity (id, source_tool, activity_type, payload, created_at)
    VALUES (?, 'think', ?, ?, ?)
  `)

  for (const n of concluded) {
    let artifact = null
    try { artifact = JSON.parse(n.context_artifact) } catch {}
    insertAct.run(
      `think-node-${n.id}`,
      'node_concluded',
      JSON.stringify({
        owner,
        topic: n.title ?? 'a topic',
        session_title: n.session_title ?? 'a session',
        takeaway: artifact?.takeaway ?? artifact?.summary ?? '',
      }),
      n.concluded_at
    )
  }

  // Sync new sessions (research_started activity type)
  const newSessions = thinkDb.prepare(`
    SELECT id, title, created_at FROM sessions
    WHERE created_at > ?
    ORDER BY created_at ASC
    LIMIT 100
  `).all(since)

  for (const s of newSessions) {
    const nodeCount = thinkDb.prepare('SELECT COUNT(*) as n FROM nodes WHERE session_id=?').get(s.id)?.n ?? 0
    insertAct.run(
      `think-session-${s.id}`,
      'research_started',
      JSON.stringify({
        owner,
        topic: s.title ?? 'a topic',
        session_title: s.title ?? 'a session',
        node_count: nodeCount,
        goal: '',
      }),
      s.created_at
    )
  }

  adminDb.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('village_think_last_sync', datetime('now'))"
  ).run()

  thinkDb.close()
}

// ─── Tantu sync pipeline ──────────────────────────────────────────────────────

function parseTantuLedger(text) {
  // Each entry: "## YYYY-MM-DD HH:MM — Profile: title\nkv=val, kv=val\n"
  const entries = []
  const blocks = text.split(/^## /m).slice(1)
  for (const block of blocks) {
    const lines = block.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) continue
    const header = lines[0].trim()
    const kvLine = lines[1].trim()

    // Parse timestamp from header: "2026-01-12 20:45 — ..."
    const tsMatch = header.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)
    const created_at = tsMatch ? tsMatch[1] + ':00' : null
    if (!created_at) continue

    // Parse title after "— Profile: "
    const titleMatch = header.match(/—\s+\w+:\s+(.+)$/)
    const thread_title = titleMatch ? titleMatch[1].trim() : header

    // Parse key=value pairs
    const kv = {}
    for (const pair of kvLine.split(',')) {
      const [k, v] = pair.trim().split('=')
      if (k && v !== undefined) kv[k.trim()] = v.trim()
    }

    entries.push({ created_at, thread_title, ...kv })
  }
  return entries
}

function syncTantuActivity() {
  const { getDb } = require('./database')
  const adminDb = getDb()

  const vaultRoot = process.env.TANTU_VAULT_ROOT
    ?? path.join(os.homedir(), 'Documents', 'Obsidian Vault')
  const ledgersDir = path.join(vaultRoot, 'Tantu', 'ledgers')
  if (!fs.existsSync(ledgersDir)) return

  const identity = adminDb.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const owner = identity?.display_name ?? 'Ram'

  const lastSyncRow = adminDb.prepare(
    "SELECT value FROM settings WHERE key='village_tantu_last_sync'"
  ).get()
  const since = lastSyncRow?.value ?? '1970-01-01 00:00:00'

  const insertAct = adminDb.prepare(`
    INSERT OR IGNORE INTO village_activity (id, source_tool, activity_type, payload, created_at)
    VALUES (?, 'tantu', ?, ?, ?)
  `)

  const ledgerFiles = fs.readdirSync(ledgersDir).filter(f => f.endsWith('.md'))
  for (const file of ledgerFiles) {
    const profile = file.replace('.md', '')
    const text = fs.readFileSync(path.join(ledgersDir, file), 'utf8')
    const entries = parseTantuLedger(text)

    for (const e of entries) {
      if (e.created_at <= since) continue
      const actId = `tantu-knot-${profile}-${e.created_at.replace(/[: ]/g, '-')}`
      insertAct.run(
        actId,
        'knot_saved',
        JSON.stringify({
          owner,
          thread_title:    e.thread_title,
          profile,
          duration_min:    parseInt(e.duration_min ?? e.duration ?? '0', 10),
          progress:        e.progress ?? '?',
          subthread_title: e.subthread ?? e.subthread_title ?? '',
          stop_reason:     e.stop_reason ?? '',
          energy_end:      e.energy_end ?? '',
        }),
        e.created_at
      )
    }
  }

  adminDb.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('village_tantu_last_sync', datetime('now'))"
  ).run()
}

// ─── Access resolution ────────────────────────────────────────────────────────

function resolveAccess(db, memberId, toolId) {
  const override = db.prepare(
    'SELECT level FROM village_access WHERE member_id=? AND tool_id=?'
  ).get(memberId, toolId)
  if (override !== undefined) return override?.level ?? null

  const member = db.prepare('SELECT tag_id FROM village_members WHERE id=?').get(memberId)
  if (member?.tag_id) {
    const td = db.prepare(
      'SELECT level FROM village_tag_defaults WHERE tag_id=? AND tool_id=?'
    ).get(member.tag_id, toolId)
    if (td) return td.level
    const gd = db.prepare(
      "SELECT level FROM village_tag_defaults WHERE tag_id=? AND tool_id='*'"
    ).get(member.tag_id)
    if (gd) return gd.level
  }
  return null
}

// ─── Feed API ─────────────────────────────────────────────────────────────────

function getMemberFeed(memberId) {
  const { getDb } = require('./database')
  const adminDb = getDb()

  const member = adminDb.prepare('SELECT * FROM village_members WHERE id=?').get(memberId)
  if (!member) return null

  const groveLevel  = resolveAccess(adminDb, memberId, 'grove')
  const groveTypes  = loadToolVillageConfig('grove')
  const thinkLevel  = resolveAccess(adminDb, memberId, 'think')
  const thinkTypes  = loadToolVillageConfig('think')
  const tantuLevel  = resolveAccess(adminDb, memberId, 'tantu')
  const tantuTypes  = loadToolVillageConfig('tantu')

  const identity = adminDb.prepare('SELECT * FROM village_identity WHERE id=1').get()

  const activities = adminDb.prepare(`
    SELECT * FROM village_activity
    ORDER BY created_at DESC
    LIMIT 100
  `).all()

  const items = []
  for (const a of activities) {
    // Check this member has access to this tool
    let level = null
    if (a.source_tool === 'grove') level = groveLevel
    else if (a.source_tool === 'think') level = thinkLevel
    else if (a.source_tool === 'tantu') level = tantuLevel
    if (!level) continue

    const payload  = JSON.parse(a.payload)
    let typeDef = null
    if (a.source_tool === 'grove') typeDef = groveTypes[a.activity_type]
    else if (a.source_tool === 'think') typeDef = thinkTypes[a.activity_type]
    else if (a.source_tool === 'tantu') typeDef = tantuTypes[a.activity_type]
    const template = typeDef?.levels?.[level] ?? payload.owner + ' had activity'
    const rendered = render(template, payload)

    // Detail fields: only show for reader+ — notes only for commenter+
    const detail = {}
    if (level !== 'follower') {
      detail.course_title     = payload.course_title
      detail.duration_minutes = payload.duration_minutes
      detail.streak_days      = payload.streak_days
      detail.total_hours_this_week = payload.total_hours_this_week
      // Think-specific detail fields
      detail.topic            = payload.topic
      detail.session_title    = payload.session_title
      detail.node_count       = payload.node_count
      // Tantu-specific detail fields
      detail.thread_title     = payload.thread_title
      detail.duration_min     = payload.duration_min
      detail.progress         = payload.progress
      detail.profile          = payload.profile
    }
    if (level === 'commenter' || level === 'collaborator') {
      detail.notes            = payload.notes
      detail.takeaway         = payload.takeaway
      detail.goal             = payload.goal
      // Tantu commenter+
      detail.subthread_title  = payload.subthread_title
      detail.stop_reason      = payload.stop_reason
    }

    // Interactions
    const interactions = adminDb.prepare(
      'SELECT * FROM village_interactions WHERE activity_id=? ORDER BY created_at ASC'
    ).all(a.id)

    items.push({
      id:           a.id,
      tool:         a.source_tool,
      type:         a.activity_type,
      rendered,
      detail,
      level,
      created_at:   a.created_at,
      interactions: interactions.map(i => ({
        ...i,
        payload: JSON.parse(i.payload),
      })),
    })
  }

  return { member, identity, items }
}

// ─── Test villager seed ───────────────────────────────────────────────────────

function seedTestVillager() {
  const { getDb } = require('./database')
  const db = getDb()

  const exists = db.prepare("SELECT id FROM village_members WHERE id='test-villager'").get()
  if (exists) return

  db.prepare(`
    INSERT INTO village_members (id, name, email, avatar_emoji, notes)
    VALUES ('test-villager', 'Village Tester', 'test@example.com', '🧪',
            'Test account — open http://localhost:7700 in incognito to preview')
  `).run()

  db.prepare(`
    INSERT INTO village_access (member_id, tool_id, level)
    VALUES ('test-villager', 'grove', 'reader')
  `).run()

  db.prepare(`
    INSERT INTO village_access (member_id, tool_id, level)
    VALUES ('test-villager', 'tantu', 'reader')
  `).run()

  db.prepare(`
    INSERT OR IGNORE INTO village_notifications (member_id, frequency)
    VALUES ('test-villager', 'daily')
  `).run()

  console.log('[Village] Test villager seeded — open http://localhost:7700 in incognito')
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

function startVillageServer() {
  syncGroveActivity()
  syncThinkActivity()
  syncTantuActivity()
  seedTestVillager()

  server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${VILLAGE_PORT}`)

    // ── GET /api/feed ──────────────────────────────────────────────────────
    if (req.method === 'GET' && u.pathname === '/api/feed') {
      syncGroveActivity()
      syncThinkActivity()
      syncTantuActivity()
      const { getDb } = require('./database')
      const db = getDb()

      // Resolve member by token (preferred) or legacy member ID
      const token    = u.searchParams.get('token')
      const memberParam = u.searchParams.get('member')
      let memberId
      if (token) {
        const row = db.prepare("SELECT id FROM village_members WHERE feed_token=?").get(token)
        if (!row) return json(res, { error: 'Invalid token' }, 404)
        memberId = row.id
      } else {
        memberId = memberParam ?? 'test-villager'
      }

      const data = getMemberFeed(memberId)
      if (!data) return json(res, { error: 'Member not found' }, 404)

      // Record last seen
      db.prepare("UPDATE village_members SET last_seen_at=datetime('now') WHERE id=?").run(memberId)

      return json(res, data)
    }

    // ── GET /api/members ───────────────────────────────────────────────────
    if (req.method === 'GET' && u.pathname === '/api/members') {
      const { getDb } = require('./database')
      const db = getDb()
      const members = db.prepare('SELECT * FROM village_members ORDER BY joined_at DESC').all()
      return json(res, members)
    }

    // ── POST /api/interact ─────────────────────────────────────────────────
    if (req.method === 'POST' && u.pathname === '/api/interact') {
      let body = ''
      req.on('data', d => body += d)
      req.on('end', () => {
        try {
          const { activity_id, member_id, type, payload, member_name } = JSON.parse(body)
          const { getDb } = require('./database')
          const db = getDb()
          const member = db.prepare('SELECT * FROM village_members WHERE id=?').get(member_id)
          if (!member) return json(res, { error: 'Unknown member' }, 403)

          // Use member_name from payload if provided, else fall back to DB name
          const displayName = member_name || member.name
          const id = `interaction-${Date.now()}-${Math.random().toString(36).slice(2)}`
          db.prepare(`
            INSERT INTO village_interactions (id, activity_id, member_id, member_name, type, payload)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, activity_id, member_id, displayName, type ?? 'comment', JSON.stringify(payload ?? {}))
          json(res, { ok: true, id })
        } catch (e) {
          json(res, { error: e.message }, 400)
        }
      })
      return
    }

    // ── GET / (web app) ────────────────────────────────────────────────────
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      try {
        const html = fs.readFileSync(WEB_APP_PATH, 'utf8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch (e) {
        res.writeHead(500)
        res.end('Village web app not built yet')
      }
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.listen(VILLAGE_PORT, () => {
    console.log(`[Village] Running at http://localhost:${VILLAGE_PORT}`)
  })
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.warn(`[Village] Port ${VILLAGE_PORT} already in use — skipping village server`)
    } else {
      console.error('[Village] Server error:', e.message)
    }
  })

  // Re-sync every 5 minutes
  setInterval(() => { syncGroveActivity(); syncThinkActivity(); syncTantuActivity() }, 5 * 60 * 1000)
}

function stopVillageServer() {
  if (server) { server.close(); server = null }
}

module.exports = { startVillageServer, stopVillageServer, syncGroveActivity, syncThinkActivity, syncTantuActivity, seedTestVillager, getMemberFeed, VILLAGE_PORT }
