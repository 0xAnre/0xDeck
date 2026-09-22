import { WIDGET_DATA_CHANGED_EVENT } from '@/datasetStorage'

export const WIDGET_TIME_RANGE_STORAGE_KEY = '0xdeck-widget-time-ranges'

export const TIME_RANGE_OPTIONS = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: 'all', label: 'All' },
] as const

export type TimeRange = (typeof TIME_RANGE_OPTIONS)[number]['value']

export const DEFAULT_TIME_RANGE: TimeRange = '1h'

const VALID_TIME_RANGES = new Set<string>(TIME_RANGE_OPTIONS.map((option) => option.value))

function loadWidgetTimeRangeMap(): Record<string, TimeRange> {
  try {
    const raw = localStorage.getItem(WIDGET_TIME_RANGE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, TimeRange] =>
          typeof entry[0] === 'string' && VALID_TIME_RANGES.has(String(entry[1])),
      ),
    )
  } catch {
    return {}
  }
}

export function loadWidgetTimeRange(widgetId: string): TimeRange {
  return loadWidgetTimeRangeMap()[widgetId] ?? DEFAULT_TIME_RANGE
}

export function saveWidgetTimeRange(widgetId: string, range: TimeRange) {
  const map = loadWidgetTimeRangeMap()
  map[widgetId] = range
  localStorage.setItem(WIDGET_TIME_RANGE_STORAGE_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(WIDGET_DATA_CHANGED_EVENT))
}
