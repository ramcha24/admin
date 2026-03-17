# The Village — Plan v4

---

## The vision in one sentence

A network called **Village** where people register a username, connect their personal tools,
and share their journey — what they're learning, building, and working on — with their
trusted circle. Your handle is `ram@village`. Theirs is `alice@village`. Anyone can build
tools and share usage through the same network.

---

## What this is, architecturally

Village is a **shared platform**, not a self-hosted node per person.

```
         Your Admin suite                  Alice's Admin suite
         (local, your machine)             (local, her machine)
                │                                  │
                │ sync (encrypted)                 │ sync (encrypted)
                ▼                                  ▼
        ┌──────────────────────────────────────────────────┐
        │              village platform                     │
        │  (Supabase backend + Cloudflare Pages web app)   │
        │                                                   │
        │  • username registry  (ram, alice, …)            │
        │  • activity routing   (who sees what)            │
        │  • interaction relay  (comments, reactions)      │
        │  • auth               (magic links + sessions)   │
        └──────────────────────────────────────────────────┘
                │                                  │
                ▼                                  ▼
        ram's village feed               alice's village feed
        (what his village sees)          (what her village sees)
```

**Your data never leaves your machine unencrypted.** Admin encrypts activity payloads
before syncing to the platform. The platform stores ciphertext and routes it — it never
reads your notes.

**The platform is what you're building first** (for yourself). Opening it to others is
Phase 3 — but the architecture supports it from day one.

---

## Handles

```
ram@village
alice@village
```

- `@village` is the platform name — everyone on the network shares the same domain
- The actual domain for the platform: start on a free subdomain, register `village.app`
  (or `village.tools`, `village.dev`) when ready — ~$12/yr via Cloudflare Registrar
- For now, during development: `village.pages.dev` (Cloudflare Pages free subdomain)
- Your username is chosen at setup in Admin Settings → Village

The handle is used for:
1. Cross-village connections — you add `alice@village` in your Admin, Admin queries the
   platform for her public profile + grants cross-village access
2. Activity attribution — your feed says "from ram@village"
3. Future: notifications between users

---

## How it connects to your Admin suite

```
Admin Settings → Village
  Username:      ram
  Platform URL:  https://village.pages.dev   (later: https://village.app)
  API key:       {generated at registration}
  Sync:          ● live
```

When you register, Admin generates a keypair. Public key is stored on the platform.
Private key stays in admin.db. Encrypted activity payloads are signed with your private key.

---

## Permission levels

Each tool defines what each level *means* for its own activities (in `tool.json`).
The four levels are fixed — your village members learn what they mean once.

| Level | Intent |
|-------|--------|
| **Follower** | I see the shape of your journey, not the details |
| **Reader** | I can see what you're working on and how it's going |
| **Commenter** | I can see everything and leave thoughts, questions, encouragement |
| **Collaborator** | I'm actively involved — I can suggest, contribute, co-work. You get notified when I act. |

---

## Village Tags

Tags bundle default access for a type of relationship. Assigning a tag to a member
instantly grants their defaults. Per-person overrides stack on top.

```
Tag: "Family"
  Grove → Reader
  Think → Follower

Tag: "Study Buddy"
  Grove → Collaborator
  Think → Reader

Tag: "Close Friend"
  Grove → Reader
  Think → Reader
```

Add Alice → tag: Study Buddy → she gets Grove:Collaborator + Think:Reader.
Override: Alice → Think: none → one row in village_access with level = NULL.

---

## Village Protocol — `tool.json` extension

Each tool declares what it shares and how, per level:

```json
{
  "village": {
    "activity_types": [
      {
        "id": "session_logged",
        "label": "Logged a study session",
        "levels": {
          "follower":     "{{owner}} studied today",
          "reader":       "{{owner}} studied {{course_title}} for {{duration_minutes}} min",
          "commenter":    "{{owner}} studied {{course_title}} for {{duration_minutes}} min. Notes: {{notes}}",
          "collaborator": "{{owner}} studied {{course_title}} for {{duration_minutes}} min. Notes: {{notes}}"
        }
      }
    ],
    "interaction_types": [
      {
        "id": "suggest_resource",
        "label": "Suggest a resource",
        "min_level": "collaborator",
        "fields": [
          { "name": "body", "type": "text",  "label": "Message" },
          { "name": "link", "type": "url",   "label": "Link (optional)", "required": false }
        ]
      }
    ]
  }
}
```

