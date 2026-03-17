/**
 * @file main.js
 * @description Admin Electron main process — IPC handlers, tool management, and service orchestration.
 *
 * This is the central hub of the Admin app. It:
 * - Initialises the SQLite database and all background services on startup.
 * - Exposes every `window.api.*` method as an `ipcMain.handle()` handler.
 * - Manages tool discovery, launch, stop, scaffolding, and publish workflows.
 * - Hosts the capability gateway HTTP server (port 7702).
 * - Drives the inter-tool event bus and workflow engine.
 * - Coordinates the Village sync pipeline and Supabase cloud sync.
 *
 * All business logic for the renderer lives here; React components never
 * touch the database or external APIs directly.
 *
 * @module main
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const https = require('https')
const { execSync } = require('child_process')
const { execFile, spawn } = require('child_process')
const { initDatabase, getDb } = require('./database')
const { startVillageServer, stopVillageServer, syncGroveActivity, syncThinkActivity, syncTantuActivity, VILLAGE_PORT } = require('./village')
const { syncToSupabase } = require('./supabase')
const { scheduleDailyDigest, cancelDigestSchedule, runDailyDigest } = require('./digest')

const isDev = process.argv.includes('--dev')

/**
 * Resolve the parent directory that contains all sibling tool directories.
 *
 * - Dev mode (`--dev` flag): two levels above `__dirname` (repo root).
 * - Packaged build: reads `admin-parent.json` baked in by `release.sh`.
 * - Fallback: `~/Admin` when the JSON is missing or unreadable.
 *
 * @returns {string} Absolute path to the Admin parent directory.
 */
function resolveAdminParent() {
  if (isDev) return path.resolve(__dirname, '../../')
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'admin-parent.json'), 'utf8'))
    return cfg.adminParent
  } catch {
    return path.join(os.homedir(), 'Admin')  // reasonable fallback
  }
}
const ADMIN_PARENT = resolveAdminParent()

if (isDev) app.setName('Admin-dev')

// Single-instance: focus existing window instead of opening a second one.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

// Track running tool processes: { toolId: { pid, process } }
const runningTools = {}

let win

// ─── Window ──────────────────────────────────────────────────────────────────

/**
 * Create the main Admin BrowserWindow.
 *
 * Loads the Vite dev server in dev mode (`--dev` flag) or the built
 * `dist/index.html` in production. Context isolation is enabled and Node
 * integration is disabled; the preload script bridges the two worlds.
 *
 * @returns {void}
 */
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5174')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  startVillageServer()
  startCapabilityGateway()
  scheduleDailyDigest(getDb())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { stopVillageServer(); stopCapabilityGateway(); cancelDigestSchedule() })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Post-commit hook installer ───────────────────────────────────────────────

/**
 * Install git hooks into a tool's `.git/hooks/` directory.
 *
 * Writes two hooks (idempotent — overwrites on every call):
 * - `post-commit`: runs `~/.local/bin/update-dev-status` in the background to
 *   regenerate `dev-status.json` after each commit.
 * - `pre-push`: blocks direct pushes to `main` or `master` to enforce the
 *   feature-branch workflow.
 *
 * Silently returns if the directory is not a git repository yet.
 *
 * @param {string} toolDir - Absolute path to the tool's root directory.
 * @returns {void}
 */
function installPostCommitHook(toolDir) {
  try {
    const hooksDir = path.join(toolDir, '.git', 'hooks')
    if (!fs.existsSync(hooksDir)) return  // not a git repo yet

    // post-commit: regenerate dev-status.json
    const postCommit = [
      '#!/bin/bash',
      '# Auto-update dev-status.json after each commit (installed by Admin)',
      '~/.local/bin/update-dev-status "$(git rev-parse --show-toplevel)" &',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(hooksDir, 'post-commit'), postCommit)
    fs.chmodSync(path.join(hooksDir, 'post-commit'), 0o755)

    // pre-push: block direct pushes to main/master
    const prePush = [
      '#!/usr/bin/env bash',
      '# Block direct pushes to main/master (installed by Admin)',
      'BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)',
      'if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then',
      '  echo "pre-push: Direct push to \'$BRANCH\' is blocked. Use a feature branch + PR."',
      '  echo "To release Admin specifically, use: bash release.sh"',
      '  exit 1',
      'fi',
      'exit 0',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(hooksDir, 'pre-push'), prePush)
    fs.chmodSync(path.join(hooksDir, 'pre-push'), 0o755)
  } catch (e) {
    console.warn('[installPostCommitHook]', e.message)
  }
}

// ─── Tool dev helpers ─────────────────────────────────────────────────────────

/**
 * Check whether a Claude Code project session exists for a tool directory.
 *
 * Claude encodes the project path by replacing every `/` with `-` and stores
 * session JSONL files under `~/.claude/projects/<encoded-path>/`. Returns
 * `true` when at least one `.jsonl` file is found.
 *
 * @param {string} toolDir - Absolute path to the tool's root directory.
 * @returns {boolean} `true` if a prior Claude session exists.
 */
function hasClaudeSession(toolDir) {
  // Claude encodes the project path by replacing every / with -
  const encoded = toolDir.replace(/\//g, '-')
  const sessionsDir = path.join(os.homedir(), '.claude', 'projects', encoded)
  if (!fs.existsSync(sessionsDir)) return false
  return fs.readdirSync(sessionsDir).some(f => f.endsWith('.jsonl'))
}

/**
 * Detect the most recent git tag in a tool's repository.
 *
 * Runs `git describe --tags --abbrev=0` with a 3-second timeout. Returns
 * `null` when the directory is not a git repo, has no tags, or the command
 * fails for any reason.
 *
 * @param {string} toolDir - Absolute path to the tool's root directory.
 * @returns {string|null} Latest tag string (e.g. `'v1.0.3'`), or `null`.
 */
function detectLatestTag(toolDir) {
  try {
    const tag = execSync(
      `git -C '${toolDir}' describe --tags --abbrev=0 2>/dev/null`,
      { encoding: 'utf8', timeout: 3000 }
    ).trim()
    return tag || null
  } catch { return null }
}

// ─── Tool discovery ───────────────────────────────────────────────────────────

ipcMain.handle('tools:discover', () => {
  const db = getDb()
  const tools = []

  let entries
  try {
    entries = fs.readdirSync(ADMIN_PARENT, { withFileTypes: true })
  } catch (e) {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const toolJsonPath = path.join(ADMIN_PARENT, entry.name, 'tool.json')
    if (!fs.existsSync(toolJsonPath)) continue

    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(toolJsonPath, 'utf8'))
    } catch (e) {
      continue
    }

    const dirPath = path.join(ADMIN_PARENT, entry.name)

    // Upsert: update manifest fields on re-scan but preserve dev_phase/dev_summary/next_steps
    db.prepare(`
      INSERT INTO tool_registry
        (id, name, icon, description, color, version, status, dir_path,
         launch_dev, launch_app, capabilities, emits, listens, last_seen_at,
         dev_phase, dev_summary, next_steps, stable_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'planning', '', '[]', NULL)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, icon=excluded.icon, description=excluded.description,
        color=excluded.color, version=excluded.version, status=excluded.status,
        dir_path=excluded.dir_path, launch_dev=excluded.launch_dev,
        launch_app=excluded.launch_app, capabilities=excluded.capabilities,
        emits=excluded.emits, listens=excluded.listens, last_seen_at=excluded.last_seen_at
    `).run(
      manifest.id, manifest.name, manifest.icon, manifest.description,
      manifest.color, manifest.version, manifest.status, dirPath,
      manifest.launch?.dev ?? null, manifest.launch?.app ?? null,
      JSON.stringify(manifest.capabilities ?? []),
      JSON.stringify(manifest.emits ?? []),
      JSON.stringify(manifest.listens ?? [])
    )

    // Upsert service contracts from tool.json
    if (Array.isArray(manifest.services)) {
      const upsertCap = db.prepare(`
        INSERT INTO capabilities (service_id, tool_id, description, input_schema, output_schema)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(service_id) DO UPDATE SET
          tool_id=excluded.tool_id, description=excluded.description,
          input_schema=excluded.input_schema, output_schema=excluded.output_schema
      `)
      // Remove stale services from this tool (renamed/removed)
      const freshIds = manifest.services.map(s => s.id)
      const stale = db.prepare('SELECT service_id FROM capabilities WHERE tool_id=?').all(manifest.id)
      for (const { service_id } of stale) {
        if (!freshIds.includes(service_id)) db.prepare('DELETE FROM capabilities WHERE service_id=?').run(service_id)
      }
      for (const svc of manifest.services) {
        upsertCap.run(svc.id, manifest.id, svc.description ?? '', JSON.stringify(svc.input ?? {}), JSON.stringify(svc.output ?? {}))
      }
    }

    // Ensure every registered tool has the post-commit hook (idempotent)
    installPostCommitHook(dirPath)

    // Sync dev-status.json written by the post-commit hook
    const devStatusPath = path.join(dirPath, 'dev-status.json')
    if (fs.existsSync(devStatusPath)) {
      try {
        const devStatus = JSON.parse(fs.readFileSync(devStatusPath, 'utf8'))
        if (devStatus.dev_summary) {
          db.prepare('UPDATE tool_registry SET dev_summary=?, next_steps=? WHERE id=?')
            .run(devStatus.dev_summary, JSON.stringify(devStatus.next_steps ?? []), manifest.id)
        }
      } catch {}
    }

    const row = db.prepare('SELECT * FROM tool_registry WHERE id=?').get(manifest.id)
    const autoTag = detectLatestTag(dirPath)

    // Persist auto-detected tag if stable_tag not already set manually
    if (autoTag && !row.stable_tag) {
      db.prepare("UPDATE tool_registry SET stable_tag=? WHERE id=?").run(autoTag, manifest.id)
    }

    // Protocol compliance level
    const hasHook      = fs.existsSync(path.join(dirPath, '.git', 'hooks', 'post-commit'))
    const hasDevStatus = fs.existsSync(path.join(dirPath, 'dev-status.json'))
    const hasStories   = fs.existsSync(path.join(dirPath, 'USER_STORIES.md'))
    const hasClaude    = fs.existsSync(path.join(dirPath, 'CLAUDE.md'))
    const hasRelease   = fs.existsSync(path.join(dirPath, 'release.sh'))
    const hasVillage   = !!(manifest.village?.activity_types?.length)
    const hasServices  = !!(manifest.service_port && manifest.services?.length)
    const devPhase     = row.dev_phase ?? 'planning'
    let protocol_level = 0
    if (fs.existsSync(path.join(dirPath, '.git')) && hasClaude) protocol_level = 1
    if (protocol_level >= 1 && hasStories && hasHook && hasDevStatus && hasRelease && devPhase !== 'planning') protocol_level = 2
    if (protocol_level >= 2 && hasServices && hasVillage) protocol_level = 3

    tools.push({
      ...manifest,
      dirPath,
      dev_phase:      devPhase,
      dev_summary:    row.dev_summary ?? '',
      next_steps:     JSON.parse(row.next_steps ?? '[]'),
      stable_tag:     row.stable_tag ?? autoTag ?? null,
      has_session:    hasClaudeSession(dirPath),
      protocol_level,
    })
  }

  return tools
})

