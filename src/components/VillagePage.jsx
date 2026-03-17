import React, { useEffect, useState } from 'react'
import { Users, Copy, RefreshCw, ExternalLink, Check, Plus } from 'lucide-react'

const LEVELS = ['follower', 'reader', 'commenter', 'collaborator']
const TOOLS  = ['grove', 'think']

function AddMemberModal({ onAdd, onClose }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState({ grove: 'reader', think: '' })

  const submit = async () => {
    if (!name.trim()) return
    const member = await window.api.addVillageMember({ name, email, avatarEmoji: '👤' })
    for (const [toolId, level] of Object.entries(access)) {
      if (level) await window.api.setVillageAccess({ memberId: member.id, toolId, level })
    }
    onAdd(member)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Add village member</h2>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Alice"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="alice@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Tool access</label>
            {TOOLS.map(toolId => (
              <div key={toolId} className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-700 w-12 capitalize">{toolId}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setAccess(a => ({ ...a, [toolId]: '' }))}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!access[toolId] ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
                    none
                  </button>
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setAccess(a => ({ ...a, [toolId]: l }))}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${access[toolId] === l ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-100'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={submit} disabled={!name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-40">
            <Plus size={14} /> Add member
          </button>
          <button onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VillagePage() {
  const [status,  setStatus]  = useState(null)
  const [members, setMembers] = useState([])
  const [copied,  setCopied]  = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    window.api.getVillageStatus().then(setStatus)
    window.api.getVillageMembers().then(setMembers)
  }, [])

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const sync = async () => {
    setSyncing(true)
    await window.api.syncVillage()
    setTimeout(() => setSyncing(false), 800)
  }

  const onMemberAdded = async (member) => {
    setShowAdd(false)
    setMembers(await window.api.getVillageMembers())
  }

  const testUrl = status?.testUrl ?? 'http://localhost:7700/?member=test-villager'

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
      {showAdd && <AddMemberModal onAdd={onMemberAdded} onClose={() => setShowAdd(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Village</h1>
          <p className="text-sm text-gray-500 mt-0.5">Share your journey with trusted people</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={sync}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Sync activity now">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
            <Plus size={15} /> Add member
          </button>
        </div>
      </div>

      {/* Server status + test link */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2 h-2 rounded-full ${status ? 'bg-green-400' : 'bg-gray-300'}`} />
          <span className="text-sm font-medium text-gray-700">
            Village server {status ? `running on port ${status.port}` : 'starting…'}
          </span>
        </div>

        <p className="text-xs text-gray-500 mb-2">
          Test villager view — open in incognito to preview what a member sees:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 truncate">
            {testUrl}
          </code>
          <button onClick={() => copy(testUrl, 'test')}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-colors">
            {copied === 'test' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button onClick={() => window.api.openExternal(testUrl)}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-colors">
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Members ({members.length})</h2>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">No members yet</p>
            <p className="text-xs mt-1">Add the people you want to share your journey with</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(m => {
              const memberUrl = `http://localhost:7700/?member=${m.id}`
              const isTest = m.id === 'test-villager'
              return (
                <div key={m.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-lg flex-shrink-0">
                    {m.avatar_emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{m.name}</span>
                      {isTest && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">test</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{m.email || 'No email'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => copy(memberUrl, m.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
                      title="Copy feed URL">
                      {copied === m.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    </button>
                    <button onClick={() => window.api.openExternal(memberUrl)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
                      title="Open feed">
                      <ExternalLink size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
