import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadTheme, applyTheme } from './themeStorage'

applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <App />,
)
