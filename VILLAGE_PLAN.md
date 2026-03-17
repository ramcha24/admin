# The Village — Plan v3

## What this is

A social layer woven into your Admin suite. You share tools with your "village" — trusted
people who follow your journey, cheer you on, and co-work with you. You control exactly who
sees what. Data is locally owned, cloud-synced (encrypted). Village members access everything
through a hosted website — no app, any device, any time.

In the long run: a federated network of personal admin suites — each person owns their node,
and nodes that implement the Village Federation Protocol can discover and talk to each other.

---

## Resolved decisions

| Question | Decision |
|----------|----------|
| Hosting | Cloudflare Pages (free) + Supabase (free tier) |
| Domain | Start on free Vercel/CF subdomain; add `yourname.dev` from Cloudflare Registrar (~$11/yr, at-cost) when ready |
| Notifications | Email digest (Supabase magic links) + in-Admin notification badge via Supabase realtime |
| Cross-village | Federated — Village Federation Protocol (VFP). Each admin suite is a node. Phase 3. |
| Collaborator back-channel | Supabase realtime → Electron notification badge → Admin activity inbox |
| Data | Local admin.db (source of truth) + Supabase (encrypted cloud sync) |

---

## Permission levels

Fixed four levels; each tool defines what each level *means* for its own activities.

| Level | Intent |
|-------|--------|
| **Follower** | I know you're on a journey. I see the shape of it, not the details. |
| **Reader** | I can see what you're working on and how it's going. |
| **Commenter** | I can see everything and leave thoughts, questions, encouragement. |
| **Collaborator** | I'm actively involved — I can suggest, contribute, co-work. You get notified when I act. |

---

## Village Protocol — `tool.json` extension

Each tool defines its own level-specific templates and interaction types:

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
      }
    ],
    "interaction_types": [
      {
        "id": "suggest_resource",
        "label": "Suggest a resource",
        "min_level": "collaborator",
        "description": "Share a link, note, or encouragement relevant to this session",
        "fields": [
          { "name": "body",  "type": "text",   "label": "Message" },
          { "name": "link",  "type": "url",    "label": "Link (optional)", "required": false }
        ]
      }
    ]
  }
}
```

Tools emit events using the existing event bus (`publishEvent` IPC — already built). Admin's
village pipeline reads events, renders templates per member's access level, syncs to Supabase.

---

## Village Tags

Tags bundle default tool access for a type of relationship. Assigning a tag to a member
gives them those defaults instantly. Per-person overrides stack on top.

**Example:**

| Tag | Grove | Think | Admin |
|-----|-------|-------|-------|
| Family | Reader | Follower | — |
| Study Buddy | Collaborator | Reader | — |
| Close Friend | Reader | Reader | Follower |
| Accountability Partner | Commenter | — | — |

**Add Alice → tag: Study Buddy** → Alice gets Grove:Collaborator + Think:Reader.
**Override: Alice → Think: none** → one row in `village_access` with `level = NULL`.

---

## Data model (admin.db additions)

```sql
-- Village tags
CREATE TABLE village_tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT DEFAULT '🏷️',
  color       TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT ''
);

-- Default access per tag
CREATE TABLE village_tag_defaults (
  tag_id  TEXT NOT NULL REFERENCES village_tags(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  level   TEXT NOT NULL,
  PRIMARY KEY (tag_id, tool_id)
);

-- Village members
CREATE TABLE village_members (
  id           TEXT PRIMARY KEY,    -- uuid
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '👤',
  tag_id       TEXT REFERENCES village_tags(id),
  notes        TEXT DEFAULT '',     -- private
  joined_at    TEXT DEFAULT (datetime('now'))
);

-- Per-person access overrides (NULL level = explicit revoke)
CREATE TABLE village_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  tool_id    TEXT NOT NULL,
  level      TEXT,
  granted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, tool_id)
);

-- Activity feed (written locally, synced encrypted to Supabase)
CREATE TABLE village_activity (
  id            TEXT PRIMARY KEY,   -- uuid (stable across sync)
  source_tool   TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  synced_at     TEXT
);

