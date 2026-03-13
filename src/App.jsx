import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import ToolGrid from './components/ToolGrid'
import NewToolFlow from './components/NewToolFlow'

export default function App() {
  const [page, setPage] = useState('tools')

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <Sidebar page={page} setPage={setPage} />

      <main className="flex-1 flex flex-col min-w-0 titlebar-safe">
        {page === 'tools' && (
          <ToolGrid onNewTool={() => setPage('new-tool')} />
        )}
        {page === 'new-tool' && (
          <NewToolFlow onBack={() => setPage('tools')} />
        )}
      </main>
    </div>
  )
}
