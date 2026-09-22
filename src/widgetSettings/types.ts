import type { DatasetSummary } from '@/api/types'
import type { KpiAggregation } from '@/kpiStorage'
import type { TimeRange } from '@/timeRangeStorage'

export type WidgetSettingsFields = {
  dataset: boolean
  timeRange: boolean
  columns: boolean
  metric: boolean
  aggregation: boolean
}

export type WidgetSettingsRegistration = {
  panelId: string
  title: string
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
}

export const DEFAULT_WIDGET_SETTINGS_FIELDS: WidgetSettingsFields = {
  dataset: true,
  timeRange: true,
  columns: false,
  metric: false,
  aggregation: false,
}
