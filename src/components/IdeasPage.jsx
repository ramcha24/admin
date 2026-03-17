import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  Lightbulb, Trash2, Terminal, RefreshCw, Plus, Search, X,
  Pencil, Check, ArrowLeft, Loader, Upload, Merge, Paperclip, ExternalLink, Bug,
} from 'lucide-react'

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ idea, onSave, onClose }) {
  const [title,    setTitle]    = useState(idea.title)
  const [summary,  setSummary]  = useState(idea.summary)
  const [tagInput, setTagInput] = useState('')
  const [tags,     setTags]     = useState(idea.tags ?? [])
  const [saving,   setSaving]   = useState(false)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ id: idea.id, title: title.trim(), summary: summary.trim(), tags })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Edit Idea</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
          <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Summary</label>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-500">
                {t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:text-indigo-700"><X size={10} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Add tag…"
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <button onClick={addTag} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Add</button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Issue modal ───────────────────────────────────────────────────────

function CreateIssueModal({ idea, tools, onClose }) {
  const [toolId,   setToolId]   = useState(tools[0]?.id ?? '')
  const [type,     setType]     = useState('feature')
  const [title,    setTitle]    = useState(idea.title)
  const [desc,     setDesc]     = useState(idea.summary)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  const handleSave = async () => {
    if (!toolId || !title.trim()) return
    setSaving(true)
    await window.api.saveIssue({ tool_id: toolId, type, title: title.trim(), description: desc.trim() })
    setSaving(false)
    setSaved(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bug size={15} className="text-orange-500" /> Create Issue from Idea
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tool</label>
            <select value={toolId} onChange={e => setToolId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              {tools.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="feature">Feature</option>
              <option value="bug">Bug</option>
              <option value="improvement">Improvement</option>
              <option value="question">Question</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving || saved || !toolId || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {saved
              ? <><Check size={13} className="text-green-300" /> Created!</>
              : saving
                ? <><RefreshCw size={13} className="animate-spin" /> Creating…</>
                : <><Bug size={13} /> Create Issue</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Idea card ────────────────────────────────────────────────────────────────

function truncateSummary(text, maxLen = 100) {
  if (!text) return ''
  const dot = text.indexOf('.')
  const short = dot > 0 && dot < maxLen ? text.slice(0, dot + 1) : text.slice(0, maxLen)
  return short.length < text.length ? short : text
}

function IdeaCard({ idea, onPlan, onDelete, onEdit, onCreateIssue, planning }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const summary = idea.summary ?? ''
  const truncated = truncateSummary(summary)
  const isTruncated = truncated.length < summary.length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-900 leading-snug">{idea.title}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {confirmDelete ? (
            <>
              <button onClick={() => onDelete(idea.id)} className="text-xs text-red-500 font-medium hover:text-red-700">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => onCreateIssue(idea)} className="text-gray-300 hover:text-orange-400 transition-colors mt-0.5" title="Create issue from idea">
                <Bug size={13} />
              </button>
              <button onClick={() => onEdit(idea)} className="text-gray-300 hover:text-indigo-400 transition-colors mt-0.5" title="Edit idea">
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 transition-colors mt-0.5" title="Delete idea">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500 leading-relaxed flex-1">
        {expanded ? summary : truncated}
        {isTruncated && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-primary/70 ml-1 text-xs hover:text-primary">more →</button>
        )}
        {expanded && (
          <button onClick={() => setExpanded(false)} className="text-gray-300 ml-1 text-xs hover:text-gray-500">less</button>
        )}
      </p>

      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {new Date(idea.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {idea.source_filename && (
            <button
              onClick={() => idea.attached_file_path && window.api.openIdeaFile(idea.attached_file_path)}
              title={`Open ${idea.source_filename}`}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-[10px] transition-colors"
            >
              <Paperclip size={9} />
              <span className="max-w-[100px] truncate">{idea.source_filename}</span>
              <ExternalLink size={9} />
            </button>
          )}
        </div>
        <button onClick={() => onPlan(idea)} disabled={planning === idea.id}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
          {planning === idea.id ? <RefreshCw size={12} className="animate-spin" /> : <Terminal size={12} />}
          Plan this
        </button>
      </div>
    </div>
  )
}

// ─── Store flow (inline) ──────────────────────────────────────────────────────

function StoreFlow({ onBack, onSaved }) {
  const [step, setStep]           = useState('input')
  const [rawText, setRawText]     = useState('')
  const [isDragging, setDragging] = useState(false)
  const [polished, setPolished]   = useState(null)
  const [extracted, setExtracted] = useState([])
  const [mergePanel, setMergePanel] = useState(null)
  const [error, setError]         = useState(null)
  const [attachedFile, setAttachedFile] = useState(null) // { filename, dataBase64 }
  const fileRef = useRef()

  const loadFile = (file) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]
      const fileData = { filename: file.name, dataBase64: base64, mimeType: file.type || '' }
      setAttachedFile(fileData)
      setError(null)
      setStep('extracting')
      const result = await window.api.ingestIdeaFile(fileData)
      if (!result.ok) { setError(result.error); setStep('input'); return }
      const ideas = result.ideas ?? []
      if (ideas.length === 1) {
        setPolished({ title: ideas[0].title, summary: ideas[0].summary, tags: ideas[0].tags ?? [] })
        setStep('canvas')
      } else {
        setExtracted(ideas.map((idea, i) => ({ ...idea, _key: i, _include: true, _mergeSelect: false })))
        setStep('multi')
      }
    }
    reader.readAsDataURL(file)
  }

  const saveAttachment = async () => {
    if (!attachedFile) return { source_filename: '', attached_file_path: '' }
    const result = await window.api.saveIdeaFile(attachedFile)
    return result.ok
      ? { source_filename: attachedFile.filename, attached_file_path: result.path }
      : { source_filename: attachedFile.filename, attached_file_path: '' }
  }

  const handlePolish = async () => {
    if (!rawText.trim()) return
    setError(null); setStep('polishing')
    const result = await window.api.polishIdea(rawText)
    if (!result.ok) { setError(result.error); setStep('input'); return }
    setPolished({ title: result.title, summary: result.summary, tags: result.tags ?? [] })
    setStep('canvas')
  }

  const handleExtract = async () => {
    if (!rawText.trim()) return
    setError(null); setStep('extracting')
    const result = await window.api.extractIdeas(rawText)
    if (!result.ok) { setError(result.error); setStep('input'); return }
    setExtracted(result.ideas.map((idea, i) => ({ ...idea, _key: i, _include: true, _mergeSelect: false })))
    setStep('multi')
  }

  const handleSaveSingle = async () => {
    const fileFields = await saveAttachment()
    const source = attachedFile ? 'file' : 'store'
    await window.api.saveIdea({ title: polished.title, summary: polished.summary, raw_text: rawText, tags: polished.tags, source, ...fileFields })
    onSaved()
  }

  const handleSaveMulti = async () => {
    const fileFields = await saveAttachment()
    const source = attachedFile ? 'file' : 'extract'
    for (const idea of extracted.filter(i => i._include)) {
      await window.api.saveIdea({ title: idea.title, summary: idea.summary, raw_text: idea.excerpt ?? '', tags: idea.tags ?? [], source, ...fileFields })
    }
    onSaved()
  }

  if (step === 'polishing' || step === 'extracting') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader size={28} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-gray-600 text-sm">{step === 'polishing' ? 'Polishing your idea…' : attachedFile ? `Reading ${attachedFile.filename}…` : 'Extracting ideas from text…'}</p>
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
            <input value={polished.title} onChange={e => setPolished(p => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Summary</label>
            <textarea value={polished.summary} onChange={e => setPolished(p => ({ ...p, summary: e.target.value }))} rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tags (comma-separated)</label>
            <input value={polished.tags.join(', ')}
              onChange={e => setPolished(p => ({ ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveSingle}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Check size={14} /> Save Idea
            </button>
            <button onClick={() => setStep('input')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Discard</button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'multi') {
    const mergeCount = extracted.filter(i => i._mergeSelect).length
    const mergeSelected = () => {
      const toMerge = extracted.filter(i => i._mergeSelect)
      setMergePanel({
        title: toMerge[0].title,
        summary: toMerge.map(i => i.summary).join('\n\n'),
        tags: [...new Set(toMerge.flatMap(i => i.tags ?? []))],
      })
    }
    const confirmMerge = () => {
      const keys = new Set(extracted.filter(i => i._mergeSelect).map(i => i._key))
      const merged = { ...mergePanel, _key: Date.now(), _include: true, _mergeSelect: false }
      setExtracted(prev => [merged, ...prev.filter(i => !keys.has(i._key))])
      setMergePanel(null)
    }

    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto flex-1 min-h-0 p-6 max-w-2xl mx-auto w-full">
          <button onClick={() => { setStep('input'); setMergePanel(null) }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={14} /> Back
          </button>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Found {extracted.length} ideas</h2>
          <p className="text-sm text-gray-500 mb-4">
            Uncheck any you don't want to save. Check the <Merge size={11} className="inline mx-0.5" /> column on two or more to merge them.
          </p>
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

          {/* Merge panel */}
          {mergePanel && (
            <div className="mb-4 p-4 border-2 border-indigo-300 rounded-xl bg-indigo-50/60">
              <p className="text-xs font-semibold text-indigo-600 mb-3 flex items-center gap-1.5">
                <Merge size={13} /> Merged idea — edit before saving
              </p>
              <input value={mergePanel.title} onChange={e => setMergePanel(p => ({ ...p, title: e.target.value }))}
                placeholder="Title"
                className="w-full font-medium text-sm text-gray-900 px-3 py-1.5 border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-2" />
              <textarea value={mergePanel.summary} onChange={e => setMergePanel(p => ({ ...p, summary: e.target.value }))}
                rows={4} placeholder="Summary"
                className="w-full text-xs text-gray-700 px-3 py-1.5 border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none mb-2" />
              <div className="flex gap-2">
                <button onClick={confirmMerge}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                  <Check size={12} /> Confirm merge
                </button>
                <button onClick={() => setMergePanel(null)}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3 mb-6">
            {extracted.map((idea, i) => (
              <div key={idea._key} className={`p-4 border rounded-xl transition-colors ${idea._include ? 'border-primary/30 bg-indigo-50/40' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-start gap-3">
                  {/* Include checkbox */}
                  <div className="flex flex-col items-center gap-2 pt-0.5 shrink-0">
                    <input type="checkbox" checked={idea._include}
                      onChange={e => setExtracted(prev => prev.map((it, j) => j === i ? { ...it, _include: e.target.checked } : it))}
                      className="accent-primary" title="Include in save" />
                    {/* Merge checkbox */}
                    <input type="checkbox" checked={idea._mergeSelect}
                      onChange={e => setExtracted(prev => prev.map((it, j) => j === i ? { ...it, _mergeSelect: e.target.checked } : it))}
                      className="accent-indigo-400" title="Select to merge" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input value={idea.title}
                      onChange={e => setExtracted(prev => prev.map((it, j) => j === i ? { ...it, title: e.target.value } : it))}
                      className="w-full font-medium text-sm text-gray-900 bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none mb-1" />
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

          <div className="flex flex-wrap gap-2 pb-2">
            {mergeCount >= 2 && !mergePanel && (
              <button onClick={mergeSelected}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                <Merge size={14} /> Merge {mergeCount} ideas
              </button>
            )}
            <button onClick={handleSaveMulti}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Check size={14} /> Save {extracted.filter(i => i._include).length} ideas
            </button>
            <button onClick={() => { setStep('input'); setMergePanel(null) }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
              Discard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Input step
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={14} /> Back to Ideas
      </button>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Store an idea</h2>
      <p className="text-sm text-gray-500 mb-4">Paste a rough note, or drop a file — the original will be saved alongside the idea.</p>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div
        className={`relative rounded-xl border-2 border-dashed transition-colors mb-3 ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f) }}
      >
        <textarea value={rawText} onChange={e => setRawText(e.target.value)}
          placeholder="Paste text here, or drag & drop a .txt / .md / .pdf / .json file…"
          rows={10}
          className="w-full px-4 py-3 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none resize-none" />
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-xl pointer-events-none">
            <div className="text-primary font-medium flex items-center gap-2"><Upload size={18} /> Drop file to load</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input ref={fileRef} type="file" accept=".txt,.json,.md,.pdf,.docx,.csv" className="hidden"
          onChange={e => { if (e.target.files[0]) loadFile(e.target.files[0]) }} />
        <button onClick={() => fileRef.current.click()} className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
          Browse for file
        </button>
        {attachedFile && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-500 text-xs font-medium">
            <Paperclip size={10} /> {attachedFile.filename}
            <button onClick={() => setAttachedFile(null)} className="ml-1 hover:text-indigo-700"><X size={10} /></button>
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={handlePolish} disabled={!rawText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed">
          <Lightbulb size={14} /> Polish single idea
        </button>
        <button onClick={handleExtract} disabled={!rawText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed">
          Extract all ideas
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Use <b>Polish</b> for a single short note. Use <b>Extract all</b> for long conversation logs.
      </p>
    </div>
  )
}

// ─── Ideas page ───────────────────────────────────────────────────────────────

export default function IdeasPage() {
  const [ideas,        setIdeas]        = useState([])
  const [tools,        setTools]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [planning,     setPlanning]     = useState(null)
  const [search,       setSearch]       = useState('')
  const [editing,      setEditing]      = useState(null)
  const [storing,      setStoring]      = useState(false)
  const [issuingIdea,  setIssuingIdea]  = useState(null)

  const load = async () => {
    setLoading(true)
    const [allIdeas, discovered] = await Promise.all([
      window.api.getIdeas(),
      window.api.discoverTools(),
    ])
    setIdeas(allIdeas)
    setTools(discovered)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return ideas
    const q = search.toLowerCase()
    return ideas.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.summary.toLowerCase().includes(q) ||
      (i.tags ?? []).some(t => t.toLowerCase().includes(q))
    )
  }, [ideas, search])

  const handlePlan = async (idea) => {
    setPlanning(idea.id)
    await window.api.planIdea({ id: idea.id, title: idea.title, summary: idea.summary })
    setPlanning(null)
  }

  const handleDelete = async (id) => {
    await window.api.deleteIdea(id)
    setIdeas(prev => prev.filter(i => i.id !== id))
  }

  const handleSaveEdit = async (updated) => {
    await window.api.updateIdea(updated)
    setIdeas(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
  }

  const handleStored = () => {
    setStoring(false)
    load()
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <RefreshCw size={18} className="animate-spin mr-2" /> Loading ideas...
      </div>
    )
  }

  // Store flow takes over the full content area
  if (storing) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <StoreFlow onBack={() => setStoring(false)} onSaved={handleStored} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {editing && (
        <EditModal idea={editing} onSave={handleSaveEdit} onClose={() => setEditing(null)} />
      )}
      {issuingIdea && tools.length > 0 && (
        <CreateIssueModal idea={issuingIdea} tools={tools} onClose={() => setIssuingIdea(null)} />
      )}

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
        <button onClick={() => setStoring(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
          <Plus size={15} /> Store Idea
        </button>
      </div>

      {/* Search + tag filter */}
      {ideas.length > 0 && (
        <div className="mb-5 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ideas…"
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        ideas.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Lightbulb size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No ideas yet</p>
            <p className="text-sm mt-1">Click Store Idea to capture your first one</p>
            <button onClick={() => setStoring(true)}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
              Store an idea
            </button>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <Search size={28} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">No ideas match</p>
            <button onClick={() => setSearch('')}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
              Clear filters
            </button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(idea => (
            <IdeaCard key={idea.id} idea={idea} planning={planning}
              onPlan={handlePlan} onDelete={handleDelete} onEdit={setEditing}
              onCreateIssue={setIssuingIdea} />
          ))}
        </div>
      )}
    </div>
  )
}
