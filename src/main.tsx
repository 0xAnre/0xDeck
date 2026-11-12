import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadTheme, applyTheme } from './themeStorage'
import { TooltipProvider } from '@/components/ui/tooltip'

applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <App />
  </TooltipProvider>,
)
