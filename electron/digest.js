/**
 * Village Email Digest
 *
 * Sends a daily digest email to each village member who has email set.
 * Uses Nodemailer with SMTP (Gmail app password, Outlook, any SMTP).
 *
 * Configure in Admin Settings:
 *   smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from
 *
 * Auto-runs daily at 8:00am local time when Admin is open.
 * Members control frequency via village_notifications.frequency:
 *   'daily' | 'weekly' | 'never'
 */

const PLACEHOLDER = '__NOT_SET__'

function getSmtpConfig(db) {
  const get = key => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? ''
  const host = get('smtp_host')
  const user = get('smtp_user')
  const pass = get('smtp_pass')
  if (!host || !user || !pass || host === PLACEHOLDER) return null
  return {
    host,
    port: parseInt(get('smtp_port') || '587', 10),
    user,
    pass,
    from: get('smtp_from') || user,
  }
}

// ─── HTML email builder ───────────────────────────────────────────────────────

function buildDigestHtml({ identity, member, items }) {
  const ownerName = identity?.display_name ?? 'Your friend'
  const sessions  = items.filter(i => i.type === 'session_logged')
  const streak    = items.find(i => i.type === 'streak_update')

  const streakSection = streak
    ? `<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
        <span style="font-size:28px">🔥</span>
        <strong style="font-size:20px">${streak.detail?.streak_days ?? 0}-day streak</strong>
        ${streak.detail?.total_hours_this_week != null
          ? `<span style="opacity:.8;font-size:13px;margin-left:8px">${streak.detail.total_hours_this_week}h this week</span>`
          : ''}
      </div>`
    : ''

  const sessionItems = sessions.slice(0, 8).map(s => `
    <div style="background:#fff;border:1px solid #ede9e3;border-radius:10px;padding:14px 16px;margin-bottom:8px;">
      <div style="font-size:11px;color:#a8a29e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">
        🌿 Grove · ${new Date(s.created_at + 'Z').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
      </div>
      <div style="font-size:15px;color:#1c1917;">${s.rendered}</div>
      ${s.detail?.notes ? `<div style="font-size:13px;color:#78716c;font-style:italic;margin-top:8px;">"${s.detail.notes}"</div>` : ''}
    </div>`).join('')

  const noActivity = !sessions.length && !streak
    ? `<p style="color:#78716c;text-align:center;padding:30px 0;">No new activity since your last digest.</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf9f6;color:#1c1917;margin:0;padding:0;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px 60px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:13px;color:#a8a29e;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Village digest</div>
      <h1 style="font-size:22px;font-weight:700;margin:0;">${ownerName}'s Journal</h1>
      <p style="font-size:14px;color:#78716c;margin-top:4px;">Hi ${member.name} — here's what's been happening.</p>
    </div>

    ${streakSection}

    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#a8a29e;margin-bottom:10px;">
      Recent Activity
    </div>

    ${sessionItems}
    ${noActivity}

    <div style="text-align:center;font-size:12px;color:#a8a29e;margin-top:32px;border-top:1px solid #ede9e3;padding-top:20px;">
      <p>You're receiving this because you're part of ${ownerName}'s village.</p>
      <p style="margin-top:4px;color:#c4b5aa;">Powered by Village · ${identity?.username ?? 'ram'}@village</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Send digest for one member ───────────────────────────────────────────────

async function sendDigestToMember(db, member, cfg, identity) {
  const { getMemberFeed } = require('./village')
  const feed = getMemberFeed(member.id)
  if (!feed || !feed.items.length) return { skipped: true, reason: 'No activity' }

  const nodemailer = require('nodemailer')
  const transporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.port === 465,
    auth:   { user: cfg.user, pass: cfg.pass },
  })

  const html    = buildDigestHtml(feed)
  const subject = `${identity?.display_name ?? 'Village'} update — ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}`

  await transporter.sendMail({
    from:    cfg.from,
    to:      member.email,
    subject,
    html,
  })

  // Record last sent
  db.prepare(`
    INSERT OR REPLACE INTO village_notifications (member_id, frequency, last_sent_at)
    VALUES (?, COALESCE((SELECT frequency FROM village_notifications WHERE member_id=?), 'daily'), datetime('now'))
  `).run(member.id, member.id)

  return { sent: true, to: member.email }
}

// ─── Run digest for all eligible members ─────────────────────────────────────

async function runDailyDigest(db) {
  const cfg = getSmtpConfig(db)
  if (!cfg) return { skipped: true, reason: 'SMTP not configured' }

  const identity = db.prepare('SELECT * FROM village_identity WHERE id=1').get()

  // Members with email, daily frequency, not sent in last 20h
  const members = db.prepare(`
    SELECT vm.* FROM village_members vm
    LEFT JOIN village_notifications vn ON vn.member_id = vm.id
    WHERE vm.email != ''
      AND (vn.frequency IS NULL OR vn.frequency = 'daily')
      AND (vn.last_sent_at IS NULL OR vn.last_sent_at < datetime('now', '-20 hours'))
      AND vm.id != 'test-villager'
  `).all()

  const results = []
  for (const m of members) {
    try {
      const r = await sendDigestToMember(db, m, cfg, identity)
      results.push({ member: m.name, ...r })
    } catch (e) {
      results.push({ member: m.name, error: e.message })
    }
  }

  return { sent: results.length, results }
}

// ─── Daily cron scheduler ─────────────────────────────────────────────────────

let digestTimer = null

function scheduleDailyDigest(db) {
  if (digestTimer) return

  function scheduleNext() {
    const now   = new Date()
    const next  = new Date()
    next.setHours(8, 0, 0, 0)          // 8:00am local time
    if (next <= now) next.setDate(next.getDate() + 1)
    const delay = next - now
    console.log(`[Digest] Next digest scheduled for ${next.toLocaleTimeString()} (${Math.round(delay/60000)} min)`)
    digestTimer = setTimeout(async () => {
      console.log('[Digest] Running daily digest...')
      const result = await runDailyDigest(db)
      console.log('[Digest] Done:', JSON.stringify(result))
      scheduleNext()
    }, delay)
  }

  scheduleNext()
}

function cancelDigestSchedule() {
  if (digestTimer) { clearTimeout(digestTimer); digestTimer = null }
}

module.exports = { runDailyDigest, scheduleDailyDigest, cancelDigestSchedule }