// ─── Tool launch / stop ───────────────────────────────────────────────────────

/**
 * Detect whether an Electron dev-mode process is running for a given tool directory.
 * Uses lsof to find any Electron process whose cwd matches the tool's source directory.
 * @param {string} toolDir - Absolute path to the tool's root directory.
 * @returns {boolean}
 */
function detectDevMode(toolDir) {
  try {
    const safe = toolDir.replace(/'/g, "'\\''")
    const out = execSync(
      `lsof -c Electron -a -d cwd 2>/dev/null | grep " ${safe}$"`,
      { encoding: 'utf8', timeout: 2000 }
    ).trim()
    return out.length > 0
  } catch { return false }
}

ipcMain.handle('tools:launch', (_, id) => {
  const tool = getDb().prepare('SELECT * FROM tool_registry WHERE id = ?').get(id)
  if (!tool) return { ok: false, error: 'Tool not found' }

  if (!tool.launch_app || !fs.existsSync(tool.launch_app)) {
    return { ok: false, error: 'No stable release found. Run npm run package inside the tool, then click Publish in Admin.' }
  }

  const safeApp = tool.launch_app.replace(/'/g, "'\\''")
  spawn('bash', ['-c', `open '${safeApp}'`], { detached: true, stdio: 'ignore' }).unref()
  return { ok: true, mode: 'stable' }
})

ipcMain.handle('tools:stop', (_, id) => {
  const entry = runningTools[id]
  if (!entry) return { ok: false, error: 'Not running' }

  try {
    process.kill(entry.pid, 'SIGTERM')
  } catch (e) {
    // Already dead
  }
  delete runningTools[id]
  return { ok: true }
})

ipcMain.handle('tools:updateDevInfo', (_, { id, dev_phase, dev_summary, next_steps, stable_tag }) => {
  getDb().prepare(`
    UPDATE tool_registry
    SET dev_phase=?, dev_summary=?, next_steps=?, stable_tag=?
    WHERE id=?
  `).run(dev_phase, dev_summary, JSON.stringify(next_steps ?? []), stable_tag ?? null, id)
  return { ok: true }
})

ipcMain.handle('tools:publish', (_, id) => {
  const db = getDb()
  const tool = db.prepare('SELECT * FROM tool_registry WHERE id=?').get(id)
  if (!tool) return { ok: false, error: 'Tool not found' }

  // Scan release/ subdirectories for a packaged .app bundle
  const releaseDir = path.join(tool.dir_path, 'release')
  if (!fs.existsSync(releaseDir)) {
    return { ok: false, error: 'No release/ directory found. Run npm run package first.' }
  }

  let appPath = null
  for (const sub of fs.readdirSync(releaseDir)) {
    const subDir = path.join(releaseDir, sub)
    try { if (!fs.statSync(subDir).isDirectory()) continue } catch { continue }
    for (const entry of fs.readdirSync(subDir)) {
      if (entry.endsWith('.app')) { appPath = path.join(subDir, entry); break }
    }
    if (appPath) break
  }

  if (!appPath) {
    return { ok: false, error: 'No .app bundle found in release/. Run npm run package first.' }
  }

  // Read version from package.json
  let version = null
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(tool.dir_path, 'package.json'), 'utf8'))
    version = pkg.version
  } catch {}

  // Write launch.app path back into tool.json
  try {
    const toolJsonPath = path.join(tool.dir_path, 'tool.json')
    const manifest = JSON.parse(fs.readFileSync(toolJsonPath, 'utf8'))
    manifest.launch = { ...(manifest.launch ?? {}), app: appPath }
    if (version) manifest.version = version
    fs.writeFileSync(toolJsonPath, JSON.stringify(manifest, null, 2) + '\n')
  } catch (e) {
    return { ok: false, error: `Could not update tool.json: ${e.message}` }
  }

  const stableTag = version ? `v${version}` : (tool.stable_tag ?? null)
  db.prepare('UPDATE tool_registry SET launch_app=?, stable_tag=?, version=? WHERE id=?')
    .run(appPath, stableTag, version ?? tool.version, id)

  return { ok: true, appPath, version, stableTag }
})

ipcMain.handle('tools:resume', async (_, id) => {
  const tool = getDb().prepare('SELECT * FROM tool_registry WHERE id=?').get(id)
  if (!tool) return { ok: false, error: 'Tool not found' }

  const cmd = hasClaudeSession(tool.dir_path)
    ? `cd '${tool.dir_path}' && claude --continue`
    : `cd '${tool.dir_path}' && claude`

  const script = `tell application "Terminal"\nactivate\ndo script "${cmd}"\nend tell`
  return new Promise(resolve => {
    execFile('osascript', ['-e', script], err => resolve({ ok: !err, error: err?.message }))
  })
})

ipcMain.handle('tools:status', () => {
  const status = {}
  const db = getDb()
  const tools = db.prepare('SELECT id, dir_path FROM tool_registry').all()
  for (const t of tools) {
    status[t.id] = detectDevMode(t.dir_path) ? 'dev' : 'stopped'
  }
  return status
})

// ─── Plan generation (Claude API) ────────────────────────────────────────────

