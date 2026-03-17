import React, { useState } from 'react'
import { Play, Square, RotateCcw, Pencil, ChevronDown, ChevronRight, Tag } from 'lucide-react'

const PHASES = {
  planning:   { label: 'Planning',   bg: 'bg-amber-50',   text: 'text-amber-600',   dot: 'bg-amber-400'   },
  building:   { label: 'Building',   bg: 'bg-blue-50',    text: 'text-blue-600',    dot: 'bg-blue-400'    },
  stable:     { label: 'Stable',     bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  archived:   { label: 'Archived',   bg: 'bg-gray-100',   text: 'text-gray-400',    dot: 'bg-gray-300'    },
}

function PhaseBadge({ phase }) {
  const p = PHASES[phase] ?? PHASES.planning
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.bg} ${p.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  )
}

export default function ToolCard({ tool, status, onLaunch, onStop, onEdit, onResume }) {
  const [stepsOpen, setStepsOpen] = useState(false)
  const isRunning = status === 'running'
  const isAdmin   = tool.id === 'admin'
  const nextSteps = tool.next_steps ?? []

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col ${tool.dev_phase === 'archived' ? 'opacity-60' : ''}`}
      style={{ borderLeftColor: tool.color, borderLeftWidth: 4 }}
    >
      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">{tool.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 leading-tight">{tool.name}</h3>
                {tool.stable_tag && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <Tag size={9} />{tool.stable_tag}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <PhaseBadge phase={tool.dev_phase} />
                <span className={`inline-flex items-center gap-1 text-xs ${isRunning ? 'text-green-600' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => onEdit(tool)} className="text-gray-300 hover:text-indigo-400 transition-colors shrink-0 mt-0.5" title="Edit dev info">
            <Pencil size={13} />
          </button>
        </div>

        {/* Summary */}
        <p className="text-sm text-gray-500 leading-relaxed">
          {tool.dev_summary || tool.description}
        </p>

        {/* Next steps */}
        {nextSteps.length > 0 && (
          <div>
            <button
              onClick={() => setStepsOpen(o => !o)}
              className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              {stepsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Next steps ({nextSteps.length})
            </button>
            {stepsOpen && (
              <ul className="mt-2 space-y-1 pl-1">
                {nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-2">
        {!isAdmin && (
          <button
            onClick={isRunning ? onStop : onLaunch}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isRunning
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            {isRunning ? <><Square size={12} /> Stop</> : <><Play size={12} /> Launch</>}
          </button>
        )}
        <button
          onClick={() => onResume(tool.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          title={tool.has_session ? 'Resume last Claude session' : 'Start new Claude session'}
        >
          <RotateCcw size={12} />
          {tool.has_session ? 'Resume' : 'Start Claude'}
        </button>
      </div>
    </div>
  )
}
