import React, { useState, useRef } from 'react'
import { ArrowLeft, Loader, Check, X, Terminal, Lightbulb, Upload } from 'lucide-react'

// ─── Store flow ───────────────────────────────────────────────────────────────

function StoreFlow({ onBack, onSaved }) {
  const [step, setStep]       = useState('input')   // input | polishing | canvas | extracting | multi | done
  const [rawText, setRawText] = useState('')
  const [isDragging, setDragging] = useState(false)
  const [polished, setPolished]   = useState(null)   // { title, summary, tags }
  const [extracted, setExtracted] = useState([])     // multiple ideas from a file
  const [saved, setSaved]         = useState([])     // ids saved
  const [error, setError]         = useState(null)
  const fileRef = useRef()

  const loadFile = (file) => {
    const reader = new FileReader()
    reader.onload = e => setRawText(e.target.result)
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }

  // Single idea: polish
  const handlePolish = async () => {
    if (!rawText.trim()) return
    setError(null)
    setStep('polishing')
    const result = await window.api.polishIdea(rawText)
    if (!result.ok) { setError(result.error); setStep('input'); return }
    setPolished({ title: result.title, summary: result.summary, tags: result.tags ?? [] })
    setStep('canvas')
  }

  // Long text: extract multiple ideas
  const handleExtract = async () => {
    if (!rawText.trim()) return
    setError(null)
    setStep('extracting')
    const result = await window.api.extractIdeas(rawText)
    if (!result.ok) { setError(result.error); setStep('input'); return }
    setExtracted(result.ideas.map((idea, i) => ({ ...idea, _key: i, _include: true })))
    setStep('multi')
  }

  // Save single polished idea
  const handleSaveSingle = async () => {
    const result = await window.api.saveIdea({
      title: polished.title,
      summary: polished.summary,
      raw_text: rawText,
      tags: polished.tags,
      source: 'store',
    })
    if (result.ok) { onSaved?.(); setStep('done') }
    else setError(result.error)
  }

  // Save selected extracted ideas
  const handleSaveMulti = async () => {
    const toSave = extracted.filter(i => i._include)
    for (const idea of toSave) {
      await window.api.saveIdea({
        title: idea.title,
        summary: idea.summary,
        raw_text: idea.excerpt ?? rawText.slice(0, 500),
        tags: idea.tags ?? [],
        source: 'extract',
      })
    }
    onSaved?.()
    setStep('done')
  }

  const setTag = (val) => setPolished(p => ({ ...p, tags: val.split(',').map(t => t.trim()).filter(Boolean) }))

  if (step === 'done') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Idea{saved.length > 1 ? 's' : ''} stored!</h2>
          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => { setStep('input'); setRawText(''); setPolished(null); setExtracted([]) }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              Store another
            </button>
            <button onClick={onBack}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark">
              View Ideas
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'polishing' || step === 'extracting') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={28} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-gray-600 text-sm">
            {step === 'polishing' ? 'Polishing your idea...' : 'Extracting ideas from text...'}
          </p>
        </div>
      </div>
    )
  }

  if (step === 'canvas') {
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <button onClick={() => setStep('input')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ArrowLeft size={14} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Review & edit</h2>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Title</label>
            <input
              value={polished.title}
              onChange={e => setPolished(p => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Summary</label>
            <textarea
              value={polished.summary}
              onChange={e => setPolished(p => ({ ...p, summary: e.target.value }))}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tags (comma-separated)</label>
            <input
              value={polished.tags.join(', ')}
              onChange={e => setTag(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveSingle}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Check size={14} /> Save Idea
            </button>
            <button onClick={() => setStep('input')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
              Discard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'multi') {
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <button onClick={() => setStep('input')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ArrowLeft size={14} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Found {extracted.length} ideas</h2>
        <p className="text-sm text-gray-500 mb-4">Uncheck any you don't want to save.</p>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="space-y-3 mb-6">
          {extracted.map((idea, i) => (
            <div key={idea._key} className={`p-4 border rounded-xl transition-colors ${idea._include ? 'border-primary/30 bg-indigo-50/40' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={idea._include}
                  onChange={e => setExtracted(prev => prev.map((it, j) => j === i ? { ...it, _include: e.target.checked } : it))}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1">
                  <input
                    value={idea.title}
                    onChange={e => setExtracted(prev => prev.map((it, j) => j === i ? { ...it, title: e.target.value } : it))}
                    className="w-full font-medium text-sm text-gray-900 bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none mb-1"
                  />
                  <p className="text-xs text-gray-500 leading-relaxed">{idea.summary}</p>
                  {idea.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {idea.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded-full text-[10px] bg-white text-indigo-500 border border-indigo-100">{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={handleSaveMulti}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            <Check size={14} /> Save {extracted.filter(i => i._include).length} ideas
          </button>
          <button onClick={() => setStep('input')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            Discard
          </button>
        </div>
      </div>
    )
  }

  // Input step
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={14} /> Back
      </button>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Store an idea</h2>
      <p className="text-sm text-gray-500 mb-4">Paste a rough note, or drop a conversation file / Google Keep export.</p>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div
        className={`relative rounded-xl border-2 border-dashed transition-colors mb-4 ${
          isDragging ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <textarea
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          placeholder="Paste text here, or drag & drop a .txt / .json file..."
          rows={10}
          className="w-full px-4 py-3 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none resize-none"
        />
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-xl pointer-events-none">
            <div className="text-primary font-medium flex items-center gap-2">
              <Upload size={18} /> Drop file to load
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".txt,.json,.md" className="hidden"
        onChange={e => { if (e.target.files[0]) loadFile(e.target.files[0]) }} />
      <button onClick={() => fileRef.current.click()}
        className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 mb-5 block">
        Browse for file
      </button>

      <div className="flex gap-2">
        <button
          onClick={handlePolish}
          disabled={!rawText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Lightbulb size={14} /> Polish single idea
        </button>
        <button
          onClick={handleExtract}
          disabled={!rawText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Extract all ideas
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Use <b>Polish</b> for a single short note. Use <b>Extract all</b> for long conversation logs.
      </p>
    </div>
  )
}

// ─── Plan flow (unchanged logic, moved here) ──────────────────────────────────

function PlanFlow({ onBack }) {
  const [step, setStep]         = useState('describe')
  const [description, setDesc]  = useState('')
  const [toolName, setToolName] = useState('')
  const [plan, setPlan]         = useState('')
  const [error, setError]       = useState(null)
  const [scaffolded, setScaffolded] = useState(null)

  const handleSubmit = async () => {
    if (!description.trim()) return
    setStep('planning')
    setError(null)
    const result = await window.api.planTool(description)
    if (!result.ok) { setError(result.error); setStep('describe'); return }
    setToolName(description.trim().split(/\s+/).slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9-]/g, ''))
    setPlan(result.plan)
    setStep('review')
  }

  const handleApprove = async () => {
    setError(null)
    const scaffold = await window.api.scaffoldTool(toolName, plan)
    if (!scaffold.ok) { setError(scaffold.error); return }
    setScaffolded(scaffold.toolDir)
    await window.api.openClaudeCode(toolName, plan)
    setStep('done')
  }

  if (step === 'done') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Tool scaffolded!</h2>
          <p className="text-sm text-gray-500 mb-1">Created at <code className="bg-gray-100 px-1.5 rounded text-xs">{scaffolded}</code></p>
          <p className="text-sm text-gray-500 mb-5">Terminal opened with Claude Code pre-loaded.</p>
          <button onClick={onBack} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark">
            Back to Tools
          </button>
        </div>
      </div>
    )
  }

  if (step === 'planning') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={28} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Generating plan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={14} /> Back
      </button>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Plan a new tool</h2>
      <p className="text-sm text-gray-500 mb-5">Describe what you need — Claude will design the architecture.</p>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {step === 'describe' && (
        <div className="space-y-4">
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="e.g. A tool to track my daily habits and visualize streaks"
            rows={5}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
          />
          <button onClick={handleSubmit} disabled={!description.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed">
            Generate Plan
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tool name (slug)</label>
            <input
              value={toolName}
              onChange={e => setToolName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-xs text-gray-400 mt-1">Will create <code>/Users/ramcha1994/Admin/{toolName}/</code></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Implementation Plan</label>
            <textarea
              value={plan}
              onChange={e => setPlan(e.target.value)}
              rows={20}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleApprove} disabled={!toolName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40">
              <Terminal size={14} /> Approve & Open Claude Code
            </button>
            <button onClick={() => setStep('describe')}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
              <X size={14} /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Parent: mode picker ──────────────────────────────────────────────────────

export default function NewFlow({ onBack, onIdeaSaved, defaultMode }) {
  const [mode, setMode] = useState(defaultMode ?? null)

  if (mode === 'store') return <StoreFlow onBack={() => setMode(null)} onSaved={() => { onIdeaSaved?.(); setMode(null) }} />
  if (mode === 'plan')  return <PlanFlow  onBack={onBack} />

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm w-full">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8">
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="text-xl font-bold text-gray-900 mb-2">What do you want to do?</h1>
        <p className="text-sm text-gray-500 mb-6">Store captures and polishes an idea. Plan scaffolds a full new tool.</p>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMode('store')}
            className="flex flex-col items-center gap-3 p-5 border-2 border-gray-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
          >
            <Lightbulb size={28} className="text-indigo-400" />
            <div className="text-center">
              <p className="font-semibold text-gray-900 text-sm">Store</p>
              <p className="text-xs text-gray-500 mt-0.5">Capture & polish an idea</p>
            </div>
          </button>
          <button
            onClick={() => setMode('plan')}
            className="flex flex-col items-center gap-3 p-5 border-2 border-gray-100 rounded-xl hover:border-green-200 hover:bg-green-50/40 transition-colors"
          >
            <Terminal size={28} className="text-green-500" />
            <div className="text-center">
              <p className="font-semibold text-gray-900 text-sm">Plan</p>
              <p className="text-xs text-gray-500 mt-0.5">Scaffold a new tool</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
