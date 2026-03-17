# Admin — User Story Ledger

Living document of all implemented features as testable user stories.
Each story follows: **As a user, I can [action] so that [benefit].**
Acceptance criteria are the observable outcomes that confirm the story works.

---

## 1. Tool Management

### 1.1 View all tools
**As a user, I can open Admin and see all tools in the suite displayed as cards, so that I have a single overview of my personal OS.**

Acceptance criteria:
- Tools page is the default landing page
- Each discovered tool shows: icon, name, description, version, status badge (running / stopped)
- Grove and Think appear automatically without manual registration
- A new tool placed in `/Users/ramcha1994/Admin/{name}/tool.json` appears on next app launch or after clicking Discover

### 1.2 Launch a tool
**As a user, I can click Launch on a tool card, so that the tool opens without me needing to navigate to its directory.**

Acceptance criteria:
- Clicking Launch spawns `bash dev.sh` in the tool's directory
- Status badge changes to "running"
- The tool's own window opens within a few seconds
- Admin remains open and usable while the tool runs

### 1.3 Stop a running tool
**As a user, I can click Stop on a running tool card, so that I can shut it down without hunting for its terminal process.**

Acceptance criteria:
- Clicking Stop sends SIGTERM to the tool's process
- Status badge reverts to "stopped"
- The tool's window closes

### 1.4 Scaffold a new tool
**As a user, I can describe a tool in plain English, review a generated plan, and have Admin scaffold a ready-to-develop directory, so that I can start building without boilerplate work.**

Acceptance criteria:
- New → Plan mode shows a textarea
- Submitting a description calls the configured LLM and returns a markdown plan
- Plan is rendered and editable before approving
- Clicking Approve creates `/Users/ramcha1994/Admin/{name}/` with: `electron/main.js`, `electron/preload.js`, `electron/database.js`, `src/App.jsx`, `package.json`, `tool.json`, `dev.sh`
- Terminal opens running `claude` with the plan as the opening message
- The new tool appears in the Tools grid after next discovery

---

## 2. Ideas

### 2.1 Polish a single rough note into a structured idea
**As a user, I can paste raw text (a note, excerpt, or brain dump) and have it polished into a titled, summarised idea with tags, so that my scattered thoughts are stored in a searchable, readable form.**

Acceptance criteria:
- New → Store mode shows a text input area
- Pasting text and clicking Polish calls the LLM
- Result shows an editable canvas with: title (5–8 words), summary (2–4 sentences), tags (2–5)
- All fields are editable before saving
- Clicking Save writes the idea to the database and redirects to the Ideas page
- The new idea card appears in the grid

### 2.2 Extract multiple ideas from a long document
**As a user, I can paste a long conversation log or notes dump and extract all the distinct earmarked ideas it contains, so that I don't have to manually parse large texts.**

Acceptance criteria:
- In Store mode, pasting long text (>500 chars) triggers an Extract option alongside Polish
- Clicking Extract returns a checklist of identified ideas, each with title, summary, tags, and the original excerpt
- I can check/uncheck which ideas to keep
- Clicking Save All writes only the checked ideas to the database

### 2.3 Browse and manage stored ideas
**As a user, I can see all stored ideas in a grid, so that I can review what I've captured over time.**

Acceptance criteria:
- Ideas page shows cards with title, summary (truncated), tags, and date
- Cards are ordered most-recent first
- Tags render as coloured pills

### 2.4 Turn a stored idea into a tool plan
**As a user, I can click "Plan this" on any idea, so that I can immediately start building it with Claude Code.**

Acceptance criteria:
- Clicking Plan this on an idea card opens Terminal
- Terminal runs `claude` in the Admin parent directory with the idea title and summary as the opening prompt
- The existing idea card is unchanged

---

## 3. Village — Members

### 3.1 Add a village member
**As a user, I can add someone to my village with a name, email, and per-tool access level, so that I can share specific tools with specific people.**

