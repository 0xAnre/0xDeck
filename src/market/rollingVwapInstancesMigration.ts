import type { MarketIndicatorId } from './indicators.ts'
import {
  createRollingVwapInstance,
  ROLLING_VWAP_LEGACY_MIGRATED_INSTANCE_ID,
  sanitizeRollingVwapInstances,
  type RollingVwapInstance,
} from './rollingVwapInstances.ts'
import {
  isRollingVwapHexColor,
  isRollingVwapLineOpacity,
  isRollingVwapLineWidth,
  sanitizeRollingVwapSettings,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import { sanitizeLineChartStrokeStyle } from './lineChartStroke.ts'
import type { MarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'

export type RollingVwapInstancesMigrationInput = {
  hasInstancesEntry: boolean
  loadedInstances?: readonly RollingVwapInstance[]
  activeIndicators: readonly MarketIndicatorId[]
  legacySettings: RollingVwapSettings
  /** Legacy global `rolling-vwap` presentation, folded into the migrated instance once. */
  legacyPresentation?: MarketIndicatorPresentation
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

/**
 * Fold the legacy global Rolling VWAP presentation into the settings of the
 * instance created by the migration. Only defined center-line fields are copied
 * (`color`/`opacity`/`lineWidth`/`lineStyle`); bands, period and multipliers
 * always keep the sanitized legacy settings. Invalid values are skipped so the
 * sanitized legacy setting survives.
 */
function foldLegacyPresentationIntoSettings(
  settings: RollingVwapSettings,
  presentation: MarketIndicatorPresentation | undefined,
): RollingVwapSettings {
  if (!presentation) return settings
  const folded: RollingVwapSettings = { ...settings }
  if (isRollingVwapHexColor(presentation.color)) {
    folded.lineColor = presentation.color
  }
  if (isRollingVwapLineOpacity(presentation.opacity)) {
    folded.lineOpacity = presentation.opacity
  }
  if (isRollingVwapLineWidth(presentation.lineWidth)) {
    folded.lineWidth = presentation.lineWidth
  }
  const lineStyle = sanitizeLineChartStrokeStyle(presentation.lineStyle)
  if (lineStyle !== undefined) {
    folded.lineStyle = lineStyle
  }
  return folded
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
      settings: foldLegacyPresentationIntoSettings(
        sanitizeRollingVwapSettings(input.legacySettings),
        input.legacyPresentation,
      ),
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