ipcMain.handle('tools:plan', async (_, description) => {
  const db = getDb()
  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get()
  const apiKey = apiKeyRow?.value

  if (!apiKey) {
    return { ok: false, error: 'No Anthropic API key configured. Add it in Settings.' }
  }

  // Gather existing tool manifests for context
  const tools = db.prepare('SELECT id, name, description, capabilities FROM tool_registry').all()
  const toolContext = tools.map(t =>
    `- ${t.name} (${t.id}): ${t.description} | capabilities: ${t.capabilities}`
  ).join('\n')

  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic.default({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a software architect designing macOS desktop tools. The user's personal OS suite already contains these tools:\n\n${toolContext}\n\nEach new tool uses: Electron 28 + React 18 + Vite 4 + Tailwind CSS 3 + better-sqlite3. All business logic lives in electron/main.js; React components communicate only via window.api (preload.js). Output a concise implementation plan in markdown — architecture, data model, key IPC handlers, and React pages. Be specific and actionable.`,
      messages: [
        { role: 'user', content: `Design a new tool for this need: ${description}` }
      ],
    })

    return { ok: true, plan: message.content[0].text }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── Tool scaffolding ─────────────────────────────────────────────────────────

const TEMPLATE_FILES = {
  'electron/main.js': (name) => `const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { initDatabase, getDb } = require('./database')

app.setName('${name}')

const isDev = process.argv.includes('--dev')
if (isDev) app.setName('${name}-dev')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

let win

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', (_, key) => {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
})

ipcMain.handle('settings:set', (_, { key, value }) => {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  return true
})
`,

  'electron/preload.js': (_) => `const { contextBridge, ipcRenderer } = require('electron')
const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a)

contextBridge.exposeInMainWorld('api', {
  getSetting: (key)        => invoke('settings:get', key),
  setSetting: (key, value) => invoke('settings:set', { key, value }),
})
`,

  'electron/database.js': (name) => `const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

const dbPath = path.join(app.getPath('userData'), '${name}.db')
let db

function initDatabase() {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema()
  return db
}

function createSchema() {
  db.exec(\`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  \`)
}

function getDb() { return db }

module.exports = { initDatabase, getDb }
`,

  'src/App.jsx': (name, displayName) => `import React, { useState } from 'react'

export default function App() {
  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚀</div>
          <h1 className="text-2xl font-bold text-gray-900">${displayName}</h1>
          <p className="text-gray-500 mt-2">Ready to build. Open electron/main.js to add IPC handlers.</p>
        </div>
      </div>
    </div>
  )
}
`,

  'src/main.jsx': (name, displayName) => `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (!window.api) {
  document.getElementById('root').innerHTML = \`
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,sans-serif">
      <div style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">🚀</div>
        <h2>${displayName}</h2>
        <p style="color:#6b7280">This app runs as a desktop app — not in the browser.</p>
      </div>
    </div>
  \`
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><App /></React.StrictMode>
  )
}
`,

  'src/index.css': (_) => `@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body { margin: 0; -webkit-font-smoothing: antialiased; }
`,

  'index.html': (name, displayName) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${displayName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,

  'vite.config.js': (_) => `const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

module.exports = defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
})
`,

  'tailwind.config.js': (_) => `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
`,

  'postcss.config.js': (_) => `module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
`,

  'dev.sh': (name, displayName) => `#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting ${displayName}..."

npx vite > /tmp/${name}-vite.log 2>&1 &
VITE_PID=$!

echo "   Waiting for dev server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "   Launching app..."
./node_modules/.bin/electron . --dev

kill $VITE_PID 2>/dev/null || true
echo "   ${displayName} closed."
`,
}

ipcMain.handle('tools:scaffold', async (_, name, plan) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const displayName = name.charAt(0).toUpperCase() + name.slice(1)
  const toolDir = path.join(ADMIN_PARENT, slug)

  if (fs.existsSync(toolDir)) {
    return { ok: false, error: `Directory already exists: ${toolDir}` }
  }

  try {
    fs.mkdirSync(path.join(toolDir, 'electron'), { recursive: true })
    fs.mkdirSync(path.join(toolDir, 'src'), { recursive: true })

    for (const [relPath, contentFn] of Object.entries(TEMPLATE_FILES)) {
      const content = contentFn(slug, displayName)
      fs.writeFileSync(path.join(toolDir, relPath), content)
    }

    // Make dev.sh executable
    fs.chmodSync(path.join(toolDir, 'dev.sh'), 0o755)

    // Git init + post-commit hook
    try {
      execSync('git init', { cwd: toolDir })
      installPostCommitHook(toolDir)
    } catch (e) {
      console.warn('[scaffold] git init failed:', e.message)
    }

    // Write tool.json
    const toolJson = {
      id: slug,
      name: displayName,
      icon: '🚀',
      description: `${displayName} — new tool`,
      color: '#6366f1',
      version: '0.1.0',
      status: 'active',
      launch: { dev: 'bash dev.sh', app: null },
      capabilities: [],
      emits: [],
      listens: [],
    }
    fs.writeFileSync(path.join(toolDir, 'tool.json'), JSON.stringify(toolJson, null, 2))

    // Write package.json (copy from grove pattern)
    const pkg = {
      name: slug,
      version: '0.1.0',
      description: `${displayName} — new tool`,
      main: 'electron/main.js',
      scripts: {
        dev: 'bash dev.sh',
        build: 'vite build',
        rebuild: 'electron-rebuild -f -w better-sqlite3',
        postinstall: 'electron-rebuild -f -w better-sqlite3 --electron-version 28.2.0',
        package: 'vite build && electron-builder --mac',
      },
      dependencies: { 'better-sqlite3': '^9.4.3' },
      devDependencies: {
        '@electron/rebuild': '^3.6.0',
        '@vitejs/plugin-react': '^4.2.1',
        'autoprefixer': '^10.4.17',
        'concurrently': '^8.2.2',
        'electron': '^28.2.0',
        'electron-builder': '^24.13.3',
        'electron-rebuild': '^3.2.9',
        'lucide-react': '^0.344.0',
        'postcss': '^8.4.35',
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
        'tailwindcss': '^3.4.1',
        'vite': '^4.5.3',
      },
    }
    fs.writeFileSync(path.join(toolDir, 'package.json'), JSON.stringify(pkg, null, 2))

    // Write plan.md
    fs.writeFileSync(path.join(toolDir, 'PLAN.md'), `# ${displayName} — Implementation Plan\n\n${plan}\n`)

    return { ok: true, toolDir }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('tools:openClaudeCode', async (_, toolName, plan) => {
  const slug = toolName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const toolDir = path.join(ADMIN_PARENT, slug)

  // Ensure post-commit hook is present (idempotent)
  installPostCommitHook(toolDir)

  // Open Terminal with claude CLI pre-loaded
  const script = `
    tell application "Terminal"
      activate
      do script "cd '${toolDir}' && npm install && claude '${plan.replace(/'/g, "'\\''")}'"
    end tell
  `

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (err) => {
      resolve({ ok: !err, error: err?.message })
    })
  })
})

// ─── Event bus ────────────────────────────────────────────────────────────────

ipcMain.handle('events:publish', async (_, sourceId, eventType, payload) => {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO events (source_tool, event_type, payload)
    VALUES (?, ?, ?)
  `).run(sourceId, eventType, JSON.stringify(payload))
  // Fire matching workflows asynchronously
  runWorkflows(eventType, sourceId, payload).catch(e => console.error('[Events] Workflow error:', e.message))
  return { ok: true, id: result.lastInsertRowid }
})

ipcMain.handle('events:poll', (_, toolId) => {
  const db = getDb()
  const events = db.prepare(`
    SELECT * FROM events
    WHERE json_extract(consumed_by, '$') NOT LIKE '%"${toolId}"%'
    ORDER BY created_at ASC
  `).all()

  // Mark as consumed
  const stmt = db.prepare(`
    UPDATE events SET consumed_by = json_insert(consumed_by, '$[#]', ?) WHERE id = ?
  `)
  for (const evt of events) {
    stmt.run(toolId, evt.id)
  }

  return events.map(e => ({
    ...e,
    payload: e.payload ? JSON.parse(e.payload) : null,
    consumed_by: e.consumed_by ? JSON.parse(e.consumed_by) : [],
  }))
})

// ─── LLM (routes to Claude or Ollama based on settings) ──────────────────────

/**
 * Send a chat completion request to the configured LLM provider.
 *
 * Routes to Ollama or the Anthropic Claude API depending on the `llm_provider`
 * setting. All settings are read fresh from the database on each call so
 * provider switches take effect without restarting the app.
 *
 * @param {Array<{role:'user'|'assistant', content:string}>} messages - Chat history.
 * @param {object} [opts={}] - Options.
 * @param {string} [opts.systemPrompt] - Optional system prompt.
 * @param {number} [opts.maxTokens=1024] - Maximum tokens in the response.
 * @returns {Promise<string>} The model's response text.
 * @throws {Error} When the provider is misconfigured or the API call fails.
 */
async function llmComplete(messages, { systemPrompt, maxTokens = 1024 } = {}) {
  const db = getDb()
  const provider  = db.prepare("SELECT value FROM settings WHERE key='llm_provider'").get()?.value ?? 'claude'
  const model     = db.prepare("SELECT value FROM settings WHERE key='llm_model'").get()?.value
  const apiKey    = db.prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get()?.value
  const ollamaUrl = db.prepare("SELECT value FROM settings WHERE key='ollama_base_url'").get()?.value ?? 'http://localhost:11434'
  const ollamaModel = db.prepare("SELECT value FROM settings WHERE key='ollama_model'").get()?.value ?? 'llama3'

  if (provider === 'ollama') {
    const body = JSON.stringify({
      model: ollamaModel,
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages,
      stream: false,
    })
    const data = await new Promise((resolve, reject) => {
      const url = new URL(`${ollamaUrl}/api/chat`)
      const lib = url.protocol === 'https:' ? https : http
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`Ollama error ${res.statusCode}: ${raw}`))
          try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error(`Ollama JSON parse error: ${raw.slice(0, 200)}`)) }
        })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
    return data.message?.content ?? ''
  }

  // Default: Claude
  if (!apiKey) throw new Error('No Anthropic API key configured. Add it in Settings.')
  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic.default({ apiKey })
  const result = await client.messages.create({
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages,
  })
  return result.content[0].text
}

ipcMain.handle('llm:complete', async (_, { messages, systemPrompt, maxTokens }) => {
  try {
    const text = await llmComplete(messages, { systemPrompt, maxTokens })
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── Ideas ────────────────────────────────────────────────────────────────────

ipcMain.handle('ideas:getAll', () => {
  const rows = getDb().prepare(
    'SELECT * FROM ideas ORDER BY created_at DESC'
  ).all()
  return rows.map(r => ({ ...r, tags: JSON.parse(r.tags) }))
})

ipcMain.handle('ideas:save', (_, data) => {
  const { title, summary, raw_text, tags = [], source = '', source_filename = '', attached_file_path = '' } = data
  const result = getDb().prepare(`
    INSERT INTO ideas (title, summary, raw_text, tags, source, source_filename, attached_file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, summary, raw_text, JSON.stringify(tags), source, source_filename, attached_file_path)
  return { ok: true, id: result.lastInsertRowid }
})

// Ingest a file and extract its ideas — uses native PDF document blocks when
// the provider is Claude, falls back to text decoding for all other file types.
ipcMain.handle('ideas:ingestFile', async (_, { filename, dataBase64, mimeType }) => {
  const db = getDb()
  const provider = db.prepare("SELECT value FROM settings WHERE key='llm_provider'").get()?.value ?? 'claude'

  const SYSTEM = `You are analyzing a document to capture its core idea(s).
If the document expresses a single coherent idea, plan, or concept, return an array with exactly one entry.
If it contains multiple distinct ideas, return one entry per idea.
Each entry must have: "title" (5-8 word specific title), "summary" (2-4 sentences — what the idea IS and why it matters), "tags" (2-5 lowercase strings).
Respond with a JSON array only. No markdown fences, no explanation.`

  try {
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')

    if (isPdf && provider !== 'ollama') {
      // Claude's native PDF document understanding — same mechanism used by Claude Code
      const apiKey = db.prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get()?.value
      if (!apiKey) throw new Error('No Anthropic API key configured. Add it in Settings.')
      const model = db.prepare("SELECT value FROM settings WHERE key='llm_model'").get()?.value || 'claude-haiku-4-5-20251001'
      const Anthropic = require('@anthropic-ai/sdk')
      const client = new Anthropic.default({ apiKey })
      const result = await client.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: dataBase64 } }] }],
      })
      const parsed = JSON.parse(stripJsonFences(result.content[0].text))
      return { ok: true, ideas: Array.isArray(parsed) ? parsed : [parsed] }
    }

    // Office/RTF formats — use macOS textutil to extract plain text
    const ext = filename.toLowerCase().replace(/^.*\./, '')
    const isOffice = ['docx', 'doc', 'rtf', 'odt'].includes(ext)
      || (mimeType || '').includes('wordprocessingml')
      || (mimeType || '').includes('msword')

    let text
    if (isOffice) {
      const tmpPath = path.join(os.tmpdir(), `admin-ingest-${Date.now()}.${ext}`)
      fs.writeFileSync(tmpPath, Buffer.from(dataBase64, 'base64'))
      text = await new Promise((resolve, reject) => {
        execFile('textutil', ['-convert', 'txt', '-stdout', tmpPath], (err, stdout) => {
          try { fs.unlinkSync(tmpPath) } catch {}
          if (err) reject(new Error(`textutil could not read ${filename}: ${err.message}`))
          else resolve(stdout)
        })
      })
    } else {
      // Plain text, markdown, JSON, CSV etc.
      text = Buffer.from(dataBase64, 'base64').toString('utf-8')
    }

    const llmText = await llmComplete(
      [{ role: 'user', content: text.slice(0, 12000) }],
      { systemPrompt: SYSTEM, maxTokens: 2048 }
    )
    const parsed = JSON.parse(stripJsonFences(llmText))
    return { ok: true, ideas: Array.isArray(parsed) ? parsed : [parsed] }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('ideas:saveFile', (_, { filename, dataBase64 }) => {
  const dir = path.join(app.getPath('userData'), 'idea-files')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const filePath = path.join(dir, safeName)
  fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64'))
  return { ok: true, path: filePath }
})

