const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile, spawn } = require('child_process')
const { initDatabase, getDb } = require('./database')
const { startVillageServer, stopVillageServer, syncGroveActivity, syncThinkActivity, VILLAGE_PORT } = require('./village')
const { syncToSupabase } = require('./supabase')
const { scheduleDailyDigest, cancelDigestSchedule, runDailyDigest } = require('./digest')

const isDev = process.argv.includes('--dev')
const ADMIN_PARENT = path.resolve(__dirname, '../../')  // /Users/ramcha1994/Admin

// Track running tool processes: { toolId: { pid, process } }
const runningTools = {}

let win

// ─── Window ──────────────────────────────────────────────────────────────────

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
  scheduleDailyDigest(getDb())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { stopVillageServer(); cancelDigestSchedule() })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

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

    db.prepare(`
      INSERT OR REPLACE INTO tool_registry
        (id, name, icon, description, color, version, status, dir_path,
         launch_dev, launch_app, capabilities, emits, listens, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      manifest.id,
      manifest.name,
      manifest.icon,
      manifest.description,
      manifest.color,
      manifest.version,
      manifest.status,
      dirPath,
      manifest.launch?.dev ?? null,
      manifest.launch?.app ?? null,
      JSON.stringify(manifest.capabilities ?? []),
      JSON.stringify(manifest.emits ?? []),
      JSON.stringify(manifest.listens ?? [])
    )

    tools.push({ ...manifest, dirPath })
  }

  return tools
})

// ─── Tool launch / stop ───────────────────────────────────────────────────────

ipcMain.handle('tools:launch', (_, id) => {
  const db = getDb()
  const tool = db.prepare('SELECT * FROM tool_registry WHERE id = ?').get(id)
  if (!tool) return { ok: false, error: 'Tool not found' }
  if (runningTools[id]) return { ok: false, error: 'Already running' }

  const launchCmd = tool.launch_dev
  if (!launchCmd) return { ok: false, error: 'No launch command' }

  const child = spawn('bash', ['-c', launchCmd], {
    cwd: tool.dir_path,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  runningTools[id] = { pid: child.pid, process: child }

  child.on('exit', () => {
    delete runningTools[id]
  })

  return { ok: true, pid: child.pid }
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

ipcMain.handle('tools:status', () => {
  const status = {}
  const db = getDb()
  const tools = db.prepare('SELECT id FROM tool_registry').all()
  for (const t of tools) {
    const entry = runningTools[t.id]
    if (entry) {
      try {
        process.kill(entry.pid, 0)  // Signal 0 = check if alive
        status[t.id] = 'running'
      } catch {
        delete runningTools[t.id]
        status[t.id] = 'stopped'
      }
    } else {
      status[t.id] = 'stopped'
    }
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

const isDev = process.argv.includes('--dev')
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

async function llmComplete(messages, { systemPrompt, maxTokens = 1024 } = {}) {
  const db = getDb()
  const provider  = db.prepare("SELECT value FROM settings WHERE key='llm_provider'").get()?.value ?? 'claude'
  const model     = db.prepare("SELECT value FROM settings WHERE key='llm_model'").get()?.value
  const apiKey    = db.prepare("SELECT value FROM settings WHERE key='anthropic_api_key'").get()?.value
  const ollamaUrl = db.prepare("SELECT value FROM settings WHERE key='ollama_base_url'").get()?.value ?? 'http://localhost:11434'
  const ollamaModel = db.prepare("SELECT value FROM settings WHERE key='ollama_model'").get()?.value ?? 'llama3'

  if (provider === 'ollama') {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || ollamaModel,
        messages: systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages,
        stream: false,
      }),
    })
    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`)
    const data = await response.json()
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
  const { title, summary, raw_text, tags = [], source = '' } = data
  const result = getDb().prepare(`
    INSERT INTO ideas (title, summary, raw_text, tags, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, summary, raw_text, JSON.stringify(tags), source)
  return { ok: true, id: result.lastInsertRowid }
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
    const parsed = JSON.parse(text)
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
    const parsed = JSON.parse(text)
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
      do script "cd '${ADMIN_PARENT}' && claude --plan '${prompt.replace(/'/g, "'\\''")}'"
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
  const id = `member-${Date.now()}`
  getDb().prepare(`
    INSERT INTO village_members (id, name, email, avatar_emoji, tag_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, email, avatarEmoji ?? '👤', tagId ?? null)
  return { ok: true, id, url: `http://localhost:${VILLAGE_PORT}/?member=${id}` }
})

ipcMain.handle('village:updateMember', (_, { id, email, tagId }) => {
  const db = getDb()
  db.prepare('UPDATE village_members SET email=?, tag_id=? WHERE id=?').run(email, tagId ?? null, id)
  return { ok: true }
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

// Run matching workflows when an event fires
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

// ─── User stories ─────────────────────────────────────────────────────────────

ipcMain.handle('stories:getAll', () => {
  // Parse USER_STORIES.md files from admin and each sub-tool
  const sources = [
    { tool: 'admin', file: path.join(ADMIN_PARENT, 'admin', 'USER_STORIES.md') },
    { tool: 'grove', file: path.join(ADMIN_PARENT, 'grove', 'USER_STORIES.md') },
    { tool: 'think', file: path.join(ADMIN_PARENT, 'think', 'USER_STORIES.md') },
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
