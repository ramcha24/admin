# The Village — Plan

## What this is

A social layer built into Admin that lets you share your tools with trusted people
(your "village") — friends, family, collaborators. You decide, per person and per tool,
what they can see and how they can engage. The goal is genuine connection: your village
can follow your journey, cheer you on, ask questions, and eventually co-create alongside
you.

---

## Core principles

1. **You control the aperture.** Each sharing rule is: person × tool × permission level.
   Granting access to Grove does not grant access to Think.

2. **Tools speak a common language.** Every tool in the Admin suite implements the Village
   Protocol — a small standard declared in `tool.json`. Admin aggregates and routes.

3. **Village members get a web UI, not an app to install.** Admin runs a local HTTP server
   and exposes it via a secure tunnel (Cloudflare Tunnel — free, no port forwarding). Each
   village member gets a personal URL with magic-link auth.

4. **Privacy by default.** Until you explicitly share a tool with someone, nothing is
   visible. Sharing is additive, never accidental.

5. **Relational, not broadcast.** The UI is personal. Each member sees their own feed,
   tailored to what they have access to. In the future, if they also build tools, mutual
   context can surface.

---

## Permission levels

| Level | What they see | What they can do |
|-------|--------------|-----------------|
| **Follower** | That activity happened ("Ram logged a session today") | Nothing — read-only |
| **Reader** | Full activity details ("45 min on Linear Algebra, notes: …") | React (emoji) |
| **Commenter** | Full details | Leave comments / questions on activity |
| **Collaborator** | Full details + tool-specific views | Tool-specific actions (defined per tool) |

A person can have different levels across different tools.
Example: Alice is a Collaborator on Grove, Follower on Think, no access to Admin.

---

## Village Protocol standard

Each tool declares participation in `tool.json`:

```json
{
  "village": {
    "activity_types": [
      {
        "id": "session_logged",
        "label": "Logged a study session",
        "detail_fields": ["course_title", "duration_minutes", "notes"],
        "min_level_to_see_detail": "reader"
      },
      {
        "id": "skill_completed",
        "label": "Completed a skill",
        "detail_fields": ["course_title"],
        "min_level_to_see_detail": "follower"
      }
    ],
    "interaction_types": [
      {
        "id": "suggest_resource",
        "label": "Suggest a resource",
        "min_level": "collaborator",
        "handler": "village:receiveInteraction"
      }
    ]
  }
}
```

- `activity_types` — what this tool emits to the village feed
- `detail_fields` — which fields appear at Reader level vs. Follower (summary only)
- `interaction_types` — what village members can do back, and the minimum level required

---

## Data model (admin.db additions)

```sql
-- Village members
CREATE TABLE village_members (
  id           TEXT PRIMARY KEY,          -- uuid
  name         TEXT NOT NULL,
  email        TEXT,
  avatar_emoji TEXT DEFAULT '👤',
  notes        TEXT DEFAULT '',           -- your notes about this person (private)
  joined_at    TEXT DEFAULT (datetime('now'))
);

-- Sharing rules: person × tool × level
CREATE TABLE village_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  tool_id    TEXT NOT NULL,               -- matches tool_registry.id, or '*' for all
  level      TEXT NOT NULL,               -- follower | reader | commenter | collaborator
  granted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, tool_id)
);

-- Magic link tokens (stateless auth — no passwords)
CREATE TABLE village_tokens (
  token      TEXT PRIMARY KEY,            -- cryptographically random 32-byte hex
  member_id  TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  last_used  TEXT,
  device_hint TEXT DEFAULT ''             -- "iPhone 15", "Ram's MacBook" etc.
);

-- Activity feed (sourced from events table, enriched)
CREATE TABLE village_activity (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_tool  TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',  -- JSON: full detail fields
  summary      TEXT NOT NULL DEFAULT '',    -- 1-line summary for Follower level
  created_at   TEXT DEFAULT (datetime('now'))
);

-- Comments from village members
CREATE TABLE village_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Reactions (emoji)
CREATE TABLE village_reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  UNIQUE(activity_id, member_id)
);

-- Notification preferences per member
CREATE TABLE village_notifications (
  member_id     TEXT PRIMARY KEY REFERENCES village_members(id) ON DELETE CASCADE,
  channel       TEXT DEFAULT 'email',   -- email | none (sms/push later)
  frequency     TEXT DEFAULT 'daily',   -- realtime | daily | weekly | never
  email_address TEXT DEFAULT ''
);
```

---

## Architecture

```
Your tools (Grove, Think, …)
    │
    │  emit events to admin.db event bus
    ▼
Admin electron/main.js
    │  village:processEvents() — runs on interval, reads new events,
    │  writes to village_activity, enriches with summary
    │
    ├─ Local HTTP server (Express, port 7700)
    │     GET  /feed/:memberId      — activity feed filtered by access
    │     GET  /activity/:id        — single activity detail
    │     POST /comment             — leave a comment (auth required)
    │     POST /react               — emoji reaction (auth required)
    │     GET  /auth/magic/:token   — exchange magic link for session cookie
    │
    └─ Cloudflare Tunnel (cfssl) — exposes :7700 as https://{slug}.trycloudflare.com
           Member receives: https://{slug}.trycloudflare.com/member/{memberId}?token=…
```

