import React, { useEffect, useState } from 'react'
import { Lightbulb, Trash2, Terminal, RefreshCw, Plus } from 'lucide-react'

function IdeaCard({ idea, onPlan, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-900 leading-snug">{idea.title}</h3>
        <button
          onClick={() => onDelete(idea.id)}
          className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
          title="Delete idea"
        >
          <Trash2 size={14} />
        </button>
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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-colors"
        >
          <Terminal size={12} />
          Plan this
        </button>
      </div>
    </div>
  )
}

export default function IdeasPage({ onNewIdea }) {
  const [ideas, setIdeas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [planning, setPlanning] = useState(null)

  const load = async () => {
    setLoading(true)
    const data = await window.api.getIdeas()
    setIdeas(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ideas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{ideas.length} stored idea{ideas.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={onNewIdea}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Plus size={15} />
          Store Idea
        </button>
      </div>

      {ideas.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Lightbulb size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No ideas yet</p>
          <p className="text-sm mt-1">Paste a note or drop a file to store your first idea</p>
          <button
            onClick={onNewIdea}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Store an idea
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onPlan={handlePlan}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
