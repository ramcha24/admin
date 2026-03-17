# The Village — Plan v2

## What this is

A social layer woven into your Admin suite. You share tools with your "village" — trusted
people who can follow your journey, cheer you on, ask questions, and co-create with you.
You control exactly who sees what and how they can engage. The data is yours: stored locally
and synced to an encrypted cloud layer you control. Village members access everything through
a hosted website — no app to install, works on any device, available any time.

---

## Core principles

1. **Locally owned, cloud synced.** Your data lives in admin.db first. An encrypted copy
   syncs to the cloud so village members can access it even when your machine is off.
   You can wipe the cloud at any time; your local copy is always the source of truth.

2. **Each tool defines its own village semantics.** Grove decides what "Follower" means for
   study sessions. Think decides what "Reader" means for research trees. The Village layer
   is a standard — not a constraint.

3. **Tags for groups, overrides for individuals.** Assign a village member a tag ("Family",
   "Study Buddy") and they inherit default tool access. Override per-person ad hoc when
   someone needs a different view.

4. **Website, not an app.** Village members get a personal URL. It's a hosted React web app,
   mobile-first, warm and minimal. They bookmark it.

5. **Privacy by default.** Nothing is visible until you explicitly share it.

---

## Permission levels (applies to every tool)

Each tool defines what each level *means for that tool* in its `tool.json`. The levels are
fixed (so village members understand them); the content of each level is tool-specific.

| Level | Intent |
|-------|--------|
| **Follower** | I know you're on a journey. I see the shape of it, not the details. |
| **Reader** | I can see what you're working on and how it's going. |
| **Commenter** | I can see everything and leave thoughts, questions, encouragement. |
| **Collaborator** | I'm actively involved. Tool-specific access (e.g., suggest resources in Grove). |

---

## Village Protocol — `tool.json` extension

Each tool fills this in to declare what village members see at each level:

```json
{
  "village": {
    "activity_types": [
      {
        "id": "session_logged",
        "label": "Logged a study session",
        "levels": {
          "follower":     "Ram studied today",
          "reader":       "Ram studied {course_title} for {duration_minutes} min",
          "commenter":    "Ram studied {course_title} for {duration_minutes} min. Notes: {notes}",
          "collaborator": "Ram studied {course_title} for {duration_minutes} min. Notes: {notes}"
        }
      },
      {
        "id": "skill_completed",
        "label": "Completed a skill",
        "levels": {
          "follower":     "Ram completed a skill 🎉",
          "reader":       "Ram completed: {course_title} 🎉",
          "commenter":    "Ram completed: {course_title} 🎉",
          "collaborator": "Ram completed: {course_title} 🎉"
        }
      }
    ],
    "interaction_types": [
      {
        "id": "suggest_resource",
        "label": "Suggest a resource",
        "min_level": "collaborator",
        "description": "Share a link or note relevant to this session"
      }
    ]
  }
}
```

The `levels` object is a template string — `{field_name}` tokens are replaced at render
time. If a field shouldn't appear at a level, omit it from that level's template.

---

## Village Tags

Tags let you define default access for a group of people. Assigning a tag to a member
instantly grants them the tag's default tool access. You can then override per-person.

**Example tags:**

| Tag | Grove | Think | Admin |
|-----|-------|-------|-------|
| Family | Reader | Follower | — |
| Study Buddy | Collaborator | Reader | — |
| Close Friend | Reader | Reader | Follower |
| Accountability Partner | Commenter | — | — |

**Workflow:**
- "Add Alice → tag: Study Buddy" → Alice gets Grove:Collaborator + Think:Reader automatically
- "Add Bob → tag: Family, but override Think to none" → Bob gets Grove:Reader, no Think access
- Ad hoc: add someone with no tag, set access manually

Tags are descriptive of the *relationship*, not the permissions — the tag carries the
defaults; the person carries the actual access (which may differ from defaults).

---

## Data model additions (admin.db)

