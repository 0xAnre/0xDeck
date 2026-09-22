import type { DatasetKpi } from '@/api/types'
import { formatCellValue } from '@/lib/formatCellValue'
import { formatMaybeTimestamp } from '@/lib/formatTime'
import { kpiAggregationLabel } from '@/kpiStorage'
import type { TimeRange } from '@/timeRangeStorage'

export function formatKpiCaption(
  metricColumn: string,
  aggregation: DatasetKpi['aggregation'],
  range: TimeRange,
): string {
  return `${metricColumn} · ${kpiAggregationLabel(aggregation)} · ${range}`
}

export function formatKpiValue(kpi: DatasetKpi): { text: string; up?: boolean } {
  if (kpi.value === null || kpi.value === undefined) return { text: '—' }

  if (kpi.aggregation === 'change') {
    const numeric = typeof kpi.value === 'number' ? kpi.value : Number(kpi.value)
    if (Number.isNaN(numeric)) return { text: '—' }
    const sign = numeric >= 0 ? '+' : ''
    return { text: `${sign}${numeric.toFixed(1)}%`, up: numeric >= 0 }
  }

  return {
    text: formatCellValue(kpi.value, { column: kpi.metric_column }),
  }
}

export function formatKpiContext(kpi: DatasetKpi): string {
  if (kpi.as_of != null) {
    const formatted = formatMaybeTimestamp(kpi.as_of)
    if (formatted) return formatted
  }

  return `${kpi.row_count.toLocaleString()} rows`
}
