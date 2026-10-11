import type { CandleInterval } from './market/types.ts'
import { CANDLE_INTERVALS } from './market/types.ts'
import {
  parsePersistedMarketChartViewport,
  type PersistedMarketChartViewport,
} from './market/marketChartViewport.ts'

export const WIDGET_MARKET_CHART_VIEWPORT_STORAGE_KEY = '0xdeck-widget-market-chart-viewports'

const VALID_INTERVALS = new Set<string>(CANDLE_INTERVALS)

type PanelViewportMap = Record<string, PersistedMarketChartViewport>

type StorageRoot = Record<string, PanelViewportMap>

function loadStorageRoot(): StorageRoot {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_CHART_VIEWPORT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as StorageRoot
  } catch {
    return {}
  }
}

function sanitizePanelMap(value: unknown): PanelViewportMap {
  if (!value || typeof value !== 'object') return {}
  const result: PanelViewportMap = {}
  for (const [interval, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_INTERVALS.has(interval)) continue
    const viewport = parsePersistedMarketChartViewport(entry)
    if (viewport) {
      result[interval] = viewport
    }
  }
  return result
}

export function loadWidgetMarketChartViewport(
  panelId: string,
  interval: CandleInterval,
): PersistedMarketChartViewport | null {
  const root = loadStorageRoot()
  const panelMap = sanitizePanelMap(root[panelId])
  return panelMap[interval] ?? null
}

export function saveWidgetMarketChartViewport(
  panelId: string,
  interval: CandleInterval,
  viewport: PersistedMarketChartViewport,
): void {
  const parsed = parsePersistedMarketChartViewport(viewport)
  if (!parsed) return

  const root = loadStorageRoot()
  const existing = sanitizePanelMap(root[panelId])
  existing[interval] = parsed
  root[panelId] = existing
  localStorage.setItem(WIDGET_MARKET_CHART_VIEWPORT_STORAGE_KEY, JSON.stringify(root))
}
