import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Prevent dropped files/links from navigating the window (they would re-inject the
// preload script, with pty:* access, into an untrusted page).
for (const type of ['dragover', 'drop'] as const) {
  document.addEventListener(type, (e) => e.preventDefault())
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
