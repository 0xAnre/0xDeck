import type { DatasetPreview } from '@/api/types'
import { formatCellValue } from '@/lib/formatCellValue'

export type KpiSnapshot = {
  label: string
  value: string
  time: string
  change?: string
  up?: boolean
}

export type DashboardMetric = {
  label: string
  value: string
  change: string
  up: boolean
}

function columnIndex(columns: string[], candidates: string[]): number {
  const lower = columns.map((column) => column.toLowerCase())
  for (const candidate of candidates) {
    const index = lower.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function cellAt(row: unknown[], index: number): unknown {
  return index >= 0 ? row[index] : undefined
}

function formatChange(value: unknown): { text: string; up: boolean } | null {
  if (value === null || value === undefined) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numeric)) return null
  const sign = numeric >= 0 ? '+' : ''
  return { text: `${sign}${numeric.toFixed(1)}%`, up: numeric >= 0 }
}

export function guessDefaultKpiColumn(columns: string[]): string | null {
  const preferredIdx = columnIndex(columns, [
    'price',
    'close',
    'value',
    'amount',
    'size',
    'quantity',
  ])
  if (preferredIdx >= 0) return columns[preferredIdx] ?? null

  const skip = new Set([
    'timestamp',
    'time',
    'date',
    'datetime',
    'ts',
    'symbol',
    'pair',
    'asset_id',
    'exchange',
    'side',
    'outcome',
  ])

  const candidate = columns.find((column) => !skip.has(column.toLowerCase()))
  return candidate ?? columns[0] ?? null
}

export function buildKpiSnapshot(
  preview: DatasetPreview,
  datasetName: string,
  metricColumn: string,
): KpiSnapshot {
  const lastRow = preview.rows[preview.rows.length - 1]
  const metricIdx = preview.columns.indexOf(metricColumn)
  const timeIdx = columnIndex(preview.columns, ['timestamp', 'time', 'date', 'datetime'])
  const symbolIdx = columnIndex(preview.columns, ['symbol', 'pair'])
  const changeIdx = columnIndex(preview.columns, ['change_pct', 'change'])

  const metricValue = lastRow ? cellAt(lastRow, metricIdx) : undefined
  const time = lastRow ? cellAt(lastRow, timeIdx) : undefined
  const symbol = lastRow ? cellAt(lastRow, symbolIdx) : undefined
  const change = lastRow ? formatChange(cellAt(lastRow, changeIdx)) : null

  const label = symbol
    ? `${formatCellValue(symbol)} · ${metricColumn}`
    : `${datasetName.replace(/\.parquet$/i, '')} · ${metricColumn}`

  return {
    label,
    value:
      metricValue !== undefined
        ? formatCellValue(metricValue, { column: metricColumn })
        : '—',
    time:
      time !== undefined
        ? formatCellValue(time, { column: preview.columns[timeIdx] ?? 'timestamp' })
        : '—',
    change: change?.text,
    up: change?.up,
  }
}

export function buildDashboardMetrics(preview: DatasetPreview): DashboardMetric[] {
  const priceIdx = columnIndex(preview.columns, ['price', 'close', 'value'])
  const volumeIdx = columnIndex(preview.columns, ['volume', 'vol'])
  const changeIdx = columnIndex(preview.columns, ['change_pct', 'change'])
  const timeIdx = columnIndex(preview.columns, ['timestamp', 'time', 'date'])

  const prices = preview.rows
    .map((row) => cellAt(row, priceIdx))
    .filter((value): value is number => typeof value === 'number')
  const volumes = preview.rows
    .map((row) => cellAt(row, volumeIdx))
    .filter((value): value is number => typeof value === 'number')

  const lastRow = preview.rows[preview.rows.length - 1]
  const lastPrice = lastRow ? cellAt(lastRow, priceIdx) : undefined
  const lastChange = lastRow ? formatChange(cellAt(lastRow, changeIdx)) : null
  const lastTime = lastRow ? cellAt(lastRow, timeIdx) : undefined
  const highPrice = prices.length > 0 ? Math.max(...prices) : undefined
  const totalVolume = volumes.length > 0 ? volumes.reduce((sum, value) => sum + value, 0) : undefined

  return [
    {
      label: 'Last price',
      value: lastPrice !== undefined ? formatCellValue(lastPrice) : '—',
      change: lastChange?.text ?? '—',
      up: lastChange?.up ?? true,
    },
    {
      label: 'Preview volume',
      value: totalVolume !== undefined ? formatCellValue(totalVolume) : '—',
      change: `${preview.rows.length} rows`,
      up: true,
    },
    {
      label: 'Preview high',
      value: highPrice !== undefined ? formatCellValue(highPrice) : '—',
      change:
        lastTime !== undefined
          ? formatCellValue(lastTime, { column: preview.columns[timeIdx] ?? 'timestamp' })
          : '—',
      up: true,
    },
    {
      label: 'Dataset',
      value: preview.name.replace(/\.parquet$/i, ''),
      change: `${preview.rows.length} shown`,
      up: true,
    },
  ]
}

export function buildSymbolRows(preview: DatasetPreview) {
  const symbolIdx = columnIndex(preview.columns, ['symbol', 'pair'])
  const priceIdx = columnIndex(preview.columns, ['price', 'close', 'value'])
  const changeIdx = columnIndex(preview.columns, ['change_pct', 'change'])

  if (symbolIdx < 0) {
    return preview.rows.slice(0, 6).map((row, index) => ({
      key: `row-${index}`,
      symbol: preview.columns
        .map((column, colIndex) => `${column}: ${formatCellValue(row[colIndex], { column })}`)
        .join(' · '),
      price: '—',
      change: '—',
      up: true,
    }))
  }

  const seen = new Set<string>()
  const rows: { key: string; symbol: string; price: string; change: string; up: boolean }[] = []

  for (const row of preview.rows) {
    const symbol = formatCellValue(cellAt(row, symbolIdx))
    if (seen.has(symbol)) continue
    seen.add(symbol)
    const change = formatChange(cellAt(row, changeIdx))
    rows.push({
      key: symbol,
      symbol,
      price: formatCellValue(cellAt(row, priceIdx)),
      change: change?.text ?? '—',
      up: change?.up ?? true,
    })
    if (rows.length >= 6) break
  }

  return rows
}

export { formatSeriesLabel, formatSeriesTick } from '@/lib/formatTime'