ipcMain.handle('ideas:openFile', (_, filePath) => {
  shell.openPath(filePath)
  return { ok: true }
})

ipcMain.handle('ideas:update', (_, { id, title, summary, tags }) => {
  getDb().prepare(`
    UPDATE ideas SET title=?, summary=?, tags=?, updated_at=datetime('now') WHERE id=?
  `).run(title, summary, JSON.stringify(tags ?? []), id)
  return { ok: true }
})

ipcMain.handle('ideas:delete', (_, id) => {
  getDb().prepare('DELETE FROM ideas WHERE id=?').run(id)
  return { ok: true }
})

/**
 * Remove Markdown code fences that some LLMs prepend/append to JSON responses.
 *
 * Strips leading ` ```json ` or ` ``` ` and trailing ` ``` ` from the text,
 * then trims whitespace. Safe to call on already-clean strings.
 *
 * @param {string} text - Raw LLM output that may be wrapped in a code fence.
 * @returns {string} Plain JSON string without fences.
 */
function stripJsonFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

// Polish raw text into a structured idea using the configured LLM
ipcMain.handle('ideas:polish', async (_, rawText) => {
  const SYSTEM = `You are an idea curator. The user will give you a rough note or excerpt. Your job is to extract and structure the core idea into JSON with these fields:
- title: short, punchy title (5-8 words max)
- summary: 2-4 sentences — the idea clearly stated, why it matters, any key constraints
- tags: array of 2-5 lowercase tag strings

Respond with only valid JSON, no markdown fences.`

  try {
    const text = await llmComplete(
      [{ role: 'user', content: rawText }],
      { systemPrompt: SYSTEM, maxTokens: 512 }
    )
    const parsed = JSON.parse(stripJsonFences(text))
    return { ok: true, ...parsed }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Extract multiple ideas from a long conversation file or dump
ipcMain.handle('ideas:extract', async (_, rawText) => {
  const SYSTEM = `You are an idea extractor. The user will give you a long text (conversation log, notes dump, etc). Find every distinct idea, suggestion, or earmarked thought in it. For each, output a JSON object with:
- title: short title
- summary: 2-3 sentences
- tags: array of 2-4 lowercase tags
- excerpt: the original sentence(s) that triggered this idea (max 100 chars)

Respond with a JSON array of these objects, no markdown fences.`

  try {
    const text = await llmComplete(
      [{ role: 'user', content: rawText.slice(0, 12000) }], // cap to ~12k chars
      { systemPrompt: SYSTEM, maxTokens: 2048 }
    )
    const parsed = JSON.parse(stripJsonFences(text))
    return { ok: true, ideas: parsed }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Open Claude Code in plan mode for a stored idea
ipcMain.handle('ideas:plan', async (_, { id, title, summary }) => {
  const prompt = `Plan a new tool for this idea:\n\n**${title}**\n\n${summary}`
  const script = `
    tell application "Terminal"
      activate
      do script "cd '${ADMIN_PARENT}' && claude '${prompt.replace(/'/g, "'\\''")}'"
    end tell
  `
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (err) => {
      resolve({ ok: !err, error: err?.message })
    })
  })
})

// ─── Settings ─────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', (_, key) => {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
})

ipcMain.handle('settings:getAll', () => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
})

ipcMain.handle('settings:set', (_, { key, value }) => {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  return true
})

// ─── Village ──────────────────────────────────────────────────────────────────

ipcMain.handle('village:getMembers', () => {
  return getDb().prepare('SELECT * FROM village_members ORDER BY joined_at DESC').all()
})

ipcMain.handle('village:addMember', (_, { name, email, avatarEmoji, tagId }) => {
  const { randomBytes } = require('crypto')
  const id    = `member-${Date.now()}`
  const token = randomBytes(16).toString('hex')
  getDb().prepare(`
    INSERT INTO village_members (id, name, email, avatar_emoji, tag_id, feed_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, email, avatarEmoji ?? '👤', tagId ?? null, token)
  return { ok: true, id, token, url: `http://localhost:${VILLAGE_PORT}/?token=${token}` }
})

ipcMain.handle('village:updateMember', (_, { id, email, tagId }) => {
  const db = getDb()
  db.prepare('UPDATE village_members SET email=?, tag_id=? WHERE id=?').run(email, tagId ?? null, id)
  return { ok: true }
})

ipcMain.handle('village:regenerateMemberToken', (_, memberId) => {
  const { randomBytes } = require('crypto')
  const token = randomBytes(16).toString('hex')
  getDb().prepare("UPDATE village_members SET feed_token=? WHERE id=?").run(token, memberId)
  return { ok: true, token, url: `http://localhost:${VILLAGE_PORT}/?token=${token}` }
})

ipcMain.handle('village:getMemberAccess', (_, memberId) => {
  const db = getDb()
  const access = db.prepare('SELECT tool_id, level FROM village_access WHERE member_id=?').all(memberId)
  const notif  = db.prepare('SELECT frequency FROM village_notifications WHERE member_id=?').get(memberId)
  return {
    access: Object.fromEntries(access.map(r => [r.tool_id, r.level])),
    frequency: notif?.frequency ?? 'daily',
  }
})

ipcMain.handle('village:setNotificationFrequency', (_, { memberId, frequency }) => {
  getDb().prepare(`
    INSERT OR REPLACE INTO village_notifications (member_id, frequency)
    VALUES (?, ?)
  `).run(memberId, frequency)
  return { ok: true }
})

ipcMain.handle('village:getPreviewFeed', (_, memberId) => {
  const { getMemberFeed } = require('./village')
  const feed = getMemberFeed(memberId)
  if (!feed) return null
  return feed
})

ipcMain.handle('village:setAccess', (_, { memberId, toolId, level }) => {
  getDb().prepare(`
    INSERT OR REPLACE INTO village_access (member_id, tool_id, level)
    VALUES (?, ?, ?)
  `).run(memberId, toolId, level)
  return { ok: true }
})

ipcMain.handle('village:sync', async () => {
  syncGroveActivity()
  syncThinkActivity()
  syncTantuActivity()
  const result = await syncToSupabase(getDb())
  return { ok: true, supabase: result }
})

ipcMain.handle('village:getStatus', () => {
  return {
    running: true,
    port: VILLAGE_PORT,
    url: `http://localhost:${VILLAGE_PORT}`,
    testUrl: `http://localhost:${VILLAGE_PORT}/?member=test-villager`,
  }
})

ipcMain.handle('village:getIdentity', () => {
  return getDb().prepare('SELECT * FROM village_identity WHERE id=1').get()
})

ipcMain.handle('village:updateIdentity', (_, { username, display_name, avatar_emoji }) => {
  getDb().prepare(`
    UPDATE village_identity SET username=?, display_name=?, avatar_emoji=? WHERE id=1
  `).run(username, display_name, avatar_emoji)
  return { ok: true }
})

ipcMain.handle('village:getInteractions', () => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT vi.*, vm.name as member_name, vm.avatar_emoji as member_avatar
    FROM village_interactions vi
    LEFT JOIN village_members vm ON vm.id = vi.member_id
    ORDER BY vi.created_at DESC
    LIMIT 200
  `).all()
  return rows.map(r => ({ ...r, payload: JSON.parse(r.payload ?? '{}') }))
})

ipcMain.handle('village:markRead', (_, ids) => {
  const db = getDb()
  const stmt = db.prepare(
    "UPDATE village_interactions SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL"
  )
  for (const id of ids) stmt.run(id)
  return { ok: true }
})

ipcMain.handle('village:getUnreadCount', () => {
  return getDb().prepare(
    'SELECT COUNT(*) as n FROM village_interactions WHERE read_at IS NULL'
  ).get().n
})

ipcMain.handle('village:reply', (_, { activityId, body }) => {
  const db = getDb()
  const identity = db.prepare('SELECT * FROM village_identity WHERE id=1').get()
  const id = `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db.prepare(`
    INSERT INTO village_interactions (id, activity_id, member_id, member_name, type, payload, read_at)
    VALUES (?, ?, 'owner', ?, 'reply', ?, datetime('now'))
  `).run(id, activityId, identity?.display_name ?? 'You', JSON.stringify({ body }))
  return { ok: true, id }
})

ipcMain.handle('village:getTags', () => {
  const db = getDb()
  const tags = db.prepare('SELECT * FROM village_tags ORDER BY name ASC').all()
  const defaults = db.prepare('SELECT * FROM village_tag_defaults').all()
  return tags.map(t => ({
    ...t,
    defaults: defaults.filter(d => d.tag_id === t.id),
  }))
})

ipcMain.handle('village:saveTag', (_, { id, name, emoji, defaults: defs = [] }) => {
  const db = getDb()
  const tagId = id ?? `tag-${Date.now()}`
  if (id) {
    db.prepare('UPDATE village_tags SET name=?, emoji=? WHERE id=?').run(name, emoji ?? '🏷️', id)
  } else {
    db.prepare('INSERT INTO village_tags (id, name, emoji) VALUES (?, ?, ?)').run(tagId, name, emoji ?? '🏷️')
  }
  // Sync defaults: delete existing then re-insert
  db.prepare('DELETE FROM village_tag_defaults WHERE tag_id=?').run(tagId)
  for (const { tool_id, level } of defs) {
    if (level) {
      db.prepare('INSERT INTO village_tag_defaults (tag_id, tool_id, level) VALUES (?, ?, ?)').run(tagId, tool_id, level)
    }
  }
  return { ok: true, id: tagId }
})

ipcMain.handle('village:deleteTag', (_, id) => {
  const db = getDb()
  db.prepare('DELETE FROM village_tag_defaults WHERE tag_id=?').run(id)
  db.prepare('UPDATE village_members SET tag_id=NULL WHERE tag_id=?').run(id)
  db.prepare('DELETE FROM village_tags WHERE id=?').run(id)
  return { ok: true }
})