-- Interactions from village members (synced down from Supabase)
CREATE TABLE village_interactions (
  id            TEXT PRIMARY KEY,
  activity_id   TEXT NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id     TEXT NOT NULL,
  member_name   TEXT NOT NULL,
  type          TEXT NOT NULL,      -- "comment" | "reaction" | tool-specific id
  payload       TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  synced_at     TEXT,
  read_at       TEXT                -- null = unread (drives notification badge)
);

-- Notification preferences per member
CREATE TABLE village_notifications (
  member_id    TEXT PRIMARY KEY REFERENCES village_members(id) ON DELETE CASCADE,
  frequency    TEXT DEFAULT 'daily',
  last_sent_at TEXT
);
```

**Access resolution** (application layer, not DB view):
```
resolveAccess(memberId, toolId):
  1. Check village_access for (memberId, toolId) override → if exists, use it (NULL = no access)
  2. Else look up member.tag_id → village_tag_defaults for (tag_id, toolId)
  3. Else look up village_tag_defaults for (tag_id, '*')
  4. Else → no access
```

---

## Architecture

```
Your tools (Grove, Think, …)
    │  emit events → admin event bus (already built)
    ▼
Admin main.js
    │  village:processEvents() — interval job
    │  reads events → renders templates → writes village_activity
    │  encrypts payload → pushes to Supabase
    │
    ├──── admin.db (local SQLite, source of truth)
    │
    └──── Supabase project (cloud)
              ├─ village_activity   (encrypted payloads, per-member rendered text)
              ├─ village_interactions (comments, reactions, collaborator actions)
              ├─ member auth (Supabase magic links)
              └─ realtime channel → Admin subscribes → notification badge
                        │
                        ▼
              Village Web App (Cloudflare Pages, static React)
                  Supabase JS client — auth + data
                  Feed, activity detail, interactions, member profile
                  Mobile-first
```

### Notification flow (Collaborator acts → you see it)

1. Collaborator leaves a suggestion on a Grove session (web app → Supabase)
2. Supabase realtime broadcasts the new row on `village_interactions`
3. Admin main.js has an open Supabase realtime subscription
4. On new interaction: writes to local `village_interactions`, sets `read_at = null`
5. Admin renderer is notified via `ipcMain.send` → Village nav item shows badge count
6. Click Village → Activity tab → see the interaction in context

For tools: Admin also emits a `village:interaction` event on the local event bus with the
tool_id → the tool can optionally surface it inline (e.g., a Grove session showing a
"suggestion from Alice" badge).

---

## Village Web App

**Repo:** `ramcha24/village-web` — React 18 + Vite + Tailwind + Supabase JS client.
Deployed to Cloudflare Pages (free, unlimited bandwidth on static assets).

**Pages:**
- `/` — feed (all tool activity, filtered by access level, chronological)
- `/activity/:id` — single activity + interaction thread
- `/me` — profile, tool access summary, notification preferences
- `/auth/callback` — Supabase magic link landing

**Domain plan:**
- Phase 1: free Cloudflare Pages URL (`village-web.pages.dev`)
- Phase 2: register `yourname.dev` via Cloudflare Registrar (~$11/yr) → point to Pages

---

## Village Federation Protocol (VFP)

A minimal open standard so different admin suite implementations can talk to each other.
Designed for Phase 3, but specified now so the data model accommodates it.

### Discovery

Each village web deployment exposes:

```
GET /.well-known/vfp.json
{
  "version": "1",
  "owner": {
    "name": "Ram",
    "handle": "@ram@village.ramcha24.dev",
    "avatar": "🌿"
  },
  "api": "https://village.ramcha24.dev/api/vfp/v1",
  "capabilities": ["activity-feed", "interactions"]
}
```

The `handle` format is `@name@domain` — same convention as ActivityPub/Mastodon handles,
but VFP is its own simpler protocol.

### Minimal API surface (what every VFP node must implement)

```
GET  /api/vfp/v1/profile
     → public profile of the owner (name, avatar, bio, public activity count)

GET  /api/vfp/v1/feed?since={iso}&limit={n}
     Authorization: Bearer {cross-village-token}
     → activity items this person has chosen to share cross-village
       (a subset — owner decides what crosses the village boundary)