Acceptance criteria:
- Clicking Add member opens a modal with name, email, tag selector, and per-tool access level buttons (none / follower / reader / commenter / collaborator)
- Submitting creates the member and saves their access overrides
- The member appears in the Members list immediately

### 3.2 Share a member's feed URL
**As a user, I can copy or open a member's personal feed URL, so that I can send it to them and they can bookmark it.**

Acceptance criteria:
- Each member card shows a Copy URL button and an Open button
- Copy writes `http://localhost:7700/?member={id}` to the clipboard
- Open launches the URL in the default browser
- Opening the URL shows a web page with that member's personalised activity feed

### 3.3 Preview the feed as a test villager
**As a user, I can open the test villager URL in an incognito window, so that I can see exactly what a member sees before sharing real links.**

Acceptance criteria:
- A test villager (`🧪 Village Tester`) is pre-seeded with `grove: reader` access
- The test URL is displayed in the server status panel with copy and open buttons
- The feed at that URL shows Grove sessions and streak card visible to a reader

### 3.5 Edit a member's access after adding them
**As a user, I can edit a member's email, tag, and per-tool access levels after they've been added, so that I can adjust permissions as relationships evolve.**

Acceptance criteria:
- Each member card shows an edit (pencil) icon button
- Clicking it opens a modal pre-filled with current email, tag, and access levels
- Saving updates the database and the member card reflects the changes immediately
- Access level changes take effect on the next feed request

### 3.4 Assign a tag to a member
**As a user, I can assign a tag to a member (during add or later), so that they inherit the tag's default access levels without manual per-tool configuration.**

Acceptance criteria:
- AddMemberModal shows a tag dropdown when tags exist
- After assigning, the member card shows the tag badge (emoji + name)
- If no per-person access override exists, access resolves from the tag's defaults

---

## 4. Village — Tags

### 4.1 Create a tag with default access levels
**As a user, I can create a named tag (e.g. "family") with default tool access levels, so that I can onboard groups of people consistently without repeating configuration.**

Acceptance criteria:
- Tags tab → New tag opens a modal with emoji, name, and per-tool level selectors
- Saving creates the tag and it appears in the Tags list
- Default access rows show which tools have which levels set

### 4.2 Edit a tag
**As a user, I can edit a tag's name, emoji, or default access levels, so that I can adjust permissions for a whole group at once.**

Acceptance criteria:
- Clicking the pencil icon on a tag opens the same modal pre-filled
- Saving updates the tag and its defaults; the change is immediately visible

### 4.3 Delete a tag
**As a user, I can delete a tag, so that I can clean up groups I no longer use.**

Acceptance criteria:
- Clicking trash on a tag deletes it and its default access rows
- Members who had that tag assigned have their `tag_id` set to null (they keep any per-person overrides)
- The tag is removed from the Tags list and from the Add Member dropdown

---

## 5. Village — Activity Inbox

### 5.1 See member interactions in an inbox
**As a user, I can open the Inbox tab and see all comments and reactions from village members, so that I know when someone has engaged with my activity feed.**

Acceptance criteria:
- Inbox tab lists all `village_interactions` ordered newest-first
- Each item shows: member avatar, name, timestamp (relative), and comment body
- Owner replies are distinguished (shows "You (reply)")

### 5.2 Unread badge on the Village nav item
**As a user, I can see an unread count badge on the Village sidebar item, so that I notice new interactions without opening the page.**

Acceptance criteria:
- Badge appears on the Village nav item when there are unread interactions
- Count reflects the number of unread items
- Badge clears when the Village page is opened
- Badge is polled every 30 seconds in the background

### 5.3 Mark interactions as read
**As a user, interactions are automatically marked as read when I open the Inbox tab, so that the badge stays accurate without manual action.**

Acceptance criteria:
- Opening the Inbox tab calls `markVillageRead` for all currently unread items
- On next poll (or page reload), the unread count returns to 0
- Previously unread items no longer show the blue dot

