import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft, Play, Square, RotateCcw, Pencil, Tag, ShieldCheck,
  FileText, Code2, Bug, Plug, BookOpen, ChevronRight, ChevronDown,
  RefreshCw, Check, Folder, File, AlertCircle, Sparkles, X, Package,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PHASES = {
  planning:  { label: 'Planning',  bg: 'bg-amber-50',   text: 'text-amber-600',  dot: 'bg-amber-400'  },
  building:  { label: 'Building',  bg: 'bg-blue-50',    text: 'text-blue-600',   dot: 'bg-blue-400'   },
  stable:    { label: 'Stable',    bg: 'bg-emerald-50', text: 'text-emerald-600',dot: 'bg-emerald-500'},
  archived:  { label: 'Archived',  bg: 'bg-gray-100',   text: 'text-gray-400',   dot: 'bg-gray-300'   },
}
const PROTOCOL_LEVELS = {
  0: { label: 'Unregistered', color: 'text-gray-300' },
  1: { label: 'L1',           color: 'text-amber-400', title: 'Registered: tool.json + CLAUDE.md + git' },
  2: { label: 'L2',           color: 'text-blue-500',  title: 'Active: + USER_STORIES + hook + dev-status' },
  3: { label: 'L3',           color: 'text-emerald-500', title: 'Integrated: + services + village' },
}

// All .md files that might exist in a tool or workspace docs dir
const DOC_FILES = [
  { rel: 'understand-the-tool.md', label: 'Understand this tool',  desc: 'Navigation guide to all docs' },
  { rel: 'CLAUDE.md',              label: 'CLAUDE.md',             desc: 'Architecture, safety rules, key files' },
  { rel: 'USER_STORIES.md',        label: 'User Stories',          desc: 'Feature spec as testable acceptance criteria' },
  { rel: '../TOOL_PROTOCOL.md',    label: 'Tool Protocol',         desc: 'L1/L2/L3 compliance spec for all tools' },
  { rel: '../docs/HOW_IT_WORKS.md',label: 'How It Works',          desc: 'IPC flow, discovery, gateway, village pipeline' },
  { rel: '../docs/STATE_MACHINES.md',label:'State Machines',       desc: 'Entity lifecycle diagrams (nodes, courses, issues…)' },
  { rel: '../docs/DECISIONS.md',   label: 'Architecture Decisions',desc: 'Why things were built the way they were' },
]

// ─── Simple Markdown renderer (no deps) ──────────────────────────────────────

function renderMarkdown(text) {
  const lines = text.split('\n')
  const elements = []
  let i = 0
  let inCode = false
  let codeLines = []
  let codeLang = ''
  let inTable = false
  let tableRows = []

  const flushTable = () => {
    if (!tableRows.length) return
    const [header, , ...body] = tableRows
    const cols = header.split('|').filter(Boolean).map(c => c.trim())
    elements.push(
      <div key={`tbl-${i}`} className="overflow-x-auto my-3">
        <table className="text-xs w-full border-collapse">
          <thead><tr>{cols.map((c,j)=><th key={j} className="text-left px-2 py-1 bg-gray-50 border border-gray-100 font-semibold text-gray-600">{c}</th>)}</tr></thead>
          <tbody>{body.map((row,ri)=>{
            const cells = row.split('|').filter(Boolean).map(c=>c.trim())
            return <tr key={ri}>{cells.map((c,ci)=><td key={ci} className="px-2 py-1 border border-gray-100 text-gray-700">{inlineFormat(c)}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
    )
    tableRows = []
    inTable = false
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={`code-${i}`} className="bg-gray-900 text-green-300 text-xs font-mono rounded-lg p-3 my-3 overflow-x-auto whitespace-pre">
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = []; inCode = false; codeLang = ''
      } else {
        if (inTable) flushTable()
        inCode = true; codeLang = line.slice(3).trim()
      }
      i++; continue
    }
    if (inCode) { codeLines.push(line); i++; continue }

    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!inTable) inTable = true
      tableRows.push(line)
      i++; continue
    }
    if (inTable) flushTable()

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-gray-900 mt-5 mb-3">{inlineFormat(line.slice(2))}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-base font-bold text-gray-800 mt-5 mb-2 pb-1 border-b border-gray-100">{inlineFormat(line.slice(3))}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-gray-700 mt-4 mb-1.5">{inlineFormat(line.slice(4))}</h3>)
    } else if (line.startsWith('#### ')) {
      elements.push(<h4 key={i} className="text-xs font-semibold text-gray-600 uppercase tracking-wider mt-3 mb-1">{inlineFormat(line.slice(5))}</h4>)
    } else if (line.match(/^[-*] /)) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
          <span>{inlineFormat(line.slice(2))}</span>
        </div>
      )
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)[1]
      elements.push(
        <div key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="shrink-0 text-gray-400 font-mono text-xs mt-0.5 w-4 text-right">{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-primary/30 pl-3 py-0.5 text-sm text-gray-500 italic my-1">
          {inlineFormat(line.slice(2))}
        </blockquote>
      )
    } else if (line.startsWith('---') || line.startsWith('***')) {
      elements.push(<hr key={i} className="border-gray-100 my-4" />)
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed my-1">{inlineFormat(line)}</p>)
    } else {
      elements.push(<div key={i} className="h-2" />)
    }
    i++
  }
  if (inTable) flushTable()
  return elements
}