POST /api/vfp/v1/interact
     Authorization: Bearer {cross-village-token}
     { activity_id, type, payload }
     → send a comment, reaction, or collaborator action
     → 201 on success, 403 if token doesn't permit interactions

GET  /api/vfp/v1/handshake
     → returns whether the provided token is valid and what access it grants
```

### Cross-village connection flow

1. Alice wants to follow Ram's journey.
2. Ram adds Alice as a village member in his Admin.
3. Ram grants her a cross-village token scoped to selected tools at chosen levels.
4. Ram sends Alice her village URL (standard magic link).
5. In Alice's Admin (or her Admin-equivalent tool), she adds Ram's handle
   `@ram@village.ramcha24.dev`.
6. Her Admin discovers Ram's VFP endpoint via `.well-known/vfp.json`.
7. Her Admin queries `/api/vfp/v1/feed` with the token → she sees Ram's feed
   in her own Admin's Village view.
8. Mutual: if Alice has a village setup and grants Ram access, Ram can follow her too.

### What "different admin implementations" means

Alice might have a different tech stack entirely (Python, Go, whatever). As long as her
admin tool:
- Serves `/.well-known/vfp.json`
- Implements the 4 VFP API endpoints
- Issues and validates VFP tokens

…it can federate with Ram's admin suite. The protocol is HTTP + JSON. No SDK required.

The VFP is intentionally minimal — it defines *how nodes communicate*, not *what they build*.
Each admin implementation is free to extend beyond the protocol.

---

## Admin UI additions

**Sidebar: Village** (👥) with unread badge when collaborators have acted

**Members tab:**
- List: avatar emoji, name, tag, tools they have access to (compact chips)
- "Add member" → name, email, tag → generates invite
- Per-member: expand → edit access overrides, resend invite, remove

**Tags tab:**
- List of tags with default access summary
- Create / edit / delete tags
- Quick-assign: drag member → tag

**Activity tab (inbox):**
- All interactions from village members (comments, reactions, collaborator actions)
- Grouped by activity
- Reply inline → comment syncs back to Supabase
- Unread indicator drives the nav badge

**Federation tab** (Phase 3):
- Add cross-village connections by handle (`@alice@village.alice.dev`)
- See their feed in your Admin
- Manage tokens you've issued and received

**Settings → Village:**
- Supabase URL + anon key
- Email digest schedule
- Village web app URL (copy button)
- Sync status + "Sync now"

---

## Implementation phases

### Phase 1 — Core: share and see
- [ ] Village data model (tags, members, access, activity, interactions tables)
- [ ] `village:processEvents()` pipeline — events → village_activity, template rendering
- [ ] Supabase project setup + RLS policies + member auth
- [ ] Admin sync: push village_activity encrypted to Supabase
- [ ] Village web app: Feed + activity detail (read-only)
- [ ] Supabase magic link → member can sign in on web app
- [ ] Admin UI: Members tab + Tags tab
- [ ] grove/tool.json: village.activity_types filled in

### Phase 2 — Engagement + notifications
- [ ] Interactions (comments, reactions) in web app → Supabase
- [ ] Supabase realtime → Admin notification badge
- [ ] Admin Activity tab (inbox) + reply
- [ ] Tool event bus routing: `village:interaction` events to relevant tools
- [ ] Email digest (nodemailer or Supabase edge function)
- [ ] Member profile + notification preferences page
- [ ] Custom domain (Cloudflare Registrar + Pages)

### Phase 3 — Federation
- [ ] VFP API endpoints (served via Supabase edge functions or Cloudflare Workers)
- [ ] `/.well-known/vfp.json` served from village web app
- [ ] Admin: Federation tab — add cross-village handle, view federated feed
- [ ] VFP token issuance and validation
- [ ] Admin template for new tools: include VFP endpoint boilerplate

---

## What the new-tool template should include

When Admin scaffolds a new tool, it should:
1. Pre-fill `tool.json` with an empty `village` block (stubs for activity_types, interaction_types)
2. Add a comment in `electron/main.js` showing the `publishEvent` call pattern for village activities
3. Include a `VILLAGE.md` stub: "Fill in tool.json village block to share this tool with your village"

This ensures every tool built in the suite is village-ready from day one.
