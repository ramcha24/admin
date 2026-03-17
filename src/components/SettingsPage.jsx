import React, { useEffect, useState } from 'react'
import { Save, Check } from 'lucide-react'

const CLAUDE_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast, cheap)' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (balanced)' },
  { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6 (most capable)' },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    llm_provider:    'claude',
    llm_model:       'claude-haiku-4-5-20251001',
    anthropic_api_key: '',
    ollama_base_url: 'http://localhost:11434',
    ollama_model:    'llama3',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getAllSettings().then(all => {
      setSettings(prev => ({ ...prev, ...all }))
      setLoading(false)
    })
  }, [])

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    for (const [key, value] of Object.entries(settings)) {
      await window.api.setSetting(key, value)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return null

  const isClaude = settings.llm_provider === 'claude'

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">LLM provider and API keys. Applied to all tools unless overridden per-tool.</p>

      <div className="space-y-6">
        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">LLM Provider</label>
          <div className="flex gap-3">
            {[
              { value: 'claude', label: '☁️ Claude (Anthropic)' },
              { value: 'ollama', label: '🦙 Ollama (local)' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => set('llm_provider', opt.value)}
                className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                  settings.llm_provider === opt.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Claude settings */}
        {isClaude && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Anthropic API Key</label>
              <input
                type="password"
                value={settings.anthropic_api_key}
                onChange={e => set('anthropic_api_key', e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
              <select
                value={settings.llm_model}
                onChange={e => set('llm_model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                {CLAUDE_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Ollama settings */}
        {!isClaude && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ollama Base URL</label>
              <input
                type="text"
                value={settings.ollama_base_url}
                onChange={e => set('ollama_base_url', e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">Make sure <code>ollama serve</code> is running</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
              <input
                type="text"
                value={settings.ollama_model}
                onChange={e => set('ollama_model', e.target.value)}
                placeholder="llama3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                Run <code className="bg-gray-100 px-1 rounded">ollama list</code> to see available models
              </p>
            </div>
          </>
        )}

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          {saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
