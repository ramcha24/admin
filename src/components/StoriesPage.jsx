import React, { useEffect, useState, useMemo } from 'react'
import { BookOpen, RefreshCw, ChevronDown, ChevronRight, Search, X } from 'lucide-react'

const TOOL_COLORS = {
  admin:   { bg: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'ring-indigo-200',  dot: 'bg-indigo-500'  },
  grove:   { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
  think:   { bg: 'bg-violet-50',  text: 'text-violet-600',  ring: 'ring-violet-200',  dot: 'bg-violet-500'  },
  village: { bg: 'bg-sky-50',     text: 'text-sky-600',     ring: 'ring-sky-200',     dot: 'bg-sky-500'     },
}
const DEFAULT_COLOR = { bg: 'bg-gray-50', text: 'text-gray-500', ring: 'ring-gray-200', dot: 'bg-gray-400' }

function TagPill({ tag, active, onClick }) {
  const c = TOOL_COLORS[tag] ?? DEFAULT_COLOR
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ring-1 ${
        active
          ? `${c.dot} text-white ring-transparent`
          : `${c.bg} ${c.text} ${c.ring} hover:opacity-80`
      }`}
    >
      {tag}
    </button>
  )
}

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
              const c = TOOL_COLORS[t] ?? DEFAULT_COLOR
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

export default function StoriesPage() {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTag, setActiveTag] = useState(null)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    window.api.getStories().then(data => {
      setStories(data)
      setLoading(false)
    })
  }, [])

  // All unique tags across all stories
  const allTags = useMemo(() => {
    const set = new Set()
    stories.forEach(s => s.tags.forEach(t => set.add(t)))
    return [...set].sort()
  }, [stories])

  const filtered = useMemo(() => {
    let result = stories
    if (activeTag) result = result.filter(s => s.tags.includes(activeTag))
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
  }, [stories, activeTag, search])

  // Group filtered stories by section
  const sections = useMemo(() => {
    const map = new Map()
    for (const s of filtered) {
      if (!map.has(s.section)) map.set(s.section, [])
      map.get(s.section).push(s)
    }
    return [...map.entries()]
  }, [filtered])

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
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">User Stories</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {filtered.length !== stories.length
            ? `${filtered.length} of ${stories.length} stories`
            : `${stories.length} stories across all tools`}
        </p>
      </div>

      {/* Search */}
      <div className="mb-3 relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search stories…"
          className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tag filters */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {allTags.map(tag => (
          <TagPill
            key={tag}
            tag={tag}
            active={activeTag === tag}
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
          />
        ))}
        {(activeTag || search) && (
          <button
            onClick={() => { setActiveTag(null); setSearch('') }}
            className="px-2.5 py-1 rounded-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Story list grouped by section */}
      {sections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={28} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No stories match</p>
          <button
            onClick={() => { setActiveTag(null); setSearch('') }}
            className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
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