ipcMain.handle('village:assignTag', (_, { memberId, tagId }) => {
  getDb().prepare('UPDATE village_members SET tag_id=? WHERE id=?').run(tagId ?? null, memberId)
  return { ok: true }
})

ipcMain.handle('village:getActivity', () => {
  const { getMemberFeed } = require('./village')
  const db = getDb()

  const activities = db.prepare(`
    SELECT * FROM village_activity ORDER BY created_at DESC LIMIT 100
  `).all()

  const members = db.prepare('SELECT * FROM village_members').all()
  const tags    = db.prepare('SELECT * FROM village_tags').all()
  const tagMap  = Object.fromEntries(tags.map(t => [t.id, t]))

  // For each activity, compute which members can see it and at what level
  const { resolveAccess } = (() => {
    // Inline resolve since village.js doesn't export it
    const resolveAccess = (memberId, toolId) => {
      const override = db.prepare('SELECT level FROM village_access WHERE member_id=? AND tool_id=?').get(memberId, toolId)
      if (override !== undefined) return override?.level ?? null
      const member = db.prepare('SELECT tag_id FROM village_members WHERE id=?').get(memberId)
      if (member?.tag_id) {
        const td = db.prepare('SELECT level FROM village_tag_defaults WHERE tag_id=? AND tool_id=?').get(member.tag_id, toolId)
        if (td) return td.level
      }
      return null
    }
    return { resolveAccess }
  })()

  const interactions = db.prepare('SELECT * FROM village_interactions ORDER BY created_at ASC').all()
  const interactionsByActivity = {}
  for (const i of interactions) {
    if (!interactionsByActivity[i.activity_id]) interactionsByActivity[i.activity_id] = []
    interactionsByActivity[i.activity_id].push({ ...i, payload: JSON.parse(i.payload) })
  }

  return activities.map(a => {
    const payload = JSON.parse(a.payload)
    const visibility = []
    for (const m of members) {
      const level = resolveAccess(m.id, a.source_tool)
      if (level) {
        const tag = m.tag_id ? tagMap[m.tag_id] : null
        visibility.push({ memberId: m.id, name: m.name, emoji: m.avatar_emoji, level, tag })
      }
    }
    return {
      ...a,
      payload,
      visibility,
      interactions: interactionsByActivity[a.id] ?? [],
    }
  })
})

// ─── Workflows ────────────────────────────────────────────────────────────────

ipcMain.handle('workflows:getAll', () => {
  return getDb().prepare('SELECT * FROM workflows ORDER BY created_at DESC').all()
})

ipcMain.handle('workflows:save', (_, { name, trigger_tool, trigger_event, action_tool, action_type, action_payload }) => {
  const result = getDb().prepare(`
    INSERT INTO workflows (name, trigger_tool, trigger_event, action_tool, action_type, action_payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, trigger_tool, trigger_event, action_tool ?? null, action_type, action_payload ?? null)
  return { ok: true, id: result.lastInsertRowid }
})

ipcMain.handle('workflows:update', (_, { id, enabled }) => {
  getDb().prepare('UPDATE workflows SET enabled=? WHERE id=?').run(enabled ? 1 : 0, id)
  return { ok: true }
})

ipcMain.handle('workflows:delete', (_, id) => {
  getDb().prepare('DELETE FROM workflows WHERE id=?').run(id)
  return { ok: true }
})

/**
 * Execute all enabled workflow rules that match an event.
 *
 * Called asynchronously from `events:publish` — errors are logged but never
 * surfaced to the renderer. Supported action types:
 * - `send_email_digest` — triggers `runDailyDigest`.
 * - `sync_village` — syncs Grove + Think activity and pushes to Supabase.
 * - `log_to_console` — logs the event payload.
 *
 * @param {string} eventType - Event type slug (e.g. `'session_logged'`).
 * @param {string} sourceTool - Tool slug that emitted the event.
 * @param {object} payload - Event payload forwarded to actions that need it.
 * @returns {Promise<void>}
 */
async function runWorkflows(eventType, sourceTool, payload) {
  const db = getDb()
  const wfs = db.prepare(
    'SELECT * FROM workflows WHERE enabled=1 AND trigger_tool=? AND trigger_event=?'
  ).all(sourceTool, eventType)

  for (const wf of wfs) {
    try {
      if (wf.action_type === 'send_email_digest') {
        const { runDailyDigest } = require('./digest')
        const r = await runDailyDigest(db)
        console.log(`[Workflow] ${wf.name}: digest sent`, r)
      } else if (wf.action_type === 'sync_village') {
        syncGroveActivity()
        syncThinkActivity()
        const { syncToSupabase } = require('./supabase')
        await syncToSupabase(db)
        console.log(`[Workflow] ${wf.name}: village synced`)
      } else if (wf.action_type === 'log_to_console') {
        console.log(`[Workflow] ${wf.name}:`, JSON.stringify(payload))
      }
    } catch (e) {
      console.error(`[Workflow] ${wf.name} failed:`, e.message)
    }
  }
}

// ─── Capability Gateway (port 7702) ───────────────────────────────────────────
// Any tool can POST http://localhost:7702/capabilities/call/{serviceId} with JSON payload.
// Admin validates against the declared schema then proxies to the target tool's service_port.

const GATEWAY_PORT = 7702
let gatewayServer = null

/**
 * Validate a capability payload against a service's declared input schema.
 *
 * Checks each field in `inputSchema` for:
 * - Presence, when `spec.required` is truthy and the field is missing/empty.
 * - Type match (`typeof`), when the field is present and `spec.type` is declared.
 *
 * @param {Record<string, {type?:string, required?:boolean, description?:string}>} inputSchema
 *   The service's `input` object from `tool.json` (already parsed from JSON).
 * @param {object} payload - The caller-supplied request body.
 * @returns {string[]} Array of human-readable error messages (empty when valid).
 */
function validatePayload(inputSchema, payload) {
  const errors = []
  for (const [field, spec] of Object.entries(inputSchema)) {
    if (spec.required !== false && spec.required !== undefined && spec.required) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        errors.push(`"${field}" is required`)
      }
    }
    if (payload[field] !== undefined && spec.type && typeof payload[field] !== spec.type) {
      errors.push(`"${field}" must be ${spec.type}, got ${typeof payload[field]}`)
    }
  }
  return errors
}

/**
 * Forward a capability call to a tool's local service server.
 *
 * POSTs the JSON payload to `http://127.0.0.1:<servicePort>/capabilities/<serviceId>`.
 * Resolves with `{ status, body }` on any HTTP response (including error codes)
 * and rejects only on network-level failures (connection refused, timeout, etc.).
 *
 * @param {number} servicePort - The tool's declared `service_port`.
 * @param {string} serviceId - Fully-qualified service ID (e.g. `'grove:sessions:log'`).
 * @param {object} payload - Validated request payload to forward.
 * @returns {Promise<{status:number, body:object}>}
 * @throws {Error} On network-level errors (ECONNREFUSED, etc.).
 */
function proxyToTool(servicePort, serviceId, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const opts = {
      hostname: '127.0.0.1',
      port: servicePort,
      path: `/capabilities/${serviceId}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const req = http.request(opts, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: { raw: data } }) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * Start the Admin capability gateway HTTP server on port 7702.
 *
 * Handles two routes:
 * - `POST /session-done` — called by the shell script after a `claude` session
 *   ends; auto-closes the targeted issues and records any PR URL.
 * - `POST /capabilities/call/{serviceId}` — validates the payload against the
 *   declared input schema, looks up the target tool's `service_port`, and
 *   proxies the request via `proxyToTool()`.
 *
 * Responds 503 when the target tool is not running. Logs (but does not crash)
 * if the port is already in use.
 *
 * @returns {void}
 */
function startCapabilityGateway() {
  const db = getDb()
  gatewayServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // Session-done callback — shell script calls this after `claude` exits
    if (req.url === '/session-done' && req.method === 'POST') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try {
          const { issueIds, prUrl } = JSON.parse(body)
          const resNote = prUrl ? `PR: ${prUrl}` : 'Closed after Build it session'
          for (const id of (issueIds ?? [])) {
            db.prepare(
              `UPDATE issues SET status='done', resolved_at=datetime('now'), resolution_note=? WHERE id=? AND status='open'`
            ).run(resNote, id)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
        }
      })
      return
    }

    const match = req.url.match(/^\/capabilities\/call\/(.+)$/)
    if (!match || req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found. Use POST /capabilities/call/{serviceId}' }))
      return
    }
    const serviceId = decodeURIComponent(match[1])

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      let payload = {}
      try { if (body) payload = JSON.parse(body) } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' })); return
      }

      // Look up the service
      const svc = db.prepare('SELECT * FROM capabilities WHERE service_id=?').get(serviceId)
      if (!svc) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Unknown service: ${serviceId}` })); return
      }

      // Validate payload
      const inputSchema = JSON.parse(svc.input_schema ?? '{}')
      const errors = validatePayload(inputSchema, payload)
      if (errors.length) {
        res.writeHead(422, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Validation failed', details: errors })); return
      }

      // Look up target tool's service_port from its tool.json
      const tool = db.prepare('SELECT dir_path FROM tool_registry WHERE id=?').get(svc.tool_id)
      if (!tool) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Tool "${svc.tool_id}" not registered` })); return
      }
      let servicePort
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(tool.dir_path, 'tool.json'), 'utf8'))
        servicePort = manifest.service_port
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Cannot read tool.json for "${svc.tool_id}"` })); return
      }
      if (!servicePort) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Tool "${svc.tool_id}" has no service_port declared` })); return
      }

      // Proxy to tool
      try {
        const result = await proxyToTool(servicePort, serviceId, payload)
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result.body))
      } catch (e) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Tool "${svc.tool_id}" is not running or its service server is down`, detail: e.message }))
      }
    })
  })
  gatewayServer.listen(GATEWAY_PORT, '127.0.0.1', () => {
    console.log(`[CapabilityGateway] Listening on http://127.0.0.1:${GATEWAY_PORT}`)
  })
  gatewayServer.on('error', e => {
    if (e.code !== 'EADDRINUSE') console.error('[CapabilityGateway] Error:', e.message)
  })
}

