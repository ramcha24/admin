import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ToolGrid from './components/ToolGrid'
import IdeasPage from './components/IdeasPage'
import NewFlow from './components/NewFlow'
import SettingsPage from './components/SettingsPage'
import VillagePage from './components/VillagePage'
import WorkflowsPage from './components/WorkflowsPage'
import StoriesPage from './components/StoriesPage'

export default function App() {
  const [page, setPage]           = useState('tools')
  const [newMode, setNewMode]     = useState(null)
  const [villageUnread, setVillageUnread] = useState(0)

  useEffect(() => {
    const poll = () => window.api.getVillageUnreadCount().then(setVillageUnread).catch(() => {})
    poll()
    const id = setInterval(poll, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <Sidebar
        page={page}
        setPage={(p) => { setNewMode(null); if (p === 'village') setVillageUnread(0); setPage(p) }}
        villageUnread={villageUnread}
      />

      <main className="flex-1 flex flex-col min-w-0 titlebar-safe">
        {page === 'tools' && (
          <ToolGrid onNewTool={() => { setNewMode('plan'); setPage('new') }} />
        )}
        {page === 'ideas' && <IdeasPage />}
        {page === 'new' && (
          <NewFlow
            defaultMode={newMode ?? 'plan'}
            onBack={() => setPage('tools')}
            onIdeaSaved={() => setPage('ideas')}
          />
        )}
        {page === 'village' && <VillagePage />}
        {page === 'workflows' && <WorkflowsPage />}
        {page === 'stories' && <StoriesPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
