import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
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
  disabled: boolean
}

const noop = () => {}

export function useMarketWidgetSettings({
  headerSettings,
  panelId,
  marketInterval,
  onMarketIntervalChange,
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
    }),
    [
      disabled,
      headerSettings,
      marketInterval,
      onMarketIntervalChange,
      panelId,
    ],
  )

  useWidgetSettingsRegistration(registration)
}
