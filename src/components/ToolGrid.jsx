import React, { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Plus, X, Check } from 'lucide-react'
import ToolCard from './ToolCard'

const PHASES = ['planning', 'building', 'stable', 'archived']
const PHASE_LABELS = { planning: 'Planning', building: 'Building', stable: 'Stable', archived: 'Archived' }

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'building',   label: 'In Development' },
  { id: 'stable',     label: 'Stable' },
  { id: 'planning',   label: 'Planning' },
  { id: 'archived',   label: 'Archived' },
]

// ─── Dev info edit modal ──────────────────────────────────────────────────────

function EditDevModal({ tool, onSave, onClose }) {
  const [phase,   setPhase]   = useState(tool.dev_phase ?? 'planning')
  const [summary, setSummary] = useState(tool.dev_summary ?? '')
  const [steps,   setSteps]   = useState(tool.next_steps ?? [])
  const [stableTag, setStableTag] = useState(tool.stable_tag ?? '')
  const [stepInput, setStepInput] = useState('')
  const [saving, setSaving]   = useState(false)
  const stepRef = useRef()

  const addStep = () => {
    const s = stepInput.trim()
    if (s) { setSteps(prev => [...prev, s]); setStepInput('') }
  }

  const removeStep = (i) => setSteps(prev => prev.filter((_, j) => j !== i))

  const moveStep = (i, dir) => {
    const next = [...steps]
    const swap = i + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[i], next[swap]] = [next[swap], next[i]]
    setSteps(next)
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave({ id: tool.id, dev_phase: phase, dev_summary: summary, next_steps: steps, stable_tag: stableTag || null })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{tool.icon}</span>
            <h2 className="font-semibold text-gray-900">{tool.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {/* Phase */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Development phase</label>
            <div className="flex gap-2 flex-wrap">
              {PHASES.map(p => (
                <button key={p} onClick={() => setPhase(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    phase === p
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Stable tag */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stable release tag</label>
            <input value={stableTag} onChange={e => setStableTag(e.target.value)}
              placeholder="e.g. v1.0.0  (auto-detected from git if blank)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">What's been built</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4}
              placeholder="Summarise what's implemented so far…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Next steps */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Next concrete steps</label>
            <ul className="space-y-1.5 mb-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="flex-1">{s}</span>
                  <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-1">↑</button>
                  <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-1">↓</button>
                  <button onClick={() => removeStep(i)} className="text-gray-300 hover:text-red-400"><X size={12} /></button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input ref={stepRef} value={stepInput} onChange={e => setStepInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep() } }}
                placeholder="Add next step…"
                className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={addStep} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Add</button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tool grid ────────────────────────────────────────────────────────────────

export default function ToolGrid({ onNewTool }) {
  const [tools,    setTools]    = useState([])
  const [status,   setStatus]   = useState({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [filter,   setFilter]   = useState('all')
  const [editing,  setEditing]  = useState(null)

  const discover = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const found = await window.api.discoverTools()
      setTools(found)
      const s = await window.api.getToolStatus()
      setStatus(s)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    discover()
    const interval = setInterval(async () => {
      try { setStatus(await window.api.getToolStatus()) } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [discover])

  const handleLaunch = async (id) => {
    await window.api.launchTool(id)
    setTimeout(async () => setStatus(await window.api.getToolStatus()), 1000)
  }

  const handleStop = async (id) => {
    await window.api.stopTool(id)
    setTimeout(async () => setStatus(await window.api.getToolStatus()), 500)
  }

  const handleResume = async (id) => {
    await window.api.resumeTool(id)
  }

  const handleSaveDevInfo = async (data) => {
    await window.api.updateToolDevInfo(data)
    setTools(prev => prev.map(t => t.id === data.id ? {
      ...t,
      dev_phase:   data.dev_phase,
      dev_summary: data.dev_summary,
      next_steps:  data.next_steps,
      stable_tag:  data.stable_tag,
    } : t))
  }

  const filtered = filter === 'all' ? tools : tools.filter(t => t.dev_phase === filter)

  // Count per phase for filter badges
  const counts = tools.reduce((acc, t) => {
    acc[t.dev_phase] = (acc[t.dev_phase] ?? 0) + 1
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" />Discovering tools...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error: {error}</p>
          <button onClick={discover} className="text-sm text-primary hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {editing && (
        <EditDevModal
          tool={editing}
          onSave={handleSaveDevInfo}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tools</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length !== tools.length
              ? `${filtered.length} of ${tools.length} tools`
              : `${tools.length} tool${tools.length !== 1 ? 's' : ''} discovered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={discover} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={onNewTool}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
            <Plus size={15} /> New Tool
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {FILTERS.map(f => {
          const count = f.id === 'all' ? tools.length : (counts[f.id] ?? 0)
          const active = filter === f.id
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {f.label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-white text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">No tools in this filter</p>
          <button onClick={() => setFilter('all')} className="mt-2 text-sm text-primary hover:underline">Show all</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(tool => (
            <ToolCard
              key={tool.id}
              tool={tool}
              status={status[tool.id] ?? 'stopped'}
              onLaunch={() => handleLaunch(tool.id)}
              onStop={() => handleStop(tool.id)}
              onResume={handleResume}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}
    </div>
  )
}