```sql
-- Village tags
CREATE TABLE village_tags (
  id    TEXT PRIMARY KEY,          -- "family", "study-buddy" etc.
  name  TEXT NOT NULL,
  icon  TEXT DEFAULT '🏷️',
  color TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT ''
);

-- Default tool access per tag
CREATE TABLE village_tag_defaults (
  tag_id  TEXT NOT NULL REFERENCES village_tags(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,           -- tool id, or '*' for all tools
  level   TEXT NOT NULL,
  PRIMARY KEY (tag_id, tool_id)
);

-- Village members (updated)
CREATE TABLE village_members (
  id           TEXT PRIMARY KEY,   -- uuid
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,      -- used for magic link delivery
  avatar_emoji TEXT DEFAULT '👤',
  tag_id       TEXT REFERENCES village_tags(id),
  notes        TEXT DEFAULT '',    -- private notes about this person
  joined_at    TEXT DEFAULT (datetime('now'))
);

-- Per-person access overrides (overrides tag defaults)
CREATE TABLE village_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  tool_id    TEXT NOT NULL,
  level      TEXT,                 -- NULL = no access (explicit override to revoke)
  granted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, tool_id)
);

-- Resolved access view (tag defaults + overrides merged at query time)
-- Computed in application layer, not a DB view

-- Activity feed (written locally, synced to cloud)
CREATE TABLE village_activity (
  id            TEXT PRIMARY KEY,  -- uuid (stable across sync)
  source_tool   TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',  -- full JSON, all fields
  created_at    TEXT DEFAULT (datetime('now')),
  synced_at     TEXT                          -- null = pending sync
);

-- Comments from village members
CREATE TABLE village_comments (
  id          TEXT PRIMARY KEY,    -- uuid
  activity_id TEXT NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  synced_at   TEXT
);

-- Reactions
CREATE TABLE village_reactions (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(activity_id, member_id)
);

-- Notification preferences
CREATE TABLE village_notifications (
  member_id   TEXT PRIMARY KEY REFERENCES village_members(id) ON DELETE CASCADE,
  frequency   TEXT DEFAULT 'daily',  -- daily | weekly | never
  last_sent_at TEXT
);
```

---

## Architecture

```
Your tools (Grove, Think, …)
    │  emit events → admin event bus
    ▼
Admin electron/main.js
    │  village:processEvents()
    │  reads events → writes village_activity (local)
    │  renders template strings per permission level
    │
    ├──── admin.db (local SQLite, source of truth)
    │
    └──── Supabase (cloud, encrypted)
              │
              ├─ village_activity rows (payload encrypted before upload)
              ├─ village_comments (written by village members, synced down)
              ├─ village_reactions (same)
              └─ member auth (Supabase magic links → email)
                        │
                        ▼
              Village Web App (Vercel, static React)
                  Reads from Supabase via JS client
                  Renders feed filtered by member's access level
                  Mobile-first
```

### Why Supabase

- Free tier: 500MB Postgres, 2GB storage, 50k monthly active users
- Magic link auth built in — Supabase sends the email, manages the session
- Row-level security: a village member's session can only read rows where they have access
- Realtime subscriptions (Phase 2: live feed updates)
- You own the data — can export or self-host Supabase later

### Encryption model

Before any activity payload leaves your device:

1. A symmetric key per member is generated and stored in admin.db (never leaves your machine unencrypted)
2. The payload is encrypted with that key using AES-256-GCM
3. The encrypted blob is pushed to Supabase
4. The decryption key is embedded (encrypted) in the member's magic link / session JWT
5. The web app decrypts client-side in the browser

Supabase stores only ciphertext. If Supabase were breached, payloads are unreadable.

For Phase 1: use simpler row-level security (Supabase RLS) with the member's auth session
as the access control — full E2E client-side encryption is Phase 2.

---

## Village Web App

**Stack:** React 18, Vite, Tailwind CSS — deployed to Vercel (free). Separate repo:
`ramcha24/village-web`.

**Pages:**

**`/` (Feed)** — chronological activity feed across all tools the member has access to.
- Each item: tool icon, activity text (rendered at their permission level), timestamp
- Commenter+ : comment box inline
- Reader+: emoji reactions
- Warm, personal tone — not a dashboard

