import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ToolGrid from './components/ToolGrid'
import IdeasPage from './components/IdeasPage'
import NewFlow from './components/NewFlow'
import SettingsPage from './components/SettingsPage'
import VillagePage from './components/VillagePage'

export default function App() {
  const [page, setPage]           = useState('tools')
  const [newMode, setNewMode]     = useState(null)  // 'store' | 'plan' | null
  const [villageUnread, setVillageUnread] = useState(0)

  useEffect(() => {
    const poll = () => window.api.getVillageUnreadCount().then(setVillageUnread).catch(() => {})
    poll()
    const id = setInterval(poll, 30000)
    return () => clearInterval(id)
  }, [])

  const goNew = (mode = null) => {
    setNewMode(mode)
    setPage('new')
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <Sidebar
        page={page}
        setPage={(p) => { setNewMode(null); if (p === 'village') setVillageUnread(0); setPage(p) }}
        villageUnread={villageUnread}
      />

      <main className="flex-1 flex flex-col min-w-0 titlebar-safe">
        {page === 'tools' && (
          <ToolGrid onNewTool={() => goNew('plan')} />
        )}
        {page === 'ideas' && (
          <IdeasPage onNewIdea={() => goNew('store')} />
        )}
        {page === 'new' && (
          <NewFlow
            defaultMode={newMode}
            onBack={() => setPage(newMode === 'store' ? 'ideas' : 'tools')}
            onIdeaSaved={() => setPage('ideas')}
          />
        )}
        {page === 'village' && <VillagePage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
