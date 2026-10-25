import type { DatasetSummary } from '@/api/types'
import type { KpiAggregation } from '@/kpiStorage'
import type { MarketIndicatorId } from '@/market/indicators'
import type { FixedRangeVolumeProfileInstance } from '@/market/fixedRangeVolumeProfileInstances'
import type { LineInstance } from '@/market/lineInstances'
import type { RectangleInstance } from '@/market/rectangleInstances'
import type { AnchoredVwapInstance } from '@/market/anchoredVwapInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { ChartObjectSettingsTarget } from '@/market/chartObjectSettingsTypes'
import type { LineChartStrokeStyle, LineChartStrokeWidth } from '@/market/lineChartStroke'
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
  onRollingVwapLockToggle?: (instanceId: string, locked: boolean) => void
  onMarketIndicatorSettingsClick?: (indicatorId: MarketIndicatorId) => void
  fixedRangeVolumeProfileInstances?: FixedRangeVolumeProfileInstance[]
  onFixedRangeVolumeProfileArm?: () => void
  onFixedRangeVolumeProfileDelete?: (instanceId: string) => void
  onFixedRangeVolumeProfileToggle?: (instanceId: string, enabled: boolean) => void
  onFixedRangeVolumeProfileLockToggle?: (instanceId: string, locked: boolean) => void
  onFixedRangeVolumeProfileRowCountChange?: (instanceId: string, rowCount: number) => void
  onFixedRangeVolumeProfileValueAreaChange?: (instanceId: string, valueAreaPercent: number) => void
  onFixedRangeVolumeProfileExtendRightChange?: (instanceId: string, extendRight: boolean) => void
  onFixedRangeVolumeProfileLevelStrokeColorChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    strokeColor: string,
  ) => void
  onFixedRangeVolumeProfileLevelLineWidthChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    lineWidth: LineChartStrokeWidth,
  ) => void
  onFixedRangeVolumeProfileLevelLineStyleChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    lineStyle: LineChartStrokeStyle,
  ) => void
  onFixedRangeVolumeProfileLevelStrokeOpacityChange?: (
    instanceId: string,
    kind: 'poc' | 'vah' | 'val',
    opacityPercent: number,
  ) => void
  rectangleInstances?: RectangleInstance[]
  onRectangleArm?: () => void
  onRectangleDelete?: (instanceId: string) => void
  onRectangleLockToggle?: (instanceId: string, locked: boolean) => void
  onRectangleVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  onRectangleFillColorChange?: (instanceId: string, fillColor: string) => void
  onRectangleFillOpacityChange?: (instanceId: string, fillOpacity: number) => void
  lineInstances?: LineInstance[]
  onLineArm?: () => void
  onLineDelete?: (instanceId: string) => void
  onLineLockToggle?: (instanceId: string, locked: boolean) => void
  onLineVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  onLineStrokeColorChange?: (instanceId: string, strokeColor: string) => void
  onLineStrokeOpacityChange?: (instanceId: string, strokeOpacity: number) => void
  onLineWidthChange?: (instanceId: string, lineWidth: LineChartStrokeWidth) => void
  onLineStyleChange?: (instanceId: string, lineStyle: LineChartStrokeStyle) => void
  anchoredVwapInstances?: AnchoredVwapInstance[]
  onAnchoredVwapArm?: () => void
  onAnchoredVwapDelete?: (instanceId: string) => void
  onAnchoredVwapLockToggle?: (instanceId: string, locked: boolean) => void
  onAnchoredVwapVisibilityToggle?: (instanceId: string, hidden: boolean) => void
  chartObjectSettingsTarget?: ChartObjectSettingsTarget | null
  onChartObjectSettingsTargetChange?: (target: ChartObjectSettingsTarget | null) => void
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