Tools emit to the existing event bus (`publishEvent` IPC, already built).
Admin's village pipeline reads events, renders templates, encrypts, syncs to platform.

---

## Data model

### admin.db (local)

```sql
-- Village identity
CREATE TABLE village_identity (
  id          INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  username    TEXT NOT NULL,
  platform_url TEXT NOT NULL DEFAULT 'https://village.pages.dev',
  api_key     TEXT NOT NULL,
  private_key TEXT NOT NULL,   -- encryption key, never leaves this device
  public_key  TEXT NOT NULL
);

-- Village tags
CREATE TABLE village_tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT DEFAULT '🏷️',
  color       TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT ''
);

CREATE TABLE village_tag_defaults (
  tag_id  TEXT NOT NULL REFERENCES village_tags(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,         -- tool id or '*' for all
  level   TEXT NOT NULL,
  PRIMARY KEY (tag_id, tool_id)
);

-- Village members
CREATE TABLE village_members (
  id           TEXT PRIMARY KEY,  -- uuid
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  village_handle TEXT DEFAULT '', -- e.g. "alice@village" if they're also on the platform
  avatar_emoji TEXT DEFAULT '👤',
  tag_id       TEXT REFERENCES village_tags(id),
  notes        TEXT DEFAULT '',
  joined_at    TEXT DEFAULT (datetime('now'))
);

-- Per-person access overrides (NULL = explicit revoke)
CREATE TABLE village_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL REFERENCES village_members(id) ON DELETE CASCADE,
  tool_id    TEXT NOT NULL,
  level      TEXT,
  granted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, tool_id)
);

-- Activity feed (local source of truth)
CREATE TABLE village_activity (
  id            TEXT PRIMARY KEY,  -- uuid
  source_tool   TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  synced_at     TEXT
);

-- Interactions from village members (synced down from platform)
CREATE TABLE village_interactions (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES village_activity(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  member_name TEXT NOT NULL,
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT DEFAULT (datetime('now')),
  synced_at   TEXT,
  read_at     TEXT              -- null = unread → drives notification badge
);

-- Notification preferences
CREATE TABLE village_notifications (
  member_id    TEXT PRIMARY KEY REFERENCES village_members(id) ON DELETE CASCADE,
  frequency    TEXT DEFAULT 'daily',
  last_sent_at TEXT
);
```

### Platform schema (Supabase Postgres)

```sql
-- Registered users
create table users (
  id           uuid primary key default gen_random_uuid(),
  username     text unique not null,
  display_name text,
  public_key   text,               -- for verifying encrypted payloads
  created_at   timestamptz default now()
);

-- Village connections (A can see B's feed at a given level)
create table connections (
  id         bigint generated always as identity primary key,
  from_user  uuid references users(id) on delete cascade,  -- the viewer
  to_user    uuid references users(id) on delete cascade,  -- the owner
  tool_id    text not null,       -- which tool, or '*'
  level      text not null,
  granted_at timestamptz default now(),
  unique(from_user, to_user, tool_id)
);

-- Activity items (encrypted)
create table activity (
  id           uuid primary key,
  owner_id     uuid references users(id) on delete cascade,
  source_tool  text not null,
  activity_type text not null,
  payload_enc  text not null,     -- AES-256-GCM ciphertext
  created_at   timestamptz not null,
  received_at  timestamptz default now()
);

-- Per-connection rendered text (level-specific, also encrypted)
create table activity_rendered (
  activity_id  uuid references activity(id) on delete cascade,
  viewer_id    uuid references users(id) on delete cascade,
  rendered_enc text not null,     -- encrypted for viewer's key
  primary key (activity_id, viewer_id)
);

-- Interactions (comments, reactions, collaborator actions)
create table interactions (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid references activity(id) on delete cascade,
  from_user   uuid references users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz default now()
);

-- RLS: users can only read activity they have a connection to
-- (applied per table)
```

---

## Notification flow (Collaborator acts → you see it)

