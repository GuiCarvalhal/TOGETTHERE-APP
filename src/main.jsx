import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { applyTheme } from '@/lib/theme'

// Apply the stored appearance (light/dark + Colorful/Neutral) once at boot, so
// the palette is app-wide even on screens that do not mount a theme control.
applyTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)