/**
 * Supabase sync for Village
 *
 * Pushes local village_activity rows to Supabase so the cloud village-web
 * deployment can serve them. Also pulls village_interactions written by
 * members in the cloud back to local admin.db.
 *
 * No @supabase/supabase-js dependency — uses plain fetch with the REST API
 * so we stay within Node v16 + no extra npm package.
 *
 * Setup: get a free project at https://supabase.com, run the SQL in
 * SUPABASE_SETUP.md, then add the url + anon key to Admin Settings.
 */

const PLACEHOLDER_URL = 'https://YOUR_PROJECT.supabase.co'
const PLACEHOLDER_KEY = 'YOUR_ANON_KEY'

/**
 * Read Supabase connection credentials from the Admin settings table.
 *
 * Returns `null` when the credentials are absent or still set to the
 * placeholder values, so callers can skip sync gracefully.
 *
 * @param {import('better-sqlite3').Database} db - Admin database.
 * @returns {{url:string, key:string}|null} Configured credentials, or `null`.
 */
function getSupabaseConfig(db) {
  const url = db.prepare("SELECT value FROM settings WHERE key='supabase_url'").get()?.value
  const key = db.prepare("SELECT value FROM settings WHERE key='supabase_anon_key'").get()?.value
  if (!url || url === PLACEHOLDER_URL || !key || key === PLACEHOLDER_KEY) return null
  return { url, key }
}

/**
 * Make an authenticated HTTP request to the Supabase REST API.
 *
 * Uses the global `fetch` (available from Node 18+ / Electron 28) rather than
 * the Supabase JS client to avoid adding an extra npm dependency.
 * GET responses are parsed as JSON and returned; all other methods return `null`.
 *
 * @param {{url:string, key:string}} cfg - Supabase project URL and anon key.
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} method - HTTP method.
 * @param {string} table - Supabase table name.
 * @param {object|null} [body=null] - Request body (serialised to JSON for non-GET requests).
 * @param {string} [filter=''] - PostgREST query string appended to the URL (e.g. `?id=eq.1`).
 * @returns {Promise<object[]|null>} Parsed JSON array for GET, `null` otherwise.
 * @throws {Error} When the response status is not OK.
 */
async function supaFetch(cfg, method, table, body = null, filter = '') {
  const res = await fetch(`${cfg.url}/rest/v1/${table}${filter}`, {
    method,
    headers: {
      'apikey':        cfg.key,
      'Authorization': `Bearer ${cfg.key}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${text}`)
  }
  // GET returns JSON array; others return empty or representation
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json') && method === 'GET') {
    return res.json()
  }
  return null
}

// ─── Push activity ────────────────────────────────────────────────────────────

/**
 * Push unsynced local `village_activity` rows to Supabase.
 *
 * Only rows where `synced_at IS NULL` are sent (up to 500 per call).
 * Uses upsert (`Prefer: resolution=merge-duplicates`) so re-pushing the same
 * IDs is safe. Marks successfully pushed rows with `synced_at = datetime('now')`.
 *
 * @param {import('better-sqlite3').Database} db - Admin database.
 * @returns {Promise<{pushed:number}|{skipped:boolean,reason:string}>}
 */
async function pushActivity(db) {
  const cfg = getSupabaseConfig(db)
  if (!cfg) return { skipped: true, reason: 'Supabase not configured' }

  const identity = db.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const username = identity?.username ?? 'ram'

  // Only push rows not yet synced
  const rows = db.prepare(`
    SELECT * FROM village_activity WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT 500
  `).all()

  if (!rows.length) return { pushed: 0 }

  // Build records for Supabase
  const records = rows.map(r => ({
    id:            r.id,
    username,
    source_tool:   r.source_tool,
    activity_type: r.activity_type,
    payload:       JSON.parse(r.payload),
    created_at:    r.created_at,
  }))

  await supaFetch(cfg, 'POST', 'village_activity', records)

  // Mark as synced
  const stmt = db.prepare("UPDATE village_activity SET synced_at = datetime('now') WHERE id = ?")
  for (const r of rows) stmt.run(r.id)

  return { pushed: rows.length }
}

// ─── Pull interactions ────────────────────────────────────────────────────────

