import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { BookOpen, RefreshCw, ChevronDown, ChevronRight, Search, X, Check } from 'lucide-react'

const TOOL_COLORS = {
  admin:   { bg: 'bg-indigo-50',  text: 'text-indigo-600',  border: 'border-indigo-200', dot: 'bg-indigo-500'  },
  grove:   { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200',dot: 'bg-emerald-500' },
  think:   { bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-200', dot: 'bg-violet-500'  },
  village: { bg: 'bg-sky-50',     text: 'text-sky-600',     border: 'border-sky-200',    dot: 'bg-sky-500'     },
  tantu:   { bg: 'bg-rose-50',    text: 'text-rose-600',    border: 'border-rose-200',   dot: 'bg-rose-500'    },
}
const DEFAULT_COLOR = { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', dot: 'bg-gray-400' }

function toolColor(id) { return TOOL_COLORS[id] ?? DEFAULT_COLOR }

// ─── Multi-select tool dropdown ───────────────────────────────────────────────

function ToolDropdown({ tools, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  const label = selected.length === 0
    ? 'All tools'
    : selected.length === 1
      ? (tools.find(t => t.id === selected[0])?.name ?? selected[0])
      : `${selected.length} tools`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          open || selected.length > 0
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        <span className="font-medium">{label}</span>
        {selected.length > 0 && (
          <span className="min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold px-1">
            {selected.length}
          </span>
        )}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[180px] py-1 overflow-hidden">
          {/* Select all / clear */}
          <div className="flex gap-2 px-3 py-1.5 border-b border-gray-50">
            <button
              onClick={() => onChange(tools.map(t => t.id))}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium"
            >
              Select all
            </button>
            <span className="text-gray-200">·</span>
            <button
              onClick={() => onChange([])}
              className="text-[11px] text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>

          {tools.map(tool => {
            const c = toolColor(tool.id)
            const checked = selected.includes(tool.id)
            return (
              <button
                key={tool.id}
                onClick={() => toggle(tool.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? `${c.dot} border-transparent` : 'border-gray-300'
                }`}>
                  {checked && <Check size={10} className="text-white" />}
                </span>
                <span className="text-base shrink-0">{tool.icon}</span>
                <span className="text-sm text-gray-700 font-medium">{tool.name}</span>
                {tool.dev_phase && tool.dev_phase !== 'planning' && (
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>
                    {tool.dev_phase}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Selected tool pills ──────────────────────────────────────────────────────

function SelectedPills({ tools, selected, onRemove }) {
  if (!selected.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {selected.map(id => {
        const tool = tools.find(t => t.id === id)
        const c = toolColor(id)
        return (
          <span key={id} className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
            {tool?.icon} {tool?.name ?? id}
            <button onClick={() => onRemove(id)} className="hover:opacity-70 transition-opacity">
              <X size={10} />
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ─── Story card ───────────────────────────────────────────────────────────────

function StoryCard({ story }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="mt-0.5 text-gray-300 shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-mono text-gray-400">{story.storyId}</span>
            {story.tags.map(t => {
              const c = toolColor(t)
              return (
                <span key={t} className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
                  {t}
                </span>
              )
            })}
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">{story.title}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{story.sentence}</p>
        </div>
      </button>
      {open && story.criteria.length > 0 && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Acceptance criteria</p>
          <ul className="space-y-1.5">
            {story.criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoriesPage() {
  const [stories,      setStories]      = useState([])
  const [tools,        setTools]        = useState([])  // non-archived registered tools
  const [loading,      setLoading]      = useState(true)
  const [selectedTools, setSelectedTools] = useState([])
  const [search,       setSearch]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [data, discovered] = await Promise.all([
      window.api.getStories(),
      window.api.discoverTools(),
    ])
    setStories(data)
    // Only show tools that are actively being worked on (not archived)
    setTools(discovered.filter(t => t.dev_phase !== 'archived'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let result = stories
    // Multi-select: story passes if it has ANY selected tool in its tags
    if (selectedTools.length > 0) {
      result = result.filter(s => s.tags.some(t => selectedTools.includes(t)))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.sentence.toLowerCase().includes(q) ||
        s.section.toLowerCase().includes(q) ||
        s.tags.some(t => t.includes(q))
      )
    }
    return result
  }, [stories, selectedTools, search])

  const sections = useMemo(() => {
    const map = new Map()
    for (const s of filtered) {
      if (!map.has(s.section)) map.set(s.section, [])
      map.get(s.section).push(s)
    }
    return [...map.entries()]
  }, [filtered])

  const hasFilters = selectedTools.length > 0 || search.trim()

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <RefreshCw size={18} className="animate-spin mr-2" /> Loading stories…
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Stories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length !== stories.length
              ? `${filtered.length} of ${stories.length} stories`
              : `${stories.length} stories across all tools`}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ToolDropdown tools={tools} selected={selectedTools} onChange={setSelectedTools} />

        {/* Search */}
        <div className="flex-1 min-w-[160px] relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stories…"
            className="w-full pl-8 pr-7 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={() => { setSelectedTools([]); setSearch('') }}
            className="px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected tool pills */}
      <SelectedPills
        tools={tools}
        selected={selectedTools}
        onRemove={id => setSelectedTools(s => s.filter(x => x !== id))}
      />
      {selectedTools.length > 0 && <div className="mb-4" />}

      {/* Story list grouped by section */}
      {sections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={28} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No stories match</p>
          <button
            onClick={() => { setSelectedTools([]); setSearch('') }}
            className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8 mt-5">
          {sections.map(([section, sectionStories]) => (
            <div key={section}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{section}</h2>
              <div className="space-y-2">
                {sectionStories.map(story => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
