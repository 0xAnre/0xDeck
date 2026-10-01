import { useContext } from 'react'
import { WidgetSettingsContext } from '@/context/widgetSettingsContextValue'

export function useWidgetSettings() {
  const context = useContext(WidgetSettingsContext)
  if (!context) {
    throw new Error('useWidgetSettings must be used within WidgetSettingsProvider')
  }
  return context
}
