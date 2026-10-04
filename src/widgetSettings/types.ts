import type { DatasetSummary } from '@/api/types'
import type { KpiAggregation } from '@/kpiStorage'
import type { MarketIndicatorId } from '@/market/indicators'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval } from '@/market/types'
import type { TimeRange } from '@/timeRangeStorage'

export type WidgetSettingsFields = {
  dataset: boolean
  timeRange: boolean
  columns: boolean
  metric: boolean
  aggregation: boolean
  interval: boolean
  indicators: boolean
  tools?: boolean
}

export type WidgetSettingsRegistration = {
  panelId: string
  disabled: boolean
  fields: WidgetSettingsFields
  datasets: DatasetSummary[]
  selectedDataset: string | null
  onDatasetChange: (name: string) => void
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
  availableColumns?: string[]
  selectedColumns?: string[]
  onColumnsChange?: (columns: string[]) => void
  metricColumn?: string | null
  onMetricChange?: (column: string) => void
  aggregation?: KpiAggregation
  onAggregationChange?: (aggregation: KpiAggregation) => void
  marketInterval?: CandleInterval
  onMarketIntervalChange?: (interval: CandleInterval) => void
  marketIndicators?: MarketIndicatorId[]
  marketIndicatorOptions?: {
    value: MarketIndicatorId
    label: string
    disabled?: boolean
  }[]
  onMarketIndicatorsChange?: (indicators: MarketIndicatorId[]) => void
  rollingVwapInstances?: RollingVwapInstance[]
  onRollingVwapAdd?: () => void
  onRollingVwapToggle?: (instanceId: string, enabled: boolean) => void
  onRollingVwapSettingsClick?: (instanceId: string) => void
  onRollingVwapDelete?: (instanceId: string) => void
  fixedRangeVolumeProfileInstances?: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm?: () => void
  onFixedRangeVolumeProfileDelete?: (instanceId: string) => void
  marketCrosshairEnabled?: boolean
  onMarketCrosshairEnabledChange?: (enabled: boolean) => void
}

export const DEFAULT_WIDGET_SETTINGS_FIELDS: WidgetSettingsFields = {
  dataset: true,
  timeRange: true,
  columns: false,
  metric: false,
  aggregation: false,
  interval: false,
  indicators: false,
}
