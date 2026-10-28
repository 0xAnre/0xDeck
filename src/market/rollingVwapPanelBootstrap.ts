import type { MarketIndicatorId } from './indicators.ts'
import { migrateLegacyRollingVwapToInstances } from './rollingVwapInstancesMigration.ts'
import {
  sanitizeRollingVwapInstances,
  type RollingVwapInstance,
} from './rollingVwapInstances.ts'
import { loadWidgetRollingVwapSettings } from '../rollingVwapSettingsStorage.ts'
import {
  loadWidgetMarketIndicatorPresentation,
  saveWidgetMarketIndicatorPresentation,
} from '../marketIndicatorPresentationStorage.ts'
import {
  hasWidgetRollingVwapInstancesEntry,
  loadWidgetRollingVwapInstances,
  saveWidgetRollingVwapInstances,
} from '../rollingVwapInstancesStorage.ts'
import { loadWidgetMarketIndicators, saveWidgetMarketIndicators } from '../marketIndicatorStorage.ts'

export type RollingVwapPanelBootstrapResult = {
  instances: RollingVwapInstance[]
  activeIndicators: MarketIndicatorId[]
  migrationApplied: boolean
}

export function bootstrapRollingVwapPanelState(panelId: string): RollingVwapPanelBootstrapResult {
  const hasEntry = hasWidgetRollingVwapInstancesEntry(panelId)
  const loadedInstances = hasEntry ? loadWidgetRollingVwapInstances(panelId) : []
  const activeIndicators = loadWidgetMarketIndicators(panelId)
  const legacySettings = loadWidgetRollingVwapSettings(panelId)
  const legacyPresentation = loadWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap')

  const migration = migrateLegacyRollingVwapToInstances({
    hasInstancesEntry: hasEntry,
    loadedInstances,
    activeIndicators,
    legacySettings,
    legacyPresentation,
  })

  const instances = sanitizeRollingVwapInstances(
    migration.migrationNeeded ? migration.instances : loadedInstances,
  )
  const nextActiveIndicators = migration.migrationNeeded
    ? migration.activeIndicators
    : [...activeIndicators]

  if (migration.migrationNeeded) {
    // Persist the migrated instance (and the indicator list) before touching the
    // legacy presentation: if either write throws, the legacy entry still holds
    // the four center-line settings and no half-migrated state is left behind.
    saveWidgetRollingVwapInstances(panelId, instances)
    saveWidgetMarketIndicators(panelId, nextActiveIndicators)
  }

  // Instances own Rolling VWAP presentation. The legacy global entry was folded
  // into the migrated instance (or is inert when instances already exist), so it
  // is cleared only after persistence succeeded and never rendered again.
  if (Object.keys(legacyPresentation).length > 0) {
    saveWidgetMarketIndicatorPresentation(panelId, 'rolling-vwap', {})
  }

  return {
    instances,
    activeIndicators: nextActiveIndicators,
    migrationApplied: migration.migrationNeeded,
  }
}