### 5.4 Reply to a member comment
**As a user, I can reply to a member's comment inline, so that the conversation stays in context without needing to email them separately.**

Acceptance criteria:
- Clicking Reply under a comment reveals an inline input box
- Typing and pressing Enter (or clicking Send) saves the reply
- The reply appears immediately in the Inbox as a "You (reply)" item
- Pressing Esc or clicking ✕ dismisses the reply box without saving

---

## 6. Village — Activity Feed (Web App)

### 6.1 Members see personalised activity based on their access level
**As a village member, I see only the information I'm authorised to see based on my access level, so that privacy is preserved.**

Acceptance criteria:
- follower: sees only "Ram studied today" (no details)
- reader: sees course title and duration
- commenter: also sees session notes
- collaborator: sees all details including notes
- Opening a URL for a member who doesn't exist returns a "Member not found" error

### 6.2 Streak card appears when there is an active study streak
**As a village member, I can see a streak card at the top of the feed, so that I get a sense of momentum.**

Acceptance criteria:
- Streak card appears when Grove has logged sessions on consecutive days
- Shows streak day count and hours this week (for reader+)
- Card does not appear if streak is 0

### 6.3 Commenter-level members can leave comments
**As a village member with commenter or collaborator access, I can type a comment on a session, so that I can react to specific activity.**

Acceptance criteria:
- Comment textarea and Send button appear on session cards for commenter+
- Submitting a comment posts to `/api/interact` (local) or Supabase `village_interactions` (deployed)
- Comment appears optimistically in the feed immediately after sending
- Comment shows up in Admin's Inbox tab with an unread indicator

---

## 7. Village — Sync

### 7.1 Manual sync
**As a user, I can click the sync button in Village, so that I can pull in the latest Grove activity on demand.**

Acceptance criteria:
- Clicking ↻ in the Village header reads grove.db for new sessions since last sync
- New sessions appear in the local `village_activity` table
- Streak snapshot for today is updated
- Sync button animates while running, then stops

### 7.2 Auto-sync every 5 minutes
**As a user, village activity syncs automatically while Admin is open, so that feeds stay fresh without manual action.**

Acceptance criteria:
- Sync runs on a 5-minute interval set on server start
- No user action required
- Grove sessions logged while Admin is open appear in feeds within 5 minutes

---

## 8. Village — Supabase Cloud Sync *(requires Supabase configured)*

### 8.1 Push activity to Supabase
**As a user, I can sync local village activity to Supabase, so that the deployed web app can serve up-to-date feeds without Admin running.**

Acceptance criteria:
- Clicking Sync pushes all unsynced `village_activity` rows to Supabase `village_activity`
- Rows are marked `synced_at` after upload; they are not re-pushed on next sync
- Pre-computed feed JSON is also pushed per member to `village_feeds`

### 8.2 Pull cloud interactions
**As a user, interactions submitted via the deployed web app are pulled into my local Admin inbox, so that I don't miss comments from members who used the cloud link.**

Acceptance criteria:
- Sync pulls new rows from Supabase `village_interactions` since the last pull watermark
- Pulled interactions appear in the Admin Inbox tab
- Duplicate rows are not created on repeated syncs

---

## 9. Village — Email Digest *(requires SMTP configured)*

### 9.1 Send a digest manually
**As a user, I can click "Send digest now" in Settings, so that I can test the email before the daily cron fires.**

Acceptance criteria:
- Clicking the button calls `runDailyDigest`
- Result label shows "Sent to N member(s)" on success
- The sent email contains: streak card (if active), list of recent sessions, member's name in greeting
- Result shows "SMTP not configured" if host/user/pass are not set

### 9.2 Daily automatic digest at 8am
**As a user, digests are sent automatically each morning, so that members receive a regular update without me having to remember.**

Acceptance criteria:
- Scheduler fires at 8:00am local time while Admin is open
- Only sends to members who have an email address, `frequency = 'daily'`, and haven't received a digest in the last 20 hours
- `last_sent_at` is updated in `village_notifications` after a successful send
- The test villager (`test@example.com`) is excluded from auto-digests

