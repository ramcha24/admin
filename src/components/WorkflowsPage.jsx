import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Toggle3Right, GitBranch } from 'lucide-react'

const TOOLS     = ['grove', 'think']
const GROVE_EVENTS  = ['session_logged', 'streak_update']
const THINK_EVENTS  = ['research_started', 'node_concluded', 'artifact_created']
const ACTION_TYPES  = ['send_email_digest', 'sync_village', 'log_to_console']

function toolEvents(toolId) {
  if (toolId === 'grove')  return GROVE_EVENTS
  if (toolId === 'think')  return THINK_EVENTS
  return []
}

function WorkflowRow({ workflow, onToggle, onDelete }) {
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-3 ${workflow.enabled ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm text-gray-900">{workflow.name || 'Unnamed workflow'}</span>
          {!workflow.enabled && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">paused</span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          When <strong className="text-gray-600">{workflow.trigger_tool}</strong> emits{' '}
          <code className="bg-gray-50 px-1 rounded">{workflow.trigger_event}</code>
          {' → '}
          <strong className="text-gray-600">{workflow.action_type}</strong>
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onToggle}
          className={`p-1.5 rounded-lg transition-colors ${workflow.enabled ? 'text-indigo-500 hover:bg-indigo-50' : 'text-gray-400 hover:bg-gray-50'}`}
          title={workflow.enabled ? 'Pause' : 'Enable'}>
          <Toggle3Right size={16} />
        </button>
        <button onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-50 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function AddWorkflowForm({ onSave, onCancel }) {
  const [name,          setName]         = useState('')
  const [triggerTool,   setTriggerTool]  = useState('grove')
  const [triggerEvent,  setTriggerEvent] = useState(GROVE_EVENTS[0])
  const [actionType,    setActionType]   = useState(ACTION_TYPES[0])

  const submit = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), trigger_tool: triggerTool, trigger_event: triggerEvent, action_type: actionType })
  }

  const onToolChange = (tool) => {
    setTriggerTool(tool)
    const evts = toolEvents(tool)
    setTriggerEvent(evts[0] ?? '')
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">New workflow</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Email digest on streak"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trigger tool</label>
            <select value={triggerTool} onChange={e => onToolChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
              {TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Event</label>
            <select value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
              {toolEvents(triggerTool).map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
          <select value={actionType} onChange={e => setActionType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
            {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={submit} disabled={!name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-40">
          <Plus size={14} /> Add workflow
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([])
  const [showForm,  setShowForm]  = useState(false)

  const load = () => window.api.getWorkflows().then(setWorkflows)

  useEffect(() => { load() }, [])

  const addWorkflow = async (data) => {
    await window.api.saveWorkflow(data)
    setShowForm(false)
    load()
  }

  const toggleWorkflow = async (wf) => {
    await window.api.updateWorkflow({ id: wf.id, enabled: !wf.enabled })
    load()
  }

  const deleteWorkflow = async (id) => {
    await window.api.deleteWorkflow(id)
    load()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automate actions when tools emit events</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
          <Plus size={15} /> New workflow
        </button>
      </div>

      {showForm && (
        <div className="mb-4">
          <AddWorkflowForm onSave={addWorkflow} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {workflows.length === 0 && !showForm ? (
        <div className="text-center py-16 text-gray-400">
          <GitBranch size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No workflows yet</p>
          <p className="text-xs mt-1">Automate actions like sending digests when events happen</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workflows.map(wf => (
            <WorkflowRow
              key={wf.id}
              workflow={wf}
              onToggle={() => toggleWorkflow(wf)}
              onDelete={() => deleteWorkflow(wf.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <h3 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">How workflows run</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• Workflows fire when tools call <code className="bg-white px-1 rounded border border-gray-200">publishEvent()</code></li>
          <li>• Actions run in the background — no UI interruption</li>
          <li>• <strong>send_email_digest</strong> — sends a digest to all members with email</li>
          <li>• <strong>sync_village</strong> — triggers a full village sync (grove activity + Supabase)</li>
          <li>• <strong>log_to_console</strong> — logs the event payload (useful for debugging)</li>
        </ul>
      </div>
    </div>
  )
}
