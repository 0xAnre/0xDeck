import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
import { buildMarketIndicatorOptions, type MarketIndicatorId } from '@/market/indicators'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { HorizontalLineInstance } from '@/market/horizontalLineInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval } from '@/market/types'
import {
  type WidgetSettingsFields,
  type WidgetSettingsRegistration,
} from '@/widgetSettings/types'
import type { TimeRange } from '@/timeRangeStorage'
import { DEFAULT_TIME_RANGE } from '@/timeRangeStorage'

type UseMarketWidgetSettingsArgs = {
  headerSettings: WidgetSettingsFields
  panelId: string
  marketInterval: CandleInterval
  onMarketIntervalChange: (interval: CandleInterval) => void
  marketIndicators: MarketIndicatorId[]
  onMarketIndicatorsChange: (indicators: MarketIndicatorId[]) => void
  rollingVwapInstances: RollingVwapInstance[]
  onRollingVwapAdd: () => void
  onRollingVwapToggle: (instanceId: string, enabled: boolean) => void
  onRollingVwapSettingsClick: (instanceId: string) => void
  onRollingVwapDelete: (instanceId: string) => void
  fixedRangeVolumeProfileInstances: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm: () => void
  onFixedRangeVolumeProfileDelete: (instanceId: string) => void
  horizontalLineInstances: HorizontalLineInstance[]
  onHorizontalLineArm: () => void
  onHorizontalLineDelete: (instanceId: string) => void
  disabled: boolean
}

const noop = () => {}

export function useMarketWidgetSettings({
  headerSettings,
  panelId,
  marketInterval,
  onMarketIntervalChange,
  marketIndicators,
  onMarketIndicatorsChange,
  rollingVwapInstances,
  onRollingVwapAdd,
  onRollingVwapToggle,
  onRollingVwapSettingsClick,
  onRollingVwapDelete,
  fixedRangeVolumeProfileInstances,
  onFixedRangeVolumeProfileArm,
  onFixedRangeVolumeProfileDelete,
  horizontalLineInstances,
  onHorizontalLineArm,
  onHorizontalLineDelete,
  disabled,
}: UseMarketWidgetSettingsArgs) {
  const registration = useMemo<WidgetSettingsRegistration>(
    () => ({
      panelId,
      disabled,
      fields: headerSettings,
      datasets: [],
      selectedDataset: null,
      onDatasetChange: noop,
      timeRange: DEFAULT_TIME_RANGE,
      onTimeRangeChange: noop as (range: TimeRange) => void,
      marketInterval,
      onMarketIntervalChange,
      marketIndicators: headerSettings.indicators ? marketIndicators : undefined,
      marketIndicatorOptions: headerSettings.indicators
        ? buildMarketIndicatorOptions(marketInterval).filter(
            (option) => option.value !== 'rolling-vwap',
          )
        : undefined,
      onMarketIndicatorsChange: headerSettings.indicators ? onMarketIndicatorsChange : undefined,
      rollingVwapInstances: headerSettings.indicators ? rollingVwapInstances : undefined,
      onRollingVwapAdd: headerSettings.indicators ? onRollingVwapAdd : undefined,
      onRollingVwapToggle: headerSettings.indicators ? onRollingVwapToggle : undefined,
      onRollingVwapSettingsClick: headerSettings.indicators
        ? onRollingVwapSettingsClick
        : undefined,
      onRollingVwapDelete: headerSettings.indicators ? onRollingVwapDelete : undefined,
      fixedRangeVolumeProfileInstances: headerSettings.tools === true
        ? fixedRangeVolumeProfileInstances
        : undefined,
      onFixedRangeVolumeProfileArm:
        headerSettings.tools === true ? onFixedRangeVolumeProfileArm : undefined,
      onFixedRangeVolumeProfileDelete:
        headerSettings.tools === true ? onFixedRangeVolumeProfileDelete : undefined,
      horizontalLineInstances:
        headerSettings.tools === true ? horizontalLineInstances : undefined,
      onHorizontalLineArm: headerSettings.tools === true ? onHorizontalLineArm : undefined,
      onHorizontalLineDelete:
        headerSettings.tools === true ? onHorizontalLineDelete : undefined,
    }),
    [
      disabled,
      fixedRangeVolumeProfileInstances,
      horizontalLineInstances,
      headerSettings,
      marketIndicators,
      marketInterval,
      onFixedRangeVolumeProfileArm,
      onFixedRangeVolumeProfileDelete,
      onHorizontalLineArm,
      onHorizontalLineDelete,
      onMarketIndicatorsChange,
      onRollingVwapAdd,
      onRollingVwapDelete,
      onRollingVwapSettingsClick,
      onRollingVwapToggle,
      onMarketIntervalChange,
      panelId,
      rollingVwapInstances,
    ],
  )

  useWidgetSettingsRegistration(registration)
}
