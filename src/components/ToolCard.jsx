import React from 'react'
import { Play, Square, ExternalLink } from 'lucide-react'

export default function ToolCard({ tool, status, onLaunch, onStop }) {
  const isRunning = status === 'running'
  const isAdmin = tool.id === 'admin'

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
      style={{ borderLeftColor: tool.color, borderLeftWidth: 4 }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{tool.icon}</span>
            <div>
              <h3 className="font-semibold text-gray-900 leading-tight">{tool.name}</h3>
              <span className={`inline-flex items-center gap-1 text-xs font-medium mt-0.5 ${
                isRunning ? 'text-green-600' : 'text-gray-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-300'}`} />
                {isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
          </div>

          {!isAdmin && (
            <button
              onClick={isRunning ? onStop : onLaunch}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isRunning
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
            >
              {isRunning ? <Square size={13} /> : <Play size={13} />}
              {isRunning ? 'Stop' : 'Launch'}
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
          {tool.description}
        </p>

        {/* Capabilities */}
        {tool.capabilities?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tool.capabilities.map(cap => (
              <span
                key={cap}
                className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500"
              >
                {cap}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