/**
 * Shut down the capability gateway server.
 *
 * Called from `app.on('before-quit')`. No-ops if the server was never started.
 *
 * @returns {void}
 */
function stopCapabilityGateway() {
  gatewayServer?.close()
}

ipcMain.handle('capabilities:getAll', () => {
  const db = getDb()
  const caps = db.prepare('SELECT c.*, t.name as tool_name, t.icon as tool_icon, t.color as tool_color FROM capabilities c JOIN tool_registry t ON c.tool_id = t.id ORDER BY c.tool_id, c.service_id').all()
  return caps.map(c => ({
    ...c,
    input_schema:  JSON.parse(c.input_schema  ?? '{}'),
    output_schema: JSON.parse(c.output_schema ?? '{}'),
    gateway_url: `http://localhost:${GATEWAY_PORT}/capabilities/call/${encodeURIComponent(c.service_id)}`,
  }))
})

ipcMain.handle('capabilities:call', async (_, serviceId, payload) => {
  const db = getDb()
  const svc = db.prepare('SELECT * FROM capabilities WHERE service_id=?').get(serviceId)
  if (!svc) return { error: `Unknown service: ${serviceId}` }

  const inputSchema = JSON.parse(svc.input_schema ?? '{}')
  const errors = validatePayload(inputSchema, payload)
  if (errors.length) return { error: 'Validation failed', details: errors }

  const tool = db.prepare('SELECT dir_path FROM tool_registry WHERE id=?').get(svc.tool_id)
  let servicePort
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(tool.dir_path, 'tool.json'), 'utf8'))
    servicePort = manifest.service_port
  } catch { return { error: 'Cannot read tool manifest' } }

  try {
    const result = await proxyToTool(servicePort, serviceId, payload)
    return result.body
  } catch (e) {
    return { error: `Tool not reachable: ${e.message}` }
  }
})

// ─── Issues ───────────────────────────────────────────────────────────────────

ipcMain.handle('issues:getAll', (_, toolId) => {
  const db = getDb()
  const rows = toolId
    ? db.prepare('SELECT * FROM issues WHERE tool_id=? ORDER BY created_at DESC').all(toolId)
    : db.prepare('SELECT * FROM issues ORDER BY created_at DESC').all()
  return rows
})

ipcMain.handle('issues:save', (_, { tool_id, type, title, description }) => {
  const db = getDb()
  const result = db.prepare(
    'INSERT INTO issues (tool_id, type, title, description) VALUES (?, ?, ?, ?)'
  ).run(tool_id, type, title, description ?? '')
  return db.prepare('SELECT * FROM issues WHERE id=?').get(result.lastInsertRowid)
})

ipcMain.handle('issues:update', (_, { id, title, description, status, resolution_note }) => {
  const db = getDb()
  const current = db.prepare('SELECT status FROM issues WHERE id=?').get(id)
  const newStatus = status ?? current?.status
  const resolved_at = newStatus === 'done' ? (db.prepare('SELECT resolved_at FROM issues WHERE id=?').get(id)?.resolved_at ?? new Date().toISOString()) : null
  db.prepare(
    'UPDATE issues SET title=COALESCE(?,title), description=COALESCE(?,description), status=COALESCE(?,status), resolved_at=?, resolution_note=COALESCE(?,resolution_note) WHERE id=?'
  ).run(title ?? null, description ?? null, status ?? null, resolved_at, resolution_note ?? null, id)
  return db.prepare('SELECT * FROM issues WHERE id=?').get(id)
})

ipcMain.handle('issues:delete', (_, id) => {
  getDb().prepare('DELETE FROM issues WHERE id=?').run(id)
  return { ok: true }
})

ipcMain.handle('issues:startSession', async (_, ids) => {
  const db = getDb()
  const idList  = Array.isArray(ids) ? ids : [ids]
  const issues  = idList.map(id => db.prepare('SELECT * FROM issues WHERE id=?').get(id)).filter(Boolean)
  if (!issues.length) return { ok: false, error: 'No issues found' }

  const tool = db.prepare('SELECT * FROM tool_registry WHERE id=?').get(issues[0].tool_id)
  if (!tool) return { ok: false, error: 'Tool not found' }

  // Branch name
  let branchName
  if (idList.length === 1) {
    const slug = issues[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    branchName = `issue-${idList[0]}-${slug}`
  } else {
    branchName = `issues-${idList.join('-')}`
  }

  // Build prompt
  let prompt
  if (idList.length === 1) {
    const typeLabel = issues[0].type === 'bug' ? 'Bug fix' : 'Feature'
    const descPart  = issues[0].description ? `\n\nContext:\n${issues[0].description}` : ''
    prompt = `${typeLabel}: ${issues[0].title}${descPart}\n\nDo ONLY this and nothing else.`
  } else {
    const items = issues.map((iss, i) => {
      const typeLabel = iss.type === 'bug' ? 'Bug fix' : 'Feature'
      const descPart  = iss.description ? `\n   Context: ${iss.description}` : ''
      return `${i + 1}. [${typeLabel}] ${iss.title}${descPart}`
    }).join('\n')
    prompt = `Work on the following ${issues.length} issues in one session:\n\n${items}\n\nImplement each one in order. Do ONLY these and nothing else.`
  }

  const fileKey    = idList.join('-')
  const promptPath = path.join(os.tmpdir(), `admin-issue-${fileKey}.txt`)
  const shPath     = path.join(os.tmpdir(), `admin-issue-${fileKey}.sh`)
  const safeDir    = tool.dir_path.replace(/'/g, "'\\''")
  const safePpt    = promptPath.replace(/'/g, "'\\''")
  const safeSh     = shPath.replace(/'/g, "'\\''")
  const safeIds    = JSON.stringify(idList)   // e.g. [1,3]

  fs.writeFileSync(promptPath, prompt)
  fs.writeFileSync(shPath, [
    '#!/bin/bash',
    `cd '${safeDir}'`,
    `CURRENT=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)`,
    `if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; then`,
    `  git checkout -b '${branchName}' 2>/dev/null || git checkout '${branchName}' 2>/dev/null`,
    `fi`,
    `claude "$(cat '${safePpt}')"`,
    // After session: find PR on this branch and close the issues in Admin
    `BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)`,
    `PR_URL=$(gh pr list --head "$BRANCH" --json url --jq '.[0].url' 2>/dev/null || echo "")`,
    `curl -s -X POST http://localhost:7702/session-done \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d "{\\"issueIds\\": ${safeIds}, \\"prUrl\\": \\"$PR_URL\\"}" > /dev/null 2>&1 || true`,
    `rm -f '${safePpt}' '${safeSh}'`,
  ].join('\n') + '\n')
  fs.chmodSync(shPath, '755')

  const appleScript = `
    tell application "Terminal"
      activate
      do script "bash '${safeSh}'"
    end tell
  `
  return new Promise(resolve => {
    execFile('osascript', ['-e', appleScript], err => resolve({ ok: !err, error: err?.message }))
  })
})

// ─── Digest ───────────────────────────────────────────────────────────────────

ipcMain.handle('digest:runNow', async () => {
  try {
    return await runDailyDigest(getDb())
  } catch (e) {
    return { error: e.message }
  }
})

// ─── Shell ────────────────────────────────────────────────────────────────────

ipcMain.handle('shell:openExternal', (_, url) => {
  shell.openExternal(url)
  return true
})

// ─── Filesystem (code / doc browser) ─────────────────────────────────────────

const FS_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'release', '__pycache__',
  '.venv', '.DS_Store', '.pytest_cache', '*.node',
])

/**
 * Determine whether a filesystem entry should be hidden in the code browser.
 *
 * Entries in `FS_IGNORE` (node_modules, .git, dist, etc.) and any name
 * beginning with a dot are excluded.
 *
 * @param {string} name - Filename or directory name (basename only).
 * @returns {boolean} `true` if the entry should be hidden.
 */
function shouldIgnore(name) {
  return FS_IGNORE.has(name) || name.startsWith('.')
}

ipcMain.handle('fs:listDir', (_, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter(e => !shouldIgnore(e.name))
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDir: e.isDirectory(),
        ext: e.isDirectory() ? null : path.extname(e.name).toLowerCase(),
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch { return [] }
})

ipcMain.handle('fs:readFile', (_, filePath) => {
  try {
    // Safety: only allow reads inside the Admin parent directory
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(ADMIN_PARENT) && !resolved.startsWith(path.join(os.homedir(), 'Library'))) {
      return { error: 'Access denied outside Admin workspace' }
    }
    const stat = fs.statSync(resolved)
    if (stat.size > 500_000) return { error: 'File too large to display (>500 KB)' }
    return { content: fs.readFileSync(resolved, 'utf8') }
  } catch (e) {
    return { error: e.message }
  }
})

// ─── JSDoc parser ─────────────────────────────────────────────────────────────

/**
 * Parse a JSDoc comment block string into a structured object.
 *
 * @param {string} comment - Raw comment text (between /** and *‌/).
 * @param {string|null} name - Function or module name, if known.
 * @returns {{name:string|null,description:string,params:object[],returns:object|null,throws:object|null,isFileHeader:boolean}}
 */
function parseJsdocBlock(comment, name) {
  const lines = comment.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim())
  const params = []
  let returns = null
  let throws_ = null
  const descLines = []
  let inDesc = true
  let isFileHeader = false

  for (const line of lines) {
    if (line.startsWith('@file'))        { isFileHeader = true; inDesc = false }
    else if (line.startsWith('@module')) { inDesc = false }
    else if (line.startsWith('@description')) {
      inDesc = false
      const rest = line.replace(/^@description\s*/, '')
      if (rest) descLines.push(rest)
    } else if (line.startsWith('@param')) {
      inDesc = false
      const m = line.match(/@param\s+\{([^}]*)\}\s+(\[?[\w.[\]]+\]?)\s*[-—]?\s*(.*)/)
      if (m) params.push({ type: m[1], name: m[2], desc: m[3] })
    } else if (line.startsWith('@returns') || line.startsWith('@return')) {
      inDesc = false
      const m = line.match(/@returns?\s+\{([^}]*)\}\s*(.*)/)
      if (m) returns = { type: m[1], desc: m[2] }
    } else if (line.startsWith('@throws')) {
      inDesc = false
      const m = line.match(/@throws\s+\{([^}]*)\}\s*(.*)/)
      if (m) throws_ = { type: m[1], desc: m[2] }
    } else if (line.startsWith('@')) {
      inDesc = false
    } else if (inDesc && line) {
      descLines.push(line)
    }
  }

  return { name, description: descLines.join(' ').trim(), params, returns, throws: throws_, isFileHeader }
}