**`/activity/:id`** — single activity expanded with full comment thread

**`/me`** — member's profile: their name, which tools they follow, notification prefs

**Design language:** light, warm, minimal. Not a SaaS product. Feels like a personal letter
or a shared journal — because that's what it is.

---

## Admin UI additions (Electron)

**New sidebar: Village** (👥)

**Members tab:**
- List of village members: avatar, name, tag, active/inactive
- "Add member" form: name, email, tag (optional), tool overrides
- Per member: "View their access", "Resend invite", "Edit overrides", "Remove"

**Tags tab:**
- List of tags with default access table (tools × levels)
- "Create tag", edit defaults, delete tag

**Activity tab:**
- Your own village feed (what village members see)
- Shows comments + reactions from members
- Reply to comments from here

**Sync status tab:**
- Items pending sync, last synced time
- Manual "Sync now" button
- Supabase connection status

---

## Admin Settings additions

Under Settings → Village:
- Supabase project URL + anon key (configured once)
- Email digest day/time preference
- "My village web app URL" — the Vercel URL (displayed so you can copy)
- Enable/disable village sync

---

## Tool integration (what a tool author does)

1. Add `village.activity_types` and `village.interaction_types` to `tool.json`
   (define level-specific templates for each activity type)

2. Call the existing IPC: `window.api.publishEvent(toolId, activityType, payload)`
   — **no new IPC needed**, the events table is already built

3. Admin's village pipeline handles the rest:
   - Reads from events table
   - Renders level-specific strings from the tool's templates
   - Stores in village_activity
   - Syncs to Supabase

4. Interactions back (comments/suggestions) arrive via the event bus as
   `village:interaction` events — tool can listen for these if it wants to surface them

---

## Implementation phases

### Phase 1 — Ship the core
- [ ] Village tags data model + Admin UI (Members + Tags tabs)
- [ ] village_activity pipeline (events → village_activity, level-specific rendering)
- [ ] Supabase project setup + schema + RLS policies
- [ ] Admin sync: push village_activity to Supabase on new events
- [ ] Village web app: Feed page + single activity page (read-only first)
- [ ] Supabase magic link auth → village member can sign in
- [ ] Update grove/tool.json with village.activity_types templates
- [ ] Admin Settings → Village (Supabase credentials)

### Phase 2 — Engagement + persistence
- [ ] Comments + reactions (web app → Supabase → sync back to admin.db)
- [ ] Email digest (Admin cron → nodemailer or Supabase edge function)
- [ ] Member profile page + notification preferences
- [ ] Admin Activity tab (see comments from members, reply)
- [ ] Realtime feed updates in web app (Supabase realtime)

### Phase 3 — Encryption + relational depth
- [ ] Client-side E2E encryption (AES-256-GCM, per-member keys)
- [ ] Village member's own Admin suite → cross-village resonance
- [ ] Collaborative views (Collaborator level, tool-specific)

---

## Resolved open questions

| Question | Decision |
|----------|----------|
| Hosted website or local server? | Hosted: Vercel (web app) + Supabase (backend). No tunnel needed. |
| Notification channel? | Email digest — Supabase magic links handle member auth email; nodemailer for digests |
| Activity granularity? | Each tool defines its own templates per permission level in tool.json |
| Stable URL? | Yes — Vercel gives a permanent URL; member bookmarks it |
| Data storage | Local admin.db (source of truth) + Supabase (encrypted cloud sync) |
| Tags | Yes — tag = default access bundle; per-person overrides stack on top |

## Remaining open questions

1. **Village web app name/domain?** The Vercel URL can be custom (e.g. `village.yourname.dev`)
   with a free domain or a custom one you own.

2. **Cross-village (Phase 3)?** If a village member also builds their own tools, do you want
   mutual visibility — i.e., you can follow *their* journey too? Or is this one-directional?

3. **Interaction back-channel?** When a Collaborator on Grove suggests a resource — where
   does that surface in your Grove UI? A notification badge? A dedicated inbox in Admin?