### Auth flow

1. You add a member in Admin UI → Admin generates a magic link token (expires in 7 days)
2. Admin generates a shareable URL: `https://{tunnel}/{memberId}?token={token}`
3. You copy and send this URL to the person (however you like — iMessage, email, etc.)
4. They open it → token is validated → a session cookie is set (30-day expiry)
5. Re-auth: Admin regenerates a new link from the Members page and resends

No passwords. No accounts. No app to install. Just a URL.

### Tunnel setup

Uses Cloudflare Tunnel's free unauthenticated tunnels (`cloudflared tunnel --url localhost:7700`).
The tunnel URL is stable per-session but changes on restart. Admin stores the current URL
and displays it in the Members page so you can always see it.

For a stable URL: upgrade to a named Cloudflare Tunnel (free with a Cloudflare account +
custom domain). This is Phase 2.

---

## Village member web UI (served by local Express)

**Feed page** (`/feed`) — chronological activity feed, filtered by the member's access level.
  - Follower: "🌿 Ram logged a study session · 2h ago"
  - Reader: above + "45 min on Linear Algebra. Notes: reviewed eigenvalues…"
  - Commenter: above + comment box below each activity
  - Collaborator: above + tool-specific action buttons

**Activity detail** (`/activity/:id`) — single activity expanded, with reactions + comments thread.

**Profile** (`/me`) — the member sees their own name, what tools they have access to,
notification preferences.

Styling: minimal, warm — not a dashboard. More like a personal letter than a feed.
Mobile-first (members will mostly open from phone).

---

## Admin UI additions (Electron)

**New sidebar item: Village** (👥)

**Members page:**
- List of village members with access summary
- "Add member" → name + email → generates magic link
- Per member: expand to see tool access levels → edit
- "Resend link" → generates new token
- Copy shareable URL button
- See their recent activity (comments, reactions)

**Sharing rules panel (per tool, in ToolCard):**
- "Share with village" button on each tool card
- Opens a panel: checkboxes per member × level selector
- Quick presets: "Share with everyone (Follower)", "Close circle only (Reader)"

**Village activity log:**
- See what has been shared and when
- See all comments from village members, reply from Admin

**Tunnel status indicator** (top of sidebar):
- Green dot: tunnel active, URL shown
- Button: start/stop tunnel
- Copy URL button

---

## Notification system (Phase 1: email digest)

Admin runs a daily/weekly cron (internal, not system cron):
- Queries `village_activity` for new items since last digest
- For each member with `frequency = 'daily'`, groups their visible activity
- Sends a plain-text email via nodemailer (SMTP settings in Admin Settings)
- Subject: "Your village update · {date}"

In Phase 1: SMTP only (Gmail app password, iCloud, etc.), configured in Settings.

---

## How tools integrate (what a tool author does)

1. Add `village.activity_types` and `village.interaction_types` to `tool.json`
2. Call `window.api.publishEvent(toolId, 'session_logged', { course_title, duration_minutes, notes })` when the activity happens — **this is already built** (events table + IPC handler)
3. Admin's `village:processEvents()` reads the event bus, maps to `village_activity`, applies `min_level_to_see_detail` rules automatically
4. Nothing else required in the tool

For interactions coming back (comments, suggestions):
- Admin polls for village interactions and routes them back via the event bus to the relevant tool
- Tool listens on its event bus channel for `village:interaction` events

---

## Implementation phases

### Phase 1 — Core sharing (build this first)
- [ ] `village_members`, `village_access`, `village_tokens`, `village_activity` tables
- [ ] Admin event → village_activity pipeline (`village:processEvents` cron)
- [ ] Express HTTP server on :7700 with magic link auth
- [ ] Member web UI: feed page only (read-only)
- [ ] Admin UI: Members page (add member, set access, generate link)
- [ ] Village Protocol: update grove/tool.json with `village.activity_types`
- [ ] Cloudflare Tunnel integration (start/stop from Admin, display URL)

### Phase 2 — Engagement
- [ ] Comments and reactions
- [ ] Email digest (nodemailer)
- [ ] Notification preferences UI
- [ ] Stable tunnel URL (named Cloudflare Tunnel)
- [ ] Member profile page

### Phase 3 — Relational depth
- [ ] Village member has their own Admin suite → cross-village resonance feed
- [ ] "What are they working on?" surface in your Admin
- [ ] Co-creator flows (tool-specific)

---

## Open questions / decisions before building

1. **Tunnel persistence**: Is a changing URL per-session acceptable for Phase 1, or do you want a stable URL from day one? (Stable requires a Cloudflare account + domain — 15min setup.)

2. **Member web UI hosting**: Local server (requires Admin to be running for members to access) vs. a small deployed server that syncs from your local DB. For Phase 1, local + tunnel is the simplest.

3. **Notification channel**: Email only for Phase 1? Or do you have a preferred channel (iMessage, WhatsApp, Telegram bot)?

4. **Granularity of activity**: For Grove — should village members see individual sessions, or just daily/weekly summaries? (The schema supports both; the tool.json controls it.)

5. **The "relational" vision (Phase 3)**: This implies village members might also build their own tools and you'd have mutual visibility. Is this a near-term goal or a long-horizon aspiration?
