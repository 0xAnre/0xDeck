export function parseChartTime(value: string | number): Date | null {
  const normalized =
    typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))

  if (Number.isFinite(normalized) && /^\d+(\.\d+)?$/.test(String(value).replace(/,/g, ''))) {
    const n = normalized
    if (n > 1e15) return new Date(n / 1000)
    if (n > 1e12) return new Date(n)
    if (n > 1e9) return new Date(n * 1000)
    return null
  }

  const text = String(value).trim()
  if (!text) return null

  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : new Date(parsed)
}

export function looksLikeEpoch(value: unknown): boolean {
  if (value === null || value === undefined) return false

  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, ''))

  if (!Number.isFinite(n) || !Number.isInteger(n)) return false

  return (
    (n >= 1_000_000_000_000 && n < 100_000_000_000_000) ||
    (n >= 1_000_000_000 && n < 20_000_000_000) ||
    (n >= 1_000_000_000_000_000 && n < 100_000_000_000_000_000)
  )
}

export function formatMaybeTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (!looksLikeEpoch(value)) return null

  const normalized =
    typeof value === 'number' ? value : String(value).replace(/,/g, '')
  const formatted = formatSeriesLabel(normalized)
  const raw = String(value)
  return formatted !== raw ? formatted : null
}

export function formatSeriesTick(value: string | number): string {
  const text = String(value)
  if (text.includes(' ')) return text.split(' ')[1]?.slice(0, 8) ?? text

  const date = parseChartTime(value)
  if (!date) return text

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatSeriesLabel(value: string | number): string {
  const text = String(value)
  if (text.includes(' ')) return text

  const date = parseChartTime(value)
  if (!date) return text

  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
