import React, { useEffect, useState, useMemo } from 'react'
import { Lightbulb, Trash2, Terminal, RefreshCw, Plus, Search, X } from 'lucide-react'

function IdeaCard({ idea, onPlan, onDelete, planning }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-900 leading-snug">{idea.title}</h3>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => onDelete(idea.id)}
              className="text-xs text-red-500 font-medium hover:text-red-700">
              Delete
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
            title="Delete idea">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 leading-relaxed flex-1">{idea.summary}</p>

      {idea.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {idea.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-500">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <span className="text-xs text-gray-400">
          {new Date(idea.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button
          onClick={() => onPlan(idea)}
          disabled={planning === idea.id}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          {planning === idea.id
            ? <RefreshCw size={12} className="animate-spin" />
            : <Terminal size={12} />}
          Plan this
        </button>
      </div>
    </div>
  )
}

export default function IdeasPage({ onNewIdea }) {
  const [ideas,   setIdeas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [planning, setPlanning] = useState(null)
  const [search,  setSearch]  = useState('')
  const [activeTag, setActiveTag] = useState(null)

  const load = async () => {
    setLoading(true)
    const data = await window.api.getIdeas()
    setIdeas(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Collect all unique tags across all ideas
  const allTags = useMemo(() => {
    const set = new Set()
    ideas.forEach(i => (i.tags ?? []).forEach(t => set.add(t)))
    return [...set].sort()
  }, [ideas])

  // Filtered list
  const filtered = useMemo(() => {
    let result = ideas
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        (i.tags ?? []).some(t => t.toLowerCase().includes(q))
      )
    }
    if (activeTag) {
      result = result.filter(i => (i.tags ?? []).includes(activeTag))
    }
    return result
  }, [ideas, search, activeTag])

  const handlePlan = async (idea) => {
    setPlanning(idea.id)
    await window.api.planIdea({ id: idea.id, title: idea.title, summary: idea.summary })
    setPlanning(null)
  }

  const handleDelete = async (id) => {
    await window.api.deleteIdea(id)
    setIdeas(prev => prev.filter(i => i.id !== id))
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <RefreshCw size={18} className="animate-spin mr-2" /> Loading ideas...
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ideas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length !== ideas.length
              ? `${filtered.length} of ${ideas.length} idea${ideas.length !== 1 ? 's' : ''}`
              : `${ideas.length} stored idea${ideas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={onNewIdea}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Plus size={15} />
          Store Idea
        </button>
      </div>

      {/* Search + tag filter */}
      {ideas.length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ideas…"
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(tag => (
                <button key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeTag === tag
                      ? 'bg-indigo-500 text-white'
                      : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
                  }`}>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        ideas.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Lightbulb size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No ideas yet</p>
            <p className="text-sm mt-1">Paste a note or drop a file to store your first idea</p>
            <button onClick={onNewIdea}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
              Store an idea
            </button>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <Search size={28} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">No ideas match</p>
            <button onClick={() => { setSearch(''); setActiveTag(null) }}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
              Clear filters
            </button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              planning={planning}
              onPlan={handlePlan}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
