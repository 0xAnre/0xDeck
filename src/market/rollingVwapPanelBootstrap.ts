import type { MarketIndicatorId } from './indicators.ts'
import { migrateLegacyRollingVwapToInstances } from './rollingVwapInstancesMigration.ts'
import {
  sanitizeRollingVwapInstances,
  type RollingVwapInstance,
} from './rollingVwapInstances.ts'
import { loadWidgetRollingVwapSettings } from '../rollingVwapSettingsStorage.ts'
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

  const migration = migrateLegacyRollingVwapToInstances({
    hasInstancesEntry: hasEntry,
    loadedInstances,
    activeIndicators,
    legacySettings,
  })

  if (migration.migrationNeeded) {
    const instances = sanitizeRollingVwapInstances(migration.instances)
    saveWidgetRollingVwapInstances(panelId, instances)
    saveWidgetMarketIndicators(panelId, migration.activeIndicators)
    return {
      instances,
      activeIndicators: migration.activeIndicators,
      migrationApplied: true,
    }
  }

  return {
    instances: sanitizeRollingVwapInstances(loadedInstances),
    activeIndicators: [...activeIndicators],
    migrationApplied: false,
  }
}