---

## 10. Workflows

### 10.1 Create a workflow
**As a user, I can define a workflow that fires an action when a specific tool emits an event, so that I can automate repetitive responses to activity.**

Acceptance criteria:
- New workflow form shows: name, trigger tool (grove / think), trigger event (scoped to tool), action type
- Saving creates the workflow and it appears in the list
- Available actions: `send_email_digest`, `sync_village`, `log_to_console`

### 10.2 Workflows fire automatically on events
**As a user, when a tool publishes an event, any matching enabled workflows run automatically, so that automation is truly hands-free.**

Acceptance criteria:
- When `events:publish('grove', 'session_logged', payload)` is called, all enabled workflows with `trigger_tool=grove, trigger_event=session_logged` fire
- `sync_village` action re-syncs grove activity and pushes to Supabase
- `send_email_digest` action sends digest to all eligible members
- `log_to_console` action prints event payload to Electron's main process console
- Workflow runner errors are caught and logged; they do not crash Admin

### 10.3 Pause and resume a workflow
**As a user, I can toggle a workflow on or off, so that I can temporarily disable it without deleting it.**

Acceptance criteria:
- Clicking the toggle button flips `enabled` between 1 and 0
- Disabled workflows show a "paused" badge and reduced opacity
- Disabled workflows are not fired on event publish
- Re-enabling resumes normal firing

### 10.4 Delete a workflow
**As a user, I can delete a workflow, so that I can remove automations I no longer need.**

Acceptance criteria:
- Clicking the trash icon removes the workflow from the database
- The row disappears from the list immediately
- Deleted workflows never fire again

---

## 11. Settings

### 11.1 Switch LLM provider
**As a user, I can switch between Claude (cloud) and Ollama (local) as the LLM backend, so that I can choose cost vs. privacy tradeoffs per session.**

Acceptance criteria:
- Clicking Claude or Ollama updates the `llm_provider` setting
- Claude panel shows: API key field, model selector (Haiku / Sonnet / Opus)
- Ollama panel shows: base URL field, model name field
- All LLM-powered features (polish, extract, plan) use the selected provider after saving

### 11.2 Configure Supabase credentials
**As a user, I can enter my Supabase project URL and anon key in Settings, so that village cloud sync works without editing config files.**

Acceptance criteria:
- Settings page shows Supabase URL and anon key fields
- Saving writes to the `settings` table
- Village Sync subsequently pushes/pulls to/from the configured Supabase project
- Placeholder values (`https://YOUR_PROJECT.supabase.co`) disable sync gracefully

### 11.3 Configure email (SMTP)
**As a user, I can enter SMTP credentials in Settings, so that the digest mailer can send emails on my behalf.**

Acceptance criteria:
- Settings page shows host, port, username, password fields
- Saving persists credentials to the `settings` table
- "Send digest now" button becomes functional once host, user, and pass are non-empty

---

## 12. Inter-tool Event Bus

### 12.1 Tools can publish events
**As a tool developer, I can call `window.api.publishEvent(toolId, eventType, payload)` to broadcast an event to the Admin bus, so that other tools and workflows can react.**

Acceptance criteria:
- `publishEvent` writes a row to the `events` table in admin.db
- The event is visible in the `events` table with correct `source_tool`, `event_type`, `payload`, and `created_at`
- Any matching enabled workflows fire asynchronously after the event is written

### 12.2 Tools can consume events meant for them
**As a tool developer, I can call `window.api.pollEvents(toolId)` to receive events addressed to my tool, so that I can react to cross-tool activity.**

Acceptance criteria:
- `pollEvents` returns all events not yet in `consumed_by` for the given toolId
- Returned events are marked as consumed immediately; a second call to `pollEvents` for the same toolId returns an empty array
- Events consumed by one tool remain visible to others

---

*Last updated: 2026-03-16. Add new stories here as features are built.*
