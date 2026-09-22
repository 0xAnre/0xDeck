import { useMemo } from 'react'
import { useWidgetSettingsRegistration } from '@/hooks/useWidgetSettingsRegistration'
import type { DatasetSummary } from '@/api/types'
import type { KpiAggregation } from '@/kpiStorage'
import type { TimeRange } from '@/timeRangeStorage'
import type { PanelKind } from '@/panels'
import { WIDGET_SETTINGS_FIELDS_BY_KIND } from '@/widgetSettings/presets'
import {
  type WidgetSettingsFields,
  type WidgetSettingsRegistration,
} from '@/widgetSettings/types'

type UseParquetWidgetSettingsArgs = {
  kind: PanelKind
  panelId: string
  title: string
  fields?: Partial<WidgetSettingsFields>
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
  kind,
  panelId,
  title,
  fields,
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
  const mergedFields = useMemo<WidgetSettingsFields>(
    () => ({
      ...WIDGET_SETTINGS_FIELDS_BY_KIND[kind],
      ...fields,
    }),
    [fields?.aggregation, fields?.columns, fields?.dataset, fields?.metric, fields?.timeRange, kind],
  )

  const registration = useMemo<WidgetSettingsRegistration>(
    () => ({
      panelId,
      title,
      disabled,
      fields: mergedFields,
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
      mergedFields,
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
      title,
    ],
  )

  useWidgetSettingsRegistration(registration)
}
