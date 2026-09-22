import { formatMaybeTimestamp } from '@/lib/formatTime'

export type FormatCellOptions = {
  column?: string
}

const ID_COLUMN = /^(asset_id|token_id|order_id|trade_id|id)$/i

function isIdColumn(column: string): boolean {
  return ID_COLUMN.test(column.toLowerCase())
}

function truncateId(text: string): string {
  if (text.length <= 16) return text
  return `${text.slice(0, 6)}…${text.slice(-4)}`
}

export function getCellTitle(value: unknown, options?: FormatCellOptions): string | undefined {
  if (value === null || value === undefined) return undefined

  const column = options?.column ?? ''
  const text = String(value)

  if (formatMaybeTimestamp(value)) {
    return text.replace(/,/g, '')
  }

  if (isIdColumn(column) || (text.length > 24 && /^\d+$/.test(text.replace(/,/g, '')))) {
    return text.length > 16 ? text : undefined
  }

  return undefined
}

export function formatCellValue(value: unknown, options?: FormatCellOptions): string {
  if (value === null || value === undefined) return '—'

  const column = options?.column ?? ''
  const timestamp = formatMaybeTimestamp(value)
  if (timestamp) return timestamp

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }

  const text = String(value)

  if (isIdColumn(column) || (text.length > 24 && /^\d+$/.test(text.replace(/,/g, '')))) {
    return truncateId(text.replace(/,/g, ''))
  }

  return text
}