/**
 * Pull new `village_interactions` from Supabase into the local admin.db.
 *
 * Fetches interactions scoped to the current owner's username and created
 * after the `supabase_last_interaction_pull` watermark (up to 200 rows).
 * Inserts with `INSERT OR IGNORE` so duplicate pulls are safe.
 * Advances the watermark to the latest pulled `created_at` timestamp.
 *
 * @param {import('better-sqlite3').Database} db - Admin database.
 * @returns {Promise<{pulled:number}|{skipped:boolean,reason:string}>}
 */
async function pullInteractions(db) {
  const cfg = getSupabaseConfig(db)
  if (!cfg) return { skipped: true, reason: 'Supabase not configured' }

  const identity = db.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const username = identity?.username ?? 'ram'

  // Find the latest interaction we've seen from the cloud
  const lastRow = db.prepare(
    "SELECT value FROM settings WHERE key='supabase_last_interaction_pull'"
  ).get()
  const since = lastRow?.value ?? '1970-01-01T00:00:00'

  const rows = await supaFetch(
    cfg, 'GET', 'village_interactions',
    null,
    `?username=eq.${encodeURIComponent(username)}&created_at=gt.${encodeURIComponent(since)}&order=created_at.asc&limit=200`
  )

  if (!rows?.length) return { pulled: 0 }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO village_interactions
      (id, activity_id, member_id, member_name, type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  for (const r of rows) {
    insert.run(
      r.id,
      r.activity_id,
      r.member_id ?? 'cloud-member',
      r.member_name ?? r.member_id ?? 'Village member',
      r.type ?? 'comment',
      typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload ?? {}),
      r.created_at,
    )
  }

  // Update watermark
  const latest = rows[rows.length - 1].created_at
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('supabase_last_interaction_pull', ?)")
    .run(latest)

  return { pulled: rows.length }
}

// ─── Push pre-computed member feeds ──────────────────────────────────────────

/**
 * Push pre-computed member feed objects to the Supabase `village_feeds` table.
 *
 * Iterates all local village members, calls `getMemberFeed()` for each, and
 * upserts the full feed JSON into Supabase so the Cloudflare Pages deployment
 * can serve them without hitting the local machine at all. Uses lazy-require
 * on `village.js` to avoid a circular dependency at module load time.
 *
 * @param {import('better-sqlite3').Database} db - Admin database.
 * @returns {Promise<{pushed:number}|{skipped:boolean,reason:string}>}
 */
async function pushMemberFeeds(db) {
  const cfg = getSupabaseConfig(db)
  if (!cfg) return { skipped: true, reason: 'Supabase not configured' }

  // Lazy-require village to avoid circular deps
  const { getMemberFeed } = require('./village')

  const identity = db.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const username  = identity?.username ?? 'ram'
  const members   = db.prepare('SELECT id FROM village_members').all()

  const records = []
  for (const m of members) {
    const feed = getMemberFeed(m.id)
    if (!feed) continue
    records.push({
      username,
      member_id:  m.id,
      feed_json:  { member: feed.member, identity: feed.identity, items: feed.items },
      updated_at: new Date().toISOString(),
    })
  }

  if (!records.length) return { pushed: 0 }

  await supaFetch(cfg, 'POST', 'village_feeds', records)
  return { pushed: records.length }
}

// ─── Combined sync ────────────────────────────────────────────────────────────

/**
 * Run a full Supabase sync: push activity, push member feeds, and pull interactions.
 *
 * All three operations run concurrently via `Promise.allSettled` so a failure
 * in one does not cancel the others. Each result is normalised to either its
 * success value or `{ error: message }`.
 *
 * @param {import('better-sqlite3').Database} db - Admin database.
 * @returns {Promise<{push:object, feeds:object, pull:object}>} Combined sync result.
 */
async function syncToSupabase(db) {
  const [push, feeds, pull] = await Promise.allSettled([
    pushActivity(db),
    pushMemberFeeds(db),
    pullInteractions(db),
  ])

  return {
    push:  push.status  === 'fulfilled' ? push.value  : { error: push.reason?.message },
    feeds: feeds.status === 'fulfilled' ? feeds.value : { error: feeds.reason?.message },
    pull:  pull.status  === 'fulfilled' ? pull.value  : { error: pull.reason?.message },
  }
}

module.exports = { syncToSupabase, pushActivity, pullInteractions, pushMemberFeeds }
