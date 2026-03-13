import React, { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Plus } from 'lucide-react'
import ToolCard from './ToolCard'

export default function ToolGrid({ onNewTool }) {
  const [tools, setTools]   = useState([])
  const [status, setStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

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
    // Poll status every 5 seconds
    const interval = setInterval(async () => {
      try {
        const s = await window.api.getToolStatus()
        setStatus(s)
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [discover])

  const handleLaunch = async (id) => {
    await window.api.launchTool(id)
    setTimeout(async () => {
      const s = await window.api.getToolStatus()
      setStatus(s)
    }, 1000)
  }

  const handleStop = async (id) => {
    await window.api.stopTool(id)
    setTimeout(async () => {
      const s = await window.api.getToolStatus()
      setStatus(s)
    }, 500)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" />
        Discovering tools...
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tools</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tools.length} tool{tools.length !== 1 ? 's' : ''} discovered</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={discover}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onNewTool}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            <Plus size={15} />
            New Tool
          </button>
        </div>
      </div>

      {/* Grid */}
      {tools.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">No tools found</p>
          <p className="text-sm mt-1">Add a tool.json to any subdirectory of Admin</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map(tool => (
            <ToolCard
              key={tool.id}
              tool={tool}
              status={status[tool.id] ?? 'stopped'}
              onLaunch={() => handleLaunch(tool.id)}
              onStop={() => handleStop(tool.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
