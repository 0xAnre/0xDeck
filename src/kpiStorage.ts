import { WIDGET_DATA_CHANGED_EVENT } from '@/datasetStorage'

export const WIDGET_KPI_CONFIG_STORAGE_KEY = '0xdeck-widget-kpi-config'

export const KPI_AGG_OPTIONS = [
  { value: 'last', label: 'Last' },
  { value: 'avg', label: 'Avg' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'change', label: 'Change %' },
] as const

export type KpiAggregation = (typeof KPI_AGG_OPTIONS)[number]['value']

export const DEFAULT_KPI_AGGREGATION: KpiAggregation = 'last'

export type WidgetKpiConfig = {
  metricColumn: string | null
  aggregation: KpiAggregation
}

const VALID_AGGREGATIONS = new Set<string>(KPI_AGG_OPTIONS.map((option) => option.value))

function loadWidgetKpiConfigMap(): Record<string, WidgetKpiConfig> {
  try {
    const raw = localStorage.getItem(WIDGET_KPI_CONFIG_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, Partial<WidgetKpiConfig>>
    const entries = Object.entries(parsed).map(([widgetId, config]) => {
      const aggregation = VALID_AGGREGATIONS.has(String(config.aggregation))
        ? (config.aggregation as KpiAggregation)
        : DEFAULT_KPI_AGGREGATION
      const metricColumn =
        typeof config.metricColumn === 'string' && config.metricColumn.trim().length > 0
          ? config.metricColumn
          : null

      return [widgetId, { metricColumn, aggregation }] satisfies [string, WidgetKpiConfig]
    })

    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function saveWidgetKpiConfigMap(map: Record<string, WidgetKpiConfig>) {
  localStorage.setItem(WIDGET_KPI_CONFIG_STORAGE_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(WIDGET_DATA_CHANGED_EVENT))
}

export function loadWidgetKpiConfig(widgetId: string): WidgetKpiConfig {
  return (
    loadWidgetKpiConfigMap()[widgetId] ?? {
      metricColumn: null,
      aggregation: DEFAULT_KPI_AGGREGATION,
    }
  )
}

export function saveWidgetKpiConfig(widgetId: string, config: WidgetKpiConfig) {
  const map = loadWidgetKpiConfigMap()
  map[widgetId] = config
  saveWidgetKpiConfigMap(map)
}

export function loadWidgetKpiColumn(widgetId: string): string | null {
  return loadWidgetKpiConfig(widgetId).metricColumn
}

export function loadWidgetKpiAggregation(widgetId: string): KpiAggregation {
  return loadWidgetKpiConfig(widgetId).aggregation
}

export function saveWidgetKpiColumn(widgetId: string, column: string | null) {
  const current = loadWidgetKpiConfig(widgetId)
  saveWidgetKpiConfig(widgetId, { ...current, metricColumn: column })
}

export function saveWidgetKpiAggregation(widgetId: string, aggregation: KpiAggregation) {
  const current = loadWidgetKpiConfig(widgetId)
  saveWidgetKpiConfig(widgetId, { ...current, aggregation })
}

export function kpiAggregationLabel(aggregation: KpiAggregation): string {
  return KPI_AGG_OPTIONS.find((option) => option.value === aggregation)?.label ?? aggregation
}
