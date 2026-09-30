import type { MarketIndicatorId } from './indicators.ts'
import {
  createRollingVwapInstance,
  ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID,
  sanitizeRollingVwapInstances,
  type RollingVwapInstance,
} from './rollingVwapInstances.ts'
import { sanitizeRollingVwapSettings, type RollingVwapSettings } from './rollingVwapSettings.ts'

export type RollingVwapInstancesMigrationInput = {
  hasInstancesEntry: boolean
  loadedInstances?: readonly RollingVwapInstance[]
  activeIndicators: readonly MarketIndicatorId[]
  legacySettings: RollingVwapSettings
}

export type RollingVwapInstancesMigrationResult = {
  migrationNeeded: boolean
  instances: RollingVwapInstance[]
  activeIndicators: MarketIndicatorId[]
}

function cloneActiveIndicators(
  activeIndicators: readonly MarketIndicatorId[],
): MarketIndicatorId[] {
  return [...activeIndicators]
}

function removeSingletonRollingVwapIndicator(
  activeIndicators: readonly MarketIndicatorId[],
): MarketIndicatorId[] {
  return activeIndicators.filter((indicator) => indicator !== 'rolling-vwap')
}

export function migrateLegacyRollingVwapToInstances(
  input: RollingVwapInstancesMigrationInput,
): RollingVwapInstancesMigrationResult {
  if (input.hasInstancesEntry) {
    const instances = sanitizeRollingVwapInstances(input.loadedInstances ?? [])
    return {
      migrationNeeded: false,
      instances,
      activeIndicators: cloneActiveIndicators(input.activeIndicators),
    }
  }

  const legacyActive = input.activeIndicators.includes('rolling-vwap')
  if (legacyActive) {
    const legacyInstance = createRollingVwapInstance({
      id: ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID,
      enabled: true,
      settings: sanitizeRollingVwapSettings(input.legacySettings),
    })
    return {
      migrationNeeded: true,
      instances: [legacyInstance],
      activeIndicators: removeSingletonRollingVwapIndicator(input.activeIndicators),
    }
  }

  return {
    migrationNeeded: true,
    instances: [],
    activeIndicators: cloneActiveIndicators(input.activeIndicators),
  }
}
