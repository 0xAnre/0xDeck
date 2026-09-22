import type { PanelKind } from '@/panels'
import type { WidgetSettingsFields } from '@/widgetSettings/types'

export const WIDGET_SETTINGS_FIELDS_BY_KIND: Record<PanelKind, WidgetSettingsFields> = {
  'data-table': {
    dataset: true,
    timeRange: true,
    columns: true,
    metric: false,
    aggregation: false,
  },
  chart: {
    dataset: true,
    timeRange: true,
    columns: false,
    metric: false,
    aggregation: false,
  },
  'kpi-card': {
    dataset: true,
    timeRange: true,
    columns: false,
    metric: true,
    aggregation: true,
  },
  dashboard: {
    dataset: true,
    timeRange: true,
    columns: false,
    metric: false,
    aggregation: false,
  },
  reports: {
    dataset: true,
    timeRange: true,
    columns: false,
    metric: false,
    aggregation: false,
  },
  notes: {
    dataset: false,
    timeRange: false,
    columns: false,
    metric: false,
    aggregation: false,
  },
  'market-times': {
    dataset: false,
    timeRange: false,
    columns: false,
    metric: false,
    aggregation: false,
  },
}
