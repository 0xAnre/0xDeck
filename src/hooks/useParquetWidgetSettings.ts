import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
import type { DatasetSummary } from '@/api/types'
import type { KpiAggregation } from '@/kpiStorage'
import type { TimeRange } from '@/timeRangeStorage'
import {
  type WidgetSettingsFields,
  type WidgetSettingsRegistration,
} from '@/widgetSettings/types'

type UseParquetWidgetSettingsArgs = {
  headerSettings: WidgetSettingsFields
  panelId: string
  datasets: DatasetSummary[]
  selectedName: string | null
  onDatasetChange: (name: string) => void
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
  disabled: boolean
  availableColumns?: string[]
  selectedColumns?: string[]
  onColumnsChange?: (columns: string[]) => void
  metricColumn?: string | null
  onMetricChange?: (column: string) => void
  aggregation?: KpiAggregation
  onAggregationChange?: (aggregation: KpiAggregation) => void
}

export function useParquetWidgetSettings({
  headerSettings,
  panelId,
  datasets,
  selectedName,
  onDatasetChange,
  timeRange,
  onTimeRangeChange,
  disabled,
  availableColumns,
  selectedColumns,
  onColumnsChange,
  metricColumn,
  onMetricChange,
  aggregation,
  onAggregationChange,
}: UseParquetWidgetSettingsArgs) {
  const registration = useMemo<WidgetSettingsRegistration>(
    () => ({
      panelId,
      disabled,
      fields: headerSettings,
      datasets,
      selectedDataset: selectedName,
      onDatasetChange,
      timeRange,
      onTimeRangeChange,
      availableColumns,
      selectedColumns,
      onColumnsChange,
      metricColumn,
      onMetricChange,
      aggregation,
      onAggregationChange,
    }),
    [
      aggregation,
      availableColumns,
      datasets,
      disabled,
      headerSettings,
      metricColumn,
      onAggregationChange,
      onColumnsChange,
      onDatasetChange,
      onMetricChange,
      onTimeRangeChange,
      panelId,
      selectedColumns,
      selectedName,
      timeRange,
    ],
  )

  useWidgetSettingsRegistration(registration)
}
