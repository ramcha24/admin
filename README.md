# Admin 🛠️

**Admin is a personal OS dashboard for managing a suite of local macOS tools.**

If you're building several small apps for your own life — and you want them to talk to each other, stay organised, and be launched from one place — Admin is the hub that ties everything together.

---

## What does it do?

### Tool launcher
Admin discovers every tool in the workspace (each has a `tool.json` manifest) and shows them in a card grid. Click **Launch** to start a tool's dev server, **Stop** to shut it down, and **Resume** to open a Claude Code session inside the tool's directory.

### Tool detail control panel
Click any tool card to open a full control panel with five tabs:
- **Overview** — what's been built, upcoming next steps, protocol compliance badge, metadata
- **Docs** — read the tool's documentation (CLAUDE.md, USER_STORIES.md, state machine diagrams, architecture decisions) rendered as markdown — right inside Admin
- **Code** — browse the tool's source tree and view any file with syntax highlighting
- **Issues** — per-tool bug and feature request tracker with "Fix it" (opens a focused Claude session)
- **Services** — what inter-tool services this tool exposes, with copy-paste call snippets

### New tool flow
Describe a tool you want to build in plain text → Admin asks Claude to write a full implementation plan → you approve → Admin scaffolds the directory and opens Claude Code pre-loaded with the plan.

### Ideas store
Capture raw ideas before they become tools. Paste a brain-dump and let Claude polish it into a clear statement, or turn it directly into a tool plan.

### Issues tracker
A cross-tool bug and feature backlog. File issues from any tool card or from the Issues page. Filter by tool, status (open/done), and type (bug/feature). Hit **Fix it** to open a focused Claude session for that specific issue.

### Service contracts & capability gateway
Every tool can declare typed HTTP services in its `tool.json`. Admin runs a **capability gateway on port 7702** that validates payloads against the declared schema and proxies them to the right tool. Any tool can call any other tool through the gateway without knowing its internal structure.

### Village social layer
Admin manages a local-first social network around your tools:
- **Members** — people you want to share your work with, each with an access tier (follower → collaborator)
- **Activity feed** — automatically populated from your registered tools' sessions, commits, and other events
- **Inbox** — see reactions and comments from members; reply inline
- **Email digest** — daily summary email to all members with email addresses configured
- **Supabase sync** — push activity to Supabase so members can access their feed from a hosted page
- **Tags** — group members and set default per-tool access

### Workflows
Define trigger → action rules. Example: whenever a tool logs a session, sync the village feed. Built on the same inter-tool event bus.

### Stories browser
Read and filter USER_STORIES.md files from all registered tools in one place.

---

## Architecture in 30 seconds

```
React UI
  ↓ window.api (preload.js contextBridge)
  ↓ ipcRenderer.invoke()
Electron main process (electron/main.js)
  ↓ better-sqlite3
admin.db (~/Library/Application Support/admin/admin.db)
  + HTTP servers: capability gateway :7702, village server :7700
```

All business logic lives in `electron/main.js`. React components never touch the database directly.

---

## Tool Protocol

Every tool in the workspace is assigned a compliance level based on what files it has:

| Level | Requirements |
|---|---|
| **L1 — Registered** | `tool.json` + `CLAUDE.md` + git repo |
| **L2 — Active** | L1 + `USER_STORIES.md` + post-commit hook + `dev-status.json` + non-planning phase |
| **L3 — Integrated** | L2 + `service_port`, `services[]` in tool.json, village block |

Admin shows a compliance badge on each tool card and auto-installs the post-commit hook on discovery.

---

## Running Admin

```bash
cd /path/to/Admin/admin
bash dev.sh
```

Or if you have the CLI shortcut: just run `admin` from any terminal.

**Requirements:** Node ≥ 16, Electron 28, a built `better-sqlite3` binary.

---

## Key files

| File | Role |
|---|---|
| `electron/main.js` | All IPC handlers: tool discovery, launch/stop, ideas, village, workflows, settings |
| `electron/village.js` | Village HTTP server (port 7700), tool sync pipeline, feed API |
| `electron/supabase.js` | Supabase push/pull for village activity and member feeds |
| `electron/digest.js` | Nodemailer daily email digest |
| `electron/database.js` | admin.db schema: tool_registry, events, ideas, village_*, workflows |
| `src/components/ToolGrid.jsx` | Tool card grid + ToolDetail full-page control panel |
| `src/components/ToolDetail.jsx` | 5-tab control panel: Overview, Docs, Code, Issues, Services |
| `village-web/index.html` | Single-file web app served locally and hosted on Cloudflare Pages |

---

## Documentation

| Document | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Architecture, safety rules, key files — for Claude Code sessions |
| [`../TOOL_PROTOCOL.md`](../TOOL_PROTOCOL.md) | L1/L2/L3 compliance spec for all tools |
| [`../docs/HOW_IT_WORKS.md`](../docs/HOW_IT_WORKS.md) | IPC flow, tool discovery, capability gateway, village pipeline |
| [`../docs/STATE_MACHINES.md`](../docs/STATE_MACHINES.md) | Entity lifecycle diagrams |
| [`../docs/DECISIONS.md`](../docs/DECISIONS.md) | Why things were built the way they were |
| [`understand-the-tool.md`](understand-the-tool.md) | Navigation guide to all documentation |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | Supabase table setup for village sync |
| [`village-web/DEPLOY.md`](village-web/DEPLOY.md) | Cloudflare Pages deploy instructions |

---

<!-- STATUS:START -->
## Current Status

> *Auto-updated 2026-03-17 by the post-commit hook.*

Recent commits have focused on enhancing the Admin tool's functionality and documentation.  The latest release (v1.0.10) includes a new multi-select feature for issues, auto-close functionality, improved JSDoc API references for tools, and a release script for automated pushes. The village web app has also been updated with activity badges and a daily email digest.

**Next steps:**
- Implement the 'Try it' panel in the Capabilities page for interactive service exploration.
- Develop a robust error handling system for service calls, providing more informative error messages to the user.
- Refactor the workflow engine to handle more complex event triggers and actions.
- Add a UI element for managing the tool_registry in the database, allowing admins to manually add or remove tools.
- Implement a logging system to track service calls and potential errors for debugging.

**Recent commits:**
- `81f108b` fix: validate launch_app path exists before opening, add launch error feedback
- `67286ff` chore: release v1.0.10
- `afc7824` chore: update auto-generated files
- `6b3f677` feat: show JSDoc API reference in Docs tab for each tool (#13)
- `466740a` chore: release v1.0.9
- `89e4808` docs: add JSDoc/Doxygen-style documentation to all electron modules (#12)
- `b9ffe73` chore: release v1.0.8
- `1116e3d` chore: update auto-generated files
- `f6bd6d4` feat: multi-select issues and auto-close after Build it session (#11)
- `b43eb9d` chore: release v1.0.7
<!-- STATUS:END -->
