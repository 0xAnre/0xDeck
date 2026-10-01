import { createContext } from 'react'
import type { WidgetSettingsRegistration } from '@/widgetSettings/types'

export type WidgetSettingsContextValue = {
  settingsRevision: number
  syncRegistration: (registration: WidgetSettingsRegistration) => void
  bumpSettingsRevision: () => void
  unregisterSettings: (panelId: string) => void
  getSettings: (panelId: string) => WidgetSettingsRegistration | null
}

export const WidgetSettingsContext = createContext<WidgetSettingsContextValue | null>(null)