function inlineFormat(text) {
  // Handle inline code, bold, italic, links
  const parts = []
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0, m
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const s = m[0]
    if (s.startsWith('`'))   parts.push(<code key={m.index} className="font-mono text-[11px] bg-gray-100 px-1 py-0.5 rounded text-indigo-700">{s.slice(1,-1)}</code>)
    else if (s.startsWith('**')) parts.push(<strong key={m.index} className="font-semibold text-gray-900">{s.slice(2,-2)}</strong>)
    else if (s.startsWith('*'))  parts.push(<em key={m.index} className="italic">{s.slice(1,-1)}</em>)
    else if (s.startsWith('['))  {
      const label = s.match(/\[([^\]]+)\]/)[1]
      parts.push(<span key={m.index} className="text-indigo-600 underline">{label}</span>)
    }
    last = m.index + s.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}

// ─── File tree ────────────────────────────────────────────────────────────────

const EXT_ICONS = {
  '.md': { icon: FileText, color: 'text-blue-400' },
  '.js': { icon: Code2,    color: 'text-yellow-400' },
  '.jsx':{ icon: Code2,    color: 'text-cyan-400' },
  '.py': { icon: Code2,    color: 'text-green-400' },
  '.json':{ icon: FileText,color: 'text-orange-400' },
  '.sh': { icon: Code2,    color: 'text-gray-400' },
  '.css':{ icon: FileText, color: 'text-pink-400' },
}

function FileNode({ entry, depth, onSelect, selectedPath }) {
  const [open, setOpen] = useState(depth < 1)
  const [children, setChildren] = useState(null)
  const isSelected = selectedPath === entry.path
  const { icon: IconComp, color } = EXT_ICONS[entry.ext] ?? { icon: File, color: 'text-gray-400' }

  const toggle = async () => {
    if (!entry.isDir) { onSelect(entry); return }
    if (!open && !children) {
      const items = await window.api.fsListDir(entry.path)
      setChildren(items)
    }
    setOpen(o => !o)
  }

  return (
    <div>
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors text-xs ${
          isSelected ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {entry.isDir
          ? <><span className="text-gray-400">{open ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}</span><Folder size={12} className="text-amber-400 shrink-0" /></>
          : <><span className="w-[11px]" /><IconComp size={12} className={`${color} shrink-0`} /></>
        }
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.isDir && open && children?.map(c => (
        <FileNode key={c.path} entry={c} depth={depth+1} onSelect={onSelect} selectedPath={selectedPath} />
      ))}
    </div>
  )
}

