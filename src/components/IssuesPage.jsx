import React, { useEffect, useState, useCallback } from 'react'
import { Bug, Sparkles, Play, Check, Trash2, ChevronDown, ChevronRight, RefreshCw, X, Pencil } from 'lucide-react'

const TYPE_META = {
  bug:     { label: 'Bug',     icon: Bug,      bg: 'bg-red-50',     text: 'text-red-600',    border: 'border-red-200'    },
  feature: { label: 'Feature', icon: Sparkles, bg: 'bg-violet-50',  text: 'text-violet-600', border: 'border-violet-200' },
}

function IssueRow({ issue, tools, onUpdate, onDelete, onStart }) {
  const [expanded, setExpanded] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [title, setTitle]       = useState(issue.title)
  const [desc,  setDesc]        = useState(issue.description ?? '')
  const [saving, setSaving]     = useState(false)

  const meta = TYPE_META[issue.type] ?? TYPE_META.bug
  const Icon = meta.icon
  const tool = tools.find(t => t.id === issue.tool_id)
  const isDone = issue.status === 'done'

  const handleSaveEdit = async () => {
    setSaving(true)
    await onUpdate({ id: issue.id, title: title.trim(), description: desc.trim() })
    setSaving(false)
    setEditing(false)
  }

  const handleToggleDone = () => onUpdate({ id: issue.id, status: isDone ? 'open' : 'done' })

  return (
    <div className={`rounded-xl border transition-opacity ${isDone ? 'opacity-50' : ''} ${meta.border} bg-white overflow-hidden`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Done toggle */}
        <button
          onClick={handleToggleDone}
          className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            isDone ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
          }`}
          title={isDone ? 'Reopen' : 'Mark done'}
        >
          {isDone && <Check size={10} className="text-white" />}
        </button>

        {/* Type icon */}
        <Icon size={13} className={`mt-0.5 shrink-0 ${meta.text}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={2}
                placeholder="Notes (optional)"
                className="w-full px-2 py-1 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} disabled={saving || !title.trim()}
                  className="px-2 py-1 bg-primary text-white rounded text-xs disabled:opacity-50">
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setTitle(issue.title); setDesc(issue.description ?? '') }}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {issue.title}
                </span>
                {tool && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                    {tool.icon} {tool.name}
                  </span>
                )}
              </div>
              {issue.description && !expanded && (
                <button onClick={() => setExpanded(true)} className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 mt-0.5">
                  <ChevronRight size={11} /> notes
                </button>
              )}
              {issue.description && expanded && (
                <div className="mt-1">
                  <button onClick={() => setExpanded(false)} className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 mb-1">
                    <ChevronDown size={11} /> notes
                  </button>
                  <p className="text-xs text-gray-500 whitespace-pre-wrap">{issue.description}</p>
                </div>
              )}
              <p className="text-[10px] text-gray-300 mt-1">
                {new Date(issue.created_at).toLocaleDateString()}
                {isDone && issue.resolved_at && ` · resolved ${new Date(issue.resolved_at).toLocaleDateString()}`}
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {!isDone && (
              <button
                onClick={() => onStart(issue.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                title="Start a focused Claude session for this issue"
              >
                <Play size={11} /> Fix it
              </button>
            )}
            <button onClick={() => setEditing(true)} className="p-1 text-gray-300 hover:text-gray-500 transition-colors">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(issue.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Quick-add form (inline at top of list)
function QuickAdd({ tools, defaultTool, onSave, onClose }) {
  const [type,    setType]    = useState('bug')
  const [toolId,  setToolId]  = useState(defaultTool ?? tools[0]?.id ?? '')
  const [title,   setTitle]   = useState('')
  const [desc,    setDesc]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const handleSave = async () => {
    const t = title.trim()
    if (!t || !toolId) return
    setSaving(true)
    await onSave({ tool_id: toolId, type, title: t, description: desc.trim() })
    setSaving(false)
    onClose()
  }

  return (
    <div className="bg-white border border-primary/30 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">New issue</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>

      {/* Type */}
      <div className="flex gap-2">
        {Object.entries(TYPE_META).map(([k, m]) => {
          const Icon = m.icon
          return (
            <button key={k} onClick={() => setType(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                type === k ? `${m.bg} ${m.text} ${m.border}` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              <Icon size={11} /> {m.label}
            </button>
          )
        })}
        <select value={toolId} onChange={e => setToolId(e.target.value)}
          className="ml-auto px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
          {tools.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>
      </div>

      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() } }}
        placeholder={type === 'bug' ? 'What broke?' : 'What should it do?'}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={2}
        placeholder="Optional notes, steps to reproduce, context…"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        <button onClick={handleSave} disabled={!title.trim() || !toolId || saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-primary-dark transition-colors">
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save
        </button>
      </div>
    </div>
  )
}

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all',  label: 'All'  },
]

export default function IssuesPage({ onCountChange }) {
  const [issues,   setIssues]   = useState([])
  const [tools,    setTools]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [toolFilter, setToolFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  const [adding,   setAdding]   = useState(false)

  const notifyCount = useCallback((list) => {
    onCountChange?.(list.filter(i => i.status === 'open').length)
  }, [onCountChange])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [all, discovered] = await Promise.all([
        window.api.getIssues(),
        window.api.discoverTools(),
      ])
      setIssues(all)
      setTools(discovered)
      notifyCount(all)
    } finally {
      setLoading(false)
    }
  }, [notifyCount])

  useEffect(() => { load() }, [load])

  const handleSave = async (data) => {
    const saved = await window.api.saveIssue(data)
    setIssues(prev => { const next = [saved, ...prev]; notifyCount(next); return next })
  }

  const handleUpdate = async (data) => {
    const updated = await window.api.updateIssue(data)
    setIssues(prev => { const next = prev.map(i => i.id === updated.id ? updated : i); notifyCount(next); return next })
  }

  const handleDelete = async (id) => {
    await window.api.deleteIssue(id)
    setIssues(prev => { const next = prev.filter(i => i.id !== id); notifyCount(next); return next })
  }

  const handleStart = async (id) => {
    await window.api.startIssueSession(id)
  }

  const filtered = issues.filter(i => {
    if (toolFilter !== 'all' && i.tool_id !== toolFilter) return false
    if (typeFilter !== 'all' && i.type !== typeFilter) return false
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    return true
  })

  const openCount = issues.filter(i => i.status === 'open').length
  const bugCount  = issues.filter(i => i.status === 'open' && i.type === 'bug').length
  const featCount = issues.filter(i => i.status === 'open' && i.type === 'feature').length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Issues</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {openCount > 0
              ? `${bugCount} bug${bugCount !== 1 ? 's' : ''} · ${featCount} feature request${featCount !== 1 ? 's' : ''} open`
              : 'No open issues'}
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          + New Issue
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Status */}
        <div className="flex gap-1">
          {STATUSES.map(s => (
            <button key={s.id} onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="w-px bg-gray-200 mx-1" />

        {/* Type */}
        <div className="flex gap-1">
          {[{ id: 'all', label: 'All types' }, { id: 'bug', label: '🐛 Bugs' }, { id: 'feature', label: '✨ Features' }].map(t => (
            <button key={t.id} onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-px bg-gray-200 mx-1" />

        {/* Tool */}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setToolFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              toolFilter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            All tools
          </button>
          {tools.map(t => (
            <button key={t.id} onClick={() => setToolFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                toolFilter === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Quick-add form */}
      {adding && (
        <div className="mb-4">
          <QuickAdd tools={tools} onSave={handleSave} onClose={() => setAdding(false)} />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">{statusFilter === 'done' ? '✅' : '🎯'}</p>
          <p className="font-medium">{statusFilter === 'done' ? 'Nothing resolved yet' : 'No open issues — nice!'}</p>
          {statusFilter === 'open' && (
            <button onClick={() => setAdding(true)} className="mt-2 text-sm text-primary hover:underline">
              Add one
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              tools={tools}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onStart={handleStart}
            />
          ))}
        </div>
      )}
    </div>
  )
}