1. `alice@village` leaves a suggestion on your Grove session (web app → Supabase)
2. Supabase realtime broadcasts on the `interactions` channel
3. Admin main.js has an open Supabase realtime subscription
4. New interaction → written to local `village_interactions` with `read_at = null`
5. Admin renderer receives IPC event → Village nav item shows unread count badge
6. You click Village → Activity tab → see the suggestion in context, reply inline
7. Your reply syncs back to Supabase → Alice sees it on her feed

For tools: Admin also emits a `village:interaction` event on the local event bus
tagged with `tool_id` — the tool can optionally surface it inline.

---

## Village Web App

**Repo:** `ramcha24/village-web` (to be created)
**Stack:** React 18 + Vite + Tailwind + Supabase JS client
**Deploy:** Cloudflare Pages (free)

**Pages:**

`/` → Feed — all activity from people you follow (your village)
`/u/:username` → Someone's public profile + their public activity
`/activity/:id` → Single activity + thread (comments, reactions)
`/me` → Your profile, tool access summary, notification preferences
`/auth/callback` → Supabase magic link landing

**Design language:** warm, personal, minimal. Not a product feed. More like a shared
journal. Mobile-first. No algorithmic sorting — strictly chronological.

---

## Admin UI additions

**Sidebar: Village** (👥) with unread badge

**Members tab** — add/manage your village members, assign tags, edit overrides

**Tags tab** — create/edit relationship tags with default access

**Activity tab (inbox)** — interactions from village members; reply inline; unread badge

**Federation tab** (Phase 3) — add `alice@village` to follow her journey; manage
cross-village connections you've issued and received

**Settings → Village** — username, platform URL, API key, sync status, email digest schedule

---

## The platform as a product (Phase 3 horizon)

Right now: you build it for yourself and a handful of village members.

Later: anyone can go to `village.app`, register a username, connect their Admin suite,
and share their journey with their people. The platform just routes encrypted activity —
it never reads your data. Every tool built in the Admin suite is automatically
village-capable because of the Village Protocol standard.

The differentiator: this isn't a social media feed optimised for engagement. It's a
**relational layer for people who build things** — sharing progress with the people who
actually care about you, not performing for strangers.

The minimal open standard (VFP) means someone could build a different admin tool in
Python or Go and still connect to `village.app` and to your suite. The protocol is the
interoperability layer.

---

## Implementation phases

### Phase 1 — Foundation (build now)
- [ ] Village data model in admin.db (identity, tags, members, access, activity, interactions)
- [ ] `village:processEvents()` pipeline — events → village_activity, template rendering
- [ ] Platform: Supabase project setup — users, connections, activity, interactions tables + RLS
- [ ] Admin ↔ platform sync (push activity, pull interactions)
- [ ] Admin UI: Members + Tags tabs
- [ ] Village web app: Feed + activity detail (read-only first)
- [ ] Magic link auth — members sign in on web app
- [ ] grove/tool.json: village.activity_types filled in
- [ ] Admin Settings → Village (username registration, platform credentials)
- [ ] New-tool scaffold template: pre-fill village stubs in tool.json

### Phase 2 — Engagement
- [ ] Interactions in web app (comments, reactions, collaborator actions)
- [ ] Supabase realtime → Admin notification badge
- [ ] Admin Activity inbox + inline reply
- [ ] Email digest (Supabase edge function or nodemailer)
- [ ] Member profile + notification preferences page
- [ ] Custom domain: register `village.app` (or `village.tools`) via Cloudflare Registrar

### Phase 3 — Open platform
- [ ] Public registration on village.app
- [ ] VFP cross-village connections (`alice@village` discovery + feed query)
- [ ] Admin Federation tab
- [ ] VFP open spec published (so others can build compatible admin tools)
- [ ] Client-side E2E encryption (AES-256-GCM, per-viewer rendered text)

---

## Open questions before Phase 1 build

1. **Username** — what do you want your handle to be? `ram@village`, `ramcha@village`,
   something else? This gets stored in admin.db and shown to your village members.

2. **First village member** — who's the first person you'd add and at what level for
   which tools? Helps design the invite UX against a real case.

3. **Grove activity to share** — for grove/tool.json village block: which activity types
   do you want to surface? Study sessions, skill completions, study streaks, something else?