/**
 * Parse all JSDoc blocks from a JS source file.
 *
 * Returns a file-level header entry (from the first `@file` block) and an
 * array of per-function entries extracted by matching `/** ... *‌/` blocks
 * immediately preceding a `function` declaration.
 *
 * @param {string} src - Full source text of the JS file.
 * @returns {{fileEntry:object|null, entries:object[]}}
 */
function parseJsdocSource(src) {
  const entries = []

  // File-level header: first /** block containing @file or @description
  let fileEntry = null
  const firstBlock = src.match(/^\/\*\*([\s\S]*?)\*\//)
  if (firstBlock) {
    const parsed = parseJsdocBlock(firstBlock[1], null)
    if (parsed.isFileHeader || parsed.description) {
      fileEntry = { ...parsed, isFileHeader: true }
    }
  }

  // Per-function blocks: /** ... */ immediately before a function declaration
  const re = /\/\*\*([\s\S]*?)\*\/[ \t]*\n[ \t]*(?:async[ \t]+)?function[ \t]+(\w+)/g
  let m
  while ((m = re.exec(src)) !== null) {
    const parsed = parseJsdocBlock(m[1], m[2])
    if (parsed.description || parsed.params.length) entries.push(parsed)
  }

  return { fileEntry, entries }
}

ipcMain.handle('docs:parseJsdoc', (_, filePath) => {
  try {
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(ADMIN_PARENT)) return { error: 'Access denied outside Admin workspace' }
    const src = fs.readFileSync(resolved, 'utf8')
    return parseJsdocSource(src)
  } catch (e) {
    return { error: e.message }
  }
})

// ─── User stories ─────────────────────────────────────────────────────────────

ipcMain.handle('stories:getAll', () => {
  // Parse USER_STORIES.md files from admin and each sub-tool
  const sources = [
    { tool: 'admin', file: path.join(ADMIN_PARENT, 'admin', 'USER_STORIES.md') },
    { tool: 'grove', file: path.join(ADMIN_PARENT, 'grove', 'USER_STORIES.md') },
    { tool: 'think', file: path.join(ADMIN_PARENT, 'think', 'USER_STORIES.md') },
    { tool: 'tantu', file: path.join(ADMIN_PARENT, 'tantu', 'USER_STORIES.md') },
  ]

  const stories = []

  for (const { tool, file } of sources) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n')

    let currentSection = ''
    let currentTags = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]

      // Section heading (## 1. Tool Management)
      if (line.startsWith('## ')) {
        currentSection = line.replace(/^##\s+/, '').replace(/^\d+\.\s+/, '')
        currentTags = []
        i++
        continue
      }

      // Tags line (> Tags: admin, grove)
      if (line.startsWith('> Tags:')) {
        currentTags = line.replace('> Tags:', '').split(',').map(t => t.trim()).filter(Boolean)
        i++
        continue
      }

      // Story heading (### 1.1 Title)
      if (line.startsWith('### ')) {
        const storyId = line.match(/###\s+([\d.]+)/)?.[1] ?? ''
        const title = line.replace(/^###\s+[\d.]+\s+/, '')
        i++

        // Next non-empty line should be the bold user story sentence
        while (i < lines.length && lines[i].trim() === '') i++
        const sentence = lines[i]?.replace(/\*\*/g, '') ?? ''
        i++

        // Collect acceptance criteria
        const criteria = []
        while (i < lines.length && !lines[i].startsWith('### ') && !lines[i].startsWith('## ')) {
          const cl = lines[i].trim()
          if (cl.startsWith('- ')) criteria.push(cl.slice(2))
          i++
        }

        stories.push({
          id: `${tool}-${storyId}`,
          source: tool,
          section: currentSection,
          storyId,
          title,
          sentence,
          criteria,
          tags: currentTags,
        })
        continue
      }
      i++
    }
  }
  return stories
})

// ─── Seed sample data (dev/testing) ──────────────────────────────────────────