function FileTree({ rootPath, onSelect, selectedPath }) {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    window.api.fsListDir(rootPath).then(setEntries)
  }, [rootPath])
  if (!entries) return <div className="p-3 text-xs text-gray-400">Loading…</div>
  return (
    <div className="py-1">
      {entries.map(e => (
        <FileNode key={e.path} entry={e} depth={0} onSelect={onSelect} selectedPath={selectedPath} />
      ))}
    </div>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview',  icon: BookOpen },
  { id: 'docs',     label: 'Docs',      icon: FileText },
  { id: 'code',     label: 'Code',      icon: Code2    },
  { id: 'issues',   label: 'Issues',    icon: Bug      },
  { id: 'services', label: 'Services',  icon: Plug     },
]

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ tool }) {
  const phase = PHASES[tool.dev_phase] ?? PHASES.planning
  const pl = PROTOCOL_LEVELS[tool.protocol_level ?? 0]

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">What's been built</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{tool.dev_summary || 'No summary yet — make a commit to generate one.'}</p>
      </div>

      {(tool.next_steps ?? []).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Next concrete steps</h3>
          <ol className="space-y-2">
            {(tool.next_steps ?? []).map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-xs flex items-center justify-center font-mono mt-0.5">{i+1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Protocol compliance</h3>
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className={pl.color} />
          <span className={`text-sm font-medium ${pl.color}`}>{pl.label}</span>
          {pl.title && <span className="text-xs text-gray-400">— {pl.title}</span>}
        </div>
        <div className="flex gap-3 mt-2">
          {[1,2,3].map(lvl => (
            <div key={lvl} className={`flex items-center gap-1 text-xs ${(tool.protocol_level??0) >= lvl ? PROTOCOL_LEVELS[lvl].color : 'text-gray-200'}`}>
              <Check size={11} /><span>L{lvl}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Metadata</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <dt className="text-gray-400">Phase</dt>
          <dd><span className={`px-2 py-0.5 rounded-full font-medium ${phase.bg} ${phase.text}`}>{phase.label}</span></dd>
          <dt className="text-gray-400">Stable tag</dt>
          <dd>{tool.stable_tag ? <span className="font-mono text-emerald-600">{tool.stable_tag}</span> : <span className="text-gray-300">none</span>}</dd>
          <dt className="text-gray-400">Service port</dt>
          <dd>{tool.service_port ? <span className="font-mono text-indigo-600">{tool.service_port}</span> : <span className="text-gray-300">—</span>}</dd>
          <dt className="text-gray-400">Directory</dt>
          <dd className="font-mono truncate text-gray-500">{tool.dirPath}</dd>
        </dl>
      </div>
    </div>
  )
}

// ─── Docs tab ────────────────────────────────────────────────────────────────

function DocsTab({ tool }) {
  const [selected, setSelected] = useState(null)
  const [content, setContent]   = useState(null)
  const [loading, setLoading]   = useState(false)

  // resolve relative path from tool dir
  const resolvePath = (relPath) => {
    if (relPath.startsWith('/')) return relPath
    const parts = tool.dirPath.split('/')
    for (const seg of relPath.split('/')) {
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    return parts.join('/')
  }

  const handleOpen = async (relPath) => {
    setLoading(true)
    setSelected(relPath)
    const result = await window.api.fsReadFile(resolvePath(relPath))
    setContent(result)
    setLoading(false)
  }

  return (
    <div className="flex h-full">
      {/* Doc list */}
      <div className="w-56 border-r border-gray-100 overflow-y-auto p-3 space-y-1 shrink-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Documentation</p>
        {DOC_FILES.map(doc => {
          const exists = true // optimistic; error shown in viewer
          return (
            <button key={doc.rel}
              onClick={() => handleOpen(doc.rel)}
              className={`w-full text-left px-2 py-2 rounded-lg text-xs transition-colors ${selected === doc.rel ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-700'}`}
            >
              <div className="font-medium">{doc.label}</div>
              <div className="text-gray-400 mt-0.5 leading-tight">{doc.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FileText size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">Select a document</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <RefreshCw size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {!loading && content?.error && (
          <div className="flex items-start gap-2 text-amber-600 text-sm bg-amber-50 rounded-xl p-4">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">File not found</p>
              <p className="text-xs text-amber-500 mt-0.5">{content.error}</p>
            </div>
          </div>
        )}
        {!loading && content?.content && (
          <div className="prose-sm max-w-none">
            {renderMarkdown(content.content)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Code tab ────────────────────────────────────────────────────────────────

function CodeTab({ tool }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSelect = async (entry) => {
    if (entry.isDir) return
    setSelectedFile(entry)
    setLoading(true)
    const result = await window.api.fsReadFile(entry.path)
    setContent(result)
    setLoading(false)
  }

  const isMarkdown = selectedFile?.ext === '.md'

  return (
    <div className="flex h-full">
      {/* Tree */}
      <div className="w-52 border-r border-gray-100 overflow-y-auto shrink-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">Files</p>
        <FileTree rootPath={tool.dirPath} onSelect={handleSelect} selectedPath={selectedFile?.path} />
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-y-auto">
        {!selectedFile && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Code2 size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">Select a file to view</p>
          </div>
        )}
        {selectedFile && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
              <Code2 size={12} className="text-gray-400" />
              <span className="text-xs text-gray-600 font-mono">{selectedFile.path.replace(tool.dirPath + '/', '')}</span>
              {isMarkdown && (
                <span className="ml-auto text-[10px] text-indigo-500 font-medium">rendered as markdown</span>
              )}
            </div>
            {loading && <div className="p-4 text-sm text-gray-400 flex items-center gap-2"><RefreshCw size={13} className="animate-spin"/>Loading…</div>}
            {!loading && content?.error && <div className="p-4 text-sm text-red-500">{content.error}</div>}
            {!loading && content?.content && (
              isMarkdown
                ? <div className="p-6 overflow-y-auto">{renderMarkdown(content.content)}</div>
                : <pre className="p-4 text-xs font-mono text-gray-700 whitespace-pre overflow-x-auto leading-relaxed">
                    {content.content.split('\n').map((line, i) => (
                      <div key={i} className="flex">
                        <span className="w-10 shrink-0 text-gray-300 select-none text-right pr-3">{i+1}</span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Issues tab ──────────────────────────────────────────────────────────────

function IssuesTab({ tool }) {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')

  const load = useCallback(async () => {
    const all = await window.api.getIssues(tool.id)
    setIssues(all)
    setLoading(false)
  }, [tool.id])

  useEffect(() => { load() }, [load])

  const handleUpdate = async (data) => {
    const updated = await window.api.updateIssue(data)
    setIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
  }
  const handleDelete = async (id) => {
    await window.api.deleteIssue(id)
    setIssues(prev => prev.filter(i => i.id !== id))
  }
  const handleStart = async (id) => { await window.api.startIssueSession(id) }
  const handleAdd = async (type) => {
    const title = prompt(`${type === 'bug' ? 'Bug' : 'Feature'}: short description`)
    if (!title?.trim()) return
    const saved = await window.api.saveIssue({ tool_id: tool.id, type, title: title.trim(), description: '' })
    setIssues(prev => [saved, ...prev])
  }

  const filtered = issues.filter(i => filter === 'all' || i.status === filter)
  const openBugs = issues.filter(i=>i.status==='open'&&i.type==='bug').length
  const openFeats = issues.filter(i=>i.status==='open'&&i.type==='feature').length

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{openBugs} bug{openBugs!==1?'s':''} · {openFeats} feature request{openFeats!==1?'s':''} open</p>
        <div className="flex gap-2">
          <button onClick={() => handleAdd('bug')} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">
            <Bug size={11} /> + Bug
          </button>
          <button onClick={() => handleAdd('feature')} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-xs font-medium hover:bg-violet-100">
            <Sparkles size={11} /> + Feature
          </button>
        </div>
      </div>
      <div className="flex gap-1 mb-4">
        {['open','done','all'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${filter===s?'bg-primary text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {s}
          </button>
        ))}
      </div>
      {loading ? <div className="text-sm text-gray-400">Loading…</div>
      : filtered.length === 0 ? <div className="text-sm text-gray-400 py-8 text-center">No {filter} issues</div>
      : (
        <div className="space-y-2">
          {filtered.map(issue => (
            <div key={issue.id} className={`flex items-start gap-3 bg-white border rounded-xl px-4 py-3 ${issue.status==='done'?'opacity-50':''}`}>
              <button onClick={() => handleUpdate({id:issue.id, status: issue.status==='done'?'open':'done'})}
                className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${issue.status==='done'?'bg-emerald-500 border-emerald-500':'border-gray-300 hover:border-emerald-400'}`}>
                {issue.status==='done' && <Check size={10} className="text-white"/>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {issue.type==='bug' ? <Bug size={12} className="text-red-500 shrink-0"/> : <Sparkles size={12} className="text-violet-500 shrink-0"/>}
                  <span className={`text-sm font-medium ${issue.status==='done'?'line-through text-gray-400':'text-gray-900'}`}>{issue.title}</span>
                </div>
                {issue.description && <p className="text-xs text-gray-500 mt-0.5">{issue.description}</p>}
              </div>
              {issue.status!=='done' && (
                <button onClick={() => handleStart(issue.id)} className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-xs hover:bg-indigo-100">
                  <Play size={10}/> Fix it
                </button>
              )}
              <button onClick={() => handleDelete(issue.id)} className="p-1 text-gray-300 hover:text-red-400"><X size={12}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Services tab ────────────────────────────────────────────────────────────

function ServicesTab({ tool }) {
  const [caps, setCaps] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    window.api.getCapabilities().then(all => {
      setCaps(all.filter(c => c.tool_id === tool.id))
      setLoading(false)
    })
  }, [tool.id])

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  if (!caps.length) return (
    <div className="p-6 text-sm text-gray-500">
      <p className="font-medium mb-1">No services registered</p>
      <p className="text-xs text-gray-400">Add a <code className="font-mono bg-gray-100 px-1 rounded">services[]</code> array to <code className="font-mono bg-gray-100 px-1 rounded">tool.json</code> and hit Refresh.</p>
    </div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-4">
      {caps.map(cap => (
        <div key={cap.service_id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-mono font-semibold text-gray-900">{cap.service_id}</code>
          </div>
          <p className="text-xs text-gray-500 mb-3">{cap.description}</p>
          <div className="font-mono text-xs bg-gray-50 rounded-lg px-3 py-2 text-indigo-600 break-all">{cap.gateway_url}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Main ToolDetail ─────────────────────────────────────────────────────────

export default function ToolDetail({ tool: initialTool, status, onBack, onLaunch, onStop, onResume, onEdit }) {
  const [tab, setTab] = useState('overview')
  const [tool, setTool] = useState(initialTool)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState(null)
  const isRunning = status === 'running'
  const isAdmin   = tool.id === 'admin'
  const hasStable = !!tool.launch_app
  const phase = PHASES[tool.dev_phase] ?? PHASES.planning

  // Refresh tool data when coming back to this detail
  useEffect(() => { setTool(initialTool) }, [initialTool])

  const handlePublish = async () => {
    setPublishing(true)
    setPublishMsg(null)
    const result = await window.api.publishTool(tool.id)
    setPublishing(false)
    if (result.ok) {
      setTool(t => ({ ...t, launch_app: result.appPath, stable_tag: result.stableTag, version: result.version ?? t.version }))
      setPublishMsg({ ok: true, text: `Published ${result.stableTag ?? result.version} — ${result.appPath.split('/').pop()}` })
    } else {
      setPublishMsg({ ok: false, text: result.error })
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={15} /> Tools
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{tool.icon}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{tool.name}</h1>
                {tool.stable_tag && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <Tag size={9}/>{tool.stable_tag}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${phase.bg} ${phase.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${phase.dot}`}/>
                  {phase.label}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs ${isRunning ? 'text-green-600' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-300'}`}/>
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{tool.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isAdmin && (
              <>
                <button onClick={handlePublish} disabled={publishing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  title="Scan release/ for a packaged .app and register it as the stable launch target">
                  {publishing ? <RefreshCw size={12} className="animate-spin"/> : <Package size={12}/>}
                  {hasStable ? 'Re-publish' : 'Publish Release'}
                </button>
                <button onClick={isRunning ? onStop : onLaunch}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isRunning?'bg-red-50 text-red-600 hover:bg-red-100':hasStable?'bg-emerald-100 text-emerald-700 hover:bg-emerald-200':'bg-primary/10 text-primary hover:bg-primary/20'}`}>
                  {isRunning ? <><Square size={12}/> Stop</> : <><Play size={12}/> {hasStable ? 'Launch' : 'Launch Dev'}</>}
                </button>
              </>
            )}
            <button onClick={() => onResume(tool.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              <RotateCcw size={12}/> {tool.has_session ? 'Resume' : 'Start Claude'}
            </button>
            <button onClick={() => onEdit(tool)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors">
              <Pencil size={14}/>
            </button>
          </div>
          {publishMsg && (
            <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${publishMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {publishMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-6 pt-3 border-b border-gray-100 bg-white">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={13}/>{t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'overview'  && <div className="h-full overflow-y-auto"><OverviewTab tool={tool}/></div>}
        {tab === 'docs'      && <div className="h-full flex"><DocsTab tool={tool}/></div>}
        {tab === 'code'      && <div className="h-full flex"><CodeTab tool={tool}/></div>}
        {tab === 'issues'    && <div className="h-full overflow-y-auto"><IssuesTab tool={tool}/></div>}
        {tab === 'services'  && <div className="h-full overflow-y-auto"><ServicesTab tool={tool}/></div>}
      </div>
    </div>
  )
}
