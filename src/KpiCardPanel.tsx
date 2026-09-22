import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatKpiCaption, formatKpiContext, formatKpiValue } from '@/lib/formatKpi'
import { useParquetWidgetSettings } from '@/hooks/useParquetWidgetSettings'
import { isKpiCardReady, useKpiCardData } from '@/hooks/useKpiCardData'

const mockKpi = {
  value: '67,840.20',
  caption: 'price · Last · 1h',
  context: '2026-07-04 12:04:11',
}

type KpiCardPanelProps = {
  panelId: string
}

export function KpiCardPanel({ panelId }: KpiCardPanelProps) {
  const {
    state,
    datasets,
    selectedName,
    selectDataset,
    metricColumn,
    setMetric,
    aggregation,
    setAggregation,
    timeRange,
    setTimeRange,
    availableColumns,
    catalogStatus,
  } = useKpiCardData(panelId, 'trades')

  useParquetWidgetSettings({
    kind: 'kpi-card',
    panelId,
    title: 'KPI Card',
    datasets,
    selectedName,
    onDatasetChange: selectDataset,
    timeRange,
    onTimeRangeChange: setTimeRange,
    disabled: catalogStatus !== 'ready',
    availableColumns,
    metricColumn,
    onMetricChange: setMetric,
    aggregation,
    onAggregationChange: setAggregation,
  })

  if (state.status === 'loading') {
    return (
      <div className="flex h-full flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    )
  }

  if (state.status === 'error') {
    return <p className="text-xs text-destructive">{state.message}</p>
  }

  if (isKpiCardReady(state)) {
    const value = formatKpiValue(state.kpi)
    const caption = formatKpiCaption(state.kpi.metric_column, state.kpi.aggregation, timeRange)
    const context = formatKpiContext(state.kpi)

    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-start justify-center gap-1">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{value.text}</span>
          <span className="text-xs text-muted-foreground">{caption}</span>
          <span
            className={cn(
              'text-xs tabular-nums',
              value.up === true && 'text-up',
              value.up === false && 'text-down',
              value.up === undefined && 'text-muted-foreground',
            )}
          >
            {context}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-start justify-center gap-1">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{mockKpi.value}</span>
        <span className="text-xs text-muted-foreground">{mockKpi.caption}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{mockKpi.context}</span>
        <span className="text-[0.65rem] text-muted-foreground">Mock · set folder in Data source</span>
      </div>
    </div>
  )
}
