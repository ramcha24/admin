# Admin — Understanding the Tool

Admin is the hub dashboard for the personal OS: it discovers and launches all tools in the workspace, tracks their development status, and provides shared infrastructure (event bus, village social layer, capability gateway, workflows). It is the only tool that has awareness of the full suite — every other tool registers itself here via `tool.json`.

## Documentation Map

| Document | What it covers | Path from this directory |
|----------|---------------|--------------------------|
| `CLAUDE.md` | Architecture overview, key files, safety rules, village/workflow internals | `CLAUDE.md` |
| `USER_STORIES.md` | Full feature spec organized by persona and priority | `USER_STORIES.md` |
| `HOW_IT_WORKS.md` | Full system mental model: IPC pattern, tool protocol levels, event bus, village pipeline | `../docs/HOW_IT_WORKS.md` |
| `STATE_MACHINES.md` | State diagrams for tool compliance levels, village sync pipeline, workflow execution | `../docs/STATE_MACHINES.md` |
| `DECISIONS.md` | Architecture decision records: why Electron, why SQLite, why local-first, why Supabase for village | `../docs/DECISIONS.md` |
| `TOOL_PROTOCOL.md` | L1/L2/L3 compliance spec, tool.json schema, required files per level | `../TOOL_PROTOCOL.md` |
| `electron/database.js` | admin.db schema: tool_registry, events, ideas, village_* tables, workflows, user_stories | `electron/database.js` |
| `tool.json` | Admin's own registry entry; declares services admin:tools:list, admin:capabilities:list | `tool.json` |
| `dev-status.json` | LLM-generated phase/status summary; current build state at a glance | `dev-status.json` |

## How It Fits in the Ecosystem

Admin is the sole hub; all other tools are spokes.

**Services offered (port 7702 — capability gateway):**
- `admin:tools:list` — returns all registered tools and their status
- `admin:capabilities:list` — returns all declared service endpoints across the suite

**Event bus:** Admin owns the `events` table in admin.db. Tools publish via `events:publish(sourceId, eventType, payload)`; Admin writes the row and fires any matching enabled workflows synchronously.

**Village pipeline:** Admin's `electron/village.js` runs a local HTTP server on port 7700. It reads each registered tool's SQLite DB (read-only), upserts activity into `village_activity`, and serves member feeds. `electron/supabase.js` pushes activity and pre-computed per-member feeds to Supabase; pulls interactions back down. `electron/digest.js` sends a daily 8am email digest via Nodemailer.

**Tool discovery:** On launch, Admin walks the parent directory for subdirs containing `tool.json`, upserts each into `tool_registry`, and installs a post-commit hook in each tool's git repo via `installPostCommitHook()` in `electron/main.js`.

## Key Concepts

1. **Tool Protocol Levels (L1/L2/L3):** A compliance ladder. L1 = tool.json + CLAUDE.md + git repo. L2 adds USER_STORIES.md, post-commit hook, dev-status.json. L3 adds a running service server and village activity emission. Admin checks and displays each tool's level in the tool grid.

2. **Capability Gateway (port 7702):** A local HTTP broker. Tools declare services in `tool.json` under `"services"`. Admin routes capability calls to the right tool's service port. Each registered tool runs its own service server on its declared port (e.g., 7710, 7711, 7712, …).

3. **Event Bus:** The `events` table is the pub/sub backbone. Any tool can publish a typed event; Admin's workflow runner picks it up and executes configured actions (send_email_digest, sync_village, log_to_console). This is how loose coupling between tools is achieved without direct imports.

4. **Village:** A local-first social layer. Members have per-tool access levels (follower/reader/commenter/collaborator), optionally grouped by tags. Activity flows from tool DBs → village_activity → Supabase → Cloudflare Pages (public web app). Interactions (comments/reactions) flow the opposite direction.

5. **Ideas → Plan pipeline:** Ideas are captured in free text, polished with AI, and promoted to structured plans. The Ideas module is an internal scratchpad that feeds the tool-creation workflow (NLP prompt → Claude API plan → scaffold template → open Terminal with `claude` CLI).

## What's Currently Built

See `dev-status.json` for the LLM-generated phase summary. As of the last update: the core hub is fully operational — tool discovery, launch, Ideas, Issues, Services catalog, Village (members/tags/activity/inbox/Supabase sync/email digest), Workflows, User Stories, and Settings are all implemented. The tool grid shows L1/L2/L3 compliance badges. Post-commit hook auto-installation is live. The capability gateway runs on 7702 and serves admin's own two services.

## What's Not Yet Built

- **Some tool service handlers not yet implemented:** Some registered tools declare service servers in their `tool.json` but have not yet implemented the HTTP server handler. Admin's capability routing to those tools is non-functional until the handler is added.
- **Non-SQLite tool village sync:** The village sync pipeline reads SQLite DBs from registered tools. For tools that use a different persistence model (e.g., Markdown files), a custom sync function is needed and may not be implemented yet.
- **Full Supabase setup:** Requires user to supply URL + anon key in Settings. Until configured, all Supabase-dependent features (cloud village, deployed web app) are inert.
- **Email digest:** Requires SMTP credentials in Settings. The cron and mailer code exist but won't fire without config.

## Where to Start

Read `../docs/HOW_IT_WORKS.md` first — it explains the full mental model of how the suite fits together, what the IPC pattern looks like end-to-end, and how the capability gateway and village pipeline work. Then read `CLAUDE.md` for Admin-specific file roles and the village/workflow internals. Check `dev-status.json` to orient yourself to the current build phase. Finally, open `electron/database.js` to understand the schema before touching any data layer code.