ipcMain.handle('seed:run', () => {
  const db = getDb()

  // ── Ideas ──────────────────────────────────────────────────────────────────
  const insertIdea = db.prepare(`INSERT OR IGNORE INTO ideas (title, summary, raw_text, tags, source, created_at) VALUES (?, ?, ?, ?, 'seed', ?)`)
  const ideas = [
    ['Build a daily writing habit tracker', 'A lightweight tool that lets you log daily writing sessions, track word counts, and visualise streaks over time. Integrates with an LLM to suggest prompts when stuck.', JSON.stringify(['writing', 'habits', 'tool-idea']), '2026-03-10 09:00:00'],
    ['Research note-taking with graph view', 'An extension to Think that renders all concluded nodes across sessions as a knowledge graph. Nodes cluster by topic similarity; clicking navigates to the source session.', JSON.stringify(['think', 'research', 'graph', 'tool-idea']), '2026-03-12 14:30:00'],
    ['Automated weekly review digest', "A workflow that runs every Sunday at 7pm, pulls the past week's Grove sessions and Think conclusions, and sends a structured email summary to yourself.", JSON.stringify(['automation', 'grove', 'think', 'workflow']), '2026-03-13 11:15:00'],
    ['Village reaction emoji bar', 'Add emoji reactions (👍❤️🔥💡) to village feed items so followers can react without leaving a full comment. Stored in village_interactions with type = "reaction".', JSON.stringify(['village', 'ui', 'feature']), '2026-03-14 16:45:00'],
    ['Pomodoro timer integrated with Grove sessions', 'A floating Pomodoro timer that auto-creates a Grove session when a focus block starts and auto-ends it when the block finishes. Duration and breaks configurable in Settings.', JSON.stringify(['grove', 'focus', 'tool-idea']), '2026-03-15 08:00:00'],
  ]
  for (const [title, summary, tags, created_at] of ideas) insertIdea.run(title, summary, summary, tags, created_at)

  // ── Tags ───────────────────────────────────────────────────────────────────
  const insertTag    = db.prepare(`INSERT OR IGNORE INTO village_tags (id, name, icon, color) VALUES (?, ?, ?, ?)`)
  const insertTagDef = db.prepare(`INSERT OR IGNORE INTO village_tag_defaults (tag_id, tool_id, level) VALUES (?, ?, ?)`)
  insertTag.run('tag-family',     'Family',     '🏠', '#10b981')
  insertTag.run('tag-friends',    'Friends',    '🫂', '#6366f1')
  insertTag.run('tag-mentor',     'Mentor',     '🎓', '#f59e0b')
  insertTag.run('tag-colleagues', 'Colleagues', '💼', '#0ea5e9')
  // family: grove=reader, think=none
  insertTagDef.run('tag-family', 'grove', 'reader')
  // friends: grove=follower, think=follower
  for (const t of ['grove', 'think']) insertTagDef.run('tag-friends', t, 'follower')
  // mentor: grove+think=collaborator
  for (const t of ['grove', 'think']) insertTagDef.run('tag-mentor', t, 'collaborator')
  // colleagues: grove=reader, think=none
  insertTagDef.run('tag-colleagues', 'grove', 'reader')

  // ── Members ────────────────────────────────────────────────────────────────
  const insertMember = db.prepare(`INSERT OR IGNORE INTO village_members (id, name, email, avatar_emoji, tag_id, joined_at) VALUES (?, ?, ?, ?, ?, ?)`)
  const insertAccess = db.prepare(`INSERT OR IGNORE INTO village_access (member_id, tool_id, level) VALUES (?, ?, ?)`)
  const insertNotif  = db.prepare(`INSERT OR IGNORE INTO village_notifications (member_id, frequency) VALUES (?, ?)`)
  const members = [
    ['member-alice', 'Alice Chen',          'alice@example.com',  '🌸', 'tag-family',     'daily',  '2026-02-01 10:00:00'],
    ['member-dad',   'Arun',                'arun@example.com',   '🧓', 'tag-family',     'weekly', '2026-02-01 10:00:00'],
    ['member-bob',   'Bob Ramirez',         'bob@example.com',    '🎸', 'tag-friends',    'weekly', '2026-02-05 12:00:00'],
    ['member-kavya', 'Kavya Nair',          'kavya@example.com',  '📖', 'tag-friends',    'daily',  '2026-02-10 08:00:00'],
    ['member-priya', 'Priya Sharma',        'priya@example.com',  '📚', 'tag-mentor',     'daily',  '2026-01-15 09:00:00'],
    ['member-david', 'David Kim',           'david@example.com',  '💻', 'tag-colleagues', 'never',  '2026-02-20 14:00:00'],
    ['member-maya',  'Maya Torres',         'maya@example.com',   '🌙', 'tag-friends',    'weekly', '2026-02-15 16:00:00'],
    ['member-test',  '🧪 Village Tester',   'test@example.com',   '🧪', null,             'never',  '2026-01-01 00:00:00'],
  ]
  for (const [id, name, email, emoji, tag, freq, joined] of members) {
    insertMember.run(id, name, email, emoji, tag, joined)
    insertNotif.run(id, freq)
  }
  // Access overrides (override tag defaults for specific members)
  insertAccess.run('member-alice', 'grove', 'commenter')   // family default is reader → upgrade
  insertAccess.run('member-kavya', 'grove', 'commenter')   // friends default is follower → upgrade
  insertAccess.run('member-kavya', 'think', 'commenter')   // friends default is follower → upgrade
  insertAccess.run('member-test',  'grove', 'reader')      // no tag → explicit grant

  // ── Village activity (12 items, 17-day arc) ────────────────────────────────
  const insertAct = db.prepare(`INSERT OR IGNORE INTO village_activity (id, source_tool, activity_type, payload, created_at) VALUES (?, ?, ?, ?, ?)`)
  const act = (id, tool, type, payload, ts) => insertAct.run(id, tool, type, JSON.stringify(payload), ts)

  // Week 1 — ML fundamentals start
  act('act-grove-ml-1', 'grove', 'session_logged', { owner: 'Ram', course_title: 'Machine Learning Fundamentals', duration_minutes: 45, notes: 'Covered the math prerequisites — linear algebra refresher, dot products, matrix multiplication. Slow going but necessary.' }, '2026-03-01 19:00:00')
  act('act-grove-ml-2', 'grove', 'session_logged', { owner: 'Ram', course_title: 'Machine Learning Fundamentals', duration_minutes: 60, notes: 'Gradient descent finally makes intuitive sense. The "roll a ball down a hill" analogy clicked.' }, '2026-03-03 20:30:00')
  act('act-grove-streak-3', 'grove', 'streak_update', { owner: 'Ram', streak_days: 3, total_hours_this_week: 1.75, total_sessions: 3 }, '2026-03-03 20:45:00')
  act('act-grove-ml-3', 'grove', 'session_logged', { owner: 'Ram', course_title: 'Machine Learning Fundamentals', duration_minutes: 45, notes: 'Backpropagation and the chain rule. Had to watch 3Blue1Brown twice.' }, '2026-03-05 21:00:00')

  // Week 2 — TypeScript + RAG research
  act('act-grove-ts-1', 'grove', 'session_logged', { owner: 'Ram', course_title: 'TypeScript Advanced Patterns', duration_minutes: 60, notes: 'Conditional types and the infer keyword. Mind-bending but powerful — especially for building type-safe parsers.' }, '2026-03-09 10:00:00')
  act('act-think-rag-1', 'think', 'research_started', { owner: 'Ram', topic: 'Retrieval-Augmented Generation', session_title: 'RAG Architecture Deep Dive', node_count: 1, goal: 'Understand when to use RAG vs fine-tuning, and how to pick a vector DB' }, '2026-03-10 14:00:00')
  act('act-think-rag-2', 'think', 'node_concluded', { owner: 'Ram', topic: 'Vector DB comparison', session_title: 'RAG Architecture Deep Dive', takeaway: 'Pinecone is quickest to prototype with, but pgvector is sufficient for < 1M vectors and avoids an extra service. Weaviate wins on hybrid BM25 + vector search. For this project: pgvector.' }, '2026-03-10 16:00:00')
  act('act-grove-ts-2', 'grove', 'session_logged', { owner: 'Ram', course_title: 'TypeScript Advanced Patterns', duration_minutes: 90, notes: 'Mapped types and template literal types. Built a type-safe event emitter as an exercise.' }, '2026-03-12 11:00:00')
  act('act-grove-streak-7', 'grove', 'streak_update', { owner: 'Ram', streak_days: 7, total_hours_this_week: 3.5, total_sessions: 8 }, '2026-03-12 11:30:00')

  // Week 3 — current week
  act('act-grove-alg-1', 'grove', 'session_logged', { owner: 'Ram', course_title: 'Algorithms & Data Structures', duration_minutes: 50, notes: 'Dynamic programming fundamentals — tabulation vs memoisation. Classic coin-change problem.' }, '2026-03-14 19:30:00')
  act('act-grove-ml-4', 'grove', 'session_logged', { owner: 'Ram', course_title: 'Machine Learning Fundamentals', duration_minutes: 30, notes: 'Neural network architectures — feedforward, activation functions. Quick session before dinner.' }, '2026-03-16 08:45:00')
  act('act-grove-streak-11', 'grove', 'streak_update', { owner: 'Ram', streak_days: 11, total_hours_this_week: 2.25, total_sessions: 11 }, '2026-03-16 09:00:00')

  // ── Interactions (10 items, mix of read/unread) ────────────────────────────
  const insertInt = db.prepare(`INSERT OR IGNORE INTO village_interactions (id, activity_id, member_id, member_name, type, payload, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const int = (id, actId, mId, mName, body, ts, readAt) => insertInt.run(id, actId, mId, mName, 'comment', JSON.stringify({ body }), ts, readAt ?? null)

  int('int-alice-1', 'act-grove-ml-3', 'member-alice', 'Alice Chen',  "Wait you're learning ML?? that's so cool. is it hard?", '2026-03-05 22:15:00', '2026-03-06 09:00:00')
  int('int-priya-1', 'act-grove-ml-3', 'member-priya', 'Priya Sharma', 'Good milestone. One tip: implement backprop from scratch in numpy before moving to PyTorch. Forces you to understand every gradient.', '2026-03-06 07:30:00', '2026-03-06 09:00:00')
  int('int-kavya-1', 'act-grove-ts-1', 'member-kavya', 'Kavya Nair',  'The infer keyword was a game-changer for me too! Try using it to extract the return type of async functions — super practical.', '2026-03-09 11:30:00', '2026-03-09 19:00:00')
  int('int-priya-2', 'act-grove-ts-1', 'member-priya', 'Priya Sharma', 'Conditional types + infer is where TypeScript starts feeling like a proper type-level language. Total Type Safety (book by Matt Pocock) is excellent for this.', '2026-03-09 13:00:00', '2026-03-09 19:00:00')
  int('int-dad-1',   'act-grove-streak-3', 'member-dad', 'Arun',       '3 days in a row! Keep going beta 💪', '2026-03-03 21:30:00', '2026-03-04 08:00:00')
  int('int-priya-3', 'act-think-rag-2', 'member-priya', 'Priya Sharma', 'Good call on pgvector. Also worth evaluating Qdrant — Rust-based, extremely fast for < 5M vectors. But pgvector is the right pragmatic choice to start.', '2026-03-10 16:45:00', '2026-03-11 09:00:00')
  int('int-kavya-2', 'act-think-rag-2', 'member-kavya', 'Kavya Nair',  'Did you look at LlamaIndex for the orchestration layer? Works well with pgvector.', '2026-03-10 17:00:00', '2026-03-11 09:00:00')
  // Unread (3)
  int('int-alice-2', 'act-grove-streak-7', 'member-alice', 'Alice Chen', '7 days 🔥🔥 how are you keeping this up with work??', '2026-03-12 14:00:00', null)
  int('int-david-1', 'act-grove-streak-7', 'member-david', 'David Kim',  "Impressive. I've been meaning to study TS patterns too — let me know if you want to do a review session.", '2026-03-12 15:30:00', null)
  int('int-dad-2',   'act-grove-streak-11', 'member-dad', 'Arun',       '11 days! You are very dedicated. Proud of you 🙏', '2026-03-16 10:00:00', null)

  // ── Workflows ──────────────────────────────────────────────────────────────
  const insertWf = db.prepare(`INSERT OR IGNORE INTO workflows (name, trigger_tool, trigger_event, action_type, action_payload, enabled, created_at) SELECT ?, ?, ?, ?, ?, ?, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name=?)`)
  insertWf.run('Auto-sync village on Grove session', 'grove', 'session_logged', 'sync_village', '{}', 1, 'Auto-sync village on Grove session')
  insertWf.run('Log Think conclusions to console', 'think', 'node_concluded', 'log_to_console', '{}', 1, 'Log Think conclusions to console')
  insertWf.run('Weekly digest on Grove session (disabled)', 'grove', 'session_logged', 'send_email_digest', '{}', 0, 'Weekly digest on Grove session (disabled)')

  // Streak snapshot
  try { db.exec(`CREATE TABLE IF NOT EXISTS village_streak (date TEXT PRIMARY KEY, streak_days INTEGER, hours_this_week REAL, updated_at TEXT)`) } catch {}
  db.prepare(`INSERT OR REPLACE INTO village_streak (date, streak_days, hours_this_week, updated_at) VALUES ('2026-03-16', 11, 2.25, datetime('now'))`).run()

  return { ok: true, message: 'Sample data seeded: 8 members, 4 tags, 12 activities, 10 interactions' }
})

ipcMain.handle('seed:clear', () => {
  const db = getDb()
  const SEED_TAG_IDS     = ['tag-family', 'tag-friends', 'tag-mentor', 'tag-colleagues']
  const SEED_MEMBER_IDS  = ['member-alice', 'member-dad', 'member-bob', 'member-kavya', 'member-priya', 'member-david', 'member-maya', 'member-test']
  const SEED_ACTIVITY_IDS = [
    'act-grove-ml-1', 'act-grove-ml-2', 'act-grove-ml-3',
    'act-grove-ts-1', 'act-grove-ts-2',
    'act-grove-algo-1', 'act-grove-algo-2',
    'act-grove-streak-3', 'act-grove-streak-7', 'act-grove-streak-11',
    'act-think-rag-1', 'act-think-rag-2'
  ]
  const SEED_INT_IDS     = ['int-alice-1', 'int-priya-1', 'int-kavya-1', 'int-priya-2', 'int-dad-1', 'int-priya-3', 'int-kavya-2', 'int-alice-2', 'int-david-1', 'int-dad-2']
  const SEED_WF_NAMES    = ['Auto-sync village on Grove session', 'Log Think conclusions to console', 'Weekly digest on Grove session (disabled)']

  const placeholders = (arr) => arr.map(() => '?').join(',')

  db.prepare(`DELETE FROM village_interactions WHERE id IN (${placeholders(SEED_INT_IDS)})`).run(...SEED_INT_IDS)
  db.prepare(`DELETE FROM village_activity     WHERE id IN (${placeholders(SEED_ACTIVITY_IDS)})`).run(...SEED_ACTIVITY_IDS)
  // Deleting members cascades to village_access and village_notifications
  db.prepare(`DELETE FROM village_members WHERE id IN (${placeholders(SEED_MEMBER_IDS)})`).run(...SEED_MEMBER_IDS)
  // Deleting tags cascades to village_tag_defaults; members already gone so no orphan tag_id issue
  db.prepare(`DELETE FROM village_tags WHERE id IN (${placeholders(SEED_TAG_IDS)})`).run(...SEED_TAG_IDS)
  db.prepare(`DELETE FROM ideas WHERE source = 'seed'`).run()
  db.prepare(`DELETE FROM workflows WHERE name IN (${placeholders(SEED_WF_NAMES)})`).run(...SEED_WF_NAMES)

  return { ok: true, message: 'Seed data removed' }
})
