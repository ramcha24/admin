import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (!window.api) {
  document.getElementById('root').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,sans-serif;background:#1a1a2e">
      <div style="text-align:center;color:white">
        <div style="font-size:48px;margin-bottom:16px">🛠️</div>
        <h2 style="margin:0 0 8px">Admin</h2>
        <p style="color:#9ca3af;margin:0">This app runs as a desktop app — not in the browser.</p>
        <p style="color:#9ca3af;margin:8px 0 0">Run <code style="background:#374151;padding:2px 8px;border-radius:4px">bash dev.sh</code> from admin/ to open it.</p>
      </div>
    </div>
  `
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
