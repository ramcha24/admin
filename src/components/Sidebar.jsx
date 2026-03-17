import React from 'react'
import { LayoutGrid, Lightbulb, Plus, GitBranch, Settings, Users, BookOpen } from 'lucide-react'

const NAV = [
  { id: 'tools',     label: 'Tools',     icon: LayoutGrid },
  { id: 'ideas',     label: 'Ideas',     icon: Lightbulb },
  { id: 'village',   label: 'Village',   icon: Users },
  { id: 'new',       label: 'New',       icon: Plus },
  { id: 'workflows', label: 'Workflows', icon: GitBranch },
  { id: 'stories',   label: 'Stories',   icon: BookOpen },
  { id: 'settings',  label: 'Settings',  icon: Settings },
]

export default function Sidebar({ page, setPage, villageUnread = 0 }) {
  return (
    <aside className="w-52 bg-sidebar flex flex-col titlebar-safe select-none shrink-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛠️</span>
          <span className="text-white font-semibold tracking-tight">Admin</span>
        </div>
        <p className="text-white/30 text-xs mt-0.5">Personal OS</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon, disabled }) => {
          const active = page === id
          const badge  = id === 'village' && villageUnread > 0 ? villageUnread : null
          return (
            <button
              key={id}
              disabled={disabled}
              onClick={() => !disabled && setPage(id)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left
                ${active
                  ? 'bg-white/10 text-white'
                  : disabled
                    ? 'text-white/20 cursor-default'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/90'}
              `}
            >
              <Icon size={15} />
              {label}
              {badge != null && (
                <span className="ml-auto min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold px-1">
                  {badge}
                </span>
              )}
              {disabled && !badge && (
                <span className="ml-auto text-[10px] text-white/20 uppercase tracking-wider">Soon</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-white/20 text-xs">v1.0.0</p>
      </div>
    </aside>
  )
}
