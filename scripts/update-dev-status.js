#!/usr/bin/env node
// update-dev-status <tool-dir>
// Reads recent git commits + CLAUDE.md, calls Ollama, writes dev-status.json
// Called automatically from each tool's .git/hooks/post-commit

'use strict'
const { execSync } = require('child_process')
const fs           = require('fs')
const path         = require('path')
const http         = require('http')

const toolDir = process.argv[2] || process.cwd()
const statusFile = path.join(toolDir, 'dev-status.json')

// ── Gather context ────────────────────────────────────────────────────────────

const toolId = path.basename(toolDir)

let commits = ''
try {
  commits = execSync('git log --oneline -20', { cwd: toolDir }).toString().trim()
} catch { process.exit(0) }  // not a git repo, nothing to do

const currentCommit = commits.split('\n')[0]?.split(' ')[0] ?? ''

// Don't regenerate if nothing changed since last run
try {
  const prev = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
  if (prev.last_commit === currentCommit) {
    console.log(`[update-dev-status] ${toolId}: up to date, skipping`)
    process.exit(0)
  }
} catch {}

function readTruncated(file, maxChars = 3000) {
  try { return fs.readFileSync(file, 'utf8').slice(0, maxChars) } catch { return '' }
}

const claudeMd   = readTruncated(path.join(toolDir, 'CLAUDE.md'))
const storiesMd  = readTruncated(path.join(toolDir, 'USER_STORIES.md'), 2000)
const rootClaudeSection = (() => {
  // Pull just the relevant section from root CLAUDE.md
  try {
    const rootMd = fs.readFileSync(path.join(toolDir, '../CLAUDE.md'), 'utf8')
    const start = rootMd.indexOf(`## ${toolId.charAt(0).toUpperCase() + toolId.slice(1)}`)
    if (start === -1) return ''
    const end = rootMd.indexOf('\n## ', start + 4)
    return rootMd.slice(start, end === -1 ? start + 2000 : end)
  } catch { return '' }
})()

const prompt = `You are summarizing the current state of "${toolId}", a macOS desktop tool.

Recent commits (newest first):
${commits}

Architecture / documentation:
${claudeMd}
${rootClaudeSection}
${storiesMd ? `User stories (subset):\n${storiesMd}` : ''}

Based on the commits and documentation, respond with a single JSON object:
{
  "dev_summary": "2-3 sentences describing what has been built and is working. Be specific about features, not vague.",
  "next_steps": ["step 1", "step 2", "step 3"]
}
next_steps should be 3-5 concrete, actionable development tasks that logically follow from what's been committed.
Return ONLY the JSON object. No markdown, no explanation, no extra text.`

// ── Call Ollama ───────────────────────────────────────────────────────────────

// Ollama settings — edit here if you change model/URL in Admin Settings
const ollamaUrl   = 'http://127.0.0.1:11434'
const ollamaModel = 'gemma3:latest'

function callOllama(url, model, promptText) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt: promptText, stream: false })
    const parsed = new URL(url.replace(/\/$/, '') + '/api/generate')
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 11434,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const req = http.request(opts, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.response ?? '')
        } catch { reject(new Error('Bad Ollama response: ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(new Error('Ollama timeout')) })
    req.write(body)
    req.end()
  })
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

;(async () => {
  console.log(`[update-dev-status] ${toolId}: calling ${ollamaModel}…`)
  try {
    const raw  = await callOllama(ollamaUrl, ollamaModel, prompt)
    const text = stripFences(raw)

    // Find the JSON object in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON object found in response: ' + text.slice(0, 300))

    const result = JSON.parse(jsonMatch[0])
    if (!result.dev_summary || !Array.isArray(result.next_steps)) {
      throw new Error('Unexpected shape: ' + JSON.stringify(result).slice(0, 200))
    }

    const status = {
      last_commit: currentCommit,
      updated_at:  new Date().toISOString(),
      dev_summary: result.dev_summary,
      next_steps:  result.next_steps.slice(0, 6),
    }

    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2))
    console.log(`[update-dev-status] ${toolId}: written dev-status.json`)

    // ── Update README.md STATUS block ──────────────────────────────────────────
    const readmePath = (() => {
      for (const name of ['README.md', 'Readme.md', 'readme.md']) {
        const p = path.join(toolDir, name)
        if (fs.existsSync(p)) return p
      }
      return null
    })()

    if (readmePath) {
      try {
        const recentCommits = execSync('git log --oneline -10', { cwd: toolDir }).toString().trim()
        const commitLines = recentCommits.split('\n').map(l => `- \`${l.slice(0,7)}\` ${l.slice(8)}`).join('\n')
        const nextList = status.next_steps.map(s => `- ${s}`).join('\n')
        const dateStr = new Date().toISOString().slice(0, 10)

        const statusBlock = `<!-- STATUS:START -->
## Current Status

> *Auto-updated ${dateStr} by the post-commit hook.*

${status.dev_summary}

**Next steps:**
${nextList}

**Recent commits:**
${commitLines}
<!-- STATUS:END -->`

        let readme = fs.readFileSync(readmePath, 'utf8')
        const startTag = '<!-- STATUS:START -->'
        const endTag   = '<!-- STATUS:END -->'
        const startIdx = readme.indexOf(startTag)
        const endIdx   = readme.indexOf(endTag)

        if (startIdx !== -1 && endIdx !== -1) {
          readme = readme.slice(0, startIdx) + statusBlock + readme.slice(endIdx + endTag.length)
          fs.writeFileSync(readmePath, readme)
          console.log(`[update-dev-status] ${toolId}: updated README.md status block`)
        } else {
          // Append block if markers not found
          readme = readme.trimEnd() + '\n\n' + statusBlock + '\n'
          fs.writeFileSync(readmePath, readme)
          console.log(`[update-dev-status] ${toolId}: appended STATUS block to README.md`)
        }
      } catch (readmeErr) {
        console.error(`[update-dev-status] ${toolId}: README update failed — ${readmeErr.message}`)
      }
    }

    // Admin picks up dev-status.json on next Refresh (tools:discover reads it)
    console.log(`[update-dev-status] ${toolId}: done — Admin will sync on next Refresh`)

  } catch (e) {
    console.error(`[update-dev-status] ${toolId}: failed — ${e.message}`)
    process.exit(0)  // exit 0 so git commit still succeeds
  }
})()
