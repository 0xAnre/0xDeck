import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
import { buildMarketIndicatorOptions, type MarketIndicatorId } from '@/market/indicators'
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
        ? buildMarketIndicatorOptions(marketInterval)
        : undefined,
      onMarketIndicatorsChange: headerSettings.indicators ? onMarketIndicatorsChange : undefined,
    }),
    [
      disabled,
      headerSettings,
      marketIndicators,
      marketInterval,
      onMarketIndicatorsChange,
      onMarketIntervalChange,
      panelId,
    ],
  )

  useWidgetSettingsRegistration(registration)
}
