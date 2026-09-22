import { useEffect, useLayoutEffect } from 'react'
import { useWidgetSettings } from '@/context/WidgetSettingsContext'
import type { WidgetSettingsRegistration } from '@/widgetSettings/types'

export function useWidgetSettingsRegistration(
  registration: WidgetSettingsRegistration | null,
) {
  const { syncRegistration, unregisterSettings } = useWidgetSettings()
  const panelId = registration?.panelId

  useLayoutEffect(() => {
    if (!registration) return
    syncRegistration(registration)
  }, [registration, syncRegistration])

  useEffect(() => {
    if (!panelId) return
    return () => {
      unregisterSettings(panelId)
    }
  }, [panelId, unregisterSettings])
}
