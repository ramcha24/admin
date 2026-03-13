const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile, spawn } = require('child_process')
const { initDatabase, getDb } = require('./database')

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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

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

ipcMain.handle('events:publish', (_, sourceId, eventType, payload) => {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO events (source_tool, event_type, payload)
    VALUES (?, ?, ?)
  `).run(sourceId, eventType, JSON.stringify(payload))
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

// ─── Settings ─────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', (_, key) => {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
})

ipcMain.handle('settings:set', (_, { key, value }) => {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  return true
})

// ─── Shell ────────────────────────────────────────────────────────────────────

ipcMain.handle('shell:openExternal', (_, url) => {
  shell.openExternal(url)
  return true
})
