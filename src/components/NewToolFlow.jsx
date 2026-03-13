import React, { useState } from 'react'
import { ArrowLeft, Loader, Check, X, Edit3, Terminal } from 'lucide-react'

const STEPS = ['describe', 'planning', 'review', 'done']

export default function NewToolFlow({ onBack }) {
  const [step, setStep]         = useState('describe')
  const [description, setDesc]  = useState('')
  const [toolName, setToolName] = useState('')
  const [plan, setPlan]         = useState('')
  const [error, setError]       = useState(null)
  const [scaffolded, setScaffolded] = useState(null)

  // Step 1 → Step 2: generate plan
  const handleSubmit = async () => {
    if (!description.trim()) return
    setStep('planning')
    setError(null)

    const result = await window.api.planTool(description)
    if (!result.ok) {
      setError(result.error)
      setStep('describe')
      return
    }

    // Extract a suggested name from the description (first 2-3 words)
    const suggestedName = description.trim().split(/\s+/).slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
    setToolName(suggestedName)
    setPlan(result.plan)
    setStep('review')
  }

  // Step 3 → Approve: scaffold + open Terminal
  const handleApprove = async () => {
    setError(null)
    const scaffold = await window.api.scaffoldTool(toolName, plan)
    if (!scaffold.ok) {
      setError(scaffold.error)
      return
    }
    setScaffolded(scaffold.toolDir)

    await window.api.openClaudeCode(toolName, plan)
    setStep('done')
  }

  // Reject → back to describe
  const handleReject = () => {
    setStep('describe')
    setPlan('')
  }

  if (step === 'done') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Tool scaffolded!</h2>
          <p className="text-gray-500 text-sm mb-1">
            Created at: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{scaffolded}</code>
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Terminal has opened with Claude Code pre-loaded. Start building!
          </p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Back to Tools
          </button>
        </div>
      </div>
    )
  }

  if (step === 'planning') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Loader size={32} className="animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900">Generating plan...</h2>
          <p className="text-gray-500 text-sm mt-1">Claude is designing your tool architecture</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        Back to Tools
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">New Tool</h1>
      <p className="text-sm text-gray-500 mb-6">
        Describe what you need — Claude will design the architecture and scaffold the code.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {step === 'describe' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              What do you need?
            </label>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="e.g. A tool to track my daily habits and visualize streaks over time"
              rows={5}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
              }}
            />
            <p className="text-xs text-gray-400 mt-1">Cmd+Enter to submit</p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!description.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate Plan
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-5">
          {/* Tool name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tool name (slug)
            </label>
            <input
              type="text"
              value={toolName}
              onChange={e => setToolName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <p className="text-xs text-gray-400 mt-1">
              Will create <code>/Users/ramcha1994/Admin/{toolName}/</code>
            </p>
          </div>

          {/* Plan */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Implementation Plan</label>
              <span className="text-xs text-gray-400">Edit if needed</span>
            </div>
            <textarea
              value={plan}
              onChange={e => setPlan(e.target.value)}
              rows={20}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleApprove}
              disabled={!toolName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Terminal size={14} />
              Approve & Open Claude Code
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <X size={14} />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
