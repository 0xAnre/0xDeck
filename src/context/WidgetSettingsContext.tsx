import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { WidgetSettingsRegistration } from '@/widgetSettings/types'

type WidgetSettingsContextValue = {
  settingsRevision: number
  syncRegistration: (registration: WidgetSettingsRegistration) => void
  bumpSettingsRevision: () => void
  unregisterSettings: (panelId: string) => void
  getSettings: (panelId: string) => WidgetSettingsRegistration | null
}

const WidgetSettingsContext = createContext<WidgetSettingsContextValue | null>(null)

export function WidgetSettingsProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef(new Map<string, WidgetSettingsRegistration>())
  const [settingsRevision, setSettingsRevision] = useState(0)

  const bumpSettingsRevision = useCallback(() => {
    setSettingsRevision((value) => value + 1)
  }, [])

  const syncRegistration = useCallback(
    (registration: WidgetSettingsRegistration) => {
      registryRef.current.set(registration.panelId, registration)
      bumpSettingsRevision()
    },
    [bumpSettingsRevision],
  )

  const unregisterSettings = useCallback((panelId: string) => {
    registryRef.current.delete(panelId)
    bumpSettingsRevision()
  }, [bumpSettingsRevision])

  const getSettings = useCallback((panelId: string) => {
    return registryRef.current.get(panelId) ?? null
  }, [])

  const value = useMemo(
    () => ({
      settingsRevision,
      syncRegistration,
      bumpSettingsRevision,
      unregisterSettings,
      getSettings,
    }),
    [bumpSettingsRevision, getSettings, settingsRevision, syncRegistration, unregisterSettings],
  )

  return (
    <WidgetSettingsContext.Provider value={value}>{children}</WidgetSettingsContext.Provider>
  )
}

export function useWidgetSettings() {
  const context = useContext(WidgetSettingsContext)
  if (!context) {
    throw new Error('useWidgetSettings must be used within WidgetSettingsProvider')
  }
  return context
}
