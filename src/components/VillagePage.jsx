import React, { useEffect, useState, useCallback } from 'react'
import { Users, Copy, RefreshCw, ExternalLink, Check, Plus, Inbox, Tag, Send, X, Pencil, Trash2, Eye, Radio, ChevronDown, ChevronRight, User } from 'lucide-react'

const LEVELS = ['follower', 'reader', 'commenter', 'collaborator']
const TOOLS  = ['grove', 'think']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z')).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const FREQ_OPTIONS = ['daily', 'weekly', 'never']

// ─── Edit Member Modal ────────────────────────────────────────────────────────

function EditMemberModal({ member, tags, onSave, onClose }) {
  const [email,     setEmail]     = useState(member.email ?? '')
  const [tagId,     setTagId]     = useState(member.tag_id ?? '')
  const [access,    setAccess]    = useState({ grove: '', think: '' })
  const [frequency, setFrequency] = useState('daily')
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    window.api.getVillageMemberAccess(member.id).then(data => {
      setAccess(prev => ({ ...prev, ...data.access }))
      setFrequency(data.frequency ?? 'daily')
      setLoading(false)
    })
  }, [member.id])

  const submit = async () => {
    await window.api.updateVillageMember({ id: member.id, email, tagId: tagId || null })
    for (const [toolId, level] of Object.entries(access)) {
      await window.api.setVillageAccess({ memberId: member.id, toolId, level: level || null })
    }
    await window.api.setVillageNotificationFreq({ memberId: member.id, frequency })
    onSave()
  }

  if (loading) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Edit member</h2>
        <p className="text-sm text-gray-500 mb-4">{member.name}</p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="alice@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {tags.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Tag (group)</label>
              <select value={tagId} onChange={e => setTagId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">No tag</option>
                {tags.map(t => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Tool access</label>
            <p className="text-xs text-gray-400 mb-2">Shown level overrides tag defaults.</p>
            {TOOLS.map(toolId => (
              <div key={toolId} className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-700 w-12 capitalize">{toolId}</span>
                <div className="flex gap-1.5 flex-wrap">
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

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Email digest frequency</label>
            <div className="flex gap-2">
              {FREQ_OPTIONS.map(f => (
                <button key={f} onClick={() => setFrequency(f)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${frequency === f ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark">
            Save changes
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

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ tags, onAdd, onClose }) {
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [tagId, setTagId]   = useState('')
  const [access, setAccess] = useState({ grove: 'reader', think: '' })

  const submit = async () => {
    if (!name.trim()) return
    const member = await window.api.addVillageMember({ name, email, avatarEmoji: '👤', tagId: tagId || null })
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

          {tags.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Tag (group)</label>
              <select value={tagId} onChange={e => setTagId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">No tag</option>
                {tags.map(t => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>
                ))}
              </select>
            </div>
          )}

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

// ─── Tag Editor Modal ─────────────────────────────────────────────────────────

function TagModal({ tag, onSave, onClose }) {
  const [name, setName]   = useState(tag?.name ?? '')
  const [emoji, setEmoji] = useState(tag?.emoji ?? '🏷️')
  const [defs, setDefs]   = useState(
    TOOLS.reduce((acc, toolId) => {
      const existing = tag?.defaults?.find(d => d.tool_id === toolId)
      acc[toolId] = existing?.level ?? ''
      return acc
    }, {})
  )

  const submit = async () => {
    if (!name.trim()) return
    await window.api.saveVillageTag({
      id: tag?.id,
      name,
      emoji,
      defaults: TOOLS.map(toolId => ({ tool_id: toolId, level: defs[toolId] })),
    })
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{tag ? 'Edit tag' : 'New tag'}</h2>

        <div className="space-y-3 mb-5">
          <div className="flex gap-2">
            <input value={emoji} onChange={e => setEmoji(e.target.value)}
              className="w-12 px-2 py-2 border border-gray-200 rounded-lg text-center text-lg" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tag name"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Default access</label>
            {TOOLS.map(toolId => (
              <div key={toolId} className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-700 w-12 capitalize">{toolId}</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setDefs(d => ({ ...d, [toolId]: '' }))}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!defs[toolId] ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
                    none
                  </button>
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setDefs(d => ({ ...d, [toolId]: l }))}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${defs[toolId] === l ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-100'}`}>
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
            Save tag
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

// ─── Activity Inbox ───────────────────────────────────────────────────────────

function InboxTab() {
  const [interactions, setInteractions] = useState([])
  const [replyTarget, setReplyTarget]   = useState(null) // { activityId, memberName }
  const [replyText, setReplyText]       = useState('')

  const load = useCallback(async () => {
    const rows = await window.api.getVillageInteractions()
    setInteractions(rows)
    const unread = rows.filter(r => !r.read_at && r.member_id !== 'owner').map(r => r.id)
    if (unread.length) await window.api.markVillageRead(unread)
  }, [])

  useEffect(() => { load() }, [load])

  const sendReply = async () => {
    if (!replyText.trim() || !replyTarget) return
    await window.api.villageReply({ activityId: replyTarget.activityId, body: replyText.trim() })
    setReplyText('')
    setReplyTarget(null)
    load()
  }

  if (!interactions.length) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Inbox size={32} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium text-sm">No interactions yet</p>
        <p className="text-xs mt-1">Comments and reactions from your village will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {interactions.map(item => {
        const isOwner   = item.member_id === 'owner'
        const isUnread  = !item.read_at && !isOwner
        const body      = item.payload?.body ?? item.type

        return (
          <div key={item.id}
            className={`bg-white border rounded-xl p-4 shadow-sm ${isUnread ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100'}`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-base flex-shrink-0">
                {isOwner ? '🧑' : (item.member_avatar ?? '👤')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-900">
                    {isOwner ? 'You (reply)' : item.member_name}
                  </span>
                  {isUnread && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                  )}
                  <span className="ml-auto text-xs text-gray-400">{timeAgo(item.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700">{body}</p>
                {item.type === 'comment' && !isOwner && (
                  <button
                    onClick={() => setReplyTarget({ activityId: item.activity_id, memberName: item.member_name })}
                    className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                    Reply
                  </button>
                )}
              </div>
            </div>

            {/* Inline reply box */}
            {replyTarget?.activityId === item.activity_id && replyTarget?.memberName === item.member_name && (
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder={`Reply to ${replyTarget.memberName}…`}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button onClick={sendReply} disabled={!replyText.trim()}
                  className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-40 transition-colors">
                  <Send size={14} />
                </button>
                <button onClick={() => { setReplyTarget(null); setReplyText('') }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tags Tab ─────────────────────────────────────────────────────────────────

function TagsTab({ tags, onChanged }) {
  const [showModal, setShowModal]   = useState(false)
  const [editTag, setEditTag]       = useState(null)

  const deleteTag = async (id) => {
    await window.api.deleteVillageTag(id)
    onChanged()
  }

  const saved = () => { setShowModal(false); setEditTag(null); onChanged() }

  return (
    <div>
      {(showModal || editTag) && (
        <TagModal
          tag={editTag}
          onSave={saved}
          onClose={() => { setShowModal(false); setEditTag(null) }}
        />
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Group members by tag and set default access levels per tag.</p>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark transition-colors">
          <Plus size={13} /> New tag
        </button>
      </div>

      {tags.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Tag size={28} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No tags yet</p>
          <p className="text-xs mt-1">Create tags like "family" or "close friends" with preset access levels</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map(tag => (
            <div key={tag.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-xl">{tag.emoji}</span>
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900">{tag.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {tag.defaults?.filter(d => d.level).map(d => `${d.tool_id}: ${d.level}`).join(' · ') || 'No default access'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditTag(tag)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deleteTag(tag.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Activity Feed tab ────────────────────────────────────────────────────────

const TOOL_META = {
  grove: { icon: '🌿', label: 'Grove',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  think: { icon: '🧠', label: 'Think',  color: 'bg-violet-50  text-violet-700  border-violet-200'  },
  tantu: { icon: '🧵', label: 'Tantu',  color: 'bg-rose-50    text-rose-700    border-rose-200'    },
}
const LEVEL_COLORS = {
  follower:     'bg-gray-50 text-gray-500 border-gray-200',
  reader:       'bg-sky-50 text-sky-600 border-sky-200',
  commenter:    'bg-indigo-50 text-indigo-600 border-indigo-200',
  collaborator: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function ActivityItem({ item }) {
  const [open, setOpen] = useState(false)
  const tool = TOOL_META[item.source_tool] ?? { icon: '📦', label: item.source_tool, color: 'bg-gray-50 text-gray-500 border-gray-200' }
  const hasInteractions = item.interactions?.length > 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="shrink-0 mt-0.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tool.color}`}>
              {tool.icon} {tool.label}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              {item.payload?.notes
                ? <><strong className="font-medium">{item.payload.course_title ?? item.payload.topic ?? item.activity_type}</strong> — {item.payload.duration_minutes ?? item.payload.duration_min ?? '?'}min</>
                : item.payload?.topic
                  ? <><strong className="font-medium">{item.payload.topic}</strong> <span className="text-gray-400 text-xs">{item.activity_type.replace(/_/g, ' ')}</span></>
                  : <span className="text-gray-600 capitalize">{item.activity_type.replace(/_/g, ' ')}</span>
              }
            </p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-400">{timeAgo(item.created_at)}</span>
              {hasInteractions && (
                <span className="text-xs text-indigo-500">💬 {item.interactions.length}</span>
              )}
              {item.visibility.length === 0 && (
                <span className="text-xs text-gray-300">not visible to anyone</span>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end max-w-[160px]">
            {item.visibility.slice(0, 4).map(v => (
              <span key={v.memberId} className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${LEVEL_COLORS[v.level] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}
                title={`${v.name} — ${v.level}`}>
                {v.emoji} {v.level[0].toUpperCase()}
              </span>
            ))}
            {item.visibility.length > 4 && (
              <span className="text-[10px] text-gray-400">+{item.visibility.length - 4}</span>
            )}
          </div>
          <span className="shrink-0 text-gray-300 ml-1">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-3">
          {/* Visibility breakdown */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Who sees this</p>
            {item.visibility.length === 0
              ? <p className="text-xs text-gray-400 italic">No members have access to {item.source_tool}.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {item.visibility.map(v => (
                    <div key={v.memberId} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${LEVEL_COLORS[v.level] ?? ''}`}>
                      <span>{v.emoji}</span>
                      <span className="font-medium">{v.name}</span>
                      <span className="opacity-60">· {v.level}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Payload preview */}
          {(item.payload?.notes || item.payload?.takeaway || item.payload?.streak_days) && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Content</p>
              {item.payload.notes && <p className="text-xs text-gray-600 italic">"{item.payload.notes}"</p>}
              {item.payload.takeaway && <p className="text-xs text-gray-600 italic">"{item.payload.takeaway}"</p>}
              {item.payload.streak_days && (
                <p className="text-xs text-gray-600">🔥 {item.payload.streak_days} day streak · {item.payload.total_hours_this_week}h this week</p>
              )}
            </div>
          )}

          {/* Interactions */}
          {hasInteractions && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Interactions</p>
              <div className="space-y-1.5">
                {item.interactions.map(i => (
                  <div key={i.id} className="flex items-start gap-2 text-xs">
                    <span className="text-base leading-none mt-0.5">{i.member_avatar ?? '👤'}</span>
                    <div>
                      <span className="font-medium text-gray-700">{i.member_name}</span>
                      <span className="text-gray-400 ml-1">{timeAgo(i.created_at)}</span>
                      {!i.read_at && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />}
                      <p className="text-gray-600 mt-0.5">{i.payload?.body ?? i.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityTab() {
  const [items,    setItems]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [toolFilter, setToolFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await window.api.getVillageActivity()
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = toolFilter === 'all' ? items : items.filter(i => i.source_tool === toolFilter)
  const tools = [...new Set(items.map(i => i.source_tool))]

  return (
    <div>
      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setToolFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${toolFilter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          All
        </button>
        {tools.map(t => {
          const meta = TOOL_META[t] ?? { icon: '📦', label: t }
          return (
            <button key={t} onClick={() => setToolFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${toolFilter === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {meta.icon} {meta.label}
            </button>
          )
        })}
        <button onClick={load} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mb-4 pb-3 border-b border-gray-100">
        <span className="text-[10px] text-gray-400 mr-1 self-center">Access levels:</span>
        {Object.entries(LEVEL_COLORS).map(([lvl, cls]) => (
          <span key={lvl} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>{lvl[0].toUpperCase()} = {lvl}</span>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400"><RefreshCw size={16} className="animate-spin mx-auto mb-2" /><p className="text-sm">Loading…</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Radio size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No activity yet</p>
          <p className="text-xs mt-1">Sync village or run the seed script to see activity here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => <ActivityItem key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

// ─── Identity Card ────────────────────────────────────────────────────────────

function IdentityCard() {
  const [identity, setIdentity] = useState(null)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState({})
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    window.api.getVillageIdentity().then(id => {
      setIdentity(id)
      setDraft(id ?? {})
    })
  }, [])

  const save = async () => {
    setSaving(true)
    await window.api.updateVillageIdentity({ username: draft.username, display_name: draft.display_name, avatar_emoji: draft.avatar_emoji })
    setIdentity(draft)
    setEditing(false)
    setSaving(false)
  }

  if (!identity) return null

  if (editing) {
    return (
      <div className="bg-white border border-indigo-200 rounded-xl p-4 mb-5 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your village identity</p>
        <div className="flex items-start gap-3">
          <input value={draft.avatar_emoji ?? '🌿'} onChange={e => setDraft(d => ({ ...d, avatar_emoji: e.target.value }))}
            className="w-12 h-10 text-center text-xl border border-gray-200 rounded-lg" />
          <div className="flex-1 space-y-2">
            <input value={draft.display_name ?? ''} onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))}
              placeholder="Display name"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input value={draft.username ?? ''} onChange={e => setDraft(d => ({ ...d, username: e.target.value }))}
              placeholder="username (no spaces)"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setDraft(identity) }}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-5 shadow-sm flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
        {identity.avatar_emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900">{identity.display_name}</p>
        <p className="text-xs text-gray-400 font-mono">@{identity.username}</p>
      </div>
      <button onClick={() => setEditing(true)}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
        title="Edit your identity">
        <Pencil size={13} />
      </button>
    </div>
  )
}

// ─── Main VillagePage ─────────────────────────────────────────────────────────

// ─── Feed Preview Modal ───────────────────────────────────────────────────────

function FeedPreviewModal({ member, onClose }) {
  const [feed,    setFeed]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getVillagePreviewFeed(member.id).then(data => {
      setFeed(data)
      setLoading(false)
    })
  }, [member.id])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mt-8 mb-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Feed preview — {member.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">What {member.name} sees at their access level</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-center py-10 text-gray-400">
              <RefreshCw size={18} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading feed…</p>
            </div>
          ) : !feed || !feed.items.length ? (
            <div className="text-center py-10 text-gray-400">
              <Eye size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No feed items</p>
              <p className="text-xs mt-1">Sync activity first, or this member has no access to any tool.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feed.items.map(item => (
                <div key={item.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {item.tool === 'grove' ? '🌿' : '🧠'} {item.tool}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{item.level}</span>
                    <span className="ml-auto text-xs text-gray-400">{timeAgo(item.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-800">{item.rendered}</p>
                  {item.detail?.course_title && (
                    <p className="text-xs text-gray-500 mt-1">📖 {item.detail.course_title}
                      {item.detail.duration_minutes ? ` · ${item.detail.duration_minutes} min` : ''}</p>
                  )}
                  {item.detail?.notes && (
                    <p className="text-xs text-gray-400 italic mt-1">"{item.detail.notes}"</p>
                  )}
                  {item.interactions?.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1.5">💬 {item.interactions.length} interaction{item.interactions.length !== 1 ? 's' : ''}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VillagePage() {
  const [tab,     setTab]     = useState('activity') // 'activity' | 'members' | 'inbox' | 'tags'
  const [status,  setStatus]  = useState(null)
  const [members, setMembers] = useState([])
  const [tags,    setTags]    = useState([])
  const [copied,  setCopied]  = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [editMember,   setEditMember]   = useState(null)
  const [previewMember, setPreviewMember] = useState(null)
  const [unread,       setUnread]       = useState(0)

  const reload = useCallback(async () => {
    const [m, t, u] = await Promise.all([
      window.api.getVillageMembers(),
      window.api.getVillageTags(),
      window.api.getVillageUnreadCount(),
    ])
    setMembers(m)
    setTags(t)
    setUnread(u)
  }, [])

  useEffect(() => {
    window.api.getVillageStatus().then(setStatus)
    reload()
  }, [reload])

  // Clear unread badge when inbox tab is opened
  useEffect(() => {
    if (tab === 'inbox') setUnread(0)
  }, [tab])

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const sync = async () => {
    setSyncing(true)
    await window.api.syncVillage()
    await reload()
    setTimeout(() => setSyncing(false), 800)
  }

  const testUrl = status?.testUrl ?? 'http://localhost:7700/?member=test-villager'

  const TAB_ITEMS = [
    { id: 'activity', label: 'Activity' },
    { id: 'members',  label: 'Members' },
    { id: 'inbox',    label: 'Inbox', badge: unread > 0 ? unread : null },
    { id: 'tags',     label: 'Tags' },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
      {showAdd && <AddMemberModal tags={tags} onAdd={async () => { setShowAdd(false); reload() }} onClose={() => setShowAdd(false)} />}
      {editMember && <EditMemberModal member={editMember} tags={tags} onSave={() => { setEditMember(null); reload() }} onClose={() => setEditMember(null)} />}
      {previewMember && <FeedPreviewModal member={previewMember} onClose={() => setPreviewMember(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
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
          {tab === 'members' && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
              <Plus size={15} /> Add member
            </button>
          )}
        </div>
      </div>

      {/* Identity */}
      <IdentityCard />

      {/* Server status */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full ${status ? 'bg-green-400' : 'bg-gray-300'}`} />
          <span className="text-sm font-medium text-gray-700">
            Village server {status ? `running on port ${status.port}` : 'starting…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 truncate">
            {testUrl}
          </code>
          <button onClick={() => copy(testUrl, 'test')}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-colors">
            {copied === 'test' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button onClick={() => window.api.openExternal(testUrl)}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-colors">
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-5">
        {TAB_ITEMS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'text-primary border-b-2 border-primary -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.badge != null && (
              <span className="ml-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold px-1">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'activity' && <ActivityTab />}

      {tab === 'members' && (
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">No members yet</p>
              <p className="text-xs mt-1">Add the people you want to share your journey with</p>
            </div>
          ) : (
            members.map(m => {
              const memberUrl = `http://localhost:7700/?member=${m.id}`
              const isTest    = m.id === 'test-villager'
              const memberTag = tags.find(t => t.id === m.tag_id)
              return (
                <div key={m.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-lg flex-shrink-0">
                    {m.avatar_emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{m.name}</span>
                      {isTest && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">test</span>
                      )}
                      {memberTag && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                          {memberTag.emoji} {memberTag.name}
                        </span>
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
                    <button onClick={() => setPreviewMember(m)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
                      title="Preview feed">
                      <Eye size={13} />
                    </button>
                    <button onClick={() => window.api.openExternal(memberUrl)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
                      title="Open feed in browser">
                      <ExternalLink size={13} />
                    </button>
                    <button onClick={() => setEditMember(m)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                      title="Edit member">
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'inbox' && <InboxTab />}

      {tab === 'tags' && <TagsTab tags={tags} onChanged={reload} />}
    </div>
  )
}
